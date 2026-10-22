// Independent H5 verification. Part A: confusion counts from the shipped classifier. Part B: raw cue-match
// trace by wrapping String.prototype.matchAll (no source copy, no clone). Part C: single-change
// counterfactuals built programmatically from the sealed originals, each checked to be one edit.
// The sealed rows are read, never modified; derived texts are not H5 rows and feed no rate.
import { readFileSync } from 'node:fs'
import { lfSha256, load, numbersIn, sealedH5Path, setEnv, writeJson } from './lib.mjs'

const SEALED_SHA = '80e3e90701e4acc9418ed30209e251b613c84520c70f3f49ba73e2638052d81d'
if (lfSha256(sealedH5Path()) !== SEALED_SHA) throw new Error('sealed H5 hash mismatch')
const rows = JSON.parse(readFileSync(sealedH5Path(), 'utf8').replace(/\r\n/g, '\n')).rows

setEnv({})
const { resolveReportedEmergencyGuidance } = await load('after', 'kael/kael-guardrails/emergency-guidance.ts')
const route = (text, service) => resolveReportedEmergencyGuidance(text, 'vi', { serviceType: service ?? null })?.route ?? null

// ---- Part B: raw cue-match recorder
const originalMatchAll = String.prototype.matchAll
let recorder = null
String.prototype.matchAll = function patched(pattern) {
  const iterator = originalMatchAll.call(this, pattern)
  if (!recorder || !(pattern instanceof RegExp) || pattern.flags !== 'gu') return iterator
  if (pattern.source.startsWith('\\b(?:canh (?:co )?(?:chay|hoa hoan)')) return iterator
  const all = [...iterator]
  if (all.length > 0) recorder.push({ cue: pattern.source.slice(0, 90), text: all[0][0] })
  return all[Symbol.iterator]()
}
function traced(text, service) {
  recorder = []
  const got = route(text, service)
  const raw = recorder
  recorder = null
  return { got, raw_cue_matches: raw }
}

// ---- Part A + B over all 63 rows
const perRow = rows.map((row) => {
  const t = traced(row.text, row.service)
  const expected = row.expected === 'clear' ? null : row.expected
  return { id: row.id, kind: row.kind, expected, got: t.got, raw_cue_matches: t.raw_cue_matches }
})
const clear = perRow.filter((r) => r.kind === 'clear')
const positives = clear.filter((r) => r.expected !== null)
const negatives = clear.filter((r) => r.expected === null)
const judgement = perRow.filter((r) => r.kind !== 'clear')
const summary = {
  rows: perRow.length,
  positives: positives.length, negatives: negatives.length, judgement: judgement.length,
  true_positive_exact: positives.filter((r) => r.got === r.expected).length,
  wrong_route: positives.filter((r) => r.got !== null && r.got !== r.expected).length,
  false_negative: positives.filter((r) => r.got === null).length,
  false_positive: negatives.filter((r) => r.got !== null).length,
  judgement_missed: judgement.filter((r) => r.got === null).length,
  judgement_routed: judgement.filter((r) => r.got !== null).map((r) => `${r.id}:${r.got}`),
}
const missed = [...positives.filter((r) => r.got === null), ...judgement.filter((r) => r.got === null)]
const falseAlarms = negatives.filter((r) => r.got !== null)
const trace = {
  missed_rows: missed.length,
  missed_with_zero_raw_cue_matches: missed.filter((r) => r.raw_cue_matches.length === 0).map((r) => r.id),
  missed_but_had_a_raw_cue_match: missed.filter((r) => r.raw_cue_matches.length > 0).map((r) => ({ id: r.id, raw: r.raw_cue_matches })),
  false_alarms: falseAlarms.map((r) => ({ id: r.id, got: r.got, raw: r.raw_cue_matches })),
  correct_negatives_with_raw_match_rejected_later: negatives.filter((r) => r.got === null && r.raw_cue_matches.length > 0).map((r) => ({ id: r.id, raw: r.raw_cue_matches })),
  correct_positives_wrong_route: positives.filter((r) => r.got !== null && r.got !== r.expected).map((r) => r.id),
}

