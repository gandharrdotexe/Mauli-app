import { useCallback, useEffect, useRef, useState } from "react";
import { NativeModules, Platform } from "react-native";
import { createSocket } from "../services/socket";

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export default function useVideoCall({
  roomId,
  userId,
  userRole,
  userName,
  callType,
}) {
  const wantsVideo = callType !== "AUDIO_CALL";
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(wantsVideo);
  const [isWaiting, setIsWaiting] = useState(true);
  const [remoteInfo, setRemoteInfo] = useState(null);
  const [error, setError] = useState("");

  const socketRef = useRef(null);
  const peerRef = useRef(null);
  const remoteSocketIdRef = useRef(null);
  const localStreamRef = useRef(null);
  const webrtcRef = useRef(null);

  const ensureWebRTC = useCallback(() => {
    if (webrtcRef.current) return webrtcRef.current;
    if (Platform.OS === "web") {
      if (typeof window === "undefined") return null;
      const WebRTC = {
        RTCPeerConnection: window.RTCPeerConnection,
        RTCIceCandidate: window.RTCIceCandidate,
        RTCSessionDescription: window.RTCSessionDescription,
        mediaDevices: navigator?.mediaDevices,
      };
      if (!WebRTC.RTCPeerConnection || !WebRTC.mediaDevices?.getUserMedia) {
        return null;
      }
      webrtcRef.current = WebRTC;
      return WebRTC;
    }
    if (!NativeModules.WebRTCModule) return null;
    try {
      webrtcRef.current = require("react-native-webrtc");
      return webrtcRef.current;
    } catch {
      return null;
    }
  }, []);

  const cleanup = useCallback(async () => {
    try {
      if (socketRef.current && roomId) {
        socketRef.current.emit("leave-room", { roomId });
      }
    } catch {
      // ignore
    }

    if (peerRef.current) {
      peerRef.current.onicecandidate = null;
      peerRef.current.ontrack = null;
      peerRef.current.close();
      peerRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setLocalStream(null);
    setRemoteStream(null);
  }, [roomId]);

  const createOffer = useCallback(async () => {
    if (!peerRef.current || !socketRef.current || !roomId) return;
    if (!remoteSocketIdRef.current) return;

    // 1) Create the SDP offer for the remote peer
    const offer = await peerRef.current.createOffer();
    // 2) Set it as our local description
    await peerRef.current.setLocalDescription(offer);
    // 3) Send it to the remote peer via signaling
    socketRef.current.emit("offer", {
      roomId,
      offer,
      to: remoteSocketIdRef.current,
    });
  }, [roomId]);

  const createAnswer = useCallback(
    async (offer) => {
      if (!peerRef.current || !socketRef.current || !roomId) return;
      const webrtc = ensureWebRTC();
      if (!webrtc) return;
      const { RTCSessionDescription } = webrtc;

      // 1) Set the remote offer
      await peerRef.current.setRemoteDescription(
        new RTCSessionDescription(offer)
      );
      // 2) Create the answer SDP
      const answer = await peerRef.current.createAnswer();
      // 3) Set the answer as our local description
      await peerRef.current.setLocalDescription(answer);
      // 4) Send it back to the caller
      socketRef.current.emit("answer", {
        roomId,
        answer,
        to: remoteSocketIdRef.current,
      });
    },
    [roomId, ensureWebRTC]
  );

  const start = useCallback(async () => {
    if (!roomId) return;

    const webrtc = ensureWebRTC();
    if (!webrtc) {
      setError(
        "WebRTC is unavailable on this build. Use a dev client/native build or run on iOS/Android."
      );
      return;
    }

    const {
      RTCPeerConnection,
      RTCIceCandidate,
      RTCSessionDescription,
      mediaDevices,
    } = webrtc;

    const socket = createSocket();
    socketRef.current = socket;

    // Register for direct notifications (incoming call)
    socket.emit("register-user", {
      userId,
      role: userRole,
      name: userName,
    });

    const peer = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peerRef.current = peer;

    // When ICE candidates are found, send them to the peer
    peer.onicecandidate = (event) => {
      if (event.candidate && socketRef.current) {
        socketRef.current.emit("ice-candidate", {
          roomId,
          candidate: event.candidate,
          to: remoteSocketIdRef.current,
        });
      }
    };

    // When remote track arrives, set it as remote stream
    peer.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
        setIsWaiting(false);
      }
    };

    // Get local media
    const stream = await mediaDevices.getUserMedia({
      audio: true,
      video: wantsVideo ? { facingMode: "user" } : false,
    });
    localStreamRef.current = stream;
    setLocalStream(stream);

    // Add local tracks to peer connection
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));

    socket.on("join-room", () => {});

    socket.emit(
      "join-room",
      { roomId, userId, role: userRole, name: userName },
      ({ existingSocketId } = {}) => {
        if (existingSocketId) {
          // This client joined second -> create the offer
          remoteSocketIdRef.current = existingSocketId;
          setIsWaiting(false);
          createOffer();
        }
      }
    );

    socket.on("user-joined", ({ socketId, name, role } = {}) => {
      // The other peer joined after us
      remoteSocketIdRef.current = socketId;
      if (name || role) {
        setRemoteInfo({ name, role });
      }
      setIsWaiting(false);
    });

    // Receive offer from peer
    socket.on("offer", async ({ from, offer }) => {
      remoteSocketIdRef.current = from;
      await createAnswer(offer);
    });

    // Receive answer from peer
    socket.on("answer", async ({ answer }) => {
      if (!peerRef.current) return;
      await peerRef.current.setRemoteDescription(
        new RTCSessionDescription(answer)
      );
    });

    // Receive ICE candidates from peer
    socket.on("ice-candidate", async ({ candidate }) => {
      if (!peerRef.current || !candidate) return;
      try {
        await peerRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        setError(err.message || "Failed to add ICE candidate");
      }
    });

    socket.on("user-left", () => {
      setRemoteStream(null);
      setIsWaiting(true);
    });
  }, [
    roomId,
    userId,
    userRole,
    userName,
    createOffer,
    createAnswer,
    ensureWebRTC,
    wantsVideo,
  ]);

  useEffect(() => {
    start().catch((err) => setError(err.message || "Failed to start call"));
    return () => {
      cleanup();
    };
  }, [start, cleanup]);

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current) return;
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    if (!audioTrack) return;
    audioTrack.enabled = !audioTrack.enabled;
    setIsMuted(!audioTrack.enabled);
  }, []);

  const toggleCamera = useCallback(() => {
    if (!localStreamRef.current) return;
    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (!videoTrack) return;
    videoTrack.enabled = !videoTrack.enabled;
    setIsVideoEnabled(videoTrack.enabled);
  }, []);

  const flipCamera = useCallback(() => {
    const videoTrack = localStreamRef.current?.getVideoTracks?.()[0];
    if (videoTrack && typeof videoTrack._switchCamera === "function") {
      videoTrack._switchCamera();
    }
  }, []);

  const endCall = useCallback(async () => {
    await cleanup();
  }, [cleanup]);

  return {
    localStream,
    remoteStream,
    isMuted,
    isVideoEnabled,
    isWaiting,
    remoteInfo,
    error,
    toggleMute,
    toggleCamera,
    flipCamera,
    endCall,
  };
}
