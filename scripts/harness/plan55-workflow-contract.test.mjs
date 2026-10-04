import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { apiTestCommandPlan } from '../../apps/api/scripts/test-runner.mjs'
import {
  PLAN55_DEPLOYED_GUARD_GATES,
  PLAN55_PREFLIGHT_GATE_CHECKS,
  PLAN55_RELEASE_STAGE_GATES,
} from './plan55-gate-receipts.mjs'

const releasePath = '.github/workflows/plan55-production-only.yml'
const servicePath = '.github/workflows/plan55-production-canary-service.yml'
const finalizationPath = '.github/workflows/plan55-postreceipt-finalization.yml'
const gateEvidencePackagePath = '.github/workflows/plan55-gate-evidence-package.yml'
const rollbackDrillPath = '.github/workflows/plan55-rollback-drill.yml'
const blindHoldoutPackagePath = '.github/workflows/plan55-independent-holdout-package.yml'
const ciPath = '.github/workflows/ci.yml'
const release = readFileSync(releasePath, 'utf8')
const service = readFileSync(servicePath, 'utf8')
const finalization = readFileSync(finalizationPath, 'utf8').replace(/\r\n/gu, '\n')
const gateEvidencePackage = readFileSync(gateEvidencePackagePath, 'utf8')
const rollbackDrill = existsSync(rollbackDrillPath) ? readFileSync(rollbackDrillPath, 'utf8') : ''
const blindHoldoutPackage = readFileSync(blindHoldoutPackagePath, 'utf8')
const ci = readFileSync(ciPath, 'utf8')
const sourceAttestation = readFileSync('apps/api/scripts/lib/kael-playbook-production-attestation.mjs', 'utf8')
const canaryCore = readFileSync('apps/api/scripts/lib/plan55-production-canary-core.mjs', 'utf8')
const canaryCli = readFileSync('apps/api/scripts/kael-playbook-production-canary.mjs', 'utf8')
const checkpointStore = readFileSync('apps/api/scripts/lib/plan55-production-canary-checkpoint-store.mjs', 'utf8')
const holdoutPreflight = readFileSync('apps/api/scripts/plan55-independent-holdout-preflight.mjs', 'utf8')
const releaseGateProofs = readFileSync('scripts/harness/plan55-release-gate-proofs.mjs', 'utf8')
const blindHoldoutCli = readFileSync('apps/api/scripts/plan55-independent-holdout-package.mjs', 'utf8')
const blindHoldoutBuilder = readFileSync('apps/api/scripts/lib/plan55-independent-holdout-package.mjs', 'utf8')
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
  expectWorkflowMatch(caller, /actions: read[\s\S]*?checks: read[\s\S]*?contents: read[\s\S]*?issues: read[\s\S]*?pull-requests: read/u,
    'reusable release must receive its declared read-only token permissions')
  expectWorkflowMatch(release, /issues: read/u,
    'the Plan 55 release must read only the merged PR conversation for independent holdout attestations')
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

