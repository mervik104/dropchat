CREATE TABLE upload_events (
  file_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_upload_events_device_time
  ON upload_events (device_id, created_at);

CREATE INDEX idx_files_owner_state ON files (owner_device, state);
CREATE INDEX idx_files_state_expires_new ON files (state, expires_at);
CREATE INDEX idx_messages_file_id ON messages (file_id);
