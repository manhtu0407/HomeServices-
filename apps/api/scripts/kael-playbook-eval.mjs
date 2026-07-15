#!/usr/bin/env node
// Playbook eval runner (SOP: docs/playbooks/process-distillation.md §6/§7).
// Sends each corpus case through the live electrical intake-diagnosis flow and
// scores the OBSERVED intake fields against the corpus expectations, so a
// before/after (baseline vs playbook-injected) delta is measurable.
//
// It never sets prices and never fabricates results: --mock replays canned
// responses so the scoring logic can be proven without live credentials; a real
// baseline requires a staging user bearer token (see --help).

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../../..')
const DEFAULT_CORPUS = resolve(REPO_ROOT, 'docs/playbooks/eval/electrical-cases.json')

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) return printHelp()

  const label = args.label ?? process.env.KAEL_PB_EVAL_LABEL ?? 'baseline'
  const serviceType = args.service ?? 'electrical'
  const corpusPath = args.corpus ?? process.env.KAEL_PB_EVAL_CORPUS ?? DEFAULT_CORPUS
  const reportPath = args.report ?? process.env.KAEL_PB_EVAL_REPORT_PATH ??
    resolve(REPO_ROOT, `docs/test-logs/${todayFromEnvOrArg(args)}_kael-playbook-${serviceType}-${label}.md`)
  const mockPath = args.mock ?? process.env.KAEL_PB_EVAL_MOCK ?? null

  const full = JSON.parse(await readFile(corpusPath, 'utf8'))
  if (!Array.isArray(full) || full.length === 0) throw new Error('corpus must be a non-empty array')
  // Kael chat is rate-limited (5/min + 20/hour per user). --delay spaces requests
  // under the per-minute cap; --offset/--limit run a window across hour-cap windows.
  const offset = args.offset ?? 0
  const corpus = args.limit != null ? full.slice(offset, offset + args.limit) : full.slice(offset)
  const delayMs = (args.delay ?? 0) * 1000

  const maxTurns = args.maxTurns ?? 3
  let caseRunner
  if (mockPath) {
    const mockPost = await mockTransport(mockPath)
    caseRunner = async (tc) => ({ response: await mockPost(tc.id), turns: 1 })
  } else {
    const post = livePost(await buildLiveConfig(), args.retryWait ?? Math.max(args.delay ?? 0, 30))
    caseRunner = async (tc) => runCaseLive(post, tc, serviceType, maxTurns)
  }

  const results = []
  for (let index = 0; index < corpus.length; index += 1) {
    const testCase = corpus[index]
    if (index > 0 && delayMs > 0) await sleep(delayMs)
    let observed
    let error = null
    let turns = 0
    try {
      const outcome = await caseRunner(testCase)
      turns = outcome.turns
      observed = observe(outcome.response)
    } catch (caught) {
      observed = emptyObserved()
      error = caught instanceof Error ? caught.message : String(caught)
    }
    results.push({ id: testCase.id, difficulty: testCase.difficulty, expected: testCase.expected, observed, error, turns })
  }

  const scored = results.map((result) => ({ ...result, score: scoreCase(result.expected, result.observed, result.error) }))
  const metrics = aggregate(scored)
  await writeReport({ reportPath, label, serviceType, corpusPath, mock: Boolean(mockPath), scored, metrics })

  console.log(JSON.stringify({
    label,
    mode: mockPath ? 'mock' : 'live',
    cases: scored.length,
    reportPath,
    metrics,
  }, null, 2))
}

// --- Observation: map the live {session, turns} response to intake fields ------

