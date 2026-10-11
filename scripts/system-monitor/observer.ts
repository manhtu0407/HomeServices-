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
  TELEGRAM_BOT_TOKEN?: string
  TELEGRAM_CHAT_ID?: string
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
  schema_version: 1
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
  sleep?: (durationMs: number) => Promise<void>
}
type NotificationResult = 'sent' | 'deferred' | 'failed'

const RESPONSE_BYTES_LIMIT = 16 * 1024
const REQUEST_TIMEOUT_MS = 5_000
const MAX_NOTIFICATIONS_PER_TICK = 5
const REMINDER_INTERVAL_MS = 30 * 60_000
const INCIDENT_RETENTION_MS = 30 * 24 * 60 * 60_000
const CLEANUP_INTERVAL_MS = 24 * 60 * 60_000
const SAFE_REASON = /^[A-Z][A-Z0-9_]{0,63}$/u

export async function runSystemHealthObserver(
  env: SystemHealthObserverEnv,
  dependencies: ObserverDependencies = {},
) {
  const now = dependencies.now?.() ?? new Date()
  const fetcher = dependencies.fetcher ?? fetch
  const sleep = dependencies.sleep ?? ((durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs)))
  const config = readConfig(env)
  let snapshot: Snapshot | null = null
  let observerReachable = false
  let outageReason: string | null = null

  if (!config) outageReason = 'OBSERVER_NOT_CONFIGURED'
  else {
    try {
      const response = await boundedFetch(fetcher, observerUrl(config.supabaseUrl, '/latest'), {
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

  let d1Healthy = true
  let dispatcherStatus: HealthStatus = 'green'
  let errorCode: string | null = null
  try {
    await ensureState(env.DB, now.toISOString())
    const state = await readState(env.DB)
    if (isDueForCleanup(state.last_cleanup_at, now.getTime())) await cleanupExpired(env.DB, now)

    if (outageReason) {
      const outage = await openOrUpdateOutage(env.DB, state, outageReason, now)
      if (observerReachable && config) {
        const synced = await syncExternalIncident(fetcher, config, outage, 'open')
        if (synced) await markOutageSynced(env.DB, outage.incident_id, now.toISOString())
        else dispatcherStatus = 'yellow'
      }
      const delivery = await deliverIncident(env, fetcher, sleep, outage, 'open', now)
      if (delivery !== 'sent') dispatcherStatus = 'yellow'
      await setObserverState(env.DB, outageReason, null, now.toISOString())
    } else if (snapshot && config) {
      const stateAfterSync = await readState(env.DB)
      if (stateAfterSync.current_outage_id) {
        const resolved = await resolveOutage(env.DB, stateAfterSync, config, fetcher, now)
        if (!resolved) dispatcherStatus = 'yellow'
        else {
          const delivery = await deliverIncident(env, fetcher, sleep, resolved, 'resolved', now)
          if (delivery !== 'sent') dispatcherStatus = 'yellow'
        }
      }
      const incidentDispatch = await reconcileSnapshotIncidents(env, fetcher, sleep, snapshot, now)
      if (incidentDispatch === 'failed') dispatcherStatus = 'yellow'
      await setObserverState(env.DB, null, snapshot.completed_at, now.toISOString())
    }
  } catch {
    d1Healthy = false
    dispatcherStatus = 'gray'
    errorCode = 'D1_UNAVAILABLE'
  }

  if (config) {
    await postObserverHeartbeat(fetcher, config, {
      dispatcher_status: dispatcherStatus,
      d1_status: d1Healthy ? 'green' : 'gray',
      error_code: errorCode ?? (outageReason && SAFE_REASON.test(outageReason) ? outageReason : null),
    }).catch(() => undefined)
  }

  return {
    snapshotStatus: snapshot ? 'fresh' : 'unavailable',
    outageReason,
    d1Status: d1Healthy ? 'green' : 'gray',
    dispatcherStatus,
  } as const
}

async function reconcileSnapshotIncidents(
  env: SystemHealthObserverEnv,
  fetcher: typeof fetch,
  sleep: (durationMs: number) => Promise<void>,
  snapshot: Snapshot,
  now: Date,
): Promise<'sent' | 'failed'> {
  const active = new Map<string, { incidentId: string; fingerprint: string; component: IncidentComponent; severity: 'yellow' | 'red'; reasonCode: string; openedAt: string }>()
  for (const check of snapshot.checks) {
    if ((check.status !== 'yellow' && check.status !== 'red') || !isComponent(check.component)) continue
    const incidentId = safeIncidentId(check.incident_id) ?? `untracked-${check.component}-${check.check_id}`
    const fingerprint = `${snapshot.environment}:${check.component}:${check.check_id}`.slice(0, 180)
    active.set(incidentId, {
      incidentId,
      fingerprint,
      component: check.component,
      severity: check.status === 'red' ? 'red' : 'yellow',
      reasonCode: check.reason_code,
      openedAt: check.observed_at ?? snapshot.completed_at,
    })
  }
  for (const check of snapshot.checks) {
    if (check.component !== 'app' || check.check_id !== 'app-native-sentry' || check.metrics.sentry_errors !== null) continue
    const incidentId = `untracked-${snapshot.environment}-app-sentry-coverage`
    active.set(incidentId, {
      incidentId,
      fingerprint: sentryCoverageFingerprint(snapshot.environment),
      component: 'app',
      severity: 'yellow',
      reasonCode: check.reason_code === 'SENTRY_NOT_CONFIGURED' ? check.reason_code : 'SENTRY_SOURCE_UNAVAILABLE',
      openedAt: check.observed_at ?? snapshot.completed_at,
    })
  }

  const existingResult = await env.DB.prepare(
    "SELECT incident_id, fingerprint, component, severity, status, reason_code, opened_at, last_seen_at, last_notified_at, resolved_at FROM monitor_incidents WHERE status = 'open' ORDER BY opened_at ASC LIMIT 100",
  ).all<IncidentRow>()
  if (!existingResult.success) throw new Error('D1_READ_FAILED')
  let result: NotificationResult = 'sent'
  let sends = 0
  const activeFingerprints = new Set([...active.values()].map((incident) => incident.fingerprint))
  const greenFingerprints = new Set(snapshot.checks
    .filter((check) => check.status === 'green')
    .map((check) => `${snapshot.environment}:${check.component}:${check.check_id}`.slice(0, 180)))
  if (snapshot.checks.some((check) => check.component === 'app' && check.check_id === 'app-native-sentry' && typeof check.metrics.sentry_errors === 'number')) {
    greenFingerprints.add(sentryCoverageFingerprint(snapshot.environment))
  }

  for (const incident of active.values()) {
    const previous = await env.DB.prepare(
      'SELECT incident_id, fingerprint, component, severity, status, reason_code, opened_at, last_seen_at, last_notified_at, resolved_at FROM monitor_incidents WHERE incident_id = ? OR fingerprint = ? LIMIT 1',
    ).bind(incident.incidentId, incident.fingerprint).first<IncidentRow>()
    const isNew = !previous || previous.status === 'resolved'
    await env.DB.prepare(
      `INSERT INTO monitor_incidents (incident_id, fingerprint, component, severity, status, reason_code, opened_at, last_seen_at, last_notified_at, resolved_at)
       VALUES (?, ?, ?, ?, 'open', ?, ?, ?, NULL, NULL)
       ON CONFLICT(fingerprint) DO UPDATE SET incident_id = excluded.incident_id, component = excluded.component, severity = excluded.severity, status = 'open', reason_code = excluded.reason_code, last_seen_at = excluded.last_seen_at, resolved_at = NULL`,
    ).bind(incident.incidentId, incident.fingerprint, incident.component, incident.severity, incident.reasonCode, incident.openedAt, now.toISOString()).run()

    const dueReminder = Boolean(previous?.last_notified_at && now.getTime() - Date.parse(previous.last_notified_at) >= REMINDER_INTERVAL_MS)
    const dueNotification = isNew || !previous?.last_notified_at || dueReminder
    if (!dueNotification || sends >= MAX_NOTIFICATIONS_PER_TICK) continue
    const kind = isNew || !previous?.last_notified_at ? 'open' : 'reminder'
    const delivery = await deliverIncident(env, fetcher, sleep, {
      incident_id: incident.incidentId,
      fingerprint: incident.fingerprint,
      component: incident.component,
      severity: incident.severity,
      reason_code: incident.reasonCode,
      opened_at: previous?.opened_at ?? incident.openedAt,
    }, kind, now)
    if (delivery === 'sent') {
      sends += 1
      await env.DB.prepare('UPDATE monitor_incidents SET last_notified_at = ? WHERE incident_id = ?')
        .bind(now.toISOString(), incident.incidentId).run()
    } else result = 'failed'
  }

  for (const previous of existingResult.results) {
    if (active.has(previous.incident_id) || activeFingerprints.has(previous.fingerprint)) continue
    if (!greenFingerprints.has(previous.fingerprint)) continue
    await env.DB.prepare("UPDATE monitor_incidents SET status = 'resolved', resolved_at = ?, last_seen_at = ? WHERE incident_id = ? AND status = 'open'")
      .bind(now.toISOString(), now.toISOString(), previous.incident_id).run()
    if (sends >= MAX_NOTIFICATIONS_PER_TICK) continue
    const delivery = await deliverIncident(env, fetcher, sleep, previous, 'resolved', now)
    if (delivery === 'sent') {
      sends += 1
      await env.DB.prepare('UPDATE monitor_incidents SET last_notified_at = ? WHERE incident_id = ?')
        .bind(now.toISOString(), previous.incident_id).run()
    } else result = 'failed'
  }
  return result
}

async function openOrUpdateOutage(db: D1Database, state: ObserverState, reasonCode: string, now: Date) {
  const incidentId = state.current_outage_id ?? crypto.randomUUID()
  const openedAt = state.current_outage_opened_at ?? now.toISOString()
  const fingerprint = `observer:${incidentId}`
  const incident = {
    incident_id: incidentId,
    fingerprint,
    component: 'operations' as const,
    severity: reasonCode === 'OBSERVER_NOT_CONFIGURED' ? 'red' as const : 'yellow' as const,
    reason_code: reasonCode,
    opened_at: openedAt,
  }
  await db.prepare(
    `INSERT INTO monitor_incidents (incident_id, fingerprint, component, severity, status, reason_code, opened_at, last_seen_at, last_notified_at, resolved_at)
     VALUES (?, ?, 'operations', ?, 'open', ?, ?, ?, NULL, NULL)
     ON CONFLICT(incident_id) DO UPDATE SET reason_code = excluded.reason_code, last_seen_at = excluded.last_seen_at`,
  ).bind(incidentId, fingerprint, incident.severity, reasonCode, openedAt, now.toISOString()).run()
  await db.prepare(
    `UPDATE monitor_state SET current_outage_id = ?, current_outage_reason = ?, current_outage_opened_at = ?, updated_at = ?
     WHERE singleton_id = 1`,
  ).bind(incidentId, reasonCode, openedAt, now.toISOString()).run()
  return incident
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
  await db.prepare("UPDATE monitor_incidents SET status = 'resolved', resolved_at = ?, last_seen_at = ? WHERE incident_id = ?")
    .bind(now.toISOString(), now.toISOString(), incident.incident_id).run()
  await db.prepare(
    `UPDATE monitor_state SET current_outage_id = NULL, current_outage_reason = NULL, current_outage_opened_at = NULL, current_outage_synced = 0, updated_at = ?
     WHERE singleton_id = 1`,
  ).bind(now.toISOString()).run()
  return incident
}

async function deliverIncident(
  env: SystemHealthObserverEnv,
  fetcher: typeof fetch,
  sleep: (durationMs: number) => Promise<void>,
  incident: { incident_id: string; component: IncidentComponent; severity: 'yellow' | 'red'; reason_code: string; opened_at: string },
  kind: 'open' | 'reminder' | 'resolved',
  now: Date,
): Promise<NotificationResult> {
  const deliveryKey = kind === 'reminder'
    ? `incident:${incident.incident_id}:reminder:${Math.floor(now.getTime() / REMINDER_INTERVAL_MS)}`
    : `incident:${incident.incident_id}:${kind}`
  await env.DB.prepare(
    `INSERT OR IGNORE INTO monitor_deliveries (delivery_key, incident_id, message_kind, status, attempts, next_attempt_at, lease_until, sent_at, error_code, created_at, updated_at)
     VALUES (?, ?, ?, 'pending', 0, NULL, NULL, NULL, NULL, ?, ?)`,
  ).bind(deliveryKey, incident.incident_id, kind, now.toISOString(), now.toISOString()).run()
  const claim = await env.DB.prepare(
    `UPDATE monitor_deliveries SET status = 'sending', attempts = attempts + 1, lease_until = ?, updated_at = ?
     WHERE delivery_key = ? AND status != 'sent'
       AND (status != 'sending' OR lease_until IS NULL OR lease_until <= ?)
       AND (next_attempt_at IS NULL OR next_attempt_at <= ?)`,
  ).bind(new Date(now.getTime() + 30_000).toISOString(), now.toISOString(), deliveryKey, now.toISOString(), now.toISOString()).run()
  if ((claim.meta?.changes ?? 0) !== 1) {
    const existing = await env.DB.prepare('SELECT status FROM monitor_deliveries WHERE delivery_key = ?')
      .bind(deliveryKey).first<{ status: string }>()
    return existing?.status === 'sent' ? 'sent' : 'deferred'
  }

  const message = buildTelegramMessage(incident, kind, now)
  const sent = await sendTelegram(env, fetcher, sleep, message, now)
  if (sent.kind === 'sent') {
    await env.DB.prepare(
      "UPDATE monitor_deliveries SET status = 'sent', sent_at = ?, lease_until = NULL, next_attempt_at = NULL, error_code = NULL, updated_at = ? WHERE delivery_key = ?",
    ).bind(now.toISOString(), now.toISOString(), deliveryKey).run()
    return 'sent'
  }
  await env.DB.prepare(
    "UPDATE monitor_deliveries SET status = 'pending', lease_until = NULL, next_attempt_at = ?, error_code = ?, updated_at = ? WHERE delivery_key = ?",
  ).bind(sent.retryAt, sent.errorCode, now.toISOString(), deliveryKey).run()
  return sent.kind === 'deferred' ? 'deferred' : 'failed'
}

async function sendTelegram(
  env: SystemHealthObserverEnv,
  fetcher: typeof fetch,
  sleep: (durationMs: number) => Promise<void>,
  message: string,
  now: Date,
): Promise<{ kind: 'sent'; retryAt: null; errorCode: null } | { kind: 'deferred' | 'failed'; retryAt: string; errorCode: string }> {
  const token = env.TELEGRAM_BOT_TOKEN ?? ''
  const chatId = env.TELEGRAM_CHAT_ID ?? ''
  if (!/^[0-9]{5,15}:[A-Za-z0-9_-]{20,100}$/u.test(token) || !/^-?[0-9]{5,20}$/u.test(chatId)) {
    return { kind: 'failed', retryAt: new Date(now.getTime() + 15 * 60_000).toISOString(), errorCode: 'TELEGRAM_NOT_CONFIGURED' }
  }
  const endpoint = `https://api.telegram.org/bot${token}/sendMessage`
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await boundedFetch(fetcher, endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: message, disable_web_page_preview: true }),
      })
      const payload = await readJsonBounded(response, 4 * 1024).catch(() => null)
      if (response.ok && asRecord(payload)?.ok === true) return { kind: 'sent', retryAt: null, errorCode: null }
      if (response.status === 429) {
        const retryAfter = readRetryAfter(payload) ?? 60
        return { kind: 'deferred', retryAt: new Date(now.getTime() + retryAfter * 1000).toISOString(), errorCode: 'TELEGRAM_RATE_LIMITED' }
      }
      if (response.status < 500 || attempt === 2) {
        return { kind: 'failed', retryAt: new Date(now.getTime() + 60_000).toISOString(), errorCode: 'TELEGRAM_DELIVERY_FAILED' }
      }
    } catch {
      if (attempt === 2) return { kind: 'failed', retryAt: new Date(now.getTime() + 60_000).toISOString(), errorCode: 'TELEGRAM_TIMEOUT_OR_NETWORK' }
    }
    await sleep(250 * (attempt + 1))
  }
  return { kind: 'failed', retryAt: new Date(now.getTime() + 60_000).toISOString(), errorCode: 'TELEGRAM_DELIVERY_FAILED' }
}

