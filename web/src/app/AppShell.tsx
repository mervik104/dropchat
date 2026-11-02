import { useEffect, type ReactNode } from "react";

import { appViewportHeight, appViewportTop } from "../lib/viewport";

export interface AppShellProps {
  hasSelection: boolean;
  notification: ReactNode;
  connectionIndicator: ReactNode;
  sidebar: ReactNode;
  conversation: ReactNode;
  overlays: ReactNode;
}

export function AppShell({
  hasSelection,
  notification,
  connectionIndicator,
  sidebar,
  conversation,
  overlays,
}: AppShellProps) {
  useEffect(() => {
    const root = document.documentElement;
    const viewport = window.visualViewport;
    const update = () => {
      root.style.setProperty(
        "--dc-app-height",
        `${appViewportHeight(viewport, window.innerHeight)}px`,
      );
      root.style.setProperty(
        "--dc-app-top",
        `${appViewportTop(viewport)}px`,
      );
    };

    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      root.style.removeProperty("--dc-app-height");
      root.style.removeProperty("--dc-app-top");
    };
  }, []);

  return (
    <main
      style={{
        height: "var(--dc-app-height, 100dvh)",
        top: "var(--dc-app-top, 0px)",
      }}
      className="fixed inset-x-0 overflow-hidden bg-canvas text-fg md:p-4"
    >
      {notification}

      {connectionIndicator ? (
        <div
          className={[
            "fixed left-3 z-40",
            hasSelection ? "bottom-24 md:bottom-3" : "bottom-3",
          ].join(" ")}
        >
          {connectionIndicator}
        </div>
      ) : null}

      <div className="mx-auto flex h-full min-h-0 w-full overflow-hidden bg-surface shadow-card md:max-w-[1440px] md:rounded-sheet md:border md:border-border">
        {sidebar}

        <section
          className={[
            "min-h-0 min-w-0 flex-1 flex-col bg-surface",
            hasSelection
              ? "flex animate-pane-in"
              : "hidden md:flex",
          ].join(" ")}
        >
          {conversation}
        </section>
      </div>

      {overlays}
    </main>
  );
}
