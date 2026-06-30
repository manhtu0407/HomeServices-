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
const KAEL_PURPOSES = [
  'intent_classification',
  'vision_analysis',
  'clarification',
  'problem_synthesis',
  'market_lookup',
  'price_synthesis',
  'advisory_generation',
  'worker_brief',
  'scope_change',
  'post_job_learning',
  'educational_response',
]
const PURPOSE_ROUTES = {
  intent_classification: { provider: 'deepseek', model: 'deepseek-v4-flash' },
  vision_analysis: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  clarification: { provider: 'deepseek', model: 'deepseek-v4-flash' },
  problem_synthesis: { provider: 'deepseek', model: 'deepseek-v4-flash' },
  market_lookup: { provider: 'perplexity', model: 'sonar' },
  price_synthesis: { provider: 'perplexity', model: 'sonar' },
  advisory_generation: { provider: 'deepseek', model: 'deepseek-v4-flash' },
  worker_brief: { provider: 'deepseek', model: 'deepseek-v4-flash' },
  scope_change: { provider: 'anthropic', model: 'claude-sonnet-4-6' },
  post_job_learning: { provider: 'deepseek', model: 'deepseek-v4-flash' },
  educational_response: { provider: 'deepseek', model: 'deepseek-v4-flash' },
}
const PURPOSE_PROBE_SOURCE = 'q1_5_direct_provider_probe'
const DEFAULT_PHOTO_URL = 'https://placehold.co/64x64.jpg'

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
    const attempts = Number(readEnv('Q1_FETCH_RETRIES') ?? '2') + 1
    let lastError = null
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        return await fetch(url, { ...options, signal: controller.signal })
      } catch (error) {
        lastError = error
        if (attempt === attempts) throw error
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt))
      } finally {
        clearTimeout(timer)
      }
    }
    throw lastError
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
    await this.runPurposeProbes()
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
    const purposeCoverage = buildPurposeCoverage(apiLogs, jobs)
    const toneScore = scoreVietnameseTone(jobs)
    const avgReviewRating = await this.fetchAverageReviewRating()

    const baseline = {
      baseline_key: `${this.runId}-staging-${this.config.sampleSize}`,
      source: this.config.sampleSize === 50 ? 'staging_live_50' : 'manual',
      sample_size: this.config.sampleSize,
      job_count: jobs.length,
      api_log_count: apiLogs.length,
      schema_validation_rate: round(estimateValidCount / jobs.length, 4),
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
        baseline_version: 'q1.5',
        provider_success_rate: round(successCount / apiLogs.length, 4),
        purpose_coverage: purposeCoverage,
        provider_failure_pattern: buildProviderFailurePattern(apiLogs),
        purpose_probe_rows: apiLogs.filter((row) => row.safe_metadata?.source === PURPOSE_PROBE_SOURCE).length,
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
        photo_urls: this.config.usePhotos && index < Math.min(10, this.config.sampleSize)
          ? [DEFAULT_PHOTO_URL]
          : [],
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

  async runPurposeProbes() {
    if (!this.config.enablePurposeProbes) return
    assert(this.jobIds.length > 0, 'purpose probes require at least one fixture job')
    const rows = []
    for (let index = 0; index < KAEL_PURPOSES.length; index += 1) {
      const purpose = KAEL_PURPOSES[index]
      const route = PURPOSE_ROUTES[purpose]
      const result = await callPurposeProbe({
        purpose,
        route,
        providerKeys: this.config.providerKeys,
      })
      rows.push({
        job_id: this.jobIds[index % this.jobIds.length],
        request_id: `${this.runId}-purpose-probe`,
        purpose,
        provider: route.provider,
        model: route.model,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens,
        cost_usd: result.costUsd,
        latency_ms: result.latencyMs,
        success: result.success,
        error_code: result.errorCode,
        safe_metadata: {
          source: PURPOSE_PROBE_SOURCE,
          baseline_version: 'q1.5',
          direct_provider_call: true,
        },
      })
    }
    await must(this.admin.from('api_logs').insert(rows), 'insert purpose probe api logs')
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
        'kael_optimization_metrics',
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
      for (const table of ['jobs', 'job_events', 'job_broadcasts', 'kael_optimization_metrics', 'api_logs', 'notifications']) {
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

Plan.md section 24 live baseline/comparison measurement for Kael cost optimization.

## Evidence

- Sample jobs requested: ${this.config.sampleSize}
- Jobs created through Edge: ${baseline?.job_count ?? 0}
- Provider log rows measured: ${baseline?.api_log_count ?? 0}
- Schema validation rate: ${baseline?.schema_validation_rate ?? 'n/a'}
- Provider success rate: ${baseline?.safe_metadata?.provider_success_rate ?? 'n/a'}
- Vietnamese tone heuristic: ${baseline?.vietnamese_tone_score ?? 'n/a'}
- Advisory/estimate accuracy proxy: ${baseline?.advisory_accuracy_score ?? 'n/a'}
- Provider breakdown: ${baseline ? JSON.stringify(baseline.provider_breakdown) : 'n/a'}
- Purpose breakdown: ${baseline ? JSON.stringify(baseline.purpose_breakdown) : 'n/a'}
- Purpose coverage: ${baseline ? JSON.stringify(baseline.safe_metadata.purpose_coverage) : 'n/a'}
- Purpose probe rows: ${baseline?.safe_metadata?.purpose_probe_rows ?? 'n/a'}
- Provider failure pattern: ${baseline ? JSON.stringify(baseline.safe_metadata.provider_failure_pattern) : 'n/a'}
- Cost summary: ${baseline ? JSON.stringify(baseline.cost_summary) : 'n/a'}
- Cleanup counts: ${JSON.stringify(this.cleanupCounts)}

## Notes

- This harness does not toggle remote Edge feature flags; verify Supabase secrets and cache metrics separately.
- Q1.5 purpose probes are direct server-side provider calls tagged with \`${PURPOSE_PROBE_SOURCE}\`; they measure real provider availability for purposes not exposed by the current mobile workflow route.
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

function buildPurposeCoverage(apiLogs, jobs) {
  const estimateValidCount = jobs.filter((job) =>
    number(job.kael_price_min) > 0 && number(job.kael_price_max) >= number(job.kael_price_min)
  ).length
  return Object.fromEntries(KAEL_PURPOSES.map((purpose) => {
    const rows = apiLogs.filter((row) => row.purpose === purpose)
    const providers = [...new Set(rows.map((row) => row.provider).filter(Boolean))]
    return [
      purpose,
      {
        provider_logged: rows.length > 0,
        calls: rows.length,
        successes: rows.filter((row) => row.success === true).length,
        failures: rows.filter((row) => row.success !== true).length,
        providers,
        local_contract_observed: localPurposeContractObserved(purpose, jobs, estimateValidCount),
      },
    ]
  }))
}

function localPurposeContractObserved(purpose, jobs, estimateValidCount) {
  if (purpose === 'problem_synthesis' || purpose === 'price_synthesis') {
    return estimateValidCount === jobs.length
  }
  if (purpose === 'advisory_generation') {
    return jobs.some((job) => typeof job.kael_advisory === 'string' && job.kael_advisory.trim())
  }
  return false
}

function buildProviderFailurePattern(rows) {
  const failures = rows.filter((row) => row.success !== true)
  return {
    failure_count: failures.length,
    failure_rate: round(failures.length / Math.max(1, rows.length), 4),
    by_error_code: buildCountMap(failures, (row) => row.error_code ?? 'unknown'),
    by_purpose_provider: buildCountMap(failures, (row) => `${row.purpose ?? 'unknown'}:${row.provider ?? 'unknown'}`),
  }
}

function buildCountMap(rows, keyFn) {
  const counts = new Map()
  for (const row of rows) {
    const key = keyFn(row)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return Object.fromEntries([...counts.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))))
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

async function callPurposeProbe({ purpose, route, providerKeys }) {
  const apiKey = providerKeys[route.provider]
  if (!apiKey) throw new Error(`missing provider key for ${route.provider}`)
  const started = performance.now()
  try {
    const result = route.provider === 'anthropic'
      ? await callAnthropicProbe({ purpose, route, apiKey })
      : await callOpenAiCompatibleProbe({ purpose, route, apiKey })
    return {
      ...result,
      latencyMs: Math.round(performance.now() - started),
      success: true,
      errorCode: null,
    }
  } catch (error) {
    return {
      inputTokens: null,
      outputTokens: null,
      costUsd: null,
      latencyMs: Math.round(performance.now() - started),
      success: false,
      errorCode: error instanceof Error ? error.message.slice(0, 80) : 'AI_CALL_FAILED',
    }
  }
}

async function callAnthropicProbe({ purpose, route, apiKey }) {
  const response = await timeoutFetch(20_000)('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: route.model,
      max_tokens: 120,
      temperature: 0.2,
      system: purposeProbeSystem(purpose),
      messages: [{ role: 'user', content: purposeProbeUser(purpose) }],
    }),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`HTTP_${response.status}`)
  const data = text ? JSON.parse(text) : {}
  const inputTokens = number(data.usage?.input_tokens)
  const outputTokens = number(data.usage?.output_tokens)
  const isHaiku = route.model.includes('haiku')
  const inputRate = isHaiku ? 0.25 : 3
  const outputRate = isHaiku ? 1.25 : 15
  return {
    inputTokens,
    outputTokens,
    costUsd: round(inputTokens * (inputRate / 1_000_000) + outputTokens * (outputRate / 1_000_000), 6),
  }
}

async function callOpenAiCompatibleProbe({ purpose, route, apiKey }) {
  const isPerplexity = route.provider === 'perplexity'
  const response = await timeoutFetch(isPerplexity ? 20_000 : 12_000)(
    isPerplexity ? 'https://api.perplexity.ai/v1/sonar' : 'https://api.deepseek.com/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: route.model,
        max_tokens: 120,
        temperature: 0.2,
        ...(isPerplexity ? {} : {
          thinking: { type: 'disabled' },
          response_format: { type: 'json_object' },
        }),
        messages: [
          { role: 'system', content: purposeProbeSystem(purpose) },
          { role: 'user', content: purposeProbeUser(purpose) },
        ],
      }),
    },
  )
  const text = await response.text()
  if (!response.ok) throw new Error(`HTTP_${response.status}`)
  const data = text ? JSON.parse(text) : {}
  const inputTokens = number(data.usage?.prompt_tokens)
  const outputTokens = number(data.usage?.completion_tokens)
  const costUsd = isPerplexity
    ? inputTokens * (1 / 1_000_000) + outputTokens * (1 / 1_000_000)
    : inputTokens * (0.14 / 1_000_000) + outputTokens * (0.28 / 1_000_000)
  return {
    inputTokens,
    outputTokens,
    costUsd: round(costUsd, 6),
  }
}

function purposeProbeSystem(purpose) {
  return [
    'You are Kael, the Vietnamese NestScout assistant for electrical repair, plumbing repair, and home cleaning in Ho Chi Minh City apartments.',
    `Current purpose: ${purpose}.`,
    'Return compact JSON only. Do not include phone numbers, addresses, IDs, bank data, secrets, or provider internals.',
  ].join('\n')
}

function purposeProbeUser(purpose) {
  const shared = 'Scenario: customer reports a leaking sink in an apartment in District 7. Keep output short and safe.'
  const prompts = {
    intent_classification: `${shared} Classify service_type and problem_slug.`,
    vision_analysis: `${shared} Summarize visible/suspected issue as if a fixture photo was reviewed; avoid certainty.`,
    clarification: `${shared} Ask one missing-information question.`,
    problem_synthesis: `${shared} Summarize the problem in Vietnamese.`,
    market_lookup: `${shared} Provide a conservative market range with source summary wording.`,
    price_synthesis: `${shared} Produce a conservative estimate range from baseline and market context.`,
    advisory_generation: `${shared} Give one practical safety advisory.`,
    worker_brief: `${shared} Create a short worker brief with access and evidence notes.`,
    scope_change: `${shared} Worker says pipe inside cabinet also needs replacement; review scope change support.`,
    post_job_learning: `${shared} Produce sanitized aggregate learning notes only.`,
    educational_response: 'Customer asks how to shut off water safely before a plumber arrives. Answer briefly in Vietnamese.',
  }
  return prompts[purpose] ?? shared
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
  const providerKeys = {
    anthropic: readEnv('ANTHROPIC_API_KEY'),
    deepseek: readEnv('DEEPSEEK_API_KEY'),
    perplexity: readEnv('PERPLEXITY_API_KEY'),
  }
  const enablePurposeProbes = readEnv('Q1_PURPOSE_PROBES') !== '0'
  if (enablePurposeProbes) {
    for (const [provider, key] of Object.entries(providerKeys)) {
      if (!key) throw new Error(`Missing provider key for Q1 purpose probes: ${provider}`)
    }
  }
  return {
    supabaseUrl,
    anonKey,
    serviceRoleKey,
    apiBaseUrl,
    sampleSize: Number(readEnv('Q1_SAMPLE_SIZE') ?? '50'),
    reportPath: resolve(REPO_ROOT, readEnv('Q1_BASELINE_REPORT_PATH') ?? DEFAULT_REPORT_PATH),
    enablePurposeProbes,
    usePhotos: readEnv('Q1_USE_PHOTOS') !== '0',
    providerKeys,
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
