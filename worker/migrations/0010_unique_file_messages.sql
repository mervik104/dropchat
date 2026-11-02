DELETE FROM messages
WHERE file_id IS NOT NULL
  AND rowid NOT IN (
    SELECT MIN(rowid) FROM messages
    WHERE file_id IS NOT NULL
    GROUP BY file_id
  );

CREATE UNIQUE INDEX idx_messages_file_id_unique
  ON messages (file_id)
  WHERE file_id IS NOT NULL;
