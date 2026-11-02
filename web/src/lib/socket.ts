import type { WsEvent } from "@dropchat/shared";

import type { ApiClient } from "./api";

export interface SocketLike {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent) => void,
  ): void;
  close(): void;
}

export interface RealtimeConnection {
  close(): void;
}

export interface ConnectRealtimeOptions {
  api: Pick<ApiClient, "createWsTicket">;
  apiUrl: string;
  fallbackOrigin: string;
  createWebSocket: (url: string) => SocketLike;
  onEvent: (event: WsEvent) => void;
}

export function buildWsUrl(
  apiUrl: string,
  fallbackOrigin: string,
  ticket: string,
): string {
  const url = new URL(apiUrl || fallbackOrigin, fallbackOrigin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/api/ws";
  url.search = `?ticket=${encodeURIComponent(ticket)}`;
  return url.toString();
}

export async function connectRealtime(
  options: ConnectRealtimeOptions,
): Promise<RealtimeConnection> {
  const { ticket } = await options.api.createWsTicket();
  const socket = options.createWebSocket(
    buildWsUrl(options.apiUrl, options.fallbackOrigin, ticket),
  );

  socket.addEventListener("message", (event) => {
    try {
      options.onEvent(JSON.parse(String(event.data)) as WsEvent);
    } catch {
      // Ignore malformed server events; HTTP history remains authoritative.
    }
  });

  return { close: () => socket.close() };
}
