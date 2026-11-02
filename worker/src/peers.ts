import type { PeersResponse } from "@dropchat/shared";
import type { Context } from "hono";

import type { AppEnv } from "./auth";
import { toPeerSummary, type PresenceRow } from "./presence";

export async function listPeers(
  c: Context<AppEnv>,
  peerRequestTtlHours: number,
): Promise<Response> {
  const current = c.get("device");
  const ipGroup = c.get("ipGroup");

  const local = await c.env.DB.prepare(
    `SELECT d.id, d.name, d.platform, d.last_seen
     FROM devices d
     WHERE d.ip_group = ?
       AND d.id <> ?
       AND d.invisible = 0
       AND NOT EXISTS (
         SELECT 1
         FROM peers p
         WHERE (p.device_a = ? AND p.device_b = d.id)
            OR (p.device_b = ? AND p.device_a = d.id)
       )
       AND NOT EXISTS (
         SELECT 1
         FROM blocks b
         WHERE (b.device_id = ? AND b.blocked_device_id = d.id)
            OR (b.device_id = d.id AND b.blocked_device_id = ?)
       )
     ORDER BY d.name COLLATE NOCASE ASC, d.id ASC`,
  )
    .bind(ipGroup, current.id, current.id, current.id, current.id, current.id)
    .all<PresenceRow>();

  const linked = await c.env.DB.prepare(
    `SELECT d.id, d.name, d.platform, d.last_seen
     FROM peers p
     JOIN devices d
       ON d.id = CASE WHEN p.device_a = ? THEN p.device_b ELSE p.device_a END
     WHERE p.device_a = ? OR p.device_b = ?
     ORDER BY d.name COLLATE NOCASE ASC, d.id ASC`,
  )
    .bind(current.id, current.id, current.id)
    .all<PresenceRow>();

  const incoming = await c.env.DB.prepare(
    `SELECT d.id, d.name, d.platform, d.last_seen
     FROM peer_requests r
     JOIN devices d ON d.id = r.from_device
     WHERE r.to_device = ?
       AND r.created_at > ?
       AND NOT EXISTS (
         SELECT 1
         FROM blocks b
         WHERE (b.device_id = ? AND b.blocked_device_id = d.id)
            OR (b.device_id = d.id AND b.blocked_device_id = ?)
       )
     ORDER BY r.created_at DESC, d.id ASC`,
  )
    .bind(
      current.id,
      c.get("now") - peerRequestTtlHours * 3_600_000,
      current.id,
      current.id,
    )
    .all<PresenceRow>();

  const [localPeers, linkedPeers, incomingRequests] = await Promise.all([
    Promise.all(local.results.map((row) => toPeerSummary(c.env.HUB, row))),
    Promise.all(linked.results.map((row) => toPeerSummary(c.env.HUB, row))),
    Promise.all(incoming.results.map((row) => toPeerSummary(c.env.HUB, row))),
  ]);

  const body: PeersResponse = {
    local: localPeers,
    linked: linkedPeers,
    incomingRequests,
  };

  return c.json(body);
}
