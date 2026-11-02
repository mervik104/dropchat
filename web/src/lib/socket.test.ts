import { describe, expect, it, vi } from "vitest";

import type { WsEvent } from "@dropchat/shared";

import {
  buildWsUrl,
  connectRealtime,
  type SocketLike,
} from "./socket";

function fakeSocket() {
  let listener: ((event: MessageEvent) => void) | null = null;
  const socket: SocketLike = {
    addEventListener: (_type, nextListener) => {
      listener = nextListener;
    },
    close: vi.fn(),
  };

  return {
    socket,
    emit(data: string) {
      listener?.({ data } as MessageEvent);
    },
  };
}

describe("buildWsUrl", () => {
  it("uses wss for https API URLs", () => {
    expect(
      buildWsUrl("https://api.example", "https://dropchat.example", "ticket-1"),
    ).toBe("wss://api.example/api/ws?ticket=ticket-1");
  });

  it("uses ws for http API URLs", () => {
    expect(
      buildWsUrl("http://127.0.0.1:8787", "http://localhost:5173", "ticket 1"),
    ).toBe("ws://127.0.0.1:8787/api/ws?ticket=ticket%201");
  });

  it("falls back to the web origin in local development", () => {
    expect(buildWsUrl("", "https://dropchat.example", "ticket-1")).toBe(
      "wss://dropchat.example/api/ws?ticket=ticket-1",
    );
  });
});

describe("connectRealtime", () => {
  it("requests a ticket, connects, and forwards parsed events", async () => {
    const api = {
      createWsTicket: vi.fn(async () => ({ ticket: "ticket-1", expiresAt: 1 })),
    };
    const { socket, emit } = fakeSocket();
    const createWebSocket = vi.fn(() => socket);
    const onEvent = vi.fn<(event: WsEvent) => void>();

    const connection = await connectRealtime({
      api,
      apiUrl: "https://api.example",
      fallbackOrigin: "https://dropchat.example",
      createWebSocket,
      onEvent,
    });

    expect(createWebSocket).toHaveBeenCalledWith(
      "wss://api.example/api/ws?ticket=ticket-1",
    );

    const event: WsEvent = {
      type: "presence",
      deviceId: "peer-1",
      online: true,
    };
    emit(JSON.stringify(event));
    expect(onEvent).toHaveBeenCalledWith(event);

    connection.close();
    expect(socket.close).toHaveBeenCalledTimes(1);
  });

  it("ignores malformed events", async () => {
    const api = {
      createWsTicket: vi.fn(async () => ({ ticket: "ticket-1", expiresAt: 1 })),
    };
    const { socket, emit } = fakeSocket();
    const onEvent = vi.fn<(event: WsEvent) => void>();

    await connectRealtime({
      api,
      apiUrl: "",
      fallbackOrigin: "https://dropchat.example",
      createWebSocket: () => socket,
      onEvent,
    });

    emit("{");

    expect(onEvent).not.toHaveBeenCalled();
  });

  it("propagates ticket errors", async () => {
    await expect(
      connectRealtime({
        api: {
          createWsTicket: vi.fn(async () => {
            throw new Error("ticket failed");
          }),
        },
        apiUrl: "",
        fallbackOrigin: "https://dropchat.example",
        createWebSocket: () => fakeSocket().socket,
        onEvent: vi.fn(),
      }),
    ).rejects.toThrow("ticket failed");
  });
});
