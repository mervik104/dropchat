export interface OfflineSignal {
  type: "offer" | "answer";
  sdp: string;
}

export function encodeOfflineSignal(signal: OfflineSignal): string {
  const bytes = new TextEncoder().encode(JSON.stringify(signal));
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function decodeOfflineSignal(value: string): OfflineSignal {
  try {
    const normalized = value.trim().replace(/-/g, "+").replace(/_/g, "/");
    const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(`${normalized}${padding}`);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as {
      type?: unknown;
      sdp?: unknown;
    };
    if (
      (parsed.type !== "offer" && parsed.type !== "answer") ||
      typeof parsed.sdp !== "string" ||
      parsed.sdp.length === 0
    ) {
      throw new Error("invalid_offline_code");
    }
    return { type: parsed.type, sdp: parsed.sdp };
  } catch {
    throw new Error("invalid_offline_code");
  }
}
