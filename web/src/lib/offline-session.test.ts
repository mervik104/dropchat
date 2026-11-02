import { describe, expect, it, vi } from "vitest";

import type { P2PDataChannel, P2PFileSink } from "./p2p";
import { decodeOfflineSignal, encodeOfflineSignal } from "./offline-code";
import {
  createOfflineSession,
  type OfflineRtcSession,
} from "./offline-session";

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

class FakeSession implements OfflineRtcSession {
  channel = new FakeChannel();
  localDescription: { type: "offer" | "answer"; sdp: string } | null = null;
  remoteDescription: { type: "offer" | "answer"; sdp: string } | null = null;
  iceGatheringState: "new" | "gathering" | "complete" = "complete";
  onicegatheringstatechange: (() => void) | null = null;
  ondatachannel: ((event: { channel: P2PDataChannel }) => void) | null = null;
  closed = false;

  async createOffer() {
    return { type: "offer" as const, sdp: "offer-sdp" };
  }

  async createAnswer() {
    return { type: "answer" as const, sdp: "answer-sdp" };
  }

  async setLocalDescription(description: { type: "offer" | "answer"; sdp: string }) {
    this.localDescription = description;
  }

  async setRemoteDescription(description: { type: "offer" | "answer"; sdp: string }) {
    this.remoteDescription = description;
  }

  createDataChannel() {
    return this.channel;
  }

  getLocalDescription() {
    return this.localDescription;
  }

  close() {
    this.closed = true;
  }

  completeIce(): void {
    this.iceGatheringState = "complete";
    this.onicegatheringstatechange?.();
  }
}

function sink(): P2PFileSink & {
  writes: Uint8Array[];
  close: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
} {
  const writes: Uint8Array[] = [];
  return {
    writes,
    write: vi.fn(async (chunk: Uint8Array) => {
      writes.push(chunk);
    }),
    close: vi.fn(async () => undefined),
    abort: vi.fn(async () => undefined),
  };
}

function setup() {
  const fake = new FakeSession();
  const createdSink = sink();
  const createSession = vi.fn(() => fake);
  const createSink = vi.fn(async () => createdSink);
  const onOpen = vi.fn();
  const onText = vi.fn();
  const onFile = vi.fn();
  const onError = vi.fn();
  const onClose = vi.fn();
  const session = createOfflineSession({
    createSession,
    createSink,
    onOpen,
    onText,
    onFile,
    onError,
    onClose,
  });
  return {
    fake,
    createdSink,
    createSession,
    createSink,
    onOpen,
    onText,
    onFile,
    onError,
    onClose,
    session,
  };
}

const offerCode = encodeOfflineSignal({ type: "offer", sdp: "remote-offer" });
const answerCode = encodeOfflineSignal({ type: "answer", sdp: "remote-answer" });
const file = {
  name: "a.txt",
  size: 3,
  type: "text/plain",
  slice: () => new Blob(["abc"]),
};

