import React, { useContext, useMemo, useRef, useEffect } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  NativeModules,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  Platform,
} from "react-native";
import { AuthContext } from "../context/AuthContext";
import useVideoCall from "../hooks/useVideoCall";

const getRTCView = () => {
  if (Platform.OS === "web") return null;
  if (!NativeModules.WebRTCModule) return null;
  try {
    return require("react-native-webrtc").RTCView;
  } catch {
    return null;
  }
};

export default function VideoCallScreen({ route, navigation }) {
  const { user, role } = useContext(AuthContext);
  const { roomId, userRole, userName, remoteName, callType } =
    route.params || {};
  const RTCView = useMemo(() => getRTCView(), []);
  const isWeb = Platform.OS === "web";
  const isAudioOnly = callType === "AUDIO_CALL";
  const WebVideo = isWeb ? "video" : View;
  const WebAudio = isWeb ? "audio" : View;
  const remoteVideoRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);

  const resolvedRole = userRole || role || "patient";
  const resolvedName =
    userName ||
    user?.abha_profile?.name ||
    user?.name ||
    "User";

  const call = useVideoCall({
    roomId,
    userId: user?._id,
    userRole: resolvedRole,
    userName: resolvedName,
    callType,
  });

  const { width } = Dimensions.get("window");
  const pipPosition = useRef(
    new Animated.ValueXY({ x: width - 140, y: 40 })
  ).current;

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          pipPosition.setOffset({
            x: pipPosition.x.__getValue(),
            y: pipPosition.y.__getValue(),
          });
          pipPosition.setValue({ x: 0, y: 0 });
        },
        onPanResponderMove: Animated.event(
          [null, { dx: pipPosition.x, dy: pipPosition.y }],
          { useNativeDriver: false }
        ),
        onPanResponderRelease: () => {
          pipPosition.flattenOffset();
        },
      }),
    [pipPosition]
  );

  const handleEnd = async () => {
    await call.endCall();
    navigation.goBack();
  };

  const waitingTitle =
    resolvedRole === "doctor" ? "Waiting for patient" : "Waiting for doctor";

  if (!RTCView && !isWeb) {
    return (
      <View style={styles.container}>
        <View style={styles.waiting}>
          <Text style={styles.waitingTitle}>WebRTC Unavailable</Text>
          <Text style={styles.waitingSubtitle}>
            This build does not include the native WebRTC module.
          </Text>
          <Pressable
            style={styles.endButtonWide}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.endText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  useEffect(() => {
    if (!isWeb) return;
    if (remoteVideoRef.current && call.remoteStream && !isAudioOnly) {
      remoteVideoRef.current.srcObject = call.remoteStream;
      remoteVideoRef.current
        .play()
        .catch(() => {});
    }
    if (localVideoRef.current && call.localStream && !isAudioOnly) {
      localVideoRef.current.srcObject = call.localStream;
      localVideoRef.current
        .play()
        .catch(() => {});
    }
    if (remoteAudioRef.current && call.remoteStream && isAudioOnly) {
      remoteAudioRef.current.srcObject = call.remoteStream;
      remoteAudioRef.current
        .play()
        .catch(() => {});
    }
  }, [call.remoteStream, call.localStream, isWeb, isAudioOnly]);

  return (
    <View style={styles.container}>
      {call.remoteStream ? (
        isAudioOnly ? (
          <View style={styles.audioStage}>
            <View style={styles.audioRing}>
              <Text style={styles.audioInitial}>
                {(remoteName || call.remoteInfo?.name || "A").slice(0, 1)}
              </Text>
            </View>
            <Text style={styles.audioName}>
              {remoteName || call.remoteInfo?.name || "Connected"}
            </Text>
            <Text style={styles.audioStatus}>Audio call live</Text>
            {isWeb ? (
              <WebAudio ref={remoteAudioRef} autoPlay />
            ) : null}
          </View>
        ) : isWeb ? (
          <WebVideo
            ref={remoteVideoRef}
            style={styles.webVideo}
            autoPlay
            playsInline
          />
        ) : (
          <RTCView
            streamURL={call.remoteStream.toURL()}
            style={styles.remoteVideo}
            objectFit="cover"
          />
        )
      ) : (
        <View style={styles.waiting}>
          <Text style={styles.waitingTitle}>{waitingTitle}</Text>
          <Text style={styles.waitingSubtitle}>
            {remoteName || call.remoteInfo?.name || "Connecting..."}
          </Text>
          <ActivityIndicator size="large" color="#5DC1B9" style={styles.spinner} />
        </View>
      )}

      {!isAudioOnly && call.localStream ? (
        isWeb ? (
          <Animated.View
            style={[styles.localPreview, pipPosition.getLayout()]}
            {...panResponder.panHandlers}
          >
            <WebVideo
              ref={localVideoRef}
              style={styles.webVideo}
              muted
              autoPlay
              playsInline
            />
          </Animated.View>
        ) : (
          <Animated.View
            style={[styles.localPreview, pipPosition.getLayout()]}
            {...panResponder.panHandlers}
          >
            <RTCView
              streamURL={call.localStream.toURL()}
              style={styles.localVideo}
              objectFit="cover"
              mirror
            />
          </Animated.View>
        )
      ) : null}

      {call.error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{call.error}</Text>
        </View>
      ) : null}

      <View style={styles.controls}>
        <Pressable style={styles.controlButton} onPress={call.toggleMute}>
          <Text style={styles.controlText}>
            {call.isMuted ? "Unmute" : "Mute"}
          </Text>
        </Pressable>
        {!isAudioOnly ? (
          <>
            <Pressable style={styles.controlButton} onPress={call.toggleCamera}>
              <Text style={styles.controlText}>
                {call.isVideoEnabled ? "Hide Cam" : "Show Cam"}
              </Text>
            </Pressable>
            <Pressable style={styles.controlButton} onPress={call.flipCamera}>
              <Text style={styles.controlText}>Flip</Text>
            </Pressable>
          </>
        ) : null}
        <Pressable style={[styles.controlButton, styles.endButton]} onPress={handleEnd}>
          <Text style={styles.endText}>End</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  remoteVideo: {
    flex: 1,
  },
  webVideo: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  waiting: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  waitingTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "700",
  },
  waitingSubtitle: {
    marginTop: 8,
    color: "#CBD5F5",
  },
  spinner: {
    marginTop: 16,
  },
  localPreview: {
    position: "absolute",
    width: 120,
    height: 160,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  localVideo: {
    width: "100%",
    height: "100%",
  },
  audioStage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  audioRing: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#1E293B",
    borderWidth: 2,
    borderColor: "#5DC1B9",
    alignItems: "center",
    justifyContent: "center",
  },
  audioInitial: {
    fontSize: 36,
    fontWeight: "800",
    color: "#5DC1B9",
  },
  audioName: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  audioStatus: {
    marginTop: 6,
    color: "#CBD5F5",
  },
  errorBanner: {
    position: "absolute",
    top: 60,
    left: 20,
    right: 20,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(248,113,113,0.9)",
  },
  errorText: {
    color: "#0F172A",
    fontWeight: "700",
    textAlign: "center",
  },
  controls: {
    position: "absolute",
    bottom: 24,
    left: 20,
    right: 20,
    flexDirection: "row",
    gap: 10,
  },
  endButtonWide: {
    marginTop: 18,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 14,
    backgroundColor: "#EF4444",
  },
  controlButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
  },
  controlText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 12,
  },
  endButton: {
    backgroundColor: "#EF4444",
  },
  endText: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
