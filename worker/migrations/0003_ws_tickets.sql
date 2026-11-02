CREATE TABLE ws_tickets (
  ticket_hash TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0 CHECK (used IN (0, 1))
);

CREATE INDEX idx_ws_tickets_expires_at ON ws_tickets (expires_at);
