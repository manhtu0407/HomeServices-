import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const read = (path) => JSON.parse(readFileSync(join(root, path), 'utf8'))
const after = read('05-h5/h5-after.json')
const before = read('05-h5/h5-before-e2e.json')
const probes = read('05-h5/probes-after.json').results
const rows = JSON.parse(readFileSync('C:/ns-diag/after/apps/api/src/__tests__/kael-edge-runtime/fixtures/emergency-phrases/sealed-h5.json', 'utf8').replace(/\r\n/g, '\n')).rows
const text = Object.fromEntries(rows.map((row) => [row.id, row.text]))
const probeById = Object.fromEntries(probes.counterfactuals.map((probe) => [probe.id, probe]))
const confirmed = (...ids) => ids.every((id) => probeById[id] && probeById[id].variant_route === probeById[id].variant_expected)

// Sub-mechanisms of LEXICAL_COVERAGE (the cue grammar is hand-written regular expressions over accent-stripped text)
//   LC-SPAN     an intervening token, digit token or longer-than-allowed gap breaks a cue
//   LC-SYN      a synonym or paraphrase of an existing cue is absent
//   LC-ORDER    the same words in another order
//   LC-CLASS    no cue family exists for the concept (hazard class or indirect description)
//   LC-MORPH    English tense or construction not enumerated
const MISS = {
  'H5-001': { category: 'LEXICAL_COVERAGE', sub: 'LC-SPAN', mechanism: 'a colour adjective ("xanh lè") separates "lửa" from "bùng"; the trailing smoke phrase ("khói trắng mù mịt") has no cue either', evidence: ['trace empty', 'round-3 single-change probe H5-001-round3 routes fire'] },
  'H5-002': { category: 'LEXICAL_COVERAGE', sub: 'LC-SYN', mechanism: '"cháy lớn" is a cue, "cháy dữ dội" is not; "khói đang vào" is not "khói bay vào"', evidence: ['trace empty', 'probe H5-002 (cháy dữ dội to cháy lớn only) routes fire'] },
  'H5-005': { category: 'LEXICAL_COVERAGE', sub: 'LC-ORDER', mechanism: 'cues hold "lửa bốc" (fire erupts); the row says "bốc lửa"', evidence: ['trace empty', 'probe H5-005 routes fire'] },
  'H5-009': { category: 'LEXICAL_COVERAGE', sub: 'LC-CLASS', mechanism: 'no obstetric emergency family (waters broke, labour, severe pain); the medical cues are shock, collapse, breathing, bleeding, ingestion', evidence: ['trace empty', 'cue list read: no obstetric cue'] },
  'H5-011': { category: 'LEXICAL_COVERAGE', sub: 'LC-SYN', mechanism: 'ingestion cue is "nuốt nhầm"; "nuốt phải" means the same and is absent; "ho sặc sụa" (choking) is not a cue', evidence: ['trace empty', 'probe H5-011 routes medical'] },
  'H5-013': { category: 'LEXICAL_COVERAGE', sub: 'LC-SPAN+LC-SYN', mechanism: 'two independent gaps: "cố mở cửa" (trying to open) is not a break-in verb, and the clothing clause between subject and verb breaks the span', evidence: ['trace empty', 'round-3: verb-only change still misses; clause-only removal still misses; both changed routes police'] },
  'H5-014': { category: 'LEXICAL_COVERAGE', sub: 'LC-SYN', mechanism: 'threat cue is "sẽ giết" (will kill); "sẽ đánh" (will hit) is absent. "cầm gậy" is irrelevant to the miss', evidence: ['trace empty', 'round-3 single-change probe: giết routes police; weapon removal alone still misses'] },
  'H5-015': { category: 'LEXICAL_COVERAGE', sub: 'LC-MORPH', mechanism: 'the English cue enumerates "climbed" (past); "is trying to climb" is not enumerated', evidence: ['trace empty', 'probe H5-015 routes police'] },
  'H5-016': { category: 'LEXICAL_COVERAGE', sub: 'LC-CLASS', mechanism: 'indirect description of a burglary (masked men, carrying bags, heard screaming): no cue names the event', evidence: ['trace empty', 'cue list read'] },
  'H5-017': { category: 'LEXICAL_COVERAGE', sub: 'LC-CLASS', mechanism: '"tiếng súng" (gunshots) has no cue; weapon cues require a person carrying a gun or knife', evidence: ['trace empty', 'cue list read'] },
  'H5-018': { category: 'LEXICAL_COVERAGE', sub: 'LC-SPAN', mechanism: 'the reduplicated adverb "ròng ròng" sits between the verb and the preposition, which the cue expects adjacent', evidence: ['trace empty', 'probe H5-018 routes electrical_water'] },
  'H5-019': { category: 'LEXICAL_COVERAGE', sub: 'LC-SPAN', mechanism: 'at most two words may sit between the outlet and "ngâm nước"; "trong nhà tắm" is three. The round-1 synonym hypothesis was refuted ("ngâm nước" alone does not fix it)', evidence: ['trace empty', 'round-2: two-word gap routes, three-word control misses'] },
  'H5-020': { category: 'LEXICAL_COVERAGE', sub: 'LC-CLASS', mechanism: 'an indirect hazard (a loose cable touching a wet floor) has no cue; English cues name sparking, exposed live wire or water near an outlet', evidence: ['trace empty', 'cue list read'] },
  'H5-022': { category: 'LEXICAL_COVERAGE', sub: 'LC-CLASS', mechanism: 'a snapped wire falling into a puddle ("dây điện đứt", "vũng nước") has no cue', evidence: ['trace empty', 'cue list read'] },
  'H5-024': { category: 'LEXICAL_COVERAGE', sub: 'LC-SPAN', mechanism: 'the filler span of the gas-object cue accepts letters only; the digit-bearing token "12kg" breaks it', evidence: ['trace empty', 'probe H5-024 ("12kg" to "lon") routes gas'] },
  'H5-026': { category: 'LEXICAL_COVERAGE', sub: 'LC-CLASS', mechanism: '"full of gas" without a leak, smell or hiss word has no cue', evidence: ['trace empty', 'cue list read'] },
  'H5-028': { category: 'LEXICAL_COVERAGE', sub: 'LC-SYN', mechanism: 'the uncertainty cue is built on "gọi" (call); the row says "báo" (notify)', evidence: ['trace empty', 'round-3 single-change probe routes uncertain'] },
  'H5-029': { category: 'LEXICAL_COVERAGE', sub: 'LC-SYN', mechanism: 'paraphrase of "not sure who to call" ("cannot tell if I need the fire service or the police") is not enumerated', evidence: ['trace empty', 'cue list read'] },
  'H5-040': { category: 'LEXICAL_COVERAGE', sub: 'LC-ORDER (negative side)', mechanism: 'FALSE ALARM: the prevention list holds "báo rò gas"; the row says "báo gas rò" (install a gas-leak detector). The leak cue fires because the benign context is recognised only by enumerated word order', evidence: ['trace: gas_bare_vi#0 affirmed', 'probe H5-040 ("gas rò" to "rò gas") stays quiet'] },
}
const JUDGEMENT = {
  'H5-060': 'onomatopoeia "lẹt xẹt" and animal damage have no cue',
  'H5-061': 'burning-rubber smell from a dryer has no cue',
  'H5-062': 'faint gas smell at first ignition has no cue (and its severity is contestable)',
  'H5-063': 'overheated main breaker has no cue',
}

