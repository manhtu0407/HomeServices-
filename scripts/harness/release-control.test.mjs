import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildReleaseControlInvocation,
  executeReleaseControl,
  parseReleaseControlArgs,
} from './release-control.mjs'
import { buildReleaseFailureReceipt } from './release-safety.mjs'
import { buildSyntheticSmokeReceipt } from '../../apps/api/scripts/lib/stage1-synthetic-smoke-core.mjs'
import { buildStage1PromotionPacket } from './stage1-promotion-packet.mjs'
import { buildMobileBinaryAttestation } from './mobile-binary-attestation.mjs'
import { buildHarnessRelease } from './release-bundle.mjs'
import { buildEdgeSourceProof } from './edge-source-proof.mjs'
import { buildProductionUiNormalityReceipt } from '../check-production-ui-copy.mjs'
import { createReleaseControlClient } from './release-control-client.mjs'

const release = Object.freeze(buildHarnessRelease({
  environment: 'production', gitSha: '1'.repeat(40), requireCleanWorktree: false,
  providerReadiness: productionProviderReadiness(),
}))

const cohortId = `synthetic-stage1-${release.releaseId.slice(8, 20)}-${release.releaseId.slice(21)}-gh77`
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
const packet = buildStage1PromotionPacket({
  release,
  cohortId,
  mobileBinaryAttestation,
  productionUiNormalityReceipt: buildProductionUiNormalityReceipt({ now: Date.parse('2026-08-23T00:00:00.000Z') }),
  workflowRunId: '77',
  expandOnlyReceipt: {
    environment: 'production',
    projectRef: 'iwevizmsedyqozxlawwl',
    auditSha256: 'a'.repeat(64),
    pendingWatermark: release.migrationWatermark,
    pendingMigrations: [{ version: release.migrationWatermark }],
  },
  previousHostedState: {
    environment: 'production',
    projectRef: 'iwevizmsedyqozxlawwl',
    releaseId: null,
    managedEdgeFunctions: {
      'mobile-api': {
        status: 'ACTIVE', version: 43, ezbr_sha256: 'b'.repeat(64), verify_jwt: false,
        import_map: true, entrypoint_path: 'index.ts', import_map_path: 'deno.json',
      },
      'kael-matching-maintainer': {
        status: 'ACTIVE', version: 11, ezbr_sha256: 'e'.repeat(64), verify_jwt: false,
        import_map: true, entrypoint_path: 'index.ts', import_map_path: 'deno.json',
      },
    },
  },
  rollbackSourceSha256ByFunction: {
    'mobile-api': 'c'.repeat(64),
    'kael-matching-maintainer': 'f'.repeat(64),
  },
  passedGates: [
    'main-branch-merge', 'workspace-typecheck', 'workspace-tests', 'workspace-build', 'security',
    'harness', 'edge-deno', 'database-reset', 'sql-verification',
    'generated-types', 'expand-only', 'hosted-drift-baseline',
    'production-ui-normality',
  ],
  now: Date.parse('2026-08-23T00:00:00.000Z'),
})
const sourceFunctionId = '10000000-0000-4000-8000-000000000057'
const sourceProof = buildEdgeSourceProof({
  release,
  hosted: {
    environment: 'production',
    projectRef: 'iwevizmsedyqozxlawwl',
    releaseId: release.releaseId,
    deploymentId: `iwevizmsedyqozxlawwl_${sourceFunctionId}_44`,
    managedEdgeFunctions: {
      'mobile-api': {
        id: sourceFunctionId,
        status: 'ACTIVE',
        version: 44,
        ezbr_sha256: 'd'.repeat(64),
        verify_jwt: false,
        import_map: true,
        entrypoint_path: 'index.ts',
        import_map_path: 'deno.json',
      },
    },
  },
  now: 0,
})
const maintainerFunctionId = '10000000-0000-4000-8000-000000000058'
const maintainerSourceProof = buildEdgeSourceProof({
  release,
  functionName: 'kael-matching-maintainer',
  hosted: {
    environment: 'production',
    projectRef: 'iwevizmsedyqozxlawwl',
    releaseId: release.releaseId,
    deploymentId: `iwevizmsedyqozxlawwl_${maintainerFunctionId}_12`,
    managedEdgeFunctions: {
      'kael-matching-maintainer': {
        id: maintainerFunctionId,
        status: 'ACTIVE',
        version: 12,
        ezbr_sha256: 'e'.repeat(64),
        verify_jwt: false,
        import_map: true,
        entrypoint_path: 'index.ts',
        import_map_path: 'deno.json',
      },
    },
  },
  now: 0,
})

