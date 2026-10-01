import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { apiTestCommandPlan } from '../../apps/api/scripts/test-runner.mjs'

const releasePath = '.github/workflows/plan55-production-only.yml'
const servicePath = '.github/workflows/plan55-production-canary-service.yml'
const ciPath = '.github/workflows/ci.yml'
const release = readFileSync(releasePath, 'utf8')
const service = readFileSync(servicePath, 'utf8')
const ci = readFileSync(ciPath, 'utf8')
const sourceAttestation = readFileSync('apps/api/scripts/lib/kael-playbook-production-attestation.mjs', 'utf8')
const canaryCore = readFileSync('apps/api/scripts/lib/plan55-production-canary-core.mjs', 'utf8')
const canaryCli = readFileSync('apps/api/scripts/kael-playbook-production-canary.mjs', 'utf8')
const checkpointStore = readFileSync('apps/api/scripts/lib/plan55-production-canary-checkpoint-store.mjs', 'utf8')
const apiPackage = JSON.parse(readFileSync('apps/api/package.json', 'utf8'))

function needsFor(job) {
  const match = new RegExp(`^  ${job}:\\r?\\n    needs: (.+)$`, 'mu').exec(release)
  assert.ok(match, `workflow must declare needs for ${job}`)
  const value = match[1].trim()
  return value.startsWith('[')
    ? value.slice(1, -1).split(',').map((item) => item.trim())
    : [value]
}

function jobBlock(workflow, name) {
  const header = new RegExp(`^  ${name}:\\r?\\n`, 'mu')
  const match = header.exec(workflow)
  assert.ok(match, `workflow must declare ${name}`)
  const rest = workflow.slice(match.index + match[0].length)
  const nextJob = /^  [A-Za-z0-9_-]+:/mu.exec(rest)
  return nextJob ? rest.slice(0, nextJob.index) : rest
}

function expectWorkflowMatch(workflow, pattern, message) {
  assert.ok(pattern.test(workflow), message)
}

