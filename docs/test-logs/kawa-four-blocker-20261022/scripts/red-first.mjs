// Red-first proof for the electrical boundary change: the changed and new pillars are run against the PR #405 head's
// boundary-guard.ts (red), then against the candidate's (green). The candidate file is restored in a finally block.
// usage: node red-first.mjs   (run from any directory; the candidate worktree is KAWA_R1_WORKTREE, default C:/ns-fix/b4)
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const evidenceRoot = resolve(here, '..')
const worktree = process.env.KAWA_R1_WORKTREE ?? 'C:/ns-fix/b4'
const BASE = '8e859073ca1412f4a18fa6d3517a3e8fe3578b1f'
const GUARD = 'supabase/functions/mobile-api/_shared/kael/kael-guardrails/boundary-guard.ts'
const tests = [
  'src/__tests__/kael-edge-runtime/domains/kael-boundary-requested-work-pillar.test.ts',
  'src/__tests__/kael-edge-runtime/domains/kael-boundary-electrical-flag-parity-pillar.test.ts',
]

const run = (command, cwd) => spawnSync(command, { cwd, shell: true, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
const outDir = join(evidenceRoot, 'results', 'red-first')
mkdirSync(outDir, { recursive: true })

function vitest(label) {
  const summary = {}
  for (const test of tests) {
    const json = join(outDir, `${label}-${test.split('/').pop()}.json`)
    const result = run(`corepack pnpm exec vitest run ${test} --reporter=json --outputFile="${json}"`, join(worktree, 'apps/api'))
    let parsed = null
    try { parsed = JSON.parse(readFileSync(json, 'utf8')) } catch { /* the run produced no JSON */ }
    summary[test.split('/').pop()] = parsed
      ? { passed: parsed.numPassedTests, failed: parsed.numFailedTests, total: parsed.numTotalTests, exit: result.status }
      : { exit: result.status, note: 'no JSON produced' }
  }
  return summary
}

const guardPath = join(worktree, GUARD)
const candidate = readFileSync(guardPath)
let red
let green
try {
  const base = run(`git show ${BASE}:${GUARD}`, worktree)
  if (base.status !== 0) throw new Error(`cannot read the base boundary guard: ${base.stderr}`)
  writeFileSync(guardPath, base.stdout)
  red = vitest(`red-on-${BASE.slice(0, 8)}`)
} finally {
  writeFileSync(guardPath, candidate)
}
green = vitest('green-on-candidate')
const report = { base: BASE, red, green, restored: readFileSync(guardPath).equals(candidate) }
writeFileSync(join(evidenceRoot, 'results', 'red-first-summary.json'), `${JSON.stringify(report, null, 1)}\n`)
console.log(JSON.stringify(report, null, 1))
if (!report.restored) process.exit(3)
