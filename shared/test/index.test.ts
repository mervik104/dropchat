import { describe, expect, it } from "vitest";

import { APP_NAME, PROTOCOL_VERSION, buildChatKey } from "../src/index";

describe("shared contract", () => {
  it("exposes stable app metadata", () => {
    expect(APP_NAME).toBe("DropChat");
    expect(PROTOCOL_VERSION).toBe(1);
  });

  it("builds a sorted chat key regardless of argument order", () => {
    expect(buildChatKey("device-b", "device-a")).toBe("device-a:device-b");
    expect(buildChatKey("device-a", "device-b")).toBe("device-a:device-b");
  });

  it("keeps different device pairs distinct", () => {
    expect(buildChatKey("a", "b")).not.toBe(buildChatKey("a", "c"));
  });
});
