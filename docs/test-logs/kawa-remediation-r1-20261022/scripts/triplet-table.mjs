// Route correctness, visible guidance and metadata, kept apart, for every frozen hazard checkpoint.
// usage: node triplet-table.mjs   (reads results/base/triplet.json and results/post/triplet.json)
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

const base = rowsOf(load(join(evidenceRoot, 'results/base/triplet.json')))
const post = rowsOf(load(join(evidenceRoot, 'results/post/triplet.json')))
const index = (rows) => new Map(rows.map((row) => [`${row.mode}|${row.flags}|${row.id}`, row]))
const baseIndex = index(base)
const postIndex = index(post)
const transitions = []
for (const [key, p] of postIndex) {
  const b = baseIndex.get(key)
  if (!b) continue
  const dims = ['route_correct', 'visible_acceptable', 'visible_exact', 'metadata_present']
  const changed = dims.filter((dim) => b[dim] !== p[dim]).map((dim) => `${dim}: ${b[dim]} -> ${p[dim]}`)
  if (changed.length > 0) transitions.push({ key, changed })
}
const regressions = transitions.filter((entry) => entry.changed.some((text) => /true -> false/.test(text)))
const monotonic = []
for (const [key, on] of postIndex) {
  const [mode, flags, id] = key.split('|')
  if (flags !== 'on') continue
  const off = postIndex.get(`${mode}|off|${id}`)
  if (!off) continue
  const dropped = off.numbers.filter((number) => !on.numbers.includes(number))
  const weaker = ['route_correct', 'visible_acceptable', 'visible_exact', 'metadata_present'].filter((dim) => off[dim] && !on[dim])
  if (dropped.length > 0 || weaker.length > 0) monotonic.push({ id: `${mode}/${id}`, dropped_numbers: dropped, weaker })
}
const out = {
  schema: 'nestscout.r1.triplet_table.v1',
  baseline_summary: summarize(base),
  candidate_summary: summarize(post),
  transitions,
  regressions,
  monotonic_violations_flags_on_vs_off_candidate: monotonic,
}
writeFileSync(join(evidenceRoot, 'results', 'triplet-table.json'), `${JSON.stringify(out, null, 1)}\n`)
console.log(JSON.stringify({ baseline: out.baseline_summary, candidate: out.candidate_summary, regressions: regressions.length, monotonic_violations: monotonic.length }, null, 1))
for (const entry of transitions) console.log(`  ${entry.key}  ${entry.changed.join('; ')}`)
for (const entry of monotonic) console.log(`  MONOTONIC VIOLATION ${JSON.stringify(entry)}`)
