import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { authenticateBackendProbeRole, probeBackendRelease, runBackendReleaseProbe,
  verifyBackendReleaseProbeReceipt } from './backend-release-probe.mjs'

const nowMs = Date.parse('2026-10-14T12:00:00Z')
const iso = (offset = 0) => new Date(nowMs + offset).toISOString()
function fixture() {
  const userIds = {
    owner: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    operator: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    customer: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    worker: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  }
  const profileRoles = new Map([
    [userIds.owner, 'admin'], [userIds.operator, 'admin_operator'],
    [userIds.customer, 'customer'], [userIds.worker, 'worker'],
  ])
  const release = {
    environment: 'production', gitSha: 'a'.repeat(40), releaseId: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb',
    systemHealthObserver: { profileId: 'cloudflare-admin-v1', workerName: 'observer', workerBundleSha256: 'b'.repeat(64),
      d1Database: { id: 'database' }, d1Migrations: [{ path: '0001.sql' }], d1MigrationsSha256: 'c'.repeat(64) },
  }
  const snapshot = {
    schema_version: 2, profile_id: 'cloudflare-admin-v1', environment: 'production',
    project_ref: 'iwevizmsedyqozxlawwl', release_id: release.releaseId,
    scheduled_at: iso(-1000), completed_at: iso(), expires_at: iso(180000),
    overall_status: 'gray', required_check_ids: ['backend-core', 'backend-storage-realtime-io',
      'backend-scheduled-workers', 'kael-agentic', 'app-native-connectivity', 'observer-dispatcher'],
    coverage_gaps: ['app-crash', 'push-notifications'],
    checks: ['backend-core', 'backend-storage-realtime-io', 'backend-scheduled-workers',
      'kael-agentic', 'app-native-connectivity', 'observer-dispatcher'].map((check_id) => ({ check_id,
        status: ['backend-core', 'observer-dispatcher'].includes(check_id) ? 'green' : 'gray',
        reason_code: 'OBSERVED', observed_at: ['backend-core', 'observer-dispatcher'].includes(check_id) ? iso() : null })),
  }
  const calls = []
  const input = {
    release, supabaseUrl: 'https://iwevizmsedyqozxlawwl.supabase.co', observerSecret: 's'.repeat(32),
    anonKey: 'a'.repeat(40),
    tokens: Object.fromEntries(Object.entries(userIds).map(([role, userId]) => [role, {
      accessToken: `${role}-${'t'.repeat(40)}`, userId,
    }])), now: () => nowMs,
    cloudflare: {
      deployments: [{ annotations: { 'workers/tag': release.releaseId }, versions: [{ version_id: 'v1', percentage: 100 }] }],
      d1Evidence: { migrations: ['0001.sql'], latestTick: { outcome: 'completed', scheduled_at: iso(-1000), completed_at: iso() },
        state: { last_snapshot_at: iso(), last_error_code: null } },
    },
    fetcher: async (url, options) => {
      calls.push({ url: String(url), options })
      if (url.pathname.endsWith('/harness/health')) return Response.json({ status: 'ok', environment: { name: 'production', project_ref: 'iwevizmsedyqozxlawwl' }, release: { git_sha: release.gitSha, release_id: release.releaseId, release_lane: 'backend-system-health', registered: true }, secret: 'sentinel@example.com' })
      if (url.pathname.endsWith('/observer/latest')) return Response.json({ snapshot })
      if (url.pathname === '/rest/v1/profiles') {
        const userId = url.searchParams.get('id')?.replace(/^eq\./u, '')
        const role = profileRoles.get(userId)
        return Response.json(role ? [{ id: userId, role }] : [])
      }
      const token = options.headers.authorization
      if (!token) return new Response('private error', { status: 401 })
      if (['Bearer customer', 'Bearer worker'].includes(token) || /Bearer (customer|worker)-/u.test(token ?? '')) {
        return new Response('private error', { status: 403 })
      }
      return Response.json(url.pathname.endsWith('/incidents') ? { data_quality: 'available', records: [], has_more: false } : { snapshot })
    },
  }
  return { input, calls, snapshot, profileRoles, userIds }
}

