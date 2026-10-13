type SqlValue = string | number | null

type D1Statement = {
  bind(...values: SqlValue[]): D1Statement
  first<T extends Record<string, unknown>>(): Promise<T | null>
  run(): Promise<{ success: boolean; meta?: { changes?: number } }>
  all<T extends Record<string, unknown>>(): Promise<{ success: boolean; results: T[] }>
}

type D1Database = { prepare(query: string): D1Statement }

export type SystemHealthObserverEnv = {
  DB: D1Database
  SUPABASE_HEALTH_URL?: string
  SYSTEM_HEALTH_OBSERVER_SECRET?: string
  SYSTEM_HEALTH_ENVIRONMENT?: string
  SYSTEM_HEALTH_EXPECTED_PROJECT_REF?: string
  SYSTEM_HEALTH_PROFILE_ID?: string
}

type HealthStatus = 'green' | 'yellow' | 'red' | 'gray'
type IncidentComponent = 'backend' | 'kael' | 'app' | 'operations'
type SnapshotCheck = {
  check_id: string
  component: string
  status: HealthStatus
  reason_code: string
  incident_id: string | null
  observed_at: string | null
  metrics: Record<string, number | boolean | null>
}
type Snapshot = {
  schema_version: 1 | 2
  profile_id?: string
  required_check_ids?: string[]
  coverage_gaps?: Array<'app-crash' | 'push-notifications'>
  environment: string
  project_ref: string | null
  scheduled_at: string
  completed_at: string
  expires_at: string
  overall_status: HealthStatus
  checks: SnapshotCheck[]
}
type ObserverState = {
  current_outage_id: string | null
  current_outage_reason: string | null
  current_outage_opened_at: string | null
  current_outage_synced: number
  last_cleanup_at: string | null
}
type IncidentRow = {
  incident_id: string
  fingerprint: string
  component: IncidentComponent
  severity: 'yellow' | 'red'
  status: 'open' | 'resolved'
  reason_code: string
  opened_at: string
  last_seen_at: string
  last_notified_at: string | null
  resolved_at: string | null
}
type ObserverDependencies = {
  fetcher?: typeof fetch
  now?: () => Date
  scheduledTime?: number
}
type TickClaim = { scheduledAt: string; ownerId: string; fencingToken: number }

const RESPONSE_BYTES_LIMIT = 16 * 1024
const REQUEST_TIMEOUT_MS = 5_000
const INCIDENT_RETENTION_MS = 30 * 24 * 60 * 60_000
const TICK_RETENTION_MS = 7 * 24 * 60 * 60_000
const CLEANUP_INTERVAL_MS = 24 * 60 * 60_000
const SAFE_REASON = /^[A-Z][A-Z0-9_]{0,63}$/u

