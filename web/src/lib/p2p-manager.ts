import type { RtcSignal } from "@dropchat/shared";

import {
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
  sendText(peerId: string, text: string): void;
  sendFile(
    peerId: string,
    file: P2PTransferFile,
    signal: AbortSignal,
    onProgress: (percent: number) => void,
  ): Promise<P2PFileMeta>;
  handleSignal(peerId: string, signal: RtcSignal): Promise<void>;
  close(): void;
}

interface IncomingFile {
  meta: P2PFileMeta;
  sink: P2PFileSink;
  received: number;
}

interface Session {
  peerId: string;
  peer: RtcSession;
  channel: P2PDataChannel | null;
  opened: Promise<P2PDataChannel>;
  resolveOpened: (channel: P2PDataChannel) => void;
  incoming: IncomingFile | null;
  queue: Promise<void>;
}

export function createP2PManager(options: {
  createSession: () => RtcSession;
  sendSignal: (peerId: string, signal: RtcSignal) => void;
  createSink: (meta: P2PFileMeta) => Promise<P2PFileSink>;
  onFileReceived: (peerId: string, meta: P2PFileMeta) => void;
  onTextReceived: (peerId: string, text: string) => void;
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
    if (frame.kind === "text" && typeof frame.text === "string") {
      options.onTextReceived(session.peerId, frame.text);
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
  }

  async function abortIncoming(session: Session): Promise<void> {
    const file = session.incoming;
    session.incoming = null;
    if (file) {
      await file.sink.abort();
    }
  }

  async function fail(session: Session, error: unknown): Promise<void> {
    await abortIncoming(session);
    options.onError?.(error);
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
      options.sendSignal(peerId, { kind: "offer", sdp: offer.sdp });
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

    sendText(peerId, text) {
      const channel = sessions.get(peerId)?.channel;
      if (!channel || channel.readyState !== "open") {
        throw new Error("p2p_not_connected");
      }
      channel.send(JSON.stringify({ kind: "text", text }));
    },

    async sendFile(peerId, file, signal, onProgress) {
      const session = getSession(peerId);
      const channel = await openChannel(peerId, signal);
      await sendFileOverP2P({
        channel,
        file,
        signal,
        onProgress,
      });
      bindChannel(session, channel);
      return {
        name: file.name,
        size: file.size,
        mime: file.type || "application/octet-stream",
      };
    },

    async handleSignal(peerId, signal) {
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
    typeof frame.mime !== "string" ||
    frame.mime.length === 0
  ) {
    throw new Error("invalid_p2p_metadata");
  }
  return { name: frame.name, size: frame.size, mime: frame.mime };
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
