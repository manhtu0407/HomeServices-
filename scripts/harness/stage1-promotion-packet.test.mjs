import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildStage1PromotionPacket,
  verifyStage1PromotionPacket,
} from './stage1-promotion-packet.mjs'
import { buildMobileBinaryAttestation } from './mobile-binary-attestation.mjs'
import { buildHarnessRelease } from './release-bundle.mjs'
import { buildProductionUiNormalityReceipt } from '../check-production-ui-copy.mjs'
import { rehash } from './fixtures/checksum.mjs'
import { transactionBehaviorFixture } from './fixtures/transaction-behavior-fixture.mjs'
import { buildTransactionBehaviorReceipt } from './transaction-behavior-receipt.mjs'

const release = Object.freeze(buildHarnessRelease({
  environment: 'production', gitSha: '1'.repeat(40), requireCleanWorktree: false,
  providerReadiness: productionProviderReadiness(),
}))

function productionProviderReadiness() {
  return {
    android_fcm_v1: true, anthropic: true, deepseek: false, durable_guards: true,
    global_ai_enabled: true, ios_apns: true, perplexity: true,
    push_receipt_reconciler: true, vietmap: true,
  }
}

function storeBuilds(gitCommitHash) {
  return [
    {
      id: '11111111-1111-4111-8111-111111111111', platform: 'IOS', status: 'FINISHED',
      distribution: 'STORE', buildProfile: 'production', gitCommitHash,
      appVersion: '0.2.0', appBuildVersion: '45', runtimeVersion: '0.2.0',
      applicationIdentifier: 'com.phanmanhtu.homeservices', fingerprint: { hash: 'b'.repeat(64) },
      completedAt: '2026-08-23T01:00:00.000Z',
    },
    {
      id: '22222222-2222-4222-8222-222222222222', platform: 'ANDROID', status: 'FINISHED',
      distribution: 'STORE', buildProfile: 'production', gitCommitHash,
      appVersion: '0.2.0', appBuildVersion: '4', runtimeVersion: '0.2.0',
      applicationIdentifier: 'com.phanmanhtu.nestscout', fingerprint: { hash: 'c'.repeat(64) },
      completedAt: '2026-08-23T01:01:00.000Z',
    },
  ]
}

function attest(forRelease, commit, relation) {
  return buildMobileBinaryAttestation({
    release: forRelease,
    builds: storeBuilds(commit),
    relation,
    artifactBytes: { ios: Buffer.from('ios'), android: Buffer.from('android') },
    now: '2026-08-23T01:02:00.000Z',
  })
}

const mobileBinaryAttestation = attest(release, release.gitSha)

const input = Object.freeze({
  release,
  cohortId: `synthetic-stage1-${release.releaseId.slice(8, 20)}-${release.releaseId.slice(21)}-gh77`,
  mobileBinaryAttestation,
  productionUiNormalityReceipt: buildProductionUiNormalityReceipt({ now: 1_700_000_000_000 }),
  workflowRunId: '987654321',
  expandOnlyReceipt: {
    environment: 'production',
    projectRef: 'iwevizmsedyqozxlawwl',
    auditSha256: 'a'.repeat(64),
    pendingWatermark: release.migrationWatermark,
    pendingMigrations: [{ version: release.migrationWatermark, sha256: 'b'.repeat(64), file: 'supabase/migrations/fixture.sql' }],
  },
  previousHostedState: {
    environment: 'production',
    projectRef: 'iwevizmsedyqozxlawwl',
    releaseId: 'unreleased',
    managedEdgeFunctions: {
      'mobile-api': {
        status: 'ACTIVE', version: 43, ezbr_sha256: 'c'.repeat(64), verify_jwt: false,
        import_map: true, entrypoint_path: 'index.ts', import_map_path: 'deno.json',
      },
      'kael-matching-maintainer': {
        status: 'ACTIVE', version: 12, ezbr_sha256: 'e'.repeat(64), verify_jwt: false,
        import_map: true, entrypoint_path: 'index.ts', import_map_path: 'deno.json',
      },
    },
  },
  rollbackSourceSha256ByFunction: {
    'mobile-api': 'd'.repeat(64),
    'kael-matching-maintainer': 'f'.repeat(64),
  },
  passedGates: [
    'main-branch-merge', 'workspace-typecheck', 'workspace-tests', 'workspace-build', 'security',
    'harness', 'edge-deno', 'database-reset', 'sql-verification',
    'generated-types', 'expand-only', 'hosted-drift-baseline',
    'production-ui-normality',
  ],
  now: 1_700_000_000_000,
})

