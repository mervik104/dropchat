import { describe, expect, it } from "vitest";

import {
  APP_NAME,
  ONLINE_WINDOW_MS,
  PROTOCOL_VERSION,
  buildChatKey,
  isOnline,
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
});
