import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { waitForFreshSystemHealthSnapshot } from './wait-for-snapshot.mjs'
import { verifyCloudflareRuntimeEvidence } from './verify-cloudflare-runtime.mjs'

const PROJECT = 'iwevizmsedyqozxlawwl'
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PROFILE_CHECKS = ['backend-core', 'backend-storage-realtime-io', 'backend-scheduled-workers',
  'kael-agentic', 'app-native-connectivity', 'observer-dispatcher']
const PROBE_ROLES = Object.freeze({ owner: 'admin', operator: 'admin_operator', customer: 'customer', worker: 'worker' })
const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu
const PATHS = new Set([
  '/functions/v1/mobile-api/harness/health',
  '/functions/v1/mobile-api/admin/system/health?schema_version=2',
  '/functions/v1/mobile-api/admin/system/incidents?limit=1',
  '/functions/v1/system-monitor/observer/latest?schema_version=2',
])

export async function probeBackendRelease(input) {
  const release = input?.release
  const roles = Object.keys(PROBE_ROLES)
  const tokens = roles.map((role) => input?.tokens?.[role])
  if (release?.environment !== 'production' || !/^[0-9a-f]{40}$/u.test(release.gitSha ?? '') ||
      !/^harness-[0-9a-f]{12}-[0-9a-f]{12}$/u.test(release.releaseId ?? '') ||
      input.supabaseUrl !== `https://${PROJECT}.supabase.co` ||
      typeof input.anonKey !== 'string' || input.anonKey.length < 20 ||
      typeof input.observerSecret !== 'string' || input.observerSecret.length < 32 ||
      tokens.some((token) => !token || typeof token.accessToken !== 'string' || token.accessToken.length < 32 ||
        token.accessToken.length > 8192 || typeof token.userId !== 'string' || !UUID_PATTERN.test(token.userId)) ||
      new Set(tokens.map((token) => token.accessToken)).size !== roles.length ||
      new Set(tokens.map((token) => token.userId.toLowerCase())).size !== roles.length) {
    throw new Error('BACKEND_PROBE_CONFIGURATION_INVALID')
  }
  const fetcher = input.fetcher ?? fetch
  const now = input.now ?? (() => Date.now())
  const timeoutMs = input.requestTimeoutMs ?? 5000
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5000) throw new Error('BACKEND_PROBE_CONFIGURATION_INVALID')
  async function get(path, headers = {}, expected = 200) {
    const url = new URL(path, input.supabaseUrl)
    const queryKeys = [...url.searchParams.keys()].sort()
    const ownProfileRoute = url.pathname === '/rest/v1/profiles' && queryKeys.length === 2 &&
      queryKeys[0] === 'id' && queryKeys[1] === 'select' && url.searchParams.getAll('id').length === 1 &&
      url.searchParams.getAll('select').length === 1 && /^eq\.[0-9a-f-]{36}$/iu.test(url.searchParams.get('id') ?? '') &&
      UUID_PATTERN.test((url.searchParams.get('id') ?? '').slice(3)) && url.searchParams.get('select') === 'id,role'
    if (url.origin !== input.supabaseUrl || (!PATHS.has(url.pathname + url.search) && !ownProfileRoute)) {
      throw new Error('BACKEND_PROBE_ROUTE_FORBIDDEN')
    }
    const controller = new AbortController()
    let timer
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('BACKEND_PROBE_TIMEOUT')) }, timeoutMs)
    })
    try {
      return await Promise.race([deadline, (async () => {
        const response = await fetcher(url, { method: 'GET', headers, redirect: 'error', signal: controller.signal })
        if (response.redirected || response.status >= 300 && response.status < 400) throw new Error('BACKEND_PROBE_REDIRECT_DENIED')
        if (Array.isArray(expected) ? !expected.includes(response.status) : response.status !== expected) {
          throw new Error('BACKEND_PROBE_HTTP_STATUS_INVALID')
        }
        if (expected !== 200) { await response.body?.cancel(); return null }
        if (!response.body) throw new Error('BACKEND_PROBE_BODY_INVALID')
        const reader = response.body.getReader()
        const cancelReader = () => { void reader.cancel().catch(() => {}) }
        controller.signal.addEventListener('abort', cancelReader, { once: true })
        const chunks = []
        let size = 0
        try {
          while (true) {
            const chunk = await reader.read()
            if (chunk.done) break
            size += chunk.value.byteLength
            if (size > 16384) throw new Error('BACKEND_PROBE_BODY_TOO_LARGE')
            chunks.push(chunk.value)
          }
          try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) }
          catch { throw new Error('BACKEND_PROBE_BODY_INVALID') }
        } finally {
          controller.signal.removeEventListener('abort', cancelReader)
          cancelReader()
        }
      })()])
    } catch (error) {
      if (error instanceof Error && /^BACKEND_PROBE_[A-Z_]+$/u.test(error.message)) throw error
      throw new Error('BACKEND_PROBE_TRANSPORT_FAILED')
    } finally { clearTimeout(timer); controller.abort() }
  }
  const health = await get('/functions/v1/mobile-api/harness/health')
  if (health?.status !== 'ok' || health.environment?.name !== 'production' ||
      health.environment?.project_ref !== PROJECT || health.release?.git_sha !== release.gitSha ||
      health.release?.release_id !== release.releaseId || health.release?.registered !== true ||
      health.release?.release_lane !== 'backend-system-health') throw new Error('BACKEND_PROBE_IDENTITY_MISMATCH')
  async function snapshotEvidence(payload) {
    const snapshot = payload?.snapshot
    if (!Array.isArray(snapshot?.required_check_ids) ||
        JSON.stringify([...snapshot.required_check_ids].sort()) !== JSON.stringify([...PROFILE_CHECKS].sort())) {
      throw new Error('BACKEND_PROBE_PROFILE_INCOMPLETE')
    }
    if (!Array.isArray(snapshot.checks) || snapshot.schema_version !== 2 || snapshot.profile_id !== 'cloudflare-admin-v1') {
      throw new Error('BACKEND_PROBE_PROFILE_INCOMPLETE')
    }
    if (snapshot.checks.length !== PROFILE_CHECKS.length ||
        snapshot.checks.some((check) => !check || !PROFILE_CHECKS.includes(check.check_id) ||
          !['green', 'yellow', 'red', 'gray'].includes(check.status)) ||
        new Set(snapshot.checks.map((check) => check.check_id)).size !== PROFILE_CHECKS.length) {
      throw new Error('BACKEND_PROBE_PROFILE_INCOMPLETE')
    }
    for (const id of ['backend-core', 'observer-dispatcher']) {
      if (snapshot.checks?.find((check) => check.check_id === id)?.status !== 'green') {
        throw new Error('BACKEND_PROBE_OPERATIONAL_CHECK_FAILED')
      }
    }
    if (snapshot.checks.some((check) => check.check_id !== 'app-native-connectivity' &&
        ['red', 'yellow'].includes(check.status))) throw new Error('BACKEND_PROBE_OPERATIONAL_CHECK_FAILED')
    const evidence = await waitForFreshSystemHealthSnapshot({
      supabaseUrl: input.supabaseUrl, observerSecret: input.observerSecret,
      environment: 'production', projectRef: PROJECT, profileId: 'cloudflare-admin-v1',
      now, timeoutMs: 1000, sleep: async () => {}, fetcher: async () => Response.json(payload),
    })
    if (evidence.releaseId !== release.releaseId) throw new Error('BACKEND_PROBE_SNAPSHOT_IDENTITY_MISMATCH')
    return Object.freeze({
      ...evidence,
      checkStatuses: Object.fromEntries(snapshot.checks.map((check) => [check.check_id, check.status])),
    })
  }
  const observer = await snapshotEvidence(await get('/functions/v1/system-monitor/observer/latest?schema_version=2', {
    'x-system-monitor-observer-secret': input.observerSecret,
  }))
  const profileRolesVerified = {}
  for (const [role, expectedProfileRole] of Object.entries(PROBE_ROLES)) {
    const identity = input.tokens[role]
    const profileUrl = new URL('/rest/v1/profiles', input.supabaseUrl)
    profileUrl.searchParams.set('id', `eq.${identity.userId}`)
    profileUrl.searchParams.set('select', 'id,role')
    const rows = await get(`${profileUrl.pathname}${profileUrl.search}`, {
      apikey: input.anonKey, authorization: `Bearer ${identity.accessToken}`,
    })
    if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.id !== identity.userId ||
        rows[0]?.role !== expectedProfileRole) {
      throw new Error(`BACKEND_PROBE_ROLE_MISMATCH_${role.toUpperCase()}`)
    }
    profileRolesVerified[role] = rows[0].role
  }
  for (const role of ['owner', 'operator']) {
    const headers = { authorization: `Bearer ${input.tokens[role].accessToken}` }
    const adminHealth = await snapshotEvidence(await get('/functions/v1/mobile-api/admin/system/health?schema_version=2', headers))
    if (adminHealth.completedAt !== observer.completedAt ||
        JSON.stringify(adminHealth.checkStatuses) !== JSON.stringify(observer.checkStatuses)) {
      throw new Error('BACKEND_PROBE_ADMIN_SNAPSHOT_MISMATCH')
    }
    const incidents = await get('/functions/v1/mobile-api/admin/system/incidents?limit=1', headers)
    if (incidents?.data_quality !== 'available' || !Array.isArray(incidents.records) ||
        incidents.records.length > 1 || typeof incidents.has_more !== 'boolean') throw new Error('BACKEND_PROBE_INCIDENTS_INVALID')
  }
  for (const role of ['anonymous', 'customer', 'worker']) {
    for (const path of ['/functions/v1/mobile-api/admin/system/health?schema_version=2', '/functions/v1/mobile-api/admin/system/incidents?limit=1']) {
      await get(path, role === 'anonymous' ? {} : { authorization: `Bearer ${input.tokens[role].accessToken}` }, role === 'anonymous' ? [401, 403] : [403])
    }
  }
  const cloudflare = verifyCloudflareRuntimeEvidence({ ...input.cloudflare, release, nowMs: now() })
  const receipt = {
    schemaVersion: 'backend-release-probe.v2', environment: 'production', projectRef: PROJECT,
    releaseId: release.releaseId, gitSha: release.gitSha, completedAt: new Date(now()).toISOString(),
    snapshotCompletedAt: observer.completedAt, overallStatus: observer.overallStatus,
    checkStatuses: observer.checkStatuses,
    profileRolesVerified,
    cloudflareVerified: cloudflare.status === 'verified', backendVerified: true, inferenceRequests: 0,
    method: 'GET', requestCount: 16,
  }
  return Object.freeze({ ...receipt, receiptSha256: createHash('sha256').update(JSON.stringify(receipt)).digest('hex') })
}

