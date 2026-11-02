import type { WsEvent } from "@dropchat/shared";

import type { ApiClient } from "./api";

export type SocketEventType = "message" | "close" | "error";

export interface SocketLike {
  addEventListener(
    type: SocketEventType,
    listener: (event: MessageEvent | CloseEvent | Event) => void,
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
  onReconnect?: () => void;
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
  let connectedOnce = false;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let socket: SocketLike | null = null;

  function scheduleReconnect(): void {
    if (timer) {
      return;
    }

    const delay = backoffDelay(attempt, random, baseDelayMs, maxDelayMs);
    attempt += 1;
    timer = setTimeout(() => {
      timer = undefined;
      void open().catch(() => {
        scheduleReconnect();
      });
    }, delay);
  }

  function handleDisconnect(): void {
    if (closed) {
      return;
    }
    socket = null;
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
      try {
        options.onEvent(
          JSON.parse(String((event as MessageEvent).data)) as WsEvent,
        );
      } catch {
        // Ignore malformed server events; HTTP history remains authoritative.
      }
    });
    next.addEventListener("close", handleDisconnect);
    next.addEventListener("error", handleDisconnect);

    const reconnected = connectedOnce;
    connectedOnce = true;
    attempt = 0;

    if (reconnected) {
      options.onReconnect?.();
    }
  }

  await open();

  return {
    close(): void {
      closed = true;
      if (timer) {
        clearTimeout(timer);
      }
      socket?.close();
    },
  };
}
