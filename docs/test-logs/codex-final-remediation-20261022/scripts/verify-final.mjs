import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const evidence = join(root, 'docs/test-logs/codex-final-remediation-20261022')
const logs = join(evidence, 'logs/final')
mkdirSync(logs, { recursive: true })
const results = []
function step(name, command, env = {}) {
  const started = new Date().toISOString()
  const r = spawnSync(command, { cwd: root, shell: true, windowsHide: true, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 1200000, env: { ...process.env, ...env } })
  writeFileSync(join(logs, `${name}.txt`), `${r.stdout ?? ''}\n${r.stderr ?? ''}\n${r.error?.message ?? ''}`)
  results.push({ name, command, started, exit: r.status, signal: r.signal, error: r.error?.message ?? null })
  writeFileSync(join(evidence, 'results/final-commands.json'), JSON.stringify(results, null, 2) + '\n')
  console.log(`${name}: exit=${r.status}`, (r.stdout ?? '').split(/\r?\n/).filter((l) => /Test Files|Tests\s|Test Suites|sql verification|check.*clean/.test(l)).slice(-4).join(' | '))
  return r.status
}

const h5Target = join(root, 'apps/api/src/__tests__/kael-edge-runtime/domains/zz-h5-standard-eval-pillar.test.ts')
const oldH5 = join(root, 'docs/test-logs/kawa-four-blocker-20261022/scripts/h5')
try {
  copyFileSync(join(oldH5, 'zz-h5-standard-eval-pillar.test.ts'), h5Target)
  for (const [label, probes] of [
    ['previously-scored', join(oldH5, 'fresh-probes-20261022.json')],
    ['newly-authored', join(evidence, 'results/new-standard-probes.json')],
  ]) {
    const raw = join(evidence, `results/h5-${label}-final.json`)
    step(`h5-${label}`, 'corepack pnpm --filter @nestscout/api exec vitest run src/__tests__/kael-edge-runtime/domains/zz-h5-standard-eval-pillar.test.ts', {
      H5_EVAL_OUT: raw, H5_FRESH_PROBES: probes,
      H5_FRESH_SHA: createHash('sha256').update(readFileSync(probes)).digest('hex'),
    })
    step(`h5-${label}-analysis`, `node "${join(oldH5, 'analyse.mjs')}" "${raw}" "${join(evidence, `results/h5-${label}-summary.json`)}"`)
  }
} finally {
  rmSync(h5Target, { force: true })
}

const diagnostic = 'C:/Users/Phan Manh Tu/Desktop/home-services/.claude/worktrees/kael-harness-guardrails-adjust-2621fa/docs/test-logs'
step('frozen-matrix-and-drivers', `node "${join(evidence, 'scripts/reproduce.mjs')}" post`, {
  KAWA_R1_WORKTREE: root,
  KAWA_BASELINE_DIR: `${diagnostic}/kawa-diagnostic-baseline-20261021`,
  KAWA_AUDIT_DIR: `${diagnostic}/kawa-diagnostic-audit-20261022`,
})
for (const pkg of ['api', 'mobile', 'shared']) {
  step(`test-${pkg}`, `node scripts/run.mjs run-package-script @nestscout/${pkg} test`)
  step(`types-${pkg}`, `node scripts/run.mjs run-package-script @nestscout/${pkg} type-check`)
}
const gates = [
  ['comments-working', 'scripts/check-comment-discipline.mjs --working'],
  ['comments-full', 'scripts/check-comment-discipline.mjs'],
  ['test-integrity', 'scripts/check-test-integrity.mjs --working'],
  ['added-hygiene', 'scripts/check-added-source-hygiene.mjs --working'],
  ['reuse', 'scripts/check-reuse-ladder.mjs --working'],
  ['structure', 'scripts/lint-structure.mjs'],
  ['baseline', 'scripts/check-structure-baseline.mjs'],
  ['edge-db', 'scripts/check-edge-db-contract.mjs'],
  ['authority', 'scripts/check-authority-citations.mjs'],
  ['residue', 'scripts/check-source-residue.mjs'],
  ['protocol-routes', 'scripts/check-protocol-routes.mjs'],
  ['workplan-coverage', 'scripts/check-work-plan.mjs --coverage'],
  ['workflow-cost', 'scripts/check-workflow-cost.mjs'],
  ['test-collection', 'scripts/check-test-collection.mjs'],
  ['runner-parity', 'scripts/check-runner-parity.mjs'],
  ['skills-sync', 'scripts/check-skills-sync.mjs'],
  ['skill-contracts', 'scripts/check-skill-contracts.mjs'],
  ['artifact-assertions', 'scripts/find-artifact-text-assertions.mjs'],
  ['harness', 'scripts/harness/verify.mjs'],
  ['manifest', 'scripts/harness/check-manifest.mjs'],
  ['pillars', 'scripts/harness/pillar-registry.mjs'],
]
for (const [name, command] of gates) step(name, `node scripts/run.mjs run-node ${command}`)
step('edge-types', 'node scripts/run.mjs docker/scripts/edge-check')
console.log(JSON.stringify({ completed: results.length, failures: results.filter((r) => r.exit !== 0).map((r) => r.name) }))
process.exitCode = results.some((r) => r.exit !== 0) ? 1 : 0
