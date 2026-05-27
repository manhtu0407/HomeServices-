import { createClient } from '@supabase/supabase-js'
import { performance } from 'node:perf_hooks'

const STAGING_REF = 'xyylanuyflrjzbjzhqfl'
const PRODUCTION_REF = 'iwevizmsedyqozxlawwl'
const PASSWORD = 'F26-source-trust-Temp-12345!'

const CASES = [
  {
    id: 'cleaning-standard-q1',
    service_type: 'cleaning',
    problem_chips: ['Ve sinh can ho'],
    description: 'F26 source trust smoke: Can ve sinh can ho 2 phong ngu tai TP.HCM, uu tien bang gia bTaskee va JupViec.',
    district: 'q1',
  },
  {
    id: 'cleaning-standard-q3',
    service_type: 'cleaning',
    problem_chips: ['Ve sinh can ho'],
    description: 'F26 source trust smoke: Can ve sinh can ho 2 phong ngu tai TP.HCM, uu tien bang gia bTaskee va JupViec.',
    district: 'q3',
  },
  {
    id: 'cleaning-standard-binh-thanh',
    service_type: 'cleaning',
    problem_chips: ['Ve sinh can ho'],
    description: 'F26 source trust smoke: Can ve sinh can ho 2 phong ngu tai TP.HCM, uu tien bang gia bTaskee va JupViec.',
    district: 'binh_thanh',
  },
  {
    id: 'cleaning-standard-q7',
    service_type: 'cleaning',
    problem_chips: ['Ve sinh can ho'],
    description: 'F26 source trust smoke: Can ve sinh can ho 2 phong ngu tai TP.HCM, uu tien bang gia bTaskee va JupViec.',
    district: 'q7',
  },
  {
    id: 'cleaning-standard-thu-duc',
    service_type: 'cleaning',
    problem_chips: ['Ve sinh can ho'],
    description: 'F26 source trust smoke: Can ve sinh can ho 2 phong ngu tai TP.HCM, uu tien bang gia bTaskee va JupViec.',
    district: 'thu_duc',
  },
]

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function readEnv(name, fallbacks = []) {
  for (const key of [name, ...fallbacks]) {
    const value = process.env[key]?.trim()
    if (value) return value
  }
  return null
}

function requireEnv(name, fallbacks = []) {
  const value = readEnv(name, fallbacks)
  if (!value) throw new Error(`Missing required env ${name}`)
  return value
}

function assertStagingUrl(value, label) {
  assert(value.includes(STAGING_REF), `${label} must target staging ref ${STAGING_REF}`)
  assert(!value.includes(PRODUCTION_REF), `${label} must not target production ref ${PRODUCTION_REF}`)
}

function createSupabase(url, key) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch },
  })
}

async function timeoutFetch(timeoutMs, url, options) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function must(query, label) {
  const { data, error } = await query
  if (error) throw new Error(`${label}: ${error.message}`)
  return data
}

class F26SourceTrustSmoke {
  constructor(config) {
    this.config = config
    this.admin = createSupabase(config.supabaseUrl, config.serviceRoleKey)
    this.runId = `f26-src-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`
    this.startedAt = new Date().toISOString()
    this.artifactSince = config.artifactSince ?? this.startedAt
    this.userIds = []
    this.jobIds = []
    this.timings = []
    this.results = {
      runId: this.runId,
      startedAt: this.startedAt,
      artifactSince: this.artifactSince,
      registry: null,
      jobs: [],
      apiLogs: null,
      artifacts: null,
      cleanup: null,
      limitations: [],
    }
  }

  async run() {
    await this.verifyRegistry()
    const customer = await this.createCustomer()
    for (let index = 0; index < CASES.length; index += 1) {
      await this.createJob(customer, CASES[index], index)
    }
    await this.verifyArtifacts()
    return this.results
  }

  async verifyRegistry() {
    const rows = await must(
      this.admin
        .from('source_trust_registry')
        .select('domain,tier,is_active,trust_score')
        .eq('tier', 'tier_1')
        .eq('is_active', true),
      'fetch source trust registry',
    )
    assert(rows.length >= 20, `expected >=20 active Tier 1 domains, got ${rows.length}`)
    this.results.registry = {
      tier1Active: rows.length,
      domains: rows.map((row) => row.domain).sort().slice(0, 5),
    }
  }

