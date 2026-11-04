import type { StorageAdapter } from "@dropchat/shared";

import type { Env } from "./env";

const DAY_MS = 86_400_000;
const ABANDONED_UPLOAD_MS = 24 * 3_600_000;
const INVITE_FAILURE_WINDOW_MS = 600_000;
const RATE_LIMIT_RETENTION_MS = DAY_MS;

interface ExpiredFileRow {
  id: string;
  session_id: string;
  drive_file_id: string | null;
  state: "uploading" | "ready";
}

export async function runRetention(
  env: Env,
  now: number,
  storage: StorageAdapter,
): Promise<void> {
  for (let batch = 0; batch < 10; batch += 1) {
    const expired = await env.DB.prepare(
      `SELECT id, session_id, drive_file_id, state
       FROM files
       WHERE state IN ('uploading', 'ready')
         AND (
           expires_at <= ?
           OR (state = 'uploading' AND created_at <= ?)
         )
       ORDER BY created_at ASC
       LIMIT 100`,
    )
      .bind(now, now - ABANDONED_UPLOAD_MS)
      .all<ExpiredFileRow>();

    if (expired.results.length === 0) {
      break;
    }

    let cleaned = 0;
    for (const file of expired.results) {
      try {
        if (file.drive_file_id) {
          await storage.delete(file.drive_file_id);
        }
        if (file.state === "uploading") {
          await storage.cancel(file.session_id);
        }
      } catch {
        continue;
      }

      await env.DB.batch([
        env.DB.prepare("UPDATE files SET state = 'deleted' WHERE id = ?").bind(
          file.id,
        ),
        env.DB.prepare("DELETE FROM messages WHERE file_id = ?").bind(file.id),
        env.DB.prepare("DELETE FROM upload_events WHERE file_id = ?").bind(
          file.id,
        ),
        env.DB.prepare("DELETE FROM files WHERE id = ?").bind(file.id),
      ]);
      cleaned += 1;
    }

    if (cleaned === 0) {
      break;
    }
  }

  const peerRequestTtlHours = Number(env.PEER_REQUEST_TTL_HOURS);
  const tombstoneCutoff = now - 30 * 86_400_000;

  await env.DB.batch([
    env.DB.prepare("DELETE FROM messages WHERE expires_at <= ?").bind(now),
    env.DB.prepare(
      "DELETE FROM message_deletions WHERE deleted_at <= ?",
    ).bind(tombstoneCutoff),
    env.DB.prepare("DELETE FROM ws_tickets WHERE expires_at <= ?").bind(now),
    env.DB.prepare("DELETE FROM invites WHERE expires_at <= ?").bind(now),
    env.DB.prepare(
      "DELETE FROM invite_failures WHERE attempted_at <= ?",
    ).bind(now - INVITE_FAILURE_WINDOW_MS),
    env.DB.prepare("DELETE FROM peer_requests WHERE created_at <= ?").bind(
      now - peerRequestTtlHours * 3_600_000,
    ),
    env.DB.prepare(
      "DELETE FROM endpoint_rate_limits WHERE window_start <= ?",
    ).bind(now - RATE_LIMIT_RETENTION_MS),
    env.DB.prepare(
      "DELETE FROM registration_rate_limits WHERE window_start <= ?",
    ).bind(now - RATE_LIMIT_RETENTION_MS),
  ]);
}
