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
    <main className="h-dvh overflow-hidden bg-canvas text-fg md:p-4">
      {notification}

      <div className="mx-auto flex h-full w-full overflow-hidden bg-surface shadow-card md:max-w-[1440px] md:rounded-sheet md:border md:border-border">
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
