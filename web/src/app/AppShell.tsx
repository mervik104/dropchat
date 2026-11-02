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
    <main className="min-h-dvh bg-stone-100 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      {notification}

      <div className="mx-auto flex h-dvh max-w-6xl overflow-hidden bg-white shadow-2xl dark:bg-stone-900">
        {sidebar}

        <section
          className={[
            "min-w-0 flex-1 flex-col",
            hasSelection ? "flex" : "hidden md:flex",
          ].join(" ")}
        >
          {conversation}
        </section>
      </div>

      {overlays}
    </main>
  );
}
