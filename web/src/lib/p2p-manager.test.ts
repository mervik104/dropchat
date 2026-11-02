import { describe, expect, it, vi } from "vitest";

import { createP2PManager, type RtcSession } from "./p2p-manager";
import { P2P_CHUNK_SIZE, type P2PDataChannel } from "./p2p";

class FakeChannel implements P2PDataChannel {
  readyState: "connecting" | "open" | "closing" | "closed" = "connecting";
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  sent: Array<string | ArrayBuffer> = [];
  onbufferedamountlow: (() => void) | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string | ArrayBuffer }) => void) | null = null;
  onerror: ((error: unknown) => void) | null = null;
  onclose: (() => void) | null = null;

  send(data: string | ArrayBuffer): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = "closed";
    this.onclose?.();
  }

  open(): void {
    this.readyState = "open";
    this.onopen?.();
  }

  emit(data: string | ArrayBuffer): void {
    this.onmessage?.({ data });
  }
}

class FakePeer implements RtcSession {
  channel = new FakeChannel();
  private channelCreated = false;
  offers = 0;
  answers = 0;
  local: Array<{ sdp: string }> = [];
  remote: Array<{ sdp: string }> = [];
  ice: Array<{ candidate: string }> = [];
  closed = false;
  onicecandidate: RtcSession["onicecandidate"] = null;
  ondatachannel: RtcSession["ondatachannel"] = null;

  async createOffer() {
    this.offers += 1;
    return { type: "offer" as const, sdp: `offer-${this.offers}` };
  }

  async createAnswer() {
    this.answers += 1;
    return { type: "answer" as const, sdp: `answer-${this.answers}` };
  }

  async setLocalDescription(description: { sdp: string }) {
    this.local.push(description);
  }

  async setRemoteDescription(description: { sdp: string }) {
    this.remote.push(description);
  }

  async addIceCandidate(candidate: { candidate: string }) {
    this.ice.push(candidate);
  }

  createDataChannel() {
    if (this.channelCreated) {
      this.channel = new FakeChannel();
    }
    this.channelCreated = true;
    return this.channel;
  }

  close() {
    this.closed = true;
  }
}

function setup() {
  const peers: FakePeer[] = [];
  const sendSignal = vi.fn();
  const createSink = vi.fn(async () => ({
    write: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    abort: vi.fn(async () => undefined),
  }));
  const onFileReceived = vi.fn();
  const onTextReceived = vi.fn();
  const onError = vi.fn();
  const manager = createP2PManager({
    createSession: () => {
      const peer = new FakePeer();
      peers.push(peer);
      return peer;
    },
    sendSignal,
    createSink,
    onFileReceived,
    onTextReceived,
    onError,
  });
  return {
    manager,
    peers,
    sendSignal,
    createSink,
    onFileReceived,
    onTextReceived,
    onError,
  };
}

const file = {
  name: "a.txt",
  size: 3,
  type: "text/plain",
  slice: () => new Blob(["abc"]),
};

