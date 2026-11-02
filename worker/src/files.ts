import {
  buildChatKey,
  type ChatMessage,
  type StorageAdapter,
} from "@dropchat/shared";
import type { Context } from "hono";

import type { AppEnv } from "./auth";
import { createDownloadToken, verifyDownloadToken } from "./file-links";
import { safeDownloadHeaders } from "./filename";
import type { Notifier } from "./notify";
import { enforceEndpointLimit } from "./rate-limit";
import { areLinked } from "./relations";

export const FILE_PART_SIZE = 8 * 1024 * 1024;
export const DOWNLOAD_LINK_TTL_SECONDS = 60;

export interface FileConfig {
  cloudUploadsEnabled: boolean;
  maxFileSize: number;
  perDeviceUploadPer24h: number;
  perDeviceStoredTotal: number;
  globalStoredTotal: number;
  retentionDays: number;
  downloadLinkTtlSeconds: number;
  fileInitLimitPerHour: number;
  filePartLimitPerMinute: number;
  fileCompleteLimitPerHour: number;
  fileLinkLimitPerMinute: number;
}

export interface FileDeps {
  now: () => number;
  storage: StorageAdapter;
  config: FileConfig;
  notify: Notifier;
  signingKey: string;
}

interface FileRow {
  id: string;
  owner_device: string;
  peer_device: string;
  name: string;
  size: number;
  mime: string;
  session_id: string;
  drive_file_id: string | null;
  uploaded_bytes: number;
  state: "uploading" | "ready" | "deleted";
  created_at: number;
  expires_at: number;
}

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

