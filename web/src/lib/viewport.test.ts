import { describe, expect, it } from "vitest";

import { appViewportHeight } from "./viewport";

describe("appViewportHeight", () => {
  it("uses the visual viewport height when available", () => {
    expect(appViewportHeight({ height: 512.4 }, 800)).toBe(512);
  });

  it("falls back for missing or invalid heights", () => {
    expect(appViewportHeight(null, 800)).toBe(800);
    expect(appViewportHeight({ height: 0 }, 800)).toBe(800);
    expect(appViewportHeight({ height: Number.NaN }, 800)).toBe(800);
    expect(appViewportHeight({ height: -2 }, 800)).toBe(800);
  });
});