function productionProviderReadiness() {
  return {
    android_fcm_v1: true, anthropic: true, deepseek: false, durable_guards: true,
    global_ai_enabled: true, ios_apns: true, perplexity: true,
    push_receipt_reconciler: true, vietmap: true,
  }
}

test('parseReleaseControlArgs keeps secrets out of CLI and requires explicit action', () => {
  assert.deepEqual(parseReleaseControlArgs([
    '--action', 'read',
    '--environment', 'production',
    '--project-ref', 'iwevizmsedyqozxlawwl',
  ]), {
    action: 'read',
    environment: 'production',
    projectRef: 'iwevizmsedyqozxlawwl',
    releasePath: undefined,
    packetPath: undefined,
    receiptPath: undefined,
    sourceProofPath: undefined,
    maintainerSourceProofPath: undefined,
    cohortId: undefined,
    expectedActiveReleaseId: undefined,
    expectedRevision: undefined,
    previousReleaseId: undefined,
  })
  assert.throws(
    () => parseReleaseControlArgs(['--action', 'read', '--service-role-key', 'secret']),
    /unknown argument/u,
  )
})

test('buildReleaseControlInvocation binds register and configure to immutable evidence', () => {
  assert.deepEqual(buildReleaseControlInvocation({
    action: 'configure',
    release,
    packet,
    cohortId,
    expectedActiveReleaseId: null,
  }), {
    name: 'configure_stage1_release_canary',
    args: {
      p_environment: 'production',
      p_release_id: release.releaseId,
      p_cohort_id: cohortId,
      p_expected_active_release_id: null,
      p_packet_sha256: packet.packetSha256,
    },
  })
  assert.throws(
    () => buildReleaseControlInvocation({
      action: 'configure',
      release,
      packet: { ...packet, release: { ...packet.release, releaseId: 'other' } },
      cohortId,
    }),
    /packet does not match/u,
  )
  assert.throws(
    () => buildReleaseControlInvocation({
      action: 'configure',
      release,
      packet: { ...packet, workflowRunId: 'tampered' },
      cohortId,
      expectedActiveReleaseId: null,
    }),
    /packet does not match/u,
  )
})

test('buildReleaseControlInvocation converts strict smoke evidence without weakening gates', () => {
  const receipt = buildSyntheticSmokeReceipt({
    releaseId: release.releaseId,
    environment: 'production',
    cohortId,
    runId: 'gh-77-1',
    sequence: 1,
    scenarios: { autoQuote: true, rfqOrInspection: true, recovery: true },
    releaseIdentityMatch: true,
    terminalReconcilePassed: true,
    syntheticLeakCount: 0,
    duplicateJobCount: 0,
    duplicateBroadcastCount: 0,
    safeErrorCodeRatio: 1,
    confirmAcceptanceMs: 900,
    workerOfferVisibleMs: 2200,
    supportTraceCount: 7,
    now: '2026-08-23T00:00:00.000Z',
  })
  const invocation = buildReleaseControlInvocation({
    action: 'record', release, receipt, sourceProof, maintainerSourceProof,
  })
  assert.equal(invocation.name, 'record_stage1_attested_synthetic_smoke')
  assert.equal(invocation.args.p_rfq_or_inspection_passed, true)
  assert.equal(invocation.args.p_safe_error_code_ratio, 1)
  assert.equal(invocation.args.p_receipt_sha256, receipt.receiptSha256)
  assert.deepEqual(
    buildReleaseControlInvocation({
      action: 'record', release, receipt: { status: 'passed', receipt },
      sourceProof, maintainerSourceProof,
    }),
    invocation,
  )
  assert.throws(
    () => buildReleaseControlInvocation({
      action: 'record',
      release,
      receipt: { ...receipt, confirmAcceptanceMs: 901 },
      sourceProof,
      maintainerSourceProof,
    }),
    /identity is invalid/u,
  )
})

