// Renders the report tables from the raw result files into results/tables.md. Nothing in it is typed by hand.
// usage: node make-tables.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BASELINE, evidenceRoot } from './run-candidate.mjs'

const load = (path) => JSON.parse(readFileSync(path, 'utf8'))
const results = (name) => join(evidenceRoot, 'results', name)
const scorecard = load(results('scorecard.json'))
const matrix = load(join(BASELINE, '01-freeze/scenario-matrix.json'))
const rowsById = (section) => new Map(scorecard[section].rows.map((row) => [row.id, row]))

const mainOff = rowsById('matrix_flags_off')
const mainJourney = rowsById('journey_flags_off')
const mainOn = rowsById('matrix_flags_on')
const twoOff = rowsById('r2_matrix_flags_off')
const twoJourney = rowsById('r2_journey_flags_off')
const twoOn = rowsById('r2_matrix_flags_on')

const lines = []
lines.push('### Table 1. The 36 frozen scenarios: main (42daced1), round-2 candidate (5f44351e), this candidate')
lines.push('')
lines.push('| # | Scenario | Service | Flags off: main | Flags off: round 2 | Flags off: this | This against main | This against round 2 | Flags on: main | Flags on: round 2 | Flags on: this | This against main (flags on) | This against round 2 (flags on) |')
lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|')
let index = 0
const change = (row) => (row ? row.change.replace('->', ' to ') : 'not run')
for (const scenario of matrix.scenarios) {
  index += 1
  const offMain = mainOff.get(scenario.id) ?? mainJourney.get(scenario.id)
  const offTwo = twoOff.get(scenario.id) ?? twoJourney.get(scenario.id)
  const onMain = mainOn.get(scenario.id)
  const onTwo = twoOn.get(scenario.id)
  lines.push(`| ${index} | ${scenario.id} | ${scenario.service} | ${offMain.from} | ${offTwo.from} | ${offMain.to} | ${change(offMain)} | ${change(offTwo)} | ${onMain ? onMain.from : 'BLOCKED'} | ${onTwo ? onTwo.from : 'BLOCKED'} | ${onMain ? onMain.to : 'BLOCKED'} | ${onMain ? change(onMain) : 'unchanged'} | ${onTwo ? change(onTwo) : 'unchanged'} |`)
}
lines.push('')
const tally = (section) => Object.entries(scorecard[section].tally).map(([key, count]) => `${count} x ${key}`).join(', ')
lines.push(`This candidate against main, flags off: ${tally('matrix_flags_off')}; S5 journeys: ${tally('journey_flags_off')}.`)
lines.push(`This candidate against main, flags on: ${tally('matrix_flags_on')}; S5 journeys against pre-fix main: ${tally('journey_flags_on')}.`)
lines.push(`This candidate against round 2, flags off: ${tally('r2_matrix_flags_off')}; S5 journeys: ${tally('r2_journey_flags_off')}.`)
lines.push(`This candidate against round 2, flags on: ${tally('r2_matrix_flags_on')}; S5 journeys: ${tally('r2_journey_flags_on')}.`)
lines.push(`SUPP-C6b persistent write failure: flags off against main ${tally('supp_c6b_flags_off')}, against round 2 ${tally('r2_supp_c6b_flags_off')}; flags on against main ${tally('supp_c6b_flags_on')}, against round 2 ${tally('r2_supp_c6b_flags_on')}.`)
lines.push('')

const journey = load(results('post/journey.json'))
lines.push('### Table 2. S5 journey checkpoints on this candidate (identical for all six services)')
lines.push('')
lines.push('| Checkpoint | Name | Result | Needs |')
lines.push('|---|---|---|---|')
for (const checkpoint of journey.runs[0].checkpoints) {
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
lines.push('| Configuration | Checkpoints | Main: route | Main: visible exact | Main: metadata | Round 2: route | Round 2: visible exact | Round 2: metadata | This: route | This: visible exact | This: metadata |')
lines.push('|---|---|---|---|---|---|---|---|---|---|---|')
for (const key of Object.keys(triplet.this_candidate_summary)) {
  const m = triplet.main_summary[key]
  const o = triplet.round_two_summary[key]
  const t = triplet.this_candidate_summary[key]
  lines.push(`| ${key} | ${t.checkpoints} | ${m.route_correct} | ${m.visible_exact} | ${m.metadata_present} | ${o.route_correct} | ${o.visible_exact} | ${o.metadata_present} | ${t.route_correct} | ${t.visible_exact} | ${t.metadata_present} |`)
}
lines.push('')
lines.push(`Checkpoints where this candidate is worse than round 2 on any dimension: ${triplet.worse_than_round_two.length}. Checkpoints where it is worse than main: ${triplet.worse_than_main.length}. Checkpoints where flags on delivers fewer numbers or a weaker dimension than flags off: ${triplet.monotonic_violations_flags_on_vs_off.length}.`)

writeFileSync(results('tables.md'), `${lines.join('\n')}\n`)
console.log(lines.join('\n'))
