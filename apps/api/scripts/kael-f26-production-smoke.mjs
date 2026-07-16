import { createClient } from '@supabase/supabase-js'
import { performance } from 'node:perf_hooks'
import {
  assertLiveApproval,
  assertSupabaseTargets,
  createEphemeralPassword,
  createTimeoutFetch,
} from './lib/privileged-script-safety.mjs'

const CASES = [
  {
    id: 'electrical-breaker',
    service_type: 'electrical',
    problem_chips: ['CB nhay lien tuc'],
    description: 'F26 production smoke: CB tong bi nhay lien tuc trong can ho, can kiem tra an toan.',
    district: 'q1',
  },
  {
    id: 'plumbing-leak',
    service_type: 'plumbing',
    problem_chips: ['Ro nuoc lavabo'],
    description: 'F26 production smoke: Bon rua chen bi ro nuoc duoi lavabo, can kiem tra ong va gioang.',
    district: 'q3',
  },
  {
    id: 'cleaning-move',
    service_type: 'cleaning',
    problem_chips: ['Ve sinh can ho'],
    description: 'F26 production smoke: Can ve sinh can ho sau chuyen nha, uu tien bep va nha tam.',
    district: 'binh_thanh',
  },
  {
    id: 'electrical-outlet',
    service_type: 'electrical',
    problem_chips: ['O cam co mui khet'],
    description: 'F26 production smoke: O cam co mui khét khi cam thiet bi, can tho dien kiem tra.',
    district: 'q7',
  },
  {
    id: 'plumbing-clog',
    service_type: 'plumbing',
    problem_chips: ['Bon cau thoat cham'],
    description: 'F26 production smoke: Bon cau thoat cham va co dau hieu nghe, can xu ly trong ngay.',
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

function createSupabase(url, key) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: createTimeoutFetch(60_000) },
  })
}

async function must(query, label) {
  const { data, error } = await query
  if (error) throw new Error(`${label}: ${error.message}`)
  return data
}

class F26ProductionSmoke {
  constructor(config) {
    this.config = config
    this.admin = createSupabase(config.supabaseUrl, config.serviceRoleKey)
    this.runId = `f26-prod-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`
    this.password = createEphemeralPassword('F26Production')
    this.userIds = []
    this.jobIds = []
    this.timings = []
    this.results = {
      runId: this.runId,
      services: null,
      jobs: [],
      apiLogs: null,
      cleanup: null,
      limitations: [],
    }
  }

  async run() {
    const customer = await this.createCustomer()
    await this.verifyServices(customer)
    for (let index = 0; index < CASES.length; index += 1) {
      await this.createJob(customer, CASES[index], index)
    }
    await this.verifyJobs()
    await this.verifyApiLogs()
    return this.results
  }

  async createCustomer() {
    const email = `${this.runId}-customer@f26.production.test`
    const { data, error } = await this.admin.auth.admin.createUser({
      email,
      password: this.password,
      email_confirm: true,
      user_metadata: { role: 'customer', full_name: 'F26 Production Smoke Customer' },
    })
    if (error || !data.user) throw new Error(`create production smoke user: ${error?.message}`)
    const id = data.user.id
    this.userIds.push(id)

    await must(
      this.admin.from('profiles').upsert({
        id,
        role: 'customer',
        full_name: 'F26 Production Smoke Customer',
      }),
      'profile upsert',
    )
    await must(
      this.admin.from('customer_profiles').upsert({
        id,
        building_name: 'F26 Production Smoke Tower',
        unit_number: 'A-2601',
        floor: '26',
        district: 'q1',
      }),
      'customer profile upsert',
    )

    const client = createSupabase(this.config.supabaseUrl, this.config.anonKey)
    const signedIn = await client.auth.signInWithPassword({ email, password: this.password })
    if (signedIn.error || !signedIn.data.session) {
      throw new Error(`sign in production smoke user: ${signedIn.error?.message}`)
    }
    return { id, accessToken: signedIn.data.session.access_token }
  }

