import type {
  ClientSignalMessage,
  ClientTextMessage,
  RtcSignal,
  WsEvent,
} from "@dropchat/shared";

import type { ApiClient } from "./api";

export type SocketEventType = "message" | "open" | "close" | "error";

/**
 * Lifecycle of a realtime session.
 *
 * CONNECTING -> CONNECTED -> DISCONNECTED/ERROR -> CONNECTING ...
 * DISCONNECTED means a clean close; ERROR means a transport or ticket
 * failure. Both are recoverable and lead to an automatic retry.
 */
export type SocketState =
  | "CONNECTING"
  | "CONNECTED"
  | "DISCONNECTED"
  | "ERROR";

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
  // Fires only on actual transitions, so the UI can render the current
  // lifecycle state without receiving duplicate updates.
  onStateChange?: (state: SocketState) => void;
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
  let state: SocketState = "CONNECTING";

  function setState(next: SocketState): void {
    // Skip no-op transitions (e.g. CONNECTING while the first ticket is
    // already being requested) to keep React renders predictable.
    if (state === next) {
      return;
    }
    state = next;
    options.onStateChange?.(next);
  }

  // Backoff is capped and jittered so reconnects from many tabs/devices do
  // not synchronize into a retry storm after a DPI/Wi-Fi outage.
  function scheduleReconnect(): void {
    const delay = backoffDelay(attempt, random, baseDelayMs, maxDelayMs);
    attempt += 1;
    timer = setTimeout(() => {
      timer = undefined;
      void open().catch(() => {
        setState("ERROR");
        options.onUnavailable?.();
        scheduleReconnect();
      });
    }, delay);
  }

  // A socket can emit both close and error for the same failure. The guards
  // below make this idempotent and ignore events from an already replaced
  // socket, so we schedule exactly one retry.
  function handleDisconnect(
    disconnected: SocketLike,
    nextState: "DISCONNECTED" | "ERROR",
  ): void {
    if (closed || socket !== disconnected) {
      return;
    }
    socket = null;
    try {
      disconnected.close();
    } catch {
      // The socket may already be closed.
    }
    setState(nextState);
    options.onUnavailable?.();
    scheduleReconnect();
  }

  async function open(): Promise<void> {
    // The ticket request is part of connecting, not a connected session.
    setState("CONNECTING");
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
      // A successful handshake is the only place where backoff resets.
      attempt = 0;
      setState("CONNECTED");
      options.onReconnect?.();
    });
    next.addEventListener("close", () => handleDisconnect(next, "DISCONNECTED"));
    next.addEventListener("error", () => handleDisconnect(next, "ERROR"));
  }

  const connection: RealtimeConnection = {
    close(): void {
      // Tear down both the pending retry timer and the live socket. This is
      // called from the app effect cleanup on unmount or identity change.
      closed = true;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      setState("DISCONNECTED");
      socket?.close();
      socket = null;
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
    setState("ERROR");
    options.onUnavailable?.();
    scheduleReconnect();
  });

  return connection;
}
