import { describe, expect, it } from "vitest";

import { ipGroupFor, normalizeIp } from "../src/ip";

const DEFAULT_IP = "203.0.113.10";

describe("normalizeIp", () => {
  it("trims IPv4 addresses", () => {
    expect(normalizeIp(" 203.0.113.7 ")).toBe("203.0.113.7");
  });

  it("keeps the first four IPv6 hextets", () => {
    expect(normalizeIp("2001:0DB8:0000:0001:AAAA:BBBB:CCCC:DDDD")).toBe(
      "2001:db8:0:1",
    );
  });

  it("expands compressed IPv6 addresses", () => {
    expect(normalizeIp("2001:db8::1")).toBe("2001:db8:0:0");
    expect(normalizeIp("::1")).toBe("0:0:0:0");
    expect(normalizeIp("0000::")).toBe("0:0:0:0");
  });

  it("handles an empty IPv6 tail", () => {
    expect(normalizeIp("2001:db8:1:2::")).toBe("2001:db8:1:2");
  });

  it("removes brackets and IPv6 zone identifiers", () => {
    expect(normalizeIp("[2001:DB8::1]")).toBe("2001:db8:0:0");
    expect(normalizeIp("fe80::1%en0")).toBe("fe80:0:0:0");
  });
});

describe("ipGroupFor", () => {
  it("hashes the salt with the normalized IP", async () => {
    await expect(ipGroupFor("salt", "203.0.113.10")).resolves.toBe(
      "9e9afe149a690f9049ba567947057d8b9b5cc2d8e322f946acabcf5ca0b3c2c2",
    );
  });

  it("changes when the salt changes", async () => {
    const first = await ipGroupFor("salt-a", DEFAULT_IP);
    const second = await ipGroupFor("salt-b", DEFAULT_IP);

    expect(first).not.toBe(second);
  });

  it("does not expose the raw IP", async () => {
    const group = await ipGroupFor("salt", DEFAULT_IP);

    expect(group).not.toContain(DEFAULT_IP);
  });
});
