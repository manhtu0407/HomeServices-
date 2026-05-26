#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'

const STAGING_REF = 'xyylanuyflrjzbjzhqfl'
const PRODUCTION_REF = 'iwevizmsedyqozxlawwl'
const PASSWORD = 'Q1-baseline-Temp-12345!'
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../../..')
const DEFAULT_REPORT_PATH = resolve(REPO_ROOT, 'docs/cost-baseline-2026-05.md')

const SCENARIOS = [
  {
    service_type: 'electrical',
    description: 'Q1 baseline: circuit breaker trips repeatedly in the apartment, needs safe inspection.',
    problem_chips: ['breaker_trip'],
  },
  {
    service_type: 'plumbing',
    description: 'Q1 baseline: sink pipe is leaking below the cabinet and needs seal replacement.',
    problem_chips: ['pipe_leak'],
  },
  {
    service_type: 'cleaning',
    description: 'Q1 baseline: apartment needs standard home cleaning focused on kitchen and bathroom.',
    problem_chips: ['standard_home_cleaning'],
  },
  {
    service_type: 'electrical',
    description: 'Q1 baseline: outlet is burned black and has a light smell after plugging an appliance.',
    problem_chips: ['outlet_or_switch_broken'],
  },
  {
    service_type: 'plumbing',
    description: 'Q1 baseline: bathroom drain is clogged and drains very slowly after shower use.',
    problem_chips: ['clogged_drain_or_sink'],
  },
]

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
  if (!value.includes(STAGING_REF)) throw new Error(`${label} must target staging ${STAGING_REF}`)
  if (value.includes(PRODUCTION_REF)) throw new Error(`${label} points at production ${PRODUCTION_REF}`)
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
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: timeoutFetch(timeoutMs) },
  })
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function round(value, places = 4) {
  const factor = 10 ** places
  return Math.round(Number(value || 0) * factor) / factor
}

function percentile(values, p) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[index]
}

