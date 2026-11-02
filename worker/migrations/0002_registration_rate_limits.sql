CREATE TABLE registration_rate_limits (
  ip_group TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);
