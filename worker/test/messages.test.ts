import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";
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
  nextSocketEvent,
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
    const app = createApp({ now: () => NOW });
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
      clientId: "msg-0001",
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { message: MessageBody };
    expect(body.message).toEqual({
      id: "msg-0001",
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
      .bind("msg-0001")
      .first<{ text: string; expires_at: number }>();
    expect(row?.text).toBe("Привет");
    expect(row?.expires_at).toBe(NOW + 30 * 86_400_000);
  });

  it("accepts long text without a length limit", async () => {
    const app = makeApp();
    await register(app);
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B });
    await linkDevices(DEVICE_A, DEVICE_B);
    const text = "x".repeat(50_000);

    const response = await sendText(app, DEVICE_B, {
      kind: "text",
      text,
      clientId: "msg-max-1",
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { message: MessageBody };
    expect(body.message.text).toBe(text);
  });

  it.each([
    ["empty", ""],
    ["whitespace", "   "],
    ["non-string", 123],
  ])("rejects invalid text: %s", async (_label, text) => {
    const app = makeApp();
    await register(app);
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B });
    await linkDevices(DEVICE_A, DEVICE_B);

    const response = await sendText(app, DEVICE_B, {
      kind: "text",
      text,
      clientId: "msg-max-1",
    });

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

    const response = await sendText(app, DEVICE_B, {
      kind: "file",
      text: "x",
      clientId: "msg-file",
    });

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


  it("is idempotent for the same client id", async () => {
    const app = makeApp();
    await register(app);
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B });
    await linkDevices(DEVICE_A, DEVICE_B);
    const body = { kind: "text", text: "once", clientId: "client-msg-1" };

    const first = await sendText(app, DEVICE_B, body);
    const second = await sendText(app, DEVICE_B, body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(await first.clone().json());

    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM messages WHERE id = ?",
    )
      .bind("client-msg-1")
      .first<{ count: number }>();
    expect(count?.count).toBe(1);
  });

  it("rejects reusing a client id for a different message", async () => {
    const app = makeApp();
    await register(app);
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B });
    await linkDevices(DEVICE_A, DEVICE_B);

    expect(
      (
        await sendText(app, DEVICE_B, {
          kind: "text",
          text: "first",
          clientId: "client-msg-2",
        })
      ).status,
    ).toBe(201);

    const conflict = await sendText(app, DEVICE_B, {
      kind: "text",
      text: "second",
      clientId: "client-msg-2",
    });

    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ error: "id_conflict" });
  });

  it.each([
    ["missing", undefined],
    ["short", "short"],
    ["invalid", "bad id"],
  ])("rejects invalid client id: %s", async (_label, clientId) => {
    const app = makeApp();
    await register(app);
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B });
    await linkDevices(DEVICE_A, DEVICE_B);

    const response = await sendText(app, DEVICE_B, {
      kind: "text",
      text: "hello",
      clientId,
    });

    expect(response.status).toBe(400);
  });


  it("does not fail the HTTP response when Hub notification fails", async () => {
    const app = createApp({
      now: () => NOW,
      notifyEvent: async () => {
        throw new Error("hub down");
      },
    });
    await register(app);
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B });
    await linkDevices(DEVICE_A, DEVICE_B);

    const response = await sendText(app, DEVICE_B, {
      kind: "text",
      text: "still saved",
      clientId: "msg-hub-down",
    });

    expect(response.status).toBe(201);
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM messages WHERE id = ?",
    )
      .bind("msg-hub-down")
      .first<{ count: number }>();
    expect(count?.count).toBe(1);
  });

  it("pushes message.new to the recipient socket", async () => {
    const app = createApp({ now: () => NOW });
    await register(app);
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B });
    await linkDevices(DEVICE_A, DEVICE_B);
    const { socket } = await openSocket(app, DEVICE_B, SECRET_B);
    const eventPromise = nextSocketEvent(socket, "message.new");

    const response = await sendText(app, DEVICE_B, {
      kind: "text",
      text: "push",
      clientId: "msg-push",
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
    const app = createApp({ now: () => NOW });
    await register(app, { deviceId: DEVICE_A, name: "Alpha" });
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B, name: "Beta" });
    await linkDevices(DEVICE_A, DEVICE_B);

    for (const text of ["one", "two", "three"]) {
      expect(
        (
          await sendText(app, DEVICE_B, {
            kind: "text",
            text,
            clientId: `msg-000${++sequence}`,
          })
        ).status,
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
      "msg-0002",
      "msg-0003",
    ]);
    expect(firstBody.nextBefore).toBe("msg-0002");

    const second = await api(
      app,
      `/api/chats/${DEVICE_B}/messages?before=msg-0002&limit=2`,
      { headers: authHeaders(DEVICE_A, SECRET_A) },
    );
    const secondBody = (await second.json()) as {
      messages: MessageBody[];
      nextBefore: string | null;
    };
    expect(secondBody.messages.map((message) => message.id)).toEqual(["msg-0001"]);
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