export async function runSystemHealthObserver(
  env: SystemHealthObserverEnv,
  dependencies: ObserverDependencies = {},
) {
  const now = dependencies.now?.() ?? new Date()
  const fetcher = dependencies.fetcher ?? fetch
  const config = readConfig(env)
  const scheduledMs = Number.isFinite(dependencies.scheduledTime) && (dependencies.scheduledTime ?? 0) > 0
    ? dependencies.scheduledTime as number
    : Math.floor(now.getTime() / 60_000) * 60_000
  const scheduledAt = new Date(scheduledMs).toISOString()
  let snapshot: Snapshot | null = null
  let observerReachable = false
  let outageReason = config ? null : 'OBSERVER_NOT_CONFIGURED'
  let d1Status: HealthStatus = 'green'
  let observerStatus: HealthStatus = 'gray'
  let errorCode: string | null = null
  let tick: TickClaim | null = null

  try {
    await ensureState(env.DB, now.toISOString())
    tick = await claimTick(env.DB, scheduledAt, now)
    if (!tick) {
      return { snapshotStatus: 'skipped', outageReason: null, d1Status: 'green', dispatcherStatus: 'green', skipped: 'DUPLICATE_TICK' } as const
    }
    const initialState = await readState(env.DB)
    if (isDueForCleanup(initialState.last_cleanup_at, now.getTime())) await cleanupExpired(env.DB, now)

    if (config) {
      try {
        const response = await boundedFetch(fetcher, observerUrl(config.supabaseUrl, '/latest?schema_version=2'), {
          method: 'GET',
          headers: { 'x-system-monitor-observer-secret': config.observerSecret },
        })
        if (!response.ok) throw new Error('SUPABASE_READ_FAILED')
        observerReachable = true
        const payload = await readJsonBounded(response, RESPONSE_BYTES_LIMIT)
        const parsed = parseSnapshot(payload.snapshot)
        const stateReason = validateSnapshot(parsed, config, now.getTime())
        if (stateReason) outageReason = stateReason
        else snapshot = parsed
      } catch (error) {
        outageReason = error instanceof Error && SAFE_REASON.test(error.message) ? error.message : 'SUPABASE_UNAVAILABLE'
      }
    }

    if (!config) {
      await assertTickOwner(env.DB, tick, now)
      const state = await readState(env.DB)
      const outage = await openOrUpdateOutage(env.DB, state, outageReason ?? 'OBSERVER_NOT_CONFIGURED', now)
      errorCode = outage.reason_code
    } else if (outageReason) {
      await assertTickOwner(env.DB, tick, now)
      const state = await readState(env.DB)
      const outage = await openOrUpdateOutage(env.DB, state, outageReason, now)
      errorCode = outage.reason_code
      observerStatus = outage.severity === 'red' ? 'red' : 'yellow'
      if (observerReachable && state.current_outage_synced !== 1) {
        const synced = await syncExternalIncident(fetcher, config, outage, 'open')
        await assertTickOwner(env.DB, tick, now)
        if (synced) await markOutageSynced(env.DB, outage.incident_id, now.toISOString())
        else observerStatus = 'yellow'
      } else if (observerReachable) {
        const synced = await syncExternalIncident(fetcher, config, outage, 'open')
        if (!synced) observerStatus = 'yellow'
      }
      await setObserverState(env.DB, outageReason, null, now.toISOString())
    } else if (snapshot && config) {
      await assertTickOwner(env.DB, tick, now)
      const state = await readState(env.DB)
      if (state.current_outage_id) {
        const resolved = await resolveOutage(env.DB, state, config, fetcher, now)
        if (!resolved) {
          observerStatus = 'yellow'
          errorCode = 'OUTAGE_RECONCILIATION_PENDING'
        }
      }
      await assertTickOwner(env.DB, tick, now)
      await reconcileSnapshotIncidents(env.DB, snapshot, now)
      await setObserverState(env.DB, null, snapshot.completed_at, now.toISOString())
      if (observerStatus === 'gray') observerStatus = 'green'
    }

    d1Status = 'green'
  } catch (error) {
    d1Status = 'gray'
    observerStatus = 'gray'
    errorCode = error instanceof Error && SAFE_REASON.test(error.message) ? error.message : 'D1_OR_OBSERVER_OPERATION_FAILED'
    outageReason ??= errorCode
  } finally {
    if (tick) {
      await completeTick(env.DB, tick, now, d1Status === 'gray' ? 'failed' : 'completed').catch(() => undefined)
    }
  }

  if (config) {
    await postObserverHeartbeat(fetcher, config, {
      dispatcher_status: observerStatus,
      d1_status: d1Status,
      error_code: errorCode ?? (outageReason && SAFE_REASON.test(outageReason) ? outageReason : null),
    }).catch(() => undefined)
  }

  return {
    snapshotStatus: snapshot ? 'fresh' : 'unavailable',
    outageReason,
    d1Status,
    dispatcherStatus: observerStatus,
  } as const
}

