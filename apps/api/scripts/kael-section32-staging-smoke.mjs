#!/usr/bin/env node
import { mkdir, writeFile } from 'fs/promises'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'
import { performance } from 'perf_hooks'
import { createRequire } from 'module'

export const SECTION32_STAGING_CHECKS = [
  'worker_chat_job_scoped_idempotency',
  'worker_chat_turn_job_id',
  'worker_chat_ai_model_column',
  'worker_chat_sse_result',
]

const STAGING_REF = 'xyylanuyflrjzbjzhqfl'
const PRODUCTION_REF = 'iwevizmsedyqozxlawwl'
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../../..')
const require = createRequire(import.meta.url)
const DEFAULT_REPORT_PATH = resolve(
  REPO_ROOT,
  'docs/test-logs/2026-06-05_kael-section32-staging-smoke.md',
)

function readEnv(name, fallbackNames = []) {
  for (const key of [name, ...fallbackNames]) {
    const value = process.env[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function requireEnv(name, fallbackNames = []) {
  const value = readEnv(name, fallbackNames)
  if (!value) throw new Error(`Missing required env: ${[name, ...fallbackNames].join(' or ')}`)
  return value
}

function assertStagingUrl(value, label) {
  if (!value.includes(STAGING_REF)) {
    throw new Error(`${label} must target staging ref ${STAGING_REF}`)
  }
  if (value.includes(PRODUCTION_REF)) {
    throw new Error(`${label} points at production ref ${PRODUCTION_REF}`)
  }
}

function timeoutFetch(timeoutMs) {
  return async (url, options = {}) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetch(url, { ...options, signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }
  }
}

function createSupabase(url, key, timeoutMs = 60_000) {
  const { createClient } = require('@supabase/supabase-js/dist/index.cjs')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: timeoutFetch(timeoutMs) },
  })
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function roundMs(value) {
  return Math.round(value)
}

function parseSseText(text) {
  const events = []
  let eventType = 'message'
  let dataLines = []

  function flush() {
    if (dataLines.length === 0) return
    const rawData = dataLines.join('\n')
    let data = rawData
    try {
      data = JSON.parse(rawData)
    } catch {
      // Keep raw text for diagnostics.
    }
    events.push({ type: eventType, data })
    eventType = 'message'
    dataLines = []
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd()
    if (line === '') {
      flush()
      continue
    }
    if (line.startsWith('event:')) {
      eventType = line.slice('event:'.length).trim()
      continue
    }
    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart())
    }
  }
  flush()
  return events
}

