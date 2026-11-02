import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import {
  DEVICE_A,
  DEVICE_B,
  DEVICE_C,
  NOW,
  SECRET_A,
  SECRET_B,
  SECRET_C,
  api,
  authHeaders,
  linkDevices,
  makeApp,
  register,
} from "./helpers";

function post(
  app: ReturnType<typeof makeApp>,
  peerId: string,
  body: unknown,
  deviceId = DEVICE_A,
  secret = SECRET_A,
): Promise<Response> {
  return api(app, `/api/chats/${peerId}/p2p-files`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authHeaders(deviceId, secret),
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/chats/:peerId/p2p-files", () => {
  it("stores a P2P file message without a Drive file", async () => {
    const app = makeApp();
    await register(app);
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B });
    await linkDevices(DEVICE_A, DEVICE_B);

    const response = await post(app, DEVICE_B, {
      id: "file-transfer-001",
      name: "local.bin",
      size: 42,
      mime: "application/octet-stream",
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      message: Record<string, unknown>;
    };
    expect(body.message).toMatchObject({
      id: "file-transfer-001",
      kind: "file",
      fromDevice: DEVICE_A,
      toDevice: DEVICE_B,
      fileId: null,
      fileName: "local.bin",
      fileSize: 42,
      mime: "application/octet-stream",
      transport: "p2p",
      status: "sent",
      expiresAt: NOW + 30 * 86_400_000,
    });

    const row = await env.DB.prepare(
      "SELECT transport, file_id FROM messages WHERE id = ?",
    )
      .bind(body.message.id as string)
      .first<{ transport: string; file_id: string | null }>();
    expect(row).toEqual({ transport: "p2p", file_id: null });
  });

  it("rejects invalid metadata, non-peers, and unauthorized calls", async () => {
    const app = makeApp();
    await register(app);
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B });
    await register(app, { deviceId: DEVICE_C, secret: SECRET_C });
    await linkDevices(DEVICE_A, DEVICE_B);

    expect(
      (
        await post(app, DEVICE_C, { name: "x", size: 1, mime: "x" })
      ).status,
    ).toBe(403);

    for (const body of [
      {},
      { name: "", size: 1, mime: "x" },
      { name: "x", size: 0, mime: "x" },
      { name: "x", size: 1, mime: "" },
      { id: "short", name: "x", size: 1, mime: "x" },
      { id: 1, name: "x", size: 1, mime: "x" },
    ]) {
      expect((await post(app, DEVICE_B, body)).status).toBe(400);
    }

    expect(
      (
        await api(app, `/api/chats/${DEVICE_B}/p2p-files`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        })
      ).status,
    ).toBe(401);
  });


  it("rejects malformed and non-object bodies", async () => {
    const app = makeApp();
    await register(app);
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B });
    await linkDevices(DEVICE_A, DEVICE_B);

    for (const body of ["{", "null", "[]"]) {
      const response = await api(app, `/api/chats/${DEVICE_B}/p2p-files`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...authHeaders(DEVICE_A, SECRET_A),
        },
        body,
      });
      expect(response.status).toBe(400);
    }
  });

  it("shares the message write rate limit", async () => {
    const app = createApp({
      now: () => NOW,
      messageLimitPerMinute: 1,
    });
    await register(app);
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B });
    await linkDevices(DEVICE_A, DEVICE_B);

    expect(
      (
        await post(app, DEVICE_B, {
          name: "one.bin",
          size: 1,
          mime: "application/octet-stream",
        })
      ).status,
    ).toBe(201);
    expect(
      (
        await post(app, DEVICE_B, {
          name: "two.bin",
          size: 1,
          mime: "application/octet-stream",
        })
      ).status,
    ).toBe(429);
  });
});