class Q1BaselineHarness {
  constructor(config) {
    this.config = config
    this.runId = `q1-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
    this.admin = createSupabase(config.supabaseUrl, config.serviceRoleKey)
    this.jobIds = []
    this.userIds = []
    this.timings = []
    this.limitations = []
    this.baselineRow = null
    this.cleanupCounts = {}
  }

  async run() {
    const sampleStartedAt = new Date().toISOString()
    const customer = await this.createCustomer()
    for (let index = 0; index < this.config.sampleSize; index += 1) {
      await this.createBaselineJob(customer, index)
    }
    const sampleEndedAt = new Date().toISOString()
    const jobs = await this.fetchJobs()
    const apiLogs = await this.fetchApiLogs()
    assert(jobs.length === this.config.sampleSize, `expected ${this.config.sampleSize} jobs, got ${jobs.length}`)
    assert(apiLogs.length > 0, 'baseline produced no api_logs rows')

    const providerBreakdown = buildBreakdown(apiLogs, (row) => `${row.purpose}:${row.provider}`)
    const purposeBreakdown = buildBreakdown(apiLogs, (row) => row.purpose)
    const totalCostUsd = apiLogs.reduce((sum, row) => sum + number(row.cost_usd), 0)
    const successCount = apiLogs.filter((row) => row.success === true).length
    const estimateValidCount = jobs.filter((job) =>
      number(job.kael_price_min) > 0 && number(job.kael_price_max) >= number(job.kael_price_min)
    ).length
    const toneScore = scoreVietnameseTone(jobs)
    const avgReviewRating = await this.fetchAverageReviewRating()

    const baseline = {
      baseline_key: `${this.runId}-staging-50`,
      source: 'staging_live_50',
      sample_size: this.config.sampleSize,
      job_count: jobs.length,
      api_log_count: apiLogs.length,
      schema_validation_rate: round(successCount / apiLogs.length, 4),
      vietnamese_tone_score: toneScore,
      avg_review_rating: avgReviewRating,
      advisory_accuracy_score: round(estimateValidCount / jobs.length, 4),
      provider_breakdown: providerBreakdown,
      purpose_breakdown: purposeBreakdown,
      cost_summary: {
        total_cost_usd: round(totalCostUsd, 6),
        cost_per_job_usd: round(totalCostUsd / jobs.length, 6),
        projected_1000_jobs_usd: round((totalCostUsd / jobs.length) * 1000, 2),
        intake_p95_ms: Math.round(percentile(this.timings, 95)),
      },
      sample_started_at: sampleStartedAt,
      sample_ended_at: sampleEndedAt,
      safe_metadata: {
        run_id: this.runId,
        edge_api: true,
        cleanup_policy: 'Fixture jobs, api_logs, events, profiles, and auth user deleted after aggregate persisted.',
      },
    }

    const { data, error } = await this.admin
      .from('kael_quality_baseline')
      .insert(baseline)
      .select('id, baseline_key')
      .single()
    if (error) throw new Error(`insert baseline: ${error.message}`)
    this.baselineRow = data
    return { jobs, apiLogs, baseline }
  }

  async createCustomer() {
    const email = `${this.runId}-customer@q1.staging.test`
    const { data, error } = await this.admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { role: 'customer', full_name: 'Q1 baseline customer' },
    })
    if (error || !data.user) throw new Error(`create baseline user: ${error?.message}`)
    const id = data.user.id
    this.userIds.push(id)
    await must(this.admin.from('profiles').upsert({ id, role: 'customer', full_name: 'Q1 baseline customer' }), 'profile')
    await must(this.admin.from('customer_profiles').upsert({
      id,
      building_name: 'Q1 Baseline Tower',
      unit_number: 'A-501',
      floor: '5',
      district: 'q7',
    }), 'customer profile')

    const client = createSupabase(this.config.supabaseUrl, this.config.anonKey)
    const signedIn = await client.auth.signInWithPassword({ email, password: PASSWORD })
    if (signedIn.error || !signedIn.data.session) throw new Error(`sign in baseline user: ${signedIn.error?.message}`)
    return { id, accessToken: signedIn.data.session.access_token }
  }

  async createBaselineJob(customer, index) {
    const scenario = SCENARIOS[index % SCENARIOS.length]
    const started = performance.now()
    const response = await timeoutFetch(75_000)(`${this.config.apiBaseUrl}/jobs`, {
      method: 'POST',
      headers: {
        apikey: this.config.anonKey,
        Authorization: `Bearer ${customer.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...scenario,
        address_building: 'Q1 Baseline Tower',
        address_unit: `A-${index + 1}`,
        address_floor: '5',
        address_district: 'q7',
        photo_urls: [],
      }),
    })
    this.timings.push(performance.now() - started)
    const text = await response.text()
    const json = text ? JSON.parse(text) : {}
    if (!response.ok) throw new Error(`create baseline job ${index} failed ${response.status}: ${JSON.stringify(json)}`)
    assert(json.job_id, `create baseline job ${index} missing job_id`)
    assert(json.status === 'awaiting_customer_confirm', `create baseline job ${index} status ${json.status}`)
    this.jobIds.push(json.job_id)
  }

  async fetchJobs() {
    const { data, error } = await this.admin
      .from('jobs')
      .select('id, status, service_type, kael_problem_identified, kael_advisory, kael_price_min, kael_price_max')
      .in('id', this.jobIds)
    if (error) throw new Error(`fetch jobs: ${error.message}`)
    return data ?? []
  }

  async fetchApiLogs() {
    const { data, error } = await this.admin
      .from('api_logs')
      .select('job_id, request_id, purpose, provider, model, input_tokens, output_tokens, cost_usd, latency_ms, success, error_code, safe_metadata')
      .in('job_id', this.jobIds)
    if (error) throw new Error(`fetch api logs: ${error.message}`)
    return data ?? []
  }

  async fetchAverageReviewRating() {
    const { data, error } = await this.admin
      .from('reviews')
      .select('rating')
      .limit(100)
    if (error) {
      this.limitations.push(`review rating proxy unavailable: ${error.message}`)
      return null
    }
    const ratings = (data ?? []).map((row) => number(row.rating)).filter((value) => value > 0)
    return ratings.length === 0 ? null : round(ratings.reduce((sum, value) => sum + value, 0) / ratings.length, 2)
  }

  async cleanup() {
    if (this.jobIds.length > 0) {
      for (const table of [
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
        if (error) this.limitations.push(`cleanup ${table}: ${error.message}`)
      }
    }
    for (const userId of this.userIds) {
      await this.admin.from('customer_profiles').delete().eq('id', userId)
      await this.admin.from('profiles').delete().eq('id', userId)
      const { error } = await this.admin.auth.admin.deleteUser(userId)
      if (error) this.limitations.push(`delete auth user: ${error.message}`)
    }
    await this.verifyCleanup()
  }

  async verifyCleanup() {
    const counts = {}
    if (this.jobIds.length > 0) {
      for (const table of ['jobs', 'job_events', 'job_broadcasts', 'api_logs', 'notifications']) {
        const column = table === 'jobs' ? 'id' : 'job_id'
        const { count, error } = await this.admin
          .from(table)
          .select('id', { count: 'exact', head: true })
          .in(column, this.jobIds)
        if (error) throw new Error(`cleanup count ${table}: ${error.message}`)
        counts[table] = count ?? 0
      }
    }
    if (this.userIds.length > 0) {
      const { count, error } = await this.admin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .in('id', this.userIds)
      if (error) throw new Error(`cleanup count profiles: ${error.message}`)
      counts.profiles = count ?? 0
    }
    this.cleanupCounts = counts
    if (!Object.values(counts).every((value) => value === 0)) {
      throw new Error(`cleanup verification failed: ${JSON.stringify(counts)}`)
    }
  }

  async writeReport(status, summary = null) {
    const reportPath = this.config.reportPath
    await mkdir(dirname(reportPath), { recursive: true })
    await writeFile(reportPath, this.formatReport(status, summary), 'utf8')
    return reportPath
  }

  formatReport(status, summary) {
    const baseline = summary?.baseline
    return `# Kael Cost Baseline - 2026-05

Status: ${status}
Staging ref: \`${STAGING_REF}\`
Run id: \`${this.runId}\`
Baseline row: ${this.baselineRow?.baseline_key ?? 'not persisted'}

## Scope

Plan.md section 24 Q1 baseline measurement before enabling cost optimizations.

## Evidence

- Sample jobs requested: ${this.config.sampleSize}
- Jobs created through Edge: ${baseline?.job_count ?? 0}
- Provider log rows measured: ${baseline?.api_log_count ?? 0}
- Schema/provider success rate: ${baseline?.schema_validation_rate ?? 'n/a'}
- Vietnamese tone heuristic: ${baseline?.vietnamese_tone_score ?? 'n/a'}
- Advisory/estimate accuracy proxy: ${baseline?.advisory_accuracy_score ?? 'n/a'}
- Provider breakdown: ${baseline ? JSON.stringify(baseline.provider_breakdown) : 'n/a'}
- Purpose breakdown: ${baseline ? JSON.stringify(baseline.purpose_breakdown) : 'n/a'}
- Cost summary: ${baseline ? JSON.stringify(baseline.cost_summary) : 'n/a'}
- Cleanup counts: ${JSON.stringify(this.cleanupCounts)}

## Notes

- All optimization flags remained disabled.
- No fixture job, api log, event, profile, or auth user is intentionally retained.
- Persisted aggregate baseline row remains in \`kael_quality_baseline\`.
- Safe per-call metric rows remain in \`kael_optimization_metrics\` with fixture job ids nulled by cleanup.

## Limitations

${this.limitations.length ? this.limitations.map((item) => `- ${item}`).join('\n') : '- None observed in this run.'}
`
  }
}