test('preflight gate proofs bind exact source and successful CI step outcomes before artifact upload', () => {
  const quality = jobBlock(release, 'quality-and-preflight')
  const proofIndex = quality.indexOf('name: Record exact-source preflight gate proofs')
  const sourceArtifactIndex = quality.indexOf('name: Preserve source-gate evidence')
  const proofArtifactIndex = quality.indexOf('name: Publish exact-source preflight gate proofs')
  assert.ok(proofIndex >= 0 && sourceArtifactIndex > proofIndex && proofArtifactIndex > sourceArtifactIndex,
    'source-bound gate proofs must be generated before the evidence artifact is uploaded')
  const proofStep = quality.slice(proofIndex, sourceArtifactIndex)
  assert.match(proofStep, /if: success\(\)/u,
    'gate evidence may be generated only after the entire preflight job succeeds')
  assert.match(proofStep, /PLAN55_SOURCE_SHA: \$\{\{ inputs\.source_sha \}\}/u)

  const outcomeBindings = {
    verify_source: 'PLAN55_VERIFY_SOURCE_OUTCOME',
    docker_ram_floor: 'PLAN55_DOCKER_RAM_FLOOR_OUTCOME',
    edge_deno: 'PLAN55_EDGE_DENO_OUTCOME',
    workspace_quality: 'PLAN55_WORKSPACE_QUALITY_OUTCOME',
    production_ui_normality: 'PLAN55_PRODUCTION_UI_NORMALITY_OUTCOME',
    secret_scan: 'PLAN55_SECRET_SCAN_OUTCOME',
    sql_verification: 'PLAN55_SQL_VERIFICATION_OUTCOME',
    independent_holdout_preflight: 'PLAN55_INDEPENDENT_HOLDOUT_PREFLIGHT_OUTCOME',
  }
  for (const [stepId, variable] of Object.entries(outcomeBindings)) {
    assert.match(proofStep, new RegExp(`${variable}: \\\$\\{\\{ steps\\.${stepId}\\.outcome \\}\\}`,'u'),
      `proof generator must consume the real ${stepId} outcome`)
  }
  assert.equal(quality.match(/pnpm lint:production-ui-copy -- --output artifacts\/release\/production-ui-normality\.json/gu)?.length, 1,
    'Production UI normality must run exactly once as its independently attributable gate')
  assert.equal(quality.match(/pnpm edge:check/gu)?.length, 1,
    'the Deno Edge check must be a single dedicated preflight step')
  assert.match(quality, /- id: edge_deno\s+name: Verify Edge Functions with Deno\s+run: pnpm edge:check/u,
    'the Edge proof must bind directly to the workflow step that runs Deno checks')
  const dockerFloorIndex = quality.indexOf('- id: docker_ram_floor')
  const edgeDenoIndex = quality.indexOf('- id: edge_deno')
  const sqlVerificationIndex = quality.indexOf('- id: sql_verification')
  assert.ok(dockerFloorIndex >= 0 && dockerFloorIndex < edgeDenoIndex && edgeDenoIndex < sqlVerificationIndex,
    'the Docker floor must pass before Edge and SQL checks can produce their composite proof')
  assert.match(proofStep, /node scripts\/harness\/plan55-preflight-gate-evidence\.mjs --output artifacts\/release\/plan55-gate-evidence/u)
  assert.deepEqual(Object.keys(PLAN55_PREFLIGHT_GATE_CHECKS).sort(), [
    'edge-deno',
    'generated-types',
    'harness',
    'plan55-actor-scoped-guard-tests',
    'plan55-canary-runner-tests',
    'plan55-docker-sql-edge-gates',
    'plan55-exact-production-base-ancestry',
    'plan55-independent-holdout-freeze',
    'plan55-production-source-merge',
    'plan55-source-lock',
    'production-ui-normality',
    'security',
    'sql-verification',
    'workspace-build',
    'workspace-tests',
    'workspace-typecheck',
  ])
  assert.deepEqual(PLAN55_PREFLIGHT_GATE_CHECKS['edge-deno'], ['edge_deno'])

  const sourceArtifactStep = quality.slice(sourceArtifactIndex, proofArtifactIndex)
  assert.match(sourceArtifactStep, /artifacts\/release\/production-ui-normality\.json/u,
    'the general quality artifact must retain its original explicit release evidence path')
  const proofArtifactStep = quality.slice(proofArtifactIndex)
  assert.match(proofArtifactStep, /if: success\(\)/u,
    'preflight proof artifacts must not be published after a failed quality gate')
  assert.match(proofArtifactStep, /name: plan55-preflight-gates-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/u)
  assert.match(proofArtifactStep, /path: artifacts\/release\/plan55-gate-evidence\//u,
    'the dedicated artifact must preserve the proof files at an unambiguous path')
  assert.match(proofArtifactStep, /if-no-files-found: error/u)
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

test('release-stage gate proofs bind the pinned hosted baseline and rollback before the deploy step', () => {
  const assemble = jobBlock(release, 'deploy_guard_off')
  const sourceFingerprint = assemble.indexOf('rollback-mobile-source-sha256.txt')
  const proofProducer = assemble.indexOf('node scripts/harness/plan55-release-gate-proofs.mjs')
  const deployStep = assemble.indexOf('name: Register release metadata and deploy actor-scoped guard with every flag OFF')
  assert.ok(sourceFingerprint >= 0 && proofProducer > sourceFingerprint && deployStep > proofProducer,
    'release proofs must be emitted only after rollback source fingerprinting and before Production deploy')
  for (const argument of [
    '--release artifacts/release/release.json',
    '--hosted-before artifacts/release/hosted-before.json',
    '--hosted-rollback-snapshot artifacts/release/hosted-rollback-snapshot.json',
    '--rollback-mobile-source-sha256 artifacts/release/rollback-mobile-source-sha256.txt',
    '--mobile-binary-attestation artifacts/release/mobile-binary-attestation.json',
  ]) assert.ok(assemble.includes(argument), `release-stage proof input is missing: ${argument}`)
  assert.match(assemble, /--output artifacts\/release\/plan55-gate-evidence/u)
  const releaseArtifactUpload = assemble.slice(assemble.indexOf('name: Preserve guard-deploy and rollback evidence'))
  assert.match(releaseArtifactUpload,
    /path:\s*\|\r?\n\s*artifacts\/release\r?\n\s*artifacts\/rollback\/supabase\/config\.toml\r?\n\s*artifacts\/rollback\/supabase\/functions\/mobile-api/u,
    'the exact-source release artifact must retain gate proofs and only the pinned rollback deploy inputs')
  assert.match(releaseGateProofs, /hosted\.gitSha !== pinned\.sha/u)
  assert.match(releaseGateProofs, /JSON\.stringify\(rollback\.migrations\) !== JSON\.stringify\(before\.migrations\)/u)
  assert.match(releaseGateProofs, /sameMobileApiIdentity\(beforeEdge, rollbackEdge\)/u)
  assert.doesNotMatch(releaseGateProofs, /SUPABASE_ACCESS_TOKEN|SERVICE_ROLE_KEY|process\.env\.[A-Z0-9_]*(?:TOKEN|KEY)/u,
    'the proof generator must not consume or serialize credential values')
  assert.deepEqual([...PLAN55_RELEASE_STAGE_GATES].sort(), [
    'compatible-rollback-target',
    'hosted-drift-baseline',
    'plan55-exact-binary-release-attestation',
    'plan55-full-production-readiness',
    'plan55-production-target-attestation',
    'plan55-rollback-preflight',
  ])
})

test('independent holdout attestation fails fast before Docker RAM and long workspace gates', () => {
  const quality = jobBlock(release, 'quality-and-preflight')
  const sourceIndex = quality.indexOf('id: verify_source')
  const holdoutStepIndex = quality.indexOf('name: Require independent holdout attestation before Docker and long quality gates')
  const holdoutIndex = quality.indexOf('node apps/api/scripts/plan55-independent-holdout-preflight.mjs', holdoutStepIndex)
  const dockerIndex = quality.indexOf('id: docker_ram_floor')
  const installIndex = quality.indexOf('run: pnpm install --frozen-lockfile')
  const workspaceIndex = quality.indexOf('id: workspace_quality')

  assert.ok(sourceIndex >= 0 && holdoutStepIndex > sourceIndex,
    'exact source identity must be verified before the read-only holdout request')
  assert.ok(holdoutIndex > holdoutStepIndex && dockerIndex > holdoutIndex &&
    installIndex > dockerIndex && workspaceIndex > installIndex,
  'missing independent adjudication must fail before Docker, dependency installation, and the long quality suite')
  assert.equal(quality.slice(0, dockerIndex).match(/node apps\/api\/scripts\/plan55-independent-holdout-preflight\.mjs/gu)?.length, 1,
    'the quality job must perform exactly one early read-only holdout check')

  const earlyGate = quality.slice(holdoutStepIndex, dockerIndex)
  assert.match(earlyGate, /GH_TOKEN: \$\{\{ github\.token \}\}/u,
    'the early check must use only the workflow-scoped read-only token')
  assert.match(earlyGate, /PLAN55_SOURCE_SHA: \$\{\{ inputs\.source_sha \}\}/u,
    'the early check must remain bound to the exact requested source')
})

test('independent holdout attestation and guard CI are required before assembling or mutating Production', () => {
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
  assert.match(release, /issues: read/u,
    'the workflow token must read only the attestation comments on the exact merged PR')
  assert.match(release, /pull-requests: read/u,
    'the workflow token must keep pull-request metadata access read-only')
  assert.match(release, /checks: read/u,
    'the workflow token must keep guard-check access read-only')
  assert.match(holdoutPreflight, /isPlan55PredeploymentHoldoutContextValid/u,
    'the holdout CLI must use the tested workflow context guard')
  assert.doesNotMatch(holdoutPreflight, /PLAN55_PRODUCTION_SOURCE_BASE/u,
    'the CLI must not treat the pinned ancestry base as the workflow dispatch ref')
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

test('deployed guard proofs consume only exact post-deploy Production evidence before disarming rollback', () => {
  const assemble = jobBlock(release, 'deploy_guard_off')
  const attestationIndex = assemble.indexOf('production-source-attestation.json')
  const migrationCheckIndex = assemble.indexOf('JSON.stringify(hosted.migrations)', attestationIndex)
  const preflightIndex = assemble.indexOf('node apps/api/scripts/plan55-production-release-preflight.mjs',
    migrationCheckIndex)
  const proofIndex = assemble.indexOf('node scripts/harness/plan55-deployed-guard-gate-proofs.mjs', preflightIndex)
  const rollbackDisarmedIndex = assemble.indexOf('trap - EXIT', proofIndex)

  assert.ok(attestationIndex >= 0 && migrationCheckIndex > attestationIndex &&
    preflightIndex > migrationCheckIndex && proofIndex > preflightIndex &&
    rollbackDisarmedIndex > proofIndex,
  'live proofs must follow deployed-source attestation and migration equality while rollback remains armed')
  for (const argument of [
    '--release artifacts/release/release.json',
    '--hosted-before artifacts/release/hosted-before.json',
    '--hosted-deployed artifacts/release/hosted-guard-deployed.json',
    '--edge-source-proof artifacts/release/production-edge-source-proof.json',
    '--source-attestation artifacts/release/production-source-attestation.json',
    '--release-preflight artifacts/release/production-release-preflight.json',
    '--output artifacts/release/plan55-gate-evidence',
  ]) assert.ok(assemble.includes(argument), `deployed guard proof input is missing: ${argument}`)
  assert.doesNotMatch(assemble.slice(preflightIndex, rollbackDisarmedIndex),
    /SUPABASE_ACCESS_TOKEN[^\n]*>>|SUPABASE_SERVICE_ROLE_KEY[^\n]*>>/u,
    'proof artifacts must not serialize or print credentials')
  assert.deepEqual([...PLAN55_DEPLOYED_GUARD_GATES].sort(), [
    'plan55-all-global-flags-off',
    'plan55-guard-deployed',
    'plan55-no-migration',
    'plan55-provider-readiness',
    'plan55-runtime-source-match',
  ])
  const policy = JSON.parse(readFileSync('config/harness/plan55-production-only-policy.json', 'utf8'))
  for (const gate of PLAN55_DEPLOYED_GUARD_GATES) {
    assert.equal(policy.trustedEvidenceWorkflowPathsByGate[gate], '.github/workflows/ci.yml',
      `deployed proof gate must bind to the CI caller run: ${gate}`)
  }
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
  assert.match(release, /typeof item\.cleanup\?\.reused !== 'boolean'/u)
  assert.match(release, /item\.slice_count !== 8 \|\| item\.case_count !== 96 \|\| item\.error_count !== 0/u)
  assert.match(release, /\.scratch\/plan55-production-canary\/records\/\*\*/u)
  assert.match(release, /\.scratch\/plan55-production-canary\/attempts\/\*\*/u)
  assert.match(release, /docs\/test-logs\/plan55\/\$\{\{ inputs\.source_sha \}\}\/\r?\n/u)
  assert.match(release, /if-no-files-found: error/u)
  assert.match(release, /pnpm harness:promotion:plan55:check/u)
  assert.doesNotMatch(release, /item\.slices\?/u)
})

test('release workflows are covered by the deployed evaluator source attestation', () => {
  expectWorkflowMatch(sourceAttestation, /'\.github\/workflows\/ci\.yml'/u,
    'Plan 55 dispatch control must be bound to the evaluator attestation')
  expectWorkflowMatch(sourceAttestation, /'\.github\/workflows\/plan55-production-only\.yml'/u,
    'release workflow must be included in the evaluator attestation')
  expectWorkflowMatch(sourceAttestation, /'\.github\/workflows\/plan55-production-canary-service\.yml'/u,
    'service workflow must be included in the evaluator attestation')
  expectWorkflowMatch(sourceAttestation, /'\.github\/workflows\/plan55-postreceipt-finalization\.yml'/u,
    'post-receipt finalizer must be included in the evaluator attestation')
  expectWorkflowMatch(sourceAttestation, /'\.github\/workflows\/plan55-gate-evidence-package\.yml'/u,
    'gate evidence package workflow must be included in the evaluator attestation')
  expectWorkflowMatch(sourceAttestation, /'\.github\/workflows\/plan55-independent-holdout-package\.yml'/u,
    'blind holdout package workflow must be included in the evaluator attestation')
  expectWorkflowMatch(sourceAttestation, /'\.github\/workflows\/plan55-rollback-drill\.yml'/u,
    'rollback drill workflow must be included in the evaluator attestation')
  expectWorkflowMatch(sourceAttestation, /'apps\/api\/scripts\/plan55-independent-holdout-package\.mjs'/u,
    'blind holdout package CLI must be included in the evaluator attestation')
  expectWorkflowMatch(sourceAttestation, /'apps\/api\/scripts\/lib\/plan55-independent-holdout-package\.mjs'/u,
    'blind holdout package builder must be included in the evaluator attestation')
})

test('blind holdout review packaging is source-bound, read-only, and excludes label sources', () => {
  expectWorkflowMatch(blindHoldoutPackage, /^on:\r?\n  pull_request:/mu,
    'blind package must run for relevant same-repository pull requests')
  expectWorkflowMatch(blindHoldoutPackage, /types: \[opened, synchronize, reopened, ready_for_review\]/u,
    'blind package must refresh for ready and updated pull requests')
  expectWorkflowMatch(blindHoldoutPackage, /cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}/u,
    'new PR heads must supersede older package jobs without canceling explicit source dispatches')
  expectWorkflowMatch(blindHoldoutPackage, /github\.event\.pull_request\.draft == false/u,
    'draft requests must not upload adjudication packages')
  expectWorkflowMatch(blindHoldoutPackage, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/u,
    'automatic package generation must exclude fork code and data exfiltration paths')
  expectWorkflowMatch(blindHoldoutPackage, /python - "\$GITHUB_EVENT_PATH" "\$PLAN55_REPOSITORY"/u,
    'automatic package generation must read the runner-provided authenticated PR event payload')
  expectWorkflowMatch(blindHoldoutPackage, /github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'/u,
    'manual package generation must be initiated only from default main')
  expectWorkflowMatch(blindHoldoutPackage, /workflow_dispatch:[\s\S]*?reviewed_head_sha:[\s\S]*?pull_request_number:/u,
    'blind package may be rebuilt only for an explicitly identified reviewed PR head')
  expectWorkflowMatch(blindHoldoutPackage, /contents: read\r?\n  pull-requests: read/u,
    'blind package workflow must not have repository write access')
  expectWorkflowMatch(blindHoldoutPackage, /repository: \$\{\{ github\.repository \}\}[\s\S]*?ref: \$\{\{ steps\.identity\.outputs\.reviewed_head_sha \}\}/u,
    'package must checkout the exact authenticated same-repository PR head')
  expectWorkflowMatch(blindHoldoutPackage, /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/u,
    'package artifact action must be pinned')
  expectWorkflowMatch(blindHoldoutPackage, /retention-days: 30/u,
    'independent reviewer must have a bounded window to retrieve the package')
  expectWorkflowMatch(blindHoldoutPackage, /gh api "repos\/\$PLAN55_REPOSITORY\/pulls\/\$INPUT_PR_NUMBER"/u,
    'manual artifact runs must verify the PR head through the read-only GitHub API')
  expectWorkflowMatch(blindHoldoutPackage, /pr\.get\('head', \{\}\)\.get\('sha'\) != sys\.argv\[2\]/u,
    'manual artifact runs must reject a stale or substituted pull request head')
  expectWorkflowMatch(blindHoldoutBuilder, /event\?\.pull_request\?\.head\?\.repo\?\.full_name === PLAN55_GITHUB_REPOSITORY/u,
    'CLI must reject fork or wrong-repository source identities')
  expectWorkflowMatch(blindHoldoutCli, /const checkoutHeadSha = git\(\['rev-parse', 'HEAD'\]\)/u,
    'CLI must require the checked-out tree to equal the exact reviewed head')
  expectWorkflowMatch(blindHoldoutCli, /const workingTreeClean = git\(\['status', '--porcelain=v1', '--untracked-files=all'\]\) === ''/u,
    'CLI must fail closed on a dirty package source tree')
  assert.doesNotMatch(blindHoldoutPackage, /PRODUCTION_SUPABASE|supabase db|supabase functions|functions deploy|service[_-]role/iu,
    'blind package job must never connect to or mutate Production')
  assert.doesNotMatch(`${blindHoldoutCli}\n${blindHoldoutBuilder}`, /SUPABASE|functions deploy|service[_-]role/iu,
    'blind package CLI must have no Production operations')
})

test('gate evidence packaging preserves exact-source evidence and has no Production write capability', () => {
  expectWorkflowMatch(gateEvidencePackage, /^on:[\s\S]*?^  workflow_dispatch:/mu,
    'evidence packaging must be explicitly dispatched')
  expectWorkflowMatch(gateEvidencePackage, /permissions:\r?\n  actions: read\r?\n  contents: read/u,
    'evidence packaging must be read-only')
  expectWorkflowMatch(gateEvidencePackage, /github\.ref == 'refs\/heads\/main' && inputs\.source_sha == github\.sha/u,
    'evidence packaging must run on the exact locked main SHA')
  assert.match(gateEvidencePackage, /buildPlan55GateEvidenceArtifact/u)
  assert.match(gateEvidencePackage, /downloadPlan55GitHubRunArtifact/u)
  assert.match(gateEvidencePackage, /runCreatedAt:\s*artifact\.runCreatedAt/u)
  assert.match(gateEvidencePackage, /runStartedAt:\s*artifact\.runStartedAt/u)
  assert.match(gateEvidencePackage, /runUpdatedAt:\s*artifact\.runUpdatedAt/u)
  assert.match(gateEvidencePackage, /PLAN55_RELEASE_STAGE_GATES/u)
  assert.match(gateEvidencePackage, /PLAN55_DEPLOYED_GUARD_GATES/u)
  assert.match(gateEvidencePackage,
    /const releaseArtifactGates = new Set\(\[[\s\S]*?\.filter\(\(gate\) =>\s*expectedGates\.includes\(gate\)\)\)/u,
    'deployed and pre-deploy proofs must be auto-sourced from the exact release artifact')
  assert.match(gateEvidencePackage,
    /externallySuppliedGates = expectedGates\.filter\(\(gate\) => !releaseArtifactGates\.has\(gate\)\)/u)
  assert.match(gateEvidencePackage, /`plan55-gate-evidence\/\$\{gate\}\.json`/u,
    'release-stage and deployed-guard gates must be sourced from the exact release artifact')
  assert.match(gateEvidencePackage, /requiredPromotionGates\(policy, targetState\)/u)
  assert.match(gateEvidencePackage,
    /sourceRunId, sourceRunAttempt, \['\.github\/workflows\/ci\.yml'\]\)/u,
    'release artifacts from the called workflow must be bound to their actual CI caller run')
  assert.match(gateEvidencePackage,
    /releaseArtifact\.workflowPath !== '\.github\/workflows\/ci\.yml'/u,
    'the evidence packager must reject artifacts not produced in the exact CI caller run')
  const coveragePreflight = gateEvidencePackage.indexOf(
    'assertPlan55GateEvidenceCoverage({ policy, targetState, requiredGates: expectedGates })')
  const firstReleaseDownload = gateEvidencePackage.indexOf("download(releaseArtifactId, 'plan55-release'")
  const firstEvidenceDownload = gateEvidencePackage.indexOf('await download(input.artifact_id, input.artifact_name_prefix)')
  assert.ok(coveragePreflight >= 0 && coveragePreflight < firstReleaseDownload &&
    firstReleaseDownload < firstEvidenceDownload,
  'the full semantic-verifier inventory must fail before downloading any source artifact')
  assert.match(gateEvidencePackage, /const downloadedArtifacts = new Map\(\)/u,
    'multiple gate proofs from one immutable workflow artifact must share one verified download')
  assert.match(gateEvidencePackage,
    /const cacheKey = `\$\{input\.artifact_id\}:\$\{input\.artifact_name_prefix\}`[\s\S]*?let artifact = downloadedArtifacts\.get\(cacheKey\)[\s\S]*?if \(!artifact\)[\s\S]*?await download\(input\.artifact_id, input\.artifact_name_prefix\)[\s\S]*?downloadedArtifacts\.set\(cacheKey, artifact\)/u,
    'the package workflow must reuse only a verified artifact with the same ID and name prefix')
  assert.match(gateEvidencePackage, /hosted-before\.json/u,
    'evidence package must verify the release against its hosted-before snapshot')
  assert.match(gateEvidencePackage, /release-bundle\.mjs --verify artifacts\/harness\/release-manifest\.json \\\r?\n\s+--hosted-before artifacts\/harness\/hosted-before\.json/u,
    'evidence package release verification must bind the hosted-before snapshot')
  assert.match(gateEvidencePackage, /plan55-gate-evidence-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/u)
  assert.doesNotMatch(gateEvidencePackage, /supabase|release-control\.mjs|functions deploy|production environment|service[_-]role/iu)
  const policy = JSON.parse(readFileSync('config/harness/plan55-production-only-policy.json', 'utf8'))
  assert.match(ci, /plan55-production-only:[\s\S]*?uses: \.\/\.github\/workflows\/plan55-production-only\.yml/u,
    'the root CI workflow must remain the caller for the reusable Production-only release')
  for (const gate of [
    'hosted-drift-baseline',
    'compatible-rollback-target',
    'plan55-production-target-attestation',
    'plan55-rollback-preflight',
    ...PLAN55_DEPLOYED_GUARD_GATES,
    'plan55-auth-admin-verified',
    'plan55-synthetic-actor-created',
    'plan55-actor-scope-verified',
    'plan55-disposable-worker-isolated',
    'plan55-service-slice-integrity-pass',
    'plan55-service-g5-safety-pass',
    'plan55-service-cleanup-pass',
    'plan55-six-current-source-receipts',
    'plan55-six-cleanup-passes',
  ]) {
    assert.equal(policy.trustedEvidenceWorkflowPathsByGate[gate], '.github/workflows/ci.yml',
      `GitHub provenance for ${gate} must identify the root caller workflow`)
  }
  assert.ok(!policy.trustedEvidenceWorkflowPaths.includes(releasePath),
    'the called release workflow is not a standalone GitHub workflow run')
  assert.ok(!policy.trustedEvidenceWorkflowPaths.includes(servicePath),
    'the called service workflow is not a standalone GitHub workflow run')
  assert.ok(!policy.trustedEvidenceWorkflowPaths.includes(gateEvidencePackagePath),
    'the packager may produce aggregate artifacts but must not be trusted as a raw gate-evidence source')
})

test('rollback drill prerequisites can be packaged without accepting the drill result itself', () => {
  expectWorkflowMatch(gateEvidencePackage,
    /- rollback_drill\r?\n\s+- paired_wave_1/u,
    'the evidence packager must expose rollback_drill as the pre-wave target state')
  expectWorkflowMatch(gateEvidencePackage,
    /!\[[^\]]*'rollback_drill'[^\]]*\]\s*\.includes\(targetState\)/u,
    'the exact-source packager must validate rollback_drill as an allowed target')
  assert.ok(rollbackDrill.length > 0, 'the source-bound rollback drill producer must exist')
  expectWorkflowMatch(rollbackDrill, /^on:\r?\n  workflow_dispatch:/mu,
    'the Production rollback drill must be explicitly dispatched only after its gates pass')
  expectWorkflowMatch(rollbackDrill,
    /group: production-release\r?\n\s+cancel-in-progress: false/u,
    'the drill must serialize with every Production release workflow')
  expectWorkflowMatch(rollbackDrill,
    /if: github\.ref == 'refs\/heads\/main' && inputs\.source_sha == github\.sha[\s\S]*?environment: production/u,
    'the drill must bind its manual run to the exact locked main source and Production environment')
  expectWorkflowMatch(rollbackDrill,
    /loadPlan55GateEvidenceSet\(manifestPath,[\s\S]*?targetState: 'rollback_drill'/u,
    'the drill must verify the exact prerequisite evidence package before live access')
  expectWorkflowMatch(rollbackDrill,
    /name: Verify exact release and prerequisite gate artifacts before Production access[\s\S]*?name: Verify Production identity and execute/u,
    'all exact-source prerequisites must be verified before the Production mutation job step')
  expectWorkflowMatch(rollbackDrill,
    /release-control\.mjs --action read/u,
    'the rollback drill may only read global Stage 1 release control')
  assert.doesNotMatch(rollbackDrill,
    /release-control\.mjs --action (?:configure|promote|recover|register|abort)|configure_stage1_release_canary|promote_stage1_release_attested_atomic|supabase db|functions deploy (?!mobile-api)/u,
    'the drill must not activate a global release-control lane, apply migrations, or deploy other functions')
  assert.equal((rollbackDrill.match(/functions deploy mobile-api/gu) ?? []).length, 3,
    'the drill may deploy the pinned baseline and candidate, plus one bounded candidate-only recovery attempt')
  expectWorkflowMatch(rollbackDrill,
    /PLAN55_PRODUCTION_FLAG_NAMES[\s\S]*?globalServiceFlagsAbsent:[\s\S]*?scopedCanaryFlagAbsent:/u,
    'all global and actor-scoped canary flags must be absent before and after the drill')
  expectWorkflowMatch(rollbackDrill,
    /restore_candidate_on_failure[\s\S]*?trap restore_candidate_on_failure EXIT/u,
    'a failed rollback drill must attempt one bounded restore of its initial candidate state')
  const restoreFunctionIndex = rollbackDrill.indexOf('restore_candidate_on_failure() {')
  const exitHandlerIndex = rollbackDrill.indexOf('trap restore_candidate_on_failure EXIT')
  assert.ok(restoreFunctionIndex >= 0 && exitHandlerIndex > restoreFunctionIndex,
    'the rollback handler must be defined before it is registered')
  const firstIdentityCheckIndex = rollbackDrill.indexOf('test "$GITHUB_REF" = refs/heads/main', exitHandlerIndex)
  assert.ok(firstIdentityCheckIndex > exitHandlerIndex,
    'signal and exit handlers must be installed before any Production preflight can fail')
  for (const [signal, exitCode] of [['HUP', 129], ['INT', 130], ['TERM', 143]]) {
    const signalHandlerIndex = rollbackDrill.indexOf(`trap 'exit ${exitCode}' ${signal}`)
    assert.ok(signalHandlerIndex >= 0 && signalHandlerIndex < exitHandlerIndex,
      `${signal} must enter the EXIT rollback handler with status ${exitCode}`)
  }
  const restoreFunction = rollbackDrill.slice(restoreFunctionIndex, exitHandlerIndex)
  assert.match(restoreFunction,
    /local original_status=\$\?[\s\S]*?trap - EXIT[\s\S]*?trap '' HUP INT TERM/u,
    'restoration must preserve the interrupted status and ignore repeat signals while cleanup runs')
  expectWorkflowMatch(rollbackDrill,
    /buildPlan55RollbackDrillProofFromArchive[\s\S]*?assertPlan55RollbackDrillProof/u,
    'the uploaded proof must be rebuilt and verified against the exact archived evidence bytes')
  expectWorkflowMatch(rollbackDrill,
    /name: Preserve rollback drill evidence[\s\S]*?if: always\(\)/u,
    'failed executions must preserve diagnostic evidence but cannot produce a successful gate artifact')
})

test('post-receipt finalization consumes separately attested exact-source artifacts and cannot mutate Production', () => {
  expectWorkflowMatch(finalization, /^on:[\s\S]*?^  workflow_dispatch:/mu,
    'post-receipt finalization must be manually dispatched')
  expectWorkflowMatch(finalization, /permissions:\r?\n  actions: read\r?\n  contents: read/u,
    'post-receipt finalization must use read-only GitHub permissions')
  assert.doesNotMatch(finalization, /^  (?:deployments|id-token|issues|pull-requests|checks):/mu,
    'post-receipt finalization must not gain deployment or write permissions')
  assert.match(finalization, /cancel-in-progress: false/u)
  assert.equal((finalization.match(/downloadPlan55GitHubRunArtifact\(/gu) ?? []).length, 1,
    'one shared provenance verifier must validate every supplied artifact')
  assert.match(finalization, /artifactNamePrefix,\s*expectedRunId,\s*expectedRunAttempt/u)
  assert.match(finalization, /download\(releaseArtifactId, 'plan55-release', sourceRunId, sourceRunAttempt\)/u)
  assert.match(finalization, /download\(receiptsArtifactId, 'plan55-six-receipts', sourceRunId, sourceRunAttempt\)/u)
  assert.match(finalization, /download\(gateEvidenceArtifactId, 'plan55-gate-evidence'/u)
  assert.match(finalization, /const gateEvidenceWorkflow = '\.github\/workflows\/plan55-gate-evidence-package\.yml'/u)
  assert.match(finalization,
    /const gateEvidenceInSourceRun = sourceRunId === Number\(process\.env\.GITHUB_RUN_ID\)[\s\S]*?const gateEvidenceWorkflowPaths = gateEvidenceInSourceRun[\s\S]*?\[sourceWorkflow\][\s\S]*?\[gateEvidenceWorkflow\]/u,
    'nested release calls must trust the caller run, while standalone packaging remains bound to its dedicated workflow')
  assert.match(finalization,
    /download\(gateEvidenceArtifactId, 'plan55-gate-evidence',[\s\S]*?gateEvidenceWorkflowPaths\)/u,
    'gate evidence provenance must use the exact producer path selected for this invocation')
  assert.match(finalization, /six-service receipt artifact failed exact-source validation/u)
  assert.match(finalization, /scripts\/harness\/evaluate-release\.mjs/u)
  assert.match(finalization, /uniqueFile\(releaseArtifact\.files, 'hosted-before\.json', 'hosted-before'\)/u,
    'finalization must use the hosted-before snapshot from the source release artifact')
  assert.match(finalization, /writeFileSync\(resolve\(outputRoot, 'hosted-before\.json'\), hostedBeforeBytes/u,
    'finalization must stage the exact hosted-before snapshot before verification')
  assert.match(finalization, /release-bundle\.mjs --verify artifacts\/harness\/release-manifest\.json \\\r?\n\s+--hosted-before artifacts\/harness\/hosted-before\.json/u,
    'Plan 55 release verification must bind the manifest to the hosted-before snapshot')
  assert.match(finalization, /const sourceWorkflow = '\.github\/workflows\/ci\.yml'/u)
  assert.match(finalization, /PLAN55_SOURCE_SHA: \$\{\{ inputs\.source_sha \}\}/u)
  assert.match(finalization, /PLAN55_RELEASE_ARTIFACT_ID: \$\{\{ inputs\.release_artifact_id \}\}/u)
  assert.match(finalization, /PLAN55_RECEIPTS_ARTIFACT_ID: \$\{\{ inputs\.receipts_artifact_id \}\}/u)
  assert.match(finalization, /PLAN55_GATE_EVIDENCE_ARTIFACT_ID: \$\{\{ inputs\.gate_evidence_artifact_id \}\}/u)
  assert.doesNotMatch(finalization, /cohort_id|observation_window_minutes|PLAN55_COHORT_ID|PLAN55_OBSERVATION_WINDOW_MINUTES/u,
    'finalization must not accept post-result caller-supplied paired-wave values')
  assert.doesNotMatch(finalization, /--cohort|--observation-window-minutes/u,
    'paired-wave context must come from the source-locked preregistration policy')
  assert.match(finalization, /promotion\.mjs --plan55[\s\S]*?--to "\$PLAN55_TARGET_STATE"/u,
    'the packet builder must resolve preregistered wave context from the locked policy')
  assert.match(finalization, /test "\$GITHUB_SHA" = "\$PLAN55_SOURCE_SHA"/u)
  const artifactVerificationStep = finalization.indexOf('name: Verify and stage the independently produced exact-source artifacts')
  assert.ok(artifactVerificationStep >= 0 &&
    artifactVerificationStep < finalization.indexOf('downloadPlan55GitHubRunArtifact') &&
    finalization.indexOf('downloadPlan55GitHubRunArtifact') <
      finalization.indexOf('name: Validate promotion policy and emit a packet only'),
  'artifact provenance must be verified before packet creation')
  assert.match(finalization, /--gate-receipts artifacts\/harness\/gate-evidence\/gate-evidence-set\.json/u)
  assert.match(finalization, /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/u)
  const packetProofStep = finalization.indexOf('name: Build the publication proof only for the validated-receipts packet')
  const packetEmitStep = finalization.indexOf('name: Validate promotion policy and emit a packet only')
  const packetUploadStep = finalization.indexOf('name: Publish the receipt packet and publication proof')
  assert.ok(packetEmitStep >= 0 && packetEmitStep < packetProofStep && packetProofStep < packetUploadStep,
    'publication proof must be created only after the exact-source receipts_validated packet')
  expectWorkflowMatch(finalization,
    /name: Build the publication proof only for the validated-receipts packet\r?\n\s+if: inputs\.target_state == 'receipts_validated'/u,
    'only the receipts_validated packet may produce the publication gate proof')
  assert.match(finalization, /buildPlan55PublicationPacketProof\(/u)
  assert.match(finalization, /packetBytes,\s*repository: process\.env\.PLAN55_REPOSITORY/u)
  assert.match(finalization, /github\.ref\s*\}\}[\s\S]*?PLAN55_EVENT_NAME/u)
  assert.match(finalization, /artifacts\/harness\/promotion-packet\.json\r?\n\s+artifacts\/harness\/publication-packet-proof\.json/u)
  assert.match(finalization,
    /name: Publish the non-deploying promotion packet\r?\n\s+id: non-deploying-packet\r?\n\s+if: inputs\.target_state != 'receipts_validated'/u)
  assert.doesNotMatch(finalization, /SUPABASE|release-control\.mjs|supabase db|supabase functions deploy|production environment/u)
  for (const target of ['receipts_validated', 'rollback_drill', 'paired_wave_1', 'paired_wave_2', 'paired_wave_3', 'production']) {
    assert.match(finalization, new RegExp(target, 'u'), `finalizer must support the policy state ${target}`)
  }
  expectWorkflowMatch(finalization,
    /rollback_drill\) from_state=receipts_validated/u,
    'the read-only packet finalizer must emit the rollback_drill transition after validated receipts')
  expectWorkflowMatch(finalization,
    /paired_wave_1\) from_state=rollback_drill/u,
    'paired wave 1 must require the completed rollback drill transition')
})

test('successful six-service receipts automatically package and finalize the receipts_validated packet', () => {
  const receiptJob = jobBlock(release, 'validate-six-receipts')
  assert.match(receiptJob,
    /outputs:\r?\n\s+receipts_artifact_id: \$\{\{ steps\.receipts\.outputs\.artifact-id \}\}/u,
    'the exact six-receipt artifact ID must be exported only from its upload step')
  assert.match(receiptJob,
    /id: receipts\r?\n\s+if: always\(\)[\s\S]*?name: plan55-six-receipts-/u,
    'the aggregate receipt upload must expose its immutable artifact ID')

  const packageJobName = 'package-receipt-gate-evidence'
  const packageJob = jobBlock(release, packageJobName)
  assert.deepEqual(needsFor(packageJobName), ['deploy_guard_off', 'validate-six-receipts'],
    'the evidence package must wait for the successful deployed guard and all six receipts')
  assert.match(packageJob, /uses: \.\/\.github\/workflows\/plan55-gate-evidence-package\.yml/u)
  assert.match(packageJob, /target_state: receipts_validated/u)
  assert.match(packageJob, /source_run_id: \$\{\{ github\.run_id \}\}/u)
  assert.match(packageJob, /source_run_attempt: \$\{\{ github\.run_attempt \}\}/u)
  assert.match(packageJob,
    /"artifact_id":\$\{\{ needs\.validate-six-receipts\.outputs\.receipts_artifact_id \}\}/u,
    'both receipt gates must reference the exact uploaded six-receipt artifact')
  assert.equal((packageJob.match(/"artifact_id":\$\{\{ needs\.validate-six-receipts\.outputs\.receipts_artifact_id \}\}/gu) ?? []).length, 2,
    'the current-source and cleanup gates must share only the validated receipt artifact')
  for (const gate of ['plan55-six-current-source-receipts', 'plan55-six-cleanup-passes']) {
    assert.ok(packageJob.includes(gate), `the package must verify ${gate}`)
  }
  assert.match(gateEvidencePackage, /^on:\r?\n  workflow_call:/mu,
    'the exact-source evidence packager must be callable in the release run')
  assert.match(gateEvidencePackage,
    /workflow_call:[\s\S]*?outputs:\r?\n\s+gate_artifact_id:[\s\S]*?value: \$\{\{ jobs\.package-evidence\.outputs\.gate_artifact_id \}\}/u,
    'the packager must return the immutable aggregate evidence artifact ID')

  const finalizationJobName = 'finalize-receipts-packet'
  const finalizationJob = jobBlock(release, finalizationJobName)
  assert.deepEqual(needsFor(finalizationJobName), [
    'deploy_guard_off', 'validate-six-receipts', packageJobName,
  ], 'finalization must not run unless the deployed guard, receipts, and evidence package succeed')
  assert.match(finalizationJob,
    /uses: \.\/\.github\/workflows\/plan55-postreceipt-finalization\.yml/u)
  assert.match(finalizationJob, /target_state: receipts_validated/u)
  assert.match(finalizationJob,
    /receipts_artifact_id: \$\{\{ needs\.validate-six-receipts\.outputs\.receipts_artifact_id \}\}/u)
  assert.match(finalizationJob,
    /gate_evidence_artifact_id: \$\{\{ needs\.package-receipt-gate-evidence\.outputs\.gate_artifact_id \}\}/u)
  assert.match(finalization,
    /workflow_call:[\s\S]*?outputs:\r?\n\s+promotion_artifact_id:[\s\S]*?value: \$\{\{ jobs\.finalize-packet\.outputs\.promotion_artifact_id \}\}/u,
    'the read-only packet artifact must be returned to the calling run')
  assert.match(finalization, /^on:\r?\n  workflow_call:/mu,
    'the exact-source packet finalizer must run in the receipt workflow chain')
  assert.match(finalization,
    /promotion\.mjs --plan55[\s\S]*?--from "\$from_state" --to "\$PLAN55_TARGET_STATE"/u,
    'the automatic finalizer must validate only the policy transition requested for this exact packet')
})

test('API JSON evidence is emitted by Vitest without dropping the Node contract suite', () => {
  const migrationInventoryTest = 'scripts/harness/plan55-applied-migration-inventory.test.mjs'
  const deployedGuardProofTest = 'scripts/harness/plan55-deployed-guard-gate-proofs.test.mjs'
  assert.equal(apiPackage.scripts.test, 'node scripts/test-runner.mjs')
  assert.equal(apiPackage.scripts['test:vitest'], 'vitest run')
  assert.match(apiPackage.scripts['test:node'], /node \.\.\/\.\.\/scripts\/run\.mjs run-node --test/u)
  assert.ok(apiPackage.scripts['test:node'].includes(migrationInventoryTest),
    'the applied-migration regression test must be part of the API Node suite')

  const reporterArgs = ['--reporter=default', '--reporter=json', '--outputFile=../../artifacts/transactions/api-vitest.json']
  const plan = apiTestCommandPlan(reporterArgs)
  assert.deepEqual(plan.vitestArgs, ['run', ...reporterArgs])
  assert.ok(!plan.nodeRunnerArgs.some((argument) => reporterArgs.includes(argument)))
  assert.ok(plan.nodeRunnerArgs.includes(migrationInventoryTest),
    'the API Node runner must execute the applied-migration regression test')
  assert.ok(plan.nodeRunnerArgs.includes(deployedGuardProofTest),
    'the API Node runner must execute the deployed-guard proof regression tests')
  assert.ok(apiPackage.scripts['test:node'].includes(deployedGuardProofTest),
    'the direct API Node test command must execute the deployed-guard proof regression tests')

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
