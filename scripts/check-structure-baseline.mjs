// Ratchet lock for scripts/structure-baseline.json.
//
// lint-structure.mjs enforces the structural rules but grandfathers today's
// violations, and `--init` rewrites that grandfather list from whatever is on disk.
// An agent that adds an oversize file can therefore forgive itself and leave CI
// green, which is the one way the structure gets weaker without anything noticing.
//
// This compares the working tree against the merge base with the integration branch
// and fails when any allowance grew. There is deliberately no approval field: a
// value the agent writes is a value the agent can forge. Widening the baseline is
// meant to stay red on the branch so a human decides at review time; once merged,
// the wider baseline becomes the new base and later runs pass.

import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BASELINE_PATH = 'scripts/structure-baseline.json'
const INTEGRATION_BRANCHES = ['main', 'origin/main']

const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf-8' }).trim()

// A shallow checkout has no integration branch to reach, and falling back to HEAD
// there compares the tree with itself and passes no matter what was widened. The
// fallback is therefore reported as a reduced check rather than folded into the
// success line (governance/RULES.md #8).
function baseRef() {
  for (const branch of INTEGRATION_BRANCHES) {
    try {
      return { ref: git(['merge-base', 'HEAD', branch]), full: true }
    } catch {
      continue
    }
  }
  return { ref: git(['rev-parse', 'HEAD']), full: false }
}

function readBase(ref) {
  try {
    return JSON.parse(git(['show', `${ref}:${BASELINE_PATH}`]))
  } catch {
    return null
  }
}

const numbers = (value) => (value && typeof value === 'object' ? value : {})
const groups = (value) => (value && typeof value === 'object' ? value : {})

// `removalWeakens` splits the two kinds of map. Dropping a grandfathered entry means a
// violation was fixed, so it is progress. Dropping a frozen entry lifts a freeze, and
// lint-structure reads frozenPaths with `?? {}` — deleting the whole block disables it
// without a word, which is exactly the silent widening this gate exists to stop.
function compareNumberMap(before, after, label, problems, removalWeakens = false) {
  for (const [key, value] of Object.entries(numbers(after))) {
    const previous = numbers(before)[key]
    if (previous === undefined) problems.push(`${label}: new entry \`${key}\` (${value})`)
    else if (Number(value) > Number(previous)) problems.push(`${label}: \`${key}\` grew ${previous} -> ${value}`)
  }
  if (!removalWeakens) return
  for (const key of Object.keys(numbers(before))) {
    if (!(key in numbers(after))) problems.push(`${label}: \`${key}\` was removed, which lifts its freeze`)
  }
}

function compareGroupMap(before, after, label, problems) {
  for (const [key, value] of Object.entries(groups(after))) {
    const previous = groups(before)[key]
    if (previous === undefined) {
      problems.push(`${label}: new group \`${key}\``)
      continue
    }
    const known = new Set(Array.isArray(previous) ? previous : [])
    const added = (Array.isArray(value) ? value : []).filter((path) => !known.has(path))
    if (added.length) problems.push(`${label}: \`${key}\` gained ${added.join(', ')}`)
  }
}

export function compareBaselines(before, after) {
  if (!before) return { ok: true, problems: [], firstRun: true }
  const problems = []
  if (Number(after.maxLines) > Number(before.maxLines)) {
    problems.push(`maxLines raised ${before.maxLines} -> ${after.maxLines}`)
  }
  compareNumberMap(before.grandfatheredOversize, after.grandfatheredOversize, 'grandfatheredOversize', problems)
  compareGroupMap(before.grandfatheredDupTypes, after.grandfatheredDupTypes, 'grandfatheredDupTypes', problems)
  compareNumberMap(before.frozenPaths?.fileCounts, after.frozenPaths?.fileCounts, 'frozenPaths.fileCounts', problems, true)
  compareNumberMap(before.frozenPaths?.lines, after.frozenPaths?.lines, 'frozenPaths.lines', problems, true)
  return { ok: problems.length === 0, problems, firstRun: false }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = resolve(root, BASELINE_PATH)
  if (!existsSync(file)) {
    console.error(`missing ${BASELINE_PATH}`)
    process.exit(1)
  }
  const { ref, full } = baseRef()
  const short = ref.slice(0, 8)
  if (!full) {
    console.warn(`no integration branch reachable, so the base is HEAD (${short}).`)
    console.warn('Only an uncommitted widening can be caught here; fetch full history for the real comparison.')
  }
  const report = compareBaselines(readBase(ref), JSON.parse(readFileSync(file, 'utf-8')))
  if (report.firstRun) {
    console.log(`${BASELINE_PATH} does not exist at ${short}; nothing to compare`)
    process.exit(0)
  }
  if (report.ok) {
    console.log(`structure baseline is no weaker than ${short}${full ? '' : ' (reduced check)'}`)
    process.exit(0)
  }
  console.error(`structure baseline got weaker than ${short}:`)
  for (const problem of report.problems) console.error(`  - ${problem}`)
  console.error('')
  console.error('Split the file or drop the duplicate type instead of widening the baseline.')
  console.error('If the widening is intended, it needs Tu to approve it in review; never run `lint-structure.mjs --init`.')
  process.exitCode = 1
}
