import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const apiNodeTests = [
  'apps/api/scripts/lib/kael-playbook-eval-targets.test.mjs',
  'apps/api/scripts/lib/plan55-independent-holdout-review.test.mjs',
  'apps/api/scripts/lib/plan55-production-canary-core.test.mjs',
  'apps/api/scripts/lib/plan55-production-canary-checkpoint-store.test.mjs',
  'apps/api/scripts/lib/plan55-production-canary-operations.test.mjs',
  'apps/api/scripts/lib/plan55-production-release-preflight.test.mjs',
  'scripts/check-edge-db-contract.test.mjs',
  'scripts/harness/runtime-release-bindings.test.mjs',
  'scripts/harness/plan55-workflow-contract.test.mjs',
]

export function apiTestCommandPlan(vitestOptions = []) {
  return {
    vitestArgs: ['run', ...vitestOptions],
    nodeRunnerArgs: [
      resolve(packageRoot, '../../scripts/run.mjs'),
      'run-node',
      '--test',
      ...apiNodeTests,
    ],
  }
}

function run(args) {
  const plan = apiTestCommandPlan(args)
  const vitest = spawnSync(process.execPath, [
    resolve(packageRoot, 'node_modules/vitest/vitest.mjs'),
    ...plan.vitestArgs,
  ], { cwd: packageRoot, stdio: 'inherit' })
  if (vitest.error) {
    process.stderr.write(`API Vitest could not start: ${vitest.error.message}\n`)
    return 1
  }
  if (vitest.status !== 0) return vitest.status ?? 1

  const nodeTests = spawnSync(process.execPath, plan.nodeRunnerArgs, {
    cwd: packageRoot,
    stdio: 'inherit',
  })
  if (nodeTests.error) {
    process.stderr.write(`API Node tests could not start: ${nodeTests.error.message}\n`)
    return 1
  }
  return nodeTests.status ?? 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(run(process.argv.slice(2)))
}