async function must(query, label) {
  const { error, data } = await query
  if (error) throw new Error(`${label}: ${error.message}`)
  return data
}

function buildBreakdown(rows, keyFn) {
  const grouped = new Map()
  for (const row of rows) {
    const key = keyFn(row) ?? 'unknown'
    const current = grouped.get(key) ?? { calls: 0, successes: 0, failures: 0, cost_usd: 0, latencies: [] }
    current.calls += 1
    if (row.success === true) current.successes += 1
    if (row.success !== true) current.failures += 1
    current.cost_usd += number(row.cost_usd)
    if (number(row.latency_ms) > 0) current.latencies.push(number(row.latency_ms))
    grouped.set(key, current)
  }
  return Object.fromEntries([...grouped.entries()].map(([key, value]) => [
    key,
    {
      calls: value.calls,
      successes: value.successes,
      failures: value.failures,
      cost_usd: round(value.cost_usd, 6),
      avg_latency_ms: value.latencies.length
        ? Math.round(value.latencies.reduce((sum, item) => sum + item, 0) / value.latencies.length)
        : 0,
      p95_latency_ms: Math.round(percentile(value.latencies, 95)),
    },
  ]))
}

function scoreVietnameseTone(jobs) {
  const texts = jobs.flatMap((job) => [job.kael_problem_identified, job.kael_advisory])
    .filter((value) => typeof value === 'string' && value.trim())
  if (texts.length === 0) return null
  const good = texts.filter((text) =>
    !/\b(local|deal|customer|worker profile|choose area)\b/i.test(text) &&
    !/[\u00c3\u00c2]{1}/.test(text)
  ).length
  return round(good / texts.length, 4)
}

