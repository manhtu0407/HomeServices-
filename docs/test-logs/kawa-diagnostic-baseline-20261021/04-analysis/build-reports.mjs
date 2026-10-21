import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const read = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'))
const matrix = read('01-freeze/scenario-matrix.json')
const comparison = read('03-results/comparison.json')
const h5 = read('05-h5/h5-row-diagnosis.json')
const probes = read('05-h5/probes-after.json').results
const flagsAfter = read('03-results/supplementary/flags-on-after.json')
const flagsBefore = read('03-results/supplementary/flags-on-before.json')
const suppAfter = read('03-results/supplementary/suppC6b-after.json')
const suppBefore = read('03-results/supplementary/suppC6b-before.json')

const esc = (value) => String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ')
const clip = (value, n) => (String(value).length > n ? `${String(value).slice(0, n - 1)}…` : String(value))
const table = (header, rows) => [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`, ...rows.map((row) => `| ${row.map(esc).join(' | ')} |`)].join('\n')

const inputSummary = (scenario) => {
  if (scenario.kind === 'journey') return '15 checkpoints (J01-J15)'
  const steps = scenario.steps
  const first = steps.find((step) => step.message || step.voice_transcript)
  const voice = steps.some((step) => step.voice_transcript) ? ' +voice' : ''
  const variants = scenario.variants ? ` x${scenario.variants.length} closed statuses` : ''
  const hazard = steps.filter((step) => step.hazard).map((step) => `${step.route}`).join('/')
  return `${clip(first.message ?? first.voice_transcript, 64)}${voice}${variants}${steps.length > 1 ? ` (${steps.length} steps)` : ''}${hazard ? ` [hazard: ${hazard}]` : ''}`
}
const scenarioRows = comparison.scenarios.map((entry) => {
  const def = matrix.scenarios.find((scenario) => scenario.id === entry.id)
  return [
    entry.id, entry.service, entry.class, inputSummary(def), entry.before.verdict, entry.after.verdict, entry.classification,
    entry.after_failures.length ? entry.after_failures.join(', ') : 'none',
  ]
})
const T_SCENARIOS = table(['ID', 'Service', 'Class', 'Frozen input (abridged)', 'BEFORE', 'AFTER', 'Change', 'AFTER failures'], scenarioRows)

const agg = comparison.aggregate
const pct = (k, n) => (n === 0 ? 'n/a' : `${k}/${n}`)
const T_MEASURES = table(['Measure (T0, deterministic layer, providers stubbed)', 'BEFORE', 'AFTER', 'Classification'], [
  ['1a. Hazard steps where an acceptable emergency number was named', pct(agg.before.escalated_acceptable, agg.before.hazard_steps), pct(agg.after.escalated_acceptable, agg.after.hazard_steps), 'IMPROVED'],
  ['1b. ...of which the exact route for that hazard', pct(agg.before.route_exact, agg.before.hazard_steps), pct(agg.after.route_exact, agg.after.hazard_steps), 'IMPROVED'],
  ['1c. ...delivered in a 2xx response (the rest travel in an error envelope; AFTER adds a structured `emergency` field there that the shipped client reads, P418 29/29 run here; BEFORE has nothing)', pct(agg.before.delivered_via_2xx, agg.before.hazard_steps), pct(agg.after.delivered_via_2xx, agg.after.hazard_steps), 'IMPROVED'],
  ['2. False emergency classifications on non-hazard steps', pct(agg.before.false_emergency_steps, agg.before.non_hazard_steps), pct(agg.after.false_emergency_steps, agg.after.non_hazard_steps), 'UNCHANGED (0 in both; n=30 is too small to bound a rate)'],
  ['3. Safety-gate bypass (hazard processed as an ordinary request)', pct(agg.before.gate_bypass, agg.before.hazard_steps), pct(agg.after.gate_bypass, agg.after.hazard_steps), 'IMPROVED'],
  ['3b. Hazard answered correctly but a provider was still called', pct(agg.before.model_before_safety_on_acceptable_hazards, agg.before.escalated_acceptable || 0), pct(agg.after.model_before_safety_on_acceptable_hazards, agg.after.escalated_acceptable), 'by design for wiring/water advice (intake continues)'],
  ['4. Scenarios with an unauthorised business action (Job, quote, match, payment, consent)', `${agg.before.scenarios_with_business_action.length}/36`, `${agg.after.scenarios_with_business_action.length}/36`, 'UNCHANGED (none)'],
  ['5. Voice transcript persisted as Case evidence (S4)', pct(agg.before.evidence_handled_true, agg.before.evidence_steps_with_gating), pct(agg.after.evidence_handled_true, agg.after.evidence_steps_with_gating), 'UNCHANGED (the one failure is a closed Case in both)'],
  ['6a. Case counters consistent at scenario end', agg.before.state_consistent_scenarios, agg.after.state_consistent_scenarios, 'UNCHANGED'],
  ['6b. Customer-only decisions refused to an admin (J04, J05) and worker-only accept/decline refused to an admin (J11)', '0/3', '3/3', 'IMPROVED'],
  ['7. Emergency trace outcomes emitted in scored runs', JSON.stringify(agg.before.trace_outcomes), JSON.stringify(agg.after.trace_outcomes), 'IMPROVED (BEFORE emits none)'],
  ['8. Persistent write failure leaves a warn/error trace and the retry delivers guidance (SUPP-C6b)', 'no / no', 'yes / yes', 'IMPROVED'],
  ['8b. A failed write that the customer retries stores the customer turn twice (SUPP-C6b: customer turns written across the two attempts)', '2 (no reply stored)', '1 (stranded turn reused, one reply)', 'IMPROVED'],
  ['8c. Two identical messages that both succeed', 'two customer turns', 'two customer turns', 'UNCHANGED (no idempotency key; exactly-once needs T1 and an RPC)'],
])

const verdictFor = (snapshot, service) => {
  const rows = comparison.scenarios.filter((entry) => entry.service === service && entry.class !== 'C')
  const verdicts = rows.map((entry) => entry[snapshot].verdict)
  return verdicts.includes('FAIL') ? 'FAIL' : verdicts.includes('BLOCKED') ? 'BLOCKED' : 'PASS'
}
const SERVICES = [['electrical', 'Electrical'], ['plumbing', 'Plumbing'], ['cleaning', 'Cleaning'], ['hvac', 'Air conditioning (HVAC)'], ['upholstery', 'Sofa/mattress/curtain/carpet'], ['handyman', 'Minor repair/installation']]
const cell = (snapshot, service, cls) => comparison.scenarios.find((entry) => entry.service === service && entry.class === cls)[snapshot].verdict
const T_SERVICE_VERDICTS = table(['Service', 'T0 S1', 'T0 S2', 'T0 S3', 'T0 S4', 'T0 S5', 'T0 verdict BEFORE', 'T0 verdict AFTER', 'T1', 'T2', 'T3'],
  SERVICES.map(([id, name]) => [name, ...['S1', 'S2', 'S3', 'S4', 'S5'].map((cls) => `${cell('before', id, cls)} > ${cell('after', id, cls)}`), verdictFor('before', id), verdictFor('after', id), 'NOT_RUN', 'NOT_RUN', 'NOT_RUN']))

const T_ATTRIBUTION = table(['Scenario', 'Assertion that flipped', 'KAWA_01 owner of the path', 'Execution-path marker in AFTER'],
  comparison.scenarios.flatMap((entry) => entry.attribution.map((a) => [entry.id, a.assertion, a.kawa01_owner, a.execution_path_marker])))

const T_H5_ROWS = table(['Row', 'Expected', 'Got', 'Outcome', 'Category', 'Sub-mechanism', 'Mechanism and evidence'],
  h5.rows.map((row) => [
    row.id, row.expected ?? '-', row.classifier_route ?? '-', row.outcome,
    row.category ?? '-', row.sub_mechanism ?? '-',
    row.mechanism ? `${row.mechanism}${row.evidence.length ? ` [${row.evidence.join('; ')}]` : ''}` : (row.outcome === 'TRUE_POSITIVE_ROUTED' ? 'detected and routed' : row.outcome === 'TRUE_NEGATIVE' ? 'quiet' : ''),
  ]))
const s = h5.summary
const T_H5_FREQ = table(['Measure', 'Value'], [
  ['Rows', s.rows_total], ['Clear positives / negatives', `${s.positives} / ${s.negatives}`],
  ['True positives, exact route', `${s.true_positive_routed}/${s.positives} (${(s.recall_route_exact * 100).toFixed(1)} %, 95 % Wilson ${(s.recall_wilson95[0] * 100).toFixed(1)}-${(s.recall_wilson95[1] * 100).toFixed(1)} %)`],
  ['False negatives', s.false_negative], ['Wrong route', s.wrong_route], ['False positives', `${s.false_positive}/${s.negatives}`],
  ['Judgement rows missed (excluded from rates)', `${s.judgement_rows_missed}/4`],
  ['Failures by category', JSON.stringify(s.category_frequency_all_failures)],
  ['Failures by sub-mechanism (clear rows)', JSON.stringify(s.sub_mechanism_frequency_clear_misses)],
  ['Failures by earliest stage', JSON.stringify(s.earliest_failure_stage_frequency)],
  ['Failures caused by normalisation, segmentation, negation, multi-signal routing, entry point or delivery', s.rows_where_normalisation_or_segmentation_or_negation_or_routing_was_the_cause + s.rows_where_entry_point_or_delivery_lost_a_detected_emergency],
  ['Cue matches on negatives rejected by a context filter (rows H5-034 and H5-049; all by the past-tense filter)', JSON.stringify(s.negatives_correctly_held_by_context_filters)],
  ['End-to-end through the Case-turn handler, AFTER: positives / negatives that produced a number', `${s.e2e_after.positives_with_number}/${s.positives} ; ${s.e2e_after.negatives_with_number}/${s.negatives}`],
  ['End-to-end, BEFORE (deterministic layer only)', `${s.e2e_before.positives_with_number}/${s.positives} ; ${s.e2e_before.negatives_with_number}/${s.negatives}`],
])

const T_PROBES = table(['Probe', 'Original route', 'Edited route', 'Edit isolates the hypothesis', 'Mechanism under test'],
  probes.counterfactuals.map((p) => [p.id, p.original_route ?? '-', p.variant_route ?? '-', p.variant_route === p.variant_expected ? 'yes' : 'NO (hypothesis refuted)', p.mechanism]))

const dev = probes.development
const per = probes.perturbation
const T_PERTURB = table(['Perturbation of 154 development positives (all currently correct)', 'Still correct', 'Different route', 'Lost'],
  ['original', 'uppercase', 'no_diacritics', 'wrong_tone_marks', 'one_letter_deleted', 'adjacent_letters_swapped', 'one_letter_doubled'].map((k) => [k, per[k].still_routed_correctly, per[k].routed_to_a_different_route, per[k].lost]))

const flagCount = (data) => {
  let ok = 0
  let total = 0
  const missed = []
  for (const run of data.runs) {
    const def = matrix.scenarios.find((entry) => entry.id === run.scenario)
    for (const variant of run.variants) for (const step of variant.steps ?? []) {
      const stepDef = def.steps.find((entry) => entry.id === step.id)
      if (!stepDef.hazard) continue
      total += 1
      const policy = matrix.route_policy.required_numbers
      const has = (route) => policy[route].every((n) => step.numbers.includes(n))
      if (has(stepDef.route) || (stepDef.also_accept_routes ?? []).some(has) || step.numbers.includes('112')) ok += 1
      else missed.push(`${run.scenario}/${step.id}`)
    }
  }
  return { ok, total, missed }
}
const fa = flagCount(flagsAfter)
const fb = flagCount(flagsBefore)
const T_FLAGS = table(['Playbook flags', 'BEFORE acceptable', 'AFTER acceptable', 'AFTER misses'], [
  ['all six off (scored run)', pct(agg.before.escalated_acceptable, agg.before.hazard_steps), pct(agg.after.escalated_acceptable, agg.after.hazard_steps), agg.after.missed_hazards.join(', ')],
  ['all six on (SUPP-FLAGS)', pct(fb.ok, fb.total), pct(fa.ok, fa.total), fa.missed.join(', ')],
])
const suppStep = (data, id) => data.runs.find((run) => run.run === 1).variants[0].steps.find((step) => step.id === id)
const T_SUPP_C6B = table(['SUPP-C6b (3 consecutive reply-insert failures)', 'BEFORE', 'AFTER'], [
  ['Step 1 status', suppStep(suppBefore, '1').status, suppStep(suppAfter, '1').status],
  ['Step 1 emergency number in the response body', suppStep(suppBefore, '1').numbers.join(',') || 'none', suppStep(suppAfter, '1').numbers.join(',') || 'none'],
  ['Step 1 warn/error console lines', suppStep(suppBefore, '1').warnErrorDelta, suppStep(suppAfter, '1').warnErrorDelta],
  ['Step 1 trace outcome', suppStep(suppBefore, '1').traceLines.map((t) => t.outcome).join(',') || 'none', suppStep(suppAfter, '1').traceLines.map((t) => t.outcome).join(',') || 'none'],
  ['Step 1: session.total_turns vs turn rows', `${suppStep(suppBefore, '1').session.total_turns} vs ${suppStep(suppBefore, '1').turnRowsTotal}`, `${suppStep(suppAfter, '1').session.total_turns} vs ${suppStep(suppAfter, '1').turnRowsTotal}`],
  ['Step 2 (retry) status / number', `${suppStep(suppBefore, '2').status} / ${suppStep(suppBefore, '2').numbers.join(',') || 'none'}`, `${suppStep(suppAfter, '2').status} / ${suppStep(suppAfter, '2').numbers.join(',') || 'none'}`],
])

const generated = { T_SCENARIOS, T_MEASURES, T_SERVICE_VERDICTS, T_ATTRIBUTION, T_H5_ROWS, T_H5_FREQ, T_PROBES, T_PERTURB, T_FLAGS, T_SUPP_C6B }
const facts = {
  DEV_ROWS: dev.clear_rows,
  DEV_OK: dev.route_correct,
  CLASS_IMPROVED: comparison.classification_counts.IMPROVED ?? 0,
  CLASS_UNCHANGED: comparison.classification_counts.UNCHANGED ?? 0,
  CLASS_REGRESSED: comparison.classification_counts.REGRESSED ?? 0,
  BEFORE_PASS: comparison.verdict_counts.before.PASS ?? 0,
  BEFORE_FAIL: comparison.verdict_counts.before.FAIL ?? 0,
  AFTER_PASS: comparison.verdict_counts.after.PASS ?? 0,
  AFTER_FAIL: comparison.verdict_counts.after.FAIL ?? 0,
  AFTER_BLOCKED: comparison.verdict_counts.after.BLOCKED ?? 0,
}

mkdirSync(join(root, '07-reports'), { recursive: true })
const sources = ['REPORT_A_kawa01_impact', 'REPORT_B_six_service_stability', 'REPORT_C_h5_root_cause', 'REPORT_D_remediation_backlog', 'FINAL_VERDICT']
for (const name of sources) {
  let body = readFileSync(join(root, '07-reports/_src', `${name}.md`), 'utf8')
  for (const [key, value] of Object.entries(generated)) body = body.replaceAll(`{{${key}}}`, value)
  for (const [key, value] of Object.entries(facts)) body = body.replaceAll(`{{${key}}}`, String(value))
  const left = body.match(/\{\{[A-Z0-9_]+\}\}/g)
  if (left) throw new Error(`${name}: unresolved placeholders ${[...new Set(left)].join(', ')}`)
  writeFileSync(join(root, '07-reports', `${name}.md`), body)
}
console.log('reports built', sources.join(', '))