export async function initFile(
  c: Context<AppEnv>,
  deps: FileDeps,
): Promise<Response> {
  if (!deps.config.cloudUploadsEnabled) {
    return Response.json({ error: "cloud_uploads_disabled" }, { status: 503 });
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
  const peerId = record.peerId;
  if (
    name.length === 0 ||
    name.length > 255 ||
    typeof size !== "number" ||
    !Number.isInteger(size) ||
    size <= 0 ||
    typeof mime !== "string" ||
    mime.length === 0 ||
    mime.length > 255 ||
    typeof peerId !== "string"
  ) {
    return invalidRequest();
  }

  if (size > deps.config.maxFileSize) {
    return Response.json({ error: "file_too_large" }, { status: 413 });
  }

  const current = c.get("device");
  if (!(await areLinked(c.env.DB, current.id, peerId))) {
    return forbidden();
  }

  const now = deps.now();
  const limited = await enforceEndpointLimit(
    c,
    "file-init",
    now,
    3_600_000,
    deps.config.fileInitLimitPerHour,
  );
  if (limited) {
    return limited;
  }

  const dayAgo = now - 86_400_000;
  const [uploaded, stored, globalStored] = await Promise.all([
    sumBytes(
      c.env.DB,
      "SELECT COALESCE(SUM(bytes), 0) AS total FROM upload_events WHERE device_id = ? AND created_at > ?",
      current.id,
      dayAgo,
    ),
    sumBytes(
      c.env.DB,
      "SELECT COALESCE(SUM(size), 0) AS total FROM files WHERE owner_device = ? AND state IN ('uploading', 'ready')",
      current.id,
    ),
    sumBytes(
      c.env.DB,
      "SELECT COALESCE(SUM(size), 0) AS total FROM files WHERE state IN ('uploading', 'ready')",
    ),
  ]);

  if (
    uploaded + size > deps.config.perDeviceUploadPer24h ||
    stored + size > deps.config.perDeviceStoredTotal ||
    globalStored + size > deps.config.globalStoredTotal
  ) {
    return Response.json({ error: "quota_exceeded" }, { status: 429 });
  }

  let sessionId: string;
  try {
    ({ sessionId } = await deps.storage.init(size, mime));
  } catch {
    return storageFailure();
  }

  const fileId = crypto.randomUUID();
  const expiresAt = now + deps.config.retentionDays * 86_400_000;
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO files
        (id, owner_device, peer_device, name, size, mime, session_id,
         drive_file_id, uploaded_bytes, state, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 0, 'uploading', ?, ?)`,
    ).bind(
      fileId,
      current.id,
      peerId,
      name,
      size,
      mime,
      sessionId,
      now,
      expiresAt,
    ),
    c.env.DB.prepare(
      "INSERT INTO upload_events (file_id, device_id, bytes, created_at) VALUES (?, ?, ?, ?)",
    ).bind(fileId, current.id, size, now),
  ]);

  return Response.json({ fileId, partSize: FILE_PART_SIZE }, { status: 201 });
}

export async function uploadFilePart(
  c: Context<AppEnv>,
  deps: FileDeps,
): Promise<Response> {
  const fileId = c.req.param("id")!;
  const current = c.get("device");
  const file = await getFile(c.env.DB, fileId);
  if (!file) {
    return notFound();
  }
  if (file.owner_device !== current.id) {
    return forbidden();
  }
  if (file.state !== "uploading") {
    return Response.json({ error: "invalid_state" }, { status: 409 });
  }
  const now = deps.now();
  if (file.expires_at <= now) {
    return Response.json({ error: "expired" }, { status: 410 });
  }

  const limited = await enforceEndpointLimit(
    c,
    "file-part",
    now,
    60_000,
    deps.config.filePartLimitPerMinute,
  );
  if (limited) {
    return limited;
  }

  const contentRange = c.req.header("content-range");
  const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(contentRange ?? "");
  if (!match) {
    return invalidRequest();
  }

  const start = Number(match[1]);
  const end = Number(match[2]);
  const total = Number(match[3]);
  const chunk = new Uint8Array(await c.req.arrayBuffer());
  if (
    start !== file.uploaded_bytes ||
    end < start ||
    total !== file.size ||
    chunk.byteLength !== end - start + 1 ||
    chunk.byteLength === 0 ||
    chunk.byteLength > FILE_PART_SIZE
  ) {
    return start !== file.uploaded_bytes
      ? Response.json(
          { error: "invalid_offset", uploadedBytes: file.uploaded_bytes },
          { status: 409 },
        )
      : invalidRequest();
  }

  let part;
  try {
    part = await deps.storage.putPart(file.session_id, chunk, contentRange!);
  } catch {
    return storageFailure();
  }

  if (part.status === "incomplete") {
    await c.env.DB.prepare(
      "UPDATE files SET uploaded_bytes = ? WHERE id = ?",
    )
      .bind(part.nextOffset, fileId)
      .run();
    return Response.json({
      status: "incomplete",
      uploadedBytes: part.nextOffset,
    });
  }

  await c.env.DB.prepare(
    "UPDATE files SET uploaded_bytes = size, drive_file_id = ? WHERE id = ?",
  )
    .bind(part.driveFileId, fileId)
    .run();

  return Response.json({ status: "done", uploadedBytes: file.size });
}

export async function getFileState(
  c: Context<AppEnv>,
): Promise<Response> {
  const fileId = c.req.param("id")!;
  const file = await getFile(c.env.DB, fileId);
  if (!file) {
    return notFound();
  }
  if (file.owner_device !== c.get("device").id) {
    return forbidden();
  }

  return Response.json({
    fileId,
    uploadedBytes: file.uploaded_bytes,
    partSize: FILE_PART_SIZE,
    state: file.state,
  });
}

export async function completeFile(
  c: Context<AppEnv>,
  deps: FileDeps,
): Promise<Response> {
  const fileId = c.req.param("id")!;
  const current = c.get("device");
  const file = await getFile(c.env.DB, fileId);
  if (!file) {
    return notFound();
  }
  if (file.owner_device !== current.id) {
    return forbidden();
  }

  const now = deps.now();
  const limited = await enforceEndpointLimit(
    c,
    "file-complete",
    now,
    3_600_000,
    deps.config.fileCompleteLimitPerHour,
  );
  if (limited) {
    return limited;
  }

  if (file.state === "ready") {
    const existing = await findFileMessage(c.env.DB, fileId);
    if (existing) {
      return Response.json({ file: toFile(file), message: toMessage(existing) });
    }
    return Response.json({ error: "invalid_state" }, { status: 409 });
  }

  if (
    file.state !== "uploading" ||
    !file.drive_file_id ||
    file.uploaded_bytes < file.size
  ) {
    return Response.json({ error: "upload_incomplete" }, { status: 409 });
  }

  const updated = await c.env.DB.prepare(
    `UPDATE files SET state = 'ready'
     WHERE id = ? AND state = 'uploading'
       AND drive_file_id IS NOT NULL
       AND uploaded_bytes >= size`,
  )
    .bind(fileId)
    .run();

  if (updated.meta.changes === 0) {
    return Response.json({ error: "upload_incomplete" }, { status: 409 });
  }

  const message: ChatMessage = {
    id: crypto.randomUUID(),
    chatKey: buildChatKey(current.id, file.peer_device),
    fromDevice: current.id,
    toDevice: file.peer_device,
    kind: "file",
    text: null,
    fileId,
    fileName: file.name,
    fileSize: file.size,
    mime: file.mime,
    transport: "cloud",
    status: "sent",
    createdAt: now,
    expiresAt: file.expires_at,
  };

  await c.env.DB.prepare(
    `INSERT INTO messages
      (id, chat_key, from_device, to_device, kind, text, file_id, file_name,
       file_size, mime, transport, status, created_at, expires_at)
     VALUES (?, ?, ?, ?, 'file', NULL, ?, ?, ?, ?, 'cloud', 'sent', ?, ?)`,
  )
    .bind(
      message.id,
      message.chatKey,
      message.fromDevice,
      message.toDevice,
      fileId,
      file.name,
      file.size,
      file.mime,
      now,
      file.expires_at,
    )
    .run();

  await Promise.allSettled([
    deps.notify(c.env, current.id, { type: "message.new", message }),
    deps.notify(c.env, file.peer_device, { type: "message.new", message }),
  ]);

  const day = new Date(now).toISOString().slice(0, 10);
  await c.env.DB.prepare(
    `INSERT INTO usage (device_id, day, bytes_uploaded)
     VALUES (?, ?, ?)
     ON CONFLICT(device_id, day) DO UPDATE SET
       bytes_uploaded = usage.bytes_uploaded + excluded.bytes_uploaded`,
  )
    .bind(current.id, day, file.size)
    .run();

  const readyFile = { ...file, state: "ready" as const };
  return Response.json(
    { file: toFile(readyFile), message },
    { status: 201 },
  );
}

export async function createFileLink(
  c: Context<AppEnv>,
  deps: FileDeps,
): Promise<Response> {
  const fileId = c.req.param("id")!;
  const current = c.get("device");
  const file = await getFile(c.env.DB, fileId);
  if (
    !file ||
    (file.owner_device !== current.id && file.peer_device !== current.id)
  ) {
    return forbidden();
  }
  if (file.state !== "ready") {
    return Response.json({ error: "invalid_state" }, { status: 409 });
  }
  const now = deps.now();
  if (file.expires_at <= now) {
    return Response.json({ error: "expired" }, { status: 410 });
  }

  const limited = await enforceEndpointLimit(
    c,
    "file-link",
    now,
    60_000,
    deps.config.fileLinkLimitPerMinute,
  );
  if (limited) {
    return limited;
  }

  const expiresAt =
    Math.floor(now / 1000) + deps.config.downloadLinkTtlSeconds;
  const token = await createDownloadToken(
    fileId,
    current.id,
    expiresAt,
    deps.signingKey,
  );
  const url = new URL(
    `/api/files/${encodeURIComponent(fileId)}/download?t=${encodeURIComponent(token)}`,
    c.req.url,
  ).toString();

  return Response.json({ url, expiresAt: expiresAt * 1000 });
}

export async function downloadFile(
  c: Context<AppEnv>,
  deps: FileDeps,
): Promise<Response> {
  const fileId = c.req.param("id")!;
  const token = c.req.query("t");
  if (!token || !deps.signingKey) {
    return invalidLink();
  }

  const deviceId = await verifyDownloadToken(
    token,
    fileId,
    Math.floor(deps.now() / 1000),
    deps.signingKey,
  );
  if (!deviceId) {
    return invalidLink();
  }

  const file = await getFile(c.env.DB, fileId);
  const now = deps.now();
  if (
    !file ||
    (file.owner_device !== deviceId && file.peer_device !== deviceId)
  ) {
    return invalidLink();
  }
  if (file.state !== "ready") {
    return Response.json({ error: "invalid_state" }, { status: 409 });
  }
  if (file.expires_at <= now) {
    return Response.json({ error: "expired" }, { status: 410 });
  }

  let storageResponse: Response;
  try {
    storageResponse = await deps.storage.getStream(
      file.drive_file_id!,
      c.req.header("Range"),
    );
  } catch {
    return storageFailure();
  }

  if (
    storageResponse.status !== 200 &&
    storageResponse.status !== 206
  ) {
    return storageFailure();
  }

  const headers = safeDownloadHeaders(file.name, file.mime);
  for (const name of [
    "content-range",
    "content-length",
    "accept-ranges",
  ] as const) {
    const value = storageResponse.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }
  if (!headers.has("accept-ranges")) {
    headers.set("accept-ranges", "bytes");
  }

  return new Response(storageResponse.body, {
    status: storageResponse.status,
    headers,
  });
}

export async function cancelFile(
  c: Context<AppEnv>,
  deps: FileDeps,
): Promise<Response> {
  const fileId = c.req.param("id")!;
  const current = c.get("device");
  const file = await getFile(c.env.DB, fileId);
  if (!file) {
    return notFound();
  }
  if (file.owner_device !== current.id) {
    return forbidden();
  }
  if (file.state !== "uploading") {
    return Response.json({ error: "invalid_state" }, { status: 409 });
  }

  try {
    await deps.storage.cancel(file.session_id);
    if (file.drive_file_id) {
      await deps.storage.delete(file.drive_file_id);
    }
  } catch {
    return storageFailure();
  }

  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE files SET state = 'deleted' WHERE id = ?").bind(
      fileId,
    ),
    c.env.DB.prepare("DELETE FROM upload_events WHERE file_id = ?").bind(fileId),
  ]);

  return new Response(null, { status: 204 });
}

async function getFile(db: D1Database, fileId: string): Promise<FileRow | null> {
  return db
    .prepare("SELECT * FROM files WHERE id = ?")
    .bind(fileId)
    .first<FileRow>();
}

async function findFileMessage(
  db: D1Database,
  fileId: string,
): Promise<MessageRow | null> {
  return db
    .prepare("SELECT * FROM messages WHERE file_id = ?")
    .bind(fileId)
    .first<MessageRow>();
}

async function sumBytes(
  db: D1Database,
  query: string,
  ...bindings: unknown[]
): Promise<number> {
  const row = (await db
    .prepare(query)
    .bind(...bindings)
    .first<{ total: number }>()) as { total: number };
  return row.total;
}

function toFile(file: FileRow) {
  return {
    id: file.id,
    name: file.name,
    size: file.size,
    mime: file.mime,
    state: file.state,
    uploadedBytes: file.uploaded_bytes,
    createdAt: file.created_at,
    expiresAt: file.expires_at,
  };
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

function invalidRequest(): Response {
  return Response.json({ error: "invalid_request" }, { status: 400 });
}

function notFound(): Response {
  return Response.json({ error: "not_found" }, { status: 404 });
}

function forbidden(): Response {
  return Response.json({ error: "forbidden" }, { status: 403 });
}

function invalidLink(): Response {
  return Response.json({ error: "invalid_link" }, { status: 403 });
}

function storageFailure(): Response {
  return Response.json({ error: "storage_failed" }, { status: 502 });
}
