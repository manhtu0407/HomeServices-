import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

import { buildHarnessRelease } from './release-bundle.mjs'
import { buildMobileBinaryAttestation } from './mobile-binary-attestation.mjs'
import {
  assertAttestedSubmissionBuild,
  buildAttestedEasSubmissionArgs,
  CANARY_EXECUTION_BUDGET_MS,
  evaluateProductionPreflight,
  executeProductionReleaseSteps,
  parseProductionReleaseArgs,
  parseProductionReleasePlan,
  productionReleaseExitCode,
  productionReleaseStepTimeoutMs,
  resolveStepEnv,
  runProductionRelease,
} from './production-release-runner.mjs'
import { RELEASE_SECRET_NAMES, redactSensitiveText } from './production-release-credentials.mjs'
import { STALE_CANDIDATE_TIMEOUT_MS } from './release-control-timing.mjs'

const sourceSha = 'a'.repeat(40)

function readyInput(overrides = {}) {
  return {
    sourceSha,
    git: { branch: 'main', headSha: sourceSha, dirty: false, remoteMainSha: sourceSha },
    review: { status: 'PASS', detail: 'approved' },
    ci: { status: 'PASS', detail: 'quality run succeeded' },
    projectRef: 'iwevizmsedyqozxlawwl',
    credentials: {
      store: 'windows-credential-manager',
      values: Object.fromEntries(RELEASE_SECRET_NAMES.map((name) => [
        name,
        name === 'SUPABASE_ACCESS_TOKEN' ? 'sbp_fc_test_scoped_token' : `value-for-${name}`,
      ])),
      missing: [],
    },
    githubToken: 'github-token-for-tests-not-a-real-token',
    variables: {
      KAEL_AI_KILL_SWITCH: 'false',
      KAEL_DURABLE_GUARDS_ENABLED: 'true',
      NESTSCOUT_ANDROID_FCM_V1_READY: 'true',
      NESTSCOUT_IOS_APNS_READY: 'true',
      NESTSCOUT_PUSH_RECEIPT_RECONCILER_READY: 'true',
    },
    supabaseTargetVariables: {},
    candidate: { status: 'read', hasCandidate: false },
    supabaseScopes: { functions: true, secrets: true },
    expoProject: { status: 'PASS', detail: 'exact project' },
    ...overrides,
  }
}

function preflight(overrides = {}) {
  return evaluateProductionPreflight(readyInput(overrides))
}

test('parses the local release command with explicit execute and platform selection', () => {
  assert.deepEqual(parseProductionReleaseArgs(['--source-sha', sourceSha, '--submit-platform', 'ios', '--execute']), {
    sourceSha, submitPlatform: 'ios', execute: true,
  })
  assert.equal(parseProductionReleaseArgs(['--', '--source-sha', sourceSha]).execute, false)
  assert.throws(() => parseProductionReleaseArgs(['--source-sha', 'main']), /40-character/u)
  assert.throws(() => parseProductionReleaseArgs(['--source-sha', sourceSha, '--submit-platform', 'public']), /ios, android, or all/u)
})

test('reads all release stages from the standalone local pipeline and binds secret references by name', () => {
  const plan = parseProductionReleasePlan(readFileSync(resolve('scripts/harness/production-release-steps.yml'), 'utf8'))
  assert.equal(plan.jobEnv.PRODUCTION_PROJECT_REF, 'iwevizmsedyqozxlawwl')
  assert.ok(plan.steps.some((step) => step.name === 'Apply exact expand-only migration inventory' && step.run.includes('pnpm supabase --')))
  assert.ok(plan.steps.some((step) => step.name === 'Run and record three consecutive full synthetic smokes'))
  assert.ok(plan.steps.some((step) => step.name === 'Atomically promote the proven release'))
  assert.equal(plan.steps.filter((step) => step.condition.includes('failure()')).length, 2)
  const buildStep = plan.steps.find((step) => step.name === 'Reuse or build exact iOS and Android store binaries for this merge')
  assert.equal(buildStep.env.EXPO_TOKEN, '${{ secrets.EXPO_TOKEN }}')
  assert.equal(plan.steps.flatMap((step) => [step.run]).join('\n').includes('apps/api/node_modules/.bin/supabase'), false)
})

