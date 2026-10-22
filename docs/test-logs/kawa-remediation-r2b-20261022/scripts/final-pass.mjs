// One complete regression pass on the follow-up candidate. Every command, working directory and exit code is recorded.
// usage: node final-pass.mjs   (needs KAWA_BASELINE_DIR and KAWA_AUDIT_DIR, see run-candidate.mjs)
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { WORKTREE, evidenceRoot } from './run-candidate.mjs'

const logDir = join(evidenceRoot, 'logs', 'final')
mkdirSync(logDir, { recursive: true })
const summary = []
const here = join(evidenceRoot, 'scripts')

function step(name, command, cwd = WORKTREE) {
  const started = new Date().toISOString()
  const result = spawnSync(command, { cwd, shell: true, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 })
  writeFileSync(join(logDir, `${name}.log.txt`), `${result.stdout ?? ''}\n----- stderr -----\n${result.stderr ?? ''}`)
  const record = { utc: started, name, cwd: '<candidate-worktree>', command, exit: result.status }
  appendFileSync(join(evidenceRoot, 'logs', 'final-commands.jsonl'), `${JSON.stringify(record)}\n`)
  summary.push(record)
  console.log(`${name}\texit=${result.status}`)
}

const R = 'node scripts/run.mjs'
const only = process.argv[2] ? new Set(process.argv[2].split(',')) : null
const run = (name, command) => {
  if (!only || only.has(name)) step(name, command)
}

run('api-full-suite', `${R} run-package-script @nestscout/api test`)
run('red-first', `node "${join(here, 'red-first.mjs')}"`)
run('matrix-and-drivers', `node "${join(here, 'reproduce.mjs')}" post`)
run('scorecard', `node "${join(here, 'scorecard.mjs')}"`)
run('triplet-table', `node "${join(here, 'triplet-table.mjs')}"`)
run('tables', `node "${join(here, 'make-tables.mjs')}"`)
run('type-check-api', `${R} run-package-script @nestscout/api type-check`)
run('type-check-shared', `${R} run-package-script @nestscout/shared type-check`)
run('test-shared', `${R} run-package-script @nestscout/shared test`)
run('type-check-mobile', `${R} run-package-script @nestscout/mobile type-check`)
run('test-mobile', `${R} run-package-script @nestscout/mobile test`)
run('lint-comments-working', `${R} run-node scripts/check-comment-discipline.mjs --working`)
run('lint-comments-full', `${R} run-node scripts/check-comment-discipline.mjs`)
run('lint-test-integrity-working', `${R} run-node scripts/check-test-integrity.mjs --working`)
run('lint-added-hygiene-working', `${R} run-node scripts/check-added-source-hygiene.mjs --working`)
run('lint-reuse-ladder', `${R} run-node scripts/check-reuse-ladder.mjs --working`)
run('lint-structure', `${R} run-node scripts/lint-structure.mjs`)
run('lint-baseline', `${R} run-node scripts/check-structure-baseline.mjs`)
run('lint-edge-db', `${R} run-node scripts/check-edge-db-contract.mjs`)
run('lint-authority', `${R} run-node scripts/check-authority-citations.mjs`)
run('lint-source-residue', `${R} run-node scripts/check-source-residue.mjs`)
run('lint-protocol-routes', `${R} run-node scripts/check-protocol-routes.mjs`)
run('lint-work-plan-coverage', `${R} run-node scripts/check-work-plan.mjs --coverage`)
run('lint-workflow-cost', `${R} run-node scripts/check-workflow-cost.mjs`)
run('lint-test-collection', `${R} run-node scripts/check-test-collection.mjs`)
run('lint-runner-parity', `${R} run-node scripts/check-runner-parity.mjs`)
run('lint-skills-sync', `${R} run-node scripts/check-skills-sync.mjs`)
run('lint-skill-contracts', `${R} run-node scripts/check-skill-contracts.mjs`)
run('lint-artifact-text-assertions', `${R} run-node scripts/find-artifact-text-assertions.mjs`)
run('harness-verify', `${R} run-node scripts/harness/verify.mjs`)
run('harness-manifest-check', `${R} run-node scripts/harness/check-manifest.mjs`)
run('pillar-registry-check', `${R} run-node scripts/harness/pillar-registry.mjs`)
run('edge-check-docker-pinned-deno', `${R} docker/scripts/edge-check`)
const summaryPath = join(evidenceRoot, 'results', 'final-pass-summary.json')
const previous = existsSync(summaryPath) ? JSON.parse(readFileSync(summaryPath, 'utf8')) : []
const merged = [...previous.filter((entry) => !summary.some((fresh) => fresh.name === entry.name)), ...summary]
writeFileSync(summaryPath, `${JSON.stringify(merged, null, 1)}\n`)
