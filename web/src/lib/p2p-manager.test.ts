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
    onError,
  });
  return { manager, peers, sendSignal, createSink, onFileReceived, onError };
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
      expect(onFileReceived).toHaveBeenCalledWith({
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

  it("closes all sessions", async () => {
    const { manager, peers } = setup();
    await manager.handleSignal("peer-1", { kind: "offer", sdp: "offer" });
    await manager.handleSignal("peer-2", { kind: "offer", sdp: "offer" });
    manager.close();
    expect(peers.every((peer) => peer.closed)).toBe(true);
    manager.close();
  });
});