export function verifyBackendReleaseProbeReceipt(receipt, release, nowMs = Date.now()) {
  const fields = ['schemaVersion', 'environment', 'projectRef', 'releaseId', 'gitSha', 'completedAt',
    'snapshotCompletedAt', 'overallStatus', 'checkStatuses', 'profileRolesVerified',
    'cloudflareVerified', 'backendVerified', 'inferenceRequests', 'method', 'requestCount', 'receiptSha256']
  const problems = []
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt) ||
      Object.keys(receipt).sort().join('|') !== [...fields].sort().join('|')) return ['BACKEND_PROBE_RECEIPT_FIELDS_INVALID']
  if (receipt.schemaVersion !== 'backend-release-probe.v2' || receipt.environment !== 'production' ||
      receipt.projectRef !== PROJECT || receipt.releaseId !== release?.releaseId || receipt.gitSha !== release?.gitSha ||
      release?.environment !== 'production' || !/^harness-[0-9a-f]{12}-[0-9a-f]{12}$/u.test(receipt.releaseId ?? '') ||
      !/^[0-9a-f]{40}$/u.test(receipt.gitSha ?? '')) problems.push('BACKEND_PROBE_RECEIPT_IDENTITY_INVALID')
  const completed = Date.parse(receipt.completedAt)
  const snapshot = Date.parse(receipt.snapshotCompletedAt)
  if (!Number.isFinite(nowMs) || !Number.isFinite(completed) || !Number.isFinite(snapshot) ||
      snapshot > completed || completed > nowMs || nowMs - completed >= 180000 || nowMs - snapshot >= 180000) {
    problems.push('BACKEND_PROBE_RECEIPT_STALE')
  }
  if (receipt.inferenceRequests !== 0 || receipt.method !== 'GET' || receipt.requestCount !== 16 ||
      receipt.cloudflareVerified !== true || receipt.backendVerified !== true || !['green', 'yellow', 'red', 'gray'].includes(receipt.overallStatus) ||
      !receipt.profileRolesVerified || typeof receipt.profileRolesVerified !== 'object' ||
      Array.isArray(receipt.profileRolesVerified) ||
      Object.keys(receipt.profileRolesVerified).sort().join('|') !== Object.keys(PROBE_ROLES).sort().join('|') ||
      Object.entries(PROBE_ROLES).some(([role, expected]) => receipt.profileRolesVerified[role] !== expected) ||
      !receipt.checkStatuses || typeof receipt.checkStatuses !== 'object' || Array.isArray(receipt.checkStatuses) ||
      Object.keys(receipt.checkStatuses).sort().join('|') !== [...PROFILE_CHECKS].sort().join('|') ||
      receipt.checkStatuses['backend-core'] !== 'green' || receipt.checkStatuses['observer-dispatcher'] !== 'green' ||
      Object.entries(receipt.checkStatuses).some(([id, status]) => id !== 'app-native-connectivity' &&
        id !== 'backend-core' && id !== 'observer-dispatcher' && ['red', 'yellow'].includes(status)) ||
      Object.values(receipt.checkStatuses).some((status) => !['green', 'yellow', 'red', 'gray'].includes(status)) ) {
    problems.push('BACKEND_PROBE_RECEIPT_CHECKS_INVALID')
  }
  const statuses = Object.values(receipt.checkStatuses ?? {})
  const expectedOverall = statuses.includes('red') ? 'red'
    : statuses.includes('yellow') ? 'yellow'
      : statuses.includes('gray') ? 'gray' : 'green'
  if (receipt.overallStatus !== expectedOverall) problems.push('BACKEND_PROBE_RECEIPT_STATUS_INVALID')
  const { receiptSha256, ...payload } = receipt
  if (!/^[0-9a-f]{64}$/u.test(receiptSha256 ?? '') ||
      createHash('sha256').update(JSON.stringify(payload)).digest('hex') !== receiptSha256) {
    problems.push('BACKEND_PROBE_RECEIPT_CHECKSUM_INVALID')
  }
  return problems
}

