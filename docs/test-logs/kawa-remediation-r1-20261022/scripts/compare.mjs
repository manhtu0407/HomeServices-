// Compares two scored result files (matrix or journey) by verdict and per-assertion / per-checkpoint outcome.
// usage: node compare.mjs <reference.json> <candidate.json> [--table]
import { readFileSync } from 'node:fs'

const [referencePath, candidatePath, flag] = process.argv.slice(2)
if (!referencePath || !candidatePath) {
  console.error('usage: node compare.mjs <reference.json> <candidate.json> [--table]')
  process.exit(2)
}

function signature(file) {
  const doc = JSON.parse(readFileSync(file, 'utf8'))
  const map = new Map()
  for (const run of doc.runs) {
    const entries = []
    for (const variant of run.variants ?? []) {
      for (const [name, value] of Object.entries(variant.assertions ?? {})) entries.push(`${variant.variant}/gate/${name}=${value.pass}`)
      for (const [name, value] of Object.entries(variant.non_gating_assertions ?? {})) entries.push(`${variant.variant}/info/${name}=${value.pass}`)
    }
    for (const checkpoint of run.checkpoints ?? []) entries.push(`${checkpoint.id}=${checkpoint.result}`)
    map.set(`${run.scenario}#${run.run}`, { verdict: run.verdict, entries: entries.sort() })
  }
  return map
}

const reference = signature(referencePath)
const candidate = signature(candidatePath)
const subset = process.argv.includes("--ref-subset")
const keys = (subset ? [...reference.keys()] : [...new Set([...reference.keys(), ...candidate.keys()])]).sort()
let verdictChanges = 0
let entryChanges = 0
const rows = []
for (const key of keys) {
  const a = reference.get(key)
  const b = candidate.get(key)
  if (!a || !b) {
    rows.push({ key, note: 'missing in one side' })
    verdictChanges += 1
    continue
  }
  const aSet = new Set(a.entries)
  const bSet = new Set(b.entries)
  const changed = [...aSet].filter((item) => !bSet.has(item)).map((item) => `-${item}`)
    .concat([...bSet].filter((item) => !aSet.has(item)).map((item) => `+${item}`))
  if (a.verdict !== b.verdict) verdictChanges += 1
  entryChanges += changed.length
  rows.push({ key, from: a.verdict, to: b.verdict, changed })
}
const differing = rows.filter((row) => row.note || row.from !== row.to || row.changed.length > 0)
if (flag === '--table') for (const row of rows) console.log(`${row.key}\t${row.from ?? '-'}\t${row.to ?? '-'}\t${(row.changed ?? []).length}`)
console.log(JSON.stringify({ reference: referencePath.split(/[\\/]/).slice(-2).join('/'), candidate: candidatePath.split(/[\\/]/).slice(-2).join('/'), runs_compared: keys.length, verdict_changes: verdictChanges, entry_changes: entryChanges, differing: differing.slice(0, 40) }, null, 1))
process.exit(differing.length === 0 ? 0 : 1)
