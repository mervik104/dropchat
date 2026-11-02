import type { StorageAdapter } from "@dropchat/shared";
import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

import { runRetention } from "../src/retention";
import { NOW } from "./helpers";

function storage(): StorageAdapter {
  return {
    init: vi.fn(async () => ({ sessionId: "s" })),
    putPart: vi.fn(async () => ({ status: "incomplete" as const, nextOffset: 0 })),
    getStream: vi.fn(async () => new Response("")),
    delete: vi.fn(async () => undefined),
    cancel: vi.fn(async () => undefined),
  };
}

async function insertFile(input: {
  id: string;
  state: "uploading" | "ready" | "deleted";
  createdAt: number;
  expiresAt: number;
  driveFileId?: string | null;
  sessionId?: string;
}): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO files
      (id, owner_device, peer_device, name, size, mime, session_id,
       drive_file_id, uploaded_bytes, state, created_at, expires_at)
     VALUES (?, 'a', 'b', 'file.txt', 10, 'text/plain', ?, ?, 10, ?, ?, ?)`,
  )
    .bind(
      input.id,
      input.sessionId ?? "session-1",
      input.driveFileId ?? null,
      input.state,
      input.createdAt,
      input.expiresAt,
    )
    .run();
}

async function insertMessage(id: string, expiresAt: number, fileId?: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO messages
      (id, chat_key, from_device, to_device, kind, text, file_id, file_name,
       file_size, mime, transport, status, created_at, expires_at)
     VALUES (?, 'a:b', 'a', 'b', 'file', NULL, ?, 'file.txt', 10, 'text/plain',
             'cloud', 'sent', ?, ?)`,
  )
    .bind(id, fileId ?? null, NOW, expiresAt)
    .run();
}

