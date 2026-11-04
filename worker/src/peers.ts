import type { Context } from "hono";

import type { AppEnv } from "./auth";
import { loadPeersForDevice } from "./peers-data";

export async function listPeers(
  c: Context<AppEnv>,
  peerRequestTtlHours: number,
): Promise<Response> {
  const current = c.get("device");
  const body = await loadPeersForDevice(
    c.env,
    current.id,
    c.get("ipGroup"),
    c.get("now"),
    peerRequestTtlHours,
  );
  return c.json(body);
}
