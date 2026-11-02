import { describe, expect, it } from "vitest";

import { nextScrollTop } from "./scroll";

describe("nextScrollTop", () => {
  it("sticks to the bottom when messages append or load initially", () => {
    expect(
      nextScrollTop({
        previousFirstId: null,
        nextFirstId: "m1",
        previousHeight: 0,
        nextHeight: 400,
        previousScrollTop: 0,
      }),
    ).toBe(400);
    expect(
      nextScrollTop({
        previousFirstId: "m1",
        nextFirstId: "m1",
        previousHeight: 400,
        nextHeight: 500,
        previousScrollTop: 100,
      }),
    ).toBe(500);
  });

  it("preserves the viewport when older messages are prepended", () => {
    expect(
      nextScrollTop({
        previousFirstId: "m3",
        nextFirstId: "m1",
        previousHeight: 400,
        nextHeight: 600,
        previousScrollTop: 50,
      }),
    ).toBe(250);
  });
});
