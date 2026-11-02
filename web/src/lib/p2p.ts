export const P2P_CHUNK_SIZE = 16 * 1024;
const BACKPRESSURE_LIMIT = 1_000_000;

export interface P2PTransferFile {
  name: string;
  size: number;
  type: string;
  slice(start: number, end: number): Blob;
}

export interface P2PDataChannel {
  readyState: "connecting" | "open" | "closing" | "closed";
  bufferedAmount: number;
  bufferedAmountLowThreshold: number;
  onbufferedamountlow: (() => void) | null;
  onmessage: ((event: { data: string | ArrayBuffer }) => void) | null;
  onerror: ((error: unknown) => void) | null;
  onclose: (() => void) | null;
  send(data: string | ArrayBuffer): void;
  close(): void;
}

export interface P2PFileMeta {
  name: string;
  size: number;
  mime: string;
}

export interface P2PFileSink {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}

async function waitForDrain(
  channel: P2PDataChannel,
  signal: AbortSignal,
): Promise<void> {
  if (channel.bufferedAmount <= BACKPRESSURE_LIMIT) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      channel.onbufferedamountlow = null;
      channel.onerror = null;
      channel.onclose = null;
      signal.removeEventListener("abort", onAbort);
    };
    const onLow = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("p2p_channel_error"));
    };
    const onClose = () => {
      cleanup();
      reject(new Error("p2p_channel_closed"));
    };
    const onAbort = () => {
      cleanup();
      channel.close();
      reject(new DOMException("Aborted", "AbortError"));
    };

    channel.onbufferedamountlow = onLow;
    channel.onerror = onError;
    channel.onclose = onClose;
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export async function sendFileOverP2P(options: {
  channel: P2PDataChannel;
  file: P2PTransferFile;
  signal: AbortSignal;
  onProgress: (percent: number) => void;
}): Promise<void> {
  const { channel, file, signal, onProgress } = options;
  if (channel.readyState !== "open") {
    throw new Error("channel_not_open");
  }

  channel.send(
    JSON.stringify({
      kind: "meta",
      name: file.name,
      size: file.size,
      mime: file.type || "application/octet-stream",
    }),
  );

  let offset = 0;
  while (offset < file.size) {
    if (signal.aborted) {
      channel.close();
      throw new DOMException("Aborted", "AbortError");
    }

    await waitForDrain(channel, signal);

    const end = Math.min(offset + P2P_CHUNK_SIZE, file.size);
    const chunk = await file.slice(offset, end).arrayBuffer();
    channel.send(chunk);
    offset = end;
    onProgress(Math.round((offset / file.size) * 100));
  }

  channel.send(JSON.stringify({ kind: "done" }));
}

export async function receiveFileOverP2P(options: {
  channel: P2PDataChannel;
  signal: AbortSignal;
  onProgress: (percent: number) => void;
  createSink: (meta: P2PFileMeta) => Promise<P2PFileSink>;
}): Promise<P2PFileMeta> {
  const { channel, signal } = options;
  return new Promise<P2PFileMeta>((resolve, reject) => {
    let meta: P2PFileMeta | null = null;
    let sink: P2PFileSink | null = null;
    let received = 0;
    let settled = false;
    let queue = Promise.resolve();

    const cleanup = () => {
      channel.onmessage = null;
      channel.onerror = null;
      channel.onclose = null;
      signal.removeEventListener("abort", onAbort);
    };

    const fail = (error: unknown) => {
      settled = true;
      cleanup();
      const abort = sink ? sink.abort() : Promise.resolve();
      void abort.finally(() => reject(error));
    };

    const onAbort = () => {
      fail(new DOMException("Aborted", "AbortError"));
      channel.close();
    };

    channel.onerror = () => fail(new Error("p2p_channel_error"));
    channel.onclose = () => fail(new Error("p2p_channel_closed"));
    signal.addEventListener("abort", onAbort, { once: true });

    channel.onmessage = (event) => {
      queue = queue
        .then(async () => {
          if (settled) {
            return;
          }

          if (typeof event.data === "string") {
            if (!meta) {
              const parsed = parseMetadata(event.data);
              meta = parsed;
              sink = await options.createSink(parsed);
              return;
            }

            if (event.data === JSON.stringify({ kind: "done" })) {
              return;
            }
            return;
          }

          if (!meta || !sink) {
            throw new Error("invalid_p2p_metadata");
          }

          const chunk = new Uint8Array(event.data);
          if (received + chunk.byteLength > meta.size) {
            throw new Error("p2p_size_mismatch");
          }

          await sink.write(chunk);
          received += chunk.byteLength;
          options.onProgress(Math.round((received / meta.size) * 100));

          if (received === meta.size) {
            settled = true;
            cleanup();
            await sink.close();
            resolve(meta);
          }
        })
        .catch(fail);
    };
  });
}

function parseMetadata(value: string): P2PFileMeta {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (
      parsed.kind !== "meta" ||
      typeof parsed.name !== "string" ||
      parsed.name.length === 0 ||
      typeof parsed.size !== "number" ||
      !Number.isInteger(parsed.size) ||
      parsed.size <= 0 ||
      typeof parsed.mime !== "string"
    ) {
      throw new Error("invalid_p2p_metadata");
    }

    return {
      name: parsed.name,
      size: parsed.size,
      mime: parsed.mime,
    };
  } catch {
    throw new Error("invalid_p2p_metadata");
  }
}
