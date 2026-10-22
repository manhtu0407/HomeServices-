// One complete regression pass on the stabilised candidate. Every command, working directory and exit code is recorded.
// usage: node final-pass.mjs
import { spawnSync } from 'node:child_process'
import { appendFileSync, copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { WORKTREE, evidenceRoot } from './run-candidate.mjs'

const BASE = process.env.KAWA_R1_BASE ?? 'C:/ns-fix/base'
const logDir = join(evidenceRoot, 'logs', 'final')
mkdirSync(logDir, { recursive: true })
const summary = []

function step(name, command, cwd = WORKTREE) {
  const started = new Date().toISOString()
  const result = spawnSync(command, { cwd, shell: true, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 })
  writeFileSync(join(logDir, `${name}.log.txt`), `${result.stdout ?? ''}\n----- stderr -----\n${result.stderr ?? ''}`)
  const record = { utc: started, name, cwd: cwd === WORKTREE ? '<remediation-worktree>' : '<baseline-worktree>', command, exit: result.status }
  appendFileSync(join(evidenceRoot, 'logs', 'final-commands.jsonl'), `${JSON.stringify(record)}\n`)
  summary.push(record)
  console.log(`${name}\texit=${result.status}`)
}

const R = 'node scripts/run.mjs'
const NEW_PILLARS = [
  ['P419', 'apps/api/src/__tests__/unit/kael-emergency-electrical-spark-pillar.test.ts'],
  ['P420', 'apps/api/src/__tests__/kael-edge-runtime/domains/kael-case-emergency-playbook-precedence-pillar.test.ts'],
  ['P421', 'apps/api/src/__tests__/kael-edge-runtime/domains/kael-boundary-requested-work-pillar.test.ts'],
]

step('api-full-suite', `${R} run-package-script @nestscout/api test`)
for (const [id, path] of NEW_PILLARS) {
  copyFileSync(join(WORKTREE, path), join(BASE, path))
  try {
    step(`red-on-baseline-${id}`, `corepack pnpm --filter @nestscout/api exec vitest run ${path.replace('apps/api/', '')}`, BASE)
  } finally {
    rmSync(join(BASE, path), { force: true })
  }
}
step('type-check-api', `${R} run-package-script @nestscout/api type-check`)
step('lint-comments-working', `${R} run-node scripts/check-comment-discipline.mjs --working`)
step('lint-test-integrity-working', `${R} run-node scripts/check-test-integrity.mjs --working`)
step('lint-added-hygiene-working', `${R} run-node scripts/check-added-source-hygiene.mjs --working`)
step('lint-structure', `${R} run-node scripts/lint-structure.mjs`)
step('lint-baseline', `${R} run-node scripts/check-structure-baseline.mjs`)
step('lint-edge-db', `${R} run-node scripts/check-edge-db-contract.mjs`)
step('lint-authority', `${R} run-node scripts/check-authority-citations.mjs`)
step('pillar-registry-check', `${R} run-node scripts/harness/pillar-registry.mjs`)
step('edge-check-docker-pinned-deno', `${R} docker/scripts/edge-check`)
step('ship-check', `${R} run-node scripts/check-ship-ready.mjs`)
step('matrix-and-drivers', `node docs/test-logs/kawa-remediation-r1-20261022/scripts/reproduce.mjs post`)
step('scorecard', 'node docs/test-logs/kawa-remediation-r1-20261022/scripts/scorecard.mjs')
step('triplet-table', 'node docs/test-logs/kawa-remediation-r1-20261022/scripts/triplet-table.mjs')
step('tables', 'node docs/test-logs/kawa-remediation-r1-20261022/scripts/make-tables.mjs')
writeFileSync(join(evidenceRoot, 'results', 'final-pass-summary.json'), `${JSON.stringify(summary, null, 1)}\n`)
