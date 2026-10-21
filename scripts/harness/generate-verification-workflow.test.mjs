import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { parseProductionReleasePlan } from './production-release-runner.mjs'

const pipeline = readFileSync('scripts/harness/production-release-steps.yml', 'utf8')
const plan = parseProductionReleasePlan(pipeline)
const workflow = readFileSync('.github/workflows/release-production.yml', 'utf8').replace(/\r\n/gu, '\n')
const runner = readFileSync('scripts/harness/production-release-runner.mjs', 'utf8')

function productionWorkflowJobNames(source) {
  const jobsStart = source.indexOf('\njobs:\n')
  if (jobsStart < 0) throw new Error('release-production workflow has no jobs block')
  return [...source.slice(jobsStart + '\njobs:\n'.length).matchAll(/^ {2}([a-z][a-z0-9-]*):$/gmu)]
    .map((match) => match[1])
}

test('the local Stage 1 pipeline preserves its ordered release and recovery steps', () => {
  assert.equal(plan.steps[0].name, 'actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4')
  assert.equal(plan.steps[1].name, 'pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1 # v4')
  assert.equal(plan.steps[2].name, 'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4')
  assert.equal(plan.steps[3].name, 'pnpm install --frozen-lockfile')
  assert.equal(plan.steps[4].name, 'Verify immutable main source')
  assert.equal(plan.steps[5].name, 'Build immutable production release manifest')
  assert.equal(plan.steps[6].name, 'Verify Cloudflare target and capture independent rollback state')
  assert.equal(plan.steps[7].name, 'Reuse or build exact iOS and Android store binaries for this merge')
  assert.equal(plan.steps[8].name, 'Download and attest exact EAS binary artifacts')
  assert.equal(plan.steps[9].name, 'Collect hosted production baseline')
  assert.equal(plan.steps[10].name, 'Reconcile a stale cancelled candidate before starting a new release')
  assert.equal(plan.steps[11].name, 'Download and bind rollback_source')
  assert.equal(plan.steps[12].name, 'Assert hosted inventory and expand-only migration set')
  assert.equal(plan.steps[13].name, 'Apply exact expand-only migration inventory')
  assert.equal(plan.steps[14].name, 'Verify hosted migration watermark')
  assert.equal(plan.steps[15].name, 'Register immutable release')
  assert.equal(plan.steps[16].name, 'Verify the registered system monitor baseline before changing schedules')
  assert.equal(plan.steps[17].name, 'Apply pinned Cloudflare D1 migrations without deleting evidence')
  assert.equal(plan.steps[18].name, 'Configure exact synthetic cohort canary')
  assert.equal(plan.steps[19].name, 'Bind candidate release identity before one Edge deploy')
  assert.equal(plan.steps[20].name, 'Deploy and attest the system health collector before its observer')
  assert.equal(plan.steps[21].name, 'Deploy Cloudflare observer and verify its live D1 tick')
  assert.equal(plan.steps[22].name, 'Verify hosted candidate identity and bundle state')
  assert.equal(plan.steps[23].name, 'Redownload and byte-prove the exact hosted candidate import closure')
  assert.equal(plan.steps[24].name, 'Attest provider-owned deployment identity after byte proof')
  assert.equal(plan.steps[25].name, 'Provision and permanently classify dedicated synthetic actors')
  assert.equal(plan.steps[26].name, 'Warm the freshly deployed candidate before timed smokes')
  assert.equal(plan.steps[27].name, 'Run and record three consecutive full synthetic smokes')
  assert.equal(plan.steps[28].name, 'Recheck exact hosted deployment immediately before promotion')
  assert.equal(plan.steps[29].name, 'Prove the final synthetic cohort is clean before promotion')
  assert.equal(plan.steps[30].name, 'Atomically promote the proven release')
  assert.equal(plan.steps[31].name, 'Record the final Dev-review result in Supabase Production')
  assert.equal(plan.steps[32].name, 'Roll back system monitor schedules while preserving D1 evidence')
  assert.equal(plan.steps[33].name, 'Abort canary, restore identity, and redeploy downloaded rollback')
  assert.equal(plan.steps[34].name, 'Upload immutable release, smoke, and rollback evidence')
})

test('GitHub stays read-only while the local runner owns the reviewed Production lane', () => {
  assert.equal(plan.jobEnv.PRODUCTION_PROJECT_REF, 'iwevizmsedyqozxlawwl')
  assert.equal(plan.jobEnv.PRODUCTION_PROJECT_URL, 'https://iwevizmsedyqozxlawwl.supabase.co')
  assert.match(plan.steps[4].run, /test "\$\(git rev-parse HEAD\)" = "\$GITHUB_SHA"[\s\S]*test "\$GITHUB_REF" = "refs\/heads\/main"[\s\S]*test -z "\$\(git status --porcelain=v1 --untracked-files=all\)"/u)
  assert.deepEqual(productionWorkflowJobNames(workflow), ['stale-canary-reconciler', 'quality'])
  assert.doesNotMatch(workflow, /^ {2}(?:pull_request|workflow_dispatch):/mu)
  assert.doesNotMatch(workflow, /functions deploy|db push --linked|--action (?:configure|promote)|eas-cli@\S+ submit/u)
  assert.ok(workflow.includes("if: github.event_name != 'schedule' && github.ref == 'refs/heads/main'"))
  assert.ok(runner.includes('github-merge-approval.mjs'))
  assert.doesNotMatch(runner, /\bgh\s+pr\s+merge\b/u)
  assert.equal(Object.hasOwn(plan.jobEnv, 'SUPABASE_ACCESS_TOKEN'), false)
  assert.equal(plan.steps[7].env.EXPO_TOKEN, '${{ secrets.EXPO_TOKEN }}')
  assert.ok(plan.steps[7].run.includes('eas-cli@22.0.0'))
  assert.ok(plan.steps[7].run.includes('--git-commit-hash "$GITHUB_SHA"'))
  assert.equal(plan.steps[8].name, 'Download and attest exact EAS binary artifacts')
  assert.ok(plan.steps[27].run.includes('for sequence in 1 2 3'))
  const recoveryCondition = "always() && (failure() || cancelled()) && steps.configure.outcome != 'skipped'"
  assert.deepEqual(plan.steps.filter((step) => step.condition.includes('failure()')).map((step) => step.condition), [
    recoveryCondition,
    recoveryCondition,
  ])
})
