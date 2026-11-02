import { act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RtcSignal, WsEvent } from "@dropchat/shared";

import {
  backoffDelay,
  buildWsUrl,
  connectRealtime,
  type SocketLike,
} from "./socket";

type SocketEvent = "message" | "open" | "close" | "error";

function fakeSocket() {
  const listeners: Partial<Record<SocketEvent, (event: unknown) => void>> = {};
  const socket: SocketLike = {
    addEventListener: (type, listener) => {
      listeners[type] = listener as (event: unknown) => void;
    },
    close: vi.fn(),
    send: vi.fn(),
  };

  return {
    socket,
    emitMessage(data: string) {
      listeners.message?.({ data } as MessageEvent);
    },
    emitOpen() {
      listeners.open?.({});
    },
    emitClose() {
      listeners.close?.({});
    },
    emitError() {
      listeners.error?.({});
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

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

describe("backoffDelay", () => {
  it("applies exponential growth, jitter, and a maximum", () => {
    expect(backoffDelay(0, () => 0, 1_000, 30_000)).toBe(500);
    expect(backoffDelay(0, () => 1, 1_000, 30_000)).toBe(1_000);
    expect(backoffDelay(1, () => 0, 1_000, 30_000)).toBe(1_000);
    expect(backoffDelay(10, () => 0, 1_000, 30_000)).toBe(15_000);
  });
});

describe("connectRealtime", () => {
  it("requests a ticket, connects, and forwards parsed events", async () => {
    const api = {
      createWsTicket: vi.fn(async () => ({ ticket: "ticket-1", expiresAt: 1 })),
    };
    const { socket, emitMessage, emitOpen } = fakeSocket();
    const createWebSocket = vi.fn(() => socket);
    const onEvent = vi.fn<(event: WsEvent) => void>();
    const onReconnect = vi.fn();

    const connection = await connectRealtime({
      api,
      apiUrl: "https://api.example",
      fallbackOrigin: "https://dropchat.example",
      createWebSocket,
      onEvent,
      onReconnect,
    });

    expect(createWebSocket).toHaveBeenCalledWith(
      "wss://api.example/api/ws?ticket=ticket-1",
    );
    expect(onReconnect).not.toHaveBeenCalled();
    emitOpen();
    expect(onReconnect).toHaveBeenCalledTimes(1);

    const event: WsEvent = {
      type: "presence",
      deviceId: "peer-1",
      online: true,
    };
    emitMessage(JSON.stringify(event));
    expect(onEvent).toHaveBeenCalledWith(event);

    const signal: RtcSignal = { kind: "offer", sdp: "v=0" };
    connection.sendSignal("peer-1", signal);
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "signal", toDeviceId: "peer-1", signal }),
    );

    connection.close();
    expect(socket.close).toHaveBeenCalledTimes(1);
    expect(() =>
      connection.sendSignal("peer-1", signal),
    ).toThrow("socket_not_open");
  });

  it("ignores malformed events", async () => {
    const api = {
      createWsTicket: vi.fn(async () => ({ ticket: "ticket-1", expiresAt: 1 })),
    };
    const { socket, emitMessage } = fakeSocket();
    const onEvent = vi.fn<(event: WsEvent) => void>();

    await connectRealtime({
      api,
      apiUrl: "",
      fallbackOrigin: "https://dropchat.example",
      createWebSocket: () => socket,
      onEvent,
    });

    emitMessage("{");

    expect(onEvent).not.toHaveBeenCalled();
  });

  it("reconnects with exponential backoff and jitter", async () => {
    vi.useFakeTimers();
    const api = {
      createWsTicket: vi
        .fn()
        .mockResolvedValueOnce({ ticket: "ticket-1", expiresAt: 1 })
        .mockResolvedValueOnce({ ticket: "ticket-2", expiresAt: 2 })
        .mockResolvedValueOnce({ ticket: "ticket-3", expiresAt: 3 }),
    };
    const sockets = [fakeSocket(), fakeSocket(), fakeSocket()];
    const createWebSocket = vi.fn(() => sockets[createWebSocket.mock.calls.length - 1]!.socket);
    const onReconnect = vi.fn();
    const onUnavailable = vi.fn();

    await connectRealtime({
      api,
      apiUrl: "",
      fallbackOrigin: "https://dropchat.example",
      createWebSocket,
      onEvent: vi.fn(),
      onReconnect,
      onUnavailable,
      random: () => 0,
    });
    sockets[0]!.emitOpen();
    expect(onReconnect).toHaveBeenCalledTimes(1);
    expect(onUnavailable).not.toHaveBeenCalled();

    sockets[0]!.emitClose();
    expect(onUnavailable).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(499);
    expect(api.createWsTicket).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(api.createWsTicket).toHaveBeenCalledTimes(2);
    sockets[1]!.emitOpen();
    expect(onReconnect).toHaveBeenCalledTimes(2);

    sockets[1]!.emitClose();
    await vi.advanceTimersByTimeAsync(499);
    expect(api.createWsTicket).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(api.createWsTicket).toHaveBeenCalledTimes(3);
    sockets[2]!.emitOpen();
    expect(onReconnect).toHaveBeenCalledTimes(3);
  });

  it("retries after a ticket failure during reconnect", async () => {
    vi.useFakeTimers();
    const api = {
      createWsTicket: vi
        .fn()
        .mockResolvedValueOnce({ ticket: "ticket-1", expiresAt: 1 })
        .mockRejectedValueOnce(new Error("ticket failed"))
        .mockResolvedValueOnce({ ticket: "ticket-2", expiresAt: 2 }),
    };
    const sockets = [fakeSocket(), fakeSocket()];
    const createWebSocket = vi.fn(
      () => sockets[createWebSocket.mock.calls.length - 1]!.socket,
    );
    const onReconnect = vi.fn();

    await connectRealtime({
      api,
      apiUrl: "",
      fallbackOrigin: "https://dropchat.example",
      createWebSocket,
      onEvent: vi.fn(),
      onReconnect,
      random: () => 0,
    });

    sockets[0]!.emitOpen();
    sockets[0]!.emitError();
    await vi.advanceTimersByTimeAsync(500);
    expect(api.createWsTicket).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(api.createWsTicket).toHaveBeenCalledTimes(3);
    sockets[1]!.emitOpen();
    expect(onReconnect).toHaveBeenCalledTimes(2);
  });

  it("stops reconnecting after close", async () => {
    vi.useFakeTimers();
    const api = {
      createWsTicket: vi.fn(async () => ({ ticket: "ticket-1", expiresAt: 1 })),
    };
    const { socket, emitClose } = fakeSocket();

    const connection = await connectRealtime({
      api,
      apiUrl: "",
      fallbackOrigin: "https://dropchat.example",
      createWebSocket: () => socket,
      onEvent: vi.fn(),
      random: () => 0,
    });

    emitClose();
    connection.close();
    emitClose();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(api.createWsTicket).toHaveBeenCalledTimes(1);
  });


  it("schedules only one reconnect for close and error without a callback", async () => {
    vi.useFakeTimers();
    const api = {
      createWsTicket: vi
        .fn()
        .mockResolvedValueOnce({ ticket: "ticket-1", expiresAt: 1 })
        .mockResolvedValueOnce({ ticket: "ticket-2", expiresAt: 2 }),
    };
    const sockets = [fakeSocket(), fakeSocket()];
    const createWebSocket = vi.fn(
      () => sockets[createWebSocket.mock.calls.length - 1]!.socket,
    );

    await connectRealtime({
      api,
      apiUrl: "",
      fallbackOrigin: "https://dropchat.example",
      createWebSocket,
      onEvent: vi.fn(),
      random: () => 0,
    });

    sockets[0]!.emitClose();
    sockets[0]!.emitError();
    await vi.advanceTimersByTimeAsync(500);

    expect(api.createWsTicket).toHaveBeenCalledTimes(2);
    expect(createWebSocket).toHaveBeenCalledTimes(2);
  });

  it("ignores close events from a replaced socket", async () => {
    vi.useFakeTimers();
    const api = {
      createWsTicket: vi
        .fn()
        .mockResolvedValueOnce({ ticket: "ticket-1", expiresAt: 1 })
        .mockResolvedValueOnce({ ticket: "ticket-2", expiresAt: 2 }),
    };
    const sockets = [fakeSocket(), fakeSocket(), fakeSocket()];
    const createWebSocket = vi.fn(
      () => sockets[createWebSocket.mock.calls.length - 1]!.socket,
    );

    await connectRealtime({
      api,
      apiUrl: "",
      fallbackOrigin: "https://dropchat.example",
      createWebSocket,
      onEvent: vi.fn(),
      random: () => 0,
    });

    sockets[0]!.emitClose();
    await vi.advanceTimersByTimeAsync(500);
    expect(createWebSocket).toHaveBeenCalledTimes(2);

    sockets[0]!.emitClose();
    sockets[0]!.emitError();
    await vi.advanceTimersByTimeAsync(500);
    expect(createWebSocket).toHaveBeenCalledTimes(2);
  });

  it("does not create a socket if closed while reconnecting", async () => {
    vi.useFakeTimers();
    let resolveTicket!: (value: { ticket: string; expiresAt: number }) => void;
    const api = {
      createWsTicket: vi
        .fn()
        .mockResolvedValueOnce({ ticket: "ticket-1", expiresAt: 1 })
        .mockImplementationOnce(
          () =>
            new Promise<{ ticket: string; expiresAt: number }>((resolve) => {
              resolveTicket = resolve;
            }),
        ),
    };
    const sockets = [fakeSocket(), fakeSocket()];
    const createWebSocket = vi.fn(
      () => sockets[createWebSocket.mock.calls.length - 1]!.socket,
    );

    const connection = await connectRealtime({
      api,
      apiUrl: "",
      fallbackOrigin: "https://dropchat.example",
      createWebSocket,
      onEvent: vi.fn(),
      random: () => 0,
    });

    sockets[0]!.emitClose();
    await vi.advanceTimersByTimeAsync(500);
    connection.close();

    await act(async () => {
      resolveTicket({ ticket: "ticket-2", expiresAt: 2 });
    });

    expect(createWebSocket).toHaveBeenCalledTimes(1);
  });

  it("reports initial ticket errors and recovers in the background", async () => {
    vi.useFakeTimers();
    const api = {
      createWsTicket: vi
        .fn()
        .mockRejectedValueOnce(new Error("ticket failed"))
        .mockResolvedValueOnce({ ticket: "ticket-2", expiresAt: 2 }),
    };
    const { socket, emitOpen } = fakeSocket();
    const createWebSocket = vi.fn(() => socket);
    const onReconnect = vi.fn();
    const onUnavailable = vi.fn();

    const connection = await connectRealtime({
      api,
      apiUrl: "",
      fallbackOrigin: "https://dropchat.example",
      createWebSocket,
      onEvent: vi.fn(),
      onReconnect,
      onUnavailable,
      random: () => 0,
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(createWebSocket).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);
    expect(createWebSocket).toHaveBeenCalledTimes(1);
    expect(onReconnect).not.toHaveBeenCalled();
    emitOpen();
    expect(onReconnect).toHaveBeenCalledTimes(1);

    connection.close();
  });
});
