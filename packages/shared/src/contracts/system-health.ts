import { z } from 'zod'

export const systemHealthStatusSchema = z.enum(['green', 'yellow', 'red', 'gray'])
export type SystemHealthStatus = z.infer<typeof systemHealthStatusSchema>

const systemHealthMetricSchema = z.union([z.number().finite(), z.boolean(), z.null()])

export const systemHealthCheckSchema = z.object({
  check_id: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/),
  component: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,39}$/),
  status: systemHealthStatusSchema,
  reason_code: z.string().regex(/^[A-Z][A-Z0-9_]{0,63}$/),
  observed_at: z.iso.datetime({ offset: true }).nullable(),
  evidence_window: z.object({
    from: z.iso.datetime({ offset: true }),
    to: z.iso.datetime({ offset: true }),
  }).strict().nullable().optional(),
  sample_count: z.number().int().nonnegative().nullable(),
  metrics: z.record(z.string().regex(/^[a-z][a-z0-9_]{0,39}$/), systemHealthMetricSchema).refine((metrics) => Object.keys(metrics).length <= 32),
  incident_id: z.string().regex(/^[a-zA-Z0-9_-]{8,80}$/).nullable().optional(),
}).strict()

const systemHealthSnapshotFields = {
  schema_version: z.literal(1),
  environment: z.enum(['production', 'staging', 'local']),
  project_ref: z.string().regex(/^[a-z0-9]{8,40}$/).nullable(),
  release_id: z.string().regex(/^[A-Za-z0-9._+-]{1,100}$/).nullable(),
  scheduled_at: z.iso.datetime({ offset: true }),
  completed_at: z.iso.datetime({ offset: true }),
  expires_at: z.iso.datetime({ offset: true }),
  overall_status: systemHealthStatusSchema,
  checks: z.array(systemHealthCheckSchema).max(32),
}

const systemHealthSnapshotV1Schema = z.object(systemHealthSnapshotFields).strict()
export const systemHealthCoverageGapSchema = z.enum(['app-crash', 'push-notifications'])
const systemHealthSnapshotV2Schema = z.object({
  ...systemHealthSnapshotFields,
  schema_version: z.literal(2),
  profile_id: z.literal('cloudflare-admin-v1'),
  required_check_ids: z.array(z.string().regex(/^[a-z0-9][a-z0-9._-]{0,79}$/)).min(1).max(32),
  coverage_gaps: z.array(systemHealthCoverageGapSchema).max(16),
}).strict().superRefine((snapshot, context) => {
  if (new Set(snapshot.required_check_ids).size !== snapshot.required_check_ids.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['required_check_ids'], message: 'Required check IDs must be unique.' })
  }
  if (new Set(snapshot.coverage_gaps).size !== snapshot.coverage_gaps.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['coverage_gaps'], message: 'Coverage gap sources must be unique.' })
  }
})
export const systemHealthSnapshotSchema = z.discriminatedUnion('schema_version', [
  systemHealthSnapshotV1Schema,
  systemHealthSnapshotV2Schema,
])

export type SystemHealthCheck = z.infer<typeof systemHealthCheckSchema>
export type SystemHealthSnapshot = z.infer<typeof systemHealthSnapshotSchema>

export const mobileHealthObservationInputSchema = z.object({
  client_session_id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu),
  observed_at: z.iso.datetime({ offset: true }),
  api_status: z.enum(['green', 'yellow']),
  reason_code: z.enum(['API_REACHABLE', 'API_TIMEOUT', 'API_NETWORK_ERROR', 'API_HTTP_5XX', 'API_OFFLINE']),
  duration_ms: z.number().int().min(0).max(60_000).nullable(),
}).strict().superRefine((value, context) => {
  const isReachable = value.reason_code === 'API_REACHABLE'
  if ((value.api_status === 'green') !== isReachable) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['api_status'], message: 'API status must match its observed reason.' })
  }
})

export type MobileHealthObservationInput = z.infer<typeof mobileHealthObservationInputSchema>

export function evaluateSystemHealth(
  checks: readonly Pick<SystemHealthCheck, 'status' | 'check_id'>[],
  requiredCheckIds: readonly string[] = [],
): SystemHealthStatus {
  if (checks.length === 0) return 'gray'
  if (checks.some((check) => check.status === 'red')) return 'red'
  if (checks.some((check) => check.status === 'yellow')) return 'yellow'
  const observedIds = new Set(checks.map((check) => check.check_id))
  if (requiredCheckIds.some((checkId) => !observedIds.has(checkId))) return 'gray'
  if (checks.some((check) => check.status === 'gray')) return 'gray'
  return 'green'
}

export function isSystemEvidenceFresh(observedAt: string | null, nowMs: number, maxAgeMs = 180_000): boolean {
  if (observedAt === null || !Number.isFinite(nowMs) || !Number.isFinite(maxAgeMs) || maxAgeMs < 0) return false
  const observedMs = Date.parse(observedAt)
  if (!Number.isFinite(observedMs) || observedMs > nowMs) return false
  return nowMs - observedMs <= maxAgeMs
}

