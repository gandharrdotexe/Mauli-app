const VAPI_PUBLIC_FOR_WEB = (
  process.env.EXPO_PUBLIC_VAPI_PUBLIC_KEY ||
  process.env.EXPO_PUBLIC_VAPI_API_KEY ||
  ""
).trim();

/**
 * URL for WebView / browser voice. Query: role, agentId, context, instruction, publicKey.
 */
export function buildVoiceWebCallUrl(baseUrl, voiceContext, agentId) {
  if (!baseUrl || typeof baseUrl !== "string") return "";

  let normalized = baseUrl.trim();
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = `https://${normalized}`;
  }

  try {
    const url = new URL(normalized);
    if (voiceContext?.role) {
      url.searchParams.set("role", String(voiceContext.role));
    }
    if (agentId) {
      url.searchParams.set("agentId", String(agentId));
    }
    const summary = voiceContext?.summary || "";
    if (summary) {
      const max = 1800;
      url.searchParams.set(
        "context",
        summary.length > max ? `${summary.slice(0, max)}…` : summary
      );
    }
    const instruction = voiceContext?.instruction || "";
    if (instruction && instruction.length < 1500) {
      url.searchParams.set("instruction", instruction);
    }
    if (VAPI_PUBLIC_FOR_WEB) {
      url.searchParams.set("publicKey", VAPI_PUBLIC_FOR_WEB);
    }
    return url.toString();
  } catch {
    return normalized;
  }
}