function observe(response) {
  const session = record(response?.session)
  const turns = Array.isArray(response?.turns) ? response.turns : []
  const last = turns.length > 0 ? record(turns[turns.length - 1]) : {}
  const status = str(session.status)
  const lastType = str(last.content_type)
  const estimate = record(session.estimate ?? last.estimate)
  const scope = record(session.diagnosis_scope)
  const facts = record(scope.facts)
  const safety = Array.isArray(facts.safety_signals) ? facts.safety_signals.filter((s) => typeof s === 'string') : []

  const declined = status === 'unsupported' || lastType === 'error'
  const needsClarification = lastType === 'clarification'
  let scopeSignal
  if (declined) {
    const text = str(last.text_content)
    scopeSignal = /quay lại chọn|nghiêng về dịch vụ|match .* service|select that service/i.test(text)
      ? 'service_mismatch'
      : 'out_of_scope'
  } else {
    scopeSignal = 'in_scope'
  }

  return {
    status: status ?? null,
    last_content_type: lastType ?? null,
    needs_clarification: needsClarification,
    scope_signal: scopeSignal,
    problem_slug: str(estimate.problem_category) ?? null,
    safety_signals: safety,
    // suggested_service is not exposed by the serialized API response; left null
    // and reported as not-observable rather than guessed.
    suggested_service: null,
  }
}

function emptyObserved() {
  return {
    status: null, last_content_type: null, needs_clarification: false,
    scope_signal: null, problem_slug: null, safety_signals: [], suggested_service: null,
  }
}

// --- Scoring -------------------------------------------------------------------

function scoreCase(expected, observed, error) {
  const fields = {}
  if (error) {
    return { pass: false, error: true, fields: {} }
  }
  // scope_signal: always gated
  fields.scope_signal = { gated: true, pass: observed.scope_signal === expected.scope_signal, expected: expected.scope_signal, observed: observed.scope_signal }

  // needs_clarification: gated when expected specifies a boolean
  if (typeof expected.needs_clarification === 'boolean') {
    fields.needs_clarification = { gated: true, pass: observed.needs_clarification === expected.needs_clarification, expected: expected.needs_clarification, observed: observed.needs_clarification }
  }

  // problem_slug: gated only when an in_scope slug is expected AND we did not expect a clarification turn
  if (expected.problem_slug && expected.scope_signal === 'in_scope' && expected.needs_clarification !== true) {
    fields.problem_slug = { gated: true, pass: observed.problem_slug === expected.problem_slug, expected: expected.problem_slug, observed: observed.problem_slug }
  } else if (expected.problem_slug) {
    fields.problem_slug = { gated: false, note: 'expected clarification/decline first', expected: expected.problem_slug, observed: observed.problem_slug }
  }

  // safety_signals: gated when the corpus expects at least one; expected ⊆ observed
  if (Array.isArray(expected.safety_signals) && expected.safety_signals.length > 0) {
    const missing = expected.safety_signals.filter((sig) => !observed.safety_signals.includes(sig))
    fields.safety_signals = { gated: true, pass: missing.length === 0, expected: expected.safety_signals, observed: observed.safety_signals, missing }
  }

  // suggested_service: reported, never gated (not observable via API)
  if (expected.suggested_service) {
    fields.suggested_service = { gated: false, note: 'not observable via API', expected: expected.suggested_service, observed: observed.suggested_service }
  }

  const gated = Object.values(fields).filter((f) => f.gated)
  const pass = gated.every((f) => f.pass)
  return { pass, error: false, fields }
}

function aggregate(scored) {
  const passed = scored.filter((s) => s.score.pass && !s.score.error).length
  const errored = scored.filter((s) => s.score.error).length
  const field = (name) => {
    const rows = scored.map((s) => s.score.fields[name]).filter((f) => f && f.gated)
    const ok = rows.filter((f) => f.pass).length
    return { gatedCases: rows.length, passed: ok, rate: rows.length ? round(ok / rows.length) : null }
  }
  return {
    overallPassRate: round(passed / scored.length),
    passed,
    total: scored.length,
    errored,
    byField: {
      scope_signal: field('scope_signal'),
      needs_clarification: field('needs_clarification'),
      problem_slug: field('problem_slug'),
      safety_signals: field('safety_signals'),
    },
    byDifficulty: ['easy', 'medium', 'hard'].reduce((acc, d) => {
      const rows = scored.filter((s) => s.difficulty === d)
      acc[d] = rows.length ? { total: rows.length, passed: rows.filter((s) => s.score.pass && !s.score.error).length } : { total: 0, passed: 0 }
      return acc
    }, {}),
  }
}

