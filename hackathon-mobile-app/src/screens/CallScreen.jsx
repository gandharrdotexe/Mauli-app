import React, { useEffect, useMemo } from "react";
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
  Linking,
} from "react-native";

const getWebView = () => {
  if (Platform.OS === "web") return null;
  try {
    return require("react-native-webview").WebView;
  } catch {
    return null;
  }
};

export default function CallScreen({ route, navigation }) {
  const url = route?.params?.url || "https://calendly.com/suthakaranburaj";
  const title = route?.params?.title || "Call";
  const voiceSession = !!route?.params?.voiceSession;
  const callSubtitle = route?.params?.callSubtitle || (voiceSession ? "Secure voice session" : null);
  const WebView = useMemo(() => getWebView(), []);

  useEffect(() => {
    if (Platform.OS === "web") {
      Linking.openURL(url).catch(() => {});
    }
  }, [url]);

  const endCall = () => {
    if (navigation?.canGoBack?.()) navigation.goBack();
  };

  if (voiceSession) {
    return (
      <SafeAreaView style={voiceStyles.safeArea}>
        <View style={voiceStyles.topBar}>
          <Pressable
            onPress={endCall}
            hitSlop={12}
            style={({ pressed }) => [voiceStyles.endCallOuter, pressed && voiceStyles.endCallPressed]}
          >
            <Text style={voiceStyles.endCallText}>End</Text>
          </Pressable>
          <View style={voiceStyles.titleBlock}>
            {callSubtitle ? (
              <Text style={voiceStyles.kicker} numberOfLines={1}>
                {callSubtitle}
              </Text>
            ) : null}
            <Text style={voiceStyles.title} numberOfLines={1}>
              {title}
            </Text>
          </View>
          <View style={voiceStyles.topBarSpacer} />
        </View>
        <View style={voiceStyles.webShell}>
          {Platform.OS === "web" || !WebView ? (
            <View style={voiceStyles.webFallback}>
              <Text style={voiceStyles.webFallbackText}>Open this voice link in your browser.</Text>
              <Pressable style={voiceStyles.primaryBtn} onPress={() => Linking.openURL(url).catch(() => {})}>
                <Text style={voiceStyles.primaryBtnText}>Open link</Text>
              </Pressable>
            </View>
          ) : (
            <WebView
              source={{ uri: url }}
              style={voiceStyles.webview}
              javaScriptEnabled
              domStorageEnabled
              allowsInlineMediaPlayback
              mediaPlaybackRequiresUserAction={false}
              mediaCapturePermissionGrantType="grant"
              bounces={false}
            />
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        {navigation?.canGoBack?.() ? (
          <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.headerBack}>
            <Text style={styles.headerBackText}>Back</Text>
          </Pressable>
        ) : (
          <View style={styles.headerSide} />
        )}
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.headerSide} />
      </View>
      {Platform.OS === "web" || !WebView ? (
        <View style={styles.webFallback}>
          <Text style={styles.webFallbackText}>Opening the scheduling page in a new tab.</Text>
          <Pressable style={styles.webFallbackButton} onPress={() => Linking.openURL(url)}>
            <Text style={styles.webFallbackButtonText}>Open Scheduling Page</Text>
          </Pressable>
        </View>
      ) : (
        <WebView
          source={{ uri: url }}
          style={styles.webview}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback={false}
          mediaPlaybackRequiresUserAction
          mediaCapturePermissionGrantType="prompt"
        />
      )}
    </SafeAreaView>
  );
}

const voiceStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F7F3EA",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
    backgroundColor: "#FFFDF8",
  },
  endCallOuter: {
    minWidth: 64,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    alignItems: "center",
    justifyContent: "center",
  },
  endCallPressed: {
    opacity: 0.85,
  },
  endCallText: {
    color: "#B91C1C",
    fontWeight: "800",
    fontSize: 15,
  },
  titleBlock: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 8,
  },
  kicker: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "#0F766E",
  },
  title: {
    marginTop: 2,
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
  },
  topBarSpacer: {
    width: 64,
  },
  webShell: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  webview: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  webFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  webFallbackText: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
  },
  primaryBtn: {
    marginTop: 18,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: "#0F766E",
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 15,
  },
});

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0F172A",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: "#0F172A",
  },
  headerSide: {
    width: 56,
  },
  headerBack: {
    width: 56,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  headerBackText: {
    color: "#5DC1B9",
    fontWeight: "700",
    fontSize: 16,
  },
  headerTitle: {
    flex: 1,
    color: "#FFFFFF",
    fontWeight: "700",
    textAlign: "center",
    fontSize: 16,
  },
  webview: {
    flex: 1,
  },
  webFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#0F172A",
  },
  webFallbackText: {
    color: "#E2E8F0",
    textAlign: "center",
  },
  webFallbackButton: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#5DC1B9",
  },
  webFallbackButtonText: {
    color: "#0F172A",
    fontWeight: "700",
  },
});
