import assert from 'node:assert/strict'
import test from 'node:test'

import { buildNativeEvidenceReceipt, verifyNativeEvidenceReceipt } from './native-evidence-receipt.mjs'

const input = Object.freeze({
  targetEnvironment: 'production',
  platform: 'ios',
  appId: 'com.phanmanhtu.homeservices',
  buildId: '11111111-1111-4111-8111-111111111111',
  gitSha: 'a'.repeat(40),
  releaseId: `harness-${'a'.repeat(12)}-${'b'.repeat(12)}`,
  sourceBundleSha256: 'c'.repeat(64),
  workflowId: 'wf_native_77',
  workflowUrl: 'https://expo.dev/accounts/nestscout/projects/home-services/workflows/77',
  now: '2026-09-05T00:00:00.000Z',
})

test('builds a checksummed native simulator receipt with an explicit physical-device limitation', () => {
  const receipt = buildNativeEvidenceReceipt(input)
  assert.equal(receipt.proofClass, 'simulator')
  assert.equal(receipt.personas.join(','), 'customer,worker')
  assert.equal(verifyNativeEvidenceReceipt(receipt), true)
  assert.ok(receipt.limitations.includes('physical_push_background_killed_app_and_deep_link_not_proven'))
})

test('binds Android evidence to the Android application identity', () => {
  const receipt = buildNativeEvidenceReceipt({
    ...input,
    platform: 'android',
    appId: 'com.phanmanhtu.nestscout',
  })
  assert.equal(receipt.proofClass, 'emulator')
  assert.equal(verifyNativeEvidenceReceipt(receipt), true)
  assert.throws(() => buildNativeEvidenceReceipt({ ...input, platform: 'android' }), /application ID/u)
})

test('rejects a release from another Git SHA and any evidence mutation', () => {
  assert.throws(() => buildNativeEvidenceReceipt({ ...input, gitSha: 'd'.repeat(40) }), /not bound/u)
  const receipt = buildNativeEvidenceReceipt(input)
  assert.equal(verifyNativeEvidenceReceipt({ ...receipt, buildId: '22222222-2222-4222-8222-222222222222' }), false)
})