async function reconcileSnapshotIncidents(
  db: D1Database,
  snapshot: Snapshot,
  now: Date,
) {
  const activeFingerprints = new Set<string>()
  for (const check of snapshot.checks) {
    if ((check.status !== 'yellow' && check.status !== 'red') || !isComponent(check.component)) continue
    const fingerprint = (snapshot.environment + ':' + check.component + ':' + check.check_id).slice(0, 180)
    activeFingerprints.add(fingerprint)
    const previous = await db.prepare(
      "SELECT incident_id, fingerprint, component, severity, status, reason_code, opened_at, last_seen_at, resolved_at FROM monitor_incidents WHERE fingerprint = ? AND status = 'open' ORDER BY opened_at DESC LIMIT 1",
    ).bind(fingerprint).first<IncidentRow>()
    const incidentId = previous?.incident_id ?? safeIncidentId(check.incident_id) ?? crypto.randomUUID()
    const openedAt = previous?.opened_at ?? check.observed_at ?? snapshot.completed_at
    const result = await db.prepare(
      "INSERT INTO monitor_incidents (incident_id, fingerprint, component, severity, status, reason_code, opened_at, last_seen_at, last_notified_at, resolved_at) VALUES (?, ?, ?, ?, 'open', ?, ?, ?, NULL, NULL) ON CONFLICT(incident_id) DO UPDATE SET severity = excluded.severity, status = 'open', reason_code = excluded.reason_code, last_seen_at = excluded.last_seen_at, resolved_at = NULL",
    ).bind(incidentId, fingerprint, check.component, check.status, check.reason_code, openedAt, now.toISOString()).run()
    if (!result.success) throw new Error('D1_INCIDENT_WRITE_FAILED')
  }

  for (const check of snapshot.checks) {
    if (check.status !== 'green' || !isComponent(check.component)) continue
    const fingerprint = (snapshot.environment + ':' + check.component + ':' + check.check_id).slice(0, 180)
    const open = await db.prepare(
      "SELECT incident_id FROM monitor_incidents WHERE fingerprint = ? AND status = 'open' ORDER BY opened_at DESC LIMIT 1",
    ).bind(fingerprint).first<{ incident_id: string }>()
    if (!open) continue
    const resolvedAt = check.observed_at ?? snapshot.completed_at
    const result = await db.prepare(
      "UPDATE monitor_incidents SET status = 'resolved', resolved_at = ?, last_seen_at = ? WHERE incident_id = ? AND status = 'open'",
    ).bind(resolvedAt, resolvedAt, open.incident_id).run()
    if (!result.success) throw new Error('D1_INCIDENT_RESOLVE_FAILED')
  }

  if (activeFingerprints.size > 100) throw new Error('SNAPSHOT_INCIDENT_LIMIT_EXCEEDED')
}
async function openOrUpdateOutage(db: D1Database, state: ObserverState, reasonCode: string, now: Date) {
  const incidentId = state.current_outage_id ?? crypto.randomUUID()
  const openedAt = state.current_outage_opened_at ?? now.toISOString()
  const fingerprint = `observer:${incidentId}`
  const changed = state.current_outage_id === null || state.current_outage_reason !== reasonCode
  const synced = changed ? 0 : state.current_outage_synced
  const incident = {
    incident_id: incidentId,
    fingerprint,
    component: 'operations' as const,
    severity: reasonCode === 'OBSERVER_NOT_CONFIGURED' ? 'red' as const : 'yellow' as const,
    reason_code: reasonCode,
    opened_at: openedAt,
  }
  const incidentWrite = await db.prepare(
    `INSERT INTO monitor_incidents (incident_id, fingerprint, component, severity, status, reason_code, opened_at, last_seen_at, last_notified_at, resolved_at)
     VALUES (?, ?, 'operations', ?, 'open', ?, ?, ?, NULL, NULL)
     ON CONFLICT(incident_id) DO UPDATE SET reason_code = excluded.reason_code, last_seen_at = excluded.last_seen_at`,
  ).bind(incidentId, fingerprint, incident.severity, reasonCode, openedAt, now.toISOString()).run()
  if (!incidentWrite.success) throw new Error('D1_OUTAGE_WRITE_FAILED')
  const stateWrite = await db.prepare(
    `UPDATE monitor_state SET current_outage_id = ?, current_outage_reason = ?, current_outage_opened_at = ?, updated_at = ?
     WHERE singleton_id = 1`,
  ).bind(incidentId, reasonCode, openedAt, now.toISOString()).run()
  if (!stateWrite.success) throw new Error('D1_STATE_WRITE_FAILED')
  if (changed) {
    const eventWrite = await db.prepare(
      'INSERT INTO monitor_outage_events (event_id, external_incident_id, event_kind, reason_code, recorded_at, sync_status) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(crypto.randomUUID(), incidentId, state.current_outage_id ? 'updated' : 'opened', reasonCode, now.toISOString(), synced === 1 ? 'synced' : 'pending').run()
    if (!eventWrite.success) throw new Error('D1_OUTAGE_EVENT_WRITE_FAILED')
  }
  return { ...incident, synced }
}

async function resolveOutage(
  db: D1Database,
  state: ObserverState,
  config: ObserverConfig,
  fetcher: typeof fetch,
  now: Date,
) {
  if (!state.current_outage_id) return null
  const incident = await db.prepare(
    'SELECT incident_id, fingerprint, component, severity, status, reason_code, opened_at, last_seen_at, last_notified_at, resolved_at FROM monitor_incidents WHERE incident_id = ? LIMIT 1',
  ).bind(state.current_outage_id).first<IncidentRow>()
  if (!incident) return null
  if (state.current_outage_synced !== 1) {
    const opened = await syncExternalIncident(fetcher, config, incident, 'open')
    if (!opened) return null
    await markOutageSynced(db, incident.incident_id, now.toISOString())
  }
  const synced = await syncExternalIncident(fetcher, config, incident, 'resolved')
  if (!synced) return null
  const incidentWrite = await db.prepare("UPDATE monitor_incidents SET status = 'resolved', resolved_at = ?, last_seen_at = ? WHERE incident_id = ?")
    .bind(now.toISOString(), now.toISOString(), incident.incident_id).run()
  if (!incidentWrite.success) throw new Error('D1_OUTAGE_RESOLVE_FAILED')
  const eventWrite = await db.prepare(
    'INSERT INTO monitor_outage_events (event_id, external_incident_id, event_kind, reason_code, recorded_at, sync_status) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(crypto.randomUUID(), incident.incident_id, 'resolved', incident.reason_code, now.toISOString(), 'synced').run()
  if (!eventWrite.success) throw new Error('D1_OUTAGE_EVENT_WRITE_FAILED')
  const stateWrite = await db.prepare(
    `UPDATE monitor_state SET current_outage_id = NULL, current_outage_reason = NULL, current_outage_opened_at = NULL, current_outage_synced = 0, updated_at = ?
     WHERE singleton_id = 1`,
  ).bind(now.toISOString()).run()
  if (!stateWrite.success) throw new Error('D1_STATE_WRITE_FAILED')
  return incident
}

async function syncExternalIncident(
  fetcher: typeof fetch,
  config: ObserverConfig,
  incident: { incident_id: string; reason_code: string; opened_at: string },
  status: 'open' | 'resolved',
) {
  const response = await boundedFetch(fetcher, observerUrl(config.supabaseUrl, '/outage'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-system-monitor-observer-secret': config.observerSecret },
    body: JSON.stringify({
      external_incident_id: incident.incident_id,
      status,
      opened_at: incident.opened_at,
      reason_code: incident.reason_code,
    }),
  })
  return response.ok
}

async function postObserverHeartbeat(
  fetcher: typeof fetch,
  config: ObserverConfig,
  heartbeat: { dispatcher_status: HealthStatus; d1_status: HealthStatus; error_code: string | null },
) {
  const response = await boundedFetch(fetcher, observerUrl(config.supabaseUrl, '/heartbeat'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-system-monitor-observer-secret': config.observerSecret },
    body: JSON.stringify(heartbeat),
  })
  if (!response.ok) throw new Error('OBSERVER_HEARTBEAT_FAILED')
}

async function ensureState(db: D1Database, now: string) {
  const result = await db.prepare('INSERT OR IGNORE INTO monitor_state (singleton_id, updated_at) VALUES (1, ?)').bind(now).run()
  if (!result.success) throw new Error('D1_STATE_INIT_FAILED')
}

async function claimTick(db: D1Database, scheduledAt: string, now: Date): Promise<TickClaim | null> {
  const current = await db.prepare('SELECT owner_id, fencing_token, lease_until, completed_at FROM monitor_ticks WHERE scheduled_at = ?')
    .bind(scheduledAt).first<{ owner_id: string; fencing_token: number; lease_until: string; completed_at: string | null }>()
  const ownerId = crypto.randomUUID()
  const leaseUntil = new Date(now.getTime() + 45_000).toISOString()
  if (current?.completed_at) return null
  if (!current) {
    try {
      const inserted = await db.prepare(
        "INSERT INTO monitor_ticks (scheduled_at, owner_id, fencing_token, lease_until, completed_at, outcome, updated_at) VALUES (?, ?, 1, ?, NULL, NULL, ?)",
      ).bind(scheduledAt, ownerId, leaseUntil, now.toISOString()).run()
      if (!inserted.success) throw new Error('D1_TICK_CLAIM_FAILED')
    } catch {
      const raced = await db.prepare('SELECT owner_id FROM monitor_ticks WHERE scheduled_at = ?').bind(scheduledAt).first<{ owner_id: string }>()
      if (raced) return null
      throw new Error('D1_TICK_CLAIM_FAILED')
    }
    return { scheduledAt, ownerId, fencingToken: 1 }
  }
  if (Date.parse(current.lease_until) > now.getTime()) return null
  const claimed = await db.prepare(
    "UPDATE monitor_ticks SET owner_id = ?, fencing_token = fencing_token + 1, lease_until = ?, updated_at = ? WHERE scheduled_at = ? AND completed_at IS NULL AND lease_until <= ?",
  ).bind(ownerId, leaseUntil, now.toISOString(), scheduledAt, now.toISOString()).run()
  if (!claimed.success || (claimed.meta?.changes ?? 0) !== 1) return null
  const updated = await db.prepare('SELECT owner_id, fencing_token FROM monitor_ticks WHERE scheduled_at = ?')
    .bind(scheduledAt).first<{ owner_id: string; fencing_token: number }>()
  if (!updated || updated.owner_id !== ownerId || !Number.isSafeInteger(updated.fencing_token)) return null
  return { scheduledAt, ownerId, fencingToken: updated.fencing_token }
}

async function assertTickOwner(db: D1Database, claim: TickClaim, now: Date) {
  const current = await db.prepare('SELECT owner_id, fencing_token, lease_until, completed_at FROM monitor_ticks WHERE scheduled_at = ?')
    .bind(claim.scheduledAt).first<{ owner_id: string; fencing_token: number; lease_until: string; completed_at: string | null }>()
  if (!current || current.owner_id !== claim.ownerId || current.fencing_token !== claim.fencingToken ||
      current.completed_at !== null || Date.parse(current.lease_until) <= now.getTime()) {
    throw new Error('STALE_TICK_LEASE')
  }
}

async function completeTick(db: D1Database, claim: TickClaim, now: Date, outcome: 'completed' | 'failed') {
  const result = await db.prepare(
    'UPDATE monitor_ticks SET completed_at = ?, outcome = ?, updated_at = ? WHERE scheduled_at = ? AND owner_id = ? AND fencing_token = ? AND completed_at IS NULL',
  ).bind(now.toISOString(), outcome, now.toISOString(), claim.scheduledAt, claim.ownerId, claim.fencingToken).run()
  if (!result.success) throw new Error('D1_TICK_COMPLETION_FAILED')
  if ((result.meta?.changes ?? 0) === 1) {
    const state = await db.prepare('UPDATE monitor_state SET last_completed_at = ?, last_error_code = ?, updated_at = ? WHERE singleton_id = 1')
      .bind(now.toISOString(), outcome === 'completed' ? null : 'OBSERVER_TICK_FAILED', now.toISOString()).run()
    if (!state.success) throw new Error('D1_STATE_WRITE_FAILED')
  }
}

async function readState(db: D1Database): Promise<ObserverState> {
  const state = await db.prepare(
    'SELECT current_outage_id, current_outage_reason, current_outage_opened_at, current_outage_synced, last_cleanup_at FROM monitor_state WHERE singleton_id = 1',
  ).first<ObserverState>()
  if (!state) throw new Error('D1_STATE_MISSING')
  return state
}

async function markOutageSynced(db: D1Database, incidentId: string, now: string) {
  const result = await db.prepare('UPDATE monitor_state SET current_outage_synced = 1, updated_at = ? WHERE singleton_id = 1 AND current_outage_id = ?')
    .bind(now, incidentId).run()
  if (!result.success) throw new Error('D1_STATE_WRITE_FAILED')
  const events = await db.prepare("UPDATE monitor_outage_events SET sync_status = 'synced' WHERE external_incident_id = ? AND event_kind != 'resolved' AND sync_status = 'pending'")
    .bind(incidentId).run()
  if (!events.success) throw new Error('D1_OUTAGE_EVENT_SYNC_FAILED')
}

async function setObserverState(db: D1Database, errorCode: string | null, snapshotAt: string | null, now: string) {
  await db.prepare('UPDATE monitor_state SET current_outage_reason = COALESCE(?, current_outage_reason), last_snapshot_at = COALESCE(?, last_snapshot_at), updated_at = ? WHERE singleton_id = 1')
    .bind(errorCode, snapshotAt, now).run()
}

async function cleanupExpired(db: D1Database, now: Date) {
  const incidentCutoff = new Date(now.getTime() - INCIDENT_RETENTION_MS).toISOString()
  const tickCutoff = new Date(now.getTime() - TICK_RETENTION_MS).toISOString()
  const statements = [
    db.prepare("DELETE FROM monitor_incidents WHERE incident_id IN (SELECT incident_id FROM monitor_incidents WHERE status = 'resolved' AND resolved_at < ? ORDER BY resolved_at LIMIT 200)").bind(incidentCutoff),
    db.prepare("DELETE FROM monitor_outage_events WHERE event_id IN (SELECT event_id FROM monitor_outage_events WHERE sync_status = 'synced' AND event_kind = 'resolved' AND recorded_at < ? ORDER BY recorded_at LIMIT 200)").bind(incidentCutoff),
    db.prepare("DELETE FROM monitor_ticks WHERE scheduled_at IN (SELECT scheduled_at FROM monitor_ticks WHERE scheduled_at < ? AND (completed_at IS NOT NULL OR lease_until < ?) ORDER BY scheduled_at LIMIT 2000)").bind(tickCutoff, tickCutoff),
  ]
  const results = await Promise.all(statements.map((statement) => statement.run()))
  if (results.some((result) => !result.success)) throw new Error('D1_CLEANUP_FAILED')
  const remaining = await db.prepare("SELECT (SELECT COUNT(*) FROM monitor_incidents WHERE status = 'resolved' AND resolved_at < ?) + (SELECT COUNT(*) FROM monitor_outage_events WHERE sync_status = 'synced' AND event_kind = 'resolved' AND recorded_at < ?) AS count")
    .bind(incidentCutoff, incidentCutoff).first<{ count: number }>()
  const remainingTicks = await db.prepare('SELECT COUNT(*) AS count FROM monitor_ticks WHERE scheduled_at < ? AND (completed_at IS NOT NULL OR lease_until < ?)')
    .bind(tickCutoff, tickCutoff).first<{ count: number }>()
  if (!remaining || !remainingTicks) throw new Error('D1_CLEANUP_FAILED')
  if (remaining.count === 0 && remainingTicks.count === 0) {
    const state = await db.prepare('UPDATE monitor_state SET last_cleanup_at = ?, updated_at = ? WHERE singleton_id = 1').bind(now.toISOString(), now.toISOString()).run()
    if (!state.success) throw new Error('D1_CLEANUP_FAILED')
  }
}

function isDueForCleanup(lastCleanupAt: string | null, nowMs: number) {
  if (!lastCleanupAt) return true
  const previous = Date.parse(lastCleanupAt)
  return !Number.isFinite(previous) || nowMs - previous >= CLEANUP_INTERVAL_MS
}

function readConfig(env: SystemHealthObserverEnv): ObserverConfig | null {
  const rawUrl = env.SUPABASE_HEALTH_URL?.trim() ?? ''
  const secret = env.SYSTEM_HEALTH_OBSERVER_SECRET?.trim() ?? ''
  const environment = env.SYSTEM_HEALTH_ENVIRONMENT ?? ''
  const projectRef = env.SYSTEM_HEALTH_EXPECTED_PROJECT_REF ?? ''
  const profileId = env.SYSTEM_HEALTH_PROFILE_ID ?? ''
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co') || url.pathname !== '/' || url.username || url.password || url.search || url.hash) return null
    if (secret.length < 32 || /\s/u.test(secret)) return null
    if (environment !== 'production' || !/^[a-z0-9]{8,40}$/u.test(projectRef) || profileId !== 'cloudflare-admin-v1') return null
    return { supabaseUrl: url.origin, observerSecret: secret, environment, projectRef, profileId }
  } catch {
    return null
  }
}

type ObserverConfig = { supabaseUrl: string; observerSecret: string; environment: string; projectRef: string; profileId: string }

export function isSystemHealthObserverConfigured(env: SystemHealthObserverEnv) {
  return readConfig(env) !== null
}

function observerUrl(base: string, path: string) {
  return new URL(`/functions/v1/system-monitor/observer${path}`, `${base.replace(/\/+$/u, '')}/`).toString()
}

function validateSnapshot(snapshot: Snapshot | null, config: ObserverConfig, nowMs: number): string | null {
  if (!snapshot) return 'SNAPSHOT_INVALID'
  if (snapshot.schema_version !== 2 || snapshot.profile_id !== config.profileId) return 'PROFILE_UNAVAILABLE'
  if (snapshot.environment !== config.environment || snapshot.project_ref !== config.projectRef) return 'SNAPSHOT_IDENTITY_MISMATCH'
  const scheduled = Date.parse(snapshot.scheduled_at)
  const completed = Date.parse(snapshot.completed_at)
  const expires = Date.parse(snapshot.expires_at)
  if (!Number.isFinite(scheduled) || !Number.isFinite(completed) || !Number.isFinite(expires) ||
      scheduled > completed || completed > nowMs || expires <= completed || expires - completed > 180_000 ||
      expires <= nowMs || nowMs - completed > 180_000) return 'SNAPSHOT_STALE'
  for (const check of snapshot.checks) {
    const observed = check.observed_at === null ? null : Date.parse(check.observed_at)
    if (observed !== null && (!Number.isFinite(observed) || observed > nowMs)) return 'SNAPSHOT_INVALID'
    if (check.status !== 'gray' && (observed === null || nowMs - observed > 180_000)) return 'SNAPSHOT_STALE'
  }
  const observedIds = new Set(snapshot.checks.map((check) => check.check_id))
  if ((snapshot.required_check_ids ?? []).some((checkId) => !observedIds.has(checkId))) return 'REQUIRED_CHECK_MISSING'
  return null
}

function parseSnapshot(value: unknown): Snapshot | null {
  const row = asRecord(value)
  if (!row || (row.schema_version !== 1 && row.schema_version !== 2) || !isStatus(row.overall_status) ||
      !['production', 'staging', 'local'].includes(String(row.environment)) ||
      !(row.project_ref === null || /^[a-z0-9]{8,40}$/u.test(String(row.project_ref))) ||
      !isDateString(row.scheduled_at) || !isDateString(row.completed_at) || !isDateString(row.expires_at) ||
      !Array.isArray(row.checks) || row.checks.length > 32) return null
  if (row.schema_version === 2 && (row.profile_id !== 'cloudflare-admin-v1' || !Array.isArray(row.required_check_ids) ||
      row.required_check_ids.length < 1 || row.required_check_ids.length > 32 ||
      row.required_check_ids.some((value) => typeof value !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,79}$/u.test(value)) ||
      new Set(row.required_check_ids).size !== row.required_check_ids.length || !Array.isArray(row.coverage_gaps) ||
      row.coverage_gaps.length !== 2)) return null
  const coverageGaps = row.schema_version === 2 ? row.coverage_gaps as unknown[] : []
  if (row.schema_version === 2) {
    const sources = new Set<string>()
    for (const item of coverageGaps) {
      if (!['app-crash', 'push-notifications'].includes(String(item)) || sources.has(String(item))) return null
      sources.add(String(item))
    }
    if (sources.size !== 2) return null
  }
  const checks: SnapshotCheck[] = []
  const seenIds = new Set<string>()
  for (const item of row.checks) {
    const check = asRecord(item)
    const metrics = asRecord(check?.metrics)
    if (!check || typeof check.check_id !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,79}$/u.test(check.check_id) ||
        seenIds.has(check.check_id) || typeof check.component !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,39}$/u.test(check.component) ||
        !isStatus(check.status) || typeof check.reason_code !== 'string' || !SAFE_REASON.test(check.reason_code) ||
        !(check.incident_id === null || safeIncidentId(check.incident_id)) ||
        !(check.observed_at === null || isDateString(check.observed_at)) || !metrics || Object.keys(metrics).length > 32 ||
        Object.entries(metrics).some(([key, metric]) => !/^[a-z][a-z0-9_]{0,39}$/u.test(key) ||
          !(metric === null || typeof metric === 'boolean' || typeof metric === 'number' && Number.isFinite(metric)))) return null
    seenIds.add(check.check_id)
    checks.push({
      check_id: check.check_id,
      component: check.component,
      status: check.status,
      reason_code: check.reason_code,
      incident_id: check.incident_id as string | null,
      observed_at: check.observed_at as string | null,
      metrics: metrics as Record<string, number | boolean | null>,
    })
  }
  const snapshot: Snapshot = {
    schema_version: row.schema_version,
    ...(row.schema_version === 2 ? {
      profile_id: row.profile_id as string,
      required_check_ids: row.required_check_ids as string[],
      coverage_gaps: coverageGaps as Snapshot['coverage_gaps'],
    } : {}),
    environment: row.environment as string,
    project_ref: row.project_ref as string | null,
    scheduled_at: row.scheduled_at,
    completed_at: row.completed_at,
    expires_at: row.expires_at,
    overall_status: row.overall_status,
    checks,
  }
  if (evaluateSnapshotStatus(checks, row.schema_version === 2 ? row.required_check_ids as string[] : []) !== row.overall_status) return null
  return snapshot
}

