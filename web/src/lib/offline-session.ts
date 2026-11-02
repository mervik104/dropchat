import {
  sendFileOverP2P,
  type P2PDataChannel,
  type P2PFileMeta,
  type P2PFileSink,
  type P2PTransferFile,
} from "./p2p";
import {
  decodeOfflineSignal,
  encodeOfflineSignal,
  type OfflineSignal,
} from "./offline-code";

export interface OfflineRtcSession {
  createOffer(): Promise<{ type: "offer"; sdp: string }>;
  createAnswer(): Promise<{ type: "answer"; sdp: string }>;
  setLocalDescription(description: OfflineSignal): Promise<void>;
  setRemoteDescription(description: OfflineSignal): Promise<void>;
  createDataChannel(label: string): P2PDataChannel;
  getLocalDescription(): OfflineSignal | null;
  iceGatheringState: "new" | "gathering" | "complete";
  onicegatheringstatechange: (() => void) | null;
  ondatachannel: ((event: { channel: P2PDataChannel }) => void) | null;
  close(): void;
}

export interface OfflineSessionEvents {
  onOpen?: () => void;
  onText?: (text: string) => void;
  onFile?: (meta: P2PFileMeta) => void;
  onError?: (error: unknown) => void;
  onClose?: () => void;
}

export interface OfflineSession {
  createOfferCode(): Promise<string>;
  acceptAnswerCode(code: string): Promise<void>;
  joinWithOfferCode(code: string): Promise<string>;
  waitForConnection(): Promise<void>;
  sendText(text: string): Promise<void>;
  sendFile(
    file: P2PTransferFile,
    onProgress: (percent: number) => void,
  ): Promise<void>;
  close(): void;
}

interface IncomingFile {
  meta: P2PFileMeta;
  sink: P2PFileSink;
  received: number;
}

const DEFAULT_ICE_TIMEOUT_MS = 5_000;

export function createOfflineSession(
  options: OfflineSessionEvents & {
    createSession: () => OfflineRtcSession;
    createSink: (meta: P2PFileMeta) => Promise<P2PFileSink>;
    iceTimeoutMs?: number;
  },
): OfflineSession {
  let current: OfflineRtcSession | null = null;
  let channel: P2PDataChannel | null = null;
  let incoming: IncomingFile | null = null;
  let opened = false;
  let closed = false;
  let queue = Promise.resolve();
  let openResolve!: () => void;
  const openPromise = new Promise<void>((resolve) => {
    openResolve = resolve;
  });

  function getSession(): OfflineRtcSession {
    if (closed) {
      throw new Error("offline_closed");
    }
    if (!current) {
      current = options.createSession();
      current.ondatachannel = (event) => attachChannel(event.channel);
    }
    return current;
  }

  function attachChannel(next: P2PDataChannel): void {
    channel = next;
    next.onopen = () => {
      if (closed) {
        return;
      }
      opened = true;
      openResolve();
      options.onOpen?.();
    };
    next.onmessage = (event) => {
      queue = queue
        .then(() => handleData(event.data))
        .catch((error: unknown) => fail(error));
    };
    next.onerror = () => fail(new Error("offline_channel_error"));
    next.onclose = () => {
      if (!closed) {
        options.onClose?.();
      }
    };

    if (next.readyState === "open") {
      opened = true;
      openResolve();
      options.onOpen?.();
    }
  }

  function requireChannel(): P2PDataChannel {
    if (closed || !opened || !channel || channel.readyState !== "open") {
      throw new Error("offline_not_connected");
    }
    return channel;
  }

  async function handleData(data: string | ArrayBuffer): Promise<void> {
    if (closed) {
      return;
    }
    if (typeof data === "string") {
      await handleFrame(data);
      return;
    }

    if (!incoming) {
      throw new Error("offline_unexpected_chunk");
    }

    const chunk = new Uint8Array(data);
    if (incoming.received + chunk.byteLength > incoming.meta.size) {
      throw new Error("offline_size_mismatch");
    }
    await incoming.sink.write(chunk);
    incoming.received += chunk.byteLength;
    if (incoming.received === incoming.meta.size) {
      await finishIncoming(incoming);
    }
  }

  async function handleFrame(value: string): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      throw new Error("offline_invalid_frame");
    }
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error("offline_invalid_frame");
    }

    const frame = parsed as Record<string, unknown>;
    if (frame.kind === "text") {
      if (typeof frame.text !== "string") {
        throw new Error("offline_invalid_frame");
      }
      options.onText?.(frame.text);
      return;
    }

    if (frame.kind === "meta") {
      if (incoming) {
        throw new Error("offline_file_in_progress");
      }
      const meta = parseMeta(frame);
      incoming = {
        meta,
        sink: await options.createSink(meta),
        received: 0,
      };
      return;
    }

    if (frame.kind === "done" && incoming) {
      await finishIncoming(incoming);
    }
  }

  async function finishIncoming(file: IncomingFile): Promise<void> {
    incoming = null;
    await file.sink.close();
    options.onFile?.(file.meta);
  }

  async function fail(error: unknown): Promise<void> {
    const file = incoming;
    incoming = null;
    if (file) {
      await file.sink.abort();
    }
    options.onError?.(error);
  }

  async function localCode(
    type: "offer" | "answer",
    fallbackSdp: string,
  ): Promise<string> {
    const session = getSession();
    await waitForIceGathering(session, options.iceTimeoutMs ?? DEFAULT_ICE_TIMEOUT_MS);
    return encodeOfflineSignal({
      type,
      sdp: session.getLocalDescription()?.sdp ?? fallbackSdp,
    });
  }

  return {
    async createOfferCode() {
      const session = getSession();
      if (!channel) {
        attachChannel(session.createDataChannel("dropchat-offline"));
      }
      const offer = await session.createOffer();
      await session.setLocalDescription(offer);
      return localCode("offer", offer.sdp);
    },

    async acceptAnswerCode(code) {
      const session = getSession();
      const signal = decodeOfflineSignal(code);
      if (signal.type !== "answer") {
        throw new Error("invalid_offline_code");
      }
      await session.setRemoteDescription(signal);
      await openPromise;
    },

    async joinWithOfferCode(code) {
      const session = getSession();
      const signal = decodeOfflineSignal(code);
      if (signal.type !== "offer") {
        throw new Error("invalid_offline_code");
      }
      await session.setRemoteDescription(signal);
      const answer = await session.createAnswer();
      await session.setLocalDescription(answer);
      return localCode("answer", answer.sdp);
    },

    async waitForConnection() {
      await openPromise;
    },

    async sendText(text) {
      requireChannel().send(JSON.stringify({ kind: "text", text }));
    },

    async sendFile(file, onProgress) {
      await sendFileOverP2P({
        channel: requireChannel(),
        file,
        signal: new AbortController().signal,
        onProgress,
      });
    },

    close() {
      if (closed) {
        return;
      }
      closed = true;
      channel?.close();
      current?.close();
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
    throw new Error("offline_invalid_meta");
  }
  return { name: frame.name, size: frame.size, mime: frame.mime };
}

function waitForIceGathering(
  session: OfflineRtcSession,
  timeoutMs: number,
): Promise<void> {
  if (session.iceGatheringState === "complete") {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timeout);
      session.onicegatheringstatechange = null;
      resolve();
    };
    const onChange = () => {
      if (session.iceGatheringState === "complete") {
        finish();
      }
    };
    const timeout = setTimeout(finish, timeoutMs);
    session.onicegatheringstatechange = onChange;
  });
}
