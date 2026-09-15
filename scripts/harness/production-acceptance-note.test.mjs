import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildSyntheticCleanupReceipt } from '../../apps/api/scripts/lib/stage1-synthetic-cleanup-core.mjs'
import { buildProductionUiNormalityReceipt } from '../check-production-ui-copy.mjs'
import { buildHarnessRelease } from './release-bundle.mjs'
import { buildProductionAcceptanceRpcArgs, sha256Bytes } from './production-acceptance-note.mjs'
import { buildStage1PromotionPacket } from './stage1-promotion-packet.mjs'
import { buildMobileBinaryAttestation } from './mobile-binary-attestation.mjs'

const release = buildHarnessRelease({
  environment: 'production', gitSha: '1'.repeat(40), requireCleanWorktree: false,
  providerReadiness: {
    android_fcm_v1: true, anthropic: true, deepseek: false, durable_guards: true,
    global_ai_enabled: true, ios_apns: true, perplexity: true,
    push_receipt_reconciler: true, vietmap: true,
  },
})
const cohortId = `synthetic-stage1-${release.releaseId.slice(8, 20)}-${release.releaseId.slice(21)}-gh77`

test('builds exact RPC args only from matching Production UI, cleanup, promotion, and hosted evidence', () => {
  const fixture = fixtures()
  const args = buildProductionAcceptanceRpcArgs(fixture)
  assert.equal(args.p_release_id, release.releaseId)
  assert.equal(args.p_cohort_id, cohortId)
  assert.equal(args.p_cleanup_member_count, 2)
  assert.match(args.p_hosted_state_sha256, /^[0-9a-f]{64}$/u)
})

test('rejects a UI receipt from different source and leftover cohort state', () => {
  const fixture = fixtures()
  assert.throws(() => buildProductionAcceptanceRpcArgs({
    ...fixture,
    productionUiReceipt: { ...fixture.productionUiReceipt, sourceSha256: '0'.repeat(64) },
  }), /UI normality receipt/u)
  const dirtyCleanup = { ...fixture.cleanupReceipt, scenarioRecordCount: 1 }
  assert.throws(() => buildProductionAcceptanceRpcArgs({ ...fixture, cleanupReceipt: dirtyCleanup }), /cleanup receipt/u)
})

test('hashes the exact hosted-state bytes retained for Production review', () => {
  assert.equal(sha256Bytes(Buffer.from('hosted-state\n')), sha256Bytes(Buffer.from('hosted-state\n')))
  assert.notEqual(sha256Bytes(Buffer.from('hosted-state\n')), sha256Bytes(Buffer.from('hosted-state')))
})

function fixtures() {
  const productionUiReceipt = buildProductionUiNormalityReceipt({ now: 1_700_000_000_000 })
  const cleanupReceipt = buildSyntheticCleanupReceipt({
    releaseId: release.releaseId,
    cohortId,
    runId: 'gh:77:1:final',
    proof: {
      member_count: 2, worker_member_count: 1, worker_marker_count: 1,
      active_delivery_signal_count: 0, scenario_record_count: 0,
    },
    now: 1_700_000_000_000,
  })
  const mobileBinaryAttestation = buildMobileBinaryAttestation({
    release,
    builds: [
      build('IOS', '11111111-1111-4111-8111-111111111111', '45', 'com.phanmanhtu.homeservices', 'b'),
      build('ANDROID', '22222222-2222-4222-8222-222222222222', '4', 'com.phanmanhtu.nestscout', 'c'),
    ],
    artifactBytes: { ios: Buffer.from('ios'), android: Buffer.from('android') },
    now: '2026-08-23T01:02:00.000Z',
  })
  const promotionPacket = buildStage1PromotionPacket({
    release,
    cohortId,
    mobileBinaryAttestation,
    productionUiNormalityReceipt: productionUiReceipt,
    workflowRunId: '77',
    expandOnlyReceipt: { environment: 'production', projectRef: 'iwevizmsedyqozxlawwl', auditSha256: 'a'.repeat(64), pendingWatermark: release.migrationWatermark, pendingMigrations: [{ version: release.migrationWatermark }] },
    previousHostedState: { environment: 'production', projectRef: 'iwevizmsedyqozxlawwl', managedEdgeFunctions: managedFunctions() },
    rollbackSourceSha256ByFunction: { 'mobile-api': 'd'.repeat(64), 'kael-matching-maintainer': 'f'.repeat(64) },
    passedGates: ['main-branch-merge', 'workspace-typecheck', 'workspace-tests', 'workspace-build', 'security', 'harness', 'edge-deno', 'database-reset', 'sql-verification', 'generated-types', 'expand-only', 'hosted-drift-baseline', 'production-ui-normality'],
    now: 1_700_000_000_000,
  })
  const hostedState = {
    environment: 'production', projectRef: 'iwevizmsedyqozxlawwl', releaseId: release.releaseId,
    gitSha: release.gitSha, manifestSha256: release.manifestSha256, bundleSha256: release.bundleSha256,
    migrationInventorySha256: release.migrationInventorySha256, sourceBundleSha256: release.sourceBundleSha256,
    mobileBuildFingerprintSha256: release.mobileBuildFingerprintSha256, productionUiSourceSha256: release.productionUiSourceSha256,
    edgeBundleSha256: release.edgeBundleSha256, serviceIntakePolicyBundleSha256: release.serviceIntakePolicyBundleSha256,
    priceEvidenceBundleSha256: release.priceEvidenceBundleSha256,
    providerReadinessFingerprintSha256: release.providerReadinessFingerprintSha256,
    providerReadiness: release.providerReadiness, migrations: hostedMigrations(),
    edgeFunctions: release.edgeFunctions,
  }
  return {
    release, productionUiReceipt, cleanupReceipt, hostedState,
    hostedStateSha256: sha256Bytes(Buffer.from(JSON.stringify(hostedState))), promotionPacket,
  }
}

function hostedMigrations() {
  const replaced = new Set(release.migrationInventory.migrationEquivalences.groups
    .flatMap((group) => group.versions.filter((version) => version !== group.canonicalVersion)))
  return release.migrationInventory.entries.filter((entry) => !replaced.has(entry.version))
}

function build(platform, id, appBuildVersion, applicationIdentifier, hash) {
  return {
    id, platform, status: 'FINISHED', distribution: 'STORE', buildProfile: 'production',
    gitCommitHash: release.gitSha, appVersion: '0.2.0', appBuildVersion,
    runtimeVersion: '0.2.0', applicationIdentifier, fingerprint: { hash: hash.repeat(64) },
    completedAt: '2026-08-23T01:01:00.000Z',
  }
}

function managedFunctions() {
  return {
    'mobile-api': { status: 'ACTIVE', version: 1, ezbr_sha256: '1'.repeat(64), verify_jwt: false, import_map: true, entrypoint_path: 'index.ts', import_map_path: 'deno.json' },
    'kael-matching-maintainer': { status: 'ACTIVE', version: 1, ezbr_sha256: '2'.repeat(64), verify_jwt: false, import_map: true, entrypoint_path: 'index.ts', import_map_path: 'deno.json' },
  }
}