test('reads fresh Backend Admin observer evidence with GET allowlist and sanitized receipt', async () => {
  const { input, calls } = fixture()
  const receipt = await probeBackendRelease(input)
  assert.equal(calls.length, 16)
  for (const call of calls) {
    assert.equal(call.options.method, 'GET')
    assert.equal(call.options.redirect, 'error')
    assert.match(call.url, /^https:\/\/iwevizmsedyqozxlawwl\.supabase\.co\/(functions\/v1\/(mobile-api\/(harness\/health|admin\/system\/(health|incidents))|system-monitor\/observer\/latest)|rest\/v1\/profiles)(\?|$)/u)
  }
  const profileCalls = calls.filter((call) => new URL(call.url).pathname === '/rest/v1/profiles')
  assert.equal(profileCalls.length, 4)
  for (const call of profileCalls) {
    const url = new URL(call.url)
    const identity = Object.values(input.tokens).find((token) => `Bearer ${token.accessToken}` === call.options.headers.authorization)
    assert.ok(identity)
    assert.deepEqual([...url.searchParams.keys()].sort(), ['id', 'select'])
    assert.deepEqual(url.searchParams.getAll('id'), [`eq.${identity.userId}`])
    assert.deepEqual(url.searchParams.getAll('select'), ['id,role'])
    assert.equal(call.options.headers.apikey, input.anonKey)
  }
  assert.equal(receipt.inferenceRequests, 0)
  assert.equal(receipt.schemaVersion, 'backend-release-probe.v2')
  assert.deepEqual(receipt.profileRolesVerified, {
    owner: 'admin', operator: 'admin_operator', customer: 'customer', worker: 'worker',
  })
  assert.deepEqual(verifyBackendReleaseProbeReceipt(receipt, input.release, nowMs), [])
  assert.equal(receipt.overallStatus, 'gray')
  assert.doesNotMatch(JSON.stringify(receipt), /sentinel|Bearer|private error|ssssssss/u)
})

test('authenticates the four probe roles with bounded password grants and keeps tokens out of evidence', async () => {
  const { input, calls } = fixture()
  const credentials = Object.fromEntries(['owner', 'operator', 'customer', 'worker'].map((role) => [role, {
    email: `${role}@example.test`, password: `private-${role}-password`,
  }]))
  const authCalls = []
  const authFetcher = async (url, options) => {
    authCalls.push({ url: String(url), options })
    const role = JSON.parse(options.body).email.split('@')[0]
    const userId = { owner: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', operator: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', customer: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', worker: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }[role]
    return Response.json({ access_token: `${role}-${'t'.repeat(40)}`, token_type: 'bearer', expires_in: 3600,
      user: { id: userId, email: 'private@example.test' } })
  }
  const receipt = await runBackendReleaseProbe({
    ...input, anonKey: 'a'.repeat(40), credentials, authFetcher,
  })
  assert.equal(authCalls.length, 4)
  assert.equal(calls.length, 16)
  for (const call of authCalls) {
    assert.equal(call.options.method, 'POST')
    assert.equal(call.options.redirect, 'error')
    assert.equal(call.options.headers.apikey, 'a'.repeat(40))
    assert.match(call.url, /^https:\/\/iwevizmsedyqozxlawwl\.supabase\.co\/auth\/v1\/token\?grant_type=password$/u)
  }
  assert.equal(receipt.inferenceRequests, 0)
  assert.deepEqual(receipt.profileRolesVerified, {
    owner: 'admin', operator: 'admin_operator', customer: 'customer', worker: 'worker',
  })
  assert.doesNotMatch(JSON.stringify(receipt), /private-|Bearer|example\.test|aaaaaaaa-aaaa|bbbbbbbb-bbbb|cccccccc-cccc|dddddddd-dddd/u)
})

test('Auth password grant rejects private upstream errors without echoing them', async () => {
  await assert.rejects(authenticateBackendProbeRole({
    role: 'owner', supabaseUrl: 'https://iwevizmsedyqozxlawwl.supabase.co',
    anonKey: 'a'.repeat(40), email: 'owner@example.test', password: 'private-password',
    fetcher: async () => Response.json({ error_description: 'private-sentinel@example.test' }, { status: 400 }),
  }), (error) => {
    assert.equal(error.message, 'BACKEND_PROBE_AUTH_DENIED_OWNER')
    assert.doesNotMatch(error.message, /private-sentinel/u)
    return true
  })
})

test('Auth grant returns only the validated user ID and access token', async () => {
  const identity = await authenticateBackendProbeRole({
    role: 'owner', supabaseUrl: 'https://iwevizmsedyqozxlawwl.supabase.co',
    anonKey: 'a'.repeat(40), email: 'owner@example.test', password: 'private-password',
    fetcher: async () => Response.json({ access_token: 't'.repeat(40), token_type: 'bearer', expires_in: 3600,
      user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'private@example.test' } }),
  })
  assert.deepEqual(identity, { accessToken: 't'.repeat(40), userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })
  assert.doesNotMatch(JSON.stringify(identity), /private@example\.test/u)
})

