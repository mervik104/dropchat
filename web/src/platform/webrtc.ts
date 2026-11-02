import type { P2PDataChannel } from "../lib/p2p";
import type { RtcSession } from "../lib/p2p-manager";
import type { OfflineRtcSession } from "../lib/offline-session";

export function createBrowserPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });
}

export function createBrowserDataChannel(
  connection: RTCPeerConnection,
): P2PDataChannel {
  return connection.createDataChannel("dropchat-file", {
    ordered: true,
  }) as unknown as P2PDataChannel;
}

export function createBrowserRtcSession(): RtcSession {
  const connection = createBrowserPeerConnection();
  let iceHandler: RtcSession["onicecandidate"] = null;
  let dataHandler: RtcSession["ondatachannel"] = null;

  connection.onicecandidate = (event) => {
    iceHandler?.({
      candidate: event.candidate
        ? {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
          }
        : null,
    });
  };
  connection.ondatachannel = (event) => {
    dataHandler?.({
      channel: event.channel as unknown as P2PDataChannel,
    });
  };

  return {
    async createOffer() {
      const offer = await connection.createOffer();
      return { type: "offer", sdp: offer.sdp ?? "" };
    },
    async createAnswer() {
      const answer = await connection.createAnswer();
      return { type: "answer", sdp: answer.sdp ?? "" };
    },
    async setLocalDescription(description) {
      await connection.setLocalDescription(description);
    },
    async setRemoteDescription(description) {
      await connection.setRemoteDescription(description);
    },
    async addIceCandidate(candidate) {
      await connection.addIceCandidate(candidate);
    },
    createDataChannel() {
      return createBrowserDataChannel(connection);
    },
    get onicecandidate() {
      return iceHandler;
    },
    set onicecandidate(handler) {
      iceHandler = handler;
    },
    get ondatachannel() {
      return dataHandler;
    },
    set ondatachannel(handler) {
      dataHandler = handler;
    },
    close() {
      connection.close();
    },
  };
}

export function createOfflineRtcSession(): OfflineRtcSession {
  const connection = new RTCPeerConnection({ iceServers: [] });
  let iceHandler: OfflineRtcSession["onicegatheringstatechange"] = null;
  let dataHandler: OfflineRtcSession["ondatachannel"] = null;

  connection.onicegatheringstatechange = () => {
    iceHandler?.();
  };
  connection.ondatachannel = (event) => {
    dataHandler?.({
      channel: event.channel as unknown as P2PDataChannel,
    });
  };

  return {
    async createOffer() {
      const offer = await connection.createOffer();
      return { type: "offer", sdp: offer.sdp ?? "" };
    },
    async createAnswer() {
      const answer = await connection.createAnswer();
      return { type: "answer", sdp: answer.sdp ?? "" };
    },
    async setLocalDescription(description) {
      await connection.setLocalDescription(description);
    },
    async setRemoteDescription(description) {
      await connection.setRemoteDescription(description);
    },
    createDataChannel() {
      return connection.createDataChannel("dropchat-offline", {
        ordered: true,
      }) as unknown as P2PDataChannel;
    },
    getLocalDescription() {
      const description = connection.localDescription;
      if (
        !description ||
        (description.type !== "offer" && description.type !== "answer")
      ) {
        return null;
      }
      return { type: description.type, sdp: description.sdp ?? "" };
    },
    get iceGatheringState() {
      return connection.iceGatheringState;
    },
    get onicegatheringstatechange() {
      return iceHandler;
    },
    set onicegatheringstatechange(handler) {
      iceHandler = handler;
    },
    get ondatachannel() {
      return dataHandler;
    },
    set ondatachannel(handler) {
      dataHandler = handler;
    },
    close() {
      connection.close();
    },
  };
}
