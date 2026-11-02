import { useEffect, useRef, useState } from "react";

import type {
  ChatMessage,
  PeerSummary,
  PeersResponse,
} from "@dropchat/shared";

import type {
  AppProps,
  ConnectionState,
  ErrorKind,
  LoadState,
  UploadState,
} from "../app/types";
import {
  createIncomingText,
  createLocalFileMessage,
  createOptimisticText,
  createOutgoingLocalText,
  mergeMessages,
  peerIdForMessage,
  replaceMessage,
  setMessageStatus,
  upsertMessage,
} from "../lib/messages";
import type { P2PManager } from "../lib/p2p-manager";
import type { RealtimeConnection } from "../lib/socket";
import { transferWithMode } from "../lib/transfer-mode";
import {
  IdentityRejectedError,
  RegistrationRateLimitedError,
  type Workspace,
} from "../lib/workspace";

const EMPTY_PEERS: PeersResponse = {
  local: [],
  linked: [],
  incomingRequests: [],
};

export function useMessengerApp({
  loadWorkspace,
  loadCachedWorkspace,
  saveProfile,
  resetIdentity,
  importIdentity,
  loadMessages,
  sendText,
  connectRealtime,
  refreshPeers,
  requestPeer,
  respondPeer,
  redeemInvite,
  unlinkPeer,
  uploadFile,
  sendP2PFileMeta,
  createP2PManager,
  localMessageStore,
  downloadFile,
  openUrl,
  createLocalId,
  now,
}: AppProps) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [chatMenuOpen, setChatMenuOpen] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [uploadState, setUploadState] = useState<UploadState | null>(null);
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
  const [p2pReady, setP2pReady] = useState(0);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("connecting");
  const connectionRef = useRef<RealtimeConnection | null>(null);
  const managerRef = useRef<P2PManager | null>(null);
  const uploadControllerRef = useRef<AbortController | null>(null);
  const selectedPeerIdRef = useRef<string | null>(null);

  function applyPeers(next: PeersResponse): void {
    setPeersOverride(next);
    setMessagesByPeer((current) => {
      const copy = { ...current };
      for (const peer of [
        ...next.local,
        ...next.incomingRequests,
        ...next.linked,
      ]) {
        copy[peer.id] ??= [];
      }
      return copy;
    });
  }

  function applyWorkspace(workspace: Workspace): void {
    const local = localMessageStore.load(workspace.identity.deviceId, now());
    setMessagesByPeer((current) => {
      const next = { ...current };
      for (const peer of workspace.peers.linked) {
        next[peer.id] = mergeMessages(
          current[peer.id] ?? [],
          local[peer.id] ?? [],
        );
      }
      return next;
    });
    setNextBeforeByPeer((current) => {
      const next = { ...current };
      for (const peer of workspace.peers.linked) {
        next[peer.id] = current[peer.id] ?? null;
      }
      return next;
    });
    setPeersOverride(null);
    setState({ status: "ready", workspace });
  }

  function start() {
    setState({ status: "loading" });
    setSelectedPeerId(null);
    setSettingsOpen(false);
    setInviteOpen(false);
    setSentRequests({});
    setChatMenuOpen(false);
    setNotification(null);
    uploadControllerRef.current?.abort();
    uploadControllerRef.current = null;
    setUploadState(null);
    setMessagesByPeer({});
    setNextBeforeByPeer({});
    setLoadingMessagesFor(null);
    setMessagesErrorFor(null);
    setOnlineOverrides({});
    setPeersOverride(null);
    setConnectionState("connecting");

    void (async () => {
      const cached = await loadCachedWorkspace().catch(() => null);

      if (cached) {
        applyWorkspace(cached);
        try {
          const workspace = await loadWorkspace();
          applyWorkspace(workspace);
        } catch {
          setConnectionState("local");
          setNotification(
            "Нет связи с сервером — доступна только локальная передача",
          );
        }
        return;
      }

      try {
        const workspace = await loadWorkspace();
        applyWorkspace(workspace);
      } catch (error) {
        setConnectionState("local");
        setState({ status: "error", kind: errorKind(error) });
      }
    })();
  }

  useEffect(() => {
    start();
  }, [loadWorkspace, loadCachedWorkspace]);

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
          [peerId]: mergeMessages(current[peerId]!, page.messages),
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
        applyPeers(await refreshPeers(readyIdentity!));
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
          [peerId]: mergeMessages(current[peerId]!, page.messages),
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

        if (event.type === "peer.linked") {
          setNotification(`Устройство ${event.peer.name} подключилось`);
          void refreshPeers(readyIdentity)
            .then(applyPeers)
            .catch(() => undefined);
          return;
        }

        if (event.type === "peer.request") {
          void refreshPeers(readyIdentity)
            .then(applyPeers)
            .catch(() => undefined);
          return;
        }

        if (event.type === "signal") {
          void managerRef.current
            ?.handleSignal(event.fromDeviceId, event.signal)
            .catch(() => undefined);
          return;
        }

        const peerId = peerIdForMessage(readyIdentity.deviceId, event.message);
        setMessagesByPeer((current) => ({
          ...current,
          [peerId]: upsertMessage(current[peerId] ?? [], event.message),
        }));
      },
      () => {
        setConnectionState("online");
        void refreshAfterReconnect();
        const peerId = selectedPeerIdRef.current;
        if (peerId) {
          void managerRef.current
            ?.ensureConnection(peerId)
            .catch(() => undefined);
        }
      },
    )
      .then((connection) => {
        connectionRef.current = connection;
        setConnectionState("online");
        managerRef.current = createP2PManager({
          sendSignal: (peerId, signal) =>
            connection.sendSignal(peerId, signal),
          localDeviceId: readyIdentity!.deviceId,
          onFileReceived: (peerId, meta) => {
            setNotification(`Файл «${meta.name}» получен`);
            addLocalMessage(
              peerId,
              createLocalFileMessage({
                identity: readyIdentity!,
                peerId,
                meta,
                direction: "in",
                id: createLocalId(),
                now: now(),
              }),
            );
          },
          onTextReceived: (peerId, text) => {
            addLocalMessage(
              peerId,
              createIncomingText({
                identity: readyIdentity!,
                peerId,
                text,
                id: createLocalId(),
                now: now(),
              }),
            );
          },
        });
        setP2pReady((current) => current + 1);
        const peerId = selectedPeerIdRef.current;
        if (peerId) {
          void managerRef.current
            ?.ensureConnection(peerId)
            .catch(() => undefined);
        }
      })
      .catch(() => {
        setConnectionState("local");
      });

    return () => {
      managerRef.current?.close();
      managerRef.current = null;
      connectionRef.current?.close();
      connectionRef.current = null;
    };
  }, [
    readyIdentity?.deviceId,
    connectRealtime,
    createP2PManager,
    createLocalId,
    now,
    refreshPeers,
    loadMessages,
  ]);

  useEffect(() => {
    if (!readyIdentity) {
      return;
    }

    const interval = window.setInterval(() => {
      void refreshPeers(readyIdentity)
        .then(applyPeers)
        .catch(() => undefined);
    }, 5_000);

    return () => window.clearInterval(interval);
  }, [readyIdentity?.deviceId, refreshPeers]);

  useEffect(() => {
    if (!selectedPeerId || p2pReady === 0) {
      return;
    }
    void managerRef
      .current?.ensureConnection(selectedPeerId)
      .catch(() => undefined);
  }, [selectedPeerId, p2pReady]);

  const basePeers =
    state.status === "ready"
      ? peersOverride ?? state.workspace.peers
      : EMPTY_PEERS;
  const peers = applyPresence(basePeers, onlineOverrides);
  const selectedPeer = peers.linked.find((peer) => peer.id === selectedPeerId);

  function addLocalMessage(peerId: string, message: ChatMessage): void {
    localMessageStore.append(readyIdentity!.deviceId, peerId, message);
    setMessagesByPeer((current) => ({
      ...current,
      [peerId]: upsertMessage(current[peerId] ?? [], message),
    }));
  }

  async function handleImportIdentity(text: string) {
    await importIdentity(text);
    start();
  }

  async function handleResetIdentity() {
    await resetIdentity();
    start();
  }

  async function handleSaveProfile(name: string, invisible: boolean) {
    const profile = await saveProfile(readyIdentity!, {
      name,
      invisible,
    });
    setState({
      status: "ready",
      workspace: {
        identity: {
          ...readyIdentity!,
          name: profile.name,
          invisible: profile.invisible,
        },
        peers: basePeers,
      },
    });
  }

  async function reloadPeers(): Promise<void> {
    try {
      applyPeers(await refreshPeers(readyIdentity!));
    } catch {
      // Keep the last known peer list; reconnect/events will retry.
    }
  }

  async function sendPeerRequest(peerId: string): Promise<void> {
    setSentRequests((current) => ({ ...current, [peerId]: true }));
    try {
      await requestPeer(readyIdentity!, peerId);
    } catch {
      setSentRequests((current) => ({ ...current, [peerId]: false }));
    }
  }

  async function respondToRequest(
    fromDeviceId: string,
    accept: boolean,
  ): Promise<void> {
    await respondPeer(readyIdentity!, fromDeviceId, accept);
    await reloadPeers();
  }

  async function redeemInviteCode(code: string): Promise<void> {
    await redeemInvite(readyIdentity!, code);
    await reloadPeers();
  }

  async function handleUpload(file: File, peerId: string): Promise<void> {
    const controller = new AbortController();
    uploadControllerRef.current = controller;
    setUploadState({
      peerId,
      name: file.name,
      percent: 0,
      error: false,
      status: "connecting",
    });

    const onProgress = (percent: number) => {
      setUploadState((current) => ({ ...current!, percent }));
    };

    try {
      const message = await transferWithMode("auto", {
        startP2P: async (signal, onConnected) => {
          const manager = managerRef.current;
          if (!manager) {
            throw new Error("p2p_unavailable");
          }
          const meta = await manager.sendFile(
            peerId,
            file,
            signal,
            onProgress,
            onConnected,
          );
          try {
            return await sendP2PFileMeta(readyIdentity!, peerId, meta);
          } catch {
            const message = createLocalFileMessage({
              identity: readyIdentity!,
              peerId,
              meta,
              direction: "out",
              id: createLocalId(),
              now: now(),
            });
            localMessageStore.append(readyIdentity!.deviceId, peerId, message);
            return message;
          }
        },
        startCloud: () =>
          uploadFile(
            readyIdentity!,
            file,
            peerId,
            onProgress,
            controller.signal,
          ),
        onStatus: (status) => {
          setUploadState((current) => ({
            ...current!,
            status,
            percent:
              status === "fallback" || status === "cloud"
                ? 0
                : current!.percent,
          }));
        },
        signal: controller.signal,
      });
      setMessagesByPeer((current) => ({
        ...current,
        [peerId]: upsertMessage(current[peerId]!, message),
      }));
      setUploadState(null);
    } catch {
      if (controller.signal.aborted) {
        setUploadState(null);
      } else {
        setUploadState((current) => ({ ...current!, error: true }));
      }
    } finally {
      if (uploadControllerRef.current === controller) {
        uploadControllerRef.current = null;
      }
    }
  }

  function cancelUpload(): void {
    uploadControllerRef.current?.abort();
    uploadControllerRef.current = null;
    setUploadState(null);
  }

  async function handleDownload(fileId: string): Promise<void> {
    try {
      const { url } = await downloadFile(readyIdentity!, fileId);
      openUrl(url);
    } catch {
      setNotification("Не удалось скачать файл");
    }
  }

  async function unlinkChat(peerId: string): Promise<void> {
    try {
      await unlinkPeer(readyIdentity!, peerId);
      setSelectedPeerId(null);
      setChatMenuOpen(false);
      await reloadPeers();
    } catch {
      setNotification("Не удалось отвязать устройство");
      throw new Error("unlink_failed");
    }
  }

  async function deliverMessage(
    peerId: string,
    text: string,
    clientId: string,
    createdAt: number,
  ): Promise<void> {
    const manager = managerRef.current;
    if (manager?.hasOpenChannel(peerId)) {
      try {
        await manager.sendText(peerId, text, clientId);
        addLocalMessage(
          peerId,
          createOutgoingLocalText({
            identity: readyIdentity!,
            peerId,
            text,
            id: clientId,
            now: createdAt,
          }),
        );
        return;
      } catch {
        // Fall through to the internet path.
      }
    }

    try {
      const saved = await sendText(
        readyIdentity!,
        peerId,
        text,
        clientId,
      );
      setMessagesByPeer((current) => ({
        ...current,
        [peerId]: replaceMessage(current[peerId]!, clientId, saved),
      }));
    } catch {
      const fallback = managerRef.current;
      if (fallback && !fallback.hasOpenChannel(peerId)) {
        try {
          await Promise.race([
            fallback.ensureConnection(peerId),
            new Promise<void>((resolve) => setTimeout(resolve, 3_000)),
          ]);
        } catch {
          // No local channel either; mark the message as failed below.
        }
      }

      if (fallback?.hasOpenChannel(peerId)) {
        try {
          await fallback.sendText(peerId, text, clientId);
          addLocalMessage(
            peerId,
            createOutgoingLocalText({
              identity: readyIdentity!,
              peerId,
              text,
              id: clientId,
              now: createdAt,
            }),
          );
          return;
        } catch {
          // Fall through to the failed state.
        }
      }

      setMessagesByPeer((current) => ({
        ...current,
        [peerId]: setMessageStatus(current[peerId]!, clientId, "failed"),
      }));
    }
  }

  async function sendMessage(peerId: string, text: string): Promise<void> {
    const optimistic = createOptimisticText({
      identity: readyIdentity!,
      peerId,
      text,
      id: createLocalId(),
      now: now(),
    });
    setMessagesByPeer((current) => ({
      ...current,
      [peerId]: upsertMessage(current[peerId]!, optimistic),
    }));

    await deliverMessage(peerId, text, optimistic.id, optimistic.createdAt);
  }

  async function retryMessage(
    peerId: string,
    message: ChatMessage,
  ): Promise<void> {
    setMessagesByPeer((current) => ({
      ...current,
      [peerId]: setMessageStatus(current[peerId]!, message.id, "sending"),
    }));
    await deliverMessage(
      peerId,
      message.text!,
      message.id,
      message.createdAt,
    );
  }

  async function loadOlderMessages(peerId: string, before: string) {
    setLoadingMessagesFor(peerId);
    setMessagesErrorFor(null);
    try {
      const page = await loadMessages(
        readyIdentity!,
        peerId,
        before,
      );
      setMessagesByPeer((current) => ({
        ...current,
        [peerId]: mergeMessages(current[peerId]!, page.messages),
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

  return {
    state,
    peers,
    selectedPeer,
    connectionState,
    selectedPeerId,
    settingsOpen,
    inviteOpen,
    chatMenuOpen,
    notification,
    uploadState,
    sentRequests,
    messagesByPeer,
    nextBeforeByPeer,
    loadingMessagesFor,
    messagesErrorFor,
    setSelectedPeerId,
    setSettingsOpen,
    setInviteOpen,
    setChatMenuOpen,
    setNotification,
    start,
    handleImportIdentity,
    handleResetIdentity,
    handleSaveProfile,
    reloadPeers,
    sendPeerRequest,
    respondToRequest,
    redeemInviteCode,
    handleUpload,
    cancelUpload,
    handleDownload,
    unlinkChat,
    sendMessage,
    retryMessage,
    loadOlderMessages,
  };
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
