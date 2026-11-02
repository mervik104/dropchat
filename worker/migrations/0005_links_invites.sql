CREATE TABLE peer_requests (
  from_device TEXT NOT NULL,
  to_device TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (from_device, to_device)
);

CREATE INDEX idx_peer_requests_to_device ON peer_requests (to_device);

CREATE TABLE invite_failures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  device_id TEXT NOT NULL,
  attempted_at INTEGER NOT NULL
);

CREATE INDEX idx_invite_failures_device_time
  ON invite_failures (device_id, attempted_at);
