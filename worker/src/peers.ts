import {
  isOnline,
  type PeerSummary,
  type PeersResponse,
} from "@dropchat/shared";
import type { Context } from "hono";

import type { AppEnv } from "./auth";

interface PeerRow {
  id: string;
  name: string;
  platform: string;
  last_seen: number;
}

export async function listPeers(c: Context<AppEnv>): Promise<Response> {
  const current = c.get("device");
  const ipGroup = c.get("ipGroup");
  const now = c.get("now");

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
     ORDER BY d.name COLLATE NOCASE ASC, d.id ASC`,
  )
    .bind(ipGroup, current.id, current.id, current.id)
    .all<PeerRow>();

  const linked = await c.env.DB.prepare(
    `SELECT d.id, d.name, d.platform, d.last_seen
     FROM peers p
     JOIN devices d
       ON d.id = CASE WHEN p.device_a = ? THEN p.device_b ELSE p.device_a END
     WHERE p.device_a = ? OR p.device_b = ?
     ORDER BY d.name COLLATE NOCASE ASC, d.id ASC`,
  )
    .bind(current.id, current.id, current.id)
    .all<PeerRow>();

  const body: PeersResponse = {
    local: local.results.map((row) => toPeerSummary(row, now)),
    linked: linked.results.map((row) => toPeerSummary(row, now)),
  };

  return c.json(body);
}

function toPeerSummary(row: PeerRow, now: number): PeerSummary {
  return {
    id: row.id,
    name: row.name,
    platform: row.platform,
    online: isOnline(row.last_seen, now),
    lastSeen: row.last_seen,
  };
}
