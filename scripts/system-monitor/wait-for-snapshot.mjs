import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const MAX_RESPONSE_BYTES = 16 * 1024
const MAX_SNAPSHOT_AGE_MS = 180_000
const SAFE_REASON = /^[A-Z][A-Z0-9_]{0,63}$/u

export async function waitForFreshSystemHealthSnapshot(input) {
  const config = validateConfig(input)
  const fetcher = input.fetcher ?? fetch
  const now = input.now ?? (() => Date.now())
  const sleep = input.sleep ?? ((duration) => new Promise((resolve) => setTimeout(resolve, duration)))
  const startedAt = now()
  const timeoutMs = Math.min(Math.max(input.timeoutMs ?? 300_000, 1_000), 900_000)
  const maximumAttempts = Math.ceil(timeoutMs / config.pollIntervalMs) + 1
  let lastReason = 'SNAPSHOT_NOT_AVAILABLE'
  let attempts = 0

  while (now() - startedAt <= timeoutMs && attempts < maximumAttempts) {
    attempts += 1
    try {
      const response = await fetcher(new URL('/functions/v1/system-monitor/observer/latest?schema_version=2', config.supabaseUrl), {
        method: 'GET',
        headers: { 'x-system-monitor-observer-secret': config.observerSecret },
        redirect: 'error',
        signal: AbortSignal.timeout(5_000),
      })
      if (response.status === 401 || response.status === 403) throw new Error('SYSTEM_HEALTH_SNAPSHOT_AUTH_FAILED')
      if (!response.ok) {
        lastReason = response.status === 429 ? 'SYSTEM_HEALTH_SNAPSHOT_RATE_LIMITED' : 'SYSTEM_HEALTH_SNAPSHOT_UNAVAILABLE'
      } else {
        const payload = await readBoundedJson(response)
        const evidence = validateSnapshot(payload?.snapshot, config, now())
        if (evidence && (!input.requireOperational || isOperationalSystemHealthSnapshot(payload.snapshot))) return evidence
        lastReason = evidence ? 'SYSTEM_HEALTH_SNAPSHOT_NOT_OPERATIONAL' : 'SYSTEM_HEALTH_SNAPSHOT_INVALID_OR_STALE'
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'SYSTEM_HEALTH_SNAPSHOT_AUTH_FAILED') throw error
      if (error instanceof Error && error.message.startsWith('SYSTEM_HEALTH_SNAPSHOT_RESPONSE_')) lastReason = error.message
      else lastReason = 'SYSTEM_HEALTH_SNAPSHOT_UNAVAILABLE'
    }

    if (now() - startedAt >= timeoutMs) break
    await sleep(Math.min(config.pollIntervalMs, timeoutMs - (now() - startedAt)))
  }
  throw new Error(lastReason)
}

export function isOperationalSystemHealthSnapshot(snapshot) {
  const ids = ['backend-core', 'backend-storage-realtime-io', 'backend-scheduled-workers',
    'kael-agentic', 'app-native-connectivity', 'observer-dispatcher']
  return Array.isArray(snapshot?.checks) && snapshot.checks.length === ids.length &&
    ids.every((id) => {
      const checks = snapshot.checks.filter((check) => check.check_id === id)
      if (checks.length !== 1) return false
      const check = checks[0]
      if (check.status === 'green') return true
      if (check.status !== 'gray') return false
      if (id === 'kael-agentic') return check.reason_code === 'NO_RECENT_AI_ACTIVITY' && check.sample_count === 0
      return id === 'app-native-connectivity' &&
        ['NO_ACTIVE_NATIVE_SESSIONS', 'NATIVE_SESSION_EVIDENCE_MISSING'].includes(check.reason_code)
    })
}

function validateConfig(input) {
  const rawUrl = input?.supabaseUrl?.trim() ?? ''
  const observerSecret = input?.observerSecret?.trim() ?? ''
  const environment = input?.environment ?? ''
  const projectRef = input?.projectRef ?? ''
  const profileId = input?.profileId ?? ''
  let url
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('SYSTEM_HEALTH_SNAPSHOT_TARGET_INVALID')
  }
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co') || url.pathname !== '/' ||
      url.username || url.password || url.search || url.hash || observerSecret.length < 32 ||
      environment !== 'production' || !/^[a-z0-9]{8,40}$/u.test(projectRef) || profileId !== 'cloudflare-admin-v1') {
    throw new Error('SYSTEM_HEALTH_SNAPSHOT_CONFIGURATION_INVALID')
  }
  const expectedUrl = `https://${projectRef}.supabase.co`
  if (url.origin !== expectedUrl) throw new Error('SYSTEM_HEALTH_SNAPSHOT_TARGET_MISMATCH')
  return {
    supabaseUrl: url.origin,
    observerSecret,
    environment,
    projectRef,
    profileId,
    pollIntervalMs: Math.min(Math.max(input.pollIntervalMs ?? 15_000, 1_000), 30_000),
  }
}

