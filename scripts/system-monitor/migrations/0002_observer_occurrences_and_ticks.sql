ALTER TABLE monitor_incidents RENAME TO monitor_incidents_v1;

CREATE TABLE monitor_incidents (
  incident_id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  component TEXT NOT NULL CHECK (component IN ('backend', 'kael', 'app', 'operations')),
  severity TEXT NOT NULL CHECK (severity IN ('yellow', 'red')),
  status TEXT NOT NULL CHECK (status IN ('open', 'resolved')),
  reason_code TEXT NOT NULL CHECK (reason_code GLOB '[A-Z]*'),
  opened_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  last_notified_at TEXT,
  resolved_at TEXT
);

INSERT INTO monitor_incidents (incident_id, fingerprint, component, severity, status, reason_code, opened_at, last_seen_at, last_notified_at, resolved_at)
SELECT incident_id, fingerprint, component, severity, status, reason_code, opened_at, last_seen_at, last_notified_at, resolved_at
FROM monitor_incidents_v1;

DROP TABLE monitor_incidents_v1;

CREATE UNIQUE INDEX monitor_incidents_one_open_fingerprint_idx
  ON monitor_incidents (fingerprint) WHERE status = 'open';
CREATE INDEX monitor_incidents_history_idx
  ON monitor_incidents (fingerprint, opened_at DESC, incident_id DESC);
CREATE INDEX monitor_incidents_opened_status_idx
  ON monitor_incidents (status, last_seen_at);

CREATE TABLE monitor_ticks (
  scheduled_at TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  fencing_token INTEGER NOT NULL CHECK (fencing_token > 0),
  lease_until TEXT NOT NULL,
  completed_at TEXT,
  outcome TEXT CHECK (outcome IS NULL OR outcome IN ('completed', 'failed')),
  updated_at TEXT NOT NULL,
  CHECK ((completed_at IS NULL AND outcome IS NULL) OR (completed_at IS NOT NULL AND outcome IS NOT NULL))
);

CREATE TABLE monitor_outage_events (
  event_id TEXT PRIMARY KEY,
  external_incident_id TEXT NOT NULL,
  event_kind TEXT NOT NULL CHECK (event_kind IN ('opened', 'updated', 'resolved')),
  reason_code TEXT NOT NULL CHECK (reason_code GLOB '[A-Z]*'),
  recorded_at TEXT NOT NULL,
  sync_status TEXT NOT NULL CHECK (sync_status IN ('pending', 'synced')),
  UNIQUE (external_incident_id, event_kind, reason_code, recorded_at)
);

CREATE INDEX monitor_outage_events_sync_idx
  ON monitor_outage_events (sync_status, recorded_at, event_id);

ALTER TABLE monitor_state ADD COLUMN last_completed_at TEXT;
ALTER TABLE monitor_state ADD COLUMN last_error_code TEXT;
