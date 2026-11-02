ALTER TABLE invite_failures ADD COLUMN ip_group TEXT;

CREATE TABLE blocks (
  device_id TEXT NOT NULL,
  blocked_device_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (device_id, blocked_device_id)
);

CREATE INDEX idx_blocks_blocked_device ON blocks (blocked_device_id);
