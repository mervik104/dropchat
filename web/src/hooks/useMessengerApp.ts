import { useEffect, useRef, useState } from "react";

import type {
  ChatMessage,
  PeerSummary,
  PeersResponse,
} from "@dropchat/shared";

import type {
  AppProps,
  ErrorKind,
  LoadState,
  UploadState,
} from "../app/types";
import {
  createIncomingText,
  createLocalFileMessage,
  createOptimisticText,
  mergeMessages,
  peerIdForMessage,
  replaceMessage,
  setMessageStatus,
  upsertMessage,
} from "../lib/messages";
import type { P2PManager } from "../lib/p2p-manager";
import type { RealtimeConnection } from "../lib/socket";
import {
  transferWithMode,
  type TransferMode,
} from "../lib/transfer-mode";
import {
  IdentityRejectedError,
  RegistrationRateLimitedError,
} from "../lib/workspace";

const EMPTY_PEERS: PeersResponse = {
  local: [],
  linked: [],
  incomingRequests: [],
};

export function useMessengerApp({
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
  redeemInvite,
  unlinkPeer,
  blockPeer,
  uploadFile,
  sendP2PFileMeta,
  createP2PManager,
  modeStore,
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
  const [modes, setModes] = useState<Record<string, TransferMode>>({});
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
  const connectionRef = useRef<RealtimeConnection | null>(null);
  const managerRef = useRef<P2PManager | null>(null);
  const uploadControllerRef = useRef<AbortController | null>(null);
  const selectedPeerIdRef = useRef<string | null>(null);

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

        if (event.type === "peer.linked") {
          setNotification(`Устройство ${event.peer.name} подключилось`);
          void refreshPeers(readyIdentity)
            .then((next) => setPeersOverride(next))
            .catch(() => undefined);
          return;
        }

        if (event.type === "peer.request") {
          void refreshPeers(readyIdentity)
            .then((next) => setPeersOverride(next))
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
          [peerId]: upsertMessage(current[peerId], event.message),
        }));
      },
      () => {
        void refreshAfterReconnect();
      },
    )
      .then((connection) => {
        connectionRef.current = connection;
        managerRef.current = createP2PManager({
          sendSignal: (peerId, signal) =>
            connection.sendSignal(peerId, signal),
          localDeviceId: readyIdentity!.deviceId,
          onFileReceived: (peerId, meta) => {
            setNotification(`Файл «${meta.name}» получен`);
            const message = createLocalFileMessage({
              identity: readyIdentity!,
              peerId,
              meta,
              direction: "in",
              id: createLocalId(),
              now: now(),
            });
            setMessagesByPeer((current) => ({
              ...current,
              [peerId]: upsertMessage(current[peerId], message),
            }));
          },
          onTextReceived: (peerId, text) => {
            const message = createIncomingText({
              identity: readyIdentity!,
              peerId,
              text,
              id: createLocalId(),
              now: now(),
            });
            setMessagesByPeer((current) => ({
              ...current,
              [peerId]: upsertMessage(current[peerId], message),
            }));
          },
        });
        setP2pReady((current) => current + 1);
      })
      .catch(() => undefined);

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
        .then((next) => setPeersOverride(next))
        .catch(() => undefined);
    }, 5_000);

    return () => window.clearInterval(interval);
  }, [readyIdentity?.deviceId, refreshPeers]);

  useEffect(() => {
    if (!selectedPeerId || p2pReady === 0) {
      return;
    }
    const mode = modes[selectedPeerId] ?? modeStore.get(selectedPeerId);
    if (mode === "cloud") {
      return;
    }
    void managerRef
      .current?.ensureConnection(selectedPeerId)
      .catch(() => undefined);
  }, [selectedPeerId, p2pReady, modes, modeStore]);

  const basePeers =
    state.status === "ready"
      ? peersOverride ?? state.workspace.peers
      : EMPTY_PEERS;
  const peers = applyPresence(basePeers, onlineOverrides);
  const selectedPeer = peers.linked.find((peer) => peer.id === selectedPeerId);

  function modeFor(peerId: string): TransferMode {
    return modes[peerId] ?? modeStore.get(peerId);
  }

  function changeMode(peerId: string, mode: TransferMode): void {
    modeStore.set(peerId, mode);
    setModes((current) => ({ ...current, [peerId]: mode }));
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
      setPeersOverride(await refreshPeers(readyIdentity!));
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
    const mode = modeFor(peerId);
    uploadControllerRef.current = controller;
    setUploadState({
      peerId,
      name: file.name,
      percent: 0,
      error: false,
      status:
        mode === "cloud" ? "cloud" : mode === "local" ? "local" : "connecting",
    });

    const onProgress = (percent: number) => {
      setUploadState((current) => ({ ...current!, percent }));
    };

    try {
      const message = await transferWithMode(mode, {
        startP2P: async (signal) => {
          const manager = managerRef.current;
          if (!manager) {
            throw new Error("p2p_unavailable");
          }
          const meta = await manager.sendFile(peerId, file, signal, onProgress);
          try {
            return await sendP2PFileMeta(readyIdentity!, peerId, meta);
          } catch {
            return createLocalFileMessage({
              identity: readyIdentity!,
              peerId,
              meta,
              direction: "out",
              id: createLocalId(),
              now: now(),
            });
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
        [peerId]: upsertMessage(current[peerId], message),
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
    await unlinkPeer(readyIdentity!, peerId);
    setSelectedPeerId(null);
    setChatMenuOpen(false);
    await reloadPeers();
  }

  async function blockChat(peerId: string): Promise<void> {
    await blockPeer(readyIdentity!, peerId);
    setSelectedPeerId(null);
    setChatMenuOpen(false);
    await reloadPeers();
  }

  async function deliverMessage(
    peerId: string,
    text: string,
    clientId: string,
  ): Promise<void> {
    try {
      const saved = await sendText(
        readyIdentity!,
        peerId,
        text,
        clientId,
      );
      setMessagesByPeer((current) => ({
        ...current,
        [peerId]: replaceMessage(current[peerId], clientId, saved),
      }));
    } catch {
      const manager = managerRef.current;
      if (manager?.hasOpenChannel(peerId)) {
        try {
          manager.sendText(peerId, text);
          setMessagesByPeer((current) => ({
            ...current,
            [peerId]: setMessageStatus(current[peerId], clientId, "sent"),
          }));
          return;
        } catch {
          // Fall through to the failed state.
        }
      }
      setMessagesByPeer((current) => ({
        ...current,
        [peerId]: setMessageStatus(current[peerId], clientId, "failed"),
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
      const page = await loadMessages(
        readyIdentity!,
        peerId,
        before,
      );
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

  return {
    state,
    peers,
    selectedPeer,
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
    modeFor,
    changeMode,
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
    blockChat,
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