describe("createOfflineSession", () => {
  it("creates an offer code and accepts an answer", async () => {
    const { fake, createdSink, session, onOpen } = setup();

    const code = await session.createOfferCode();
    expect(decodeOfflineSignal(code)).toEqual({
      type: "offer",
      sdp: "offer-sdp",
    });
    expect(fake.localDescription).toEqual({ type: "offer", sdp: "offer-sdp" });

    fake.channel.open();
    await session.acceptAnswerCode(answerCode);
    expect(fake.remoteDescription).toEqual({
      type: "answer",
      sdp: "remote-answer",
    });
    expect(onOpen).toHaveBeenCalledTimes(1);

    await expect(session.waitForConnection()).resolves.toBeUndefined();
    expect(createdSink.writes).toEqual([]);
  });

  it("joins with an offer code and waits for the host answer", async () => {
    const { fake, session, onOpen } = setup();

    const code = await session.joinWithOfferCode(offerCode);
    expect(decodeOfflineSignal(code)).toEqual({
      type: "answer",
      sdp: "answer-sdp",
    });
    expect(fake.remoteDescription).toEqual({
      type: "offer",
      sdp: "remote-offer",
    });

    const waiting = session.waitForConnection();
    fake.ondatachannel?.({ channel: fake.channel });
    fake.channel.open();
    await waiting;
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("waits for ICE gathering and falls back to the offer SDP", async () => {
    const { fake, session } = setup();
    fake.iceGatheringState = "gathering";
    const creating = session.createOfferCode();

    await vi.waitFor(() => expect(fake.localDescription).not.toBeNull());
    fake.onicegatheringstatechange?.();
    fake.localDescription = null;
    fake.completeIce();

    expect(decodeOfflineSignal(await creating)).toEqual({
      type: "offer",
      sdp: "offer-sdp",
    });
  });

  it("times out ICE gathering using the current local description", async () => {
    vi.useFakeTimers();
    try {
      const fake = new FakeSession();
      fake.iceGatheringState = "gathering";
      const session = createOfflineSession({
        createSession: () => fake,
        createSink: vi.fn(),
        iceTimeoutMs: 1_000,
      });
      const creating = session.createOfferCode();

      await vi.advanceTimersByTimeAsync(1_000);
      expect(decodeOfflineSignal(await creating)).toEqual({
        type: "offer",
        sdp: "offer-sdp",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends text and files after connecting", async () => {
    const { fake, session } = setup();
    await session.createOfferCode();
    fake.channel.open();
    await session.acceptAnswerCode(answerCode);

    await session.sendText("привет");
    expect(JSON.parse(fake.channel.sent[0] as string)).toEqual({
      kind: "text",
      text: "привет",
    });

    const progress = vi.fn();
    await session.sendFile(file, progress);
    expect(fake.channel.sent.filter((item) => item instanceof ArrayBuffer)).toHaveLength(1);
    expect(progress).toHaveBeenLastCalledWith(100);
  });

  it("receives text and complete files", async () => {
    const { fake, session, onText, onFile, createSink, createdSink } = setup();
    await session.joinWithOfferCode(offerCode);
    fake.ondatachannel?.({ channel: fake.channel });
    fake.channel.open();
    await session.waitForConnection();

    fake.channel.emit(JSON.stringify({ kind: "text", text: "hi" }));
    await vi.waitFor(() => expect(onText).toHaveBeenCalledWith("hi"));

    fake.channel.emit(
      JSON.stringify({ kind: "meta", name: "a.txt", size: 3, mime: "text/plain" }),
    );
    fake.channel.emit(new TextEncoder().encode("abc").buffer);
    await vi.waitFor(() => expect(onFile).toHaveBeenCalledWith({
      name: "a.txt",
      size: 3,
      mime: "text/plain",
    }));
    expect(createSink).toHaveBeenCalledTimes(1);
    expect(createdSink.close).toHaveBeenCalledTimes(1);
    expect(createdSink.writes).toHaveLength(1);
  });

  it("completes a file on the done frame and ignores stray frames", async () => {
    const { fake, session, onText, onFile, createdSink } = setup();
    await session.joinWithOfferCode(offerCode);
    fake.ondatachannel?.({ channel: fake.channel });
    fake.channel.open();
    await session.waitForConnection();

    fake.channel.emit(JSON.stringify({ kind: "done" }));
    fake.channel.emit(JSON.stringify({ kind: "noise" }));
    fake.channel.emit(JSON.stringify({ kind: "meta", name: "a.txt", size: 4, mime: "text/plain" }));
    fake.channel.emit(new TextEncoder().encode("a").buffer);
    fake.channel.emit(JSON.stringify({ kind: "done" }));
    await vi.waitFor(() => expect(onFile).toHaveBeenCalled());
    expect(createdSink.close).toHaveBeenCalledTimes(1);
    expect(onText).not.toHaveBeenCalled();
  });

  it("reports invalid frames, chunks, and file metadata", async () => {
    const { fake, session, onError, createdSink } = setup();
    await session.joinWithOfferCode(offerCode);
    fake.ondatachannel?.({ channel: fake.channel });
    fake.channel.open();
    await session.waitForConnection();

    fake.channel.emit("{");
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));

    fake.channel.emit("null");
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(2));

    fake.channel.emit(JSON.stringify({ kind: "text", text: 1 }));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(3));

    fake.channel.emit(new ArrayBuffer(1));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(4));

    fake.channel.emit(JSON.stringify({ kind: "meta", name: "", size: 0, mime: "" }));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(5));

    fake.channel.emit(JSON.stringify({ kind: "meta", name: "a.txt", size: 1, mime: "text/plain" }));
    await vi.waitFor(() => expect(createdSink.writes).toHaveLength(0));
    fake.channel.emit(new ArrayBuffer(2));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(6));
    expect(createdSink.abort).toHaveBeenCalled();

    fake.channel.emit(JSON.stringify({ kind: "meta", name: "b.txt", size: 1, mime: "text/plain" }));
    await vi.waitFor(() => expect(createdSink.writes).toHaveLength(0));
    fake.channel.emit(JSON.stringify({ kind: "meta", name: "c.txt", size: 1, mime: "text/plain" }));
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(7));
  });

  it("handles channel errors and closes sessions", async () => {
    const { fake, session, onError, onClose, createSink, createdSink } = setup();
    await session.createOfferCode();
    fake.channel.open();
    await session.acceptAnswerCode(answerCode);

    fake.channel.emit(JSON.stringify({ kind: "meta", name: "a.txt", size: 3, mime: "text/plain" }));
    await vi.waitFor(() => expect(createSink).toHaveBeenCalled());
    fake.channel.onerror?.(new Error("boom"));
    await vi.waitFor(() => expect(onError).toHaveBeenCalled());
    expect(createdSink.abort).toHaveBeenCalled();

    fake.channel.onclose?.();
    expect(onClose).toHaveBeenCalled();

    session.close();
    expect(fake.closed).toBe(true);
    expect(fake.channel.readyState).toBe("closed");
  });

  it("ignores late channel events after close", async () => {
    const { fake, session, onOpen, onText } = setup();
    await session.createOfferCode();
    session.close();
    session.close();
    fake.channel.onopen?.();
    fake.channel.emit(JSON.stringify({ kind: "text", text: "late" }));
    await Promise.resolve();
    expect(onOpen).not.toHaveBeenCalled();
    expect(onText).not.toHaveBeenCalled();
  });

  it("rejects invalid codes and actions before connecting", async () => {
    const { session } = setup();
    await expect(session.acceptAnswerCode(offerCode)).rejects.toThrow(
      "invalid_offline_code",
    );
    await expect(session.joinWithOfferCode(answerCode)).rejects.toThrow(
      "invalid_offline_code",
    );
    await expect(session.sendText("x")).rejects.toThrow("offline_not_connected");
    await expect(session.sendFile(file, vi.fn())).rejects.toThrow(
      "offline_not_connected",
    );

    session.close();
    await expect(session.createOfferCode()).rejects.toThrow("offline_closed");
  });

  it("reports a sink creation failure and resolves an already open channel", async () => {
    const fake = new FakeSession();
    fake.channel.readyState = "open";
    const onError = vi.fn();
    const onOpen = vi.fn();
    const session = createOfflineSession({
      createSession: () => fake,
      createSink: vi.fn(async () => {
        throw new Error("sink failed");
      }),
      onError,
      onOpen,
    });

    await session.joinWithOfferCode(offerCode);
    fake.ondatachannel?.({ channel: fake.channel });
    expect(onOpen).toHaveBeenCalledTimes(1);
    fake.channel.emit(
      JSON.stringify({ kind: "meta", name: "a.txt", size: 1, mime: "text/plain" }),
    );
    await vi.waitFor(() => expect(onError).toHaveBeenCalled());
  });
});
