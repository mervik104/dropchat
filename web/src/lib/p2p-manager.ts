import { isRtcSignal, type RtcSignal } from "@dropchat/shared";

import {
  MAX_P2P_FILE_SIZE,
  sendFileOverP2P,
  type P2PDataChannel,
  type P2PFileMeta,
  type P2PFileSink,
  type P2PTransferFile,
} from "./p2p";

export interface RtcDescription {
  type: "offer" | "answer";
  sdp: string;
}

export interface RtcSession {
  createOffer(): Promise<RtcDescription>;
  createAnswer(): Promise<RtcDescription>;
  setLocalDescription(description: RtcDescription): Promise<void>;
  setRemoteDescription(description: RtcDescription): Promise<void>;
  addIceCandidate(candidate: {
    candidate: string;
    sdpMid: string | null;
    sdpMLineIndex: number | null;
  }): Promise<void>;
  createDataChannel(label: string): P2PDataChannel;
  onicecandidate:
    | ((event: {
        candidate: {
          candidate: string;
          sdpMid: string | null;
          sdpMLineIndex: number | null;
        } | null;
      }) => void)
    | null;
  ondatachannel: ((event: { channel: P2PDataChannel }) => void) | null;
  close(): void;
}

export interface P2PManager {
  ensureConnection(peerId: string): Promise<void>;
  hasOpenChannel(peerId: string): boolean;
  sendText(peerId: string, text: string, id: string): Promise<void>;
  sendFile(
    peerId: string,
    file: P2PTransferFile,
    signal: AbortSignal,
    onProgress: (percent: number) => void,
    onConnected?: () => void,
    id?: string,
  ): Promise<P2PFileMeta>;
  handleSignal(peerId: string, signal: RtcSignal): Promise<void>;
  close(): void;
}

interface IncomingFile {
  meta: P2PFileMeta;
  sink: P2PFileSink;
  received: number;
}

interface PendingAck {
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
  settled: boolean;
}

interface Session {
  peerId: string;
  peer: RtcSession;
  channel: P2PDataChannel | null;
  opened: Promise<P2PDataChannel>;
  resolveOpened: (channel: P2PDataChannel) => void;
  incoming: IncomingFile | null;
  pendingAcks: Map<string, PendingAck>;
  queue: Promise<void>;
}

const TEXT_ACK_TIMEOUT_MS = 3_000;
const FILE_ACK_TIMEOUT_MS = 5_000;

