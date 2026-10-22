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
const oneOff = rowsById('r1_matrix_flags_off')
const oneJourney = rowsById('r1_journey_flags_off')
const oneOn = rowsById('r1_matrix_flags_on')

const lines = []
lines.push('### Table 1. The 36 frozen scenarios: main (42daced1), round-1 candidate (04317126), round-2 candidate')
lines.push('')
lines.push('| # | Scenario | Service | Flags off: main | Flags off: round 1 | Flags off: round 2 | Round 2 against main | Round 2 against round 1 | Flags on: main | Flags on: round 1 | Flags on: round 2 | Round 2 against main (flags on) | Round 2 against round 1 (flags on) |')
lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|')
let index = 0
const change = (row) => (row ? row.change.replace('->', ' to ') : 'not run')
for (const scenario of matrix.scenarios) {
  index += 1
  const offMain = mainOff.get(scenario.id) ?? mainJourney.get(scenario.id)
  const offOne = oneOff.get(scenario.id) ?? oneJourney.get(scenario.id)
  const onMain = mainOn.get(scenario.id)
  const onOne = oneOn.get(scenario.id)
  lines.push(`| ${index} | ${scenario.id} | ${scenario.service} | ${offMain.from} | ${offOne.from} | ${offMain.to} | ${change(offMain)} | ${change(offOne)} | ${onMain ? onMain.from : 'BLOCKED'} | ${onOne ? onOne.from : 'BLOCKED'} | ${onMain ? onMain.to : 'BLOCKED'} | ${onMain ? change(onMain) : 'unchanged'} | ${onOne ? change(onOne) : 'unchanged'} |`)
}
lines.push('')
const tally = (section) => Object.entries(scorecard[section].tally).map(([key, count]) => `${count} x ${key}`).join(', ')
lines.push(`Round 2 against main, flags off: ${tally('matrix_flags_off')}; S5 journeys: ${tally('journey_flags_off')}.`)
lines.push(`Round 2 against main, flags on: ${tally('matrix_flags_on')}; S5 journeys against pre-fix main: ${tally('journey_flags_on')}.`)
lines.push(`Round 2 against round 1, flags off: ${tally('r1_matrix_flags_off')}; S5 journeys: ${tally('r1_journey_flags_off')}.`)
lines.push(`Round 2 against round 1, flags on: ${tally('r1_matrix_flags_on')}; S5 journeys: ${tally('r1_journey_flags_on')}.`)
lines.push(`SUPP-C6b persistent write failure: flags off against main ${tally('supp_c6b_flags_off')}, against round 1 ${tally('r1_supp_c6b_flags_off')}; flags on against main ${tally('supp_c6b_flags_on')}, against round 1 ${tally('r1_supp_c6b_flags_on')}.`)
lines.push('')

const journey = load(results('post/journey.json'))
lines.push('### Table 2. S5 journey checkpoints on the round-2 candidate (identical for all six services)')
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
lines.push('| Configuration | Checkpoints | Main: route | Main: visible exact | Main: metadata | Round 1: route | Round 1: visible exact | Round 1: metadata | Round 2: route | Round 2: visible exact | Round 2: metadata |')
lines.push('|---|---|---|---|---|---|---|---|---|---|---|')
for (const key of Object.keys(triplet.round_two_summary)) {
  const m = triplet.main_summary[key]
  const o = triplet.round_one_summary[key]
  const t = triplet.round_two_summary[key]
  lines.push(`| ${key} | ${t.checkpoints} | ${m.route_correct} | ${m.visible_exact} | ${m.metadata_present} | ${o.route_correct} | ${o.visible_exact} | ${o.metadata_present} | ${t.route_correct} | ${t.visible_exact} | ${t.metadata_present} |`)
}
lines.push('')
lines.push(`Checkpoints where round 2 is worse than round 1 on any dimension: ${triplet.worse_than_round_one.length}. Checkpoints where round 2 is worse than main: ${triplet.worse_than_main.length}. Round-2 checkpoints where flags on delivers fewer numbers or a weaker dimension than flags off: ${triplet.monotonic_violations_flags_on_vs_off.length}.`)

writeFileSync(results('tables.md'), `${lines.join('\n')}\n`)
console.log(lines.join('\n'))
