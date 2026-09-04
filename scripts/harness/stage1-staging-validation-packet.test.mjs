import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { buildEdgeSourceProof } from './edge-source-proof.mjs'
import { buildHarnessRelease } from './release-bundle.mjs'
import { buildReleaseControlInvocation } from './release-control.mjs'
import { canonicalMigrationEntries } from './migration-history.mjs'
import {
  buildStage1StagingValidationPacket,
  verifyStage1StagingValidationPacket,
} from './stage1-staging-validation-packet.mjs'

const root = fileURLToPath(new URL('../..', import.meta.url))

test('binds one Staging cohort to live hosted SQL, release identity, and both source proofs', () => {
  const release = buildHarnessRelease({
    root, environment: 'staging', gitSha: 'a'.repeat(40), requireCleanWorktree: false,
  })
  const mobileId = '10000000-0000-4000-8000-000000000057'
  const maintainerId = '10000000-0000-4000-8000-000000000058'
  const hosted = {
    environment: 'staging', projectRef: 'xyylanuyflrjzbjzhqfl', releaseId: release.releaseId,
    gitSha: release.gitSha, manifestSha256: release.manifestSha256, bundleSha256: release.bundleSha256,
    sourceBundleSha256: release.sourceBundleSha256, edgeBundleSha256: release.edgeBundleSha256,
    migrationInventorySha256: release.migrationInventorySha256,
    providerReadinessFingerprintSha256: release.providerReadinessFingerprintSha256,
    deploymentId: `xyylanuyflrjzbjzhqfl_${mobileId}_7`,
    evidenceSource: 'hosted-api-and-readonly-sql',
    migrations: canonicalMigrationEntries(release.migrationInventory),
    clientCompatibility: { contractEpoch: 2, ios: {}, android: {} },
    managedEdgeFunctions: {
      'mobile-api': managed(mobileId, 7, '7'),
      'kael-matching-maintainer': managed(maintainerId, 3, '8'),
    },
  }
  const mobileProof = buildEdgeSourceProof({ release, hosted, sourceRoot: root, now: 0 })
  const maintainerProof = buildEdgeSourceProof({
    release, hosted, sourceRoot: root, functionName: 'kael-matching-maintainer', now: 0,
  })
  const cohortId = `synthetic-stage1-${release.releaseId.slice(8, 20)}-${release.releaseId.slice(21)}-staging`
  const packet = buildStage1StagingValidationPacket({
    release, hosted, mobileProof, maintainerProof, cohortId, now: 0,
  })
  assert.deepEqual(verifyStage1StagingValidationPacket(packet), [])
  assert.equal(packet.deployments['mobile-api'].deploymentId, hosted.deploymentId)
  assert.equal(packet.deployments['kael-matching-maintainer'].proofSha256, maintainerProof.proofSha256)
  assert.ok(verifyStage1StagingValidationPacket({ ...packet, cohortId: `${cohortId}-tampered` }).includes('checksum is invalid'))
  assert.deepEqual(buildReleaseControlInvocation({
    action: 'configure', release, packet, cohortId, expectedActiveReleaseId: null,
  }), {
    name: 'configure_stage1_release_canary',
    args: {
      p_environment: 'staging', p_release_id: release.releaseId, p_cohort_id: cohortId,
      p_expected_active_release_id: null, p_packet_sha256: packet.packetSha256,
    },
  })
  assert.throws(
    () => buildReleaseControlInvocation({
      action: 'configure', release, packet, cohortId: `${cohortId}-other`, expectedActiveReleaseId: null,
    }),
    /packet does not match/u,
  )
})

test('accepts exact hosted migration aliases through the canonical equivalence registry', () => {
  const release = buildHarnessRelease({
    root, environment: 'staging', gitSha: 'b'.repeat(40), requireCleanWorktree: false,
  })
  const mobileId = '10000000-0000-4000-8000-000000000057'
  const maintainerId = '10000000-0000-4000-8000-000000000058'
  const aliasGroup = release.migrationInventory.migrationEquivalences.groups
    .find((group) => group.versions.some((version) => version !== group.canonicalVersion))
  assert.ok(aliasGroup)
  const aliasVersion = aliasGroup.versions.find((version) => version !== aliasGroup.canonicalVersion)
  assert.ok(aliasVersion)
  const migrations = canonicalMigrationEntries(release.migrationInventory)
    .map((entry) => entry.version === aliasGroup.canonicalVersion
      ? { ...entry, version: aliasVersion }
      : entry)
    .sort((left, right) => left.version.localeCompare(right.version))
  const hosted = {
    environment: 'staging', projectRef: 'xyylanuyflrjzbjzhqfl', releaseId: release.releaseId,
    gitSha: release.gitSha, manifestSha256: release.manifestSha256, bundleSha256: release.bundleSha256,
    sourceBundleSha256: release.sourceBundleSha256, edgeBundleSha256: release.edgeBundleSha256,
    migrationInventorySha256: release.migrationInventorySha256,
    providerReadinessFingerprintSha256: release.providerReadinessFingerprintSha256,
    deploymentId: `xyylanuyflrjzbjzhqfl_${mobileId}_7`,
    evidenceSource: 'hosted-api-and-readonly-sql', migrations,
    clientCompatibility: { contractEpoch: 2, ios: {}, android: {} },
    managedEdgeFunctions: {
      'mobile-api': managed(mobileId, 7, '7'),
      'kael-matching-maintainer': managed(maintainerId, 3, '8'),
    },
  }
  const mobileProof = buildEdgeSourceProof({ release, hosted, sourceRoot: root, now: 0 })
  const maintainerProof = buildEdgeSourceProof({
    release, hosted, sourceRoot: root, functionName: 'kael-matching-maintainer', now: 0,
  })
  const cohortId = `synthetic-stage1-${release.releaseId.slice(8, 20)}-${release.releaseId.slice(21)}-alias`
  const packet = buildStage1StagingValidationPacket({
    release, hosted, mobileProof, maintainerProof, cohortId, now: 0,
  })

  assert.deepEqual(verifyStage1StagingValidationPacket(packet), [])
  assert.equal(packet.hostedMigrationWatermark, release.migrationWatermark)
})

function managed(id, version, digestCharacter) {
  return {
    id, status: 'ACTIVE', version, ezbr_sha256: digestCharacter.repeat(64), verify_jwt: false,
    import_map: true, entrypoint_path: 'index.ts', import_map_path: 'deno.json',
  }
}
