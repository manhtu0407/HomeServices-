// Builds the regression scorecard from raw result files. No verdict is typed by hand: every cell is derived.
// usage: node scorecard.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BASELINE, evidenceRoot } from './run-candidate.mjs'

const results = (name) => join(evidenceRoot, 'results', name)
const baseline = (name) => join(BASELINE, '03-results', name)
const load = (path) => JSON.parse(readFileSync(path, 'utf8'))

function byScenario(doc) {
  const map = new Map()
  for (const run of doc.runs) {
    const entry = map.get(run.scenario) ?? { service: run.service, class: run.class, runs: [] }
    entry.runs.push(run)
    map.set(run.scenario, entry)
  }
  return map
}

function verdictOf(entry) {
  const verdicts = [...new Set(entry.runs.map((run) => run.verdict))]
  return verdicts.length === 1 ? verdicts[0] : `UNSTABLE(${verdicts.join('/')})`
}

function gating(entry) {
  const map = {}
  for (const variant of entry.runs[0].variants ?? []) {
    for (const [name, value] of Object.entries(variant.assertions ?? {})) map[`${variant.variant}/${name}`] = value.pass
  }
  for (const checkpoint of entry.runs[0].checkpoints ?? []) map[checkpoint.id] = checkpoint.result
  return map
}

function compare(basePath, candPath, label) {
  const base = byScenario(load(basePath))
  const cand = byScenario(load(candPath))
  const rows = []
  for (const [id, b] of base) {
    const c = cand.get(id)
    if (!c) {
      rows.push({ id, service: b.service, class: b.class, from: verdictOf(b), to: 'MISSING', change: 'MISSING', assertions: [] })
      continue
    }
    const from = verdictOf(b)
    const to = verdictOf(c)
    const bg = gating(b)
    const cg = gating(c)
    const assertions = Object.keys({ ...bg, ...cg })
      .filter((key) => bg[key] !== cg[key])
      .map((key) => `${key}: ${String(bg[key])} -> ${String(cg[key])}`)
    const worsened = assertions.some((text) => /: (true|PASS) -> (false|FAIL|BLOCKED)/.test(text))
    const change = from === to
      ? (assertions.length === 0 ? `${from}->${to} unchanged` : (worsened ? 'REGRESSED' : `${from}->${to} (assertions improved)`))
      : (from === 'PASS' ? 'REGRESSED' : `${from}->${to}`)
    rows.push({ id, service: b.service, class: b.class, from, to, change, assertions })
  }
  const tally = {}
  for (const row of rows) tally[row.change] = (tally[row.change] ?? 0) + 1
  return { label, scenarios: rows.length, tally, rows }
}

const out = {
  schema: 'nestscout.r1.scorecard.v1',
  generated_by: 'scorecard.mjs from raw result files',
  matrix_flags_off: compare(baseline('after/matrix.json'), results('post/matrix.json'), 'flags off: accepted baseline (main 42daced1) vs candidate'),
  journey_flags_off: compare(baseline('after/journey.json'), results('post/journey.json'), 'S5 journeys, flags off'),
  matrix_flags_on: compare(baseline('supplementary/flags-on-after.json'), results('post/matrix-flags-on.json'), 'flags on: accepted baseline supplementary vs candidate'),
  supp_c6b_flags_off: compare(baseline('supplementary/suppC6b-after.json'), results('post/supp-c6b.json'), 'SUPP-C6b persistent write failure, flags off'),
  supp_c6b_flags_on: compare(results('base/supp-c6b-flags-on.json'), results('post/supp-c6b-flags-on.json'), 'SUPP-C6b persistent write failure, flags on (clean main 42daced1 rerun vs candidate)'),
  journey_flags_on: compare(results('pre/journey-flags-on.json'), results('post/journey-flags-on.json'), 'S5 journeys, flags on (pre-fix main vs candidate)'),
}
writeFileSync(join(evidenceRoot, 'results', 'scorecard.json'), `${JSON.stringify(out, null, 1)}\n`)
for (const key of ['matrix_flags_off', 'journey_flags_off', 'matrix_flags_on', 'supp_c6b_flags_off', 'supp_c6b_flags_on', 'journey_flags_on']) {
  const section = out[key]
  console.log(`## ${section.label}: ${section.scenarios} scenarios`)
  console.log(JSON.stringify(section.tally))
  for (const row of section.rows.filter((entry) => !/unchanged$/.test(entry.change))) console.log(`  ${row.id}\t${row.change}\t${row.assertions.join('; ')}`)
}
