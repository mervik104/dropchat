import type { PeersResponse } from "@dropchat/shared";

import type { Env } from "./env";
import { toPeerSummary, type PresenceRow } from "./presence";

export async function loadPeersForDevice(
  env: Env,
  deviceId: string,
  ipGroup: string,
  now: number,
  peerRequestTtlHours: number,
): Promise<PeersResponse> {
  const local = await env.DB.prepare(
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
     ORDER BY d.name COLLATE NOCASE ASC, d.id ASC`,
  )
    .bind(ipGroup, deviceId, deviceId, deviceId)
    .all<PresenceRow>();

  const linked = await env.DB.prepare(
    `SELECT d.id, d.name, d.platform, d.last_seen
     FROM peers p
     JOIN devices d
       ON d.id = CASE WHEN p.device_a = ? THEN p.device_b ELSE p.device_a END
     WHERE p.device_a = ? OR p.device_b = ?
     ORDER BY d.name COLLATE NOCASE ASC, d.id ASC`,
  )
    .bind(deviceId, deviceId, deviceId)
    .all<PresenceRow>();

  const incoming = await env.DB.prepare(
    `SELECT d.id, d.name, d.platform, d.last_seen
     FROM peer_requests r
     JOIN devices d ON d.id = r.from_device
     WHERE r.to_device = ?
       AND r.created_at > ?
     ORDER BY r.created_at DESC, d.id ASC`,
  )
    .bind(deviceId, now - peerRequestTtlHours * 3_600_000)
    .all<PresenceRow>();

  const [localPeers, linkedPeers, incomingRequests] = await Promise.all([
    Promise.all(local.results.map((row) => toPeerSummary(env.HUB, row))),
    Promise.all(linked.results.map((row) => toPeerSummary(env.HUB, row))),
    Promise.all(incoming.results.map((row) => toPeerSummary(env.HUB, row))),
  ]);

  return {
    local: localPeers,
    linked: linkedPeers,
    incomingRequests,
  };
}