function evaluateSnapshotStatus(checks: readonly SnapshotCheck[], requiredCheckIds: readonly string[]): HealthStatus {
  if (checks.length === 0) return 'gray'
  if (checks.some((check) => check.status === 'red')) return 'red'
  if (checks.some((check) => check.status === 'yellow')) return 'yellow'
  const observedIds = new Set(checks.map((check) => check.check_id))
  if (requiredCheckIds.some((checkId) => !observedIds.has(checkId)) || checks.some((check) => check.status === 'gray')) return 'gray'
  return 'green'
}

function isDateString(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) && Number.isFinite(Date.parse(value))
}

async function boundedFetch(fetcher: typeof fetch, rawUrl: string, init: RequestInit) {
  const url = new URL(rawUrl)
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co')) {
    throw new Error('OUTBOUND_URL_REJECTED')
  }
  return fetcher(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
}

async function readJsonBounded(response: Response, maxBytes: number): Promise<unknown> {
  const declared = response.headers.get('content-length')
  if (declared && /^\d+$/u.test(declared) && Number(declared) > maxBytes) throw new Error('RESPONSE_TOO_LARGE')
  if (!response.body) throw new Error('RESPONSE_BODY_MISSING')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      total += chunk.value.byteLength
      if (total > maxBytes) {
        await reader.cancel()
        throw new Error('RESPONSE_TOO_LARGE')
      }
      chunks.push(chunk.value)
    }
  } finally {
    reader.releaseLock()
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  try { return JSON.parse(new TextDecoder().decode(bytes)) as unknown } catch { throw new Error('RESPONSE_INVALID_JSON') }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function isStatus(value: unknown): value is HealthStatus {
  return value === 'green' || value === 'yellow' || value === 'red' || value === 'gray'
}

function isComponent(value: string): value is IncidentComponent {
  return value === 'backend' || value === 'kael' || value === 'app' || value === 'operations'
}

function safeIncidentId(value: unknown): string | null {
  return isSafeToken(value, 80) && /^[A-Za-z0-9_-]{8,80}$/u.test(value) ? value : null
}

function isSafeToken(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength && /^[A-Za-z0-9._:+-]+$/u.test(value)
}
