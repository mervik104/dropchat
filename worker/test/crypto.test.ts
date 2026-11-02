import { describe, expect, it } from "vitest";

import { constantTimeEqual, sha256Hex } from "../src/crypto";

describe("crypto helpers", () => {
  it("hashes with SHA-256 as lowercase hex", async () => {
    await expect(sha256Hex("abc")).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("compares equal strings", () => {
    expect(constantTimeEqual("abc", "abc")).toBe(true);
  });

  it("rejects strings with different lengths", () => {
    expect(constantTimeEqual("abc", "ab")).toBe(false);
  });

  it("rejects different strings of the same length", () => {
    expect(constantTimeEqual("abc", "abd")).toBe(false);
  });
});