  async createCustomer() {
    const email = `${this.runId}-customer@f26.source-trust.test`
    const { data, error } = await this.admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { role: 'customer', full_name: 'F26 Source Trust Smoke Customer' },
    })
    if (error || !data.user) throw new Error(`create smoke user: ${error?.message}`)
    const id = data.user.id
    this.userIds.push(id)

    await must(
      this.admin.from('profiles').upsert({
        id,
        role: 'customer',
        full_name: 'F26 Source Trust Smoke Customer',
      }),
      'profile upsert',
    )
    await must(
      this.admin.from('customer_profiles').upsert({
        id,
        building_name: 'F26 Source Trust Tower',
        unit_number: 'A-2601',
        floor: '26',
        district: 'q1',
      }),
      'customer profile upsert',
    )

    const client = createSupabase(this.config.supabaseUrl, this.config.anonKey)
    const signedIn = await client.auth.signInWithPassword({ email, password: PASSWORD })
    if (signedIn.error || !signedIn.data.session) {
      throw new Error(`sign in smoke user: ${signedIn.error?.message}`)
    }
    return { id, accessToken: signedIn.data.session.access_token }
  }

  async api(actor, method, path, body = undefined) {
    const started = performance.now()
    const response = await timeoutFetch(90_000, `${this.config.apiBaseUrl}${path}`, {
      method,
      headers: {
        apikey: this.config.anonKey,
        Authorization: `Bearer ${actor.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const durationMs = performance.now() - started
    this.timings.push(durationMs)
    const text = await response.text()
    const json = text ? JSON.parse(text) : {}
    if (!response.ok) {
      throw new Error(`${method} ${path} failed ${response.status}: ${JSON.stringify(json)}`)
    }
    return { json, durationMs }
  }

  async createJob(customer, scenario, index) {
    const { json, durationMs } = await this.api(customer, 'POST', '/jobs', {
      service_type: scenario.service_type,
      problem_chips: scenario.problem_chips,
      description: scenario.description,
      address_building: 'F26 Source Trust Tower',
      address_unit: `A-${2601 + index}`,
      address_floor: '26',
      address_district: scenario.district,
      photo_urls: [],
    })
    assert(json.job_id, `${scenario.id}: missing job_id`)
    assert(
      json.status === 'awaiting_customer_confirm',
      `${scenario.id}: expected awaiting_customer_confirm, got ${json.status}`,
    )
    this.jobIds.push(json.job_id)
    this.results.jobs.push({
      id: scenario.id,
      jobId: json.job_id,
      status: json.status,
      durationMs: Math.round(durationMs),
    })
  }

  async verifyArtifacts() {
    const marketLogs = await must(
      this.admin
        .from('api_logs')
        .select('job_id, purpose, provider, model, success, error_code, safe_metadata')
        .in('job_id', this.jobIds)
        .eq('purpose', 'market_lookup'),
      'fetch source trust market api logs',
    )
    this.results.apiLogs = {
      marketCount: marketLogs.length,
      successes: marketLogs.filter((log) => log.success === true).length,
      failures: marketLogs.filter((log) => log.success !== true).map((log) => ({
        error_code: log.error_code,
        safe_metadata: log.safe_metadata,
      })),
      metadata: marketLogs.map((log) => log.safe_metadata),
    }

    const artifacts = await must(
      this.admin
        .from('kael_market_artifacts')
        .select('id, provider, market_range_min, market_range_max, failure_reason, safe_metadata, created_at')
        .gte('created_at', this.artifactSince)
        .order('created_at', { ascending: false })
        .limit(20),
      'fetch source trust market artifacts',
    )
    const accepted = artifacts.filter((artifact) => {
      const metadata = artifact.safe_metadata ?? {}
      const citations = Array.isArray(metadata.citations) ? metadata.citations : []
      return metadata.source_trust_citation_result === 'passed' &&
        citations.filter((item) => item?.accepted === true).length >= 2
    })
    assert(accepted.length >= CASES.length, `expected ${CASES.length} accepted citation artifacts, got ${accepted.length}`)
    this.results.artifacts = {
      checked: artifacts.length,
      acceptedCitationArtifacts: accepted.length,
      sampleDomains: accepted
        .flatMap((artifact) => artifact.safe_metadata.citations ?? [])
        .filter((item) => item?.accepted === true)
        .map((item) => item.matched_domain)
        .filter(Boolean)
        .slice(0, 10),
    }
  }

  async cleanup() {
    const counts = {}
    if (this.jobIds.length > 0) {
      for (const table of [
        'kael_optimization_metrics',
        'job_events',
        'job_broadcasts',
        'chat_messages',
        'reviews',
        'api_logs',
        'notifications',
        'jobs',
      ]) {
        const column = table === 'jobs' ? 'id' : 'job_id'
        const { error } = await this.admin.from(table).delete().in(column, this.jobIds)
        if (error) this.results.limitations.push(`cleanup ${table}: ${error.message}`)
      }
      for (const table of ['kael_optimization_metrics', 'jobs', 'job_events', 'job_broadcasts', 'api_logs', 'notifications']) {
        const column = table === 'jobs' ? 'id' : 'job_id'
        const { count, error } = await this.admin
          .from(table)
          .select('id', { count: 'exact', head: true })
          .in(column, this.jobIds)
        if (error) throw new Error(`cleanup count ${table}: ${error.message}`)
        counts[table] = count ?? 0
      }
    }
    for (const userId of this.userIds) {
      await this.admin.from('customer_profiles').delete().eq('id', userId)
      await this.admin.from('profiles').delete().eq('id', userId)
      const { error } = await this.admin.auth.admin.deleteUser(userId)
      if (error) this.results.limitations.push(`delete auth user: ${error.message}`)
    }
    if (this.userIds.length > 0) {
      const { count, error } = await this.admin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .in('id', this.userIds)
      if (error) throw new Error(`cleanup count profiles: ${error.message}`)
      counts.profiles = count ?? 0
    }
    this.results.cleanup = { counts, ok: Object.values(counts).every((value) => value === 0) }
    assert(this.results.cleanup.ok, `cleanup verification failed: ${JSON.stringify(counts)}`)
  }
}

function loadConfig() {
  if (process.env.F26_RUN_SOURCE_TRUST_SMOKE !== '1') {
    throw new Error('Set F26_RUN_SOURCE_TRUST_SMOKE=1 to run the mutable staging source-trust smoke harness.')
  }
  const supabaseUrl = requireEnv('F26_SUPABASE_URL', [
    'NEXT_PUBLIC_SUPABASE_URL',
    'EXPO_PUBLIC_SUPABASE_URL',
  ])
  const anonKey = requireEnv('F26_SUPABASE_ANON_KEY', [
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_ANON_KEY',
  ])
  const serviceRoleKey = requireEnv('F26_SUPABASE_SERVICE_ROLE_KEY', ['SUPABASE_SERVICE_ROLE_KEY'])
  const apiBaseUrl =
    readEnv('F26_API_BASE_URL', ['EXPO_PUBLIC_API_BASE_URL']) ??
    `${supabaseUrl}/functions/v1/mobile-api`
  const artifactSince = readEnv('F26_ARTIFACTS_SINCE')

  assertStagingUrl(supabaseUrl, 'F26_SUPABASE_URL')
  assertStagingUrl(apiBaseUrl, 'F26_API_BASE_URL')
  return { supabaseUrl, anonKey, serviceRoleKey, apiBaseUrl, artifactSince }
}

const harness = new F26SourceTrustSmoke(loadConfig())
let status = 'failed'
try {
  await harness.run()
  status = 'passed'
} catch (error) {
  harness.results.error = error instanceof Error ? error.message : String(error)
} finally {
  await harness.cleanup().catch((error) => {
    harness.results.cleanup = { ok: false, error: error instanceof Error ? error.message : String(error) }
  })
}

const output = {
  status,
  ...harness.results,
  timings: {
    count: harness.timings.length,
    maxMs: Math.round(Math.max(...harness.timings, 0)),
    avgMs: Math.round(harness.timings.reduce((sum, value) => sum + value, 0) / Math.max(harness.timings.length, 1)),
  },
}

console.log(JSON.stringify(output, null, 2))
if (status !== 'passed' || harness.results.cleanup?.ok !== true) {
  process.exitCode = 1
}
