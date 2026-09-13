import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildStage1PromotionPacket,
  verifyStage1PromotionPacket,
} from './stage1-promotion-packet.mjs'
import { buildReviewedMainMergeReceipt } from './github-merge-approval.mjs'
import { buildMobileBinaryAttestation } from './mobile-binary-attestation.mjs'
import { buildHarnessRelease } from './release-bundle.mjs'
import { buildProductionUiNormalityReceipt } from '../check-production-ui-copy.mjs'

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

const mergeApprovalReceipt = buildReviewedMainMergeReceipt({
  repository: 'nestscout/app',
  requiredReviewer: 'kouuuuuu',
  mergeCommitSha: release.gitSha,
  pullRequest: {
    number: 205,
    url: 'https://github.com/nestscout/app/pull/205',
    author: 'feature-author',
    headSha: 'a'.repeat(40),
    mergedAt: '2026-08-23T01:02:03Z',
    mergedBy: 'merge-owner',
  },
  review: {
    id: 88,
    actor: 'kouuuuuu',
    commitSha: 'a'.repeat(40),
    submittedAt: '2026-08-23T00:59:00Z',
  },
})

const mobileBinaryAttestation = buildMobileBinaryAttestation({
  release,
  builds: [
    {
      id: '11111111-1111-4111-8111-111111111111', platform: 'IOS', status: 'FINISHED',
      distribution: 'STORE', buildProfile: 'production', gitCommitHash: release.gitSha,
      appVersion: '0.2.0', appBuildVersion: '45', runtimeVersion: '0.2.0',
      applicationIdentifier: 'com.phanmanhtu.homeservices', fingerprint: { hash: 'b'.repeat(64) },
      completedAt: '2026-08-23T01:00:00.000Z',
    },
    {
      id: '22222222-2222-4222-8222-222222222222', platform: 'ANDROID', status: 'FINISHED',
      distribution: 'STORE', buildProfile: 'production', gitCommitHash: release.gitSha,
      appVersion: '0.2.0', appBuildVersion: '4', runtimeVersion: '0.2.0',
      applicationIdentifier: 'com.phanmanhtu.nestscout', fingerprint: { hash: 'c'.repeat(64) },
      completedAt: '2026-08-23T01:01:00.000Z',
    },
  ],
  artifactBytes: { ios: Buffer.from('ios'), android: Buffer.from('android') },
  now: '2026-08-23T01:02:00.000Z',
})

const input = Object.freeze({
  release,
  cohortId: `synthetic-stage1-${release.releaseId.slice(8, 20)}-${release.releaseId.slice(21)}-gh77`,
  mergeApprovalReceipt,
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
    'workspace-typecheck', 'workspace-tests', 'workspace-build', 'security',
    'harness', 'edge-deno', 'database-reset', 'sql-verification',
    'generated-types', 'expand-only', 'hosted-drift-baseline',
    'production-ui-normality',
  ],
  now: 1_700_000_000_000,
})

test('buildStage1PromotionPacket binds release, merge approval, rollback source, and expand audit', () => {
  const packet = buildStage1PromotionPacket(input)
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
})

test('packet verification detects any post-build evidence mutation', () => {
  const packet = buildStage1PromotionPacket(input)
  assert.match(
    verifyStage1PromotionPacket({ ...packet, approval: { ...packet.approval, actor: 'other' } }).join('; '),
    /checksum/u,
  )
})
