import { describe, expect, it } from "vitest";

import {
  APP_NAME,
  ONLINE_WINDOW_MS,
  PROTOCOL_VERSION,
  buildChatKey,
  isOnline,
  isRtcSignal,
} from "../src/index";

describe("shared contract", () => {
  it("exposes stable app metadata", () => {
    expect(APP_NAME).toBe("DropChat");
    expect(PROTOCOL_VERSION).toBe(1);
  });

  it("uses an inclusive 60 second online window", () => {
    const now = 1_700_000_000_000;

    expect(ONLINE_WINDOW_MS).toBe(60_000);
    expect(isOnline(now - 60_000, now)).toBe(true);
    expect(isOnline(now - 60_001, now)).toBe(false);
  });

  it("builds a sorted chat key regardless of argument order", () => {
    expect(buildChatKey("device-b", "device-a")).toBe("device-a:device-b");
    expect(buildChatKey("device-a", "device-b")).toBe("device-a:device-b");
  });

  it("keeps different device pairs distinct", () => {
    expect(buildChatKey("a", "b")).not.toBe(buildChatKey("a", "c"));
  });

  it("validates RTC signaling at runtime", () => {
    expect(isRtcSignal({ kind: "offer", sdp: "v=0" })).toBe(true);
    expect(isRtcSignal({ kind: "answer", sdp: "v=0" })).toBe(true);
    expect(
      isRtcSignal({
        kind: "ice",
        candidate: "candidate",
        sdpMid: null,
        sdpMLineIndex: 0,
      }),
    ).toBe(true);
    expect(
      isRtcSignal({
        kind: "ice",
        candidate: "candidate",
        sdpMid: "0",
        sdpMLineIndex: null,
      }),
    ).toBe(true);

    for (const value of [
      null,
      "offer",
      {},
      { kind: "offer" },
      { kind: "offer", sdp: "" },
      { kind: "answer", sdp: 1 },
      { kind: "ice", candidate: "" },
      { kind: "ice", candidate: "c", sdpMid: 1, sdpMLineIndex: 0 },
      { kind: "ice", candidate: "c", sdpMid: null, sdpMLineIndex: 1.5 },
      { kind: "bogus" },
    ]) {
      expect(isRtcSignal(value)).toBe(false);
    }
  });
});
