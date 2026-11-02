import { describe, expect, it, vi } from "vitest";

import {
  MAX_P2P_FILE_SIZE,
  P2P_CHUNK_SIZE,
  receiveFileOverP2P,
  sendFileOverP2P,
  type P2PDataChannel,
  type P2PTransferFile,
} from "./p2p";

class FakeChannel implements P2PDataChannel {
  readyState: "connecting" | "open" | "closing" | "closed" = "open";
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  sent: Array<string | ArrayBuffer> = [];
  onbufferedamountlow: (() => void) | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string | ArrayBuffer }) => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;
  onclose: (() => void) | null = null;
  extraBuffered = 0;

  send(data: string | ArrayBuffer): void {
    this.sent.push(data);
    this.bufferedAmount +=
      typeof data === "string" ? 0 : data.byteLength + this.extraBuffered;
  }

  open(): void {
    this.readyState = "open";
    this.onopen?.();
  }

  close(): void {
    this.readyState = "closed";
    this.onclose?.();
  }

  drain(): void {
    this.bufferedAmount = 0;
    this.onbufferedamountlow?.();
  }

  emit(data: string | ArrayBuffer): void {
    this.onmessage?.({ data });
  }
}

function fileOf(content: string): P2PTransferFile {
  return {
    name: "p2p.txt",
    size: content.length,
    type: "text/plain",
    slice: (start, end) => new Blob([content.slice(start, end)]),
  };
}

describe("sendFileOverP2P", () => {
  it("sends metadata and 64 KiB chunks with progress", async () => {
    const channel = new FakeChannel();
    const progress = vi.fn();
    const content = "x".repeat(P2P_CHUNK_SIZE * 2 + 10);

    await sendFileOverP2P({
      channel,
      file: fileOf(content),
      signal: new AbortController().signal,
      onProgress: progress,
    });

    const meta = JSON.parse(channel.sent[0] as string) as {
      kind: string;
      size: number;
    };
    expect(meta).toMatchObject({
      kind: "meta",
      name: "p2p.txt",
      size: content.length,
      mime: "text/plain",
    });
    expect(channel.sent.filter((item) => item instanceof ArrayBuffer)).toHaveLength(3);
    expect((channel.sent[1] as ArrayBuffer).byteLength).toBe(P2P_CHUNK_SIZE);
    expect(progress.mock.calls.at(-1)?.[0]).toBe(100);
    expect(JSON.parse(channel.sent.at(-1) as string)).toEqual({ kind: "done" });
  });

  it("waits for backpressure to drain", async () => {
    const channel = new FakeChannel();
    channel.extraBuffered = 9_000_000;
    const promise = sendFileOverP2P({
      channel,
      file: fileOf("x".repeat(P2P_CHUNK_SIZE + 10)),
      signal: new AbortController().signal,
      onProgress: vi.fn(),
    });

    await vi.waitFor(() => expect(channel.sent).toHaveLength(2));
    channel.drain();
    await promise;
  });


  it("uses a fallback mime and cancels before the first chunk", async () => {
    const channel = new FakeChannel();
    const controller = new AbortController();
    controller.abort();

    await expect(
      sendFileOverP2P({
        channel,
        file: { ...fileOf("x"), type: "" },
        signal: controller.signal,
        onProgress: vi.fn(),
      }),
    ).rejects.toThrow("Aborted");
    const meta = JSON.parse(channel.sent[0] as string) as { mime: string };
    expect(meta.mime).toBe("application/octet-stream");
    expect(channel.readyState).toBe("closed");
  });

  it("rejects when the channel closes during backpressure", async () => {
    const channel = new FakeChannel();
    channel.extraBuffered = 9_000_000;
    const promise = sendFileOverP2P({
      channel,
      file: fileOf("x".repeat(P2P_CHUNK_SIZE + 10)),
      signal: new AbortController().signal,
      onProgress: vi.fn(),
    });

    await vi.waitFor(() => expect(channel.sent).toHaveLength(2));
    channel.close();
    await expect(promise).rejects.toThrow("p2p_channel_closed");
  });

  it("rejects on closed channel, cancellation, and channel errors", async () => {
    const closed = new FakeChannel();
    closed.readyState = "closed";
    await expect(
      sendFileOverP2P({
        channel: closed,
        file: fileOf("x"),
        signal: new AbortController().signal,
        onProgress: vi.fn(),
      }),
    ).rejects.toThrow("channel_not_open");

    const channel = new FakeChannel();
    channel.extraBuffered = 9_000_000;
    const controller = new AbortController();
    const promise = sendFileOverP2P({
      channel,
      file: fileOf("x".repeat(P2P_CHUNK_SIZE + 10)),
      signal: controller.signal,
      onProgress: vi.fn(),
    });
    await vi.waitFor(() => expect(channel.sent).toHaveLength(2));
    controller.abort();
    await expect(promise).rejects.toThrow("Aborted");
    expect(channel.readyState).toBe("closed");

    const failing = new FakeChannel();
    failing.extraBuffered = 9_000_000;
    const failingPromise = sendFileOverP2P({
      channel: failing,
      file: fileOf("x".repeat(P2P_CHUNK_SIZE + 10)),
      signal: new AbortController().signal,
      onProgress: vi.fn(),
    });
    await vi.waitFor(() => expect(failing.sent).toHaveLength(2));
    failing.onerror?.(new Error("channel failed"));
    await expect(failingPromise).rejects.toThrow("p2p_channel_error");
  });
});

