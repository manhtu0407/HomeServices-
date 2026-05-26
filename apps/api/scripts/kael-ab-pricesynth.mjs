import { createClient } from '@supabase/supabase-js'
import { performance } from 'node:perf_hooks'

const STAGING_REF = 'xyylanuyflrjzbjzhqfl'
const PRODUCTION_REF = 'iwevizmsedyqozxlawwl'
const EXPERIMENT_KEY = 'p17-price-synthesis-perplexity-vs-anthropic-2026-05-26'
const PASSWORD = 'F26-ab-pricesynth-Temp-12345!'
const SAMPLE_TARGET = 100
const CONCURRENCY = 4

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

async function must(query, label) {
  const { data, error } = await query
  if (error) throw new Error(`${label}: ${error.message}`)
  return data
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

class PriceSynthesisAbRunner {
  constructor(config) {
    this.config = config
    this.admin = createSupabase(config.supabaseUrl, config.serviceRoleKey)
    this.runId = `f26-ab-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`
    this.userIds = []
    this.timings = []
  }

  async run() {
    const experiment = await this.verifyExperiment()
    const adminActor = await this.createAdmin()
    const cases = await this.buildCases()
    const evaluations = await mapLimit(cases, CONCURRENCY, async (abCase, index) => {
      const started = performance.now()
      const evaluation = await this.evaluateCase(adminActor, abCase)
      this.timings.push(performance.now() - started)
      return this.toCaseRow(experiment.id, abCase, evaluation, index)
    })
    await this.persistRows(evaluations)
    const metrics = computeMetrics(evaluations)
    const decision = thresholdDecision(metrics)
    await this.updateExperiment(experiment.id, metrics, decision)
    const dashboard = await this.fetchDashboard(experiment.id)
    return {
      status: 'passed',
      runId: this.runId,
      experiment: {
        id: experiment.id,
        key: experiment.experiment_key,
        sample_target: experiment.sample_target,
      },
      cases: {
        generated: cases.length,
        persisted: evaluations.length,
        split: {
          perplexity_primary: evaluations.filter((row) => row.safe_metadata.arm === 'perplexity_primary').length,
          anthropic_shadow: evaluations.filter((row) => row.safe_metadata.arm === 'anthropic_shadow').length,
        },
      },
      metrics,
      decision,
      dashboard,
      timings: {
        count: this.timings.length,
        maxMs: Math.round(Math.max(...this.timings, 0)),
        avgMs: Math.round(this.timings.reduce((sum, value) => sum + value, 0) / Math.max(this.timings.length, 1)),
      },
    }
  }

  async verifyExperiment() {
    const experiment = await must(
      this.admin
        .from('kael_ab_experiments')
        .select('id, experiment_key, purpose, status, primary_provider, comparison_provider, sample_target, metric_thresholds')
        .eq('experiment_key', EXPERIMENT_KEY)
        .single(),
      'fetch A/B experiment',
    )
    assert(experiment.purpose === 'price_synthesis', 'experiment purpose must be price_synthesis')
    assert(experiment.primary_provider === 'perplexity', 'experiment primary provider must be perplexity')
    assert(experiment.comparison_provider === 'anthropic', 'experiment comparison provider must be anthropic')
    assert(experiment.sample_target === SAMPLE_TARGET, `sample target must be ${SAMPLE_TARGET}`)
    return experiment
  }

  async createAdmin() {
    const email = `${this.runId}-admin@f26.ab.test`
    const { data, error } = await this.admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { role: 'admin', full_name: 'F26 A/B Admin' },
    })
    if (error || !data.user) throw new Error(`create admin user: ${error?.message}`)
    const id = data.user.id
    this.userIds.push(id)
    await must(
      this.admin.from('profiles').upsert({
        id,
        role: 'admin',
        full_name: 'F26 A/B Admin',
      }),
      'admin profile upsert',
    )
    const client = createSupabase(this.config.supabaseUrl, this.config.anonKey)
    const signedIn = await client.auth.signInWithPassword({ email, password: PASSWORD })
    if (signedIn.error || !signedIn.data.session) {
      throw new Error(`sign in admin: ${signedIn.error?.message}`)
    }
    return { id, accessToken: signedIn.data.session.access_token }
  }

  async buildCases() {
    const problems = await must(
      this.admin
        .from('service_problems')
        .select('id, service_type, slug')
        .eq('is_active', true),
      'fetch service problems',
    )
    const problemById = new Map(problems.map((item) => [item.id, item]))
    const baselines = await must(
      this.admin
        .from('price_baselines')
        .select('service_type, service_problem_id, complexity, district_code, price_min, price_max')
        .order('service_type')
        .order('service_problem_id')
        .order('complexity'),
      'fetch price baselines',
    )
    const eligible = baselines
      .map((baseline) => ({ baseline, problem: problemById.get(baseline.service_problem_id) }))
      .filter((item) =>
        item.problem &&
        ['electrical', 'plumbing', 'cleaning'].includes(item.baseline.service_type) &&
        ['small', 'medium', 'large'].includes(item.baseline.complexity) &&
        Number(item.baseline.price_min) > 0 &&
        Number(item.baseline.price_max) >= Number(item.baseline.price_min)
      )
    assert(eligible.length > 0, 'no eligible baselines for A/B cases')

    return Array.from({ length: SAMPLE_TARGET }, (_, index) => {
      const item = eligible[index % eligible.length]
      const seed = index + 1
      const baselineMin = Number(item.baseline.price_min)
      const baselineMax = Number(item.baseline.price_max)
      const marketMin = roundToThousand(baselineMin * (0.85 + (seed % 7) * 0.03))
      const marketMax = roundToThousand(baselineMax * (0.96 + (seed % 9) * 0.025))
      const actual = fixtureActualPrice({
        baselineMin,
        baselineMax,
        marketMin,
        marketMax,
        complexity: item.baseline.complexity,
      })
      return {
        case_key: `f26-ab-20260526-${String(index + 1).padStart(3, '0')}`,
        service_type: item.baseline.service_type,
        problem_slug: item.problem.slug,
        district_code: item.baseline.district_code,
        complexity: item.baseline.complexity,
        baseline_min: baselineMin,
        baseline_max: baselineMax,
        market_range_min: Math.min(marketMin, marketMax),
        market_range_max: Math.max(marketMin, marketMax),
        market_confidence: Math.round((0.62 + (seed % 5) * 0.05) * 100) / 100,
        actual_final_price: actual,
      }
    })
  }

  async evaluateCase(actor, abCase) {
    const response = await timeoutFetch(30_000, `${this.config.apiBaseUrl}/admin/kael-ab/price-synthesis`, {
      method: 'POST',
      headers: {
        apikey: this.config.anonKey,
        Authorization: `Bearer ${actor.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(abCase),
    })
    const text = await response.text()
    const json = text ? JSON.parse(text) : {}
    if (!response.ok) {
      throw new Error(`A/B case ${abCase.case_key} failed ${response.status}: ${JSON.stringify(json)}`)
    }
    return json
  }

  toCaseRow(experimentId, abCase, evaluation, index) {
    return {
      experiment_id: experimentId,
      case_key: abCase.case_key,
      job_id: null,
      request_id: `${this.runId}-${String(index + 1).padStart(3, '0')}`,
      source: 'manual_shadow',
      status: 'completed',
      service_type: abCase.service_type,
      problem_slug: abCase.problem_slug,
      district_code: abCase.district_code,
      perplexity_schema_valid: evaluation.perplexity.schema_valid,
      anthropic_schema_valid: evaluation.anthropic.schema_valid,
      perplexity_price_min: evaluation.perplexity.price_min,
      perplexity_price_max: evaluation.perplexity.price_max,
      anthropic_price_min: evaluation.anthropic.price_min,
      anthropic_price_max: evaluation.anthropic.price_max,
      actual_final_price: abCase.actual_final_price,
      fallback_used: evaluation.fallback_used,
      exclusion_reason: null,
      safe_metadata: {
        run_id: this.runId,
        arm: index % 2 === 0 ? 'perplexity_primary' : 'anthropic_shadow',
        seed_index: index + 1,
        actual_price_source: 'manual_shadow_fixture_proxy',
        input: abCase,
        provider_eval: {
          perplexity: safeProviderMetadata(evaluation.perplexity),
          anthropic: safeProviderMetadata(evaluation.anthropic),
        },
      },
    }
  }

  async persistRows(rows) {
    const { error } = await this.admin
      .from('kael_ab_price_synthesis_cases')
      .upsert(rows, { onConflict: 'experiment_id,case_key' })
    if (error) throw new Error(`persist A/B cases: ${error.message}`)
  }

  async updateExperiment(experimentId, metrics, decision) {
    const { data: existing } = await this.admin
      .from('kael_ab_experiments')
      .select('safe_metadata')
      .eq('id', experimentId)
      .single()
    const safeMetadata = {
      ...(existing?.safe_metadata ?? {}),
      f26_runner: {
        run_id: this.runId,
        completed_at: new Date().toISOString(),
        metrics,
        decision,
        actual_price_source: 'manual_shadow_fixture_proxy',
      },
    }
    const { error } = await this.admin
      .from('kael_ab_experiments')
      .update({
        status: 'completed',
        ended_at: new Date().toISOString(),
        safe_metadata: safeMetadata,
      })
      .eq('id', experimentId)
    if (error) throw new Error(`update experiment: ${error.message}`)
  }

  async fetchDashboard(experimentId) {
    const rows = await must(
      this.admin
        .from('kael_monitoring_ab_price_synthesis')
        .select('*')
        .eq('experiment_id', experimentId),
      'fetch A/B dashboard',
    )
    return rows[0] ?? null
  }

  async cleanup() {
    for (const userId of this.userIds) {
      await this.admin.from('profiles').delete().eq('id', userId)
      const { error } = await this.admin.auth.admin.deleteUser(userId)
      if (error) throw new Error(`delete admin user: ${error.message}`)
    }
  }
}

function safeProviderMetadata(provider) {
  return {
    provider: provider.provider,
    model: provider.model,
    schema_valid: provider.schema_valid,
    failure_reason: provider.failure_reason,
    input_tokens: provider.input_tokens,
    output_tokens: provider.output_tokens,
    cost_usd: provider.cost_usd,
    latency_ms: provider.latency_ms,
  }
}

function computeMetrics(rows) {
  const completed = rows.filter((row) => row.status === 'completed')
  const schemaValid = completed.filter((row) => row.perplexity_schema_valid === true)
  const anthDeviations = completed
    .filter((row) => row.perplexity_price_max && row.anthropic_price_max)
    .map((row) => Math.abs(row.perplexity_price_max - row.anthropic_price_max) / row.anthropic_price_max)
  const actualDeviations = completed
    .filter((row) => row.perplexity_price_max && row.actual_final_price)
    .map((row) => Math.abs(row.perplexity_price_max - row.actual_final_price) / row.actual_final_price)
  const fallbackCount = completed.filter((row) => row.fallback_used).length
  return {
    completed_cases: completed.length,
    schema_validation_rate: round(schemaValid.length / Math.max(completed.length, 1), 4),
    price_range_deviation_vs_anthropic: round(avg(anthDeviations), 4),
    price_range_deviation_vs_actual: round(avg(actualDeviations), 4),
    fallback_rate: round(fallbackCount / Math.max(completed.length, 1), 4),
  }
}

function thresholdDecision(metrics) {
  const failed = [
    metrics.schema_validation_rate < 0.95,
    metrics.price_range_deviation_vs_anthropic > 0.25,
    metrics.price_range_deviation_vs_actual > 0.30,
    metrics.fallback_rate > 0.10,
  ].filter(Boolean).length
  return {
    failed_metric_count: failed,
    threshold_decision: failed >= 2 ? 'reject_perplexity' : 'keep_perplexity',
  }
}

function fixtureActualPrice(input) {
  const multiplier = input.complexity === 'large'
    ? 1.2
    : input.complexity === 'small'
      ? 0.85
      : 1
  const min = (input.marketMin * 0.6 + input.baselineMin * 0.4) * multiplier
  const max = (input.marketMax * 0.6 + input.baselineMax * 0.4) * multiplier
  return roundToThousand((min + max) / 2)
}

function roundToThousand(value) {
  return Math.max(50000, Math.round(value / 1000) * 1000)
}

function avg(values) {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function round(value, digits) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await mapper(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

function loadConfig() {
  if (process.env.F26_RUN_AB_PRICESYNTH !== '1') {
    throw new Error('Set F26_RUN_AB_PRICESYNTH=1 to run the mutable staging price_synthesis A/B runner.')
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
  assertStagingUrl(supabaseUrl, 'F26_SUPABASE_URL')
  assertStagingUrl(apiBaseUrl, 'F26_API_BASE_URL')
  return { supabaseUrl, anonKey, serviceRoleKey, apiBaseUrl }
}

const runner = new PriceSynthesisAbRunner(loadConfig())
let output
try {
  output = await runner.run()
} catch (error) {
  output = {
    status: 'failed',
    runId: runner.runId,
    error: error instanceof Error ? error.message : String(error),
  }
  process.exitCode = 1
} finally {
  await runner.cleanup().catch((error) => {
    output = {
      ...(output ?? {}),
      cleanup_error: error instanceof Error ? error.message : String(error),
    }
    process.exitCode = 1
  })
}

console.log(JSON.stringify(output, null, 2))
