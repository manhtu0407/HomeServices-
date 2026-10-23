// Compares the frozen-matrix verdicts of this candidate with the committed R2b results, scenario by scenario.
// usage: node compare-with-r2b.mjs <r2b results/post dir> <this results/post dir> <out.json>
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [r2bDir, thisDir, outPath] = process.argv.slice(2)
if (!r2bDir || !thisDir || !outPath) {
  console.error('usage: node compare-with-r2b.mjs <r2b post dir> <this post dir> <out.json>')
  process.exit(2)
}

function verdicts(file) {
  const doc = JSON.parse(readFileSync(file, 'utf8'))
  const byScenario = new Map()
  for (const run of doc.runs) {
    const key = run.scenario
    const bucket = byScenario.get(key) ?? []
    bucket.push(run.verdict)
    byScenario.set(key, bucket)
  }
  return { matrix_sha256: doc.matrix_sha256, scenarios: Object.fromEntries([...byScenario].map(([key, list]) => [key, [...new Set(list)].join('|')])) }
}

function journeyVerdicts(file) {
  const doc = JSON.parse(readFileSync(file, 'utf8'))
  const out = {}
  for (const run of doc.runs) {
    const key = `${run.scenario}`
    const checkpoints = run.checkpoints ?? run.variants?.flatMap((variant) => variant.checkpoints ?? []) ?? []
    out[key] = JSON.stringify(checkpoints.map((checkpoint) => [checkpoint.id, checkpoint.status ?? checkpoint.verdict]))
    out[`${key}#verdict`] = run.verdict
  }
  return out
}

const files = ['matrix.json', 'matrix-flags-on.json', 'supp-c6b.json', 'supp-c6b-flags-on.json']
const report = { r2b: r2bDir.replace(/\\/g, '/').replace(/^.*test-logs\//, ''), candidate: thisDir.replace(/\\/g, '/').replace(/^.*test-logs\//, ''), matrices: {}, journeys: {} }
for (const file of files) {
  const before = verdicts(join(r2bDir, file))
  const after = verdicts(join(thisDir, file))
  const ids = [...new Set([...Object.keys(before.scenarios), ...Object.keys(after.scenarios)])].sort()
  const changed = ids.filter((id) => before.scenarios[id] !== after.scenarios[id]).map((id) => ({ scenario: id, r2b: before.scenarios[id], candidate: after.scenarios[id] }))
  const tally = (scenarios) => Object.values(scenarios).reduce((acc, verdict) => ({ ...acc, [verdict]: (acc[verdict] ?? 0) + 1 }), {})
  report.matrices[file] = { same_matrix_hash: before.matrix_sha256 === after.matrix_sha256, scenarios: ids.length, r2b: tally(before.scenarios), candidate: tally(after.scenarios), changed }
}
for (const file of ['journey.json', 'journey-flags-on.json']) {
  const before = journeyVerdicts(join(r2bDir, file))
  const after = journeyVerdicts(join(thisDir, file))
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
  report.journeys[file] = { entries: keys.length, changed: keys.filter((key) => before[key] !== after[key]).map((key) => ({ key, r2b: before[key], candidate: after[key] })) }
}
writeFileSync(outPath, `${JSON.stringify(report, null, 1)}\n`)
console.log(JSON.stringify({
  matrices: Object.fromEntries(Object.entries(report.matrices).map(([file, value]) => [file, { scenarios: value.scenarios, same_hash: value.same_matrix_hash, changed: value.changed.length, r2b: value.r2b, candidate: value.candidate }])),
  journeys: Object.fromEntries(Object.entries(report.journeys).map(([file, value]) => [file, { entries: value.entries, changed: value.changed.length }])),
}, null, 1))
