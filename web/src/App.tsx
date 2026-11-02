import { useEffect, useState } from "react";

import type { PeerSummary } from "@dropchat/shared";

import type { DeviceIdentity } from "./lib/identity";
import type { Workspace } from "./lib/workspace";

type LoadState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; workspace: Workspace };

export interface AppProps {
  loadWorkspace: () => Promise<Workspace>;
}

export function App({ loadWorkspace }: AppProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  function start() {
    setState({ status: "loading" });
    void loadWorkspace()
      .then((workspace) => {
        setState({ status: "ready", workspace });
      })
      .catch(() => {
        setState({ status: "error" });
      });
  }

  useEffect(() => {
    start();
  }, [loadWorkspace]);

  if (state.status === "loading") {
    return <LoadingScreen />;
  }

  if (state.status === "error") {
    return <ErrorScreen onRetry={start} />;
  }

  const { identity, peers } = state.workspace;
  const selectedPeer = peers.linked.find((peer) => peer.id === selectedPeerId);

  return (
    <main className="min-h-dvh bg-stone-100 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <div className="mx-auto flex h-dvh max-w-6xl overflow-hidden bg-white shadow-2xl dark:bg-stone-900">
        <aside
          className={[
            "w-full flex-col border-stone-200 bg-stone-50 dark:border-stone-800 dark:bg-stone-950 md:flex md:w-80 md:shrink-0 md:border-r",
            selectedPeer ? "hidden" : "flex",
          ].join(" ")}
        >
          <header className="flex items-center justify-between gap-3 border-b border-stone-200 px-4 py-4 dark:border-stone-800">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight">DropChat</h1>
              <p className="truncate text-sm text-stone-500 dark:text-stone-400">
                {identity.name}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="rounded-full border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-stone-100 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
            >
              Настройки
            </button>
          </header>

          <div className="border-b border-stone-200 px-4 py-3 dark:border-stone-800">
            <button
              type="button"
              disabled
              className="w-full rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white opacity-50"
            >
              Код приглашения
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-4">
            <section aria-labelledby="nearby-heading">
              <h2
                id="nearby-heading"
                className="px-1 text-xs font-semibold uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400"
              >
                Рядом
              </h2>
              {peers.local.length === 0 ? (
                <p className="mt-3 rounded-xl bg-white px-3 py-4 text-sm text-stone-500 dark:bg-stone-900 dark:text-stone-400">
                  Рядом пока никого
                </p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {peers.local.map((peer) => (
                    <li
                      key={peer.id}
                      className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-white dark:hover:bg-stone-900"
                    >
                      <span
                        aria-label={peer.online ? "онлайн" : "офлайн"}
                        className={onlineDotClass(peer)}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {peer.name}
                      </span>
                      <span className="text-xs text-stone-500 dark:text-stone-400">
                        Рядом
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section aria-labelledby="chats-heading" className="mt-6">
              <h2
                id="chats-heading"
                className="px-1 text-xs font-semibold uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400"
              >
                Чаты
              </h2>
              {peers.linked.length === 0 ? (
                <p className="mt-3 rounded-xl bg-white px-3 py-4 text-sm text-stone-500 dark:bg-stone-900 dark:text-stone-400">
                  Пока нет чатов
                </p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {peers.linked.map((peer) => (
                    <li key={peer.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedPeerId(peer.id)}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-white dark:hover:bg-stone-900"
                      >
                        <span
                          aria-label={peer.online ? "онлайн" : "офлайн"}
                          className={onlineDotClass(peer)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {peer.name}
                          </span>
                          <span className="block truncate text-xs text-stone-500 dark:text-stone-400">
                            Нет сообщений
                          </span>
                        </span>
                        <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[11px] font-medium text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                          Авто
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </aside>

        <section
          className={[
            "min-w-0 flex-1 flex-col",
            selectedPeer ? "flex" : "hidden md:flex",
          ].join(" ")}
        >
          {selectedPeer ? (
            <Conversation
              peer={selectedPeer}
              onBack={() => setSelectedPeerId(null)}
            />
          ) : (
            <div className="flex h-full items-center justify-center px-8 text-center">
              <div>
                <p className="text-lg font-semibold">Выберите чат</p>
                <p className="mt-2 max-w-sm text-sm text-stone-500 dark:text-stone-400">
                  Откройте устройство слева или добавьте новое по коду
                  приглашения.
                </p>
              </div>
            </div>
          )}
        </section>
      </div>

      {settingsOpen ? (
        <SettingsDialog identity={identity} onClose={() => setSettingsOpen(false)} />
      ) : null}
    </main>
  );
}

function LoadingScreen() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-stone-100 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">DropChat</h1>
        <p aria-live="polite" className="mt-3 text-sm text-stone-500 dark:text-stone-400">
          Загрузка DropChat…
        </p>
      </div>
    </main>
  );
}

function ErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-stone-100 px-6 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl dark:bg-stone-900">
        <h1 className="text-2xl font-semibold tracking-tight">DropChat</h1>
        <p className="mt-3 text-sm text-stone-600 dark:text-stone-300">
          Не удалось подключиться
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 w-full rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
        >
          Повторить
        </button>
      </div>
    </main>
  );
}

function Conversation({
  peer,
  onBack,
}: {
  peer: PeerSummary;
  onBack: () => void;
}) {
  return (
    <>
      <header className="flex items-center gap-3 border-b border-stone-200 px-4 py-4 dark:border-stone-800">
        <button
          type="button"
          aria-label="Назад"
          onClick={onBack}
          className="rounded-full border border-stone-300 px-3 py-1.5 text-sm font-medium md:hidden dark:border-stone-700"
        >
          Назад
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">{peer.name}</h2>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            {peer.online ? "в сети" : "не в сети"}
          </p>
        </div>
        <span className="rounded-full bg-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600 dark:bg-stone-800 dark:text-stone-300">
          Авто
        </span>
      </header>

      <div className="flex flex-1 items-center justify-center px-8 text-center">
        <div>
          <p className="text-base font-semibold">Сообщений пока нет</p>
          <p className="mt-2 max-w-sm text-sm text-stone-500 dark:text-stone-400">
            История этого чата появится после первого сообщения.
          </p>
        </div>
      </div>
    </>
  );
}

function SettingsDialog({
  identity,
  onClose,
}: {
  identity: DeviceIdentity;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      className="fixed inset-0 z-20 flex items-center justify-center bg-stone-950/50 px-4"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-stone-900">
        <div className="flex items-center justify-between gap-4">
          <h2 id="settings-title" className="text-xl font-semibold">
            Настройки
          </h2>
          <button
            type="button"
            aria-label="Закрыть настройки"
            onClick={onClose}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm dark:border-stone-700"
          >
            Закрыть
          </button>
        </div>

        <dl className="mt-6 space-y-4 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-stone-500 dark:text-stone-400">Устройство</dt>
            <dd className="font-medium">{identity.name}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-stone-500 dark:text-stone-400">Платформа</dt>
            <dd className="font-medium">{identity.platform}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-stone-500 dark:text-stone-400">Тема</dt>
            <dd className="font-medium">как в системе</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

function onlineDotClass(peer: PeerSummary): string {
  return [
    "h-2.5 w-2.5 shrink-0 rounded-full",
    peer.online ? "bg-emerald-500" : "bg-stone-400 dark:bg-stone-600",
  ].join(" ");
}
