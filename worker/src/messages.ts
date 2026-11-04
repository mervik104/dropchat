import {
  buildChatKey,
  type ChatMessage,
  type MessagesPage,
} from "@dropchat/shared";
import type { Context } from "hono";

import type { AppEnv } from "./auth";
import type { Notifier } from "./notify";
import { areLinked } from "./relations";

interface MessageRow {
  id: string;
  chat_key: string;
  from_device: string;
  to_device: string;
  kind: "text" | "file";
  text: string | null;
  file_id: string | null;
  file_name: string | null;
  file_size: number | null;
  mime: string | null;
  transport: "cloud" | "p2p" | null;
  status: string | null;
  created_at: number;
  expires_at: number;
}

export type MessageNotifier = Notifier;

export type StoreTextResult =
  | { ok: true; message: ChatMessage; duplicate: boolean }
  | {
      ok: false;
      code: "forbidden" | "invalid_request" | "id_conflict";
    };

export async function storeTextMessage(
  db: D1Database,
  fromDeviceId: string,
  toDeviceId: string,
  input: unknown,
  createdAt: number,
  maxLength: number,
  retentionDays: number,
): Promise<StoreTextResult> {
  if (!(await areLinked(db, fromDeviceId, toDeviceId))) {
    return { ok: false, code: "forbidden" };
  }

  const parsed = parseTextMessage(input, maxLength);
  if (!parsed.ok) {
    return { ok: false, code: "invalid_request" };
  }

  const message: ChatMessage = {
    id: parsed.clientId,
    chatKey: buildChatKey(fromDeviceId, toDeviceId),
    fromDevice: fromDeviceId,
    toDevice: toDeviceId,
    kind: "text",
    text: parsed.text,
    fileId: null,
    fileName: null,
    fileSize: null,
    mime: null,
    transport: null,
    status: "sent",
    createdAt,
    expiresAt: createdAt + retentionDays * 86_400_000,
  };

  const result = await db
    .prepare(
      `INSERT OR IGNORE INTO messages
        (id, chat_key, from_device, to_device, kind, text, file_id, file_name,
         file_size, mime, transport, status, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?, ?)`,
    )
    .bind(
      message.id,
      message.chatKey,
      message.fromDevice,
      message.toDevice,
      message.kind,
      message.text,
      message.status,
      message.createdAt,
      message.expiresAt,
    )
    .run();

  if (result.meta.changes === 0) {
    const existing = await db
      .prepare("SELECT * FROM messages WHERE id = ?")
      .bind(message.id)
      .first<MessageRow>();

    if (
      existing &&
      existing.chat_key === message.chatKey &&
      existing.from_device === message.fromDevice &&
      existing.to_device === message.toDevice &&
      existing.text === message.text
    ) {
      return { ok: true, message: toMessage(existing), duplicate: true };
    }

    return { ok: false, code: "id_conflict" };
  }

  return { ok: true, message, duplicate: false };
}

export async function sendTextMessage(
  c: Context<AppEnv>,
  now: () => number,
  notify: MessageNotifier,
): Promise<Response> {
  const peerId = c.req.param("peerId")!;
  const current = c.get("device");
  let input: unknown;
  try {
    input = await c.req.json();
  } catch {
    return invalidRequest();
  }

  const stored = await storeTextMessage(
    c.env.DB,
    current.id,
    peerId,
    input,
    now(),
    Number(c.env.MAX_MESSAGE_LENGTH),
    Number(c.env.RETENTION_DAYS),
  );
  if (!stored.ok) {
    if (stored.code === "forbidden") {
      return forbidden();
    }
    if (stored.code === "id_conflict") {
      return Response.json({ error: "id_conflict" }, { status: 409 });
    }
    return invalidRequest();
  }

  if (!stored.duplicate) {
    await Promise.allSettled([
      notify(c.env, current.id, {
        type: "message.new",
        message: stored.message,
      }),
      notify(c.env, peerId, {
        type: "message.new",
        message: stored.message,
      }),
    ]);
  }

  return c.json({ message: stored.message }, stored.duplicate ? 200 : 201);
}

export async function listMessages(c: Context<AppEnv>): Promise<Response> {
  const peerId = c.req.param("peerId")!;
  const current = c.get("device");

  if (!(await areLinked(c.env.DB, current.id, peerId))) {
    return forbidden();
  }

  const rawLimit = c.req.query("limit");
  const limit = rawLimit === undefined ? 50 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return invalidRequest();
  }

  const chatKey = buildChatKey(current.id, peerId);
  const before = c.req.query("before");

  let rows: MessageRow[];
  if (before === undefined) {
    const result = await c.env.DB.prepare(
      `SELECT * FROM messages
       WHERE chat_key = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
    )
      .bind(chatKey, limit + 1)
      .all<MessageRow>();
    rows = result.results;
  } else {
    const anchor = await c.env.DB.prepare(
      "SELECT id, created_at FROM messages WHERE id = ? AND chat_key = ?",
    )
      .bind(before, chatKey)
      .first<{ id: string; created_at: number }>();
    if (!anchor) {
      return invalidRequest();
    }

    const result = await c.env.DB.prepare(
      `SELECT * FROM messages
       WHERE chat_key = ?
         AND (created_at < ? OR (created_at = ? AND id < ?))
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
    )
      .bind(chatKey, anchor.created_at, anchor.created_at, anchor.id, limit + 1)
      .all<MessageRow>();
    rows = result.results;
  }

  const hasMore = rows.length > limit;
  const pageRows = rows.slice(0, limit);
  const messages = pageRows.map(toMessage).reverse();
  const nextBefore = hasMore ? pageRows[pageRows.length - 1]!.id : null;

  const page: MessagesPage = { messages, nextBefore };
  return c.json(page);
}

const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

function parseTextMessage(
  input: unknown,
  maxLength: number,
): { ok: true; text: string; clientId: string } | { ok: false } {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false };
  }

  const record = input as Record<string, unknown>;
  if (
    record.kind !== "text" ||
    typeof record.text !== "string" ||
    typeof record.clientId !== "string" ||
    !CLIENT_ID_PATTERN.test(record.clientId)
  ) {
    return { ok: false };
  }

  const text = record.text.trim();
  if (text.length === 0 || text.length > maxLength) {
    return { ok: false };
  }

  return { ok: true, text, clientId: record.clientId };
}



function toMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    chatKey: row.chat_key,
    fromDevice: row.from_device,
    toDevice: row.to_device,
    kind: row.kind,
    text: row.text,
    fileId: row.file_id,
    fileName: row.file_name,
    fileSize: row.file_size,
    mime: row.mime,
    transport: row.transport,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

function forbidden(): Response {
  return Response.json({ error: "forbidden" }, { status: 403 });
}

function invalidRequest(): Response {
  return Response.json({ error: "invalid_request" }, { status: 400 });
}
