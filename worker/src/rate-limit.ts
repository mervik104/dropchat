export const DEFAULT_REGISTRATION_LIMIT_PER_HOUR = 20;

const WINDOW_MS = 3_600_000;

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export function parseRegistrationLimit(value: string | undefined): number {
  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_REGISTRATION_LIMIT_PER_HOUR;
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
