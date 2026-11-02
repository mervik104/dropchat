import { useEffect, useRef, useState, type FormEvent } from "react";

import type {
  ChatMessage,
  DeviceProfile,
  InviteResponse,
  MessagesPage,
  PeerSummary,
  PeersResponse,
  UpdateDeviceRequest,
  WsEvent,
} from "@dropchat/shared";

import {
  serializeIdentity,
  type DeviceIdentity,
} from "./lib/identity";
import {
  createOptimisticText,
  mergeMessages,
  peerIdForMessage,
  replaceMessage,
  setMessageStatus,
  upsertMessage,
} from "./lib/messages";
import type { RealtimeConnection } from "./lib/socket";
import {
  IdentityRejectedError,
  RegistrationRateLimitedError,
  type Workspace,
} from "./lib/workspace";

type ErrorKind = "identity" | "rate_limit" | "generic";

type LoadState =
  | { status: "loading" }
  | { status: "error"; kind: ErrorKind }
  | { status: "ready"; workspace: Workspace };

export interface AppProps {
  loadWorkspace: () => Promise<Workspace>;
  saveProfile: (
    identity: DeviceIdentity,
    patch: UpdateDeviceRequest,
  ) => Promise<DeviceProfile>;
  resetIdentity: () => Promise<void>;
  importIdentity: (text: string) => Promise<void>;
  loadMessages: (
    identity: DeviceIdentity,
    peerId: string,
    before?: string,
  ) => Promise<MessagesPage>;
  sendText: (
    identity: DeviceIdentity,
    peerId: string,
    text: string,
    clientId: string,
  ) => Promise<ChatMessage>;
  connectRealtime: (
    identity: DeviceIdentity,
    onEvent: (event: WsEvent) => void,
    onReconnect: () => void,
  ) => Promise<RealtimeConnection>;
  refreshPeers: (identity: DeviceIdentity) => Promise<PeersResponse>;
  requestPeer: (identity: DeviceIdentity, peerId: string) => Promise<PeerSummary>;
  respondPeer: (
    identity: DeviceIdentity,
    fromDeviceId: string,
    accept: boolean,
  ) => Promise<{ linked: boolean; peer?: PeerSummary }>;
  createInvite: (identity: DeviceIdentity) => Promise<InviteResponse>;
  redeemInvite: (identity: DeviceIdentity, code: string) => Promise<PeerSummary>;
  createLocalId: () => string;
  now: () => number;
}