export function createP2PManager(options: {
  createSession: () => RtcSession;
  sendSignal: (peerId: string, signal: RtcSignal) => void;
  createSink: (meta: P2PFileMeta) => Promise<P2PFileSink>;
  onFileReceived: (peerId: string, meta: P2PFileMeta) => void;
  onTextReceived: (peerId: string, text: string, id?: string) => void;
  onError?: (error: unknown) => void;
  localDeviceId?: string;
}): P2PManager {
  const sessions = new Map<string, Session>();

  function createSession(peerId: string): Session {
    const peer = options.createSession();
    let resolveOpened!: (channel: P2PDataChannel) => void;
    const opened = new Promise<P2PDataChannel>((resolve) => {
      resolveOpened = resolve;
    });
    const session: Session = {
      peerId,
      peer,
      channel: null,
      opened,
      resolveOpened,
      incoming: null,
      pendingAcks: new Map(),
      queue: Promise.resolve(),
    };

    peer.onicecandidate = (event) => {
      const candidate = event.candidate;
      if (!candidate) {
        return;
      }
      options.sendSignal(peerId, { kind: "ice", ...candidate });
    };
    peer.ondatachannel = (event) => {
      attachChannel(session, event.channel);
    };

    sessions.set(peerId, session);
    return session;
  }

  function attachChannel(session: Session, channel: P2PDataChannel): void {
    session.channel = channel;
    if (channel.readyState === "open") {
      session.resolveOpened(channel);
    } else {
      channel.onopen = () => session.resolveOpened(channel);
    }
    bindChannel(session, channel);
  }

  function bindChannel(session: Session, channel: P2PDataChannel): void {
    channel.onmessage = (event) => {
      session.queue = session.queue
        .then(() => handleData(session, event.data))
        .catch((error: unknown) => fail(session, error));
    };
    channel.onerror = () =>
      fail(session, new Error("p2p_channel_error"));
    channel.onclose = () => {
      session.channel = null;
      rejectAcks(session, new Error("p2p_channel_closed"));
      void abortIncoming(session);
    };
  }

  async function handleData(
    session: Session,
    data: string | ArrayBuffer,
  ): Promise<void> {
    if (typeof data === "string") {
      await handleFrame(session, data);
      return;
    }

    const incoming = session.incoming;
    if (!incoming) {
      throw new Error("p2p_unexpected_chunk");
    }
    const chunk = new Uint8Array(data);
    if (incoming.received + chunk.byteLength > incoming.meta.size) {
      throw new Error("p2p_size_mismatch");
    }
    await incoming.sink.write(chunk);
    incoming.received += chunk.byteLength;
    if (incoming.received === incoming.meta.size) {
      await finishIncoming(session, incoming);
    }
  }

  async function handleFrame(
    session: Session,
    value: string,
  ): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      return;
    }
    if (typeof parsed !== "object" || parsed === null) {
      return;
    }

    const frame = parsed as Record<string, unknown>;
    if (frame.kind === "ack" && typeof frame.id === "string") {
      settleAck(session, frame.id);
      return;
    }

    if (frame.kind === "text" && typeof frame.text === "string") {
      const id = typeof frame.id === "string" ? frame.id : undefined;
      options.onTextReceived(session.peerId, frame.text, id);
      if (id && session.channel) {
        session.channel.send(JSON.stringify({ kind: "ack", id }));
      }
      return;
    }

    if (frame.kind === "meta") {
      if (session.incoming) {
        throw new Error("p2p_file_in_progress");
      }
      const meta = parseMeta(frame);
      session.incoming = {
        meta,
        sink: await options.createSink(meta),
        received: 0,
      };
      return;
    }

    if (frame.kind === "done" && session.incoming) {
      await finishIncoming(session, session.incoming);
    }
  }

  async function finishIncoming(
    session: Session,
    file: IncomingFile,
  ): Promise<void> {
    session.incoming = null;
    await file.sink.close();
    options.onFileReceived(session.peerId, file.meta);
    if (file.meta.id && session.channel) {
      session.channel.send(
        JSON.stringify({ kind: "ack", id: file.meta.id }),
      );
    }
  }

  async function abortIncoming(session: Session): Promise<void> {
    const file = session.incoming;
    session.incoming = null;
    if (file) {
      await file.sink.abort();
    }
  }

  async function fail(session: Session, error: unknown): Promise<void> {
    rejectAcks(session, error);
    await abortIncoming(session);
    options.onError?.(error);
  }

  function rejectAcks(session: Session, error: unknown): void {
    for (const pending of session.pendingAcks.values()) {
      clearTimeout(pending.timer);
      pending.settled = true;
      pending.reject(error);
    }
    session.pendingAcks.clear();
  }

  function createPendingAck(session: Session, id: string): PendingAck {
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<void>((resolveAck, rejectAck) => {
      resolve = resolveAck;
      reject = rejectAck;
    });
    const pending: PendingAck = {
      promise,
      resolve,
      reject,
      timer: setTimeout(() => undefined, 0),
      settled: false,
    };
    session.pendingAcks.set(id, pending);
    return pending;
  }

  function armAck(
    session: Session,
    id: string,
    pending: PendingAck,
    timeoutMs: number,
  ): void {
    clearTimeout(pending.timer);
    pending.timer = setTimeout(() => {
      pending.settled = true;
      session.pendingAcks.delete(id);
      pending.reject(new Error("p2p_ack_timeout"));
    }, timeoutMs);
  }

  function settleAck(session: Session, id: string): void {
    const pending = session.pendingAcks.get(id);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timer);
    pending.settled = true;
    session.pendingAcks.delete(id);
    pending.resolve();
  }

  function cancelAck(session: Session, id: string): void {
    const pending = session.pendingAcks.get(id);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timer);
    pending.settled = true;
    session.pendingAcks.delete(id);
    pending.resolve();
  }

  function getSession(peerId: string): Session {
    return sessions.get(peerId) ?? createSession(peerId);
  }

  function closeSession(peerId: string): void {
    const session = sessions.get(peerId);
    if (!session) {
      return;
    }
    sessions.delete(peerId);
    rejectAcks(session, new Error("p2p_session_closed"));
    session.peer.close();
  }

  async function openChannel(
    peerId: string,
    signal: AbortSignal,
  ): Promise<P2PDataChannel> {
    const session = getSession(peerId);
    let channel = session.channel;
    if (!channel) {
      channel = session.peer.createDataChannel("dropchat-file");
      attachChannel(session, channel);
      const offer = await session.peer.createOffer();
      await session.peer.setLocalDescription(offer);
      try {
        options.sendSignal(peerId, { kind: "offer", sdp: offer.sdp });
      } catch (error) {
        closeSession(peerId);
        throw error;
      }
    }

    return waitForOpen(channel, session.opened, signal);
  }

  return {
    async ensureConnection(peerId) {
      if (this.hasOpenChannel(peerId)) {
        return;
      }
      if (
        options.localDeviceId !== undefined &&
        options.localDeviceId > peerId
      ) {
        return;
      }
      await openChannel(peerId, new AbortController().signal);
    },

    hasOpenChannel(peerId) {
      return sessions.get(peerId)?.channel?.readyState === "open";
    },

    async sendText(peerId, text, id) {
      const session = sessions.get(peerId);
      const channel = session?.channel;
      if (!session || !channel || channel.readyState !== "open") {
        throw new Error("p2p_not_connected");
      }

      const pending = createPendingAck(session, id);
      armAck(session, id, pending, TEXT_ACK_TIMEOUT_MS);
      try {
        channel.send(JSON.stringify({ kind: "text", text, id }));
      } catch (error) {
        cancelAck(session, id);
        throw error;
      }
      return pending.promise;
    },

    async sendFile(peerId, file, signal, onProgress, onConnected, id) {
      if (file.size > MAX_P2P_FILE_SIZE) {
        throw new Error("p2p_file_too_large");
      }
      const session = getSession(peerId);
      const channel = await openChannel(peerId, signal);
      onConnected?.();
      const pending = id ? createPendingAck(session, id) : null;
      try {
        await sendFileOverP2P({
          channel,
          file,
          signal,
          onProgress,
          id,
        });
        if (pending && id) {
          if (!pending.settled) {
            armAck(session, id, pending, FILE_ACK_TIMEOUT_MS);
          }
          await pending.promise;
        }
      } catch (error) {
        if (id) {
          cancelAck(session, id);
        }
        throw error;
      }
      bindChannel(session, channel);
      return {
        ...(id ? { id } : {}),
        name: file.name,
        size: file.size,
        mime: file.type || "application/octet-stream",
      };
    },

    async handleSignal(peerId, signal) {
      if (!isRtcSignal(signal)) {
        return;
      }
      if (signal.kind === "ice") {
        const session = sessions.get(peerId);
        if (!session) {
          return;
        }
        await session.peer.addIceCandidate({
          candidate: signal.candidate,
          sdpMid: signal.sdpMid,
          sdpMLineIndex: signal.sdpMLineIndex,
        });
        return;
      }

      if (signal.kind === "answer") {
        const session = sessions.get(peerId);
        if (!session) {
          return;
        }
        await session.peer.setRemoteDescription({
          type: "answer",
          sdp: signal.sdp,
        });
        return;
      }

      closeSession(peerId);
      const session = createSession(peerId);
      await session.peer.setRemoteDescription({
        type: "offer",
        sdp: signal.sdp,
      });
      const answer = await session.peer.createAnswer();
      await session.peer.setLocalDescription(answer);
      options.sendSignal(peerId, { kind: "answer", sdp: answer.sdp });
    },

    close() {
      for (const peerId of [...sessions.keys()]) {
        closeSession(peerId);
      }
    },
  };
}