const resultsById = Object.fromEntries(after.results.map((row) => [row.id, row]))
const beforeById = Object.fromEntries(before.results.map((row) => [row.id, row]))
const out = []
for (const row of rows) {
  const a = resultsById[row.id]
  const b = beforeById[row.id]
  const positive = row.expected !== null
  const got = a.classifier_route
  let outcome
  if (row.kind === 'judgement') outcome = 'JUDGEMENT_MISS'
  else if (positive) outcome = got === row.expected ? 'TRUE_POSITIVE_ROUTED' : got === null ? 'FALSE_NEGATIVE' : 'WRONG_ROUTE'
  else outcome = got === null ? 'TRUE_NEGATIVE' : 'FALSE_POSITIVE'
  const rejected = (a.trace ?? []).filter((entry) => entry.verdict !== 'affirmed')
  const diag = {
    id: row.id,
    text: text[row.id],
    expected: row.expected,
    kind: row.kind,
    classifier_route: got,
    outcome,
    schema_ok: a.schema_ok,
    normalised_plain: a.plain,
    segments: a.segments,
    cue_regex_matches: (a.trace ?? []).length,
    cue_matches_rejected_by: rejected.map((entry) => `${entry.cue}:${entry.verdict}`),
    e2e_after: { status: a.e2e.status, numbers: a.e2e.numbers, matches_classifier: (got === null) === (a.e2e.numbers.length === 0) },
    e2e_before: { status: b.e2e.status, numbers: b.e2e.numbers },
    earliest_failure_stage: null,
    category: null,
    sub_mechanism: null,
    mechanism: null,
    evidence: [],
  }
  if (outcome === 'FALSE_NEGATIVE' || outcome === 'FALSE_POSITIVE') {
    const info = MISS[row.id]
    Object.assign(diag, { earliest_failure_stage: 'cue matching (stage 4 of 9)', category: info.category, sub_mechanism: info.sub, mechanism: info.mechanism, evidence: info.evidence })
  } else if (outcome === 'JUDGEMENT_MISS') {
    Object.assign(diag, { earliest_failure_stage: 'cue matching (stage 4 of 9)', category: 'LEXICAL_COVERAGE', sub_mechanism: 'LC-CLASS (label contested)', mechanism: JUDGEMENT[row.id], evidence: ['trace empty', 'excluded from every rate'] })
  } else if (outcome === 'TRUE_NEGATIVE' && rejected.length > 0) {
    diag.mechanism = `cue matched but correctly rejected: ${rejected.map((entry) => `${entry.cue} «${entry.match}» ${entry.verdict}`).join('; ')}`
  }
  out.push(diag)
}