export async function authenticateBackendProbeRole(input) {
  const role = input?.role
  const supabaseUrl = input?.supabaseUrl
  const anonKey = input?.anonKey
  const email = input?.email
  const password = input?.password
  const fetcher = input?.fetcher ?? fetch
  if (!['owner', 'operator', 'customer', 'worker'].includes(role) ||
      supabaseUrl !== `https://${PROJECT}.supabase.co` ||
      typeof anonKey !== 'string' || anonKey.length < 20 ||
      typeof email !== 'string' || email.length < 3 || email.length > 320 ||
      typeof password !== 'string' || password.length < 8 || password.length > 1024) {
    throw new Error('BACKEND_PROBE_AUTH_CONFIGURATION_INVALID')
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    let response
    try {
      response = await fetcher(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: anonKey, 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
        redirect: 'error',
        signal: controller.signal,
      })
    } catch {
      throw new Error(`BACKEND_PROBE_AUTH_TRANSPORT_FAILED_${role.toUpperCase()}`)
    }
    if (response.redirected || response.status !== 200 || !response.body) {
      await response.body?.cancel().catch(() => {})
      throw new Error(`BACKEND_PROBE_AUTH_DENIED_${role.toUpperCase()}`)
    }
    const text = await readBoundedResponse(response, 32768, `BACKEND_PROBE_AUTH_RESPONSE_INVALID_${role.toUpperCase()}`)
    let payload
    try {
      payload = JSON.parse(text)
    } catch {
      throw new Error(`BACKEND_PROBE_AUTH_RESPONSE_INVALID_${role.toUpperCase()}`)
    }
    if (typeof payload?.access_token !== 'string' || payload.access_token.length < 32 ||
        payload.access_token.length > 8192 || typeof payload?.token_type !== 'string' ||
        payload.token_type.toLowerCase() !== 'bearer' || !Number.isSafeInteger(payload?.expires_in) ||
        payload.expires_in < 1 || payload.expires_in > 86400 || typeof payload?.user?.id !== 'string' ||
        !UUID_PATTERN.test(payload.user.id)) {
      throw new Error(`BACKEND_PROBE_AUTH_RESPONSE_INVALID_${role.toUpperCase()}`)
    }
    return { accessToken: payload.access_token, userId: payload.user.id }
  } finally {
    clearTimeout(timeout)
    controller.abort()
  }
}

