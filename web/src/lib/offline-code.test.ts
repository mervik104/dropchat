import { describe, expect, it } from "vitest";

import { decodeOfflineSignal, encodeOfflineSignal } from "./offline-code";

describe("offline signaling codes", () => {
  it("round-trips an offer and an answer", () => {
    const offer = { type: "offer" as const, sdp: "v=0\r\nа=тест\r\n" };
    const answer = { type: "answer" as const, sdp: "v=0\r\nb=test\r\n" };

    expect(decodeOfflineSignal(encodeOfflineSignal(offer))).toEqual(offer);
    expect(decodeOfflineSignal(encodeOfflineSignal(answer))).toEqual(answer);
    expect(encodeOfflineSignal(offer)).not.toContain("+");
    expect(encodeOfflineSignal(offer)).not.toContain("/");
    expect(encodeOfflineSignal(offer)).not.toMatch(/=$/);
  });

  it("accepts surrounding whitespace", () => {
    const code = encodeOfflineSignal({ type: "offer", sdp: "v=0" });
    expect(decodeOfflineSignal(`  ${code}\n`)).toEqual({
      type: "offer",
      sdp: "v=0",
    });
  });

  it.each([
    ["not base64", "!!!!"],
    ["not json", btoa("not-json")],
    ["wrong shape", btoa(JSON.stringify({ type: "offer" }))],
    ["wrong type", btoa(JSON.stringify({ type: "candidate", sdp: "x" }))],
    ["empty", ""],
  ])("rejects invalid code: %s", (_name, code) => {
    expect(() => decodeOfflineSignal(code)).toThrow("invalid_offline_code");
  });
});
