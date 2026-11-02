import { describe, expect, it } from "vitest";

import { appViewportHeight, appViewportTop } from "./viewport";

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

describe("appViewportTop", () => {
  it("tracks a positive visual viewport offset", () => {
    expect(appViewportTop({ offsetTop: 42.4 })).toBe(42);
  });

  it("clamps missing, invalid, and negative offsets", () => {
    expect(appViewportTop(null)).toBe(0);
    expect(appViewportTop({ offsetTop: -1 })).toBe(0);
    expect(appViewportTop({ offsetTop: Number.NaN })).toBe(0);
  });
});