function parseMeta(frame: Record<string, unknown>): P2PFileMeta {
  if (
    typeof frame.name !== "string" ||
    frame.name.length === 0 ||
    typeof frame.size !== "number" ||
    !Number.isInteger(frame.size) ||
    frame.size <= 0 ||
    frame.size > MAX_P2P_FILE_SIZE ||
    typeof frame.mime !== "string" ||
    frame.mime.length === 0
  ) {
    throw new Error("invalid_p2p_metadata");
  }
  const id = frame.id;
  if (
    id !== undefined &&
    (typeof id !== "string" || !/^[A-Za-z0-9_-]{8,128}$/.test(id))
  ) {
    throw new Error("invalid_p2p_metadata");
  }
  return {
    ...(typeof id === "string" ? { id } : {}),
    name: frame.name,
    size: frame.size,
    mime: frame.mime,
  };
}

function waitForOpen(
  channel: P2PDataChannel,
  opened: Promise<P2PDataChannel>,
  signal: AbortSignal,
): Promise<P2PDataChannel> {
  if (signal.aborted) {
    channel.close();
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }

  return new Promise<P2PDataChannel>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      channel.close();
      reject(new DOMException("Aborted", "AbortError"));
    };
    const cleanup = () => {
      signal.removeEventListener("abort", onAbort);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    void opened.then((openChannel) => {
      cleanup();
      resolve(openChannel);
    });
  });
}
