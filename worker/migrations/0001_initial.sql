CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  secret_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  platform TEXT NOT NULL,
  ip_group TEXT NOT NULL,
  invisible INTEGER NOT NULL DEFAULT 0 CHECK (invisible IN (0, 1)),
  last_seen INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_devices_ip_group ON devices (ip_group);
CREATE INDEX idx_devices_last_seen ON devices (last_seen);

CREATE TABLE peers (
  device_a TEXT NOT NULL,
  device_b TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (device_a, device_b),
  CHECK (device_a < device_b)
);

CREATE INDEX idx_peers_device_b ON peers (device_b);

CREATE TABLE invites (
  code TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  used INTEGER NOT NULL DEFAULT 0 CHECK (used IN (0, 1))
);

CREATE INDEX idx_invites_device_id ON invites (device_id);

CREATE TABLE files (
  id TEXT PRIMARY KEY,
  owner_device TEXT NOT NULL,
  peer_device TEXT NOT NULL,
  name TEXT NOT NULL,
  size INTEGER NOT NULL,
  mime TEXT NOT NULL,
  session_id TEXT,
  drive_file_id TEXT,
  uploaded_bytes INTEGER NOT NULL DEFAULT 0,
  state TEXT NOT NULL CHECK (state IN ('uploading', 'ready', 'deleted')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX idx_files_owner_device ON files (owner_device);
CREATE INDEX idx_files_peer_device ON files (peer_device);
CREATE INDEX idx_files_state_expires ON files (state, expires_at);

CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  chat_key TEXT NOT NULL,
  from_device TEXT NOT NULL,
  to_device TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('text', 'file')),
  text TEXT,
  file_id TEXT,
  file_name TEXT,
  file_size INTEGER,
  mime TEXT,
  transport TEXT CHECK (transport IN ('cloud', 'p2p')),
  status TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX idx_messages_chat_created ON messages (chat_key, created_at DESC);
CREATE INDEX idx_messages_expires ON messages (expires_at);

CREATE TABLE usage (
  device_id TEXT NOT NULL,
  day TEXT NOT NULL,
  bytes_uploaded INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (device_id, day)
);
