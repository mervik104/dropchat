import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { consumeEndpointAttempt } from "../src/rate-limit";

import {
  DEVICE_A,
  DEVICE_B,
  SECRET_A,
  SECRET_B,
  linkDevices,
  makeApp,
  nextSocketEvent,
  openSocket,
  register,
} from "./helpers";

async function linkedSockets() {
  const app = makeApp();
  await register(app, { deviceId: DEVICE_A, name: "Alpha" });
  await register(app, { deviceId: DEVICE_B, secret: SECRET_B, name: "Beta" });
  await linkDevices(DEVICE_A, DEVICE_B);
  const { socket: sender } = await openSocket(app, DEVICE_A, SECRET_A);
  const { socket: recipient } = await openSocket(app, DEVICE_B, SECRET_B);
  return { sender, recipient };
}

describe("WebSocket text messages", () => {
  it("persists a message and broadcasts it to both devices", async () => {
    const { sender, recipient } = await linkedSockets();
    const senderEvent = nextSocketEvent(sender, "message.new");
    const recipientEvent = nextSocketEvent(recipient, "message.new");

    sender.send(
      JSON.stringify({
        type: "send_message",
        toDeviceId: DEVICE_B,
        text: "  Привет через WS  ",
        clientId: "ws-msg-0001",
      }),
    );

    await expect(senderEvent).resolves.toMatchObject({
      type: "message.new",
      message: {
        id: "ws-msg-0001",
        text: "Привет через WS",
        fromDevice: DEVICE_A,
        toDevice: DEVICE_B,
        kind: "text",
      },
    });
    await expect(recipientEvent).resolves.toMatchObject({
      type: "message.new",
      message: { id: "ws-msg-0001", text: "Привет через WS" },
    });

    const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM messages WHERE id = ?")
      .bind("ws-msg-0001")
      .first<{ count: number }>();
    expect(row?.count).toBe(1);
  });

  it("is idempotent for a repeated client id", async () => {
    const { sender } = await linkedSockets();
    const payload = JSON.stringify({
      type: "send_message",
      toDeviceId: DEVICE_B,
      text: "Повтор",
      clientId: "ws-msg-dup1",
    });
    const first = nextSocketEvent(sender, "message.new");
    sender.send(payload);
    await first;

    const second = nextSocketEvent(sender, "message.new");
    sender.send(payload);
    await expect(second).resolves.toMatchObject({
      type: "message.new",
      message: { id: "ws-msg-dup1" },
    });

    const row = await env.DB.prepare("SELECT COUNT(*) AS count FROM messages WHERE id = ?")
      .bind("ws-msg-dup1")
      .first<{ count: number }>();
    expect(row?.count).toBe(1);
  });

  it("rejects malformed and unlinked messages without dropping the socket", async () => {
    const { sender } = await linkedSockets();

    const malformed = nextSocketEvent(sender, "message.error");
    sender.send(
      JSON.stringify({
        type: "send_message",
        text: "no target",
        clientId: "ws-bad-0001",
      }),
    );
    await expect(malformed).resolves.toMatchObject({
      type: "message.error",
      peerId: "",
      clientId: "ws-bad-0001",
      code: "invalid_request",
    });

    const missingClientId = nextSocketEvent(sender, "message.error");
    sender.send(
      JSON.stringify({
        type: "send_message",
        text: "no client id",
        clientId: 123,
      }),
    );
    await expect(missingClientId).resolves.toMatchObject({
      type: "message.error",
      peerId: "",
      clientId: "",
      code: "invalid_request",
    });

    const invalidText = nextSocketEvent(sender, "message.error");
    sender.send(
      JSON.stringify({
        type: "send_message",
        toDeviceId: DEVICE_B,
        text: "   ",
        clientId: "ws-bad-0002",
      }),
    );
    await expect(invalidText).resolves.toMatchObject({
      type: "message.error",
      peerId: DEVICE_B,
      clientId: "ws-bad-0002",
      code: "invalid_request",
    });
  });

  it("reports a rate limit over the socket", async () => {
    const { sender } = await linkedSockets();
    const windowStart = Math.floor(Date.now() / 60_000) * 60_000;
    await env.DB.prepare(
      `INSERT INTO endpoint_rate_limits (key, window_start, count)
       VALUES (?, ?, 999)
       ON CONFLICT(key) DO UPDATE SET count = 999, window_start = excluded.window_start`,
    )
      .bind(`message:${DEVICE_A}`, windowStart)
      .run();

    const direct = await consumeEndpointAttempt(
      env.DB,
      `message:${DEVICE_A}`,
      Date.now(),
      60_000,
      60,
    );
    expect(direct.allowed).toBe(false);

    const error = nextSocketEvent(sender, "message.error");
    sender.send(
      JSON.stringify({
        type: "send_message",
        toDeviceId: DEVICE_B,
        text: "slow",
        clientId: "ws-rate-001",
      }),
    );

    await expect(error).resolves.toMatchObject({
      type: "message.error",
      code: "rate_limited",
    });
  });
});
