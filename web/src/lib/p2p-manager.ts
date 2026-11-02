import type { RtcSignal } from "@dropchat/shared";

import {
  receiveFileOverP2P,
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
  sendFile(
    peerId: string,
    file: P2PTransferFile,
    signal: AbortSignal,
    onProgress: (percent: number) => void,
  ): Promise<P2PFileMeta>;
  handleSignal(peerId: string, signal: RtcSignal): Promise<void>;
  close(): void;
}

interface Session {
  peer: RtcSession;
  channel: P2PDataChannel | null;
  opened: Promise<P2PDataChannel>;
  resolveOpened: (channel: P2PDataChannel) => void;
}

export function createP2PManager(options: {
  createSession: () => RtcSession;
  sendSignal: (peerId: string, signal: RtcSignal) => void;
  createSink: (meta: P2PFileMeta) => Promise<P2PFileSink>;
  onFileReceived: (meta: P2PFileMeta) => void;
  onError?: (error: unknown) => void;
}): P2PManager {
  const sessions = new Map<string, Session>();

  function createSession(peerId: string): Session {
    const peer = options.createSession();
    let resolveOpened!: (channel: P2PDataChannel) => void;
    const opened = new Promise<P2PDataChannel>((resolve) => {
      resolveOpened = resolve;
    });
    const session: Session = {
      peer,
      channel: null,
      opened,
      resolveOpened,
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
      void receiveFile(event.channel);
    };

    sessions.set(peerId, session);
    return session;
  }

  function attachChannel(session: Session, channel: P2PDataChannel): void {
    session.channel = channel;
    if (channel.readyState === "open") {
      session.resolveOpened(channel);
      return;
    }
    channel.onopen = () => session.resolveOpened(channel);
  }

  async function receiveFile(channel: P2PDataChannel): Promise<void> {
    try {
      const meta = await receiveFileOverP2P({
        channel,
        signal: new AbortController().signal,
        onProgress: () => undefined,
        createSink: options.createSink,
      });
      options.onFileReceived(meta);
    } catch (error) {
      options.onError?.(error);
    }
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

  return {
    async sendFile(peerId, file, signal, onProgress) {
      const session = getSession(peerId);
      let channel = session.channel;
      if (!channel) {
        channel = session.peer.createDataChannel("dropchat-file");
        attachChannel(session, channel);
        const offer = await session.peer.createOffer();
        await session.peer.setLocalDescription(offer);
        options.sendSignal(peerId, { kind: "offer", sdp: offer.sdp });
      }

      const openChannel = await waitForOpen(channel, session.opened, signal);
      await sendFileOverP2P({
        channel: openChannel,
        file,
        signal,
        onProgress,
      });
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