class Section32Harness {
  constructor(config) {
    this.config = config
    this.runId = `section32-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
    this.password = `Section32-${randomUUID()}-Temp-12345!`
    this.admin = createSupabase(config.supabaseUrl, config.serviceRoleKey)
    this.anon = createSupabase(config.supabaseUrl, config.anonKey)
    this.fixtures = {
      users: [],
      jobIds: [],
      sessionIds: [],
    }
    this.results = {
      status: 'running',
      checks: {},
      timings: {},
      limitations: [],
      cleanup: null,
    }
  }

  async run() {
    try {
      const customer = await this.createActor('customer', 1)
      const worker = await this.createActor('worker', 1)
      const firstJobId = await this.createAcceptedJob(customer, worker, 'a')
      const secondJobId = await this.createAcceptedJob(customer, worker, 'b')

      const idempotencyRequestId = randomUUID()
      const firstCreate = await this.api(worker, 'POST', '/workers/me/kael/chat', {
        job_id: firstJobId,
        media_refs: [],
        language: 'vi',
        client_request_id: idempotencyRequestId,
      })
      const secondCreate = await this.api(worker, 'POST', '/workers/me/kael/chat', {
        job_id: secondJobId,
        media_refs: [],
        language: 'vi',
        client_request_id: idempotencyRequestId,
      })

      const firstSession = firstCreate.json?.session
      const secondSession = secondCreate.json?.session
      assert(firstSession?.job_id === firstJobId, 'first worker Kael session did not use first job_id')
      assert(secondSession?.job_id === secondJobId, 'second worker Kael session did not use second job_id')
      assert(firstSession?.id && secondSession?.id, 'worker Kael create response missing session ids')
      assert(firstSession.id !== secondSession.id, 'same client_request_id was reused across jobs')
      this.fixtures.sessionIds.push(firstSession.id, secondSession.id)
      this.results.checks.worker_chat_job_scoped_idempotency = 'passed'

      const stream = await this.streamWorkerTurn(worker, secondSession.id, {
        message: 'What should I inspect first at the lavabo leak before touching any parts?',
        media_refs: [],
        language: 'en',
      })
      assert(stream.result?.session?.id === secondSession.id, 'worker stream result used the wrong session')
      assert(stream.result?.session?.job_id === secondJobId, 'worker stream result used the wrong job_id')
      this.results.checks.worker_chat_sse_result = 'passed'
      this.results.timings.worker_stream_ms = roundMs(stream.durationMs)
      this.results.sse_event_types = stream.events.map((event) => event.type)

      await this.verifyDatabaseProof(secondJobId, secondSession.id)
      await this.cleanup()
      this.results.status = this.results.limitations.length === 0 ? 'passed' : 'passed_with_limitations'
      await this.writeReport()
    } catch (error) {
      this.results.status = 'failed'
      this.results.error = error instanceof Error ? error.message : String(error)
      await this.cleanup().catch((cleanupError) => {
        this.results.cleanup = { ok: false, error: cleanupError.message }
      })
      await this.writeReport()
      throw error
    }
  }

  async createActor(role, index) {
    const email = `${this.runId}-${role}-${index}@section32.staging.test`
    const { data, error } = await this.admin.auth.admin.createUser({
      email,
      password: this.password,
      email_confirm: true,
      user_metadata: { role, full_name: `Section32 ${role} ${index}` },
    })
    if (error || !data.user) throw new Error(`createUser ${role}-${index}: ${error?.message}`)
    const id = data.user.id
    this.fixtures.users.push(id)

    await this.must(
      this.admin.from('profiles').upsert({
        id,
        role,
        full_name: `Section32 ${role} ${index}`,
      }),
      `profile upsert ${role}-${index}`,
    )

    if (role === 'customer') {
      await this.must(
        this.admin.from('customer_profiles').upsert({
          id,
          building_name: 'Section32 Staging Tower',
          unit_number: `S-${index}01`,
          floor: `${index}`,
          district: 'q1',
        }),
        `customer profile ${index}`,
      )
    }

    if (role === 'worker') {
      await this.must(
        this.admin.from('worker_profiles').upsert({
          id,
          legal_name: `Section32 Worker ${index}`,
          date_of_birth: '1990-01-01',
          gender: 'other',
          service_types: ['electrical', 'plumbing', 'cleaning'],
          years_experience: 6,
          districts: ['q1', 'q3', 'q7'],
          home_lat: 10.776,
          home_lng: 106.700,
          service_radius_km: 20,
          problem_specializations: ['section32_staging'],
          cccd_front_url: 'https://example.com/section32-cccd-front.jpg',
          cccd_back_url: 'https://example.com/section32-cccd-back.jpg',
          selfie_url: 'https://example.com/section32-selfie.jpg',
          bank_account: '0000000032',
          bank_name: 'Section32 Test Bank',
          verification_status: 'approved',
          is_approved: true,
          is_available: true,
          is_suspended: false,
        }),
        `worker profile ${index}`,
      )
    }

    const client = createSupabase(this.config.supabaseUrl, this.config.anonKey)
    const signedIn = await client.auth.signInWithPassword({ email, password: this.password })
    if (signedIn.error || !signedIn.data.session) {
      throw new Error(`signIn ${role}-${index}: ${signedIn.error?.message}`)
    }
    return {
      id,
      role,
      email,
      accessToken: signedIn.data.session.access_token,
    }
  }

  async createAcceptedJob(customer, worker, suffix) {
    const now = new Date().toISOString()
    const { data, error } = await this.admin
      .from('jobs')
      .insert({
        customer_id: customer.id,
        worker_id: worker.id,
        service_type: 'plumbing',
        description: `Section32 staging fixture ${this.runId} job ${suffix}: lavabo leak under apartment sink.`,
        problem_chips: ['section32_fixture'],
        photo_urls: [],
        address_building: 'Section32 Staging Tower',
        address_unit: `Fixture-${suffix}`,
        address_floor: '1',
        address_district: 'q1',
        status: 'worker_matched',
        kael_problem_identified: 'Lavabo leak under sink',
        kael_complexity: 'medium',
        kael_price_min: 250000,
        kael_price_max: 450000,
        kael_worker_brief_core: {
          problem: 'Lavabo leak under sink',
          safety: 'Check water shutoff before inspection.',
        },
        kael_worker_brief_guidance: {
          allowed: 'Ask Kael for advisory phrasing and evidence checklist only.',
          forbidden: 'Do not change price, scope, or status outside structured rails.',
        },
        estimate_ready_at: now,
        matched_at: now,
        final_price: null,
      })
      .select('id')
      .single()
    if (error || !data) throw new Error(`insert section32 fixture job ${suffix}: ${error?.message}`)
    this.fixtures.jobIds.push(data.id)
    return data.id
  }

  async must(query, label) {
    const { error, data } = await query
    if (error) throw new Error(`${label}: ${error.message}`)
    return data
  }

  async deleteWhereIn(table, column, values) {
    if (values.length === 0) return
    const { error } = await this.admin.from(table).delete().in(column, values)
    if (error) throw new Error(`${table}.${column}: ${error.message}`)
  }

  async countWhereIn(table, column, values) {
    if (values.length === 0) return 0
    const { count, error } = await this.admin
      .from(table)
      .select('*', { count: 'exact', head: true })
      .in(column, values)
    if (error) throw new Error(`${table}.${column}: ${error.message}`)
    return count ?? 0
  }

  async countJsonTextIn(table, jsonPath, values) {
    let total = 0
    for (const value of values) {
      const { count, error } = await this.admin
        .from(table)
        .select('*', { count: 'exact', head: true })
        .filter(jsonPath, 'eq', value)
      if (error) throw new Error(`${table}.${jsonPath}: ${error.message}`)
      total += count ?? 0
    }
    return total
  }

  async api(actor, method, path, body = undefined, timeoutMs = 75_000) {
    const url = `${this.config.apiBaseUrl}${path}`
    const started = performance.now()
    const response = await timeoutFetch(timeoutMs)(url, {
      method,
      headers: {
        apikey: this.config.anonKey,
        Authorization: `Bearer ${actor.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const durationMs = performance.now() - started
    const text = await response.text()
    let json = null
    if (text) {
      try {
        json = JSON.parse(text)
      } catch {
        json = { raw: text }
      }
    }
    if (!response.ok) {
      throw new Error(`${method} ${path} failed ${response.status}: ${JSON.stringify(json)}`)
    }
    return { status: response.status, json, durationMs }
  }

  async streamWorkerTurn(actor, sessionId, body) {
    const url = `${this.config.apiBaseUrl}/workers/me/kael/chat/${sessionId}/stream`
    const started = performance.now()
    const response = await timeoutFetch(90_000)(url, {
      method: 'POST',
      headers: {
        apikey: this.config.anonKey,
        Authorization: `Bearer ${actor.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    const durationMs = performance.now() - started
    const text = await response.text()
    if (!response.ok) {
      throw new Error(`worker stream failed ${response.status}: ${text}`)
    }
    const events = parseSseText(text)
    const errorEvent = events.find((event) => event.type === 'error')
    if (errorEvent) throw new Error(`worker stream emitted error: ${JSON.stringify(errorEvent.data)}`)
    const resultEvent = events.find((event) => event.type === 'result')
    assert(resultEvent?.data, `worker stream missing result event; events=${events.map((event) => event.type).join(',')}`)
    return { durationMs, events, result: resultEvent.data?.data ?? resultEvent.data }
  }

  async verifyDatabaseProof(jobId, sessionId) {
    const { data: sessions, error: sessionError } = await this.admin
      .from('kael_worker_chat_sessions')
      .select('id, job_id, worker_id, client_request_id, total_turns, total_cost_usd, kael_progress')
      .in('id', this.fixtures.sessionIds)
    if (sessionError) throw new Error(`kael_worker_chat_sessions query: ${sessionError.message}`)
    assert((sessions ?? []).length === 2, `expected 2 section32 worker sessions, got ${(sessions ?? []).length}`)
    const finalSession = sessions.find((session) => session.id === sessionId)
    assert(finalSession?.job_id === jobId, 'database session proof has wrong job_id')
    assert(Number(finalSession.total_turns ?? 0) >= 2, 'database session did not record worker+kael turns')
    this.results.checks.worker_chat_job_scoped_session_rows = 'passed'

    const { data: turns, error: turnError } = await this.admin
      .from('kael_worker_chat_turns')
      .select('id, session_id, job_id, turn_index, role, content_type, ai_provider, ai_model, cost_usd, safe_metadata')
      .eq('session_id', sessionId)
      .order('turn_index', { ascending: true })
    if (turnError) throw new Error(`kael_worker_chat_turns query: ${turnError.message}`)
    assert((turns ?? []).every((turn) => turn.job_id === jobId), 'not every worker chat turn is scoped to the job_id')
    const answerTurn = (turns ?? []).find((turn) => turn.role === 'kael')
    assert(answerTurn, 'worker Kael answer turn was not persisted')
    assert(Object.prototype.hasOwnProperty.call(answerTurn, 'ai_model'), 'worker answer turn select did not include ai_model')
    this.results.checks.worker_chat_turn_job_id = 'passed'
    this.results.checks.worker_chat_ai_model_column = 'passed'
    this.results.answer_turn = {
      role: answerTurn.role,
      content_type: answerTurn.content_type,
      ai_provider: answerTurn.ai_provider ?? null,
      ai_model: answerTurn.ai_model ?? null,
      cost_usd: Number(answerTurn.cost_usd ?? 0),
      fallback_used: Boolean(answerTurn.safe_metadata?.fallback_used),
      guardrail_reason: answerTurn.safe_metadata?.guardrail_reason ?? null,
      provider_attempts: answerTurn.safe_metadata?.provider_attempts ?? [],
    }

    if (this.config.requireProvider && !answerTurn.ai_model) {
      throw new Error('SECTION32_REQUIRE_PROVIDER=1 but worker Kael answer turn has no ai_model')
    }
    if (!answerTurn.ai_model) {
      this.results.limitations.push('Worker Kael used fallback/no-provider path; ai_model column exists but provider/cost proof is not closed.')
    }
  }

  async cleanup() {
    if (this.results.cleanup?.ok) return
    const errors = []
    const safe = async (label, fn) => {
      try {
        await fn()
      } catch (error) {
        errors.push(`${label}: ${error.message}`)
      }
    }

    await safe('worker sessions', async () => {
      await this.deleteWhereIn('kael_worker_chat_sessions', 'job_id', this.fixtures.jobIds)
    })
    await safe('worker chat rate limit log', async () => {
      await this.deleteWhereIn('kael_worker_chat_rate_limit_log', 'worker_id', this.fixtures.users)
    })
    await safe('api logs', async () => {
      await this.deleteWhereIn('api_logs', 'job_id', this.fixtures.jobIds)
    })
    await safe('guardrail audit', async () => {
      await this.deleteWhereIn('kael_guardrail_trip_audit', 'job_id', this.fixtures.jobIds)
    })
    await safe('admin queue', async () => {
      await this.deleteWhereIn('kael_admin_queue', 'job_id', this.fixtures.jobIds)
    })
    await safe('interaction log', async () => {
      await this.deleteWhereIn('kael_interaction_log', 'job_id', this.fixtures.jobIds)
    })
    await safe('job events', async () => {
      await this.deleteWhereIn('job_events', 'job_id', this.fixtures.jobIds)
    })
    await safe('notifications by job', async () => {
      await this.deleteWhereIn('notifications', 'job_id', this.fixtures.jobIds)
    })
    await safe('notifications by user', async () => {
      await this.deleteWhereIn('notifications', 'user_id', this.fixtures.users)
    })
    await safe('worker memory', async () => {
      await this.deleteWhereIn('worker_kael_memory', 'worker_id', this.fixtures.users)
    })
    await safe('jobs', async () => {
      await this.deleteWhereIn('jobs', 'id', this.fixtures.jobIds)
    })
    await safe('role profiles', async () => {
      await this.deleteWhereIn('worker_profiles', 'id', this.fixtures.users)
      await this.deleteWhereIn('customer_profiles', 'id', this.fixtures.users)
    })
    await safe('profiles', async () => {
      await this.deleteWhereIn('profiles', 'id', this.fixtures.users)
    })
    for (const userId of this.fixtures.users) {
      await safe(`auth user ${userId}`, async () => {
        const { error } = await this.admin.auth.admin.deleteUser(userId)
        if (error) throw error
      })
    }

    let residue = null
    await safe('cleanup residue verification', async () => {
      residue = await this.verifyCleanupResidue()
    })
    const residueTotal = residue
      ? Object.values(residue).reduce((total, count) => total + count, 0)
      : null

    this.results.cleanup = {
      ok: errors.length === 0 && residueTotal === 0,
      errors,
      residue,
      residue_total: residueTotal,
      job_ids: this.fixtures.jobIds.length,
      users: this.fixtures.users.length,
      sessions: this.fixtures.sessionIds.length,
    }
    if (errors.length > 0) throw new Error(`cleanup incomplete: ${errors.join('; ')}`)
    if (residueTotal !== 0) {
      throw new Error(`cleanup residue remained: ${JSON.stringify(residue)}`)
    }
  }

  async verifyCleanupResidue() {
    return {
      jobs: await this.countWhereIn('jobs', 'id', this.fixtures.jobIds),
      profiles: await this.countWhereIn('profiles', 'id', this.fixtures.users),
      worker_profiles: await this.countWhereIn('worker_profiles', 'id', this.fixtures.users),
      customer_profiles: await this.countWhereIn('customer_profiles', 'id', this.fixtures.users),
      kael_worker_chat_sessions_by_job: await this.countWhereIn(
        'kael_worker_chat_sessions',
        'job_id',
        this.fixtures.jobIds,
      ),
      kael_worker_chat_sessions_by_id: await this.countWhereIn(
        'kael_worker_chat_sessions',
        'id',
        this.fixtures.sessionIds,
      ),
      kael_worker_chat_turns_by_job: await this.countWhereIn(
        'kael_worker_chat_turns',
        'job_id',
        this.fixtures.jobIds,
      ),
      kael_worker_chat_turns_by_session: await this.countWhereIn(
        'kael_worker_chat_turns',
        'session_id',
        this.fixtures.sessionIds,
      ),
      kael_worker_chat_rate_limit_log: await this.countWhereIn(
        'kael_worker_chat_rate_limit_log',
        'worker_id',
        this.fixtures.users,
      ),
      api_logs: await this.countWhereIn('api_logs', 'job_id', this.fixtures.jobIds),
      kael_guardrail_trip_audit_by_job: await this.countWhereIn(
        'kael_guardrail_trip_audit',
        'job_id',
        this.fixtures.jobIds,
      ),
      kael_guardrail_trip_audit_by_session_metadata: await this.countJsonTextIn(
        'kael_guardrail_trip_audit',
        'safe_metadata->>session_id',
        this.fixtures.sessionIds,
      ),
      kael_admin_queue: await this.countWhereIn('kael_admin_queue', 'job_id', this.fixtures.jobIds),
      kael_interaction_log: await this.countWhereIn(
        'kael_interaction_log',
        'job_id',
        this.fixtures.jobIds,
      ),
      job_events: await this.countWhereIn('job_events', 'job_id', this.fixtures.jobIds),
      notifications_by_job: await this.countWhereIn('notifications', 'job_id', this.fixtures.jobIds),
      notifications_by_user: await this.countWhereIn('notifications', 'user_id', this.fixtures.users),
      worker_kael_memory: await this.countWhereIn('worker_kael_memory', 'worker_id', this.fixtures.users),
    }
  }

  async writeReport() {
    const lines = [
      '# Kael Section 32 Staging Smoke Report',
      '',
      `Date: ${new Date().toISOString()}`,
      `Run id: ${this.runId}`,
      `Status: ${this.results.status}`,
      '',
      '## Checks',
      '',
      ...SECTION32_STAGING_CHECKS.map((check) => `- ${check}: ${this.results.checks[check] ?? 'not_run'}`),
      `- worker_chat_job_scoped_session_rows: ${this.results.checks.worker_chat_job_scoped_session_rows ?? 'not_run'}`,
      '',
      '## Evidence',
      '',
      `- Worker stream duration ms: ${this.results.timings.worker_stream_ms ?? 'n/a'}`,
      `- SSE event types: ${(this.results.sse_event_types ?? []).join(', ') || 'n/a'}`,
      `- Answer turn: ${JSON.stringify(this.results.answer_turn ?? null)}`,
      `- Cleanup: ${JSON.stringify(this.results.cleanup ?? null)}`,
      '',
      '## Limitations',
      '',
      ...(this.results.limitations.length > 0 ? this.results.limitations.map((item) => `- ${item}`) : ['- None.']),
      '',
      '## Error',
      '',
      this.results.error ? `- ${this.results.error}` : '- None.',
      '',
      '## Acceptance Note',
      '',
      '- Treat this as G1 proof only when Status is `passed`, cleanup ok=true, cleanup residue_total=0, the report targets staging ref only, and provider/cost requirements match the current Section 32 gate.',
    ]
    await mkdir(dirname(this.config.reportPath), { recursive: true })
    await writeFile(this.config.reportPath, `${lines.join('\n')}\n`, 'utf8')
    console.log(`Section32 staging smoke report: ${this.config.reportPath}`)
  }
}

function loadConfig() {
  if (process.env.SECTION32_RUN_LIVE !== '1') {
    throw new Error('Set SECTION32_RUN_LIVE=1 to run the mutable Section 32 staging smoke harness.')
  }
  const supabaseUrl = requireEnv('SECTION32_SUPABASE_URL', ['P15_SUPABASE_URL', 'SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_URL'])
  const anonKey = requireEnv('SECTION32_SUPABASE_ANON_KEY', ['P15_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY'])
  const serviceRoleKey = requireEnv('SECTION32_SUPABASE_SERVICE_ROLE_KEY', ['P15_SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY'])
  const apiBaseUrl =
    readEnv('SECTION32_API_BASE_URL', ['P15_API_BASE_URL', 'EXPO_PUBLIC_API_BASE_URL']) ??
    `${supabaseUrl.replace(/\/$/, '')}/functions/v1/mobile-api`

  assertStagingUrl(supabaseUrl, 'SECTION32_SUPABASE_URL')
  assertStagingUrl(apiBaseUrl, 'SECTION32_API_BASE_URL')

  return {
    supabaseUrl,
    anonKey,
    serviceRoleKey,
    apiBaseUrl: apiBaseUrl.replace(/\/$/, ''),
    reportPath: resolve(REPO_ROOT, readEnv('SECTION32_REPORT_PATH') ?? DEFAULT_REPORT_PATH),
    requireProvider: process.env.SECTION32_REQUIRE_PROVIDER === '1',
  }
}

export async function main() {
  const harness = new Section32Harness(loadConfig())
  await harness.run()
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
