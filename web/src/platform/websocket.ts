import type { SocketLike } from "../lib/socket";

export function createBrowserWebSocket(url: string): SocketLike {
  return new WebSocket(url) as unknown as SocketLike;
}
