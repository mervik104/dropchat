import { useEffect, useState } from "react";

import type { HealthClient } from "./lib/health";

type Status = "checking" | "online" | "offline";

const STATUS_TEXT: Record<Status, string> = {
  checking: "Проверка сервера...",
  online: "Сервер доступен",
  offline: "Сервер недоступен",
};

export interface AppProps {
  healthClient: HealthClient;
}

export function App({ healthClient }: AppProps) {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    void healthClient.check().then((ok) => {
      setStatus(ok ? "online" : "offline");
    });
  }, [healthClient]);

  return (
    <main className="min-h-screen bg-slate-100 px-5 py-10 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <section className="mx-auto max-w-xl rounded-3xl bg-white p-8 shadow-xl dark:bg-slate-900">
        <p className="text-sm font-medium uppercase tracking-[0.3em] text-sky-600 dark:text-sky-400">
          DropChat
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">DropChat</h1>
        <p className="mt-3 text-slate-600 dark:text-slate-300">
          Передача файлов и сообщений между вашими устройствами.
        </p>
        <p
          aria-live="polite"
          className="mt-6 inline-flex rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          {STATUS_TEXT[status]}
        </p>
      </section>
    </main>
  );
}