// --- Transports ----------------------------------------------------------------

// Drive one case as a real multi-turn conversation: open with the terse
// customer message, then — while Kael keeps asking to clarify — answer with the
// case's fuller `detail` (a customer who elaborates when asked). Stop when Kael
// produces an estimate, declines, or maxTurns is reached. Follow-up turns are
// NOT rate-limited server-side (only the create is), so this costs one create.
async function runCaseLive(post, testCase, serviceType, maxTurns) {
  let response = await post({
    service_type: serviceType,
    message: testCase.input_text_vi,
    problem_chips: [],
    client_request_id: randomUUID(),
  })
  let sessionId = response?.session?.id ?? null
  let turns = 1
  while (turns < maxTurns && sessionId && lastContentType(response) === 'clarification') {
    response = await post({
      service_type: serviceType,
      session_id: sessionId,
      message: testCase.detail ?? testCase.input_text_vi,
    })
    sessionId = response?.session?.id ?? sessionId
    turns += 1
  }
  return { response, turns }
}

function lastContentType(response) {
  const turns = Array.isArray(response?.turns) ? response.turns : []
  return turns.length ? (str(turns[turns.length - 1]?.content_type)) : null
}

function livePost(config, retryWaitSec = 30, maxAttempts = 5) {
  return async (request) => {
    let refreshedThisCall = false
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const response = await fetch(`${config.baseUrl}/kael/chat`, {
        method: 'POST',
        headers: {
          ...(config.anonKey ? { apikey: config.anonKey } : {}),
          Authorization: `Bearer ${config.bearerToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      })
      const text = await response.text()
      if (response.status === 401 && config.canRefresh && !refreshedThisCall) {
        // Token expired mid-run — re-sign-in once and retry with the new JWT.
        refreshedThisCall = true
        await config.refresh()
        continue
      }
      if (response.status === 429 && attempt < maxAttempts - 1) {
        // Ride the token-bucket refill (hour bucket = 1 token / 3 min). Wait the
        // larger of the server hint and the configured pace, so paced runs recover.
        const retryS = Number(response.headers.get('retry-after'))
        const waitSec = Math.max(Number.isFinite(retryS) && retryS > 0 ? retryS : 0, retryWaitSec)
        await sleep(Math.min(waitSec, 210) * 1000)
        continue
      }
      if (!response.ok) throw new Error(`http_${response.status}: ${text.slice(0, 160)}`)
      return text ? JSON.parse(text) : {}
    }
    throw new Error('http_429: rate limited after retries')
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function mockTransport(mockPath) {
  const mock = JSON.parse(await readFile(resolve(mockPath), 'utf8'))
  return async (id) => {
    if (!(id in mock)) throw new Error(`mock has no response for case ${id}`)
    return mock[id]
  }
}

// GoTrue password grant via fetch (no supabase-js → avoids its realtime/WebSocket
// init on Node < 22). Returns a fresh user JWT.
async function signInToken(supabaseUrl, anonKey, email, password) {
  const res = await fetch(`${supabaseUrl.replace(/\/+$/, '')}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || !body.access_token) {
    throw new Error(`sign-in failed (${res.status}): ${body.error_description ?? body.msg ?? body.error ?? 'no access_token'}`)
  }
  return body.access_token
}

async function buildLiveConfig() {
  const baseUrl = requireEnv('KAEL_PB_EVAL_MOBILE_API_URL').replace(/\/+$/, '')
  const anonKey = process.env.KAEL_PB_EVAL_ANON_KEY?.trim() || null
  const email = process.env.KAEL_PB_EVAL_EMAIL?.trim()
  const password = process.env.KAEL_PB_EVAL_PASSWORD
  const supabaseUrl = process.env.KAEL_PB_EVAL_SUPABASE_URL?.trim()
  const canRefresh = Boolean(email && password && supabaseUrl && anonKey)
  const config = {
    baseUrl,
    anonKey,
    bearerToken: process.env.KAEL_PB_EVAL_BEARER_TOKEN?.trim() || null,
    canRefresh,
    // The user JWT expires (~1h); a paced run outlives it. refresh() re-signs-in so
    // livePost can recover from a mid-run 401 instead of failing the tail of the run.
    async refresh() {
      if (!canRefresh) return false
      this.bearerToken = await signInToken(supabaseUrl, anonKey, email, password)
      return true
    },
  }
  if (!config.bearerToken) {
    if (!canRefresh) {
      throw new Error('Missing auth: set KAEL_PB_EVAL_BEARER_TOKEN, or KAEL_PB_EVAL_EMAIL + KAEL_PB_EVAL_PASSWORD + KAEL_PB_EVAL_SUPABASE_URL + KAEL_PB_EVAL_ANON_KEY (run with --help)')
    }
    await config.refresh()
  }
  return config
}

// --- Report --------------------------------------------------------------------

async function writeReport({ reportPath, label, serviceType, corpusPath, mock, scored, metrics }) {
  await mkdir(dirname(reportPath), { recursive: true })
  const pct = (v) => (v == null ? 'n/a' : `${Math.round(v * 1000) / 10}%`)
  const lines = [
    `# Kael Playbook Eval — ${serviceType} (${label})`,
    '',
    'Document type: playbook eval report',
    `Run mode: ${mock ? 'MOCK (dry-run — scoring logic only, NOT a live baseline)' : 'LIVE (staging intake-diagnosis)'}`,
    `Corpus: ${corpusPath.replace(REPO_ROOT + '/', '').replace(/\\/g, '/')}`,
    `Cases: ${metrics.total} (errored: ${metrics.errored})`,
    '',
    '## Metrics',
    '',
    '| Metric | Value |',
    '| --- | ---: |',
    `| overall pass rate | ${pct(metrics.overallPassRate)} (${metrics.passed}/${metrics.total}) |`,
    `| scope_signal | ${pct(metrics.byField.scope_signal.rate)} (${metrics.byField.scope_signal.passed}/${metrics.byField.scope_signal.gatedCases}) |`,
    `| needs_clarification | ${pct(metrics.byField.needs_clarification.rate)} (${metrics.byField.needs_clarification.passed}/${metrics.byField.needs_clarification.gatedCases}) |`,
    `| problem_slug | ${pct(metrics.byField.problem_slug.rate)} (${metrics.byField.problem_slug.passed}/${metrics.byField.problem_slug.gatedCases}) |`,
    `| safety_signals (recall) | ${pct(metrics.byField.safety_signals.rate)} (${metrics.byField.safety_signals.passed}/${metrics.byField.safety_signals.gatedCases}) |`,
    '',
    `By difficulty — easy ${metrics.byDifficulty.easy.passed}/${metrics.byDifficulty.easy.total}, medium ${metrics.byDifficulty.medium.passed}/${metrics.byDifficulty.medium.total}, hard ${metrics.byDifficulty.hard.passed}/${metrics.byDifficulty.hard.total}`,
    '',
    '## Per-case',
    '',
    '| id | diff | pass | expected slug/scope | observed slug/scope | needs_clar e/o | safety miss |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...scored.map((s) => {
      const e = s.expected
      const o = s.observed
      const clarE = typeof e.needs_clarification === 'boolean' ? e.needs_clarification : '-'
      const safetyMiss = s.score.fields.safety_signals && !s.score.fields.safety_signals.pass
        ? (s.score.fields.safety_signals.missing ?? []).join(',') : ''
      const mark = s.score.error ? 'ERR' : (s.score.pass ? 'PASS' : 'FAIL')
      return `| ${s.id} | ${s.difficulty} | ${mark} | ${e.problem_slug ?? '-'} / ${e.scope_signal} | ${o.problem_slug ?? '-'} / ${o.scope_signal ?? '-'} | ${clarE}/${o.needs_clarification} | ${safetyMiss} |`
    }),
    '',
    '## Notes',
    '',
    '- `suggested_service` is NOT gated: the serialized API response does not expose it, so it cannot be scored here; the mismatch decline is scored via `scope_signal` only.',
    '- `problem_slug` is gated only for in_scope cases that expect no clarification first; when the flow legitimately asks for clarification/evidence, the slug is not yet produced and is not penalized.',
    '- `safety_signals` scoring is recall (expected ⊆ observed); extra grounded signals do not fail a case.',
    mock
      ? '- MOCK run: proves the runner + scoring wiring only. Replace with a live run for a real baseline.'
      : '- LIVE run: numbers reflect the staging intake-diagnosis path with NO playbook injected (baseline) unless the label says otherwise.',
    '',
  ]
  await writeFile(reportPath, lines.join('\n') + '\n')
  // machine-readable sidecar so multiple rate-limit windows can be merged later
  await writeFile(reportPath.replace(/\.md$/, '.json'), JSON.stringify({ label, serviceType, metrics, scored }, null, 2) + '\n')
}

// --- helpers -------------------------------------------------------------------

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === '--help' || a === '-h') out.help = true
    else if (a === '--mock') out.mock = argv[++i]
    else if (a === '--label') out.label = argv[++i]
    else if (a === '--corpus') out.corpus = argv[++i]
    else if (a === '--report') out.report = argv[++i]
    else if (a === '--service') out.service = argv[++i]
    else if (a === '--date') out.date = argv[++i]
    else if (a === '--delay') out.delay = Number(argv[++i])
    else if (a === '--offset') out.offset = Number(argv[++i])
    else if (a === '--limit') out.limit = Number(argv[++i])
    else if (a === '--max-turns') out.maxTurns = Number(argv[++i])
    else if (a === '--retry-wait') out.retryWait = Number(argv[++i])
  }
  return out
}

