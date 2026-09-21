import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

import {
  CONFIRMATION_PHRASE,
  STRICT_WORKFLOW,
  VERIFICATION_WORKFLOW,
  deriveVerificationWorkflow,
} from './generate-verification-workflow.mjs'

const read = (path) => readFileSync(resolve(path), 'utf8').replace(/\r\n/gu, '\n')
const strict = read(STRICT_WORKFLOW)
const verification = read(VERIFICATION_WORKFLOW)

function steps(text) {
  return new Map(text.split('\n      - ').slice(1).flatMap((block) => {
    const name = block.match(/^name: (.+)$/mu)?.[1]
    return name ? [[name, `      - ${block}`.trimEnd()]] : []
  }))
}

test('the committed verification workflow is exactly what the generator derives from the strict one', () => {
  assert.equal(
    verification,
    deriveVerificationWorkflow(strict),
    'run node scripts/harness/generate-verification-workflow.mjs and commit the result',
  )
})

test('every mutation and rollback step is the strict workflow text, byte for byte', () => {
  const shared = [
    'Collect hosted production baseline',
    'Reconcile a stale cancelled candidate before starting a new release',
    'Download and bind rollback_source',
    'Apply exact expand-only migration inventory',
    'Verify hosted migration watermark',
    'Register immutable release',
    'Configure exact synthetic cohort canary',
    'Bind candidate release identity before one Edge deploy',
    'Verify hosted candidate identity and bundle state',
    'Redownload and byte-prove the exact hosted candidate import closure',
    'Attest provider-owned deployment identity after byte proof',
    'Provision and permanently classify dedicated synthetic actors',
    'Run and record three consecutive full synthetic smokes',
    'Recheck exact hosted deployment immediately before promotion',
    'Prove the final synthetic cohort is clean before promotion',
    'Atomically promote the proven release',
    'Record the final Dev-review result in Supabase Production',
    'Abort canary, restore identity, and redeploy downloaded rollback',
    'Upload immutable release, smoke, and rollback evidence',
  ]
  const strictSteps = steps(strict)
  const verificationSteps = steps(verification)
  for (const name of shared) {
    assert.ok(strictSteps.has(name), `strict workflow lost the step: ${name}`)
    const expected = name === 'Upload immutable release, smoke, and rollback evidence'
      ? strictSteps.get(name).replace('stage1-production-release-', 'stage1-verification-release-')
      : strictSteps.get(name)
    assert.equal(verificationSteps.get(name), expected, name)
  }
})

test('it can only be dispatched by hand on main with the confirmation phrase', () => {
  assert.match(verification, /^on:\n {2}workflow_dispatch:\n {4}inputs:\n {6}confirm:\n/mu)
  for (const trigger of ['push:', 'schedule:', 'pull_request', 'workflow_run', 'repository_dispatch']) {
    assert.equal(verification.includes(trigger), false, trigger)
  }
  const guard = `if: github.ref == 'refs/heads/main' && inputs.confirm == '${CONFIRMATION_PHRASE}'`
  assert.equal(verification.split(guard).length - 1, 2, 'both the quality and the release job must carry the guard')
  assert.equal(verification.includes('github.event_name'), false)
  assert.match(verification, /concurrency:\n {2}group: production-release\n {2}cancel-in-progress: false/u)
})

test('it reuses store binaries of any commit and builds only a platform that has none', () => {
  const step = steps(verification).get('Reuse the latest store binaries, building only a platform that has none')
  assert.ok(step, 'the binary step must keep its build-if-missing shell')
  assert.equal(step.includes('--git-commit-hash'), false, 'a listing pinned to the release commit would ignore existing store builds')
  assert.ok(step.includes('if [ -n "$missing" ]; then'))
  assert.ok(step.includes('eas-cli@22.0.0 build --platform "$platform"'))
  assert.equal((step.match(/--relation latest_existing/gu) ?? []).length, 2, 'both readiness checks must use the latest-build relation')
  assert.equal((verification.match(/--relation latest_existing/gu) ?? []).length, 5)
  assert.equal(steps(strict).get('Reuse or build exact iOS and Android store binaries for this merge').includes('--git-commit-hash "$GITHUB_SHA"'), true)
})