test('release steps receive stored secrets only through explicit step-level references', () => {
  const parent = {
    RELEASE_FLAG: 'enabled',
    EXPO_TOKEN: 'ambient-expo-token-must-not-win',
    SUPABASE_ACCESS_TOKEN: 'ambient-supabase-token-must-not-win',
  }
  const secrets = {
    EXPO_TOKEN: 'credential-store-expo-token',
    SUPABASE_ACCESS_TOKEN: 'credential-store-supabase-token',
    PRODUCTION_SUPABASE_SERVICE_ROLE_KEY: 'unused-service-role-key',
  }
  const env = resolveStepEnv({
    EXPO_TOKEN: '${{ secrets.EXPO_TOKEN }}',
    RELEASE_FLAG: '${{ vars.RELEASE_FLAG }}',
  }, parent, secrets)
  assert.deepEqual(env, {
    EXPO_TOKEN: 'credential-store-expo-token',
    RELEASE_FLAG: 'enabled',
  })
  assert.equal(Object.hasOwn(env, 'SUPABASE_ACCESS_TOKEN'), false)
  assert.equal(Object.hasOwn(env, 'PRODUCTION_SUPABASE_SERVICE_ROLE_KEY'), false)
})

test('preflight passes only when main, current review, exact-SHA CI, credentials, target, candidate, and services agree', () => {
  const result = preflight()
  assert.equal(result.status, 'PASS')
  assert.equal(result.productionProjectRef, 'iwevizmsedyqozxlawwl')
  assert.equal(result.missingCredentials.length, 0)
  assert.ok(result.gates.every((gate) => gate.status === 'PASS'))
  assert.equal(JSON.stringify(result).includes('value-for-'), false)
})

test('preflight blocks a wrong branch, wrong SHA, dirty main, or remote main mismatch', () => {
  for (const git of [
    { branch: 'codex/task', headSha: sourceSha, dirty: false, remoteMainSha: sourceSha },
    { branch: 'main', headSha: 'b'.repeat(40), dirty: false, remoteMainSha: sourceSha },
    { branch: 'main', headSha: sourceSha, dirty: true, remoteMainSha: sourceSha },
    { branch: 'main', headSha: sourceSha, dirty: false, remoteMainSha: 'c'.repeat(40) },
  ]) assert.equal(preflight({ git }).status, 'BLOCKED')
})

test('preflight blocks failed CI, absent independent review, wrong project, and conflicting Supabase target', () => {
  assert.equal(preflight({ ci: { status: 'BLOCKED', detail: 'red' } }).status, 'BLOCKED')
  assert.equal(preflight({ review: { status: 'BLOCKED', detail: 'approval missing' } }).status, 'BLOCKED')
  assert.equal(preflight({ projectRef: 'staging-ref' }).status, 'BLOCKED')
  assert.equal(preflight({ supabaseTargetVariables: { STAGING_SUPABASE_PROJECT_REF: 'staging-ref' } }).status, 'BLOCKED')
})

test('preflight blocks missing secure credentials, PAT scopes, EAS identity, and any active candidate', () => {
  const credentials = readyInput().credentials
  delete credentials.values.SUPABASE_ACCESS_TOKEN
  assert.equal(preflight({ credentials }).status, 'BLOCKED')
  const legacyTokenCredentials = readyInput().credentials
  legacyTokenCredentials.values.SUPABASE_ACCESS_TOKEN = 'legacy-account-wide-token'
  assert.equal(preflight({ credentials: legacyTokenCredentials }).status, 'BLOCKED')
  assert.equal(preflight({ credentials: { ...readyInput().credentials, store: 'plain-file' } }).status, 'BLOCKED')
  assert.equal(preflight({ supabaseScopes: { functions: true, secrets: false } }).status, 'BLOCKED')
  assert.equal(preflight({ expoProject: { status: 'BLOCKED', detail: 'wrong project' } }).status, 'BLOCKED')
  assert.equal(preflight({ candidate: { status: 'read', hasCandidate: true } }).status, 'BLOCKED')
  assert.equal(preflight({ candidate: { status: 'unreadable', hasCandidate: null } }).status, 'BLOCKED')
})

test('no Production pipeline or Expo submission starts when any preflight gate is blocked', async () => {
  let pipelineCalls = 0
  let submitCalls = 0
  const adapters = {
    preflight: async () => preflight({ ci: { status: 'BLOCKED', detail: 'red' } }),
    runPipeline: async () => { pipelineCalls += 1; return { status: 'PASS' } },
    submitBuild: async () => { submitCalls += 1 },
  }
  const result = await runProductionRelease({ sourceSha, execute: true, submitPlatform: 'all' }, adapters)
  assert.equal(result.preflight.status, 'BLOCKED')
  assert.equal(result.executed, false)
  assert.equal(pipelineCalls, 0)
  assert.equal(submitCalls, 0)
})