function todayFromEnvOrArg(args) {
  return args.date ?? process.env.KAEL_PB_EVAL_DATE ?? 'undated'
}

function printHelp() {
  console.log(`kael-playbook-eval — run the playbook eval corpus through the live intake flow.

Dry-run (no credentials, proves scoring):
  node apps/api/scripts/kael-playbook-eval.mjs --mock apps/api/scripts/fixtures/kael-playbook-eval-mock.json --label mock --date 2026-07-14

Live baseline — option A, you already have a user JWT:
  KAEL_PB_EVAL_MOBILE_API_URL="https://<ref>.supabase.co/functions/v1/mobile-api" \\
  KAEL_PB_EVAL_ANON_KEY="<anon key>" \\
  KAEL_PB_EVAL_BEARER_TOKEN="<a signed-in staging user JWT>" \\
  node apps/api/scripts/kael-playbook-eval.mjs --label baseline --date 2026-07-14

Live baseline — option B, sign in on your machine (GoTrue password grant, no deps):
  KAEL_PB_EVAL_MOBILE_API_URL="https://<ref>.supabase.co/functions/v1/mobile-api" \\
  KAEL_PB_EVAL_SUPABASE_URL="https://<ref>.supabase.co" \\
  KAEL_PB_EVAL_ANON_KEY="<anon key>" \\
  KAEL_PB_EVAL_EMAIL="<staging test user email>" \\
  KAEL_PB_EVAL_PASSWORD="<password>" \\
  node apps/api/scripts/kael-playbook-eval.mjs --label baseline --date 2026-07-14

Env: KAEL_PB_EVAL_MOBILE_API_URL, then either KAEL_PB_EVAL_BEARER_TOKEN, or
KAEL_PB_EVAL_EMAIL + KAEL_PB_EVAL_PASSWORD + KAEL_PB_EVAL_SUPABASE_URL + KAEL_PB_EVAL_ANON_KEY.
Claude cannot mint or handle the token; a human runs the live command.
Flags: --mock <file>, --label <baseline|after|mock>, --corpus <path>, --report <path>, --service <name>, --date <YYYY-MM-DD>.`)
}

function requireEnv(name) {
  const v = process.env[name]?.trim()
  if (!v) throw new Error(`Missing required env: ${name} (run with --help)`)
  return v
}

function record(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function str(value) {
  return typeof value === 'string' ? value : null
}

function round(value, places = 4) {
  const f = 10 ** places
  return Math.round(Number(value || 0) * f) / f
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error)
  process.exitCode = 1
})