describe("createP2PManager", () => {
  it("offers, sends ICE, and transfers a file after the channel opens", async () => {
    const { manager, peers, sendSignal } = setup();
    const progress = vi.fn();
    const connected = vi.fn();
    const sending = manager.sendFile(
      "peer-1",
      file,
      new AbortController().signal,
      progress,
      connected,
    );

    await vi.waitFor(() => expect(sendSignal).toHaveBeenCalled());
    expect(sendSignal).toHaveBeenCalledWith("peer-1", {
      kind: "offer",
      sdp: "offer-1",
    });
    expect(peers[0]!.local).toEqual([{ type: "offer", sdp: "offer-1" }]);

    peers[0]!.onicecandidate?.({
      candidate: { candidate: "candidate", sdpMid: "0", sdpMLineIndex: 0 },
    });
    peers[0]!.onicecandidate?.({ candidate: null });
    expect(sendSignal).toHaveBeenLastCalledWith("peer-1", {
      kind: "ice",
      candidate: "candidate",
      sdpMid: "0",
      sdpMLineIndex: 0,
    });

    peers[0]!.channel.open();
    await expect(sending).resolves.toEqual({
      name: "a.txt",
      size: 3,
      mime: "text/plain",
    });
    expect(connected).toHaveBeenCalledTimes(1);
    expect(progress).toHaveBeenLastCalledWith(100);
  });

  it("reuses an open channel for the next file", async () => {
    const { manager, peers } = setup();
    const first = manager.sendFile(
      "peer-1",
      file,
      new AbortController().signal,
      vi.fn(),
    );
    await vi.waitFor(() => expect(peers[0]!.channel.onopen).not.toBeNull());
    peers[0]!.channel.open();
    await first;

    await expect(
      manager.sendFile("peer-1", file, new AbortController().signal, vi.fn()),
    ).resolves.toMatchObject({ name: "a.txt" });
    expect(peers).toHaveLength(1);
  });

  it("reopens a fresh data channel after the previous one closes", async () => {
    const { manager, peers, sendSignal } = setup();
    const first = manager.sendFile(
      "peer-1",
      file,
      new AbortController().signal,
      vi.fn(),
    );
    await vi.waitFor(() => expect(peers[0]!.channel.onopen).not.toBeNull());
    peers[0]!.channel.open();
    await first;
    const oldChannel = peers[0]!.channel;

    oldChannel.onclose?.();
    expect(manager.hasOpenChannel("peer-1")).toBe(false);

    const second = manager.sendFile(
      "peer-1",
      file,
      new AbortController().signal,
      vi.fn(),
    );
    await vi.waitFor(() =>
      expect(peers[0]!.channel).not.toBe(oldChannel),
    );
    const newChannel = peers[0]!.channel;
    await vi.waitFor(() => expect(newChannel.onopen).not.toBeNull());
    newChannel.open();
    await expect(second).resolves.toMatchObject({ name: "a.txt" });

    expect(sendSignal).toHaveBeenLastCalledWith("peer-1", {
      kind: "offer",
      sdp: "offer-2",
    });
    expect(
      newChannel.sent.some((value) => typeof value === "string"),
    ).toBe(true);
  });

  it("replaces a closed channel even without an onclose event", async () => {
    const { manager, peers, sendSignal } = setup();
    const first = manager.sendFile(
      "peer-1",
      file,
      new AbortController().signal,
      vi.fn(),
    );
    await vi.waitFor(() => expect(peers[0]!.channel.onopen).not.toBeNull());
    peers[0]!.channel.open();
    await first;
    const oldChannel = peers[0]!.channel;
    oldChannel.readyState = "closed";

    const second = manager.sendFile(
      "peer-1",
      file,
      new AbortController().signal,
      vi.fn(),
    );
    await vi.waitFor(() =>
      expect(peers[0]!.channel).not.toBe(oldChannel),
    );
    const newChannel = peers[0]!.channel;
    await vi.waitFor(() => expect(newChannel.onopen).not.toBeNull());
    newChannel.open();
    await expect(second).resolves.toMatchObject({ name: "a.txt" });

    expect(sendSignal).toHaveBeenLastCalledWith("peer-1", {
      kind: "offer",
      sdp: "offer-2",
    });
  });

  it("clears a channel that closed during a failed transfer", async () => {
    const { manager, peers } = setup();
    const controller = new AbortController();
    const large = {
      ...file,
      size: P2P_CHUNK_SIZE * 2,
      slice: () => new Blob(["abc"]),
    };
    const first = manager.sendFile(
      "peer-1",
      large,
      controller.signal,
      () => {
        peers[0]!.channel.readyState = "closed";
        controller.abort();
      },
    );
    await vi.waitFor(() => expect(peers[0]!.channel.onopen).not.toBeNull());
    const oldChannel = peers[0]!.channel;
    oldChannel.open();
    await expect(first).rejects.toThrow("Aborted");

    const second = manager.sendFile(
      "peer-1",
      file,
      new AbortController().signal,
      vi.fn(),
    );
    await vi.waitFor(() =>
      expect(peers[0]!.channel).not.toBe(oldChannel),
    );
    const newChannel = peers[0]!.channel;
    await vi.waitFor(() => expect(newChannel.onopen).not.toBeNull());
    newChannel.open();
    await expect(second).resolves.toMatchObject({ name: "a.txt" });
  });

  it("does not clear a newer channel when an old transfer fails", async () => {
    const { manager, peers } = setup();
    const controller = new AbortController();
    const large = {
      ...file,
      size: P2P_CHUNK_SIZE * 2,
      slice: () => new Blob(["abc"]),
    };
    const replacement = new FakeChannel();
    const first = manager.sendFile(
      "peer-1",
      large,
      controller.signal,
      () => {
        peers[0]!.channel.readyState = "closed";
        peers[0]!.ondatachannel?.({ channel: replacement });
        controller.abort();
      },
    );
    await vi.waitFor(() => expect(peers[0]!.channel.onopen).not.toBeNull());
    const oldChannel = peers[0]!.channel;
    oldChannel.open();
    await expect(first).rejects.toThrow("Aborted");

    replacement.readyState = "open";
    expect(manager.hasOpenChannel("peer-1")).toBe(true);
  });

  it("cancels only the active file without closing the shared channel", async () => {
    const { manager, peers } = setup();
    const controller = new AbortController();
    const large = {
      ...file,
      size: P2P_CHUNK_SIZE * 3,
      slice: () => new Blob(["abc"]),
    };
    const first = manager.sendFile(
      "peer-1",
      large,
      controller.signal,
      () => controller.abort(),
    );
    await vi.waitFor(() => expect(peers[0]!.channel.onopen).not.toBeNull());
    const channel = peers[0]!.channel;
    channel.open();

    await expect(first).rejects.toThrow("Aborted");
    expect(channel.readyState).toBe("open");
    const frames = channel.sent
      .filter((value): value is string => typeof value === "string")
      .map((value) => JSON.parse(value));
    expect(frames.at(-1)).toEqual({ kind: "cancel" });

    await expect(
      manager.sendFile("peer-1", file, new AbortController().signal, vi.fn()),
    ).resolves.toMatchObject({ name: "a.txt" });
  });

  it("cancels the receiver after a non-abort send failure", async () => {
    const { manager, peers } = setup();
    const unreadable = {
      ...file,
      slice: () =>
        ({
          arrayBuffer: () => Promise.reject(new Error("read_failed")),
        }) as Blob,
    };
    const sending = manager.sendFile(
      "peer-1",
      unreadable,
      new AbortController().signal,
      vi.fn(),
      undefined,
      "file-read1",
    );
    await vi.waitFor(() => expect(peers[0]!.channel.onopen).not.toBeNull());
    const channel = peers[0]!.channel;
    channel.open();

    await expect(sending).rejects.toThrow("read_failed");
    const frames = channel.sent
      .filter((value): value is string => typeof value === "string")
      .map((value) => JSON.parse(value));
    expect(frames.at(-1)).toEqual({ kind: "cancel", id: "file-read1" });
  });

  it("rejects when aborted after connecting but before sending", async () => {
    const { manager, peers } = setup();
    const first = manager.sendFile(
      "peer-1",
      file,
      new AbortController().signal,
      vi.fn(),
    );
    await vi.waitFor(() => expect(peers[0]!.channel.onopen).not.toBeNull());
    peers[0]!.channel.open();
    await first;

    const controller = new AbortController();
    await expect(
      manager.sendFile(
        "peer-1",
        file,
        controller.signal,
        vi.fn(),
        () => controller.abort(),
      ),
    ).rejects.toThrow("Aborted");
  });

  it("rejects a queued file as soon as it is aborted", async () => {
    const { manager, peers } = setup();
    let release!: () => void;
    const blob = new Blob(["abc"]);
    const original = blob.arrayBuffer.bind(blob);
    const slowFile = {
      ...file,
      size: 1,
      slice: () =>
        ({
          arrayBuffer: () =>
            new Promise<ArrayBuffer>((resolve) => {
              release = () => resolve(original());
            }),
        }) as Blob,
    };
    const first = manager.sendFile(
      "peer-1",
      slowFile,
      new AbortController().signal,
      vi.fn(),
    );
    await vi.waitFor(() => expect(peers[0]!.channel.onopen).not.toBeNull());
    peers[0]!.channel.open();
    await vi.waitFor(() => expect(peers[0]!.channel.sent).toHaveLength(1));

    const controller = new AbortController();
    const queued = manager.sendFile(
      "peer-1",
      file,
      controller.signal,
      vi.fn(),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    const queuedRejection = expect(queued).rejects.toThrow("Aborted");
    controller.abort();
    await queuedRejection;

    release();
    await expect(first).resolves.toMatchObject({ name: "a.txt" });
  });

  it("does not rebind the channel when a queued file is canceled", async () => {
    const { manager, peers } = setup();
    const first = manager.sendFile(
      "peer-1",
      { ...file, size: P2P_CHUNK_SIZE + 1 },
      new AbortController().signal,
      vi.fn(),
    );
    await vi.waitFor(() => expect(peers[0]!.channel.onopen).not.toBeNull());
    const channel = peers[0]!.channel;
    channel.bufferedAmount = 9_000_000;
    channel.open();
    await vi.waitFor(() => expect(channel.sent).toHaveLength(1));

    const controller = new AbortController();
    const queued = manager.sendFile(
      "peer-1",
      file,
      controller.signal,
      vi.fn(),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    const closeHandler = channel.onclose;
    const queuedRejection = expect(queued).rejects.toThrow("Aborted");
    controller.abort();
    await queuedRejection;
    expect(channel.onclose).toBe(closeHandler);
    channel.close();
    await expect(first).rejects.toThrow("p2p_channel_closed");
  });

  it("serializes concurrent files on one channel", async () => {
    const { manager, peers } = setup();
    const size = P2P_CHUNK_SIZE + 1;
    const delayedFile = (name: string) => ({
      name,
      size,
      type: "text/plain",
      slice: (start: number, end: number) =>
        new Blob([new Uint8Array(end - start)]),
    });
    const first = manager.sendFile(
      "peer-1",
      delayedFile("first.txt"),
      new AbortController().signal,
      vi.fn(),
    );
    const second = manager.sendFile(
      "peer-1",
      delayedFile("second.txt"),
      new AbortController().signal,
      vi.fn(),
    );

    await vi.waitFor(() => expect(peers[0]!.channel.onopen).not.toBeNull());
    peers[0]!.channel.open();
    await Promise.all([first, second]);

    const frames = peers[0]!.channel.sent.filter(
      (value): value is string => typeof value === "string",
    );
    expect(frames.map((value) => JSON.parse(value).kind)).toEqual([
      "meta",
      "done",
      "meta",
      "done",
    ]);
    expect(JSON.parse(frames[0]!).name).toBe("first.txt");
    expect(JSON.parse(frames[2]!).name).toBe("second.txt");
  });

  it("keeps the shared channel open when a queued waiter aborts", async () => {
    const { manager, peers } = setup();
    const controller = new AbortController();
    const first = manager.sendFile(
      "peer-1",
      file,
      new AbortController().signal,
      vi.fn(),
    );
    const second = manager.sendFile(
      "peer-1",
      file,
      controller.signal,
      vi.fn(),
    );
    await vi.waitFor(() => expect(peers[0]!.channel.onopen).not.toBeNull());

    controller.abort();
    await expect(second).rejects.toThrow("Aborted");
    expect(peers[0]!.channel.readyState).not.toBe("closed");

    peers[0]!.channel.open();
    await expect(first).resolves.toMatchObject({ name: "a.txt" });
  });

  it("rejects an already-aborted request without closing an open channel", async () => {
    const { manager, peers } = setup();
    const first = manager.sendFile(
      "peer-1",
      file,
      new AbortController().signal,
      vi.fn(),
    );
    await vi.waitFor(() => expect(peers[0]!.channel.onopen).not.toBeNull());
    peers[0]!.channel.open();
    await first;

    const controller = new AbortController();
    controller.abort();
    await expect(
      manager.sendFile("peer-1", file, controller.signal, vi.fn()),
    ).rejects.toThrow("Aborted");
    expect(peers[0]!.channel.readyState).toBe("open");
  });

  it("does not start a queued file that was aborted before its turn", async () => {
    const { manager, peers } = setup();
    let release!: () => void;
    const blob = new Blob(["abc"]);
    const original = blob.arrayBuffer.bind(blob);
    const slowFile = {
      ...file,
      slice: () =>
        ({
          arrayBuffer: () =>
            new Promise<ArrayBuffer>((resolve) => {
              release = () => resolve(original());
            }),
        }) as Blob,
    };
    const controller = new AbortController();
    const first = manager.sendFile(
      "peer-1",
      slowFile,
      new AbortController().signal,
      vi.fn(),
    );
    await vi.waitFor(() => expect(peers[0]!.channel.onopen).not.toBeNull());
    peers[0]!.channel.open();
    await vi.waitFor(() =>
      expect(peers[0]!.channel.sent).toHaveLength(1),
    );

    const second = manager.sendFile(
      "peer-1",
      file,
      controller.signal,
      vi.fn(),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    controller.abort();
    release();
    await expect(second).rejects.toThrow("Aborted");
    await expect(first).resolves.toMatchObject({ name: "a.txt" });
    const metas = peers[0]!.channel.sent
      .filter((value): value is string => typeof value === "string")
      .map((value) => JSON.parse(value))
      .filter((frame) => frame.kind === "meta");
    expect(metas).toHaveLength(1);
    expect(peers[0]!.channel.readyState).toBe("open");
  });

  it("handles answer and ICE signals", async () => {
    const { manager, peers, sendSignal } = setup();
    const sending = manager.sendFile(
      "peer-1",
      file,
      new AbortController().signal,
      vi.fn(),
    );
    await vi.waitFor(() => expect(sendSignal).toHaveBeenCalled());

    await manager.handleSignal("peer-1", { kind: "answer", sdp: "answer" });
    await manager.handleSignal("peer-1", {
      kind: "ice",
      candidate: "candidate",
      sdpMid: null,
      sdpMLineIndex: null,
    });

    expect(peers[0]!.remote).toEqual([{ type: "answer", sdp: "answer" }]);
    expect(peers[0]!.ice).toEqual([
      { candidate: "candidate", sdpMid: null, sdpMLineIndex: null },
    ]);
    await manager.handleSignal("missing", {
      kind: "ice",
      candidate: "candidate",
      sdpMid: null,
      sdpMLineIndex: null,
    });
    await manager.handleSignal("missing", { kind: "answer", sdp: "answer" });
    expect(peers).toHaveLength(1);
    peers[0]!.channel.open();
    await sending;
  });

  it("answers an offer and receives a file through the data channel", async () => {
    const { manager, peers, sendSignal, createSink, onFileReceived } = setup();

    await manager.handleSignal("peer-1", { kind: "offer", sdp: "offer" });
    expect(peers[0]!.remote).toEqual([{ type: "offer", sdp: "offer" }]);
    expect(peers[0]!.local).toEqual([{ type: "answer", sdp: "answer-1" }]);
    expect(sendSignal).toHaveBeenCalledWith("peer-1", {
      kind: "answer",
      sdp: "answer-1",
    });

    const channel = peers[0]!.channel;
    peers[0]!.ondatachannel?.({ channel });
    channel.emit(
      JSON.stringify({
        kind: "meta",
        id: "file-0001",
        name: "a.txt",
        size: 1,
        mime: "text/plain",
      }),
    );
    channel.emit(new TextEncoder().encode("a").buffer);
    channel.emit(JSON.stringify({ kind: "done" }));

    await vi.waitFor(() =>
      expect(onFileReceived).toHaveBeenCalledWith("peer-1", {
        id: "file-0001",
        name: "a.txt",
        size: 1,
        mime: "text/plain",
      }),
    );
    expect(createSink).toHaveBeenCalledTimes(1);
    expect(JSON.parse(channel.sent.at(-1) as string)).toEqual({
      kind: "ack",
      id: "file-0001",
    });
  });

  it("replaces an existing session when a new offer arrives", async () => {
    const { manager, peers } = setup();
    await manager.handleSignal("peer-1", { kind: "offer", sdp: "offer-1" });
    await manager.handleSignal("peer-1", { kind: "offer", sdp: "offer-2" });

    expect(peers).toHaveLength(2);
    expect(peers[0]!.closed).toBe(true);
    peers[0]!.channel.onclose?.();
  });

  it("reports receive and send failures", async () => {
    const { manager, peers, sendSignal, onError } = setup();
    await manager.handleSignal("peer-1", { kind: "offer", sdp: "offer" });
    peers[0]!.ondatachannel?.({ channel: peers[0]!.channel });
    peers[0]!.channel.onerror?.(new Error("boom"));
    await vi.waitFor(() => expect(onError).toHaveBeenCalled());

    const controller = new AbortController();
    controller.abort();
    await expect(
      manager.sendFile("peer-2", file, controller.signal, vi.fn()),
    ).rejects.toThrow("Aborted");
    const pending = new AbortController();
    const sending = manager.sendFile("peer-3", file, pending.signal, vi.fn());
    await vi.waitFor(() =>
      expect(sendSignal).toHaveBeenCalledWith("peer-3", {
        kind: "offer",
        sdp: "offer-1",
      }),
    );
    await Promise.resolve();
    pending.abort();
    await expect(sending).rejects.toThrow("Aborted");
  });

  it("waits for a file acknowledgement and preserves the transfer id", async () => {
    const { manager, peers } = setup();
    const sending = manager.sendFile(
      "peer-1",
      file,
      new AbortController().signal,
      vi.fn(),
      undefined,
      "file-ack-1",
    );
    await vi.waitFor(() => expect(peers[0]!.channel.onopen).not.toBeNull());
    peers[0]!.channel.open();
    await vi.waitFor(() =>
      expect(peers[0]!.channel.sent.at(-1)).toBe(
        JSON.stringify({ kind: "done" }),
      ),
    );
    peers[0]!.channel.emit(
      JSON.stringify({ kind: "ack", id: "file-ack-1" }),
    );
    await expect(sending).resolves.toMatchObject({
      id: "file-ack-1",
      name: "a.txt",
    });
  });

  it("accepts an acknowledgement that arrives before the file finishes", async () => {
    const { manager, peers } = setup();
    const sending = manager.sendFile(
      "peer-1",
      file,
      new AbortController().signal,
      vi.fn(),
      undefined,
      "file-early1",
    );
    await vi.waitFor(() => expect(peers[0]!.channel.onopen).not.toBeNull());
    peers[0]!.channel.open();
    await vi.waitFor(() =>
      expect(peers[0]!.channel.sent.length).toBeGreaterThan(0),
    );
    peers[0]!.channel.emit(
      JSON.stringify({ kind: "ack", id: "file-early1" }),
    );
    await expect(sending).resolves.toMatchObject({ id: "file-early1" });
  });

  it("handles acknowledgements before the ack timer is armed", async () => {
    const { manager, peers } = setup();
    const large = {
      ...file,
      size: P2P_CHUNK_SIZE * 4,
      slice: () => new Blob(["abcd"]),
    };
    const sending = manager.sendFile(
      "peer-1",
      large,
      new AbortController().signal,
      vi.fn(),
      undefined,
      "file-early2",
    );
    await vi.waitFor(() => expect(peers[0]!.channel.onopen).not.toBeNull());
    peers[0]!.channel.open();
    await vi.waitFor(() =>
      expect(peers[0]!.channel.sent.length).toBeGreaterThan(0),
    );
    peers[0]!.channel.emit(
      JSON.stringify({ kind: "ack", id: "file-early2" }),
    );
    await expect(sending).resolves.toMatchObject({ id: "file-early2" });
  });

  it("skips arming an ack that already arrived during a slow chunk", async () => {
    const { manager, peers } = setup();
    let release!: () => void;
    const blob = new Blob(["abc"]);
    const original = blob.arrayBuffer.bind(blob);
    const slowFile = {
      ...file,
      slice: () =>
        ({
          arrayBuffer: () =>
            new Promise<ArrayBuffer>((resolve) => {
              release = () => resolve(original());
            }),
        }) as Blob,
    };
    const sending = manager.sendFile(
      "peer-1",
      slowFile,
      new AbortController().signal,
      vi.fn(),
      undefined,
      "file-slow01",
    );
    await vi.waitFor(() => expect(peers[0]!.channel.onopen).not.toBeNull());
    peers[0]!.channel.open();
    await vi.waitFor(() =>
      expect(peers[0]!.channel.sent.length).toBeGreaterThan(0),
    );
    peers[0]!.channel.emit(
      JSON.stringify({ kind: "ack", id: "file-slow01" }),
    );
    release();
    await expect(sending).resolves.toMatchObject({ id: "file-slow01" });
  });

  it("rejects pending file acknowledgements when the channel closes", async () => {
    const { manager, peers } = setup();
    const large = {
      ...file,
      size: P2P_CHUNK_SIZE * 4,
      slice: () => new Blob(["abcd"]),
    };
    const sending = manager.sendFile(
      "peer-1",
      large,
      new AbortController().signal,
      vi.fn(),
      undefined,
      "file-close1",
    );
    await vi.waitFor(() => expect(peers[0]!.channel.onopen).not.toBeNull());
    peers[0]!.channel.open();
    await vi.waitFor(() =>
      expect(peers[0]!.channel.sent.length).toBeGreaterThan(0),
    );
    peers[0]!.channel.onclose?.();
    await expect(sending).rejects.toThrow();
  });

  it("cancels pending file acknowledgements on send errors", async () => {
    const { manager, peers } = setup();
    const sending = manager.sendFile(
      "peer-1",
      file,
      new AbortController().signal,
      vi.fn(),
      undefined,
      "file-error1",
    );
    await vi.waitFor(() => expect(peers[0]!.channel.onopen).not.toBeNull());
    peers[0]!.channel.open();
    peers[0]!.channel.send = vi.fn(() => {
      throw new Error("send failed");
    });
    await expect(sending).rejects.toThrow("send failed");

    const withoutId = manager.sendFile(
      "peer-2",
      file,
      new AbortController().signal,
      vi.fn(),
    );
    const withoutIdAssertion = expect(withoutId).rejects.toThrow("send failed");
    await vi.waitFor(() => expect(peers.length).toBe(2));
    peers[1]!.channel.open();
    peers[1]!.channel.send = vi.fn(() => {
      throw new Error("send failed");
    });
    await withoutIdAssertion;
  });

  it("rejects a file without acknowledgement", async () => {
    vi.useFakeTimers();
    try {
      const { manager, peers } = setup();
      const sending = manager.sendFile(
        "peer-1",
        file,
        new AbortController().signal,
        vi.fn(),
        undefined,
        "file-timeout-1",
      );
      const assertion = expect(sending).rejects.toThrow("p2p_ack_timeout");
      await vi.advanceTimersByTimeAsync(0);
      peers[0]!.channel.open();
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(5_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses an already open data channel and a fallback mime", async () => {
    const peer = new FakePeer();
    peer.channel.readyState = "open";
    const manager = createP2PManager({
      createSession: () => peer,
      sendSignal: vi.fn(),
      createSink: vi.fn(),
      onFileReceived: vi.fn(),
      onTextReceived: vi.fn(),
    });

    await expect(
      manager.sendFile(
        "peer-1",
        { ...file, type: "" },
        new AbortController().signal,
        vi.fn(),
      ),
    ).resolves.toMatchObject({
      name: "a.txt",
      mime: "application/octet-stream",
    });
  });

  it("sends and receives acknowledged text over an open channel", async () => {
    const { manager, peers, onTextReceived } = setup();
    expect(manager.hasOpenChannel("peer-1")).toBe(false);
    await expect(manager.sendText("peer-1", "x", "x")).rejects.toThrow(
      "p2p_not_connected",
    );

    const connecting = manager.ensureConnection("peer-1");
    await vi.waitFor(() => expect(peers[0]!.channel.onopen).not.toBeNull());
    peers[0]!.channel.open();
    await connecting;
    expect(manager.hasOpenChannel("peer-1")).toBe(true);

    const sending = manager.sendText("peer-1", "hello", "out-1");
    expect(JSON.parse(peers[0]!.channel.sent.at(-1) as string)).toEqual({
      kind: "text",
      text: "hello",
      id: "out-1",
    });
    peers[0]!.channel.emit(JSON.stringify({ kind: "ack", id: "out-1" }));
    await expect(sending).resolves.toBeUndefined();

    peers[0]!.ondatachannel?.({ channel: peers[0]!.channel });
    peers[0]!.channel.emit(
      JSON.stringify({ kind: "text", text: "incoming", id: "in-1" }),
    );
    peers[0]!.channel.emit("{");
    peers[0]!.channel.emit("null");
    peers[0]!.channel.emit(JSON.stringify({ kind: "text", text: 1 }));
    peers[0]!.channel.emit(JSON.stringify({ kind: "noise" }));
    peers[0]!.channel.emit(JSON.stringify({ kind: "ack", id: "missing" }));
    peers[0]!.channel.emit(
      JSON.stringify({ kind: "text", text: "without-id" }),
    );
    await vi.waitFor(() =>
      expect(onTextReceived).toHaveBeenCalledWith("peer-1", "incoming", "in-1"),
    );
    expect(onTextReceived).toHaveBeenCalledTimes(2);
    expect(JSON.parse(peers[0]!.channel.sent.at(-1) as string)).toEqual({
      kind: "ack",
      id: "in-1",
    });

    peers[0]!.channel.onclose?.();
    peers[0]!.channel.emit(
      JSON.stringify({ kind: "text", text: "after-close", id: "in-2" }),
    );
    await vi.waitFor(() =>
      expect(onTextReceived).toHaveBeenCalledWith(
        "peer-1",
        "after-close",
        "in-2",
      ),
    );
    expect(onTextReceived).toHaveBeenCalledTimes(3);
  });

  it("rejects text without an acknowledgement or when the channel closes", async () => {
    const { manager, peers } = setup();
    const connecting = manager.ensureConnection("peer-1");
    await vi.waitFor(() => expect(peers[0]!.channel.onopen).not.toBeNull());
    peers[0]!.channel.open();
    await connecting;

    vi.useFakeTimers();
    try {
      const timedOut = manager.sendText("peer-1", "late", "timeout-1");
      const assertion = expect(timedOut).rejects.toThrow("p2p_ack_timeout");
      await vi.advanceTimersByTimeAsync(3_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }

    const closed = manager.sendText("peer-1", "closed", "closed-1");
    const closedAssertion = expect(closed).rejects.toThrow(
      "p2p_channel_closed",
    );
    peers[0]!.channel.onclose?.();
    await closedAssertion;
  });

  it("only initiates proactive connections from the smaller device id", async () => {
    const peer = new FakePeer();
    const sendSignal = vi.fn();
    const lower = createP2PManager({
      createSession: () => peer,
      sendSignal,
      createSink: vi.fn(),
      onFileReceived: vi.fn(),
      onTextReceived: vi.fn(),
      localDeviceId: "a",
    });
    const connecting = lower.ensureConnection("b");
    await vi.waitFor(() => expect(sendSignal).toHaveBeenCalled());
    peer.channel.open();
    await connecting;
    await lower.ensureConnection("b");
    expect(sendSignal).toHaveBeenCalledTimes(1);

    const higher = createP2PManager({
      createSession: () => new FakePeer(),
      sendSignal: vi.fn(),
      createSink: vi.fn(),
      onFileReceived: vi.fn(),
      onTextReceived: vi.fn(),
      localDeviceId: "z",
    });
    await higher.ensureConnection("b");
    expect(higher.hasOpenChannel("b")).toBe(false);
  });

  it("aborts an incoming file on a matching cancel and ignores another id", async () => {
    const { manager, peers, createSink, onFileReceived } = setup();
    const sink = {
      write: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      abort: vi.fn(async () => undefined),
    };
    createSink.mockResolvedValue(sink);
    await manager.handleSignal("peer-1", { kind: "offer", sdp: "offer" });
    const channel = peers[0]!.channel;
    peers[0]!.ondatachannel?.({ channel });

    channel.emit(
      JSON.stringify({
        kind: "meta",
        id: "file-0001",
        name: "a.txt",
        size: 2,
        mime: "text/plain",
      }),
    );
    await vi.waitFor(() => expect(createSink).toHaveBeenCalledTimes(1));
    channel.emit(new TextEncoder().encode("a").buffer);
    channel.emit(JSON.stringify({ kind: "cancel", id: "file-0002" }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sink.abort).not.toHaveBeenCalled();
    channel.emit(JSON.stringify({ kind: "cancel", id: "file-0001" }));
    await vi.waitFor(() => expect(sink.abort).toHaveBeenCalledTimes(1));
    channel.emit(JSON.stringify({ kind: "cancel" }));

    channel.emit(
      JSON.stringify({
        kind: "meta",
        id: "file-0003",
        name: "b.txt",
        size: 1,
        mime: "text/plain",
      }),
    );
    await vi.waitFor(() => expect(createSink).toHaveBeenCalledTimes(2));
    channel.emit(new TextEncoder().encode("b").buffer);
    channel.emit(JSON.stringify({ kind: "done" }));
    await vi.waitFor(() =>
      expect(onFileReceived).toHaveBeenCalledWith("peer-1", {
        id: "file-0003",
        name: "b.txt",
        size: 1,
        mime: "text/plain",
      }),
    );
  });

  it("receives a completed file, done frame, and surfaces protocol errors", async () => {
    const { manager, peers, createSink, onFileReceived, onError } = setup();
    const sink = {
      write: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      abort: vi.fn(async () => undefined),
    };
    createSink.mockResolvedValue(sink);
    await manager.handleSignal("peer-1", { kind: "offer", sdp: "offer" });
    const channel = peers[0]!.channel;
    peers[0]!.ondatachannel?.({ channel });

    channel.emit(JSON.stringify({ kind: "done" }));
    channel.emit(new ArrayBuffer(1));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));

    channel.emit(JSON.stringify({ kind: "meta", name: "", size: 0, mime: "" }));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(2));

    channel.emit(JSON.stringify({ kind: "meta", name: "a.txt", size: 2, mime: "text/plain" }));
    await vi.waitFor(() => expect(createSink).toHaveBeenCalledTimes(1));
    channel.emit(new TextEncoder().encode("ab").buffer);
    channel.emit(JSON.stringify({ kind: "done" }));
    await vi.waitFor(() => expect(onFileReceived).toHaveBeenCalled());

    channel.emit(JSON.stringify({ kind: "meta", name: "b.txt", size: 3, mime: "text/plain" }));
    await vi.waitFor(() => expect(createSink).toHaveBeenCalledTimes(2));
    channel.emit(new TextEncoder().encode("abc").buffer.slice(0, 1));
    channel.emit(JSON.stringify({ kind: "done" }));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(3));
    expect(onFileReceived).toHaveBeenCalledTimes(1);

    channel.emit(JSON.stringify({ kind: "meta", name: "c.txt", size: 1, mime: "text/plain" }));
    await vi.waitFor(() => expect(createSink).toHaveBeenCalledTimes(3));
    channel.emit(new ArrayBuffer(2));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(4));
    expect(sink.abort).toHaveBeenCalled();

    channel.emit(JSON.stringify({ kind: "meta", name: "d.txt", size: 1, mime: "text/plain" }));
    await vi.waitFor(() => expect(createSink).toHaveBeenCalledTimes(4));
    channel.emit(JSON.stringify({ kind: "meta", name: "e.txt", size: 1, mime: "text/plain" }));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(5));

    channel.emit(JSON.stringify({ kind: "meta", name: "f.txt", size: 1, mime: "text/plain" }));
    await vi.waitFor(() => expect(createSink).toHaveBeenCalledTimes(5));
    sink.abort.mockClear();
    channel.onclose?.();
    expect(manager.hasOpenChannel("peer-1")).toBe(false);
    await vi.waitFor(() => expect(sink.abort).toHaveBeenCalled());
  });

  it("ignores invalid signaling messages", async () => {
    const { manager, peers } = setup();
    await manager.handleSignal("peer-1", { kind: "bogus" } as never);
    expect(peers).toHaveLength(0);
  });

  it("drops a session when signaling fails so it can be retried", async () => {
    const peer = new FakePeer();
    const sendSignal = vi.fn(() => {
      throw new Error("socket closed");
    });
    const manager = createP2PManager({
      createSession: () => peer,
      sendSignal,
      createSink: vi.fn(),
      onFileReceived: vi.fn(),
      onTextReceived: vi.fn(),
    });

    await expect(manager.ensureConnection("peer-1")).rejects.toThrow(
      "socket closed",
    );
    expect(peer.closed).toBe(true);
  });

  it("rejects invalid file metadata ids", async () => {
    const { manager, peers, onError } = setup();
    await manager.handleSignal("peer-1", { kind: "offer", sdp: "offer" });
    const channel = peers[0]!.channel;
    peers[0]!.ondatachannel?.({ channel });
    channel.emit(
      JSON.stringify({
        kind: "meta",
        id: "short",
        name: "a.txt",
        size: 1,
        mime: "text/plain",
      }),
    );
    await vi.waitFor(() => expect(onError).toHaveBeenCalled());
  });

  it("rejects when the channel refuses a text frame", async () => {
    const { manager, peers } = setup();
    const connecting = manager.ensureConnection("peer-1");
    await vi.waitFor(() => expect(peers[0]!.channel.onopen).not.toBeNull());
    peers[0]!.channel.open();
    await connecting;

    peers[0]!.channel.send = vi.fn(() => {
      throw new Error("send failed");
    });
    await expect(
      manager.sendText("peer-1", "x", "send-fail"),
    ).rejects.toThrow("send failed");
  });

  it("rejects P2P files above the size limit", async () => {
    const { manager, peers } = setup();
    await expect(
      manager.sendFile(
        "peer-1",
        { ...file, size: 512 * 1024 * 1024 + 1 },
        new AbortController().signal,
        vi.fn(),
      ),
    ).rejects.toThrow("p2p_file_too_large");
    expect(peers).toHaveLength(0);
  });

  it("closes all sessions", async () => {
    const { manager, peers } = setup();
    await manager.handleSignal("peer-1", { kind: "offer", sdp: "offer" });
    await manager.handleSignal("peer-2", { kind: "offer", sdp: "offer" });
    manager.close();
    expect(peers.every((peer) => peer.closed)).toBe(true);
    manager.close();
  });
});
