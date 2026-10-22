// Renders the report tables from the raw result files into results/tables.md. Nothing in it is typed by hand.
// usage: node make-tables.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BASELINE, evidenceRoot } from './run-candidate.mjs'

const load = (path) => JSON.parse(readFileSync(path, 'utf8'))
const results = (name) => join(evidenceRoot, 'results', name)
const scorecard = load(results('scorecard.json'))
const matrix = load(join(BASELINE, '01-freeze/scenario-matrix.json'))
const titles = new Map(matrix.scenarios.map((scenario) => [scenario.id, scenario.title]))

const off = new Map(scorecard.matrix_flags_off.rows.map((row) => [row.id, row]))
const on = new Map(scorecard.matrix_flags_on.rows.map((row) => [row.id, row]))
const journeys = new Map(scorecard.journey_flags_off.rows.map((row) => [row.id, row]))

const lines = []
lines.push('### Table 1. The 36 frozen scenarios, accepted baseline (main 42daced1) against the candidate')
lines.push('')
lines.push('| # | Scenario | Service | Class | Flags off: baseline | Flags off: candidate | Flags off: change | Flags on: baseline | Flags on: candidate | Flags on: change |')
lines.push('|---|---|---|---|---|---|---|---|---|---|')
let index = 0
for (const scenario of matrix.scenarios) {
  index += 1
  const a = off.get(scenario.id) ?? journeys.get(scenario.id)
  const b = on.get(scenario.id)
  const change = (row) => (row ? row.change.replace('->', ' to ') : 'not run (S5 journey, flags on unchanged BLOCKED)')
  lines.push(`| ${index} | ${scenario.id} | ${scenario.service} | ${scenario.class} | ${a.from} | ${a.to} | ${change(a)}${a.assertions.length ? ` (${a.assertions.join('; ')})` : ''} | ${b ? b.from : 'BLOCKED'} | ${b ? b.to : 'BLOCKED'} | ${b ? `${change(b)}${b.assertions.length ? ` (${b.assertions.join('; ')})` : ''}` : 'unchanged'} |`)
}
lines.push('')
const tally = (section) => Object.entries(section.tally).map(([key, count]) => `${count} x ${key}`).join(', ')
lines.push(`Flags off, 30 conversational scenarios: ${tally(scorecard.matrix_flags_off)}. S5 journeys: ${tally(scorecard.journey_flags_off)}.`)
lines.push(`Flags on, 30 conversational scenarios: ${tally(scorecard.matrix_flags_on)}. S5 journeys (pre-fix main against the candidate): ${tally(scorecard.journey_flags_on)}.`)
lines.push('')

const journey = load(results('post/journey.json'))
lines.push('### Table 2. S5 journey checkpoints on the candidate (identical for all six services)')
lines.push('')
lines.push('| Checkpoint | Name | Result | Needs |')
lines.push('|---|---|---|---|')
const first = journey.runs[0]
for (const checkpoint of first.checkpoints) {
  const needs = checkpoint.result === 'BLOCKED' ? 'PostgreSQL / real transaction (T1 or higher)' : checkpoint.result === 'INVENTORY' ? 'none (inventory)' : 'none at T0'
  lines.push(`| ${checkpoint.id} | ${checkpoint.name} | ${checkpoint.result} | ${needs} |`)
}
const distinct = new Set(journey.runs.map((run) => JSON.stringify(run.checkpoints.map((checkpoint) => `${checkpoint.id}=${checkpoint.result}`))))
lines.push('')
lines.push(`Distinct checkpoint vectors across the ${journey.runs.length} journey runs: ${distinct.size}.`)
lines.push('')

const triplet = load(results('triplet-table.json'))
lines.push('### Table 3. Hazard checkpoints, route / visible guidance / metadata kept apart')
lines.push('')
lines.push('| Configuration | Checkpoints | Baseline: route correct | Baseline: visible exact | Baseline: metadata present | Candidate: route correct | Candidate: visible exact | Candidate: metadata present |')
lines.push('|---|---|---|---|---|---|---|---|')
for (const key of Object.keys(triplet.candidate_summary)) {
  const b = triplet.baseline_summary[key]
  const c = triplet.candidate_summary[key]
  lines.push(`| ${key} | ${c.checkpoints} | ${b.route_correct} | ${b.visible_exact} | ${b.metadata_present} | ${c.route_correct} | ${c.visible_exact} | ${c.metadata_present} |`)
}
lines.push('')
lines.push('Checkpoints that changed between the accepted baseline and the candidate:')
lines.push('')
lines.push('| Mode | Flags | Checkpoint | Change |')
lines.push('|---|---|---|---|')
for (const entry of triplet.transitions) {
  const [mode, flags, id] = entry.key.split('|')
  lines.push(`| ${mode} | ${flags} | ${id} | ${entry.changed.join('; ')} |`)
}
lines.push('')
lines.push(`Checkpoints that got worse (any dimension true to false): ${triplet.regressions.length}. Candidate checkpoints where flags on delivers fewer numbers or a weaker dimension than flags off: ${triplet.monotonic_violations_flags_on_vs_off_candidate.length}.`)

writeFileSync(results('tables.md'), `${lines.join('\n')}\n`)
console.log(lines.join('\n'))
