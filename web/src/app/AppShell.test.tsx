import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "./AppShell";

function shell() {
  return (
    <AppShell
      hasSelection
      notification={null}
      connectionIndicator={<span>connection</span>}
      sidebar={<aside>sidebar</aside>}
      conversation={<section>conversation</section>}
      overlays={null}
    />
  );
}

afterEach(() => {
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: undefined,
  });
  document.documentElement.style.removeProperty("--dc-app-height");
});

describe("AppShell viewport height", () => {
  it("tracks visualViewport height and cleans up listeners", () => {
    let resize: (() => void) | null = null;
    const viewport = {
      height: 500,
      addEventListener: vi.fn((_type: string, listener: () => void) => {
        resize = listener;
      }),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: viewport,
    });

    const { unmount } = render(shell());
    expect(screen.getByText("conversation")).toBeTruthy();
    expect(screen.getByText("connection")).toBeTruthy();
    expect(
      document.documentElement.style.getPropertyValue("--dc-app-height"),
    ).toBe("500px");

    act(() => {
      viewport.height = 360;
      resize?.();
    });
    expect(
      document.documentElement.style.getPropertyValue("--dc-app-height"),
    ).toBe("360px");

    unmount();
    expect(viewport.removeEventListener).toHaveBeenCalledWith(
      "resize",
      expect.any(Function),
    );
  });

  it("falls back to window height without visualViewport", () => {
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 720,
    });

    render(shell());
    expect(
      document.documentElement.style.getPropertyValue("--dc-app-height"),
    ).toBe("720px");
  });
});
