import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const read = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'))

const matrix = read('01-freeze/scenario-matrix.json')
const freeze = read('01-freeze/freeze-manifest.json')
const load = (snapshot) => ({
  matrix: read(`03-results/${snapshot}/matrix.json`),
  journey: read(`03-results/${snapshot}/journey.json`),
})
const data = { before: load('before'), after: load('after') }
for (const snapshot of ['before', 'after']) {
  for (const part of ['matrix', 'journey']) {
    if (data[snapshot][part].matrix_sha256 !== freeze.sha256) throw new Error(`${snapshot} ${part} was produced against a different matrix`)
  }
}

const runsOf = (snapshot, id, run) => {
  const all = [...data[snapshot].matrix.runs, ...data[snapshot].journey.runs]
  return all.find((entry) => entry.scenario === id && entry.run === run)
}

const scrub = (text) => String(text ?? '')
  .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
  .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, '<ts>')
function fingerprint(run) {
  if (run.checkpoints) return createHash('sha256').update(JSON.stringify(run.checkpoints.map((cp) => [cp.id, cp.result, scrub(cp.detail)]))).digest('hex').slice(0, 16)
  const material = run.variants.map((variant) => ({
    variant: variant.variant,
    blocked: Boolean(variant.blocked),
    steps: (variant.steps ?? []).map((step) => ({
      status: step.status, numbers: step.numbers, q: step.questionAsked,
      kael: step.kaelTurns.map((turn) => [turn.content_type, scrub(turn.text), turn.emergency_route]),
      providers: step.providerCalls, business: step.businessAction, error: scrub(step.errorText),
      session: step.session && { ...step.session },
    })),
    assertions: Object.fromEntries(Object.entries(variant.assertions ?? {}).map(([id, a]) => [id, a.pass])),
  }))
  return createHash('sha256').update(JSON.stringify(material)).digest('hex').slice(0, 16)
}

const passMap = (run) => {
  if (run.checkpoints) {
    return Object.fromEntries(run.checkpoints.filter((cp) => cp.expected === 'PASS').map((cp) => [cp.id, cp.result === 'PASS' ? 'PASS' : cp.result === 'BLOCKED' ? 'BLOCKED' : 'FAIL']))
  }
  const out = {}
  for (const variant of run.variants) {
    for (const [id, a] of Object.entries(variant.assertions ?? {})) {
      const key = run.variants.length > 1 ? `${variant.variant}/${id}` : id
      out[key] = variant.blocked ? 'BLOCKED' : a.pass ? 'PASS' : 'FAIL'
    }
    if (variant.blocked) out[`${variant.variant}/harness`] = 'BLOCKED'
  }
  return out
}

const UNVERIFIED = {
  S1: 'Question relevance and wording are deterministic fallbacks here; model-written replies were not exercised (providers stubbed).',
  S2: 'Whether a live model would ask a better clarifying question is unverified; only the deterministic server path ran.',
  S3: 'Recall on wording nobody has seen is not measured by authored phrases.',
  S4: 'Understanding of the customer correction is unverified (classifier scripted); only persistence, ordering and the final safety turn are measured.',
  S5: 'J03 needs PostgreSQL (T1); J14 payment rail and J15 atomicity/RLS/concurrency are BLOCKED at T0; UI rendering of stages is T3.',
  C: 'Exactly-once writes need an idempotency key and PostgreSQL (T1); guidance carried in an error response is not rendered by the shipped client.',
}

const ATTRIBUTION = {
  emergency_escalated_acceptable: 'KAWA_01 emergency gate: domains/kael-chat/emergency-turn.ts + kael-guardrails/emergency-guidance.ts + emergency-signal-text.ts (all new in KAWA_01), wired from turn.ts, create.ts, evidence.ts, intake-confirmation.service.ts',
  http_ok: 'KAWA_01 schedule-refusal bypass: domains/kael-chat/turn.ts and create.ts answer an emergency before the invalid-schedule 400',
  failure_observable: 'KAWA_01 emergency write-failure trace: platform/turn-trace.ts + emergency-turn.ts emergencyWriteFailure',
  recovery_delivers: 'KAWA_01 stranded-turn recovery and guidance replay: domains/kael-chat/session-store.ts + emergency-turn.ts',
  J04: 'KAWA_01 D-03 customer-only guard: domains/kael-chat/intake-confirmation.service.ts',
  J05: 'KAWA_01 D-03 customer-only guard: domains/kael-chat/evidence.ts',
  J11: 'KAWA_01 D-04 worker-only guard: domains/matching/accept.ts and decline.ts',
}