describe("receiveFileOverP2P", () => {
  it("writes metadata and chunks into the sink", async () => {
    const channel = new FakeChannel();
    const writes: Uint8Array[] = [];
    const sink = {
      write: vi.fn(async (chunk: Uint8Array) => {
        writes.push(chunk);
      }),
      close: vi.fn(async () => undefined),
      abort: vi.fn(async () => undefined),
    };
    const progress = vi.fn();

    const promise = receiveFileOverP2P({
      channel,
      signal: new AbortController().signal,
      onProgress: progress,
      createSink: async () => sink,
    });

    channel.emit(
      JSON.stringify({
        kind: "meta",
        id: "file-0001",
        name: "p2p.txt",
        size: 4,
        mime: "text/plain",
      }),
    );
    channel.emit(new TextEncoder().encode("ab").buffer);
    channel.emit(new TextEncoder().encode("cd").buffer);

    await expect(promise).resolves.toMatchObject({
      id: "file-0001",
      name: "p2p.txt",
      size: 4,
    });
    expect(writes).toHaveLength(2);
    expect(sink.close).toHaveBeenCalledTimes(1);
    expect(progress.mock.calls.at(-1)?.[0]).toBe(100);
  });

  it("rejects malformed metadata and channel errors", async () => {
    const channel = new FakeChannel();
    const sink = {
      write: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      abort: vi.fn(async () => undefined),
    };
    const promise = receiveFileOverP2P({
      channel,
      signal: new AbortController().signal,
      onProgress: vi.fn(),
      createSink: async () => sink,
    });

    channel.emit("{");
    await expect(promise).rejects.toThrow("invalid_p2p_metadata");

    const second = new FakeChannel();
    const createSink = vi.fn(async () => sink);
    const secondPromise = receiveFileOverP2P({
      channel: second,
      signal: new AbortController().signal,
      onProgress: vi.fn(),
      createSink,
    });
    second.emit(
      JSON.stringify({ kind: "meta", name: "a.txt", size: 1, mime: "text/plain" }),
    );
    await vi.waitFor(() => expect(createSink).toHaveBeenCalled());
    second.onerror?.(new Error("x"));
    await expect(secondPromise).rejects.toThrow("p2p_channel_error");
    expect(sink.abort).toHaveBeenCalled();
  });


  it("ignores a done frame and extra frames after completion", async () => {
    const channel = new FakeChannel();
    const sink = {
      write: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      abort: vi.fn(async () => undefined),
    };
    const promise = receiveFileOverP2P({
      channel,
      signal: new AbortController().signal,
      onProgress: vi.fn(),
      createSink: async () => sink,
    });

    channel.emit(
      JSON.stringify({ kind: "meta", name: "a.txt", size: 1, mime: "text/plain" }),
    );
    channel.emit(JSON.stringify({ kind: "noise" }));
    channel.emit(JSON.stringify({ kind: "done" }));
    channel.emit(new TextEncoder().encode("a").buffer);
    channel.emit(new TextEncoder().encode("extra").buffer);

    await expect(promise).resolves.toMatchObject({ name: "a.txt" });
  });

  it("rejects binary data before metadata and oversized chunks", async () => {
    const channel = new FakeChannel();
    const first = receiveFileOverP2P({
      channel,
      signal: new AbortController().signal,
      onProgress: vi.fn(),
      createSink: async () => ({
        write: vi.fn(async () => undefined),
        close: vi.fn(async () => undefined),
        abort: vi.fn(async () => undefined),
      }),
    });
    channel.emit(new ArrayBuffer(1));
    await expect(first).rejects.toThrow("invalid_p2p_metadata");

    const second = new FakeChannel();
    const sink = {
      write: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      abort: vi.fn(async () => undefined),
    };
    const promise = receiveFileOverP2P({
      channel: second,
      signal: new AbortController().signal,
      onProgress: vi.fn(),
      createSink: async () => sink,
    });
    second.emit(
      JSON.stringify({ kind: "meta", name: "a.txt", size: 1, mime: "text/plain" }),
    );
    second.emit(new ArrayBuffer(2));
    await expect(promise).rejects.toThrow("p2p_size_mismatch");
    expect(sink.abort).toHaveBeenCalled();
  });

  it("rejects invalid P2P transfer ids", async () => {
    const channel = new FakeChannel();
    const promise = receiveFileOverP2P({
      channel,
      signal: new AbortController().signal,
      onProgress: vi.fn(),
      createSink: vi.fn(),
    });

    for (const id of ["short", 1]) {
      const current = receiveFileOverP2P({
        channel,
        signal: new AbortController().signal,
        onProgress: vi.fn(),
        createSink: vi.fn(),
      });
      channel.emit(
        JSON.stringify({
          kind: "meta",
          id,
          name: "a.txt",
          size: 1,
          mime: "text/plain",
        }),
      );
      await expect(current).rejects.toThrow("invalid_p2p_metadata");
    }
    void promise;
  });

  it("rejects metadata above the P2P size limit", async () => {
    const channel = new FakeChannel();
    const promise = receiveFileOverP2P({
      channel,
      signal: new AbortController().signal,
      onProgress: vi.fn(),
      createSink: vi.fn(),
    });

    channel.emit(
      JSON.stringify({
        kind: "meta",
        name: "huge.bin",
        size: MAX_P2P_FILE_SIZE + 1,
        mime: "application/octet-stream",
      }),
    );
    await expect(promise).rejects.toThrow("invalid_p2p_metadata");
  });

  it("rejects structurally invalid metadata", async () => {
    const channel = new FakeChannel();
    const promise = receiveFileOverP2P({
      channel,
      signal: new AbortController().signal,
      onProgress: vi.fn(),
      createSink: async () => ({
        write: vi.fn(async () => undefined),
        close: vi.fn(async () => undefined),
        abort: vi.fn(async () => undefined),
      }),
    });

    channel.emit(
      JSON.stringify({ kind: "meta", name: "", size: 0, mime: "text/plain" }),
    );
    await expect(promise).rejects.toThrow("invalid_p2p_metadata");
  });

  it("ignores duplicate failures after settling", async () => {
    const channel = new FakeChannel();
    const promise = receiveFileOverP2P({
      channel,
      signal: new AbortController().signal,
      onProgress: vi.fn(),
      createSink: async () => ({
        write: vi.fn(async () => undefined),
        close: vi.fn(async () => undefined),
        abort: vi.fn(async () => undefined),
      }),
    });

    channel.onerror?.(new Error("first"));
    channel.onclose?.();
    await expect(promise).rejects.toThrow("p2p_channel_error");
  });

  it("aborts on cancellation and closed channels", async () => {
    const channel = new FakeChannel();
    const sink = {
      write: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      abort: vi.fn(async () => undefined),
    };
    const controller = new AbortController();
    const promise = receiveFileOverP2P({
      channel,
      signal: controller.signal,
      onProgress: vi.fn(),
      createSink: async () => sink,
    });
    controller.abort();
    await expect(promise).rejects.toThrow("Aborted");
    expect(channel.readyState).toBe("closed");

    const closed = new FakeChannel();
    const closedPromise = receiveFileOverP2P({
      channel: closed,
      signal: new AbortController().signal,
      onProgress: vi.fn(),
      createSink: async () => sink,
    });
    closed.close();
    await expect(closedPromise).rejects.toThrow("p2p_channel_closed");
  });
});
