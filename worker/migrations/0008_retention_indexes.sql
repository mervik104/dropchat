CREATE INDEX idx_files_state_created ON files (state, created_at);
CREATE INDEX idx_invites_expires_at ON invites (expires_at);
CREATE INDEX idx_peer_requests_created_at ON peer_requests (created_at);