test('executeReleaseControl reads state without RPC and returns sanitized result', async () => {
  let selected = 0
  const client = {
    async selectControl() {
      selected += 1
      return { active_release_id: release.releaseId, revision: 4 }
    },
    async rpc() {
      throw new Error('not expected')
    },
  }
  assert.deepEqual(await executeReleaseControl({ action: 'read' }, client), {
    action: 'read',
    result: { active_release_id: release.releaseId, revision: 4 },
  })
  assert.equal(selected, 1)
})

test('stale reconciliation is a CAS no-op for no candidate or a recent candidate', async () => {
  const target = { environment: 'production' }
  await assert.doesNotReject(async () => {
    const result = await executeReleaseControl({ action: 'reconcile-stale' }, {
      target,
      selectControl: async () => ({ candidate_release_id: null, revision: 4 }),
    })
    assert.equal(result.mode, 'no_candidate')
  })
  const recent = await executeReleaseControl({ action: 'reconcile-stale' }, {
    target,
    selectControl: async () => ({
      candidate_release_id: release.releaseId,
      candidate_started_at: new Date(Date.now() - 60_000).toISOString(),
      revision: 4,
    }),
  })
  assert.equal(recent.mode, 'candidate_not_stale')
})

const ABSENT_TABLE_ERROR = Object.assign(
  new Error('hosted release control read failed with HTTP 404'),
  { code: 'RELEASE_CONTROL_TABLE_ABSENT' },
)

test('stale reconciliation reports an absent release-control table as its own mode and never mutates', async () => {
  const calls = []
  const result = await executeReleaseControl({ action: 'reconcile-stale' }, {
    target: { environment: 'production' },
    selectControl: async () => { calls.push('select'); throw ABSENT_TABLE_ERROR },
    rpc: async () => { calls.push('rpc'); return true },
  })
  assert.deepEqual(result, {
    action: 'reconcile-stale',
    mode: 'release_control_schema_not_installed',
    table: 'public.stage1_release_controls',
    before: null,
    after: null,
  })
  assert.deepEqual(calls, ['select'])
})

test('only reconciliation tolerates an absent control table; every other read and unclassified failure stays fatal', async () => {
  await assert.rejects(
    executeReleaseControl({ action: 'read' }, { selectControl: async () => { throw ABSENT_TABLE_ERROR } }),
    /HTTP 404/u,
  )
  for (const message of ['HTTP 404', 'HTTP 500', 'HTTP 403']) {
    await assert.rejects(
      executeReleaseControl({ action: 'reconcile-stale' }, {
        target: { environment: 'production' },
        selectControl: async () => { throw new Error(`hosted release control read failed with ${message}`) },
      }),
      new RegExp(message, 'u'),
    )
  }
})

test('stale reconciliation over the real client skips only a table PostgREST reports as absent', async () => {
  const clientFor = (status, body) => createReleaseControlClient({
    environment: 'production',
    projectRef: 'iwevizmsedyqozxlawwl',
    projectUrl: 'https://iwevizmsedyqozxlawwl.supabase.co',
    serviceRoleKey: 'service-role-test-only',
    fetchImpl: async () => ({ ok: false, status, text: async () => JSON.stringify(body) }),
  })
  const skipped = await executeReleaseControl({ action: 'reconcile-stale' }, clientFor(404, {
    code: 'PGRST205',
    message: "Could not find the table 'public.stage1_release_controls' in the schema cache",
  }))
  assert.equal(skipped.mode, 'release_control_schema_not_installed')
  await assert.rejects(
    executeReleaseControl({ action: 'reconcile-stale' }, clientFor(404, { message: 'Not Found' })),
    /HTTP 404/u,
  )
})