test('a valid snapshot with failing Backend cannot qualify for promotion', async () => {
  const { input, snapshot } = fixture()
  snapshot.checks[0].status = 'red'
  snapshot.overall_status = 'red'
  await assert.rejects(probeBackendRelease(input), /BACKEND_PROBE_OPERATIONAL_CHECK_FAILED/)
})

test('a self-declared narrow profile cannot omit required collectors', async () => {
  const { input, snapshot } = fixture()
  snapshot.required_check_ids = ['app-native-connectivity']
  snapshot.checks = snapshot.checks.filter((check) => check.check_id === 'app-native-connectivity')
  await assert.rejects(probeBackendRelease(input), /BACKEND_PROBE_PROFILE_INCOMPLETE/)
})

test('requires registered Backend identity and the exact observer/Admin check projection', async () => {
  const { input, snapshot } = fixture()
  const original = input.fetcher
  input.fetcher = async (url, options) => {
    if (url.pathname.endsWith('/harness/health')) {
      return Response.json({ status: 'ok', environment: { name: 'production', project_ref: 'iwevizmsedyqozxlawwl' },
        release: { git_sha: input.release.gitSha, release_id: input.release.releaseId,
          release_lane: 'backend-system-health', registered: false } })
    }
    return original(url, options)
  }
  await assert.rejects(probeBackendRelease(input), /BACKEND_PROBE_IDENTITY_MISMATCH/u)

  input.fetcher = original
  snapshot.checks.push({ check_id: 'unregistered-extra', status: 'gray', reason_code: 'OBSERVED', observed_at: null })
  await assert.rejects(probeBackendRelease(input), /BACKEND_PROBE_PROFILE_INCOMPLETE/u)
})

test('does not reuse one role token to claim four authorization checks', async () => {
  const { input, calls } = fixture()
  input.tokens.operator = input.tokens.owner
  await assert.rejects(probeBackendRelease(input), /BACKEND_PROBE_CONFIGURATION_INVALID/u)
  assert.equal(calls.length, 0)
})

test('rejects an Owner credential whose actual profile role is admin_operator', async () => {
  const { input, calls, profileRoles, userIds } = fixture()
  profileRoles.set(userIds.owner, 'admin_operator')
  await assert.rejects(probeBackendRelease(input), /BACKEND_PROBE_ROLE_MISMATCH_OWNER/u)
  assert.equal(calls.some((call) => new URL(call.url).pathname.includes('/admin/system/')), false)
})

test('rejects an Operator credential whose actual profile role is admin', async () => {
  const { input, profileRoles, userIds } = fixture()
  profileRoles.set(userIds.operator, 'admin')
  await assert.rejects(probeBackendRelease(input), /BACKEND_PROBE_ROLE_MISMATCH_OPERATOR/u)
})

test('rejects two distinct credentials that resolve to the same Auth user ID', async () => {
  const { input, calls, userIds } = fixture()
  input.tokens.operator.userId = userIds.owner
  await assert.rejects(probeBackendRelease(input), /BACKEND_PROBE_CONFIGURATION_INVALID/u)
  assert.equal(calls.length, 0)
})

for (const kind of ['old', 'malformed', 'oversized', 'redirect', 'denied-owner', 'transport']) {
  test(`fails safely for ${kind} response`, async () => {
    const { input } = fixture()
    input.fetcher = async () => {
      if (kind === 'old') return Response.json({ status: 'ok', release: { git_sha: 'b'.repeat(40) } })
      if (kind === 'malformed') return new Response('{bad')
      if (kind === 'oversized') return new Response('x'.repeat(16385))
      if (kind === 'redirect') return new Response('', { status: 302 })
      if (kind === 'denied-owner') return new Response('', { status: 403 })
      throw new Error('secret sentinel@example.com')
    }
    await assert.rejects(probeBackendRelease(input), (error) => /^BACKEND_PROBE_[A-Z_]+$/u.test(error.message))
  })
}