  async api(actor, method, path, body = undefined) {
    const started = performance.now()
    const response = await createTimeoutFetch(90_000)(`${this.config.apiBaseUrl}${path}`, {
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

  async verifyServices(customer) {
    const { json } = await this.api(customer, 'GET', '/services')
    const serviceTypes = (json.services ?? []).map((item) => item.service_type)
    for (const serviceType of ['electrical', 'plumbing', 'cleaning']) {
      assert(serviceTypes.includes(serviceType), `services missing ${serviceType}`)
    }
    this.results.services = { count: serviceTypes.length, serviceTypes }
  }

  async createJob(customer, scenario, index) {
    const { json, durationMs } = await this.api(customer, 'POST', '/jobs', {
      service_type: scenario.service_type,
      problem_chips: scenario.problem_chips,
      description: scenario.description,
      address_building: 'F26 Production Smoke Tower',
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

  async verifyJobs() {
    const jobs = await must(
      this.admin
        .from('jobs')
        .select('id, status, service_type, kael_problem_identified, kael_price_min, kael_price_max')
        .in('id', this.jobIds),
      'fetch production smoke jobs',
    )
    assert(jobs.length === CASES.length, `expected ${CASES.length} jobs, got ${jobs.length}`)
    const unsafe = jobs.filter((job) => job.status !== 'awaiting_customer_confirm')
    assert(unsafe.length === 0, `unexpected job statuses: ${JSON.stringify(unsafe)}`)
  }

  async verifyApiLogs() {
    const logs = await must(
      this.admin
        .from('api_logs')
        .select('job_id, purpose, provider, model, success, error_code, latency_ms, safe_metadata')
        .in('job_id', this.jobIds),
      'fetch production smoke api logs',
    )
    const missingJobs = this.jobIds.filter((jobId) => !logs.some((log) => log.job_id === jobId))
    assert(missingJobs.length === 0, `jobs missing api logs: ${missingJobs.join(', ')}`)
    const missingPurpose = logs.filter((log) => typeof log.purpose !== 'string' || log.purpose.trim() === '')
    assert(missingPurpose.length === 0, `api logs missing purpose: ${missingPurpose.length}`)
    const unsafeMetadata = logs.filter((log) => {
      const value = JSON.stringify(log.safe_metadata ?? {})
      return /bearer|token|password|cccd|bank|sbp_/i.test(value)
    })
    assert(unsafeMetadata.length === 0, `unsafe metadata rows: ${unsafeMetadata.length}`)

    const successCount = logs.filter((log) => log.success === true).length
    this.results.apiLogs = {
      count: logs.length,
      successCount,
      failureCount: logs.length - successCount,
      purposes: [...new Set(logs.map((log) => log.purpose))].sort(),
      providers: [...new Set(logs.map((log) => log.provider))].sort(),
    }
  }

  async cleanup() {
    const counts = {}
    const errors = []
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
        if (error) errors.push(`cleanup ${table}: ${error.message}`)
      }

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
        const { count, error } = await this.admin
          .from(table)
          .select('id', { count: 'exact', head: true })
          .in(column, this.jobIds)
        if (error) errors.push(`cleanup count ${table}: ${error.message}`)
        else counts[table] = count ?? 0
      }
    }

    for (const userId of this.userIds) {
      const { error: customerProfileError } = await this.admin.from('customer_profiles').delete().eq('id', userId)
      if (customerProfileError) errors.push(`cleanup customer_profiles: ${customerProfileError.message}`)
      const { error: profileError } = await this.admin.from('profiles').delete().eq('id', userId)
      if (profileError) errors.push(`cleanup profiles: ${profileError.message}`)
      const { error } = await this.admin.auth.admin.deleteUser(userId)
      if (error) errors.push(`delete auth user: ${error.message}`)
    }

    if (this.userIds.length > 0) {
      for (const table of ['customer_profiles', 'profiles']) {
        const { count, error } = await this.admin
          .from(table)
          .select('id', { count: 'exact', head: true })
          .in('id', this.userIds)
        if (error) errors.push(`cleanup count ${table}: ${error.message}`)
        else counts[table] = count ?? 0
      }
    }

    const ok = errors.length === 0 && Object.values(counts).every((value) => value === 0)
    this.results.cleanup = { counts, errors, ok }
    assert(ok, `cleanup verification failed: ${JSON.stringify({ counts, errors })}`)
  }
}

function loadConfig() {
  assertLiveApproval('F26_RUN_PRODUCTION', 'I_UNDERSTAND_PRODUCTION_MUTATION')
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

  assertSupabaseTargets('production', supabaseUrl, apiBaseUrl)
  return { supabaseUrl, anonKey, serviceRoleKey, apiBaseUrl: apiBaseUrl.replace(/\/$/, '') }
}

const harness = new F26ProductionSmoke(loadConfig())
let status = 'failed'
try {
  await harness.run()
  status = 'passed'
} catch (error) {
  harness.results.error = error instanceof Error ? error.message : String(error)
} finally {
  await harness.cleanup().catch((error) => {
    status = 'failed'
    harness.results.cleanup = {
      ...(harness.results.cleanup ?? {}),
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
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