export function App({
  loadWorkspace,
  saveProfile,
  resetIdentity,
  importIdentity,
  loadMessages,
  sendText,
  connectRealtime,
  refreshPeers,
  requestPeer,
  respondPeer,
  createInvite,
  redeemInvite,
  createLocalId,
  now,
}: AppProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [sentRequests, setSentRequests] = useState<Record<string, boolean>>({});
  const [messagesByPeer, setMessagesByPeer] = useState<
    Record<string, ChatMessage[]>
  >({});
  const [nextBeforeByPeer, setNextBeforeByPeer] = useState<
    Record<string, string | null>
  >({});
  const [loadingMessagesFor, setLoadingMessagesFor] = useState<string | null>(
    null,
  );
  const [messagesErrorFor, setMessagesErrorFor] = useState<string | null>(null);
  const [onlineOverrides, setOnlineOverrides] = useState<
    Record<string, boolean>
  >({});
  const [peersOverride, setPeersOverride] = useState<PeersResponse | null>(
    null,
  );
  const connectionRef = useRef<RealtimeConnection | null>(null);
  const selectedPeerIdRef = useRef<string | null>(null);

  function start() {
    setState({ status: "loading" });
    setSelectedPeerId(null);
    setSettingsOpen(false);
    setInviteOpen(false);
    setSentRequests({});
    setMessagesByPeer({});
    setNextBeforeByPeer({});
    setLoadingMessagesFor(null);
    setMessagesErrorFor(null);
    setOnlineOverrides({});
    setPeersOverride(null);

    void loadWorkspace()
      .then((workspace) => {
        setMessagesByPeer(
          Object.fromEntries(
            workspace.peers.linked.map((peer) => [peer.id, []]),
          ),
        );
        setNextBeforeByPeer(
          Object.fromEntries(
            workspace.peers.linked.map((peer) => [peer.id, null]),
          ),
        );
        setState({ status: "ready", workspace });
      })
      .catch((error: unknown) => {
        setState({ status: "error", kind: errorKind(error) });
      });
  }

  useEffect(() => {
    start();
  }, [loadWorkspace]);

  const readyIdentity = state.status === "ready" ? state.workspace.identity : null;

  useEffect(() => {
    selectedPeerIdRef.current = selectedPeerId;
  }, [selectedPeerId]);

  useEffect(() => {
    if (!readyIdentity || !selectedPeerId) {
      return;
    }

    const peerId = selectedPeerId;
    setLoadingMessagesFor(peerId);
    setMessagesErrorFor(null);
    void loadMessages(readyIdentity, peerId)
      .then((page) => {
        setMessagesByPeer((current) => ({
          ...current,
          [peerId]: page.messages,
        }));
        setNextBeforeByPeer((current) => ({
          ...current,
          [peerId]: page.nextBefore,
        }));
      })
      .catch(() => {
        setMessagesErrorFor(peerId);
      })
      .finally(() => {
        setLoadingMessagesFor(null);
      });
  }, [selectedPeerId, readyIdentity?.deviceId, loadMessages]);

  useEffect(() => {
    if (!readyIdentity) {
      return;
    }

    async function refreshAfterReconnect(): Promise<void> {
      try {
        setPeersOverride(await refreshPeers(readyIdentity!));
        setOnlineOverrides({});
      } catch {
        // Presence will be corrected by the next event or manual refresh.
      }

      const peerId = selectedPeerIdRef.current;
      if (!peerId) {
        return;
      }

      try {
        const page = await loadMessages(readyIdentity!, peerId);
        setMessagesByPeer((current) => ({
          ...current,
          [peerId]: mergeMessages(current[peerId], page.messages),
        }));
      } catch {
        // The next successful refresh will fill the gap.
      }
    }

    void connectRealtime(
      readyIdentity,
      (event) => {
        if (event.type === "presence") {
          setOnlineOverrides((current) => ({
            ...current,
            [event.deviceId]: event.online,
          }));
          return;
        }

        if (event.type === "peer.request" || event.type === "peer.linked") {
          void refreshPeers(readyIdentity)
            .then((next) => setPeersOverride(next))
            .catch(() => undefined);
          return;
        }

        const peerId = peerIdForMessage(readyIdentity.deviceId, event.message);
        setMessagesByPeer((current) => ({
          ...current,
          [peerId]: upsertMessage(current[peerId], event.message),
        }));
      },
      () => {
        void refreshAfterReconnect();
      },
    )
      .then((connection) => {
        connectionRef.current = connection;
      })
      .catch(() => undefined);

    return () => {
      connectionRef.current?.close();
      connectionRef.current = null;
    };
  }, [readyIdentity?.deviceId, connectRealtime, refreshPeers, loadMessages]);

  async function handleImportIdentity(text: string) {
    await importIdentity(text);
    start();
  }

  async function handleResetIdentity() {
    await resetIdentity();
    start();
  }

  if (state.status === "loading") {
    return <LoadingScreen />;
  }

  if (state.status === "error") {
    return (
      <ErrorScreen
        kind={state.kind}
        onRetry={start}
        onResetIdentity={handleResetIdentity}
        onImportIdentity={handleImportIdentity}
      />
    );
  }

  const { identity } = state.workspace;
  const basePeers = peersOverride ?? state.workspace.peers;
  const peers = applyPresence(basePeers, onlineOverrides);
  const selectedPeer = peers.linked.find((peer) => peer.id === selectedPeerId);

  async function handleSaveProfile(name: string, invisible: boolean) {
    const profile = await saveProfile(identity, { name, invisible });
    setState({
      status: "ready",
      workspace: {
        identity: {
          ...identity,
          name: profile.name,
          invisible: profile.invisible,
        },
        peers: basePeers,
      },
    });
  }

  async function reloadPeers(): Promise<void> {
    try {
      setPeersOverride(await refreshPeers(identity));
    } catch {
      // Keep the last known peer list; reconnect/events will retry.
    }
  }

  async function sendPeerRequest(peerId: string): Promise<void> {
    setSentRequests((current) => ({ ...current, [peerId]: true }));
    try {
      await requestPeer(identity, peerId);
    } catch {
      setSentRequests((current) => ({ ...current, [peerId]: false }));
    }
  }

  async function respondToRequest(
    fromDeviceId: string,
    accept: boolean,
  ): Promise<void> {
    await respondPeer(identity, fromDeviceId, accept);
    await reloadPeers();
  }

  async function redeemInviteCode(code: string): Promise<void> {
    await redeemInvite(identity, code);
    await reloadPeers();
  }

  async function deliverMessage(
    peerId: string,
    text: string,
    clientId: string,
  ): Promise<void> {
    try {
      const saved = await sendText(identity, peerId, text, clientId);
      setMessagesByPeer((current) => ({
        ...current,
        [peerId]: replaceMessage(current[peerId], clientId, saved),
      }));
    } catch {
      setMessagesByPeer((current) => ({
        ...current,
        [peerId]: setMessageStatus(current[peerId], clientId, "failed"),
      }));
    }
  }

  async function sendMessage(peerId: string, text: string): Promise<void> {
    const optimistic = createOptimisticText({
      identity,
      peerId,
      text,
      id: createLocalId(),
      now: now(),
    });
    setMessagesByPeer((current) => ({
      ...current,
      [peerId]: upsertMessage(current[peerId], optimistic),
    }));

    await deliverMessage(peerId, text, optimistic.id);
  }

  async function retryMessage(
    peerId: string,
    message: ChatMessage,
  ): Promise<void> {
    setMessagesByPeer((current) => ({
      ...current,
      [peerId]: setMessageStatus(current[peerId], message.id, "sending"),
    }));
    await deliverMessage(peerId, message.text!, message.id);
  }

  async function loadOlderMessages(peerId: string, before: string) {
    setLoadingMessagesFor(peerId);
    setMessagesErrorFor(null);
    try {
      const page = await loadMessages(identity, peerId, before);
      setMessagesByPeer((current) => ({
        ...current,
        [peerId]: mergeMessages(current[peerId], page.messages),
      }));
      setNextBeforeByPeer((current) => ({
        ...current,
        [peerId]: page.nextBefore,
      }));
    } catch {
      setMessagesErrorFor(peerId);
    } finally {
      setLoadingMessagesFor(null);
    }
  }

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
              onClick={() => setInviteOpen(true)}
              className="w-full rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
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
                      <button
                        type="button"
                        aria-label={`Отправить запрос ${peer.name}`}
                        onClick={() => void sendPeerRequest(peer.id)}
                        disabled={sentRequests[peer.id] === true}
                        className="rounded-full border border-sky-300 px-2.5 py-1 text-xs font-medium text-sky-700 disabled:opacity-60 dark:border-sky-800 dark:text-sky-300"
                      >
                        {sentRequests[peer.id] === true ? "Отправлено" : "Запрос"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {peers.incomingRequests.length > 0 ? (
              <section aria-labelledby="requests-heading" className="mt-6">
                <h2
                  id="requests-heading"
                  className="px-1 text-xs font-semibold uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400"
                >
                  Запросы
                </h2>
                <ul className="mt-2 space-y-1">
                  {peers.incomingRequests.map((peer) => (
                    <li
                      key={peer.id}
                      className="rounded-xl bg-white p-3 dark:bg-stone-900"
                    >
                      <p className="truncate text-sm font-medium">{peer.name}</p>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => void respondToRequest(peer.id, true)}
                          className="rounded-full bg-sky-600 px-3 py-1 text-xs font-semibold text-white"
                        >
                          Принять
                        </button>
                        <button
                          type="button"
                          onClick={() => void respondToRequest(peer.id, false)}
                          className="rounded-full border border-stone-300 px-3 py-1 text-xs font-medium dark:border-stone-700"
                        >
                          Отклонить
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

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
              currentDeviceId={identity.deviceId}
              peer={selectedPeer}
              messages={messagesByPeer[selectedPeer.id]}
              nextBefore={nextBeforeByPeer[selectedPeer.id]}
              loading={loadingMessagesFor === selectedPeer.id}
              error={messagesErrorFor === selectedPeer.id}
              onBack={() => setSelectedPeerId(null)}
              onLoadMore={(before) => loadOlderMessages(selectedPeer.id, before)}
              onSend={(text) => sendMessage(selectedPeer.id, text)}
              onRetry={(message) => retryMessage(selectedPeer.id, message)}
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
        <SettingsDialog
          identity={identity}
          onClose={() => setSettingsOpen(false)}
          onSave={handleSaveProfile}
          onImportIdentity={handleImportIdentity}
        />
      ) : null}

      {inviteOpen ? (
        <InviteDialog
          onClose={() => setInviteOpen(false)}
          onCreate={() => createInvite(identity)}
          onRedeem={redeemInviteCode}
        />
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

const ERROR_TITLE: Record<ErrorKind, string> = {
  identity: "Сервер не узнал устройство",
  rate_limit: "Слишком много попыток регистрации",
  generic: "Не удалось подключиться",
};

const ERROR_BODY: Record<ErrorKind, string> = {
  identity: "Локальная identity сохранена. Импортируйте её или сбросьте.",
  rate_limit: "Сервер ограничил регистрацию с этого IP. Попробуйте позже.",
  generic: "Проверьте подключение к сети и повторите попытку.",
};

function ErrorScreen({
  kind,
  onRetry,
  onResetIdentity,
  onImportIdentity,
}: {
  kind: ErrorKind;
  onRetry: () => void;
  onResetIdentity: () => Promise<void>;
  onImportIdentity: (text: string) => Promise<void>;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-stone-100 px-6 py-10 text-stone-900 dark:bg-stone-950 dark:text-stone-100">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-stone-900">
        <h1 className="text-2xl font-semibold tracking-tight">DropChat</h1>
        <p className="mt-4 text-base font-semibold">{ERROR_TITLE[kind]}</p>
        <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">
          {ERROR_BODY[kind]}
        </p>

        <button
          type="button"
          onClick={onRetry}
          className="mt-5 w-full rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
        >
          Повторить
        </button>

        {kind === "identity" ? (
          <div className="mt-5 border-t border-stone-200 pt-5 dark:border-stone-800">
            <ImportIdentityForm onImport={onImportIdentity} />
            <button
              type="button"
              onClick={onResetIdentity}
              className="mt-4 w-full rounded-xl border border-rose-300 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300 dark:hover:bg-rose-950"
            >
              Сбросить identity
            </button>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function Conversation({
  currentDeviceId,
  peer,
  messages,
  nextBefore,
  loading,
  error,
  onBack,
  onLoadMore,
  onSend,
  onRetry,
}: {
  currentDeviceId: string;
  peer: PeerSummary;
  messages: ChatMessage[];
  nextBefore: string | null;
  loading: boolean;
  error: boolean;
  onBack: () => void;
  onLoadMore: (before: string) => void;
  onSend: (text: string) => Promise<void>;
  onRetry: (message: ChatMessage) => Promise<void>;
}) {
  const [text, setText] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return;
    }
    setText("");
    void onSend(trimmed);
  }

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

      <div className="flex flex-1 flex-col overflow-y-auto px-4 py-4">
        {nextBefore ? (
          <button
            type="button"
            disabled={loading}
            onClick={() => onLoadMore(nextBefore)}
            className="mx-auto rounded-full border border-stone-300 px-3 py-1.5 text-xs font-medium disabled:opacity-50 dark:border-stone-700"
          >
            Загрузить ещё
          </button>
        ) : null}

        {loading ? (
          <p className="mt-4 text-center text-sm text-stone-500 dark:text-stone-400">
            Загрузка сообщений…
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 text-center text-sm text-rose-600 dark:text-rose-400">
            Не удалось загрузить сообщения
          </p>
        ) : null}

        {!loading && !error && messages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-center">
            <div>
              <p className="text-base font-semibold">Сообщений пока нет</p>
              <p className="mt-2 max-w-sm text-sm text-stone-500 dark:text-stone-400">
                История этого чата появится после первого сообщения.
              </p>
            </div>
          </div>
        ) : null}

        <div className="mt-4 space-y-2">
          {messages.map((message) => {
            const own = message.fromDevice === currentDeviceId;
            return (
              <div
                key={message.id}
                className={own ? "flex justify-end" : "flex justify-start"}
              >
                <div
                  className={[
                    "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm",
                    own
                      ? "bg-sky-600 text-white"
                      : "bg-stone-200 text-stone-900 dark:bg-stone-800 dark:text-stone-100",
                  ].join(" ")}
                >
                  <p className="whitespace-pre-wrap break-words">{message.text}</p>
                  {message.status === "sending" ? (
                    <p className="mt-1 text-[11px] opacity-70">Отправка…</p>
                  ) : message.status === "failed" ? (
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-rose-200">
                      <span>Ошибка отправки</span>
                      <button
                        type="button"
                        onClick={() => void onRetry(message)}
                        className="rounded-full border border-rose-200 px-2 py-0.5 font-medium"
                      >
                        Повторить
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex items-center gap-2 border-t border-stone-200 px-4 py-3 dark:border-stone-800"
      >
        <input
          aria-label="Сообщение"
          value={text}
          maxLength={4_000}
          onChange={(event) => setText(event.target.value)}
          placeholder="Сообщение"
          className="min-w-0 flex-1 rounded-full border border-stone-300 bg-white px-4 py-2 text-sm dark:border-stone-700 dark:bg-stone-950"
        />
        <button
          type="submit"
          className="rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
        >
          Отправить
        </button>
      </form>
    </>
  );
}

function SettingsDialog({
  identity,
  onClose,
  onSave,
  onImportIdentity,
}: {
  identity: DeviceIdentity;
  onClose: () => void;
  onSave: (name: string, invisible: boolean) => Promise<void>;
  onImportIdentity: (text: string) => Promise<void>;
}) {
  const [name, setName] = useState(identity.name);
  const [invisible, setInvisible] = useState(identity.invisible ?? false);
  const [saveError, setSaveError] = useState(false);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    setSaveError(false);
    try {
      await onSave(name, invisible);
      onClose();
    } catch {
      setSaveError(true);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      className="fixed inset-0 z-20 flex items-center justify-center bg-stone-950/50 px-4 py-6"
    >
      <div className="max-h-full w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-stone-900">
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

        <dl className="mt-5 space-y-3 text-sm">
          <div className="flex items-center justify-between gap-4">
            <dt className="text-stone-500 dark:text-stone-400">Платформа</dt>
            <dd className="font-medium">{identity.platform}</dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-stone-500 dark:text-stone-400">Тема</dt>
            <dd className="font-medium">как в системе</dd>
          </div>
        </dl>

        <form onSubmit={handleSave} className="mt-6 border-t border-stone-200 pt-5 dark:border-stone-800">
          <label htmlFor="device-name" className="text-sm font-medium">
            Имя устройства
          </label>
          <input
            id="device-name"
            value={name}
            maxLength={64}
            onChange={(event) => setName(event.target.value)}
            className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950"
          />
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={invisible}
              onChange={(event) => setInvisible(event.target.checked)}
            />
            Невидимый режим
          </label>
          <button
            type="submit"
            className="mt-3 w-full rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
          >
            Сохранить
          </button>
          {saveError ? (
            <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">
              Не удалось сохранить имя
            </p>
          ) : null}
        </form>

        <div className="mt-6 border-t border-stone-200 pt-5 dark:border-stone-800">
          <label htmlFor="identity-export" className="text-sm font-medium">
            Экспорт identity
          </label>
          <textarea
            id="identity-export"
            readOnly
            value={serializeIdentity(identity)}
            className="mt-2 h-28 w-full resize-none rounded-xl border border-stone-300 bg-stone-50 p-3 font-mono text-xs dark:border-stone-700 dark:bg-stone-950"
          />
          <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
            В тексте есть секрет устройства. Не передавайте его посторонним.
          </p>
        </div>

        <div className="mt-6 border-t border-stone-200 pt-5 dark:border-stone-800">
          <ImportIdentityForm onImport={onImportIdentity} />
        </div>
      </div>
    </div>
  );
}

function InviteDialog({
  onClose,
  onCreate,
  onRedeem,
}: {
  onClose: () => void;
  onCreate: () => Promise<InviteResponse>;
  onRedeem: (code: string) => Promise<void>;
}) {
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    setError(null);
    try {
      const invite = await onCreate();
      setCreatedCode(invite.code);
    } catch {
      setError("Не удалось создать код");
    }
  }

  async function handleRedeem(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await onRedeem(code);
      onClose();
    } catch {
      setError("Не удалось применить код");
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="invite-title"
      className="fixed inset-0 z-20 flex items-center justify-center bg-stone-950/50 px-4 py-6"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-stone-900">
        <div className="flex items-center justify-between gap-4">
          <h2 id="invite-title" className="text-xl font-semibold">
            Код приглашения
          </h2>
          <button
            type="button"
            aria-label="Закрыть окно приглашения"
            onClick={onClose}
            className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm dark:border-stone-700"
          >
            Закрыть
          </button>
        </div>

        <button
          type="button"
          onClick={() => void handleCreate()}
          className="mt-5 w-full rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700"
        >
          Создать код
        </button>
        {createdCode ? (
          <p className="mt-3 text-center font-mono text-2xl font-semibold tracking-[0.2em]">
            Код: {createdCode}
          </p>
        ) : null}

        <form
          onSubmit={handleRedeem}
          className="mt-6 border-t border-stone-200 pt-5 dark:border-stone-800"
        >
          <label htmlFor="invite-code" className="text-sm font-medium">
            Введите код
          </label>
          <input
            id="invite-code"
            value={code}
            inputMode="numeric"
            maxLength={6}
            onChange={(event) => setCode(event.target.value)}
            className="mt-2 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 font-mono text-lg tracking-[0.3em] dark:border-stone-700 dark:bg-stone-950"
          />
          <button
            type="submit"
            className="mt-3 w-full rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-semibold hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
          >
            Применить
          </button>
        </form>

        {error ? (
          <p className="mt-3 text-sm text-rose-600 dark:text-rose-400">{error}</p>
        ) : null}
      </div>
    </div>
  );
}

function ImportIdentityForm({
  onImport,
}: {
  onImport: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [importError, setImportError] = useState(false);

  async function handleImport(event: FormEvent) {
    event.preventDefault();
    setImportError(false);
    try {
      await onImport(text);
    } catch {
      setImportError(true);
    }
  }

  return (
    <form onSubmit={handleImport}>
      <label htmlFor="identity-import" className="text-sm font-medium">
        Импорт identity
      </label>
      <textarea
        id="identity-import"
        value={text}
        onChange={(event) => setText(event.target.value)}
        className="mt-2 h-24 w-full resize-none rounded-xl border border-stone-300 bg-white p-3 font-mono text-xs dark:border-stone-700 dark:bg-stone-950"
      />
      <button
        type="submit"
        className="mt-3 w-full rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-semibold hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
      >
        Импортировать
      </button>
      {importError ? (
        <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">
          Не удалось импортировать identity
        </p>
      ) : null}
    </form>
  );
}

function errorKind(error: unknown): ErrorKind {
  if (error instanceof IdentityRejectedError) {
    return "identity";
  }
  if (error instanceof RegistrationRateLimitedError) {
    return "rate_limit";
  }
  return "generic";
}

function applyPresence(
  peers: PeersResponse,
  overrides: Record<string, boolean>,
): PeersResponse {
  const withPresence = (peer: PeerSummary): PeerSummary => ({
    ...peer,
    online: overrides[peer.id] ?? peer.online,
  });

  return {
    local: peers.local.map(withPresence),
    linked: peers.linked.map(withPresence),
    incomingRequests: peers.incomingRequests.map(withPresence),
  };
}

function onlineDotClass(peer: PeerSummary): string {
  return [
    "h-2.5 w-2.5 shrink-0 rounded-full",
    peer.online ? "bg-emerald-500" : "bg-stone-400 dark:bg-stone-600",
  ].join(" ");
}
