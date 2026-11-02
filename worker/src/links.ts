import type { Context } from "hono";

import type { AppEnv } from "./auth";
import type { Notifier } from "./notify";
import { toPeerSummary } from "./presence";
import { areLinked, findDevice, linkDevices } from "./relations";

const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

export async function requestPeer(
  c: Context<AppEnv>,
  now: () => number,
  notify: Notifier,
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

  const toDeviceId = (input as Record<string, unknown>).toDeviceId;
  if (typeof toDeviceId !== "string" || !DEVICE_ID_PATTERN.test(toDeviceId)) {
    return invalidRequest();
  }

  const current = c.get("device");
  const target = await findDevice(c.env.DB, toDeviceId);
  if (
    !target ||
    target.id === current.id ||
    target.ip_group !== current.ip_group ||
    target.invisible === 1
  ) {
    return notFound();
  }

  if (await areLinked(c.env.DB, current.id, target.id)) {
    return Response.json({ error: "already_linked" }, { status: 409 });
  }

  const result = await c.env.DB.prepare(
    "INSERT OR IGNORE INTO peer_requests (from_device, to_device, created_at) VALUES (?, ?, ?)",
  )
    .bind(current.id, target.id, now())
    .run();

  if (result.meta.changes === 0) {
    return Response.json({ error: "request_exists" }, { status: 409 });
  }

  const from = await toPeerSummary(c.env.HUB, current);
  const request = await toPeerSummary(c.env.HUB, target);

  await Promise.allSettled([
    notify(c.env, target.id, { type: "peer.request", from }),
  ]);

  return c.json({ request }, 201);
}

export async function respondToPeer(
  c: Context<AppEnv>,
  now: () => number,
  notify: Notifier,
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

  const record = input as Record<string, unknown>;
  const fromDeviceId = record.fromDeviceId;
  const accept = record.accept;
  if (
    typeof fromDeviceId !== "string" ||
    !DEVICE_ID_PATTERN.test(fromDeviceId) ||
    typeof accept !== "boolean"
  ) {
    return invalidRequest();
  }

  const current = c.get("device");
  const request = await c.env.DB.prepare(
    "SELECT 1 AS found FROM peer_requests WHERE from_device = ? AND to_device = ?",
  )
    .bind(fromDeviceId, current.id)
    .first<{ found: number }>();

  if (!request) {
    return notFound();
  }

  await c.env.DB.prepare(
    "DELETE FROM peer_requests WHERE from_device = ? AND to_device = ?",
  )
    .bind(fromDeviceId, current.id)
    .run();

  if (!accept) {
    return c.json({ linked: false });
  }

  await linkDevices(c.env.DB, fromDeviceId, current.id, now());

  const fromDevice = await findDevice(c.env.DB, fromDeviceId);
  if (!fromDevice) {
    return notFound();
  }

  const from = await toPeerSummary(c.env.HUB, fromDevice);
  const currentSummary = await toPeerSummary(c.env.HUB, current);

  await Promise.allSettled([
    notify(c.env, fromDeviceId, { type: "peer.linked", peer: currentSummary }),
    notify(c.env, current.id, { type: "peer.linked", peer: from }),
  ]);

  return c.json({ linked: true, peer: from });
}

function invalidRequest(): Response {
  return Response.json({ error: "invalid_request" }, { status: 400 });
}

function notFound(): Response {
  return Response.json({ error: "not_found" }, { status: 404 });
}
