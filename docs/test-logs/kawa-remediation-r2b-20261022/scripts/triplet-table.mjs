// Route correctness, visible guidance and metadata, kept apart, for every frozen hazard checkpoint.
// References: clean main (round-1 results/base), the round-2 candidate (round-2 results/post) and this candidate.
// usage: node triplet-table.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BASELINE, evidenceRoot } from './run-candidate.mjs'

const load = (path) => JSON.parse(readFileSync(path, 'utf8'))
const matrix = load(join(BASELINE, '01-freeze/scenario-matrix.json'))
const accepted = new Map()
for (const scenario of matrix.scenarios) {
  for (const step of scenario.steps ?? []) {
    if (step.hazard) accepted.set(`${scenario.id}/${step.id}`, [step.route, ...(step.also_accept_routes ?? [])].map((route) => (route === 'mixed' ? 'uncertain' : route)))
  }
}

function rowsOf(doc) {
  const rows = []
  for (const result of doc.results) {
    for (const hazard of result.hazard) {
      const key = `${result.scenario}/${hazard.step}`
      const routes = [...new Set([...(hazard.metadata_routes ?? []), ...(hazard.structured && hazard.structured.route ? [hazard.structured.route] : [])])]
      rows.push({
        id: `${result.scenario}/${result.variant}/${hazard.step}`,
        mode: result.mode,
        flags: result.flags,
        status: hazard.status,
        numbers: hazard.text_numbers,
        routes,
        route_correct: routes.some((route) => (accepted.get(key) ?? []).includes(route)),
        visible_acceptable: hazard.delivered_text,
        visible_exact: hazard.route_exact_text,
        metadata_present: routes.length > 0,
        structured_envelope: hazard.delivered_structured,
      })
    }
  }
  return rows
}

function summarize(rows) {
  const groups = {}
  for (const row of rows) {
    const key = `${row.mode}/flags-${row.flags}`
    const group = groups[key] ?? { checkpoints: 0, route_correct: 0, visible_acceptable: 0, visible_exact: 0, metadata_present: 0 }
    group.checkpoints += 1
    if (row.route_correct) group.route_correct += 1
    if (row.visible_acceptable) group.visible_acceptable += 1
    if (row.visible_exact) group.visible_exact += 1
    if (row.metadata_present) group.metadata_present += 1
    groups[key] = group
  }
  return groups
}

const roundOne = (name) => join(evidenceRoot, '..', 'kawa-remediation-r1-20261022', 'results', name)
const roundTwo = (name) => join(evidenceRoot, '..', 'kawa-remediation-r2-20261022', 'results', name)
const main = rowsOf(load(roundOne('base/triplet.json')))
const previous = rowsOf(load(roundTwo('post/triplet.json')))
const current = rowsOf(load(join(evidenceRoot, 'results/post/triplet.json')))
const index = (rows) => new Map(rows.map((row) => [`${row.mode}|${row.flags}|${row.id}`, row]))
const dims = ['route_correct', 'visible_acceptable', 'visible_exact', 'metadata_present']

function transitionsBetween(from, to) {
  const fromIndex = index(from)
  const result = []
  for (const [key, p] of index(to)) {
    const b = fromIndex.get(key)
    if (!b) continue
    const changed = dims.filter((dim) => b[dim] !== p[dim]).map((dim) => `${dim}: ${b[dim]} -> ${p[dim]}`)
    if (changed.length > 0) result.push({ key, changed })
  }
  return result
}

const againstPrevious = transitionsBetween(previous, current)
const againstMain = transitionsBetween(main, current)
const currentIndex = index(current)
const monotonic = []
for (const [key, on] of currentIndex) {
  const [mode, flags, id] = key.split('|')
  if (flags !== 'on') continue
  const off = currentIndex.get(`${mode}|off|${id}`)
  if (!off) continue
  const dropped = off.numbers.filter((number) => !on.numbers.includes(number))
  const weaker = dims.filter((dim) => off[dim] && !on[dim])
  if (dropped.length > 0 || weaker.length > 0) monotonic.push({ id: `${mode}/${id}`, dropped_numbers: dropped, weaker })
}
const out = {
  schema: 'nestscout.r2b.triplet_table.v1',
  main_summary: summarize(main),
  round_two_summary: summarize(previous),
  this_candidate_summary: summarize(current),
  changed_against_round_two: againstPrevious,
  worse_than_round_two: againstPrevious.filter((entry) => entry.changed.some((text) => /true -> false/.test(text))),
  changed_against_main: againstMain,
  worse_than_main: againstMain.filter((entry) => entry.changed.some((text) => /true -> false/.test(text))),
  monotonic_violations_flags_on_vs_off: monotonic,
}
writeFileSync(join(evidenceRoot, 'results', 'triplet-table.json'), `${JSON.stringify(out, null, 1)}\n`)
console.log(JSON.stringify({ main: out.main_summary, round_two: out.round_two_summary, this_candidate: out.this_candidate_summary, worse_than_round_two: out.worse_than_round_two.length, worse_than_main: out.worse_than_main.length, monotonic_violations: monotonic.length }, null, 1))
for (const entry of againstPrevious) console.log(`  vs round two: ${entry.key}  ${entry.changed.join('; ')}`)
for (const entry of monotonic) console.log(`  MONOTONIC VIOLATION ${JSON.stringify(entry)}`)