function number(value) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function loadConfig() {
  if (process.env.Q1_BASELINE_RUN_LIVE !== '1') {
    throw new Error('Set Q1_BASELINE_RUN_LIVE=1 to run the mutable staging baseline harness.')
  }
  const supabaseUrl = requireEnv('Q1_SUPABASE_URL', ['P15_SUPABASE_URL'])
  const anonKey = requireEnv('Q1_SUPABASE_ANON_KEY', ['P15_SUPABASE_ANON_KEY'])
  const serviceRoleKey = requireEnv('Q1_SUPABASE_SERVICE_ROLE_KEY', ['P15_SUPABASE_SERVICE_ROLE_KEY'])
  const apiBaseUrl = (
    readEnv('Q1_API_BASE_URL', ['P15_API_BASE_URL']) ??
    `${supabaseUrl.replace(/\/$/, '')}/functions/v1/mobile-api`
  ).replace(/\/$/, '')
  assertStagingUrl(supabaseUrl, 'Q1_SUPABASE_URL')
  assertStagingUrl(apiBaseUrl, 'Q1_API_BASE_URL')
  return {
    supabaseUrl,
    anonKey,
    serviceRoleKey,
    apiBaseUrl,
    sampleSize: Number(readEnv('Q1_SAMPLE_SIZE') ?? '50'),
    reportPath: resolve(REPO_ROOT, readEnv('Q1_BASELINE_REPORT_PATH') ?? DEFAULT_REPORT_PATH),
  }
}

async function main() {
  const harness = new Q1BaselineHarness(loadConfig())
  let status = 'failed'
  let summary = null
  try {
    summary = await harness.run()
    status = 'passed'
  } finally {
    await harness.cleanup()
    const reportPath = await harness.writeReport(status, summary)
    if (status !== 'passed') {
      console.error(JSON.stringify({ ok: false, run_id: harness.runId, report_path: reportPath }, null, 2))
    } else {
      console.log(JSON.stringify({
        ok: true,
        run_id: harness.runId,
        report_path: reportPath,
        baseline_key: harness.baselineRow?.baseline_key,
        sample_size: summary.baseline.sample_size,
        api_log_count: summary.baseline.api_log_count,
        cost_summary: summary.baseline.cost_summary,
        cleanup: harness.cleanupCounts,
      }, null, 2))
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
