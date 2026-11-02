import type { PeerSummary } from "@dropchat/shared";

export interface PresenceRow {
  id: string;
  name: string;
  platform: string;
  last_seen: number;
}

export async function isDeviceOnline(
  hub: DurableObjectNamespace,
  deviceId: string,
): Promise<boolean> {
  const stub = hub.get(hub.idFromName(deviceId));
  const response = await stub.fetch("https://hub/presence");
  const presence = (await response.json()) as { online?: boolean };
  return presence.online === true;
}

export async function toPeerSummary(
  hub: DurableObjectNamespace,
  row: PresenceRow,
): Promise<PeerSummary> {
  return {
    id: row.id,
    name: row.name,
    platform: row.platform,
    online: await isDeviceOnline(hub, row.id),
    lastSeen: row.last_seen,
  };
}