function buildTelegramMessage(
  incident: { incident_id: string; component: IncidentComponent; severity: 'yellow' | 'red'; reason_code: string; opened_at: string },
  kind: 'open' | 'reminder' | 'resolved',
  now: Date,
) {
  const title = kind === 'resolved' ? 'Đã phục hồi' : kind === 'reminder' ? 'Sự cố vẫn đang mở' : 'Phát hiện sự cố hệ thống'
  const reasonCode = SAFE_REASON.test(incident.reason_code) ? incident.reason_code : 'UNKNOWN'
  return [
    `[NestScout] ${title}`,
    `Thành phần: ${componentLabel(incident.component)}`,
    `Mức độ: ${kind === 'resolved' ? 'đã phục hồi' : incident.severity === 'red' ? 'đỏ' : 'vàng'}`,
    `Mã sự cố: ${incident.incident_id}`,
    `Mã kiểm tra: ${reasonCode}`,
    `Thời điểm: ${formatVietnamTime(now)}`,
  ].join('\n')
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

async function readState(db: D1Database): Promise<ObserverState> {
  const state = await db.prepare(
    'SELECT current_outage_id, current_outage_reason, current_outage_opened_at, current_outage_synced, last_cleanup_at FROM monitor_state WHERE singleton_id = 1',
  ).first<ObserverState>()
  if (!state) throw new Error('D1_STATE_MISSING')
  return state
}

async function markOutageSynced(db: D1Database, incidentId: string, now: string) {
  await db.prepare('UPDATE monitor_state SET current_outage_synced = 1, updated_at = ? WHERE singleton_id = 1 AND current_outage_id = ?')
    .bind(now, incidentId).run()
}

async function setObserverState(db: D1Database, errorCode: string | null, snapshotAt: string | null, now: string) {
  await db.prepare('UPDATE monitor_state SET current_outage_reason = COALESCE(?, current_outage_reason), last_snapshot_at = COALESCE(?, last_snapshot_at), updated_at = ? WHERE singleton_id = 1')
    .bind(errorCode, snapshotAt, now).run()
}

async function cleanupExpired(db: D1Database, now: Date) {
  const cutoff = new Date(now.getTime() - INCIDENT_RETENTION_MS).toISOString()
  const statements = [
    db.prepare("DELETE FROM monitor_incidents WHERE status = 'resolved' AND resolved_at < ?").bind(cutoff),
    db.prepare("DELETE FROM monitor_deliveries WHERE status = 'sent' AND updated_at < ?").bind(cutoff),
    db.prepare('UPDATE monitor_state SET last_cleanup_at = ?, updated_at = ? WHERE singleton_id = 1').bind(now.toISOString(), now.toISOString()),
  ]
  const results = await Promise.all(statements.map((statement) => statement.run()))
  if (results.some((result) => !result.success)) throw new Error('D1_CLEANUP_FAILED')
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
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co') || url.pathname !== '/' || url.username || url.password || url.search || url.hash) return null
    if (secret.length < 32 || /\s/u.test(secret)) return null
    if (!['production', 'staging', 'local'].includes(environment) || !/^[a-z0-9]{8,40}$/u.test(projectRef)) return null
    return { supabaseUrl: url.origin, observerSecret: secret, environment, projectRef }
  } catch {
    return null
  }
}