test('protected-boundary checks compare against the current pull request base', () => {
  const start = ci.indexOf('      - name: Confirm protected boundaries')
  assert.notEqual(start, -1, 'CI must keep the protected-boundary check')
  const next = ci.indexOf('\n      - name:', start + 1)
  const protectedBoundaries = ci.slice(start, next === -1 ? ci.length : next)

  expectWorkflowMatch(protectedBoundaries, /origin\/\$\{\{ github\.base_ref \}\}/u,
    'protected-boundary comparisons must follow the current PR base after a retarget')
  assert.doesNotMatch(protectedBoundaries, /origin\/codex\/plan55-production-base-[^\s"]+/u,
    'protected-boundary checks must not retain a stale Plan 55 base branch')
})

test('Plan 55 release dispatches from default main and enforces Production-base ancestry without targeting Staging', () => {
  expectWorkflowMatch(release, /^on:\r?\n  workflow_call:/mu, 'release must be callable by the registered CI workflow')
  assert.ok(!/^  (?:push|pull_request|schedule|workflow_dispatch):/mu.test(release),
    'release must not auto-start or depend on default-branch dispatch registration')
  expectWorkflowMatch(release, /workflow_call:[\s\S]*?inputs:[\s\S]*?source_sha:/u,
    'reusable release must require the exact source SHA')
  const secretNames = [
    'ANTHROPIC_API_KEY',
    'DEEPSEEK_API_KEY',
    'EXPO_TOKEN',
    'PERPLEXITY_API_KEY',
    'PRODUCTION_SUPABASE_ANON_KEY',
    'PRODUCTION_SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_ACCESS_TOKEN',
    'VIETMAP_API_KEY',
  ]
  for (const secretName of secretNames) {
    expectWorkflowMatch(release, new RegExp(`^      ${secretName}:\\r?\\n        required: false$`, 'mu'),
      `reusable release must declare ${secretName} as an optional caller secret for structured preflight`)
  }
  expectWorkflowMatch(release, /refs\/heads\/main/u,
    'release must run from the default branch so GitHub can dispatch the registered workflow')
  expectWorkflowMatch(release, /inputs\.source_sha == github\.sha/u,
    'release input must match the dispatched commit')
  expectWorkflowMatch(release, /git merge-base --is-ancestor "\$base_sha" "\$GITHUB_SHA"/u,
    'release SHA must descend from the exact Production base even after main advances')
  assert.doesNotMatch(release, /git show -s --format=%P/u,
    'release ancestry must not assume its first parent is the Production base')
  assert.doesNotMatch(`${release}\n${service}`, /staging/iu)
})

test('Plan 55 can be dispatched through the registered CI workflow without rerunning its other lanes', () => {
  const controls = jobBlock(ci, 'controls')
  const guard = jobBlock(ci, 'plan55-dispatch-guard')
  const caller = jobBlock(ci, 'plan55-production-only')
  const workspace = jobBlock(ci, 'workspace')
  const database = jobBlock(ci, 'database')

  expectWorkflowMatch(ci, /^  workflow_dispatch:\r?\n    inputs:\r?\n      plan55_source_sha:/mu,
    'registered CI workflow must accept an optional Plan 55 source SHA')
  expectWorkflowMatch(ci, /plan55_source_sha:[\s\S]*?required: false[\s\S]*?type: string/u,
    'Plan 55 source SHA must remain an optional string so ordinary CI dispatches are unchanged')
  expectWorkflowMatch(ci, /Exact merged SHA on default main descended from the pinned Production release base/u,
    'dispatch input must describe the default-branch source used after the Plan 55 merge')
  expectWorkflowMatch(controls, /if:[^\r\n]*inputs\.plan55_source_sha == ''/u,
    'Plan 55 dispatch must skip ordinary controls')
  expectWorkflowMatch(guard, /if:[^\r\n]*github\.event_name == 'workflow_dispatch'[^\r\n]*inputs\.plan55_source_sha != ''/u,
    'source guard must run only for an explicit manual Plan 55 dispatch')
  expectWorkflowMatch(guard, /PLAN55_SOURCE_SHA: \$\{\{ inputs\.plan55_source_sha \}\}/u,
    'guard must validate the supplied SHA')
  expectWorkflowMatch(guard, /refs\/heads\/main/u,
    'guard must allow only the registered default-branch workflow')
  assert.doesNotMatch(guard, /refs\/heads\/codex\/plan55-production-base-[^\s"]+/u,
    'dispatch guard must not target the feature-only Production-base branch')
  expectWorkflowMatch(guard, /test "\$PLAN55_SOURCE_SHA" = "\$GITHUB_SHA"/u,
    'guard must reject stale or substituted SHAs')
  expectWorkflowMatch(guard, /\[\[ ! "\$PLAN55_SOURCE_SHA" =~ \^\[a-f0-9\]\{40\}\$ \]\]/u,
    'guard must require a full hexadecimal commit SHA')
  expectWorkflowMatch(caller, /needs: plan55-dispatch-guard/u,
    'release call must depend on the source guard')
  expectWorkflowMatch(caller, /if:[^\r\n]*github\.event_name == 'workflow_dispatch'[^\r\n]*inputs\.plan55_source_sha != ''[^\r\n]*needs\.plan55-dispatch-guard\.result == 'success'/u,
    'reusable release must require an explicit dispatch, non-empty SHA, and successful exact-ref guard')
  expectWorkflowMatch(caller, /uses: \.\/\.github\/workflows\/plan55-production-only\.yml/u,
    'registered CI workflow must call the local reusable release')
  expectWorkflowMatch(caller, /source_sha: \$\{\{ inputs\.plan55_source_sha \}\}/u,
    'release call must pass the exact guarded SHA')
  assert.doesNotMatch(caller, /secrets: inherit/u,
    'reusable release must not inherit unrelated caller secrets')
  for (const secretName of [
    'ANTHROPIC_API_KEY',
    'DEEPSEEK_API_KEY',
    'EXPO_TOKEN',
    'PERPLEXITY_API_KEY',
    'PRODUCTION_SUPABASE_ANON_KEY',
    'PRODUCTION_SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_ACCESS_TOKEN',
    'VIETMAP_API_KEY',
  ]) {
    expectWorkflowMatch(caller, new RegExp(`^      ${secretName}: \\$\\{\\{ secrets\\.${secretName} \\}\\}$`, 'mu'),
      `reusable release must receive only its declared ${secretName} secret`)
  }
  expectWorkflowMatch(caller, /actions: read[\s\S]*?checks: read[\s\S]*?contents: read[\s\S]*?pull-requests: read/u,
    'reusable release must receive its declared read-only token permissions')
  expectWorkflowMatch(database, /needs: controls/u,
    'ordinary SQL lane must remain behind controls')
  expectWorkflowMatch(workspace, /inputs\.plan55_source_sha == ''/u,
    'ordinary workspace lane must skip a Plan 55 dispatch')
  expectWorkflowMatch(database, /inputs\.plan55_source_sha == ''/u,
    'ordinary SQL lane must skip a Plan 55 dispatch')
})

test('the serialized canary timeout reserves unconditional cleanup and setup time for checkpoint recovery', () => {
  assert.match(service, /^    timeout-minutes: 360$/mu)
  assert.match(service, /Leave 30 minutes beyond cleanup for setup, preflight, and artifact upload/u)
  assert.match(service, /timeout-minutes: 310/u)
  assert.match(service, /timeout-minutes: 20/u)
  assert.equal(310 + 20 + 30, 360)
  assert.match(release, /forward_binding_text=\$\(node scripts\/harness\/runtime-release-bindings\.mjs[\s\S]*?--mobile-attestation artifacts\/release\/mobile-binary-attestation\.json\)/u)
  assert.match(release, /supabase secrets unset "\$\{unset_bindings\[@\]\}"[\s\\]*--project-ref/u)
  assert.match(release, /baseline_binding_names\["\$\{binding%%=\*\}"\]=1/u)
})

test('guard deploy is rollback-protected, deploys only mobile-api, and applies no migration or global service flag', () => {
  assert.match(release, /plan55-production-release-preflight\.mjs/u)
  assert.match(release, /runtime-release-bindings\.mjs/u)
  assert.match(release, /functions deploy mobile-api/u)
  assert.match(release, /rollback\(\)/u)
  assert.match(release, /hosted-after-rollback\.json/u)
  assert.doesNotMatch(release, /functions deploy kael-matching-maintainer/u)
  assert.doesNotMatch(release, /\bdb push\b/u)
  assert.doesNotMatch(release, /KAEL_PLAYBOOK_(?:HVAC|HANDYMAN|CLEANING|UPHOLSTERY|PLUMBING|ELECTRICAL)_ENABLED/u)
})

test('independent holdout approvals and guard CI are required before assembling or mutating Production', () => {
  const deploy = jobBlock(release, 'deploy_guard_off')
  const reviewGateIndex = deploy.indexOf('node apps/api/scripts/plan55-independent-holdout-preflight.mjs')
  const assembleIndex = deploy.indexOf('name: Assemble exact Production release and prove rollback source')
  const deployIndex = deploy.indexOf('functions deploy mobile-api')

  assert.ok(reviewGateIndex >= 0, 'Production deploy must run the independent holdout preflight')
  assert.ok(assembleIndex > reviewGateIndex, 'review eligibility must be established before Production release assembly')
  assert.ok(deployIndex > assembleIndex, 'release assembly must precede the actual Edge deployment')
  assert.match(deploy, /GH_TOKEN: \$\{\{ github\.token \}\}/u,
    'preflight must use the workflow-scoped read-only GitHub token')
  assert.match(deploy, /PLAN55_SOURCE_SHA: \$\{\{ inputs\.source_sha \}\}/u,
    'preflight must validate the exact dispatched source SHA')
  assert.match(release, /pull-requests: read/u,
    'the workflow token must keep pull-request access read-only')
  assert.match(release, /checks: read/u,
    'the workflow token must keep guard-check access read-only')
})

test('holdout review is revalidated immediately before the first Production write', () => {
  const gatePath = 'node apps/api/scripts/plan55-independent-holdout-preflight.mjs'
  const firstGate = release.indexOf(gatePath)
  const finalGate = release.indexOf(gatePath, firstGate + gatePath.length)
  const register = release.indexOf('node scripts/harness/release-control.mjs --action register')
  const deployStep = release.slice(release.indexOf('      - name: Register release metadata and deploy actor-scoped guard'))

  assert.ok(firstGate >= 0 && finalGate > firstGate,
    'review eligibility must be checked early and again after long release assembly')
  assert.ok(register > finalGate,
    'no release registration or secret/Edge mutation may precede the fresh review check')
  assert.match(deployStep, /GH_TOKEN: \$\{\{ github\.token \}\}/u,
    'the final review check must use the read-only workflow token')
  assert.match(deployStep, /PLAN55_SOURCE_SHA: \$\{\{ inputs\.source_sha \}\}/u,
    'the final review check must remain bound to the exact source SHA')
  assert.match(deployStep, /trap rollback EXIT[\s\S]*?node apps\/api\/scripts\/plan55-independent-holdout-preflight\.mjs[\s\S]*?release-control\.mjs --action register/u,
    'the immediate recheck must fail before release registration while retaining existing rollback behavior')
})

test('Production source attestation is bound to downloaded hosted Edge bytes and live deployment metadata', () => {
  const downloadIndex = release.indexOf('functions download mobile-api')
  const proofIndex = release.indexOf('production-edge-source-proof.json')
  const attestIndex = release.indexOf('kael-playbook-production-attest.mjs')
  assert.ok(downloadIndex >= 0 && proofIndex > downloadIndex && attestIndex > proofIndex,
    'deployed source must be downloaded and source-proofed before attestation')
  assert.match(release, /edge-source-proof\.mjs --source-root artifacts\/deployed-source[\s\S]*?--verify-hosted/u)
  assert.match(sourceAttestation, /'deployed_source'/u)
  const operations = readFileSync('apps/api/scripts/lib/plan55-production-canary-operations.mjs', 'utf8')
  assert.match(operations, /functions\/mobile-api[\s\S]*?current\.ezbr_sha256/u)
  assert.match(operations, /expected\.function_id/u)
})

test('service workflow preserves order and resumes only an exact-source cleaned checkpoint', () => {
  const ordered = ['hvac', 'handyman', 'cleaning', 'upholstery', 'plumbing', 'electrical']
  for (const [index, serviceName] of ordered.entries()) {
    const expectedNeeds = ['deploy_guard_off', ...ordered.slice(0, index)]
    assert.deepEqual(needsFor(serviceName), expectedNeeds, `${serviceName} must wait for the release and all prior services`)
    assert.match(release, new RegExp(`service: ${serviceName}\\r?\\n`, 'u'))
  }
  assert.deepEqual(needsFor('validate-six-receipts'), ['deploy_guard_off', ...ordered])
  assert.match(service, /timeout-minutes: 360/u)
  assert.match(service, /--run --service "\$PLAN55_SERVICE"/u)
  assert.match(service, /BLOCKED_UNVERIFIED/u)
  assert.match(service, /records\/\*\*/u)
  assert.match(service, /actions\/runs\/\$\{runId\}\/artifacts/u)
  assert.match(service, /steps\.resume\.outputs\.artifact_id/u)
  assert.match(service, /plan55-start-\$\{runId\}-/u)
  assert.match(service, /id: started/u)
  assert.match(service, /actor_id: actorId/u)
  assert.match(service, /actor_id=\$\{actorId\}/u)
  assert.match(service, /recovery_artifact_ids=\$\{starts\.map/u)
  assert.match(service, /'--recover-interrupted',\s*'--service'/u)
  assert.match(service, /plan55_resume_interrupted_cleanup_failed/u)
  assert.match(service, /Resume only from an exact-source checkpoint with verified cleanup/u)
  assert.match(service, /plan55_resume_prior_attempt_not_reusable/u)
  assert.match(service, /assertPlan55ReusableServiceAttempt/u)
  assert.match(service, /--checkpoint-status/u)
  assert.match(canaryCli, /--recover-interrupted/u)
  assert.match(canaryCli, /recoverInterruptedServiceCheckpoint/u)
  assert.match(checkpointStore, /readInterruptedServiceCheckpoint/u)
  assert.match(checkpointStore, /recoverInterruptedServiceCheckpoint/u)
  assert.match(service, /PLAN55_CANARY_ACTOR_ID: \$\{\{ steps\.started\.outputs\.actor_id \}\}/u)
  assert.match(service, /timeout-minutes: 310/u)
  assert.match(service, /name: Always remove the scoped actor flag and prove Auth and row cleanup/u)
  assert.match(service, /if: always\(\) && steps\.started\.outputs\.actor_id != ''/u)
  assert.match(service, /timeout-minutes: 20/u)
  assert.match(service, /--cleanup-only --service "\$PLAN55_SERVICE" --actor-id "\$PLAN55_CANARY_ACTOR_ID"/u)
  assert.match(service, /proof\?\.globalFlags !== 'absent'/u)
  assert.match(service, /proof\?\.authStatus !== 404/u)
  assert.match(service, /proof\?\.orphanWorkers !== 0/u)
  assert.ok(service.indexOf('name: Restore this service\'s prior attempt checkpoint') <
    service.indexOf('name: Clean interrupted actors and reconcile the restored checkpoint'))
  assert.ok(service.indexOf('name: Clean interrupted actors and reconcile the restored checkpoint') >
    service.indexOf('name: Restore exact actor identities from interrupted service starts'))
  assert.match(service, /recovered-\$\{runId\}-by-\$\{process\.env\.GITHUB_RUN_ATTEMPT\}\.json/u)
  assert.match(service, /release_id: release\.releaseId/u)
  assert.match(service, /group: plan55-production-canary-\$\{\{ github\.repository \}\}/u)
  assert.ok(service.indexOf('name: Always remove the scoped actor flag and prove Auth and row cleanup') >
    service.indexOf('name: Run one service and capture only a scrubbed receipt or safe failure code'))
  assert.ok(service.indexOf('name: Preserve this service receipt and attempt evidence') >
    service.indexOf('name: Always remove the scoped actor flag and prove Auth and row cleanup'))
  assert.match(canaryCore, /serviceStatus.cleanup_verified !== true/u)
  assert.match(canaryCore, /assertPlan55Cleanup\(serviceResult\?\.cleanup\)/u)
  assert.match(canaryCore, /checkpointStatus\.deployment\?\.source_sha/u)
  assert.match(service, /previous_attempt=\$\{selected\?\.attempt/u)
  assert.match(service, /plan55-service-start\/v1/u)
  assert.match(service, /include-hidden-files: true/u)
  assert.ok(service.indexOf('name: Preserve the service start marker before canary execution') <
    service.indexOf('name: Run one service and capture only a scrubbed receipt or safe failure code'))
  assert.match(service, /result_file="\$raw_attempt_dir\/result\.json"/u)
  assert.match(service, /error_file="\$raw_attempt_dir\/stderr\.txt"/u)
  assert.match(release, /--checkpoint-status/u)
  assert.match(release, /--run \\\r?\n/u)
  assert.match(service, /G5_FAILED_SERVICE_OFF/u)
  assert.match(release, /item\.status !== 'G5_PASSED'/u)
  assert.doesNotMatch(release, /!\['G5_PASSED', 'G5_FAILED_SERVICE_OFF'\]\.includes\(item\.status\)/u)
  assert.match(release, /cleanup\?\.reused !== true/u)
  assert.match(release, /item\.slice_count !== 8 \|\| item\.case_count !== 96 \|\| item\.error_count !== 0/u)
  assert.doesNotMatch(release, /item\.slices\?/u)
})

test('release workflows are covered by the deployed evaluator source attestation', () => {
  expectWorkflowMatch(sourceAttestation, /'\.github\/workflows\/ci\.yml'/u,
    'Plan 55 dispatch control must be bound to the evaluator attestation')
  expectWorkflowMatch(sourceAttestation, /'\.github\/workflows\/plan55-production-only\.yml'/u,
    'release workflow must be included in the evaluator attestation')
  expectWorkflowMatch(sourceAttestation, /'\.github\/workflows\/plan55-production-canary-service\.yml'/u,
    'service workflow must be included in the evaluator attestation')
})

test('API JSON evidence is emitted by Vitest without dropping the Node contract suite', () => {
  assert.equal(apiPackage.scripts.test, 'node scripts/test-runner.mjs')
  assert.equal(apiPackage.scripts['test:vitest'], 'vitest run')
  assert.match(apiPackage.scripts['test:node'], /node \.\.\/\.\.\/scripts\/run\.mjs run-node --test/u)

  const reporterArgs = ['--reporter=default', '--reporter=json', '--outputFile=../../artifacts/transactions/api-vitest.json']
  const plan = apiTestCommandPlan(reporterArgs)
  assert.deepEqual(plan.vitestArgs, ['run', ...reporterArgs])
  assert.ok(!plan.nodeRunnerArgs.some((argument) => reporterArgs.includes(argument)))

  for (const path of [
    '.github/workflows/ci.yml',
    '.github/workflows/plan55-production-only.yml',
  ]) {
    const workflow = readFileSync(path, 'utf8')
    assert.match(workflow, /pnpm --filter @nestscout\/api test:vitest --reporter=default --reporter=json/u, path)
    assert.match(workflow, /pnpm --filter @nestscout\/api test:node/u, path)
  }

  for (const path of [
    '.github/workflows/release-production.yml',
    '.github/workflows/release-production-verification.yml',
  ]) {
    const workflow = readFileSync(path, 'utf8')
    assert.match(workflow, /pnpm test:api --reporter=default --reporter=json/u, path)
  }
})