describe("DELETE /api/chats/:peerId/messages/:messageId", () => {
  it("deletes an authored message for both participants", async () => {
    const notify = vi.fn(async () => undefined);
    const app = createApp({ now: () => NOW, notifyEvent: notify });
    await register(app, { deviceId: DEVICE_A, name: "Alpha" });
    await register(app, {
      deviceId: DEVICE_B,
      secret: SECRET_B,
      name: "Beta",
    });
    await linkDevices(DEVICE_A, DEVICE_B);
    await sendText(app, DEVICE_B, {
      kind: "text",
      text: "Удалить меня",
      clientId: "msg-delete-1",
    });
    notify.mockClear();

    const response = await api(
      app,
      `/api/chats/${DEVICE_B}/messages/msg-delete-1`,
      { method: "DELETE", headers: authHeaders(DEVICE_A, SECRET_A) },
    );

    expect(response.status).toBe(204);
    const row = await env.DB.prepare(
      "SELECT id FROM messages WHERE id = ?",
    )
      .bind("msg-delete-1")
      .first<{ id: string }>();
    expect(row).toBeNull();
    const tombstone = await env.DB.prepare(
      "SELECT id FROM message_deletions WHERE id = ?",
    )
      .bind("msg-delete-1")
      .first<{ id: string }>();
    expect(tombstone?.id).toBe("msg-delete-1");
    expect(notify).toHaveBeenCalledWith(
      env,
      DEVICE_A,
      expect.objectContaining({
        type: "message.deleted",
        peerId: DEVICE_B,
        messageId: "msg-delete-1",
        fileId: null,
      }),
    );
    expect(notify).toHaveBeenCalledWith(
      env,
      DEVICE_B,
      expect.objectContaining({
        type: "message.deleted",
        peerId: DEVICE_A,
        messageId: "msg-delete-1",
      }),
    );

    const page = await api(app, `/api/chats/${DEVICE_B}/messages`, {
      headers: authHeaders(DEVICE_A, SECRET_A),
    });
    expect(await page.json()).toEqual({
      messages: [],
      nextBefore: null,
      deletedIds: ["msg-delete-1"],
    });

    const repeated = await api(
      app,
      `/api/chats/${DEVICE_B}/messages/msg-delete-1`,
      { method: "DELETE", headers: authHeaders(DEVICE_A, SECRET_A) },
    );
    expect(repeated.status).toBe(404);
  });

  it("does not let the recipient delete someone else's message", async () => {
    const app = makeApp();
    await register(app);
    await register(app, { deviceId: DEVICE_B, secret: SECRET_B });
    await linkDevices(DEVICE_A, DEVICE_B);
    await sendText(app, DEVICE_B, {
      kind: "text",
      text: "Моё",
      clientId: "msg-delete-2",
    });

    const response = await api(
      app,
      `/api/chats/${DEVICE_A}/messages/msg-delete-2`,
      { method: "DELETE", headers: authHeaders(DEVICE_B, SECRET_B) },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden" });
  });

  it("requires authentication and rejects unknown messages", async () => {
    const app = makeApp();
    await register(app);

    const anonymous = await api(
      app,
      `/api/chats/${DEVICE_B}/messages/missing`,
      { method: "DELETE" },
    );
    expect(anonymous.status).toBe(401);

    const missing = await api(
      app,
      `/api/chats/${DEVICE_B}/messages/missing`,
      { method: "DELETE", headers: authHeaders(DEVICE_A, SECRET_A) },
    );
    expect(missing.status).toBe(404);
  });
});
