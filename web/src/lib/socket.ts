import type {
  ClientSignalMessage,
  ClientTextMessage,
  RtcSignal,
  WsEvent,
} from "@dropchat/shared";

import type { ApiClient } from "./api";

export type SocketEventType = "message" | "open" | "close" | "error";

export interface SocketLike {
  addEventListener(
    type: SocketEventType,
    listener: (event: MessageEvent | CloseEvent | Event) => void,
  ): void;
  close(): void;
  send(data: string): void;
}

export interface RealtimeConnection {
  close(): void;
  sendSignal(toDeviceId: string, signal: RtcSignal): void;
  sendMessage?(toDeviceId: string, text: string, clientId: string): void;
}

export interface ConnectRealtimeOptions {
  api: Pick<ApiClient, "createWsTicket">;
  apiUrl: string;
  fallbackOrigin: string;
  createWebSocket: (url: string) => SocketLike;
  onEvent: (event: WsEvent) => void;
  onReconnect?: () => void;
  onUnavailable?: () => void;
  random?: () => number;
  baseDelayMs?: number;
  maxDelayMs?: number;
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

export function backoffDelay(
  attempt: number,
  random: () => number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  const cap = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
  return Math.round(cap / 2 + random() * (cap / 2));
}

export async function connectRealtime(
  options: ConnectRealtimeOptions,
): Promise<RealtimeConnection> {
  const random = options.random ?? Math.random;
  const baseDelayMs = options.baseDelayMs ?? 1_000;
  const maxDelayMs = options.maxDelayMs ?? 30_000;

  let closed = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let socket: SocketLike | null = null;

  function scheduleReconnect(): void {
    const delay = backoffDelay(attempt, random, baseDelayMs, maxDelayMs);
    attempt += 1;
    timer = setTimeout(() => {
      timer = undefined;
      void open().catch(() => {
        scheduleReconnect();
      });
    }, delay);
  }

  function handleDisconnect(disconnected: SocketLike): void {
    if (closed || socket !== disconnected) {
      return;
    }
    socket = null;
    try {
      disconnected.close();
    } catch {
      // The socket may already be closed.
    }
    options.onUnavailable?.();
    scheduleReconnect();
  }

  async function open(): Promise<void> {
    const { ticket } = await options.api.createWsTicket();
    if (closed) {
      return;
    }

    const next = options.createWebSocket(
      buildWsUrl(options.apiUrl, options.fallbackOrigin, ticket),
    );
    socket = next;

    next.addEventListener("message", (event) => {
      if (closed || socket !== next) {
        return;
      }
      try {
        options.onEvent(
          JSON.parse(String((event as MessageEvent).data)) as WsEvent,
        );
      } catch {
        // Ignore malformed server events; HTTP history remains authoritative.
      }
    });
    next.addEventListener("open", () => {
      if (closed || socket !== next) {
        return;
      }
      attempt = 0;
      options.onReconnect?.();
    });
    next.addEventListener("close", () => handleDisconnect(next));
    next.addEventListener("error", () => handleDisconnect(next));
  }

  const connection: RealtimeConnection = {
    close(): void {
      closed = true;
      if (timer) {
        clearTimeout(timer);
      }
      socket?.close();
    },

    sendSignal(toDeviceId: string, signal: RtcSignal): void {
      if (!socket || closed) {
        throw new Error("socket_not_open");
      }
      const message: ClientSignalMessage = {
        type: "signal",
        toDeviceId,
        signal,
      };
      socket.send(JSON.stringify(message));
    },

    sendMessage(toDeviceId: string, text: string, clientId: string): void {
      if (!socket || closed) {
        throw new Error("socket_not_open");
      }
      const message: ClientTextMessage = {
        type: "send_message",
        toDeviceId,
        text,
        clientId,
      };
      socket.send(JSON.stringify(message));
    },
  };

  void open().catch(() => {
    options.onUnavailable?.();
    scheduleReconnect();
  });

  return connection;
}