test('stale reconciliation clears only the exact revision and verifies hosted state', async () => {
  const before = {
    active_release_id: null,
    previous_active_release_id: null,
    candidate_release_id: release.releaseId,
    candidate_cohort_id: cohortId,
    candidate_packet_sha256: packet.packetSha256,
    candidate_started_at: '2026-08-20T00:00:00.000Z',
    revision: 4,
  }
  const after = {
    active_release_id: null,
    previous_active_release_id: null,
    candidate_release_id: null,
    candidate_cohort_id: null,
    candidate_packet_sha256: null,
    candidate_started_at: null,
    revision: 5,
  }
  const controls = [before, after]
  const calls = []
  const result = await executeReleaseControl({ action: 'reconcile-stale' }, {
    target: { environment: 'production' },
    selectControl: async () => controls.shift(),
    rpc: async (name, args) => {
      calls.push({ name, args })
      return true
    },
  })
  assert.equal(result.mode, 'stale_candidate_aborted')
  assert.match(result.evidenceSha256, /^[0-9a-f]{64}$/u)
  assert.equal(calls[0].name, 'reconcile_stale_stage1_release_canary')
  assert.equal(calls[0].args.p_expected_revision, 4)
})

test('stale reconciliation rejects a concurrent promotion as an abort result', async () => {
  const before = {
    active_release_id: null,
    previous_active_release_id: null,
    candidate_release_id: release.releaseId,
    candidate_cohort_id: cohortId,
    candidate_packet_sha256: packet.packetSha256,
    candidate_started_at: '2026-08-20T00:00:00.000Z',
    revision: 4,
  }
  const promoted = {
    active_release_id: release.releaseId,
    previous_active_release_id: null,
    candidate_release_id: null,
    candidate_cohort_id: null,
    candidate_packet_sha256: null,
    candidate_started_at: null,
    revision: 5,
  }
  const controls = [before, promoted]
  await assert.rejects(
    executeReleaseControl({ action: 'reconcile-stale' }, {
      target: { environment: 'production' },
      selectControl: async () => controls.shift(),
      rpc: async () => false,
    }),
    /did not apply/u,
  )
})

test('promotion and abort require exact revision or checksummed failure receipt', () => {
  assert.deepEqual(buildReleaseControlInvocation({
    action: 'promote', release, packet, cohortId, expectedRevision: 8,
    sourceProof, maintainerSourceProof,
  }), {
    name: 'promote_stage1_release_attested_atomic',
    args: {
      p_environment: 'production',
      p_release_id: release.releaseId,
      p_cohort_id: cohortId,
      p_expected_revision: 8,
      p_packet_sha256: packet.packetSha256,
      p_mobile_deployment_id: sourceProof.deploymentId,
      p_mobile_source_proof_sha256: sourceProof.proofSha256,
      p_maintainer_deployment_id: maintainerSourceProof.deploymentId,
      p_maintainer_source_proof_sha256: maintainerSourceProof.proofSha256,
    },
  })
  assert.throws(
    () => buildReleaseControlInvocation({
      action: 'promote', release, packet, cohortId, expectedRevision: 0, sourceProof,
      maintainerSourceProof,
    }),
    /expected revision/u,
  )
  assert.throws(
    () => buildReleaseControlInvocation({ action: 'abort', release, receipt: { receiptSha256: 'x' } }),
    /failure receipt/u,
  )
})

test('executeReleaseControl rejects a hosted mutation that did not atomically apply', async () => {
  const failureReceipt = buildReleaseFailureReceipt({
    release,
    cohortId,
    phase: 'canary_release',
    reasonCode: 'CONTROL_TEST',
    runId: 'gh:77:1',
    now: '2026-08-23T00:00:00.000Z',
  })
  await assert.rejects(
    executeReleaseControl({ action: 'abort', release, receipt: failureReceipt }, { rpc: async () => false }),
    /abort did not apply/u,
  )
  await assert.rejects(
    executeReleaseControl({
      action: 'configure', release, packet, cohortId, expectedActiveReleaseId: null,
    }, { rpc: async () => [{ revision: 2, active_release_id: null, candidate_release_id: 'other', candidate_cohort_id: cohortId }] }),
    /wrong atomic control state/u,
  )
  await assert.rejects(
    executeReleaseControl({
      action: 'promote', release, packet, cohortId, expectedRevision: 2, sourceProof,
      maintainerSourceProof,
    }, { rpc: async () => [{ revision: 3, active_release_id: 'other' }] }),
    /wrong atomic control state/u,
  )
})