async function readBoundedJson(response) {
  const text = await response.text()
  if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) throw new Error('SYSTEM_HEALTH_SNAPSHOT_RESPONSE_TOO_LARGE')
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('SYSTEM_HEALTH_SNAPSHOT_RESPONSE_INVALID')
  }
}

function validateSnapshot(snapshot, config, nowMs) {
  if (!snapshot || snapshot.schema_version !== 2 || snapshot.profile_id !== config.profileId ||
      snapshot.environment !== config.environment || snapshot.project_ref !== config.projectRef ||
      !Array.isArray(snapshot.required_check_ids) || snapshot.required_check_ids.length === 0 || snapshot.required_check_ids.length > 32 ||
      !Array.isArray(snapshot.checks) || snapshot.checks.length > 32 || !Array.isArray(snapshot.coverage_gaps) ||
      snapshot.coverage_gaps.length !== 2 || !['green', 'yellow', 'red', 'gray'].includes(snapshot.overall_status)) return null
  if (snapshot.required_check_ids.some((id) => typeof id !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,79}$/u.test(id)) ||
      new Set(snapshot.required_check_ids).size !== snapshot.required_check_ids.length) return null
  if (new Set(snapshot.coverage_gaps).size !== 2 ||
      snapshot.coverage_gaps.some((gap) => !['app-crash', 'push-notifications'].includes(gap))) return null

  const scheduled = Date.parse(snapshot.scheduled_at)
  const completed = Date.parse(snapshot.completed_at)
  const expires = Date.parse(snapshot.expires_at)
  if (![scheduled, completed, expires].every(Number.isFinite) || scheduled > completed || completed > nowMs ||
      expires <= nowMs || expires - completed > MAX_SNAPSHOT_AGE_MS || nowMs - completed > MAX_SNAPSHOT_AGE_MS) return null

  const checkIds = new Set()
  for (const check of snapshot.checks) {
    if (!check || typeof check.check_id !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,79}$/u.test(check.check_id) || checkIds.has(check.check_id) ||
        !['green', 'yellow', 'red', 'gray'].includes(check.status) || typeof check.reason_code !== 'string' ||
        !SAFE_REASON.test(check.reason_code)) return null
    checkIds.add(check.check_id)
    const observedAt = check.observed_at === null ? null : Date.parse(check.observed_at)
    if (observedAt !== null && (!Number.isFinite(observedAt) || observedAt > nowMs)) return null
    if (check.status !== 'gray' && observedAt === null) return null
    if (['green', 'yellow'].includes(check.status) && nowMs - observedAt > MAX_SNAPSHOT_AGE_MS) return null
  }
  if (snapshot.required_check_ids.some((checkId) => !checkIds.has(checkId))) return null
  const expectedStatus = snapshot.checks.some((check) => check.status === 'red')
    ? 'red'
    : snapshot.checks.some((check) => check.status === 'yellow')
      ? 'yellow'
      : snapshot.checks.length === 0 || snapshot.checks.some((check) => check.status === 'gray') ? 'gray' : 'green'
  if (snapshot.overall_status !== expectedStatus) return null

  return Object.freeze({
    profileId: config.profileId,
    environment: config.environment,
    projectRef: config.projectRef,
    releaseId: typeof snapshot.release_id === 'string' ? snapshot.release_id : null,
    completedAt: new Date(completed).toISOString(),
    expiresAt: new Date(expires).toISOString(),
    overallStatus: snapshot.overall_status,
    requiredCheckCount: snapshot.required_check_ids.length,
    checkCount: checkIds.size,
    coverageGaps: snapshot.coverage_gaps,
  })
}

async function main() {
  const evidence = await waitForFreshSystemHealthSnapshot({
    supabaseUrl: process.env.PRODUCTION_PROJECT_URL,
    observerSecret: process.env.SYSTEM_HEALTH_OBSERVER_SECRET,
    environment: process.env.SYSTEM_HEALTH_ENVIRONMENT,
    projectRef: process.env.SYSTEM_HEALTH_EXPECTED_PROJECT_REF,
    profileId: process.env.SYSTEM_HEALTH_PROFILE_ID,
    requireOperational: process.env.SYSTEM_HEALTH_REQUIRE_OPERATIONAL === 'true',
  })
  const output = process.env.SYSTEM_HEALTH_SNAPSHOT_EVIDENCE_PATH
  if (output) writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' })
  process.stdout.write(`fresh Cloudflare profile snapshot confirmed (${evidence.overallStatus})\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'SYSTEM_HEALTH_SNAPSHOT_VERIFICATION_FAILED'}\n`)
    process.exitCode = 1
  })
}
