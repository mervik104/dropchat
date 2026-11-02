import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { buildChatKey } from "@dropchat/shared";

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
  nextSocketMessage,
  openSocket,
  register,
} from "./helpers";

interface MessageBody {
  id: string;
  chatKey: string;
  fromDevice: string;
  toDevice: string;
  kind: string;
  text: string | null;
  createdAt: number;
  expiresAt: number;
}

function jsonBody(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...authHeaders(DEVICE_A, SECRET_A),
    },
    body: JSON.stringify(body),
  };
}

function sendText(
  app: ReturnType<typeof makeApp>,
  peerId: string,
  body: unknown,
): Promise<Response> {
  return api(app, `/api/chats/${peerId}/messages`, jsonBody(body));
}

describe("POST /api/chats/:peerId/messages", () => {
  it("stores text, computes retention, and returns the message", async () => {
    const app = createApp({
      now: () => NOW,
      messageIdFactory: () => "msg-1",
    });
    await register(app, { deviceId: DEVICE_A, name: "Alpha" });
    await register(app, {
      deviceId: DEVICE_B,
      secret: SECRET_B,
      name: "Beta",
    });
    await linkDevices(DEVICE_A, DEVICE_B);

    const response = await sendText(app, DEVICE_B, {
      kind: "text",
      text: "Привет",
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { message: MessageBody };
    expect(body.message).toEqual({
      id: "msg-1",
      chatKey: buildChatKey(DEVICE_A, DEVICE_B),
      fromDevice: DEVICE_A,
      toDevice: DEVICE_B,
      kind: "text",
      text: "Привет",
      fileId: null,
      fileName: null,
      fileSize: null,
      mime: null,
      transport: null,
      status: "sent",
      createdAt: NOW,
      expiresAt: NOW + 30 * 86_400_000,
    });
    expect(JSON.stringify(body)).not.toContain(SECRET_A);

    const row = await env.DB.prepare(
      "SELECT text, expires_at FROM messages WHERE id = ?",
    )
      .bind("msg-1")
      .first<{ text: string; expires_at: number }>();
    expect(row?.text).toBe("Привет");
    expect(row?.expires_at).toBe(NOW + 30 * 86_400_000);
  });

  it("accepts exactly the maximum text length", async () => {
    const app = makeApp();
    await register(app);
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B });
    await linkDevices(DEVICE_A, DEVICE_B);
    const text = "x".repeat(4_000);

    const response = await sendText(app, DEVICE_B, { kind: "text", text });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { message: MessageBody };
    expect(body.message.text).toBe(text);
  });

  it.each([
    ["over the limit", "x".repeat(4_001)],
    ["empty", ""],
    ["whitespace", "   "],
    ["non-string", 123],
  ])("rejects invalid text: %s", async (_label, text) => {
    const app = makeApp();
    await register(app);
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B });
    await linkDevices(DEVICE_A, DEVICE_B);

    const response = await sendText(app, DEVICE_B, { kind: "text", text });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
  });


  it.each([
    ["null", null],
    ["array", []],
    ["primitive", "hello"],
  ])("rejects a non-object body: %s", async (_label, body) => {
    const app = makeApp();
    await register(app);
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B });
    await linkDevices(DEVICE_A, DEVICE_B);

    const response = await sendText(app, DEVICE_B, body);

    expect(response.status).toBe(400);
  });

  it("rejects non-text message kinds", async () => {
    const app = makeApp();
    await register(app);
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B });
    await linkDevices(DEVICE_A, DEVICE_B);

    const response = await sendText(app, DEVICE_B, { kind: "file", text: "x" });

    expect(response.status).toBe(400);
  });

  it("rejects malformed JSON", async () => {
    const app = makeApp();
    await register(app);
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B });
    await linkDevices(DEVICE_A, DEVICE_B);

    const response = await api(app, `/api/chats/${DEVICE_B}/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders(DEVICE_A, SECRET_A),
      },
      body: "{",
    });

    expect(response.status).toBe(400);
  });

  it("rejects messages to a non-linked device", async () => {
    const app = makeApp();
    await register(app);
    await register(app, { deviceId: DEVICE_C, secret: SECRET_C });

    const response = await sendText(app, DEVICE_C, {
      kind: "text",
      text: "hello",
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden" });
  });

  it("requires authentication", async () => {
    const response = await api(makeApp(), `/api/chats/${DEVICE_B}/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "text", text: "hello" }),
    });

    expect(response.status).toBe(401);
  });

  it("pushes message.new to the recipient socket", async () => {
    const app = createApp({
      now: () => NOW,
      messageIdFactory: () => "msg-push",
    });
    await register(app);
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B });
    await linkDevices(DEVICE_A, DEVICE_B);
    const { socket } = await openSocket(app, DEVICE_B, SECRET_B);
    const eventPromise = nextSocketMessage(socket);

    const response = await sendText(app, DEVICE_B, {
      kind: "text",
      text: "push",
    });

    expect(response.status).toBe(201);
    await expect(eventPromise).resolves.toEqual({
      type: "message.new",
      message: expect.objectContaining({ id: "msg-push", text: "push" }),
    });
  });
});