const recoveryReceipt = Object.freeze(buildReleaseFailureReceipt({
  release,
  cohortId,
  phase: 'canary_release',
  reasonCode: 'CONTROL_RECOVERY_TEST',
  runId: 'gh:77:1',
  now: '2026-08-23T00:00:00.000Z',
}))

test('recover aborts a committed candidate even when configure response was ambiguous', async () => {
  const controls = [{
    active_release_id: null,
    previous_active_release_id: null,
    candidate_release_id: release.releaseId,
    candidate_cohort_id: cohortId,
    candidate_packet_sha256: packet.packetSha256,
    revision: 8,
  }, {
    active_release_id: null,
    previous_active_release_id: null,
    candidate_release_id: null,
    candidate_cohort_id: null,
    candidate_packet_sha256: null,
    revision: 9,
  }]
  const calls = []
  const result = await executeReleaseControl({
    action: 'recover', release, receipt: recoveryReceipt, previousReleaseId: null,
  }, {
    selectControl: async () => controls.shift(),
    rpc: async (name, args) => {
      calls.push({ name, args })
      return true
    },
  })
  assert.equal(result.mode, 'candidate_aborted')
  assert.equal(result.rpcResponseAmbiguous, false)
  assert.equal(calls[0].name, 'abort_stage1_release_canary')
})

test('recover atomically rolls an ambiguously promoted release back to the exact previous release', async () => {
  const previousReleaseId = 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb'
  const controls = [{
    active_release_id: release.releaseId,
    previous_active_release_id: previousReleaseId,
    candidate_release_id: null,
    candidate_cohort_id: null,
    candidate_packet_sha256: null,
    revision: 9,
  }, {
    active_release_id: previousReleaseId,
    previous_active_release_id: null,
    candidate_release_id: null,
    candidate_cohort_id: null,
    candidate_packet_sha256: null,
    revision: 10,
  }]
  const result = await executeReleaseControl({
    action: 'recover', release, receipt: recoveryReceipt, previousReleaseId,
  }, {
    selectControl: async () => controls.shift(),
    rpc: async () => [{ active_release_id: previousReleaseId, previous_active_release_id: null, revision: 10 }],
  })
  assert.equal(result.mode, 'active_rolled_back')
  assert.equal(result.after.active_release_id, previousReleaseId)
})

test('recover verifies hosted state after an ambiguous rollback RPC response', async () => {
  const previousReleaseId = 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb'
  const controls = [{
    active_release_id: release.releaseId,
    previous_active_release_id: previousReleaseId,
    candidate_release_id: null,
    candidate_cohort_id: null,
    candidate_packet_sha256: null,
    revision: 9,
  }, {
    active_release_id: previousReleaseId,
    previous_active_release_id: null,
    candidate_release_id: null,
    candidate_cohort_id: null,
    candidate_packet_sha256: null,
    revision: 10,
  }]
  const result = await executeReleaseControl({
    action: 'recover', release, receipt: recoveryReceipt, previousReleaseId,
  }, {
    selectControl: async () => controls.shift(),
    rpc: async () => { throw new Error('network response lost') },
  })
  assert.equal(result.rpcResponseAmbiguous, true)
  assert.equal(result.after.revision, 10)
})

test('recover fails closed on unrelated control state', async () => {
  await assert.rejects(executeReleaseControl({
    action: 'recover', release, receipt: recoveryReceipt, previousReleaseId: null,
  }, {
    selectControl: async () => ({
      active_release_id: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb',
      previous_active_release_id: null,
      candidate_release_id: 'harness-cccccccccccc-dddddddddddd',
      candidate_cohort_id: cohortId,
      candidate_packet_sha256: packet.packetSha256,
      revision: 8,
    }),
  }), /neither the candidate/u)
})