test('a passing preflight stays read-only unless the current invocation includes --execute', async () => {
  let pipelineCalls = 0
  let submitCalls = 0
  const adapters = {
    preflight: async () => preflight(),
    runPipeline: async () => { pipelineCalls += 1; return { status: 'PASS' } },
    submitBuild: async () => { submitCalls += 1 },
  }
  const result = await runProductionRelease({ sourceSha, execute: false, submitPlatform: 'ios' }, adapters)
  assert.equal(result.preflight.status, 'PASS')
  assert.equal(result.executed, false)
  assert.equal(pipelineCalls, 0)
  assert.equal(submitCalls, 0)
})

test('mocked execution submits only the explicitly requested Expo platforms after a successful release', async () => {
  const submitted = []
  const adapters = {
    preflight: async () => preflight(),
    runPipeline: async () => ({ status: 'PASS', artifactDirectory: 'artifacts/mock-release' }),
    submitBuild: async ({ platform }) => { submitted.push(platform); return { platform, status: 'PASS' } },
    recordSubmissions: async () => {},
  }
  const result = await runProductionRelease({ sourceSha, execute: true, submitPlatform: 'android' }, adapters)
  assert.equal(result.executed, true)
  assert.deepEqual(submitted, ['android'])
  assert.deepEqual(result.submissions.map(({ platform }) => platform), ['android'])

  submitted.length = 0
  await runProductionRelease({ sourceSha, execute: true, submitPlatform: 'all' }, adapters)
  assert.deepEqual(submitted, ['ios', 'android'])
})

test('a failed Expo upload produces a failing CLI exit code after Production release succeeds', async () => {
  const result = await runProductionRelease({ sourceSha, execute: true, submitPlatform: 'ios' }, {
    preflight: async () => preflight(),
    runPipeline: async () => ({ status: 'PASS', artifactDirectory: 'artifacts/mock-release' }),
    submitBuild: async () => ({ platform: 'ios', status: 'FAILED', detail: 'upload failed' }),
  })
  assert.equal(result.pipeline.status, 'PASS')
  assert.equal(result.submissions[0].status, 'FAILED')
  assert.equal(productionReleaseExitCode(result), 1)
  assert.equal(productionReleaseExitCode({ preflight: { status: 'BLOCKED' }, submissions: [] }), 2)
})

test('mocked smoke failure executes both rollback and reconciliation steps and marks incomplete rollback unproven', async () => {
  const rollbackCondition = "always() && (failure() || cancelled()) && steps.configure.outcome != 'skipped'"
  const steps = [
    { name: 'Build local release bundle', run: 'build' },
    { name: 'Configure exact synthetic cohort canary', id: 'configure', run: 'configure' },
    { name: 'Run three full synthetic smokes', run: 'smoke' },
    { name: 'Roll back system monitor schedules', condition: rollbackCondition, run: 'monitor-rollback' },
    { name: 'Abort canary and reconcile release identity', condition: rollbackCondition, run: 'release-rollback' },
  ]
  const invoked = []
  const result = await executeProductionReleaseSteps(steps, async (step) => {
    invoked.push(step.name)
    if (step.name === 'Run three full synthetic smokes') return false
    return step.name !== 'Roll back system monitor schedules'
  })
  assert.deepEqual(invoked, [
    'Build local release bundle', 'Configure exact synthetic cohort canary', 'Run three full synthetic smokes',
    'Roll back system monitor schedules', 'Abort canary and reconcile release identity',
  ])
  assert.equal(result.status, 'FAILED')
  assert.equal(result.rollback, 'UNPROVEN')
})

test('the bounded canary and both recovery steps finish before scheduled stale reconciliation', () => {
  const deadline = 10_000
  assert.equal(productionReleaseStepTimeoutMs({ name: 'read-only preflight' }), undefined)
  assert.equal(productionReleaseStepTimeoutMs({ name: 'bounded pre-canary step' }, { releaseDeadline: deadline, now: 2_000 }), 8_000)
  assert.equal(productionReleaseStepTimeoutMs({ name: 'canary deploy' }, { canaryDeadline: deadline, now: 2_000 }), 8_000)
  assert.equal(productionReleaseStepTimeoutMs({ name: 'canary deploy' }, { releaseDeadline: 20_000, canaryDeadline: deadline, now: 2_000 }), 8_000)
  assert.equal(productionReleaseStepTimeoutMs({ name: 'expired canary' }, { canaryDeadline: deadline, now: 11_000 }), 0)
  assert.equal(productionReleaseStepTimeoutMs({ name: 'rollback', condition: 'failure()' }), 15 * 60 * 1_000)
  assert.ok(CANARY_EXECUTION_BUDGET_MS + 2 * 15 * 60 * 1_000 < STALE_CANDIDATE_TIMEOUT_MS)
})

