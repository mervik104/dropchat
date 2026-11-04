import type { InviteResponse } from "@dropchat/shared";
import type { Context } from "hono";

import type { AppEnv } from "./auth";
import type { Notifier } from "./notify";
import { toPeerSummary } from "./presence";
import { enforceEndpointLimit } from "./rate-limit";
import { areLinked, findDevice, linkDevices } from "./relations";

const INVITE_TTL_MS = 300_000;
const INVITE_FAILURE_WINDOW_MS = 600_000;
const MAX_INVITE_FAILURES = 5;
const INVITE_CODE_PATTERN = /^\d{6}$/;

export interface InviteLimits {
  ipGroupFailures: number;
  globalFailures: number;
}

export async function createInvite(
  c: Context<AppEnv>,
  now: () => number,
  codeFactory: () => string,
  limitPerHour: number,
): Promise<Response> {
  const current = c.get("device");
  const currentTime = now();
  const limited = await enforceEndpointLimit(
    c,
    "invite-create",
    currentTime,
    3_600_000,
    limitPerHour,
  );
  if (limited) {
    return limited;
  }

  const expiresAt = currentTime + INVITE_TTL_MS;
  let code = "";
  let inserted = false;

  for (let attempt = 0; attempt < 10 && !inserted; attempt += 1) {
    code = codeFactory();
    const result = await c.env.DB.prepare(
      "INSERT OR IGNORE INTO invites (code, device_id, expires_at, attempts, used) VALUES (?, ?, ?, 0, 0)",
    )
      .bind(code, current.id, expiresAt)
      .run();
    inserted = result.meta.changes > 0;
  }

  if (!inserted) {
    return Response.json({ error: "code_generation_failed" }, { status: 500 });
  }

  const body: InviteResponse = { code, expiresAt };
  return c.json(body, 201);
}

export async function redeemInvite(
  c: Context<AppEnv>,
  now: () => number,
  notify: Notifier,
  limits: InviteLimits,
): Promise<Response> {
  let input: unknown;
  try {
    input = await c.req.json();
  } catch {
    return invalidRequest();
  }

  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return invalidRequest();
  }

  const code = (input as Record<string, unknown>).code;
  if (typeof code !== "string") {
    return invalidRequest();
  }

  const current = c.get("device");
  const currentTime = now();
  const since = currentTime - INVITE_FAILURE_WINDOW_MS;
  const failures = (await c.env.DB.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN device_id = ? THEN 1 ELSE 0 END), 0) AS device_count,
       COALESCE(SUM(CASE WHEN ip_group = ? THEN 1 ELSE 0 END), 0) AS ip_count,
       COUNT(*) AS global_count
     FROM invite_failures
     WHERE attempted_at > ?`,
  )
    .bind(current.id, current.ip_group, since)
    .first<{
      device_count: number;
      ip_count: number;
      global_count: number;
    }>()) as {
    device_count: number;
    ip_count: number;
    global_count: number;
  };

  if (
    failures.device_count >= MAX_INVITE_FAILURES ||
    failures.ip_count >= limits.ipGroupFailures ||
    failures.global_count >= limits.globalFailures
  ) {
    c.header("Retry-After", "600");
    return c.json({ error: "rate_limited" }, 429);
  }

  if (!INVITE_CODE_PATTERN.test(code)) {
    await recordFailure(c.env.DB, current.id, current.ip_group, currentTime);
    return invalidCode();
  }

  const invite = await c.env.DB.prepare(
    "SELECT code, device_id, expires_at, used FROM invites WHERE code = ?",
  )
    .bind(code)
    .first<{
      code: string;
      device_id: string;
      expires_at: number;
      used: number;
    }>();

  if (
    !invite ||
    invite.used === 1 ||
    invite.expires_at <= currentTime ||
    invite.device_id === current.id
  ) {
    await recordFailure(c.env.DB, current.id, current.ip_group, currentTime);
    if (invite) {
      await bumpInviteAttempts(c.env.DB, code);
    }
    return invalidCode();
  }

  if (await areLinked(c.env.DB, invite.device_id, current.id)) {
    await recordFailure(c.env.DB, current.id, current.ip_group, currentTime);
    await bumpInviteAttempts(c.env.DB, code);
    return Response.json({ error: "already_linked" }, { status: 409 });
  }

  const owner = await findDevice(c.env.DB, invite.device_id);
  if (!owner) {
    await recordFailure(c.env.DB, current.id, current.ip_group, currentTime);
    await bumpInviteAttempts(c.env.DB, code);
    return invalidCode();
  }

  await linkDevices(c.env.DB, invite.device_id, current.id, currentTime);
  await c.env.DB.prepare("UPDATE invites SET used = 1 WHERE code = ?")
    .bind(code)
    .run();

  const peer = await toPeerSummary(c.env.HUB, owner);
  const currentSummary = await toPeerSummary(c.env.HUB, current);

  await Promise.allSettled([
    notify(c.env, invite.device_id, { type: "peer.linked", peer: currentSummary }),
    notify(c.env, current.id, { type: "peer.linked", peer }),
    notify(c.env, invite.device_id, { type: "peers.refresh" }),
    notify(c.env, current.id, { type: "peers.refresh" }),
  ]);

  return c.json({ peer });
}

async function recordFailure(
  db: D1Database,
  deviceId: string,
  ipGroup: string,
  attemptedAt: number,
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO invite_failures (device_id, ip_group, attempted_at) VALUES (?, ?, ?)",
    )
    .bind(deviceId, ipGroup, attemptedAt)
    .run();
}

async function bumpInviteAttempts(db: D1Database, code: string): Promise<void> {
  await db
    .prepare(
      `UPDATE invites
       SET attempts = attempts + 1,
           used = CASE WHEN attempts + 1 >= ? THEN 1 ELSE used END
       WHERE code = ?`,
    )
    .bind(MAX_INVITE_FAILURES, code)
    .run();
}

function invalidRequest(): Response {
  return Response.json({ error: "invalid_request" }, { status: 400 });
}

function invalidCode(): Response {
  return Response.json({ error: "invalid_code" }, { status: 404 });
}
