import { describe, expect, it } from "vitest";

import { formatPlatform } from "./format";

describe("formatPlatform", () => {
  it("localizes known platforms and preserves unknown values", () => {
    expect(formatPlatform("web")).toBe("Веб");
    expect(formatPlatform("macOS")).toBe("macOS");
    expect(formatPlatform("custom-device")).toBe("custom-device");
  });
});
