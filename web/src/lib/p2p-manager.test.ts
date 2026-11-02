import { describe, expect, it, vi } from "vitest";

import { createP2PManager, type RtcSession } from "./p2p-manager";
import type { P2PDataChannel } from "./p2p";

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
    const sending = manager.sendFile(
      "peer-1",
      file,
      new AbortController().signal,
      progress,
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
      JSON.stringify({ kind: "meta", name: "a.txt", size: 1, mime: "text/plain" }),
    );
    channel.emit(new TextEncoder().encode("a").buffer);

    await vi.waitFor(() =>
      expect(onFileReceived).toHaveBeenCalledWith("peer-1", {
        name: "a.txt",
        size: 1,
        mime: "text/plain",
      }),
    );
    expect(createSink).toHaveBeenCalledTimes(1);
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

  it("sends and receives text over an open channel", async () => {
    const { manager, peers, onTextReceived } = setup();
    expect(manager.hasOpenChannel("peer-1")).toBe(false);
    expect(() => manager.sendText("peer-1", "x")).toThrow("p2p_not_connected");

    const connecting = manager.ensureConnection("peer-1");
    await vi.waitFor(() => expect(peers[0]!.channel.onopen).not.toBeNull());
    peers[0]!.channel.open();
    await connecting;
    expect(manager.hasOpenChannel("peer-1")).toBe(true);

    manager.sendText("peer-1", "hello");
    expect(JSON.parse(peers[0]!.channel.sent.at(-1) as string)).toEqual({
      kind: "text",
      text: "hello",
    });

    peers[0]!.ondatachannel?.({ channel: peers[0]!.channel });
    peers[0]!.channel.emit(
      JSON.stringify({ kind: "text", text: "incoming" }),
    );
    peers[0]!.channel.emit("{");
    peers[0]!.channel.emit("null");
    peers[0]!.channel.emit(JSON.stringify({ kind: "text", text: 1 }));
    peers[0]!.channel.emit(JSON.stringify({ kind: "noise" }));
    await vi.waitFor(() =>
      expect(onTextReceived).toHaveBeenCalledWith("peer-1", "incoming"),
    );
    expect(onTextReceived).toHaveBeenCalledTimes(1);
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
    await vi.waitFor(() => expect(onFileReceived).toHaveBeenCalled());

    channel.emit(JSON.stringify({ kind: "meta", name: "b.txt", size: 3, mime: "text/plain" }));
    await vi.waitFor(() => expect(createSink).toHaveBeenCalledTimes(2));
    channel.emit(new TextEncoder().encode("abc").buffer.slice(0, 1));
    channel.emit(JSON.stringify({ kind: "done" }));
    await vi.waitFor(() => expect(onFileReceived).toHaveBeenCalledTimes(2));

    channel.emit(JSON.stringify({ kind: "meta", name: "c.txt", size: 1, mime: "text/plain" }));
    await vi.waitFor(() => expect(createSink).toHaveBeenCalledTimes(3));
    channel.emit(new ArrayBuffer(2));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(3));
    expect(sink.abort).toHaveBeenCalled();

    channel.emit(JSON.stringify({ kind: "meta", name: "d.txt", size: 1, mime: "text/plain" }));
    await vi.waitFor(() => expect(createSink).toHaveBeenCalledTimes(4));
    channel.emit(JSON.stringify({ kind: "meta", name: "e.txt", size: 1, mime: "text/plain" }));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(4));

    channel.emit(JSON.stringify({ kind: "meta", name: "f.txt", size: 1, mime: "text/plain" }));
    await vi.waitFor(() => expect(createSink).toHaveBeenCalledTimes(5));
    sink.abort.mockClear();
    channel.onclose?.();
    expect(manager.hasOpenChannel("peer-1")).toBe(false);
    await vi.waitFor(() => expect(sink.abort).toHaveBeenCalled());
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