export async function runBackendReleaseProbe(input) {
  const credentials = input?.credentials
  if (!credentials || typeof credentials !== 'object' || Array.isArray(credentials)) {
    throw new Error('BACKEND_PROBE_CONFIGURATION_INVALID')
  }
  const tokens = Object.fromEntries(await Promise.all(Object.keys(PROBE_ROLES).map(async (role) => {
    const identity = await authenticateBackendProbeRole({
      role,
      supabaseUrl: input.supabaseUrl,
      anonKey: input.anonKey,
      ...credentials[role],
      fetcher: input.authFetcher ?? input.fetcher,
    })
    return [role, identity]
  })))
  return probeBackendRelease({
    release: input.release,
    supabaseUrl: input.supabaseUrl,
    anonKey: input.anonKey,
    observerSecret: input.observerSecret,
    tokens,
    cloudflare: input.cloudflare,
    now: input.now,
    fetcher: input.fetcher,
  })
}

async function readBoundedResponse(response, maximumBytes, errorCode) {
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      total += chunk.value.byteLength
      if (total > maximumBytes) throw new Error(errorCode)
      chunks.push(chunk.value)
    }
    return Buffer.concat(chunks).toString('utf8')
  } catch (error) {
    await reader.cancel().catch(() => {})
    if (error instanceof Error && error.message === errorCode) throw error
    throw new Error(errorCode)
  }
}

