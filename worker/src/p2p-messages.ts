import { buildChatKey, type ChatMessage } from "@dropchat/shared";
import type { Context } from "hono";

import type { AppEnv } from "./auth";
import type { Notifier } from "./notify";
import { enforceEndpointLimit } from "./rate-limit";
import { areLinked } from "./relations";

const MESSAGE_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export async function sendP2PFileMessage(
  c: Context<AppEnv>,
  now: () => number,
  notify: Notifier,
  messageLimitPerMinute: number,
): Promise<Response> {
  const peerId = c.req.param("peerId")!;
  const current = c.get("device");
  if (!(await areLinked(c.env.DB, current.id, peerId))) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const limited = await enforceEndpointLimit(
    c,
    "message",
    now(),
    60_000,
    messageLimitPerMinute,
  );
  if (limited) {
    return limited;
  }

  let input: unknown;
  try {
    input = await c.req.json();
  } catch {
    return invalidRequest();
  }
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return invalidRequest();
  }

  const record = input as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name.trim() : "";
  const size = record.size;
  const mime = record.mime;
  const rawId = record.id;
  if (
    name.length === 0 ||
    name.length > 255 ||
    typeof size !== "number" ||
    !Number.isInteger(size) ||
    size <= 0 ||
    typeof mime !== "string" ||
    mime.length === 0 ||
    mime.length > 255 ||
    (rawId !== undefined &&
      (typeof rawId !== "string" || !MESSAGE_ID_PATTERN.test(rawId)))
  ) {
    return invalidRequest();
  }

  const createdAt = now();
  const message: ChatMessage = {
    id: typeof rawId === "string" ? rawId : crypto.randomUUID(),
    chatKey: buildChatKey(current.id, peerId),
    fromDevice: current.id,
    toDevice: peerId,
    kind: "file",
    text: null,
    fileId: null,
    fileName: name,
    fileSize: size,
    mime,
    transport: "p2p",
    status: "sent",
    createdAt,
    expiresAt: createdAt + Number(c.env.RETENTION_DAYS) * 86_400_000,
  };

  await c.env.DB.prepare(
    `INSERT INTO messages
      (id, chat_key, from_device, to_device, kind, text, file_id, file_name,
       file_size, mime, transport, status, created_at, expires_at)
     VALUES (?, ?, ?, ?, 'file', NULL, NULL, ?, ?, ?, 'p2p', 'sent', ?, ?)`,
  )
    .bind(
      message.id,
      message.chatKey,
      message.fromDevice,
      message.toDevice,
      name,
      size,
      mime,
      createdAt,
      message.expiresAt,
    )
    .run();

  await Promise.allSettled([
    notify(c.env, current.id, { type: "message.new", message }),
    notify(c.env, peerId, { type: "message.new", message }),
  ]);

  return c.json({ message }, 201);
}

function invalidRequest(): Response {
  return Response.json({ error: "invalid_request" }, { status: 400 });
}
