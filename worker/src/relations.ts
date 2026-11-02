export interface RelationDevice {
  id: string;
  name: string;
  platform: string;
  ip_group: string;
  invisible: number;
  last_seen: number;
}

export async function findDevice(
  db: D1Database,
  deviceId: string,
): Promise<RelationDevice | null> {
  return db
    .prepare(
      `SELECT id, name, platform, ip_group, invisible, last_seen
       FROM devices WHERE id = ?`,
    )
    .bind(deviceId)
    .first<RelationDevice>();
}

export async function areLinked(
  db: D1Database,
  deviceA: string,
  deviceB: string,
): Promise<boolean> {
  const [first, second] = [deviceA, deviceB].sort();
  const row = await db
    .prepare("SELECT 1 AS linked FROM peers WHERE device_a = ? AND device_b = ?")
    .bind(first, second)
    .first<{ linked: number }>();
  return row !== null;
}

export async function linkDevices(
  db: D1Database,
  deviceA: string,
  deviceB: string,
  createdAt: number,
): Promise<void> {
  const [first, second] = [deviceA, deviceB].sort();
  await db
    .prepare("INSERT INTO peers (device_a, device_b, created_at) VALUES (?, ?, ?)")
    .bind(first, second, createdAt)
    .run();
}

export async function isBlockedEither(
  db: D1Database,
  deviceA: string,
  deviceB: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      `SELECT 1 AS blocked FROM blocks
       WHERE (device_id = ? AND blocked_device_id = ?)
          OR (device_id = ? AND blocked_device_id = ?)`,
    )
    .bind(deviceA, deviceB, deviceB, deviceA)
    .first<{ blocked: number }>();
  return row !== null;
}

export async function unlinkDevices(
  db: D1Database,
  deviceA: string,
  deviceB: string,
): Promise<void> {
  const [first, second] = [deviceA, deviceB].sort();
  await db.batch([
    db
      .prepare("DELETE FROM peers WHERE device_a = ? AND device_b = ?")
      .bind(first, second),
    db
      .prepare(
        `DELETE FROM peer_requests
         WHERE (from_device = ? AND to_device = ?)
            OR (from_device = ? AND to_device = ?)`,
      )
      .bind(deviceA, deviceB, deviceB, deviceA),
  ]);
}

export async function blockDevice(
  db: D1Database,
  deviceId: string,
  blockedDeviceId: string,
  createdAt: number,
): Promise<void> {
  await db
    .prepare(
      "INSERT OR IGNORE INTO blocks (device_id, blocked_device_id, created_at) VALUES (?, ?, ?)",
    )
    .bind(deviceId, blockedDeviceId, createdAt)
    .run();
}
