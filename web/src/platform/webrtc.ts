import type { P2PDataChannel } from "../lib/p2p";

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
