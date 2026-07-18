import React from "react";
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHeaderHeight } from "@react-navigation/elements";
import { streamChatMessage } from "../services/api";
import { Feather } from "@expo/vector-icons";
import * as Speech from "expo-speech";
import { offlineMatch, streamOfflineResponse } from "../services/offlineAI";

let ExpoSpeechRecognitionModule = null;
let useSpeechRecognitionEvent = () => {};

try {
  const speechRecognition = require("expo-speech-recognition");
  ExpoSpeechRecognitionModule = speechRecognition.ExpoSpeechRecognitionModule;
  useSpeechRecognitionEvent = speechRecognition.useSpeechRecognitionEvent;
} catch {
  ExpoSpeechRecognitionModule = null;
  useSpeechRecognitionEvent = () => {};
}

// ─── Quick question chips ─────────────────────────────────────────────────────

const quickSymptoms = [
  { id: 1,  label: "Mera agla ANC checkup kab hai?",      icon: "📅" },
  { id: 2,  label: "Baby ki movement kam ho gayi",          icon: "👶" },
  { id: 3,  label: "BP high ho raha hai pregnancy mein",    icon: "💉" },
  { id: 4,  label: "IFA tablet kab aur kaise leni chahiye?",icon: "💊" },
  { id: 5,  label: "Ulti aur chakkar aa rahe hain",         icon: "🤢" },
  { id: 6,  label: "JSY ya JSSK scheme ke baare mein batao",icon: "🏛️" },
  { id: 7,  label: "Newborn baby ki dekhbhal kaise karein?",icon: "🤱" },
  { id: 8,  label: "Ambulance ya emergency number kya hai?",icon: "🚑" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dedupeByUrl(items, keyName = "url") {
  const seen = new Set();
  const output = [];
  (Array.isArray(items) ? items : []).forEach((item) => {
    if (!item || typeof item !== "object") return;
    const key = item[keyName] || item.imageUrl || item.pageUrl || item.thumbnailUrl;
    if (!key || seen.has(key)) return;
    seen.add(key);
    output.push(item);
  });
  return output;
}

function parseInlineMarkdownImages(content) {
  if (typeof content !== "string" || !content) return { text: "", images: [] };
  const images = [];
  const text = content.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, (_, alt = "", url = "") => {
    images.push({ title: alt || "Image", imageUrl: url, pageUrl: url, thumbnailUrl: url });
    return "";
  });
  return { text: text.replace(/\n{3,}/g, "\n\n"), images };
}

function tokenizeInlineMarkdown(text) {
  const tokens = [];
  const pattern =
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|((?:https?:\/\/)[^\s)]+)|\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;
  let lastIndex = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) tokens.push({ type: "text", value: text.slice(lastIndex, match.index) });
    if (match[1] && match[2]) tokens.push({ type: "link", label: match[1], url: match[2] });
    else if (match[3]) tokens.push({ type: "link", label: match[3], url: match[3] });
    else if (match[4]) tokens.push({ type: "bold", value: match[4] });
    else if (match[5]) tokens.push({ type: "italic", value: match[5] });
    else if (match[6]) tokens.push({ type: "code", value: match[6] });
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) tokens.push({ type: "text", value: text.slice(lastIndex) });
  return tokens;
}

function InlineMarkdownText({ text, isUser, onOpenUrl, style, tokenPrefix }) {
  const tokens = React.useMemo(() => tokenizeInlineMarkdown(text), [text]);
  return (
    <Text style={style}>
      {tokens.map((token, index) => {
        if (token.type === "link") return (
          <Text key={`${tokenPrefix}-link-${index}`} style={[styles.inlineLink, isUser ? styles.inlineLinkUser : null]} onPress={() => onOpenUrl(token.url)}>
            {token.label}
          </Text>
        );
        if (token.type === "bold") return <Text key={`${tokenPrefix}-bold-${index}`} style={styles.inlineBold}>{token.value}</Text>;
        if (token.type === "code") return <Text key={`${tokenPrefix}-code-${index}`} style={[styles.inlineCode, isUser ? styles.inlineCodeUser : null]}>{token.value}</Text>;
        if (token.type === "italic") return <Text key={`${tokenPrefix}-italic-${index}`} style={styles.inlineItalic}>{token.value}</Text>;
        return <Text key={`${tokenPrefix}-text-${index}`}>{token.value}</Text>;
      })}
    </Text>
  );
}