type ObserverConfig = { supabaseUrl: string; observerSecret: string; environment: string; projectRef: string }

function observerUrl(base: string, path: string) {
  return new URL(`/functions/v1/system-monitor/observer${path}`, `${base.replace(/\/+$/u, '')}/`).toString()
}

function validateSnapshot(snapshot: Snapshot | null, config: ObserverConfig, nowMs: number): string | null {
  if (!snapshot) return 'SNAPSHOT_INVALID'
  if (snapshot.environment !== config.environment || snapshot.project_ref !== config.projectRef) return 'SNAPSHOT_IDENTITY_MISMATCH'
  const scheduled = Date.parse(snapshot.scheduled_at)
  const completed = Date.parse(snapshot.completed_at)
  const expires = Date.parse(snapshot.expires_at)
  if (!Number.isFinite(scheduled) || !Number.isFinite(completed) || !Number.isFinite(expires) ||
      scheduled > completed || completed > nowMs || expires <= completed || expires - completed > 180_000 ||
      expires < nowMs || nowMs - completed > 180_000) return 'SNAPSHOT_STALE'
  for (const check of snapshot.checks) {
    const observed = check.observed_at === null ? null : Date.parse(check.observed_at)
    if (observed !== null && (!Number.isFinite(observed) || observed > nowMs)) return 'SNAPSHOT_INVALID'
    if (check.status !== 'gray' && (observed === null || nowMs - observed > 180_000)) return 'SNAPSHOT_STALE'
  }
  return null
}