// ---- Part C: programmatic single-change counterfactuals
const tokens = (s) => s.toLowerCase().replace(/[,.;!?]/g, ' ').split(/\s+/).filter(Boolean)
function changedTokens(a, b) {
  const x = tokens(a), y = tokens(b)
  const dp = Array.from({ length: x.length + 1 }, () => new Array(y.length + 1).fill(0))
  for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  let i = 0, j = 0, del = 0, ins = 0
  while (i < x.length && j < y.length) { if (x[i] === y[j]) { i++; j++ } else if (dp[i + 1][j] >= dp[i][j + 1]) { del++; i++ } else { ins++; j++ } }
  return del + (x.length - i) + ins + (y.length - j)
}
const EDITS = [
  ['H5-001', 'remove the colour adjective only', [['xanh lè ', '']], 'fire'],
  ['H5-001', 'remove only the trailing smoke clause (adjective kept)', [[' rồi khói trắng mù mịt', '']], null],
  ['H5-002', '"cháy dữ dội" -> "cháy lớn"', [['cháy dữ dội', 'cháy lớn']], 'fire'],
  ['H5-002', 'only "khói đang vào" -> "khói bay vào" (cháy dữ dội kept)', [['khói đang vào', 'khói bay vào']], null],
  ['H5-005', 'pure reorder "bốc lửa" -> "lửa bốc"', [['bốc lửa', 'lửa bốc']], 'fire'],
  ['H5-011', '"nuốt phải" -> "nuốt nhầm"', [['nuốt phải', 'nuốt nhầm']], 'medical'],
  ['H5-013', 'verb only "cố mở" -> "cạy"', [['cố mở', 'cạy']], null],
  ['H5-013', 'clause only: remove "mặc áo mưa"', [['mặc áo mưa ', '']], null],
  ['H5-013', 'both edits', [['cố mở', 'cạy'], ['mặc áo mưa ', '']], 'police'],
  ['H5-014', 'threat verb only "đánh" -> "giết"', [['đánh', 'giết']], 'police'],
  ['H5-014', 'weapon clause only: remove "cầm gậy và "', [['cầm gậy và ', '']], null],
  ['H5-015', '"is trying to climb" -> "climbed"', [['is trying to climb', 'climbed']], 'police'],
  ['H5-018', 'remove "ròng ròng"', [['ròng ròng ', '']], 'electrical_water'],
  ['H5-019', 'span only: remove "trong"', [['trong ', '']], null],
  ['H5-019', 'synonym only: "ướt sũng" -> "ngâm nước"', [['ướt sũng', 'ngâm nước']], null],
  ['H5-019', 'both: remove "trong" and "ướt sũng" -> "ngâm nước"', [['trong ', ''], ['ướt sũng', 'ngâm nước']], 'electrical_water'],
  ['H5-024', 'digit token: "12kg" -> "lon"', [['12kg', 'lon']], 'gas'],
  ['H5-024', 'digit token removed: delete "12kg "', [['12kg ', '']], 'gas'],
  ['H5-028', '"báo ai" -> "gọi ai"', [['báo ai', 'gọi ai']], 'uncertain'],
  ['H5-040', 'reorder "báo gas rò" -> "báo rò gas"', [['báo gas rò', 'báo rò gas']], null],
]
const counterfactuals = EDITS.map(([id, label, replacements, expectedAfterEdit]) => {
  const original = rows.find((row) => row.id === id)
  let text = original.text
  for (const [find, replace] of replacements) {
    if (text.split(find).length - 1 !== 1) throw new Error(`${id}: "${find}" does not occur exactly once`)
    text = text.replace(find, replace)
  }
  const originalRoute = route(original.text, original.service)
  const editedRoute = route(text, original.service)
  return {
    id, label, edits: replacements.length, changed_tokens: changedTokens(original.text, text), original_route: originalRoute, edited_route: editedRoute,
    predicted: expectedAfterEdit, matches_prediction: editedRoute === expectedAfterEdit, flipped: editedRoute !== originalRoute,
  }
})

String.prototype.matchAll = originalMatchAll
const out = { schema: 'nestscout.audit.h5_verify.v1', sealed_sha256_lf: SEALED_SHA, classifier_snapshot: 'after', summary, trace, rows: perRow.map((r) => ({ id: r.id, kind: r.kind, expected: r.expected, got: r.got, raw_cue_match_count: r.raw_cue_matches.length })), counterfactuals }
writeJson('h5-verify.json', out)
console.log(JSON.stringify({ summary, trace: { ...trace, missed_but_had_a_raw_cue_match: trace.missed_but_had_a_raw_cue_match.length }, false_alarm_detail: trace.false_alarms, counterfactuals: counterfactuals.map((c) => `${c.id} | ${c.label} | edits=${c.edits} tokens=${c.changed_tokens} | ${c.original_route} -> ${c.edited_route} | predicted ${c.predicted} ${c.matches_prediction ? 'OK' : 'DIFFERS'}`) }, null, 1))