const count = (items, key) => items.reduce((acc, item) => { const k = item[key] ?? 'n/a'; acc[k] = (acc[k] ?? 0) + 1; return acc }, {})
const failing = out.filter((row) => ['FALSE_NEGATIVE', 'FALSE_POSITIVE', 'JUDGEMENT_MISS'].includes(row.outcome))
const clear = out.filter((row) => row.kind === 'clear')
const positives = clear.filter((row) => row.expected !== null)
const negatives = clear.filter((row) => row.expected === null)
const wilson = (k, n) => { const z = 1.96; const p = k / n; const d = 1 + z * z / n; const c = p + z * z / (2 * n); const m = z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n); return [((c - m) / d), ((c + m) / d)] }
const tp = positives.filter((row) => row.outcome === 'TRUE_POSITIVE_ROUTED').length
const filtersThatSavedNegatives = {}
for (const row of negatives) for (const reject of row.cue_matches_rejected_by) { const verdict = reject.split(':').pop(); filtersThatSavedNegatives[verdict] = (filtersThatSavedNegatives[verdict] ?? 0) + 1 }
const summary = {
  schema: 'nestscout.diagnostic_h5_diagnosis.v1',
  label: 'REPRODUCTION (diagnostic read of an existing set; the set is no longer a holdout and this is not independent validation)',
  rows_total: out.length,
  rows_sealed_sha256_lf: after.rows_sha256_lf,
  classifier_source_note: 'AFTER snapshot 42daced1; emergency-guidance.ts differs in bytes from the 63c01524 evidence only by the 167 comment lines removed at integration; the route results are identical (11/29, 1/30)',
  clear_rows: clear.length,
  positives: positives.length,
  negatives: negatives.length,
  true_positive_routed: tp,
  false_negative: positives.filter((row) => row.outcome === 'FALSE_NEGATIVE').length,
  wrong_route: positives.filter((row) => row.outcome === 'WRONG_ROUTE').length,
  false_positive: negatives.filter((row) => row.outcome === 'FALSE_POSITIVE').length,
  true_negative: negatives.filter((row) => row.outcome === 'TRUE_NEGATIVE').length,
  recall_route_exact: tp / positives.length,
  recall_wilson95: wilson(tp, positives.length),
  judgement_rows_missed: out.filter((row) => row.outcome === 'JUDGEMENT_MISS').length,
  category_frequency_all_failures: count(failing, 'category'),
  sub_mechanism_frequency_clear_misses: count(failing.filter((row) => row.kind === 'clear'), 'sub_mechanism'),
  earliest_failure_stage_frequency: count(failing, 'earliest_failure_stage'),
  negatives_correctly_held_by_context_filters: filtersThatSavedNegatives,
  rows_where_normalisation_or_segmentation_or_negation_or_routing_was_the_cause: 0,
  rows_where_entry_point_or_delivery_lost_a_detected_emergency: out.filter((row) => row.classifier_route && !row.e2e_after.matches_classifier).length,
  e2e_after: { positives_with_number: positives.filter((row) => row.e2e_after.numbers.length > 0).length, negatives_with_number: negatives.filter((row) => row.e2e_after.numbers.length > 0).length },
  e2e_before: { positives_with_number: positives.filter((row) => row.e2e_before.numbers.length > 0).length, negatives_with_number: negatives.filter((row) => row.e2e_before.numbers.length > 0).length, caveat: 'providers stubbed; any model-assisted safety in the BEFORE pipeline was not exercised; playbook flags off' },
  label_review: 'No clear-row label was changed or found wrong. H5-009 (obstetric emergency) is arguably outside home-service scope but 115 is the right number. Labels are untouched.',
  counterfactual_probes: probes.counterfactuals.map((probe) => ({ id: probe.id, variant_route: probe.variant_route, variant_expected: probe.variant_expected, as_hypothesised: probe.variant_route === probe.variant_expected })),
}
writeFileSync(join(root, '05-h5/h5-row-diagnosis.json'), `${JSON.stringify({ summary, rows: out }, null, 2)}\n`)
console.log(JSON.stringify(summary, null, 1))
