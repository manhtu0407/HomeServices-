CREATE TABLE IF NOT EXISTS monitor_state (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  current_outage_id TEXT,
  current_outage_reason TEXT,
  current_outage_opened_at TEXT,
  current_outage_synced INTEGER NOT NULL DEFAULT 0 CHECK (current_outage_synced IN (0, 1)),
  last_snapshot_at TEXT,
  last_cleanup_at TEXT,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO monitor_state (singleton_id, updated_at) VALUES (1, '1970-01-01T00:00:00.000Z');

CREATE TABLE IF NOT EXISTS monitor_incidents (
  incident_id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL UNIQUE,
  component TEXT NOT NULL CHECK (component IN ('backend', 'kael', 'app', 'operations')),
  severity TEXT NOT NULL CHECK (severity IN ('yellow', 'red')),
  status TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
  reason_code TEXT NOT NULL CHECK (reason_code GLOB '[A-Z]*'),
  opened_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  last_notified_at TEXT,
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS monitor_incidents_opened_status_idx
  ON monitor_incidents (status, last_seen_at);

CREATE TABLE IF NOT EXISTS monitor_deliveries (
  delivery_key TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL,
  message_kind TEXT NOT NULL CHECK (message_kind IN ('open', 'reminder', 'resolved')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'sending', 'sent')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TEXT,
  lease_until TEXT,
  sent_at TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS monitor_deliveries_retry_idx
  ON monitor_deliveries (status, next_attempt_at, lease_until);