const scenarios = []
for (const scenario of matrix.scenarios) {
  const b1 = runsOf('before', scenario.id, 1)
  const b2 = runsOf('before', scenario.id, 2)
  const a1 = runsOf('after', scenario.id, 1)
  const a2 = runsOf('after', scenario.id, 2)
  const bMap = passMap(b1)
  const aMap = passMap(a1)
  const improved = []
  const regressed = []
  const unchangedFail = []
  for (const id of new Set([...Object.keys(bMap), ...Object.keys(aMap)])) {
    const b = bMap[id]
    const a = aMap[id]
    if (b !== 'PASS' && a === 'PASS') improved.push(id)
    else if (b === 'PASS' && a !== 'PASS') regressed.push(id)
    else if (b !== 'PASS' && a !== 'PASS') unchangedFail.push(`${id}:${b}->${a}`)
  }
  const classification = regressed.length ? 'REGRESSED' : improved.length ? 'IMPROVED' : 'UNCHANGED'
  const markers = []
  if (a1.variants) {
    for (const variant of a1.variants) for (const step of variant.steps ?? []) {
      for (const turn of step.kaelTurns) if (turn.emergency_route) markers.push(`emergency_route=${turn.emergency_route}`)
      for (const trace of step.traceLines) if (trace.outcome?.startsWith('emergency_')) markers.push(`trace.outcome=${trace.outcome}`)
    }
  }
  const attribution = improved.map((id) => {
    const key = id.includes('/') ? id.split('/')[1] : id
    const owner = ATTRIBUTION[key]
    const evidenceMarker = a1.checkpoints ? 'refusal that the BEFORE source cannot produce (BEFORE accepted the same call)' : [...new Set(markers)].join(', ') || 'none captured'
    return { assertion: id, kawa01_owner: owner ?? 'not attributed', execution_path_marker: evidenceMarker, attributable: Boolean(owner) && evidenceMarker !== 'none captured' }
  })
  scenarios.push({
    id: scenario.id,
    service: scenario.service,
    class: scenario.class,
    title: scenario.title,
    before: { verdict: b1.verdict, deterministic: fingerprint(b1) === fingerprint(b2), fingerprint: fingerprint(b1) },
    after: { verdict: a1.verdict, deterministic: fingerprint(a1) === fingerprint(a2), fingerprint: fingerprint(a1) },
    classification,
    improved,
    regressed,
    failing_in_both: unchangedFail,
    attribution,
    unverified_at_t0: UNVERIFIED[scenario.class],
    before_failures: Object.entries(bMap).filter(([, v]) => v !== 'PASS').map(([k, v]) => `${k}:${v}`),
    after_failures: Object.entries(aMap).filter(([, v]) => v !== 'PASS').map(([k, v]) => `${k}:${v}`),
  })
}