function MarkdownMessage({ text, isUser, onOpenUrl }) {
  const lines = React.useMemo(() => String(text || "").replace(/\r/g, "").split("\n"), [text]);
  const baseTextStyle = [styles.messageText, isUser ? styles.userText : styles.assistantText];
  const elements = [];
  let inCodeFence = false;
  let codeLines = [];

  function flushCodeFence(keySeed) {
    if (!codeLines.length) return;
    elements.push(
      <View key={`code-${keySeed}`} style={[styles.codeBlock, isUser ? styles.codeBlockUser : null]}>
        <Text style={[styles.codeBlockText, isUser ? styles.codeBlockTextUser : null]}>{codeLines.join("\n")}</Text>
      </View>
    );
    codeLines = [];
  }

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const key = `line-${index}`;
    if (trimmed.startsWith("```")) {
      if (inCodeFence) flushCodeFence(index);
      inCodeFence = !inCodeFence;
      return;
    }
    if (inCodeFence) { codeLines.push(line); return; }
    if (!trimmed) { elements.push(<View key={key} style={styles.markdownSpacer} />); return; }

    const quote = trimmed.match(/^>\s+(.+)/);
    if (quote) {
      elements.push(<View key={key} style={[styles.quoteRow, isUser ? styles.quoteRowUser : null]}><InlineMarkdownText text={quote[1]} isUser={isUser} onOpenUrl={onOpenUrl} tokenPrefix={key} style={[...baseTextStyle, styles.quoteText]} /></View>);
      return;
    }
    const h3 = trimmed.match(/^###\s+(.+)/);
    if (h3) { elements.push(<InlineMarkdownText key={key} text={h3[1]} isUser={isUser} onOpenUrl={onOpenUrl} tokenPrefix={key} style={[...baseTextStyle, styles.heading3]} />); return; }
    const h2 = trimmed.match(/^##\s+(.+)/);
    if (h2) { elements.push(<InlineMarkdownText key={key} text={h2[1]} isUser={isUser} onOpenUrl={onOpenUrl} tokenPrefix={key} style={[...baseTextStyle, styles.heading2]} />); return; }
    const h1 = trimmed.match(/^#\s+(.+)/);
    if (h1) { elements.push(<InlineMarkdownText key={key} text={h1[1]} isUser={isUser} onOpenUrl={onOpenUrl} tokenPrefix={key} style={[...baseTextStyle, styles.heading1]} />); return; }
    const numbered = trimmed.match(/^(\d+)\.\s+(.+)/);
    if (numbered) {
      elements.push(<View key={key} style={styles.listRow}><Text style={[styles.listMarker, isUser ? styles.userText : styles.assistantText]}>{numbered[1]}.</Text><InlineMarkdownText text={numbered[2]} isUser={isUser} onOpenUrl={onOpenUrl} tokenPrefix={key} style={[...baseTextStyle, styles.listContent]} /></View>);
      return;
    }
    const bulleted = trimmed.match(/^[-*]\s+(.+)/);
    if (bulleted) {
      elements.push(<View key={key} style={styles.listRow}><Text style={[styles.listMarker, isUser ? styles.userText : styles.assistantText]}>•</Text><InlineMarkdownText text={bulleted[1]} isUser={isUser} onOpenUrl={onOpenUrl} tokenPrefix={key} style={[...baseTextStyle, styles.listContent]} /></View>);
      return;
    }
    elements.push(<InlineMarkdownText key={key} text={line} isUser={isUser} onOpenUrl={onOpenUrl} tokenPrefix={key} style={baseTextStyle} />);
  });
  if (inCodeFence) flushCodeFence("tail");
  return <View>{elements}</View>;
}

function extractSpeechTranscript(results) {
  if (!Array.isArray(results)) return "";
  return results
    .map((result) => String(result?.transcript || "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

function plainTextForSpeech(text) {
  if (typeof text !== "string") return "";
  return text
    .replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g, "$1")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s*/gm, "")
    .replace(/^[-*]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Message Bubble ────────────────────────────────────────────────────────────

function MessageBubble({ message, onOpenUrl, onSpeak, activeSpeechMessageId }) {
  const isUser = message.role === "user";
  const parsedText = parseInlineMarkdownImages(message.content);
  const eventImages = Array.isArray(message.images) ? message.images : [];
  const images = dedupeByUrl([...eventImages, ...parsedText.images], "imageUrl");
  const videos = dedupeByUrl(message.videos, "url");
  const sources = dedupeByUrl(message.sources, "url");
  const hasText = parsedText.text.trim().length > 0;
  const isSpeaking = activeSpeechMessageId === message.id;

  return (
    <View style={[styles.messageRow, isUser ? styles.userMessageRow : styles.assistantMessageRow]}>
      {!isUser && (
        <View style={styles.avatarWrap}>
          <Text style={styles.avatarText}>M</Text>
        </View>
      )}
      <View style={[styles.messageContent, isUser ? styles.userMessageContent : styles.assistantMessageContent]}>
        {!isUser ? (
          <View style={styles.assistantHeader}>
            <Text style={styles.assistantName}>Mauli</Text>
            {hasText ? (
              <Pressable style={[styles.speakerButton, isSpeaking && styles.speakerButtonActive]} onPress={() => onSpeak?.(message.id, parsedText.text)}>
                <Feather name={isSpeaking ? "square" : "volume-2"} size={14} color={isSpeaking ? "#FFFFFF" : "#0F766E"} />
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.assistantBubble]}>
          {hasText ? <MarkdownMessage text={parsedText.text} isUser={isUser} onOpenUrl={onOpenUrl} /> : null}
          {!isUser && images.length > 0 ? (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionTitle}>Images</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imageRow}>
                {images.map((item, index) => (
                  <Pressable key={`${message.id}-image-${index}`} style={styles.mediaCard} onPress={() => onOpenUrl(item.pageUrl || item.imageUrl)}>
                    <Image source={{ uri: item.thumbnailUrl || item.imageUrl }} style={styles.mediaImage} resizeMode="cover" />
                    <Text numberOfLines={2} style={styles.mediaTitle}>{String(item.title || "Image")}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}
          {!isUser && videos.length > 0 ? (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionTitle}>Videos</Text>
              {videos.map((video, index) => {
                const thumb = video?.thumbnails?.high?.url || video?.thumbnails?.medium?.url || video?.thumbnails?.default?.url;
                return (
                  <Pressable key={`${message.id}-video-${index}`} style={styles.videoCard} onPress={() => onOpenUrl(video.url)}>
                    {thumb ? <Image source={{ uri: thumb }} style={styles.videoThumb} resizeMode="cover" /> : null}
                    <Text numberOfLines={2} style={styles.videoTitle}>{String(video.title || "YouTube video")}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          {!isUser && sources.length > 0 ? (
            <View style={styles.sectionBlock}>
              <Text style={styles.sectionTitle}>Sources</Text>
              {sources.map((source, index) => (
                <Pressable key={`${message.id}-source-${index}`} onPress={() => onOpenUrl(source.url)} style={styles.sourceRow}>
                  <Text numberOfLines={2} style={styles.sourceText}>{String((source.title || source.url || "").trim())}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
        {!isUser && <Text style={styles.messageTime}>Just now</Text>}
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ChatScreen({ route, navigation }) {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const listRef = React.useRef(null);
  const abortStreamRef = React.useRef(null);
  const speechBasePromptRef = React.useRef("");
  const speechFinalTranscriptRef = React.useRef("");
  const authToken = route?.params?.token;

  const [prompt, setPrompt] = React.useState("");
  const [conversationId, setConversationId] = React.useState("");
  const [messages, setMessages] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [toolsOpen, setToolsOpen] = React.useState(false);
  const [includeYouTube, setIncludeYouTube] = React.useState(false);
  const [includeWebImages, setIncludeWebImages] = React.useState(false);
  const [offlineMode, setOfflineMode] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState([]);
  const [speechAvailable, setSpeechAvailable] = React.useState(false);
  const [isListening, setIsListening] = React.useState(false);
  const [activeSpeechMessageId, setActiveSpeechMessageId] = React.useState(null);

  React.useEffect(() => {
    try {
      setSpeechAvailable(Boolean(ExpoSpeechRecognitionModule?.isRecognitionAvailable?.()));
    } catch {
      setSpeechAvailable(false);
    }
    return () => {
      abortStreamRef.current?.();
      Speech.stop();
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        // ignore speech cleanup issues during unmount
      }
    };
  }, []);
  React.useEffect(() => {
    requestAnimationFrame(() => { listRef.current?.scrollToEnd({ animated: true }); });
  }, [messages, loading]);

  useSpeechRecognitionEvent("start", () => {
    setIsListening(true);
    setError("");
  });

  useSpeechRecognitionEvent("end", () => {
    setIsListening(false);
    speechFinalTranscriptRef.current = "";
  });

  useSpeechRecognitionEvent("result", (event) => {
    const transcript = extractSpeechTranscript(event?.results);
    if (!transcript) return;
    if (event?.isFinal) {
      speechFinalTranscriptRef.current = transcript;
    }
    const liveTranscript = event?.isFinal ? transcript : speechFinalTranscriptRef.current
      ? `${speechFinalTranscriptRef.current} ${transcript}`.trim()
      : transcript;
    const nextPrompt = [speechBasePromptRef.current, liveTranscript].filter(Boolean).join(" ").trim();
    setPrompt(nextPrompt);
  });

  useSpeechRecognitionEvent("nomatch", () => {
    setError("I couldn't catch that. Please try speaking again.");
  });

  useSpeechRecognitionEvent("error", (event) => {
    const speechError = event?.error;
    if (speechError === "aborted") return;
    if (speechError === "no-speech" || speechError === "speech-timeout") {
      setError("No speech detected. Please try again.");
      return;
    }
    if (speechError === "not-allowed" || speechError === "service-not-allowed") {
      setError("Voice input needs microphone and speech permissions on this device.");
      return;
    }
    setError(event?.message || "Voice input failed. Please try again.");
  });

  function updateMessage(messageId, update) {
    setMessages((prev) =>
      prev.map((message) => {
        if (message.id !== messageId) return message;
        const nextPatch = typeof update === "function" ? update(message) : update;
        return { ...message, ...nextPatch };
      })
    );
  }

  async function handleOpenUrl(url) {
    if (!url) return;
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) await Linking.openURL(url);
    } catch { /* ignore */ }
  }

  async function handleSpeakMessage(messageId, text) {
    const speakableText = plainTextForSpeech(text);
    if (!speakableText) return;

    if (activeSpeechMessageId === messageId) {
      await Speech.stop();
      setActiveSpeechMessageId(null);
      return;
    }

    await Speech.stop();
    setActiveSpeechMessageId(messageId);
    Speech.speak(speakableText, {
      language: "en-IN",
      pitch: 1,
      rate: 0.95,
      onDone: () => setActiveSpeechMessageId(null),
      onStopped: () => setActiveSpeechMessageId(null),
      onError: () => {
        setActiveSpeechMessageId(null);
        setError("Unable to play the response aloud on this device.");
      },
    });
  }

  function stopVoiceInput() {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      setIsListening(false);
    }
  }

  async function handleVoiceInput() {
    if (loading) return;

    if (isListening) {
      stopVoiceInput();
      return;
    }

    let recognitionReady = false;
    try {
      recognitionReady = Boolean(ExpoSpeechRecognitionModule?.isRecognitionAvailable?.());
      setSpeechAvailable(recognitionReady);
    } catch {
      recognitionReady = false;
    }

    if (!recognitionReady) {
      setError("Voice input is not available in this build yet. Please use a development build on device.");
      return;
    }

    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission?.granted) {
        setError("Microphone and speech permissions are required for voice input.");
        return;
      }

      speechBasePromptRef.current = prompt.trim();
      speechFinalTranscriptRef.current = "";
      setToolsOpen(false);
      setError("");

      ExpoSpeechRecognitionModule.start({
        lang: "en-IN",
        interimResults: true,
        continuous: false,
        addsPunctuation: true,
        maxAlternatives: 1,
      });
    } catch (voiceError) {
      setError(voiceError?.message || "Unable to start voice input.");
    }
  }

  function handleSend() {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt || loading || isListening) return;
    if (offlineMode) { handleOfflineSend(trimmedPrompt); return; }
    handleOnlineSend(trimmedPrompt);
  }

  function handleOfflineSend(trimmedPrompt) {
    const now = Date.now();
    const userId = `${now}-user`;
    const assistantId = `${now}-assistant`;
    setError(""); setPrompt(""); setLoading(true); setSuggestions([]);
    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", content: trimmedPrompt, offline: true },
      { id: assistantId, role: "assistant", content: "", offline: true },
    ]);
    const result = offlineMatch(trimmedPrompt);
    abortStreamRef.current?.();
    abortStreamRef.current = streamOfflineResponse(result.text, {
      onChunk: (chunk) => { updateMessage(assistantId, (msg) => ({ content: `${msg.content || ""}${chunk}` })); },
      onDone: () => { setLoading(false); setSuggestions(result.suggestions || []); abortStreamRef.current = null; },
    });
  }

  function handleOnlineSend(trimmedPrompt) {
    const now = Date.now();
    const userId = `${now}-user`;
    const assistantId = `${now}-assistant`;
    setError(""); setPrompt(""); setLoading(true); setToolsOpen(false);
    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", content: trimmedPrompt },
      { id: assistantId, role: "assistant", content: "", images: [], videos: [], sources: [] },
    ]);
    abortStreamRef.current?.();
    abortStreamRef.current = streamChatMessage({
      token: authToken,
      prompt: trimmedPrompt,
      conversationId: conversationId || undefined,
      options: { includeYouTube, includeImageSearch: includeWebImages },
      onEvent: ({ event, data }) => {
        if (event === "conversationId" && typeof data?.conversationId === "string") { setConversationId(data.conversationId); return; }
        if (event === "message") {
          const chunk = typeof data?.text === "string" ? data.text : typeof data?.raw === "string" ? data.raw : "";
          if (chunk) updateMessage(assistantId, (message) => ({ content: `${message.content || ""}${chunk}` }));
          return;
        }
        if (event === "images") { const incoming = Array.isArray(data?.images) ? data.images : []; updateMessage(assistantId, (message) => ({ images: dedupeByUrl([...(message.images || []), ...incoming], "imageUrl") })); return; }
        if (event === "youtubeResults") { const incoming = Array.isArray(data?.videos) ? data.videos : []; updateMessage(assistantId, (message) => ({ videos: dedupeByUrl([...(message.videos || []), ...incoming], "url") })); return; }
        if (event === "sources") { const incoming = Array.isArray(data?.sources) ? data.sources : []; updateMessage(assistantId, (message) => ({ sources: dedupeByUrl([...(message.sources || []), ...incoming], "url") })); return; }
        if (event === "error") setError(data?.message || data?.error || "Chat stream failed");
      },
      onComplete: () => { setLoading(false); abortStreamRef.current = null; },
      onError: (streamError) => { setLoading(false); setError(streamError?.message || "Chat stream failed"); abortStreamRef.current = null; },
    });
  }

  function handleModeToggle() {
    abortStreamRef.current?.();
    abortStreamRef.current = null;
    Speech.stop();
    setActiveSpeechMessageId(null);
    if (isListening) stopVoiceInput();
    setOfflineMode((prev) => !prev);
    setMessages([]); setSuggestions([]); setError(""); setLoading(false); setPrompt(""); setConversationId("");
  }

  function handleNewChat() {
    abortStreamRef.current?.();
    abortStreamRef.current = null;
    Speech.stop();
    setActiveSpeechMessageId(null);
    if (isListening) stopVoiceInput();
    setToolsOpen(false); setConversationId(""); setMessages([]); setSuggestions([]); setError(""); setLoading(false); setPrompt("");
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? headerHeight : 20}
    >
      {/* ── Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 14) }]}>
        <Pressable onPress={() => navigation?.goBack()} style={styles.backButton}>
          <Feather name="arrow-left" size={22} color="#1F2937" />
        </Pressable>

        <View style={styles.headerCenter}>
          {/* Avatar ring matching dashboard */}
          <View style={styles.headerAvatarRing}>
            <Text style={styles.headerAvatarText}>M</Text>
          </View>
          <View style={styles.headerTextWrap}>
            <Text style={styles.title}>Mauli</Text>
            <View style={styles.onlineStatus}>
              <View style={[styles.onlineDot, offlineMode && styles.offlineDot]} />
              <Text style={[styles.subtitle, offlineMode && styles.offlineSubtitle]}>
                {offlineMode ? "Offline Mode" : "Online · ANC Assistant"}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.headerActions}>
          <Pressable style={[styles.modePill, offlineMode && styles.modePillOffline]} onPress={handleModeToggle}>
            <Feather name={offlineMode ? "wifi-off" : "wifi"} size={13} color={offlineMode ? "#B45309" : "#5DC1B9"} />
            <Text style={[styles.modePillText, offlineMode && styles.modePillTextOffline]}>
              {offlineMode ? "Offline" : "Online"}
            </Text>
          </Pressable>
          <Pressable style={styles.refreshBtn} onPress={handleNewChat}>
            <Feather name="refresh-cw" size={16} color={offlineMode ? "#B45309" : "#5DC1B9"} />
          </Pressable>
        </View>
      </View>

      {/* ── Offline banner */}
      {offlineMode && (
        <View style={styles.offlineBanner}>
          <Feather name="wifi-off" size={13} color="#92400E" />
          <Text style={styles.offlineBannerText}>
            Offline Mode — Local maternal & ANC health knowledge base
          </Text>
        </View>
      )}

      {/* ── Messages */}
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messagesContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        renderItem={({ item }) => (
          <MessageBubble
            message={item}
            onOpenUrl={handleOpenUrl}
            onSpeak={handleSpeakMessage}
            activeSpeechMessageId={activeSpeechMessageId}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            {/* Mauli welcome card */}
            <View style={styles.welcomeCard}>
              <View style={styles.welcomeAvatarRing}>
                <Text style={styles.welcomeAvatarText}>M</Text>
              </View>
              <Text style={styles.welcomeName}>Mauli</Text>
              <Text style={styles.welcomeSubtitle}>
                {offlineMode
                  ? "Apna swasthya sawaal poochein"
                  : "Aapki matritva swasthya sahayika"}
              </Text>
              <Text style={styles.welcomeDesc}>
                {offlineMode
                  ? "ANC, pregnancy, aur neonatal health ke baare mein poochein — bina internet ke bhi jawab milega."
                  : "Pregnancy, ANC checkup, high-risk monitoring, aur government schemes — sab kuch ek hi jagah."}
              </Text>
            </View>

            {/* Quick question grid */}
            <Text style={styles.quickTitle}>Kuch sawaal poochein →</Text>
            <View style={styles.symptomsGrid}>
              {quickSymptoms.map((symptom) => (
                <Pressable
                  key={symptom.id}
                  style={styles.symptomCard}
                  onPress={() => setPrompt(symptom.label)}
                >
                  <Text style={styles.symptomIcon}>{symptom.icon}</Text>
                  <Text style={styles.symptomLabel}>{symptom.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        }
      />

      {/* ── Suggestion chips after offline reply */}
      {offlineMode && suggestions.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.suggestionsRow}
          contentContainerStyle={styles.suggestionsContent}
        >
          {suggestions.map((s, i) => (
            <Pressable key={i} style={styles.suggestionChip} onPress={() => setPrompt(s)}>
              <Text style={styles.suggestionChipText}>{s}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {isListening ? (
        <View style={styles.voiceBanner}>
          <Feather name="mic" size={13} color="#0F766E" />
          <Text style={styles.voiceBannerText}>Listening... tap the mic again to finish dictation.</Text>
        </View>
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {/* ── Composer */}
      <View style={[styles.composerRow, offlineMode && styles.composerRowOffline]}>

        {/* Tools popup — rendered inside composerRow so z-index works */}
        {toolsOpen && (
          <>
            {/* Backdrop: closes menu on tap, sits below the menu card */}
            <Pressable
              style={styles.toolsBackdrop}
              onPress={() => setToolsOpen(false)}
            />
            {/* Menu card: above the backdrop */}
            <View style={styles.toolsMenu}>
              <View style={styles.toolItem}>
                <Text style={styles.toolLabel}>YouTube</Text>
                <Switch
                  value={includeYouTube}
                  onValueChange={(val) => { setIncludeYouTube(val); }}
                  trackColor={{ false: "#E2E8F0", true: "#5DC1B9" }}
                  thumbColor="#FFFFFF"
                />
              </View>
              <View style={styles.toolItemDivider} />
              <View style={styles.toolItem}>
                <Text style={styles.toolLabel}>Web Images</Text>
                <Switch
                  value={includeWebImages}
                  onValueChange={(val) => { setIncludeWebImages(val); }}
                  trackColor={{ false: "#E2E8F0", true: "#5DC1B9" }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </View>
          </>
        )}

        <View style={[styles.inputContainer, offlineMode && styles.inputContainerOffline]}>
          {!offlineMode && (
            <Pressable style={styles.toolsIconButton} onPress={() => setToolsOpen((prev) => !prev)}>
              <Feather name="plus" size={22} color="#5DC1B9" />
            </Pressable>
          )}
          <TextInput
            style={styles.input}
            value={prompt}
            onChangeText={setPrompt}
            placeholder={offlineMode ? "Apna sawaal Hindi ya English mein likhein..." : "Mauli se kuch bhi poochein..."}
            placeholderTextColor="#94A3B8"
            multiline
            maxLength={4000}
          />
          <Pressable
            style={[
              styles.micButton,
              isListening && styles.micButtonActive,
              (!speechAvailable || loading) && !isListening ? styles.micButtonDisabled : null,
            ]}
            onPress={handleVoiceInput}
            disabled={loading}
          >
            <Feather
              name={isListening ? "square" : "mic"}
              size={17}
              color={isListening ? "#FFFFFF" : speechAvailable ? "#0F766E" : "#94A3B8"}
            />
          </Pressable>
          <Pressable
            style={[styles.sendButton, offlineMode && styles.sendButtonOffline, (loading || !prompt.trim() || isListening) && styles.disabledButton]}
            onPress={handleSend}
            disabled={loading || !prompt.trim() || isListening}
          >
            {loading && offlineMode
              ? <Feather name="loader" size={17} color="#ffffff" />
              : <Feather name="send" size={17} color="#ffffff" style={styles.sendIcon} />}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const TEAL = "#5DC1B9";
const TEAL_LIGHT = "#F0FBFA";
const TEAL_BORDER = "#B2E5E1";
const BG = "#F7FAFB";
const CARD = "#FFFFFF";
const DARK = "#1F2937";
const MID = "#475569";
const MUTED = "#94A3B8";
const BORDER = "#E6EEF0";
const AMBER = "#B45309";
const AMBER_BG = "#FFFBEB";
const AMBER_BORDER = "#FDE68A";

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },

  // ── Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: CARD,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    zIndex: 10,
    gap: 10,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerAvatarRing: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: TEAL,
    backgroundColor: TEAL_LIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  headerAvatarText: {
    fontSize: 17,
    fontWeight: "800",
    color: TEAL,
  },
  headerTextWrap: {
    justifyContent: "center",
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: DARK,
    letterSpacing: -0.3,
  },
  onlineStatus: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 1,
    gap: 4,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: TEAL,
  },
  offlineDot: {
    backgroundColor: AMBER,
  },
  subtitle: {
    fontSize: 11,
    color: TEAL,
    fontWeight: "600",
  },
  offlineSubtitle: {
    color: AMBER,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  modePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: TEAL_LIGHT,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: TEAL_BORDER,
  },
  modePillOffline: {
    backgroundColor: AMBER_BG,
    borderColor: AMBER_BORDER,
  },
  modePillText: {
    fontSize: 11,
    fontWeight: "700",
    color: TEAL,
  },
  modePillTextOffline: {
    color: AMBER,
  },
  refreshBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: TEAL_LIGHT,
    borderWidth: 1,
    borderColor: TEAL_BORDER,
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Offline banner
  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: AMBER_BORDER,
  },
  offlineBannerText: {
    fontSize: 12,
    color: "#92400E",
    fontWeight: "500",
    flex: 1,
  },

  // ── Messages
  messagesContent: {
    padding: 16,
    paddingBottom: 24,
  },

  // ── Empty / Welcome
  emptyContainer: {
    marginTop: 16,
    paddingHorizontal: 4,
  },
  welcomeCard: {
    backgroundColor: CARD,
    borderRadius: 22,
    padding: 22,
    alignItems: "center",
    marginBottom: 22,
    borderWidth: 1,
    borderColor: TEAL_BORDER,
    shadowColor: TEAL,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  },
  welcomeAvatarRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2.5,
    borderColor: TEAL,
    backgroundColor: TEAL_LIGHT,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  welcomeAvatarText: {
    fontSize: 26,
    fontWeight: "800",
    color: TEAL,
  },
  welcomeName: {
    fontSize: 22,
    fontWeight: "800",
    color: DARK,
    marginBottom: 4,
  },
  welcomeSubtitle: {
    fontSize: 13,
    color: TEAL,
    fontWeight: "600",
    marginBottom: 8,
  },
  welcomeDesc: {
    fontSize: 13,
    color: MID,
    textAlign: "center",
    lineHeight: 19,
  },
  quickTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: MUTED,
    letterSpacing: 0.3,
    marginBottom: 10,
  },
  symptomsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  symptomCard: {
    flexDirection: "row",
    alignItems: "center",
    width: "48.5%",
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 12,
    gap: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  symptomIcon: {
    fontSize: 18,
  },
  symptomLabel: {
    flex: 1,
    fontSize: 12,
    color: DARK,
    fontWeight: "500",
    lineHeight: 16,
  },

  // ── Suggestion chips
  suggestionsRow: {
    maxHeight: 46,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    backgroundColor: BG,
  },
  suggestionsContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    flexDirection: "row",
  },
  suggestionChip: {
    backgroundColor: TEAL_LIGHT,
    borderWidth: 1,
    borderColor: TEAL_BORDER,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  suggestionChipText: {
    fontSize: 12,
    color: "#0F766E",
    fontWeight: "600",
  },

  // ── Composer
  composerRow: {
    padding: 14,
    backgroundColor: CARD,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    position: "relative",
  },
  composerRowOffline: {
    backgroundColor: AMBER_BG,
    borderTopColor: AMBER_BORDER,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: BG,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  inputContainerOffline: {
    backgroundColor: "#FFFBEB",
    borderColor: AMBER_BORDER,
  },
  toolsIconButton: {
    paddingLeft: 8,
    paddingRight: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  toolsBackdrop: {
    position: "absolute",
    top: -9999,
    bottom: -9999,
    left: -9999,
    right: -9999,
    zIndex: 10,
  },
  toolsMenu: {
    position: "absolute",
    bottom: 64,
    left: 8,
    backgroundColor: CARD,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 6,
    width: 220,
    zIndex: 20,
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  toolItemDivider: {
    height: 1,
    backgroundColor: BORDER,
  },
  toolItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  toolLabel: {
    fontSize: 15,
    color: DARK,
  },
  input: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 44,
    maxHeight: 120,
    color: DARK,
    fontSize: 15,
  },
  micButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E6F7F5",
    borderWidth: 1,
    borderColor: TEAL_BORDER,
    marginRight: 6,
  },
  micButtonActive: {
    backgroundColor: TEAL,
    borderColor: TEAL,
  },
  micButtonDisabled: {
    backgroundColor: "#F1F5F9",
    borderColor: BORDER,
  },
  sendButton: {
    backgroundColor: TEAL,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 2,
  },
  sendButtonOffline: {
    backgroundColor: "#D97706",
  },
  sendIcon: {
    marginLeft: -2,
  },
  disabledButton: {
    opacity: 0.5,
  },
  errorText: {
    color: "#DC2626",
    paddingHorizontal: 14,
    paddingBottom: 6,
    fontSize: 13,
  },
  voiceBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ECFDF5",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#A7F3D0",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  voiceBannerText: {
    flex: 1,
    fontSize: 12,
    color: "#0F766E",
    fontWeight: "600",
  },

  // ── Message bubbles
  messageRow: {
    flexDirection: "row",
    marginBottom: 18,
    alignItems: "flex-start",
  },
  userMessageRow: { justifyContent: "flex-end" },
  assistantMessageRow: { justifyContent: "flex-start" },
  avatarWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: TEAL,
    backgroundColor: TEAL_LIGHT,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  avatarText: {
    color: TEAL,
    fontWeight: "800",
    fontSize: 15,
  },
  messageContent: { flex: 1 },
  userMessageContent: { alignItems: "flex-end" },
  assistantMessageContent: { alignItems: "flex-start" },
  assistantHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
    marginLeft: 2,
  },
  assistantName: {
    fontSize: 12,
    color: TEAL,
    fontWeight: "700",
  },
  speakerButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E6F7F5",
    borderWidth: 1,
    borderColor: TEAL_BORDER,
  },
  speakerButtonActive: {
    backgroundColor: TEAL,
    borderColor: TEAL,
  },
  messageBubble: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  userBubble: {
    backgroundColor: TEAL,
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: CARD,
    borderTopLeftRadius: 4,
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  messageTime: {
    fontSize: 10,
    color: MUTED,
    marginTop: 5,
    marginLeft: 2,
  },
  messageText: { fontSize: 15, lineHeight: 22 },
  userText: { color: "#FFFFFF" },
  assistantText: { color: DARK },
  markdownSpacer: { height: 8 },
  heading1: { fontSize: 20, fontWeight: "700", marginBottom: 2 },
  heading2: { fontSize: 18, fontWeight: "700", marginBottom: 2 },
  heading3: { fontSize: 16, fontWeight: "700", marginBottom: 2 },
  listRow: { flexDirection: "row", alignItems: "flex-start", marginVertical: 2 },
  listMarker: { width: 20, fontSize: 15, lineHeight: 22, fontWeight: "600" },
  listContent: { flex: 1 },
  inlineLink: { color: TEAL, textDecorationLine: "underline" },
  inlineLinkUser: { color: "#B2E5E1" },
  inlineBold: { fontWeight: "700" },
  inlineItalic: { fontStyle: "italic" },
  inlineCode: {
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    backgroundColor: "#E5E7EB",
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  inlineCodeUser: { backgroundColor: "rgba(255,255,255,0.25)" },
  codeBlock: { marginTop: 6, padding: 10, borderRadius: 10, backgroundColor: "#0F172A" },
  codeBlockUser: { backgroundColor: "rgba(0,0,0,0.4)" },
  codeBlockText: {
    color: "#F9FAFB",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    fontSize: 13,
    lineHeight: 18,
  },
  codeBlockTextUser: { color: "#FFFFFF" },
  quoteRow: { borderLeftWidth: 3, borderLeftColor: TEAL_BORDER, paddingLeft: 10, marginVertical: 2 },
  quoteRowUser: { borderLeftColor: "rgba(255,255,255,0.6)" },
  quoteText: { opacity: 0.95 },

  // ── Media
  sectionBlock: { marginTop: 10, width: "100%" },
  sectionTitle: { fontSize: 11, color: MUTED, fontWeight: "700", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  imageRow: { paddingRight: 6 },
  mediaCard: { width: 170, marginRight: 10, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: BORDER, backgroundColor: CARD },
  mediaImage: { width: "100%", height: 100 },
  mediaTitle: { fontSize: 12, color: DARK, paddingHorizontal: 8, paddingVertical: 8 },
  videoCard: { marginBottom: 8, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: BORDER, backgroundColor: CARD },
  videoThumb: { width: "100%", height: 160 },
  videoTitle: { fontSize: 13, color: DARK, paddingHorizontal: 10, paddingVertical: 8 },
  sourceRow: { borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 6, backgroundColor: BG },
  sourceText: { fontSize: 13, color: TEAL, textDecorationLine: "underline" },
});
