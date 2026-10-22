// Red-first evidence: the round-2 pillar files run against the previous candidate (round 1, 04317126) and against this one.
// The previous candidate is checked out detached in the scratch baseline worktree and put back afterwards.
// usage: node red-first.mjs
import { spawnSync } from 'node:child_process'
import { appendFileSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { WORKTREE, evidenceRoot } from './run-candidate.mjs'

const BASE = process.env.KAWA_R1_BASE ?? 'C:/ns-fix/base'
const PREVIOUS = '04317126635a4207a3f9b9ba35ffccf053d16340'
const MAIN = '42daced1a52ca5b8e5ee2e0b982c28e697f184c9'
const PILLARS = [
  ['P419', 'apps/api/src/__tests__/unit/kael-emergency-electrical-spark-pillar.test.ts'],
  ['P420', 'apps/api/src/__tests__/kael-edge-runtime/domains/kael-case-emergency-playbook-precedence-pillar.test.ts'],
  ['P421', 'apps/api/src/__tests__/kael-edge-runtime/domains/kael-boundary-requested-work-pillar.test.ts'],
]

const outDir = join(evidenceRoot, 'results', 'red-first')
const logDir = join(evidenceRoot, 'logs', 'red-first')
mkdirSync(outDir, { recursive: true })
mkdirSync(logDir, { recursive: true })

const sh = (cwd, command) => spawnSync(command, { cwd, shell: true, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
const record = (entry) => appendFileSync(join(evidenceRoot, 'logs', 'red-first-commands.jsonl'), `${JSON.stringify({ utc: new Date().toISOString(), ...entry })}\n`)

function runPillars(cwd, label) {
  const summary = {}
  for (const [id, path] of PILLARS) {
    const jsonPath = join(outDir, `${label}-${id}.json`)
    const command = `corepack pnpm --filter @nestscout/api exec vitest run ${path.replace('apps/api/', '')} --reporter=default --reporter=json --outputFile.json=${jsonPath}`
    const result = sh(cwd, command)
    writeFileSync(join(logDir, `${label}-${id}.log.txt`), `${result.stdout ?? ''}\n----- stderr -----\n${result.stderr ?? ''}`)
    record({ label, id, cwd: cwd === WORKTREE ? '<candidate-worktree>' : '<scratch-baseline-worktree>', head: sh(cwd, 'git rev-parse HEAD').stdout.trim(), command, exit: result.status })
    summary[id] = result.status
    console.log(`${label}\t${id}\texit=${result.status}`)
  }
  return summary
}

const dirty = sh(BASE, 'git status --porcelain').stdout.trim()
if (dirty) throw new Error(`scratch baseline worktree is not clean:\n${dirty}`)
let previous
try {
  const checkout = sh(BASE, `git checkout --detach ${PREVIOUS}`)
  if (checkout.status !== 0) throw new Error(checkout.stderr)
  for (const [, path] of PILLARS) copyFileSync(join(WORKTREE, path), join(BASE, path))
  previous = runPillars(BASE, 'previous-candidate')
} finally {
  sh(BASE, 'git checkout -- .')
  sh(BASE, `git checkout --detach ${MAIN}`)
}
const current = runPillars(WORKTREE, 'this-candidate')

function tally(file) {
  const doc = JSON.parse(readFileSync(file, 'utf8'))
  const groups = new Map()
  let passed = 0
  let failed = 0
  for (const suite of doc.testResults) {
    for (const test of suite.assertionResults) {
      const key = test.ancestorTitles.slice(1).join(' > ') || test.ancestorTitles.join(' > ')
      const group = groups.get(key) ?? { passed: 0, failed: 0 }
      if (test.status === 'passed') { group.passed += 1; passed += 1 } else { group.failed += 1; failed += 1 }
      groups.set(key, group)
    }
  }
  return { passed, failed, total: passed + failed, groups: Object.fromEntries(groups) }
}

const out = { schema: 'nestscout.r2.red_first.v1', previous_candidate: PREVIOUS, exit_codes: { previous, current }, pillars: {} }
for (const [id] of PILLARS) {
  out.pillars[id] = {
    previous: tally(join(outDir, `previous-candidate-${id}.json`)),
    current: tally(join(outDir, `this-candidate-${id}.json`)),
  }
}
writeFileSync(join(evidenceRoot, 'results', 'red-first-summary.json'), `${JSON.stringify(out, null, 1)}\n`)
for (const [id, pair] of Object.entries(out.pillars)) {
  console.log(`${id}\tprevious: ${pair.previous.failed} failed of ${pair.previous.total}\tthis: ${pair.current.failed} failed of ${pair.current.total}`)
}
