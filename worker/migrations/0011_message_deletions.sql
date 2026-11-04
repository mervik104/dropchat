CREATE TABLE message_deletions (
  id TEXT PRIMARY KEY,
  chat_key TEXT NOT NULL,
  deleted_at INTEGER NOT NULL
);

CREATE INDEX idx_message_deletions_chat
  ON message_deletions (chat_key, deleted_at);