test('buildStage1PromotionPacket binds release, rollback source, and expand audit', () => {
  const packet = buildStage1PromotionPacket(input)
  assert.equal(packet.schemaVersion, 'stage1-promotion-packet.v3')
  assert.equal(packet.approval, undefined)
  assert.equal(packet.release.releaseId, release.releaseId)
  assert.equal(packet.rollback.functions['mobile-api'].hostedEdgeVersion, 43)
  assert.equal(packet.rollback.functions['mobile-api'].sourceSha256, 'd'.repeat(64))
  assert.equal(packet.rollback.functions['kael-matching-maintainer'].hostedEdgeVersion, 12)
  assert.equal(packet.rollback.functions['kael-matching-maintainer'].sourceSha256, 'f'.repeat(64))
  assert.equal(packet.expandOnly.auditSha256, 'a'.repeat(64))
  assert.equal(packet.productionUiNormality.sourceSha256, release.productionUiSourceSha256)
  assert.ok(packet.productionUiNormality.localizedLiteralCount > 0)
  assert.equal(packet.productionUiNormality.languageLeakageCount, 0)
  assert.match(packet.packetSha256, /^[0-9a-f]{64}$/u)
  assert.deepEqual(verifyStage1PromotionPacket(packet), [])
})

test('packet creation fails when a required gate or exact target is missing', () => {
  assert.throws(
    () => buildStage1PromotionPacket({ ...input, passedGates: input.passedGates.slice(1) }),
    /required release gate/u,
  )
  assert.throws(
    () => buildStage1PromotionPacket({
      ...input,
      previousHostedState: { ...input.previousHostedState, projectRef: 'wrong' },
    }),
    /hosted baseline target/u,
  )
  assert.throws(
    () => buildStage1PromotionPacket({ ...input, mergeApprovalReceipt: {} }),
    /no longer accepts a reviewer approval receipt/u,
  )
})

test('tolerates an out-of-order hotfix already applied past the pending watermark', () => {
  // Mirrors a real incident: a hotfix migration landed on Production ahead of older still-pending
  // ones, so the pending set's own watermark can never reach the release's declared final version
  // through the plain-suffix case alone. That is safe exactly when every inventory entry between the
  // two watermarks is already applied on the hosted target -- nothing is unaccounted for.
  const entries = release.migrationInventory.entries
  const pendingWatermark = entries.at(-5).version
  const gapVersions = entries.slice(-4).map((entry) => entry.version)
  const packet = buildStage1PromotionPacket({
    ...input,
    expandOnlyReceipt: {
      ...input.expandOnlyReceipt,
      pendingWatermark,
      pendingMigrations: [{ version: entries[0].version, sha256: 'b'.repeat(64), file: 'supabase/migrations/fixture.sql' }],
    },
    previousHostedState: {
      ...input.previousHostedState,
      migrations: gapVersions.map((version) => ({ version, name: 'fixture' })),
    },
  })
  assert.deepEqual(verifyStage1PromotionPacket(packet), [])
})

test('still refuses a genuine gap between the pending and release migration watermarks', () => {
  const entries = release.migrationInventory.entries
  const pendingWatermark = entries.at(-5).version
  // Same shape as the tolerated case above, but the hosted target is missing one entry from the
  // gap (the third-from-last), so it is neither pending nor proven applied: a real missing migration.
  const gapVersions = entries.slice(-4).map((entry) => entry.version).filter((_, index) => index !== 1)
  assert.throws(
    () => buildStage1PromotionPacket({
      ...input,
      expandOnlyReceipt: {
        ...input.expandOnlyReceipt,
        pendingWatermark,
        pendingMigrations: [{ version: entries[0].version, sha256: 'b'.repeat(64), file: 'supabase/migrations/fixture.sql' }],
      },
      previousHostedState: {
        ...input.previousHostedState,
        migrations: gapVersions.map((version) => ({ version, name: 'fixture' })),
      },
    }),
    /does not reach the release migration watermark/u,
  )
})

test('packet verification detects any post-build evidence mutation', () => {
  const packet = buildStage1PromotionPacket(input)
  assert.match(
    verifyStage1PromotionPacket({ ...packet, workflowRunId: 'tampered' }).join('; '),
    /checksum/u,
  )
})

const rehashPacket = (packet) => rehash(packet, 'packetSha256')
const pushUnready = { ...productionProviderReadiness(), android_fcm_v1: false, ios_apns: false, push_receipt_reconciler: false }
const verificationRelease = Object.freeze(buildHarnessRelease({
  environment: 'production', gitSha: '2'.repeat(40), requireCleanWorktree: false,
  providerReadiness: pushUnready, lane: 'verification',
}))
const transactionBehaviorReceipt = (() => {
  const { value, report } = transactionBehaviorFixture('PARTIAL')
  return buildTransactionBehaviorReceipt({ manifest: value, reports: [report], now: '2026-09-21T01:02:03.000Z' })
})()
const verificationInput = Object.freeze({
  ...input,
  release: verificationRelease,
  lane: 'verification',
  cohortId: `synthetic-stage1-${verificationRelease.releaseId.slice(8, 20)}-${verificationRelease.releaseId.slice(21)}-gh78`,
  mobileBinaryAttestation: attest(verificationRelease, 'e'.repeat(40), 'latest_existing'),
  transactionBehaviorReceipt,
  passedGates: [...input.passedGates, 'transaction-bound-assertions'],
})

