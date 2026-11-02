import type { Context, Next } from "hono";

import { constantTimeEqual, sha256Hex } from "./crypto";
import type { Env } from "./env";
import { ipGroupFor } from "./ip";

export interface DeviceRecord {
  id: string;
  secret_hash: string;
  name: string;
  platform: string;
  ip_group: string;
  invisible: number;
  last_seen: number;
  created_at: number;
}

export interface AppEnv {
  Bindings: Env;
  Variables: {
    device: DeviceRecord;
    ipGroup: string;
    now: number;
  };
}

export interface AuthCredentials {
  deviceId: string;
  secret: string;
}

const DEVICE_TOKEN_PATTERN = /^Bearer ([A-Za-z0-9_-]{8,128})\.([A-Za-z0-9_-]{32,256})$/i;
const TOUCH_INTERVAL_MS = 15_000;

export function parseAuthorization(
  value: string | undefined,
): AuthCredentials | null {
  if (!value) {
    return null;
  }

  const match = DEVICE_TOKEN_PATTERN.exec(value);
  if (!match) {
    return null;
  }

  return {
    deviceId: match[1]!,
    secret: match[2]!,
  };
}

export function createAuthMiddleware(now: () => number) {
  return async (c: Context<AppEnv>, next: Next): Promise<Response | void> => {
    const credentials = parseAuthorization(c.req.header("Authorization"));
    if (!credentials) {
      return unauthorized();
    }

    const device = await c.env.DB.prepare(
      `SELECT id, secret_hash, name, platform, ip_group, invisible, last_seen, created_at
       FROM devices
       WHERE id = ?`,
    )
      .bind(credentials.deviceId)
      .first<DeviceRecord>();

    if (!device) {
      return unauthorized();
    }

    const secretHash = await sha256Hex(credentials.secret);
    if (!constantTimeEqual(secretHash, device.secret_hash)) {
      return unauthorized();
    }

    const ip = c.req.header("CF-Connecting-IP") ?? "unknown";
    const ipGroup = await ipGroupFor(c.env.SERVER_SALT, ip);
    const currentTime = now();
    const shouldTouch =
      ipGroup !== device.ip_group ||
      currentTime - device.last_seen >= TOUCH_INTERVAL_MS;

    if (shouldTouch) {
      await c.env.DB.prepare(
        "UPDATE devices SET ip_group = ?, last_seen = ? WHERE id = ?",
      )
        .bind(ipGroup, currentTime, device.id)
        .run();
    }

    c.set("device", {
      ...device,
      ip_group: ipGroup,
      last_seen: shouldTouch ? currentTime : device.last_seen,
    });
    c.set("ipGroup", ipGroup);
    c.set("now", currentTime);

    await next();
  };
}

function unauthorized(): Response {
  return Response.json(
    { error: "unauthorized" },
    {
      status: 401,
      headers: { "WWW-Authenticate": "Bearer" },
    },
  );
}