function parseCli(args) {
  const result = {}
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index]
    const value = args[index + 1]
    if (!['--release', '--cloudflare-versions', '--cloudflare-deployments', '--cloudflare-d1-evidence', '--output'].includes(key) ||
        !value || value.startsWith('--')) throw new Error('BACKEND_PROBE_ARGUMENTS_INVALID')
    result[key.slice(2)] = value
    index += 1
  }
  if (Object.keys(result).length !== 5) throw new Error('BACKEND_PROBE_ARGUMENTS_INVALID')
  return result
}

function readJson(path) {
  const target = resolve(ROOT, path)
  const local = relative(ROOT, target)
  if (!local || local.startsWith('..') || resolve(target) !== target) {
    throw new Error('BACKEND_PROBE_PATH_INVALID')
  }
  try {
    return JSON.parse(readFileSync(target, 'utf8'))
  } catch {
    throw new Error('BACKEND_PROBE_INPUT_INVALID')
  }
}

async function main(args) {
  const options = parseCli(args)
  const supabaseUrl = `https://${PROJECT}.supabase.co`
  const receipt = await runBackendReleaseProbe({
    release: readJson(options.release),
    supabaseUrl,
    anonKey: process.env.PRODUCTION_SUPABASE_ANON_KEY,
    observerSecret: process.env.SYSTEM_HEALTH_OBSERVER_SECRET,
    credentials: {
      owner: { email: process.env.PRODUCTION_SYSTEM_HEALTH_OWNER_EMAIL, password: process.env.PRODUCTION_SYSTEM_HEALTH_OWNER_PASSWORD },
      operator: { email: process.env.PRODUCTION_SYSTEM_HEALTH_OPERATOR_EMAIL, password: process.env.PRODUCTION_SYSTEM_HEALTH_OPERATOR_PASSWORD },
      customer: { email: process.env.PRODUCTION_SYNTHETIC_CUSTOMER_EMAIL, password: process.env.PRODUCTION_SYNTHETIC_CUSTOMER_PASSWORD },
      worker: { email: process.env.PRODUCTION_SYNTHETIC_WORKER_EMAIL, password: process.env.PRODUCTION_SYNTHETIC_WORKER_PASSWORD },
    },
    cloudflare: {
      versions: readJson(options['cloudflare-versions']),
      deployments: readJson(options['cloudflare-deployments']),
      d1Evidence: readJson(options['cloudflare-d1-evidence']),
    },
  })
  const output = resolve(ROOT, options.output)
  const local = relative(ROOT, output)
  if (!local || local.startsWith('..')) throw new Error('BACKEND_PROBE_PATH_INVALID')
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
  process.stdout.write('Backend/Admin role probe completed; sanitized receipt written\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error && /^BACKEND_PROBE_[A-Z_]+$/u.test(error.message)
      ? error.message : 'BACKEND_PROBE_FAILED'}\n`)
    process.exitCode = 1
  })
}