describe("retention", () => {
  it("deletes expired ready files from Drive and removes rows", async () => {
    const fake = storage();
    await insertFile({
      id: "expired",
      state: "ready",
      createdAt: NOW - 31 * 86_400_000,
      expiresAt: NOW - 1,
      driveFileId: "drive-1",
    });
    await insertMessage("msg-expired", NOW - 1, "expired");
    await env.DB.prepare(
      "INSERT INTO upload_events (file_id, device_id, bytes, created_at) VALUES (?, ?, ?, ?)",
    )
      .bind("expired", "a", 10, NOW)
      .run();

    await runRetention(env, NOW, fake);

    expect(fake.delete).toHaveBeenCalledWith("drive-1");
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS count FROM files WHERE id = ?")
        .bind("expired")
        .first<{ count: number }>(),
    ).toEqual({ count: 0 });
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS count FROM messages WHERE id = ?")
        .bind("msg-expired")
        .first<{ count: number }>(),
    ).toEqual({ count: 0 });
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS count FROM upload_events WHERE file_id = ?")
        .bind("expired")
        .first<{ count: number }>(),
    ).toEqual({ count: 0 });
  });

  it("cancels expired and abandoned uploading sessions", async () => {
    const fake = storage();
    await insertFile({
      id: "expired-upload",
      state: "uploading",
      createdAt: NOW - 3_600_000,
      expiresAt: NOW - 1,
    });
    await insertFile({
      id: "abandoned",
      state: "uploading",
      createdAt: NOW - 25 * 3_600_000,
      expiresAt: NOW + 86_400_000,
      sessionId: "session-abandoned",
    });
    await insertFile({
      id: "active",
      state: "uploading",
      createdAt: NOW - 3_600_000,
      expiresAt: NOW + 86_400_000,
      sessionId: "session-active",
    });

    await runRetention(env, NOW, fake);

    expect(fake.cancel).toHaveBeenCalledWith("session-1");
    expect(fake.cancel).toHaveBeenCalledWith("session-abandoned");
    const remaining = await env.DB.prepare(
      "SELECT id FROM files ORDER BY id",
    ).all<{ id: string }>();
    expect(remaining.results).toEqual([{ id: "active" }]);
  });

  it("keeps files when Drive deletion or session cancellation fails", async () => {
    const fake = storage();
    fake.delete = vi.fn(async () => {
      throw new Error("drive down");
    });
    fake.cancel = vi.fn(async () => {
      throw new Error("cancel down");
    });
    await insertFile({
      id: "ready",
      state: "ready",
      createdAt: NOW,
      expiresAt: NOW - 1,
      driveFileId: "drive-1",
    });
    await insertFile({
      id: "uploading",
      state: "uploading",
      createdAt: NOW - 25 * 3_600_000,
      expiresAt: NOW + 1000,
    });

    await runRetention(env, NOW, fake);

    const remaining = await env.DB.prepare(
      "SELECT id FROM files ORDER BY id",
    ).all<{ id: string }>();
    expect(remaining.results).toEqual([{ id: "ready" }, { id: "uploading" }]);
  });

  it("removes expired messages, tickets, invites, requests, and counters", async () => {
    const fake = storage();
    await insertMessage("old-message", NOW - 1);
    await insertMessage("fresh-message", NOW + 1);

    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO ws_tickets (ticket_hash, device_id, expires_at, used) VALUES ('old-ticket', 'a', ?, 0)",
      ).bind(NOW - 1),
      env.DB.prepare(
        "INSERT INTO ws_tickets (ticket_hash, device_id, expires_at, used) VALUES ('fresh-ticket', 'a', ?, 0)",
      ).bind(NOW + 1),
      env.DB.prepare(
        "INSERT INTO invites (code, device_id, expires_at, attempts, used) VALUES ('111111', 'a', ?, 0, 0)",
      ).bind(NOW - 1),
      env.DB.prepare(
        "INSERT INTO invites (code, device_id, expires_at, attempts, used) VALUES ('222222', 'a', ?, 0, 0)",
      ).bind(NOW + 1),
      env.DB.prepare(
        "INSERT INTO invite_failures (device_id, ip_group, attempted_at) VALUES ('a', 'g', ?)",
      ).bind(NOW - 700_000),
      env.DB.prepare(
        "INSERT INTO invite_failures (device_id, ip_group, attempted_at) VALUES ('a', 'g', ?)",
      ).bind(NOW - 100_000),
      env.DB.prepare(
        "INSERT INTO peer_requests (from_device, to_device, created_at) VALUES ('a', 'b', ?)",
      ).bind(NOW - 25 * 3_600_000),
      env.DB.prepare(
        "INSERT INTO peer_requests (from_device, to_device, created_at) VALUES ('c', 'd', ?)",
      ).bind(NOW - 1000),
      env.DB.prepare(
        "INSERT INTO endpoint_rate_limits (key, window_start, count) VALUES ('old', ?, 1)",
      ).bind(NOW - 2 * 86_400_000),
      env.DB.prepare(
        "INSERT INTO endpoint_rate_limits (key, window_start, count) VALUES ('fresh', ?, 1)",
      ).bind(NOW - 1000),
      env.DB.prepare(
        "INSERT INTO registration_rate_limits (ip_group, window_start, count) VALUES ('old', ?, 1)",
      ).bind(NOW - 2 * 86_400_000),
      env.DB.prepare(
        "INSERT INTO registration_rate_limits (ip_group, window_start, count) VALUES ('fresh', ?, 1)",
      ).bind(NOW - 1000),
    ]);

    await runRetention(env, NOW, fake);

    const counts = await env.DB.batch([
      env.DB.prepare("SELECT COUNT(*) AS count FROM messages"),
      env.DB.prepare("SELECT COUNT(*) AS count FROM ws_tickets"),
      env.DB.prepare("SELECT COUNT(*) AS count FROM invites"),
      env.DB.prepare("SELECT COUNT(*) AS count FROM invite_failures"),
      env.DB.prepare("SELECT COUNT(*) AS count FROM peer_requests"),
      env.DB.prepare("SELECT COUNT(*) AS count FROM endpoint_rate_limits"),
      env.DB.prepare("SELECT COUNT(*) AS count FROM registration_rate_limits"),
    ]);
    expect(counts.map((result) => (result.results[0] as { count: number }).count)).toEqual([
      1, 1, 1, 1, 1, 1, 1,
    ]);
  });
});
