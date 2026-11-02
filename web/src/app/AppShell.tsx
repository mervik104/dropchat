import type { ReactNode } from "react";

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
  return (
    <main className="min-h-dvh bg-canvas text-fg">
      {notification}

      <div className="mx-auto flex h-dvh w-full overflow-hidden bg-surface shadow-card md:my-4 md:h-[calc(100dvh-2rem)] md:max-w-[1440px] md:rounded-sheet md:border md:border-border">
        {sidebar}

        <section
          className={[
            "min-w-0 flex-1 flex-col bg-surface",
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