function parseSnapshot(value: unknown): Snapshot | null {
  const row = asRecord(value)
  if (!row || row.schema_version !== 1 || !isStatus(row.overall_status) ||
      !['production', 'staging', 'local'].includes(String(row.environment)) ||
      !(row.project_ref === null || /^[a-z0-9]{8,40}$/u.test(String(row.project_ref))) ||
      !isDateString(row.scheduled_at) || !isDateString(row.completed_at) || !isDateString(row.expires_at) ||
      !Array.isArray(row.checks) || row.checks.length > 32) return null
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
    schema_version: 1,
    environment: row.environment as string,
    project_ref: row.project_ref as string | null,
    scheduled_at: row.scheduled_at,
    completed_at: row.completed_at,
    expires_at: row.expires_at,
    overall_status: row.overall_status,
    checks,
  }
  if (evaluateSnapshotStatus(checks) !== row.overall_status) return null
  return snapshot
}

function evaluateSnapshotStatus(checks: readonly SnapshotCheck[]): HealthStatus {
  if (checks.length === 0) return 'gray'
  if (checks.some((check) => check.status === 'red')) return 'red'
  if (checks.some((check) => check.status === 'yellow')) return 'yellow'
  if (checks.some((check) => check.status === 'gray')) return 'gray'
  return 'green'
}

function sentryCoverageFingerprint(environment: string) {
  return `${environment}:app:app-sentry-coverage`.slice(0, 180)
}

function isDateString(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) && Number.isFinite(Date.parse(value))
}

async function boundedFetch(fetcher: typeof fetch, rawUrl: string, init: RequestInit) {
  const url = new URL(rawUrl)
  if (url.protocol !== 'https:' || (!url.hostname.endsWith('.supabase.co') && url.hostname !== 'api.telegram.org')) {
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

function readRetryAfter(payload: unknown) {
  const retryAfter = asRecord(asRecord(payload)?.parameters)?.retry_after
  return typeof retryAfter === 'number' && Number.isInteger(retryAfter) ? Math.max(1, Math.min(3600, retryAfter)) : null
}

function componentLabel(component: IncidentComponent) {
  return component === 'backend' ? 'Backend' : component === 'kael' ? 'Kael Agentic' : component === 'app' ? 'Ứng dụng' : 'Vận hành'
}

function formatVietnamTime(date: Date) {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).format(date)
}