export type AvailabilityState = {
  status: SystemHealthStatus
  consecutive_failures: number
  consecutive_successes: number
}

export function advanceAvailability(
  previous: AvailabilityState,
  outcome: 'success' | 'failure' | 'unknown',
  threshold = 2,
): AvailabilityState {
  if (!Number.isInteger(threshold) || threshold < 1) return { status: 'gray', consecutive_failures: 0, consecutive_successes: 0 }
  if (outcome === 'unknown') return { status: 'gray', consecutive_failures: 0, consecutive_successes: 0 }
  if (outcome === 'failure') {
    const failures = Math.max(0, previous.consecutive_failures) + 1
    return { status: failures >= threshold ? 'red' : 'yellow', consecutive_failures: failures, consecutive_successes: 0 }
  }
  const successes = Math.max(0, previous.consecutive_successes) + 1
  const wasDegraded = previous.status === 'red' || previous.status === 'yellow' || previous.consecutive_failures > 0
  return {
    status: wasDegraded && successes < threshold ? previous.status : 'green',
    consecutive_failures: 0,
    consecutive_successes: successes,
  }
}

export function evaluateKaelErrorRate(input: {
  failureCount: number
  sampleCount: number
  previousRedEvaluations?: number
}): { status: SystemHealthStatus; errorRate: number | null; sampleCount: number; redEvaluations: number; reasonCode: string } {
  const { failureCount, sampleCount } = input
  const previousRedEvaluations = input.previousRedEvaluations ?? 0
  if (!Number.isInteger(sampleCount) || !Number.isInteger(failureCount) || sampleCount < 0 || failureCount < 0 || failureCount > sampleCount) {
    return { status: 'gray', errorRate: null, sampleCount: 0, redEvaluations: 0, reasonCode: 'INVALID_EVIDENCE' }
  }
  if (sampleCount < 20) return { status: 'gray', errorRate: null, sampleCount, redEvaluations: 0, reasonCode: 'INSUFFICIENT_SAMPLE' }
  const errorRate = failureCount / sampleCount
  if (errorRate >= 0.2) {
    const redEvaluations = Math.max(0, previousRedEvaluations) + 1
    return { status: redEvaluations >= 2 ? 'red' : 'yellow', errorRate, sampleCount, redEvaluations, reasonCode: 'ERROR_RATE_HIGH' }
  }
  if (errorRate >= 0.05) return { status: 'yellow', errorRate, sampleCount, redEvaluations: 0, reasonCode: 'ERROR_RATE_ELEVATED' }
  return { status: 'green', errorRate, sampleCount, redEvaluations: 0, reasonCode: 'ERROR_RATE_WITHIN_RANGE' }
}

export function systemHealthFingerprint(environment: string, component: string, detector: string, resourceScope: string): string {
  return [environment, component, detector, resourceScope]
    .map((part) => part.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '_').slice(0, 80) || 'unknown')
    .join(':')
}

export type SystemIncidentPacket = {
  schema_version: 1
  incident_id: string
  fingerprint: string
  component: string
  detector: string
  severity: 'yellow' | 'red'
  status: 'open' | 'resolved'
  opened_at: string
  updated_at: string
  resolved_at: string | null
  release_id: string | null
  build_id: string | null
  platform: 'ios' | 'android' | 'edge' | 'worker' | null
  route_kind: string | null
  stage: string | null
  trace_id: string | null
  run_id: string | null
  request_id: string | null
  support_code: string | null
  reason_code: string
  timeline: Array<{ event: 'opened' | 'updated' | 'resolved'; at: string; status: 'open' | 'resolved'; severity: 'yellow' | 'red'; reason_code: string }>
  observations: Array<{ observed_at: string | null; reason_code: string; metrics: Record<string, number | boolean | null> }>
  owner_area: 'backend' | 'kael' | 'mobile' | 'operations'
  suggested_checks: string[]
  root_cause_status: 'not_established'
  evidence_limit: string
}

const safeToken = (value: unknown, maxLength = 100): string | null => {
  if (typeof value !== 'string' || value.length > maxLength || !/^[A-Za-z0-9._:-]+$/.test(value)) return null
  return value
}

const isoOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string' || !z.iso.datetime({ offset: true }).safeParse(value).success) return null
  return value
}

const INCIDENT_METRIC_KEYS = new Set([
  'edge_status', 'edge_fails', 'edge_successes', 'auth_ok', 'db_ok', 'release_ok', 'project',
  'fails', 'successes', 'failed', 'late', 'missing', 'execution_failure_rate', 'samples', 'calls15m',
  'fallbacks', 'circuits', 'learning', 'learning_age_seconds', 'red_evaluations', 'storage_status', 'storage_fails',
  'storage_successes', 'realtime_status', 'realtime_fails', 'realtime_successes', 'sessions', 'api_failures', 'platforms', 'fatal',
  'fatal_count', 'error_count', 'http_status', 'd1_healthy', 'dispatcher_healthy',
])