test('a verification packet names its lane, its binary relation, and the gaps it acknowledges', () => {
  const packet = buildStage1PromotionPacket(verificationInput)
  assert.equal(packet.lane, 'verification')
  assert.equal(packet.release.releaseLane, 'verification')
  assert.equal(packet.mobileBinaryAttestation.binaryRelation, 'latest_existing')
  assert.equal(packet.transactionBehavior.receiptSha256, transactionBehaviorReceipt.receiptSha256)
  assert.equal(packet.transactionBehavior.gapsSha256, transactionBehaviorReceipt.gapsSha256)
  assert.equal(packet.transactionBehavior.partialEntryCount, 1)
  assert.equal(packet.transactionBehavior.boundAssertionsPassed, packet.transactionBehavior.boundAssertionsRequired)
  assert.ok(packet.passedGates.includes('transaction-bound-assertions'))
  assert.deepEqual(verifyStage1PromotionPacket(packet), [])
})

test('a strict packet stays free of the verification fields and refuses them', () => {
  const strict = buildStage1PromotionPacket(input)
  for (const key of ['lane', 'transactionBehavior']) assert.equal(Object.hasOwn(strict, key), false, key)
  assert.equal(Object.hasOwn(strict.release, 'releaseLane'), false)
  assert.throws(() => buildStage1PromotionPacket({ ...input, transactionBehaviorReceipt }), /strict Stage 1 promotion accepts only/u)
  assert.throws(
    () => buildStage1PromotionPacket({ ...input, mobileBinaryAttestation: attest(release, 'e'.repeat(40), 'latest_existing') }),
    /strict Stage 1 promotion accepts only/u,
  )
  assert.throws(() => buildStage1PromotionPacket({ ...input, lane: 'verification' }), /verification-lane release/u)
  assert.throws(() => buildStage1PromotionPacket({ ...input, lane: 'other' }), /lane is invalid/u)
  assert.throws(() => buildStage1PromotionPacket({ ...verificationInput, lane: undefined }), /strict Stage 1 promotion accepts only/u)
})

test('a verification packet cannot be built without exact acknowledgement evidence', () => {
  assert.throws(
    () => buildStage1PromotionPacket({ ...verificationInput, mobileBinaryAttestation: attest(verificationRelease, verificationRelease.gitSha) }),
    /latest existing store binaries/u,
  )
  assert.throws(() => buildStage1PromotionPacket({ ...verificationInput, transactionBehaviorReceipt: undefined }), /valid transaction behavior receipt/u)
  assert.throws(
    () => buildStage1PromotionPacket({ ...verificationInput, transactionBehaviorReceipt: { ...transactionBehaviorReceipt, partialCount: 0 } }),
    /valid transaction behavior receipt/u,
  )
  assert.throws(
    () => buildStage1PromotionPacket({ ...verificationInput, passedGates: input.passedGates }),
    /missing required release gate: transaction-bound-assertions/u,
  )
})

test('packet verification rejects a lane that was added or stripped even when the checksum is recomputed', () => {
  const strict = buildStage1PromotionPacket(input)
  const verification = buildStage1PromotionPacket(verificationInput)
  const relabelled = rehashPacket({ ...strict, transactionBehavior: verification.transactionBehavior })
  assert.match(verifyStage1PromotionPacket(relabelled).join('; '), /strict lane cannot carry acknowledged transaction gaps/u)
  const stripped = { ...verification }
  delete stripped.lane
  delete stripped.transactionBehavior
  assert.match(verifyStage1PromotionPacket(rehashPacket(stripped)).join('; '), /strict lane requires an exact-commit release and binaries/u)
  const unbound = rehashPacket({ ...verification, transactionBehavior: { ...verification.transactionBehavior, boundAssertionsPassed: 0 } })
  assert.match(verifyStage1PromotionPacket(unbound).join('; '), /transaction behavior evidence is invalid/u)
  assert.match(verifyStage1PromotionPacket({ ...verification, transactionBehavior: { ...verification.transactionBehavior, partialEntryCount: 0 } }).join('; '), /checksum/u)
})

test('a verification packet must still carry its release lane, latest-binary relation, and extra gate', () => {
  const verification = buildStage1PromotionPacket(verificationInput)
  const withoutGate = rehashPacket({ ...verification, passedGates: verification.passedGates.filter((gate) => gate !== 'transaction-bound-assertions') })
  assert.match(verifyStage1PromotionPacket(withoutGate).join('; '), /missing required release gate: transaction-bound-assertions/u)
  const { releaseLane, ...unlabelled } = verification.release
  assert.equal(releaseLane, 'verification')
  assert.match(verifyStage1PromotionPacket(rehashPacket({ ...verification, release: unlabelled })).join('; '), /verification lane requires a verification release/u)
  const exactBinaries = rehashPacket({ ...verification, mobileBinaryAttestation: attest(verificationRelease, verificationRelease.gitSha) })
  assert.match(verifyStage1PromotionPacket(exactBinaries).join('; '), /verification lane requires the latest existing store binaries/u)
  assert.match(verifyStage1PromotionPacket(rehashPacket({ ...verification, lane: 'other' })).join('; '), /lane is invalid/u)
})