for (const kind of ['stale', 'wrong-project', 'wrong-release']) {
  test(`rejects ${kind} snapshot`, async () => {
    const { input, snapshot } = fixture()
    if (kind === 'stale') snapshot.expires_at = iso()
    if (kind === 'wrong-project') snapshot.project_ref = 'otherproject'
    if (kind === 'wrong-release') snapshot.release_id = 'harness-cccccccccccc-dddddddddddd'
    await assert.rejects(probeBackendRelease(input))
  })
}

test('bounds body streaming timeout and cancels the reader', async () => {
  const { input } = fixture()
  let canceled = false
  input.requestTimeoutMs = 10
  input.fetcher = async () => new Response(new ReadableStream({ cancel() { canceled = true } }))
  await assert.rejects(probeBackendRelease(input), /BACKEND_PROBE_TIMEOUT/u)
  assert.equal(canceled, true)
})

test('rejects foreign target before any network', async () => {
  const { input, calls } = fixture()
  input.supabaseUrl = 'https://provider.example.com'
  await assert.rejects(probeBackendRelease(input), /CONFIGURATION_INVALID/u)
  assert.equal(calls.length, 0)
})

test('rejects incorrectly granted Customer access without reading private error content', async () => {
  const { input } = fixture()
  const original = input.fetcher
  input.fetcher = async (url, options) => url.pathname.includes('/admin/system/health') &&
    options.headers.authorization === `Bearer ${input.tokens.customer.accessToken}`
    ? Response.json({ private: 'sentinel@example.com' }) : original(url, options)
  await assert.rejects(probeBackendRelease(input), /BACKEND_PROBE_HTTP_STATUS_INVALID/u)
})

test('rejects unhealthy D1 even when Backend and Admin are readable', async () => {
  const { input } = fixture()
  input.cloudflare.d1Evidence.state.last_error_code = 'D1_FAILED'
  await assert.rejects(probeBackendRelease(input), /CLOUDFLARE_OBSERVER_TICK_NOT_HEALTHY/u)
})

for (const kind of ['digest', 'foreign-release', 'future', 'stale', 'extra-pii', 'inference', 'wrong-profile-role']) {
  test(`receipt verifier rejects ${kind}`, async () => {
    const { input } = fixture()
    const receipt = { ...await probeBackendRelease(input) }
    if (kind === 'digest') receipt.receiptSha256 = '0'.repeat(64)
    if (kind === 'foreign-release') receipt.releaseId = 'harness-cccccccccccc-dddddddddddd'
    if (kind === 'future') receipt.completedAt = iso(1)
    if (kind === 'stale') receipt.completedAt = iso(-180000)
    if (kind === 'extra-pii') receipt.email = 'sentinel@example.com'
    if (kind === 'inference') receipt.inferenceRequests = 1
    if (kind === 'wrong-profile-role') {
      receipt.profileRolesVerified.operator = 'admin'
      const { receiptSha256: _, ...payload } = receipt
      receipt.receiptSha256 = createHash('sha256').update(JSON.stringify(payload)).digest('hex')
    }
    assert.ok(verifyBackendReleaseProbeReceipt(receipt, input.release, nowMs).length > 0)
  })
}

test('receipt verifier rejects a checksummed failed operational status', async () => {
  const { input } = fixture()
  const receipt = { ...await probeBackendRelease(input), checkStatuses: {
    'backend-core': 'green', 'backend-storage-realtime-io': 'red', 'backend-scheduled-workers': 'gray',
    'kael-agentic': 'gray', 'app-native-connectivity': 'gray', 'observer-dispatcher': 'green',
  }, overallStatus: 'red' }
  const { receiptSha256: _, ...payload } = receipt
  receipt.receiptSha256 = createHash('sha256').update(JSON.stringify(payload)).digest('hex')
  assert.ok(verifyBackendReleaseProbeReceipt(receipt, input.release, nowMs).length > 0)
})