function safeIncidentMetrics(value: unknown): Record<string, number | boolean | null> {
  const row = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  const safe: Record<string, number | boolean | null> = {}
  for (const [key, metric] of Object.entries(row)) {
    if (!INCIDENT_METRIC_KEYS.has(key)) continue
    if (metric === null || typeof metric === 'boolean' || typeof metric === 'number' && Number.isFinite(metric)) safe[key] = metric
  }
  return safe
}

function safeIncidentTimeline(value: unknown): SystemIncidentPacket['timeline'] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 20).flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
    const item = entry as Record<string, unknown>
    const event = item.event === 'opened' || item.event === 'updated' || item.event === 'resolved' ? item.event : null
    const status = item.status === 'open' || item.status === 'resolved' ? item.status : null
    const severity = item.severity === 'red' || item.severity === 'yellow' ? item.severity : null
    const at = isoOrNull(item.at)
    const reasonCode = typeof item.reason_code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(item.reason_code) ? item.reason_code : null
    return event && status && severity && at && reasonCode ? [{ event, status, severity, at, reason_code: reasonCode }] : []
  })
}

function incidentRunbook(component: string): Pick<SystemIncidentPacket, 'owner_area' | 'suggested_checks'> {
  if (component === 'backend') return { owner_area: 'backend', suggested_checks: ['Check the mobile-api and Edge release identity.', 'Compare the detector evidence window with its worker completion heartbeat.'] }
  if (component === 'kael') return { owner_area: 'kael', suggested_checks: ['Inspect aggregate harness outcomes, provider circuit state, fallback and learning eligibility.', 'Separate provider failures from valid policy or permission blocks.'] }
  if (component === 'app') return { owner_area: 'mobile', suggested_checks: ['Verify native release/build attribution and the active-session heartbeat.', 'Compare native API observations with the matching backend evidence window.'] }
  return { owner_area: 'operations', suggested_checks: ['Check Cloudflare Worker heartbeat and D1 dispatcher state.', 'Compare observer outage records with the Supabase incident external ID.'] }
}

export function sanitizeSystemIncidentPacket(input: unknown): SystemIncidentPacket | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const value = input as Record<string, unknown>
  const incidentId = safeToken(value.incident_id, 80)
  const fingerprint = safeToken(value.fingerprint, 180)
  const component = safeToken(value.component, 40)
  const detector = safeToken(value.detector, 60)
  const severity = value.severity === 'red' || value.severity === 'yellow' ? value.severity : null
  const status = value.status === 'open' || value.status === 'resolved' ? value.status : null
  const openedAt = isoOrNull(value.opened_at)
  const updatedAt = isoOrNull(value.updated_at)
  const reasonCode = typeof value.reason_code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(value.reason_code) ? value.reason_code : null
  if (!incidentId || !fingerprint || !component || !detector || !severity || !status || !openedAt || !updatedAt || !reasonCode) return null
  const platform = ['ios', 'android', 'edge', 'worker'].includes(String(value.platform)) ? value.platform as SystemIncidentPacket['platform'] : null
  const packet: SystemIncidentPacket = {
    schema_version: 1,
    incident_id: incidentId,
    fingerprint,
    component,
    detector,
    severity,
    status,
    opened_at: openedAt,
    updated_at: updatedAt,
    resolved_at: isoOrNull(value.resolved_at),
    release_id: safeToken(value.release_id),
    build_id: safeToken(value.build_id),
    platform,
    route_kind: safeToken(value.route_kind, 80),
    stage: safeToken(value.stage, 80),
    trace_id: safeToken(value.trace_id),
    run_id: safeToken(value.run_id),
    request_id: safeToken(value.request_id),
    support_code: safeToken(value.support_code, 40),
    reason_code: reasonCode,
    timeline: safeIncidentTimeline(value.timeline),
    observations: Array.isArray(value.observations) ? value.observations.slice(0, 12).flatMap((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
      const observation = entry as Record<string, unknown>
      const safeReasonCode = typeof observation.reason_code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(observation.reason_code) ? observation.reason_code : null
      if (!safeReasonCode) return []
      return [{ observed_at: isoOrNull(observation.observed_at), reason_code: safeReasonCode, metrics: safeIncidentMetrics(observation.metrics) }]
    }) : [],
    ...incidentRunbook(component),
    root_cause_status: 'not_established',
    evidence_limit: 'Allowlisted operational aggregates only; no customer content, secret values, or proven root cause are included.',
  }
  return new TextEncoder().encode(JSON.stringify(packet)).byteLength <= 64 * 1024 ? packet : null
}

export function serializeSystemHealthSnapshot(input: unknown): string | null {
  const parsed = systemHealthSnapshotSchema.safeParse(input)
  if (!parsed.success) return null
  const serialized = JSON.stringify(parsed.data)
  return new TextEncoder().encode(serialized).byteLength <= 2 * 1024 ? serialized : null
}