const stepsOf = (snapshot) => data[snapshot].matrix.runs.filter((run) => run.run === 1).flatMap((run) => run.variants.flatMap((variant) => (variant.steps ?? []).map((step) => ({ scenario: run.scenario, variant: variant.variant, step, def: matrix.scenarios.find((entry) => entry.id === run.scenario).steps.find((s) => s.id === step.id) }))))
function aggregate(snapshot) {
  const all = stepsOf(snapshot)
  const hazard = all.filter((entry) => entry.def.hazard)
  const calm = all.filter((entry) => !entry.def.hazard)
  const policy = matrix.route_policy.required_numbers
  const has = (numbers, route) => (policy[route] ?? []).length > 0 && policy[route].every((n) => numbers.includes(n))
  const exact = (entry) => has(entry.step.numbers, entry.def.route)
  const acceptable = (entry) => exact(entry) || (entry.def.also_accept_routes ?? []).some((route) => has(entry.step.numbers, route)) || entry.step.numbers.includes('112')
  const anyRequired = new Set(Object.values(policy).flat())
  const bypass = (entry) => !entry.step.numbers.some((n) => anyRequired.has(n)) && (entry.step.providerCalls.length > 0 || entry.step.questionAsked || entry.step.status === 200 || entry.step.status === 201)
  const businessByScenario = new Set(all.filter((entry) => entry.step.businessAction.length > 0).map((entry) => entry.scenario))
  const traceOutcomes = {}
  for (const entry of all) for (const trace of entry.step.traceLines) traceOutcomes[trace.outcome ?? 'none'] = (traceOutcomes[trace.outcome ?? 'none'] ?? 0) + 1
  const evidenceSteps = all.filter((entry) => entry.def.voice_transcript && !entry.def.hazard)
  const evidenceHandled = data[snapshot].matrix.runs.filter((run) => run.run === 1 && matrix.scenarios.find((s) => s.id === run.scenario).gating.includes('evidence_handled')).map((run) => run.variants[0].assertions.evidence_handled.pass)
  const stateConsistent = data[snapshot].matrix.runs.filter((run) => run.run === 1).flatMap((run) => run.variants.map((variant) => variant.all_assertions_state ?? null))
  const stateRuns = data[snapshot].matrix.runs.filter((run) => run.run === 1 && matrix.scenarios.find((s) => s.id === run.scenario).gating.includes('state_consistent'))
  const stateOk = stateRuns.filter((run) => run.variants.every((variant) => variant.assertions.state_consistent?.pass)).length
  return {
    hazard_steps: hazard.length,
    detected_any_number: hazard.filter((entry) => entry.step.numbers.length > 0).length,
    escalated_acceptable: hazard.filter(acceptable).length,
    route_exact: hazard.filter(exact).length,
    delivered_via_2xx: hazard.filter((entry) => entry.step.status >= 200 && entry.step.status < 300 && acceptable(entry)).length,
    gate_bypass: hazard.filter((entry) => !acceptable(entry) && bypass(entry)).length,
    missed_hazards: hazard.filter((entry) => !acceptable(entry)).map((entry) => `${entry.scenario}/${entry.variant}/${entry.step.id}`),
    model_before_safety_on_acceptable_hazards: hazard.filter((entry) => acceptable(entry) && entry.step.providerCalls.length > 0).length,
    non_hazard_steps: calm.length,
    false_emergency_steps: calm.filter((entry) => entry.step.numbers.some((n) => anyRequired.has(n)) || entry.step.kaelTurns.some((turn) => turn.emergency_route)).length,
    scenarios_with_business_action: [...businessByScenario],
    trace_outcomes: traceOutcomes,
    evidence_steps_with_gating: evidenceHandled.length,
    evidence_handled_true: evidenceHandled.filter(Boolean).length,
    state_consistent_scenarios: `${stateOk}/${stateRuns.length}`,
    wrong_out_of_scope_declines: all.filter((entry) => entry.step.kaelTurns.some((turn) => /nằm ngoài phạm vi sáu nhóm|outside the six home-service/.test(turn.text))).map((entry) => `${entry.scenario}/${entry.step.id}`),
    non_2xx_steps: all.filter((entry) => !(entry.step.status >= 200 && entry.step.status < 300)).map((entry) => `${entry.scenario}/${entry.variant}/${entry.step.id}:${entry.step.status}`),
  }
}

const counts = (rows, key) => rows.reduce((acc, row) => { acc[row[key]] = (acc[row[key]] ?? 0) + 1; return acc }, {})
const out = {
  schema: 'nestscout.diagnostic_comparison.v1',
  matrix_sha256: freeze.sha256,
  generated_utc: new Date().toISOString(),
  executions_scored: scenarios.length * 2,
  executions_repeated_for_determinism: scenarios.length * 2,
  classification_counts: counts(scenarios, 'classification'),
  verdict_counts: { before: counts(scenarios.map((s) => ({ v: s.before.verdict })), 'v'), after: counts(scenarios.map((s) => ({ v: s.after.verdict })), 'v') },
  nondeterministic: scenarios.filter((s) => !s.before.deterministic || !s.after.deterministic).map((s) => `${s.id}(before=${s.before.deterministic},after=${s.after.deterministic})`),
  aggregate: { before: aggregate('before'), after: aggregate('after') },
  scenarios,
}
mkdirSync(join(root, '03-results'), { recursive: true })
writeFileSync(join(root, '03-results/comparison.json'), `${JSON.stringify(out, null, 2)}\n`)
console.log(JSON.stringify({ classification_counts: out.classification_counts, verdict_counts: out.verdict_counts, nondeterministic: out.nondeterministic, executions: out.executions_scored }, null, 1))
console.log(JSON.stringify(out.aggregate, null, 1))