describe("GET /api/chats/:peerId/messages", () => {
  it("paginates newest messages first and pages backwards", async () => {
    let sequence = 0;
    const app = createApp({
      now: () => NOW,
      messageIdFactory: () => `msg-${++sequence}`,
    });
    await register(app, { deviceId: DEVICE_A, name: "Alpha" });
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B, name: "Beta" });
    await linkDevices(DEVICE_A, DEVICE_B);

    for (const text of ["one", "two", "three"]) {
      expect(
        (await sendText(app, DEVICE_B, { kind: "text", text })).status,
      ).toBe(201);
    }

    const first = await api(
      app,
      `/api/chats/${DEVICE_B}/messages?limit=2`,
      { headers: authHeaders(DEVICE_A, SECRET_A) },
    );
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as {
      messages: MessageBody[];
      nextBefore: string | null;
    };
    expect(firstBody.messages.map((message) => message.id)).toEqual([
      "msg-2",
      "msg-3",
    ]);
    expect(firstBody.nextBefore).toBe("msg-2");

    const second = await api(
      app,
      `/api/chats/${DEVICE_B}/messages?before=msg-2&limit=2`,
      { headers: authHeaders(DEVICE_A, SECRET_A) },
    );
    const secondBody = (await second.json()) as {
      messages: MessageBody[];
      nextBefore: string | null;
    };
    expect(secondBody.messages.map((message) => message.id)).toEqual(["msg-1"]);
    expect(secondBody.nextBefore).toBeNull();
  });

  it("returns an empty page", async () => {
    const app = makeApp();
    await register(app);
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B });
    await linkDevices(DEVICE_A, DEVICE_B);

    const response = await api(app, `/api/chats/${DEVICE_B}/messages`, {
      headers: authHeaders(DEVICE_A, SECRET_A),
    });

    expect(await response.json()).toEqual({ messages: [], nextBefore: null });
  });

  it.each(["0", "101", "abc"])("rejects invalid limit %s", async (limit) => {
    const app = makeApp();
    await register(app);
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B });
    await linkDevices(DEVICE_A, DEVICE_B);

    const response = await api(
      app,
      `/api/chats/${DEVICE_B}/messages?limit=${limit}`,
      { headers: authHeaders(DEVICE_A, SECRET_A) },
    );

    expect(response.status).toBe(400);
  });

  it("rejects unknown pagination cursors", async () => {
    const app = makeApp();
    await register(app);
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B });
    await linkDevices(DEVICE_A, DEVICE_B);

    const response = await api(
      app,
      `/api/chats/${DEVICE_B}/messages?before=missing`,
      { headers: authHeaders(DEVICE_A, SECRET_A) },
    );

    expect(response.status).toBe(400);
  });

  it("forbids reading a non-linked chat", async () => {
    const app = makeApp();
    await register(app);
    await register(app, { deviceId: DEVICE_C, secret: SECRET_C });

    const response = await api(app, `/api/chats/${DEVICE_C}/messages`, {
      headers: authHeaders(DEVICE_A, SECRET_A),
    });

    expect(response.status).toBe(403);
  });

  it("requires authentication", async () => {
    const response = await api(makeApp(), `/api/chats/${DEVICE_B}/messages`);

    expect(response.status).toBe(401);
  });
});
