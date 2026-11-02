import type { Context } from "hono";

import type { AppEnv } from "./auth";

export const DEFAULT_REGISTRATION_LIMIT_PER_HOUR = 20;
export const DEFAULT_MESSAGE_LIMIT_PER_MINUTE = 60;
export const DEFAULT_WS_TICKET_LIMIT_PER_MINUTE = 30;
export const DEFAULT_PROFILE_LIMIT_PER_HOUR = 30;

const WINDOW_MS = 3_600_000;

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function parseRegistrationLimit(value: string | undefined): number {
  return parseLimit(value, DEFAULT_REGISTRATION_LIMIT_PER_HOUR);
}

export function parseLimit(value: string | undefined, fallback: number): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

export async function consumeRegistrationAttempt(
  db: D1Database,
  ipGroup: string,
  now: number,
  limit: number,
): Promise<RateLimitResult> {
  const windowStart = Math.floor(now / WINDOW_MS) * WINDOW_MS;

  await db
    .prepare(
      `INSERT INTO registration_rate_limits (ip_group, window_start, count)
       VALUES (?, ?, 1)
       ON CONFLICT(ip_group) DO UPDATE SET
         count = CASE
           WHEN registration_rate_limits.window_start = excluded.window_start
           THEN registration_rate_limits.count + 1
           ELSE 1
         END,
         window_start = excluded.window_start`,
    )
    .bind(ipGroup, windowStart)
    .run();

  const row = (await db
    .prepare("SELECT count FROM registration_rate_limits WHERE ip_group = ?")
    .bind(ipGroup)
    .first<{ count: number }>()) as { count: number };

  return {
    allowed: row.count <= limit,
    retryAfterSeconds: Math.ceil((windowStart + WINDOW_MS - now) / 1000),
  };
}

export async function consumeEndpointAttempt(
  db: D1Database,
  key: string,
  now: number,
  windowMs: number,
  limit: number,
): Promise<RateLimitResult> {
  const windowStart = Math.floor(now / windowMs) * windowMs;

  await db
    .prepare(
      `INSERT INTO endpoint_rate_limits (key, window_start, count)
       VALUES (?, ?, 1)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE
           WHEN endpoint_rate_limits.window_start = excluded.window_start
           THEN endpoint_rate_limits.count + 1
           ELSE 1
         END,
         window_start = excluded.window_start`,
    )
    .bind(key, windowStart)
    .run();

  const row = (await db
    .prepare("SELECT count FROM endpoint_rate_limits WHERE key = ?")
    .bind(key)
    .first<{ count: number }>()) as { count: number };

  return {
    allowed: row.count <= limit,
    retryAfterSeconds: Math.ceil((windowStart + windowMs - now) / 1000),
  };
}

export async function enforceEndpointLimit(
  c: Context<AppEnv>,
  scope: string,
  now: number,
  windowMs: number,
  limit: number,
): Promise<Response | null> {
  const key = `${scope}:${c.get("device").id}`;
  const result = await consumeEndpointAttempt(c.env.DB, key, now, windowMs, limit);

  if (result.allowed) {
    return null;
  }

  c.header("Retry-After", String(result.retryAfterSeconds));
  return c.json({ error: "rate_limited" }, 429);
}
