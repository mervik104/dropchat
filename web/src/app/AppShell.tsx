import { useEffect, type ReactNode } from "react";

import { appViewportHeight } from "../lib/viewport";

export interface AppShellProps {
  hasSelection: boolean;
  notification: ReactNode;
  sidebar: ReactNode;
  conversation: ReactNode;
  overlays: ReactNode;
}

export function AppShell({
  hasSelection,
  notification,
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
    };

    update();
    viewport?.addEventListener("resize", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <main
      style={{ height: "var(--dc-app-height, 100dvh)" }}
      className="overflow-hidden bg-canvas text-fg md:p-4"
    >
      {notification}

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
