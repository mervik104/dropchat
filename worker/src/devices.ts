import type { DeviceProfile } from "@dropchat/shared";
import type { Context } from "hono";

import type { AppEnv } from "./auth";
import { sha256Hex } from "./crypto";
import { ipGroupFor } from "./ip";
import {
  consumeRegistrationAttempt,
  parseRegistrationLimit,
} from "./rate-limit";
import { parseProfileUpdate, parseRegistration } from "./validation";

export async function registerDevice(
  c: Context<AppEnv>,
  now: () => number,
  registrationLimit?: number,
): Promise<Response> {
  const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
  const ipGroup = await ipGroupFor(c.env.SERVER_SALT, ip);
  const limit =
    registrationLimit ?? parseRegistrationLimit(c.env.REGISTRATION_LIMIT_PER_HOUR);
  const rateLimit = await consumeRegistrationAttempt(c.env.DB, ipGroup, now(), limit);

  if (!rateLimit.allowed) {
    c.header("Retry-After", String(rateLimit.retryAfterSeconds));
    return c.json({ error: "rate_limited" }, 429);
  }

  let input: unknown;
  try {
    input = await c.req.json();
  } catch {
    return invalidRequest();
  }

  const parsed = parseRegistration(input);
  if (!parsed.ok) {
    return invalidRequest();
  }

  const createdAt = now();
  const secretHash = await sha256Hex(parsed.value.secret);

  const result = await c.env.DB.prepare(
    `INSERT OR IGNORE INTO devices
      (id, secret_hash, name, platform, ip_group, invisible, last_seen, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
  )
    .bind(
      parsed.value.deviceId,
      secretHash,
      parsed.value.name,
      parsed.value.platform,
      ipGroup,
      createdAt,
      createdAt,
    )
    .run();

  if (result.meta.changes === 0) {
    return c.json({ error: "device_exists" }, 409);
  }

  const profile: DeviceProfile = {
    id: parsed.value.deviceId,
    name: parsed.value.name,
    platform: parsed.value.platform,
    invisible: false,
    lastSeen: createdAt,
    createdAt,
  };

  return c.json(profile, 201);
}

function invalidRequest(): Response {
  return Response.json({ error: "invalid_request" }, { status: 400 });
}

export async function updateDevice(c: Context<AppEnv>): Promise<Response> {
  let input: unknown;
  try {
    input = await c.req.json();
  } catch {
    return invalidRequest();
  }

  const parsed = parseProfileUpdate(input);
  if (!parsed.ok) {
    return invalidRequest();
  }

  const current = c.get("device");
  const name = parsed.value.name ?? current.name;
  const invisible =
    parsed.value.invisible === undefined
      ? current.invisible
      : Number(parsed.value.invisible);

  await c.env.DB.prepare(
    "UPDATE devices SET name = ?, invisible = ? WHERE id = ?",
  )
    .bind(name, invisible, current.id)
    .run();

  const profile: DeviceProfile = {
    id: current.id,
    name,
    platform: current.platform,
    invisible: invisible === 1,
    lastSeen: current.last_seen,
    createdAt: current.created_at,
  };

  return c.json(profile);
}