test('it keeps every strict gate that still applies and says what it acknowledges', () => {
  for (const forbidden of ['--require-behavioral', '--git-commit-hash', 'stale-canary-reconciler']) {
    assert.equal(verification.includes(forbidden), false, forbidden)
  }
  for (const required of [
    '--require-bound-assertions',
    'transaction-behavior-receipt.mjs',
    '--lane verification',
    '--transaction-behavior artifacts/transactions-receipt/transaction-behavior-receipt.json',
    ',transaction-bound-assertions',
    'supabase db reset --local',
    'run-sql-tests',
    'gitleaks/gitleaks-action',
    'deployment-drift.mjs',
    'three consecutive full synthetic smokes',
    "PRODUCTION_SUPABASE_SERVICE_ROLE_KEY",
  ]) assert.ok(verification.includes(required), required)
})

test('push readiness is recorded as it is instead of being required, and nothing else is relaxed', () => {
  for (const flag of ['NESTSCOUT_ANDROID_FCM_V1_READY', 'NESTSCOUT_IOS_APNS_READY', 'NESTSCOUT_PUSH_RECEIPT_RECONCILER_READY']) {
    assert.equal(verification.includes(`test "$${flag}" = "true"`), false, flag)
    assert.equal(strict.includes(`test "$${flag}" = "true"`), true, `${flag} is still required by the strict workflow`)
    assert.ok(verification.includes(`${flag}: \${{ vars.${flag} }}`), `${flag} must still reach the manifest build`)
  }
  for (const secret of [
    'SUPABASE_ACCESS_TOKEN', 'PRODUCTION_SUPABASE_ANON_KEY', 'PRODUCTION_SUPABASE_SERVICE_ROLE_KEY', 'ANTHROPIC_API_KEY',
    'DEEPSEEK_API_KEY', 'PERPLEXITY_API_KEY', 'VIETMAP_API_KEY', 'EXPO_TOKEN', 'PRODUCTION_SYNTHETIC_CUSTOMER_EMAIL',
    'PRODUCTION_SYNTHETIC_CUSTOMER_PASSWORD', 'PRODUCTION_SYNTHETIC_WORKER_EMAIL', 'PRODUCTION_SYNTHETIC_WORKER_PASSWORD',
  ]) assert.ok(verification.includes(`test -n "$${secret}"`), `${secret} must still be required`)
})

test('every action is pinned to a full commit SHA and no step persists credentials', () => {
  const uses = [...verification.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/gmu)].map((match) => match[1])
  assert.ok(uses.length > 0)
  for (const action of uses) assert.match(action, /^[^/\s]+\/[^@\s]+@[a-f0-9]{40}$/u, action)
  const checkouts = verification.split(/^\s*- uses: /mu).slice(1).filter((step) => step.startsWith('actions/checkout@'))
  assert.ok(checkouts.length >= 2)
  for (const step of checkouts) assert.match(step, /persist-credentials:\s*false/u)
})

test('the strict workflow is untouched by the verification lane', () => {
  for (const kept of [
    'branches: [main]',
    "cron: '17 * * * *'",
    '--require-behavioral',
    'eas-cli@22.0.0 build --platform',
    'stale-canary-reconciler',
    'name: release-production\n',
  ]) assert.ok(strict.includes(kept), kept)
  for (const absent of ['--lane', 'latest_existing', 'workflow_dispatch', 'transaction-behavior-receipt', 'release-production-verification', 'verification-transaction']) {
    assert.equal(strict.includes(absent), false, absent)
  }
})

test('derivation refuses a strict workflow whose anchors have drifted', () => {
  assert.throws(() => deriveVerificationWorkflow(strict.replace('name: release-production\n', 'name: release\n')), /no longer contains exactly one/u)
  assert.throws(() => deriveVerificationWorkflow(`${strict}\n${strict}`), /no longer contains exactly one/u)
  assert.throws(
    () => deriveVerificationWorkflow(strict.replace('  stale-canary-reconciler:\n', '  reconciler:\n')),
    /job layout changed/u,
  )
})