test('EAS submission refuses a build or attestation from a different SHA, version, or build number', () => {
  const release = buildHarnessRelease({
    environment: 'production', gitSha: sourceSha, requireCleanWorktree: false,
    providerReadiness: {
      android_fcm_v1: true, anthropic: true, deepseek: false, durable_guards: true,
      global_ai_enabled: true, ios_apns: true, perplexity: true,
      push_receipt_reconciler: true, vietmap: true,
    },
  })
  const policy = JSON.parse(readFileSync(resolve('apps/mobile/config/release-client-policy.json'), 'utf8'))
  const builds = ['ios', 'android'].map((platform, index) => ({
    id: `${index + 1}${'1'.repeat(7)}-${'1'.repeat(4)}-4111-8111-${'1'.repeat(12)}`,
    platform: platform.toUpperCase(), status: 'FINISHED', distribution: 'STORE', buildProfile: 'production',
    gitCommitHash: sourceSha, appVersion: policy.appVersion,
    appBuildVersion: String(policy.platforms[platform].buildNumber),
    runtime: { version: policy.appVersion }, appIdentifier: policy.platforms[platform].applicationId,
    fingerprint: { hash: String(index + 1).repeat(40) }, completedAt: '2026-10-20T00:00:00.000Z',
  }))
  const attestation = buildMobileBinaryAttestation({
    release, builds, artifactBytes: { ios: Buffer.from('ios'), android: Buffer.from('android') },
    now: '2026-10-20T00:00:01.000Z',
  })
  assert.equal(assertAttestedSubmissionBuild({ release, builds, attestation, platform: 'ios', sourceSha }).id, builds[0].id)
  assert.throws(() => assertAttestedSubmissionBuild({ release, builds, attestation, platform: 'ios', sourceSha: 'c'.repeat(40) }), /requested submission source/u)
  const wrongVersion = structuredClone(builds)
  wrongVersion[0].appVersion = '9.9.9'
  assert.throws(() => assertAttestedSubmissionBuild({ release, builds: wrongVersion, attestation, platform: 'ios', sourceSha }), /exact source, project, version, and build number/u)
  const wrongNumber = structuredClone(builds)
  wrongNumber[0].appBuildVersion = '999'
  assert.throws(() => assertAttestedSubmissionBuild({ release, builds: wrongNumber, attestation, platform: 'ios', sourceSha }), /exact source, project, version, and build number/u)
  const invalidBuildId = structuredClone(builds)
  invalidBuildId[0].id = 'attacker-controlled-id;echo leaked'
  assert.throws(() => assertAttestedSubmissionBuild({ release, builds: invalidBuildId, attestation, platform: 'ios', sourceSha }), /exact source, project, version, and build number/u)
})

test('EAS submission waits for the attested build ID upload and rejects invalid command identities', () => {
  const buildId = '11111111-1111-4111-8111-111111111111'
  assert.deepEqual(buildAttestedEasSubmissionArgs('ios', buildId), [
    '--dir', 'apps/mobile', 'dlx', 'eas-cli@22.0.0', 'submit',
    '--platform', 'ios', '--id', buildId, '--non-interactive', '--wait',
  ])
  assert.throws(() => buildAttestedEasSubmissionArgs('all', buildId), /identity is invalid/u)
  assert.throws(() => buildAttestedEasSubmissionArgs('android', 'attacker-controlled-id'), /identity is invalid/u)
})

test('secret redaction removes raw, encoded, bearer, and URL query values', () => {
  const token = 'sbp_private_test_token_123456789'
  const redacted = redactSensitiveText(`SUPABASE_ACCESS_TOKEN=${token} Authorization: Bearer ${token} https://example.test/upload?signature=${token}`, [token])
  assert.equal(redacted.includes(token), false)
  assert.equal(redacted.includes('signature='), false)
  assert.match(redacted, /\[REDACTED\]/u)
})
