import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkHarnessRelease, resolveReleaseArtifactPath } from './release-bundle.mjs'
import { createReleaseControlClient, releaseRegistrationArgs } from './release-control-client.mjs'
import { verifyReleaseFailureReceiptChecksum } from './release-safety.mjs'
import { verifySyntheticSmokeReceiptChecksum } from '../../apps/api/scripts/lib/stage1-synthetic-smoke-core.mjs'
import { verifyStage1PromotionPacket } from './stage1-promotion-packet.mjs'
import { verifyEdgeSourceProof } from './edge-source-proof.mjs'
import { verifyStage1StagingValidationPacket } from './stage1-staging-validation-packet.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const ACTIONS = new Set(['abort', 'configure', 'promote', 'read', 'reconcile-stale', 'record', 'recover', 'register'])
const SHA256 = /^[0-9a-f]{64}$/u
const RELEASE_ID = /^harness-[0-9a-f]{12}-[0-9a-f]{12}$/u
const COHORT_ID = /^synthetic-stage1-[0-9a-f]{12}-[0-9a-f]{12}-[A-Za-z0-9_-]{1,48}$/u
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

export function parseReleaseControlArgs(args = process.argv.slice(2)) {
  const parsed = {
    action: undefined,
    environment: undefined,
    projectRef: undefined,
    releasePath: undefined,
    packetPath: undefined,
    receiptPath: undefined,
    sourceProofPath: undefined,
    maintainerSourceProofPath: undefined,
    cohortId: undefined,
    expectedActiveReleaseId: undefined,
    expectedRevision: undefined,
    previousReleaseId: undefined,
  }
  const strings = new Map([
    ['--action', 'action'],
    ['--environment', 'environment'],
    ['--project-ref', 'projectRef'],
    ['--release', 'releasePath'],
    ['--packet', 'packetPath'],
    ['--receipt', 'receiptPath'],
    ['--source-proof', 'sourceProofPath'],
    ['--maintainer-source-proof', 'maintainerSourceProofPath'],
    ['--cohort-id', 'cohortId'],
    ['--expected-active-release-id', 'expectedActiveReleaseId'],
    ['--previous-release-id', 'previousReleaseId'],
  ])
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--') continue
    if (argument === '--expected-revision') {
      const raw = requireValue(args, ++index, argument)
      if (!/^[1-9][0-9]*$/u.test(raw)) throw new Error('--expected-revision requires a positive integer')
      parsed.expectedRevision = Number(raw)
      continue
    }
    const field = strings.get(argument)
    if (!field) throw new Error(`unknown argument: ${argument}`)
    parsed[field] = requireValue(args, ++index, argument)
  }
  if (!ACTIONS.has(parsed.action)) throw new Error('--action must name a supported release-control action')
  if (parsed.expectedActiveReleaseId === 'none') parsed.expectedActiveReleaseId = null
  if (parsed.previousReleaseId === 'none') parsed.previousReleaseId = null
  return parsed
}

export function buildReleaseControlInvocation(input) {
  const action = input?.action
  const release = input?.release
  if (action === 'register') {
    assertRelease(release)
    return { name: 'register_harness_release', args: releaseRegistrationArgs(release, input.previousReleaseId) }
  }
  if (action === 'configure' || action === 'promote') {
    assertReleaseCore(release)
    assertPacket(release, input.packet, input.cohortId)
    assertCohort(input.cohortId)
    if (action === 'configure') {
      if (input.expectedActiveReleaseId !== null && !RELEASE_ID.test(input.expectedActiveReleaseId ?? '')) {
        throw new Error('configure requires the exact active release ID or none')
      }
      return {
        name: 'configure_stage1_release_canary',
        args: {
          p_environment: release.environment,
          p_release_id: release.releaseId,
          p_cohort_id: input.cohortId,
          p_expected_active_release_id: input.expectedActiveReleaseId,
          p_packet_sha256: input.packet.packetSha256,
        },
      }
    }
    if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1) {
      throw new Error('promotion requires a positive expected revision')
    }
    assertSourceProof(release, input.sourceProof, 'mobile-api')
    assertSourceProof(release, input.maintainerSourceProof, 'kael-matching-maintainer')
    return {
      name: 'promote_stage1_release_attested_atomic',
      args: {
        p_environment: release.environment,
        p_release_id: release.releaseId,
        p_cohort_id: input.cohortId,
        p_expected_revision: input.expectedRevision,
        p_packet_sha256: input.packet.packetSha256,
        p_mobile_deployment_id: input.sourceProof.deploymentId,
        p_mobile_source_proof_sha256: input.sourceProof.proofSha256,
        p_maintainer_deployment_id: input.maintainerSourceProof.deploymentId,
        p_maintainer_source_proof_sha256: input.maintainerSourceProof.proofSha256,
      },
    }
  }
  if (action === 'record') {
    assertReleaseCore(release)
    assertSourceProof(release, input.sourceProof, 'mobile-api')
    assertSourceProof(release, input.maintainerSourceProof, 'kael-matching-maintainer')
    const receipt = input.receipt?.receipt ?? input.receipt
    return {
      name: 'record_stage1_attested_synthetic_smoke',
      args: {
        ...smokeReceiptArgs(release, receipt),
        p_mobile_deployment_id: input.sourceProof.deploymentId,
        p_mobile_source_proof_sha256: input.sourceProof.proofSha256,
        p_maintainer_deployment_id: input.maintainerSourceProof.deploymentId,
        p_maintainer_source_proof_sha256: input.maintainerSourceProof.proofSha256,
      },
    }
  }
  if (action === 'abort') {
    assertReleaseCore(release)
    const receipt = input.receipt
    assertFailureReceipt(release, receipt)
    return {
      name: 'abort_stage1_release_canary',
      args: {
        p_environment: release.environment,
        p_release_id: release.releaseId,
        p_cohort_id: receipt.cohortId,
        p_evidence_sha256: receipt.receiptSha256,
      },
    }
  }
  throw new Error(`release-control action does not use an RPC invocation: ${action ?? 'missing'}`)
}

export async function executeReleaseControl(input, client) {
  if (input.action === 'read') return { action: 'read', result: await client.selectControl() }
  if (input.action === 'reconcile-stale') return reconcileStaleReleaseControl(client)
  if (input.action === 'recover') return recoverAmbiguousReleaseControl(input, client)
  const invocation = buildReleaseControlInvocation(input)
  const result = await client.rpc(invocation.name, invocation.args)
  if (input.action === 'abort' && result !== true) throw new Error('hosted canary abort did not apply')
  if (['configure', 'promote'].includes(input.action) && (!Array.isArray(result) || result.length !== 1)) {
    throw new Error(`hosted release ${input.action} did not return one atomic control row`)
  }
  if (input.action === 'configure') {
    const row = result[0]
    if (!Number.isSafeInteger(row?.revision) || row.revision < 1 ||
        row.active_release_id !== input.expectedActiveReleaseId ||
        row.candidate_release_id !== input.release.releaseId ||
        row.candidate_cohort_id !== input.cohortId) {
      throw new Error('hosted release configure returned the wrong atomic control state')
    }
  }
  if (input.action === 'promote') {
    const row = result[0]
    if (row?.active_release_id !== input.release.releaseId ||
        !Number.isSafeInteger(row?.revision) || row.revision !== input.expectedRevision + 1) {
      throw new Error('hosted release promotion returned the wrong atomic control state')
    }
  }
  if (input.action === 'record' && (typeof result !== 'string' || !UUID.test(result))) {
    throw new Error('hosted smoke receipt was not recorded')
  }
  return { action: input.action, result }
}

async function reconcileStaleReleaseControl(client, now = Date.now()) {
  const before = await client.selectControl()
  if (!before?.candidate_release_id) {
    return { action: 'reconcile-stale', mode: 'no_candidate', before, after: before }
  }
  const startedAt = Date.parse(before.candidate_started_at ?? '')
  if (!Number.isFinite(startedAt)) throw new Error('hosted candidate start time is invalid')
  if (now - startedAt < 2 * 60 * 60 * 1_000) {
    return { action: 'reconcile-stale', mode: 'candidate_not_stale', before, after: before }
  }
  const evidenceSha256 = createHash('sha256').update([
    'stage1-stale-reconcile.v1',
    client.target.environment,
    before.candidate_release_id,
    String(before.revision),
    before.candidate_started_at,
  ].join('\n')).digest('hex')
  let rpcError
  try {
    const applied = await client.rpc('reconcile_stale_stage1_release_canary', {
      p_environment: client.target.environment,
      p_expected_candidate_release_id: before.candidate_release_id,
      p_expected_revision: before.revision,
      p_evidence_sha256: evidenceSha256,
    })
    if (applied !== true) throw new Error('hosted stale candidate reconciliation did not apply')
  } catch (error) {
    rpcError = error
  }
  const after = await client.selectControl()
  if (!after || after.candidate_release_id !== null || after.candidate_cohort_id !== null ||
      after.candidate_packet_sha256 !== null || after.revision !== before.revision + 1 ||
      after.active_release_id !== before.active_release_id ||
      after.previous_active_release_id !== before.previous_active_release_id) {
    throw rpcError ?? new Error('hosted stale candidate did not reach the safe baseline')
  }
  return {
    action: 'reconcile-stale',
    mode: 'stale_candidate_aborted',
    evidenceSha256,
    before,
    after,
    rpcResponseAmbiguous: Boolean(rpcError),
  }
}

async function recoverAmbiguousReleaseControl(input, client) {
  assertReleaseCore(input.release)
  assertFailureReceipt(input.release, input.receipt)
  if (input.previousReleaseId === undefined ||
      (input.previousReleaseId !== null && !RELEASE_ID.test(input.previousReleaseId))) {
    throw new Error('release recovery requires the exact previous active release ID or none')
  }
  const before = await client.selectControl()
  if (!before) throw new Error('hosted release recovery control state is missing')
  const receipt = input.receipt
  let mode
  let invocation
  if (before.candidate_release_id === input.release.releaseId &&
      before.candidate_cohort_id === receipt.cohortId) {
    mode = 'candidate_aborted'
    invocation = {
      name: 'abort_stage1_release_canary',
      args: {
        p_environment: input.release.environment,
        p_release_id: input.release.releaseId,
        p_cohort_id: receipt.cohortId,
        p_evidence_sha256: receipt.receiptSha256,
      },
    }
  } else if (before.active_release_id === input.release.releaseId &&
      before.previous_active_release_id === input.previousReleaseId &&
      before.candidate_release_id === null) {
    mode = 'active_rolled_back'
    invocation = {
      name: 'rollback_stage1_active_release_atomic',
      args: {
        p_environment: input.release.environment,
        p_failed_release_id: input.release.releaseId,
        p_expected_previous_release_id: input.previousReleaseId,
        p_expected_revision: before.revision,
        p_evidence_sha256: receipt.receiptSha256,
      },
    }
  } else if (controlIsRecovered(before, input.previousReleaseId)) {
    return { action: 'recover', mode: 'already_safe', before, after: before }
  } else {
    throw new Error('hosted release control is neither the candidate, promoted release, nor recovered baseline')
  }

  let rpcError
  try {
    const result = await client.rpc(invocation.name, invocation.args)
    if (mode === 'candidate_aborted' && result !== true) {
      throw new Error('hosted canary abort did not apply')
    }
    if (mode === 'active_rolled_back' && (!Array.isArray(result) || result.length !== 1 ||
        result[0]?.active_release_id !== input.previousReleaseId ||
        result[0]?.revision !== before.revision + 1)) {
      throw new Error('hosted active-release rollback returned the wrong atomic state')
    }
  } catch (error) {
    rpcError = error
  }
  const after = await client.selectControl()
  if (!controlIsRecovered(after, input.previousReleaseId) || after.revision !== before.revision + 1) {
    throw rpcError ?? new Error('hosted release recovery did not reach the exact baseline state')
  }
  return { action: 'recover', mode, before, after, rpcResponseAmbiguous: Boolean(rpcError) }
}

function smokeReceiptArgs(release, receipt) {
  if (receipt?.releaseId !== release.releaseId || receipt.environment !== release.environment ||
      !COHORT_ID.test(receipt?.cohortId ?? '') || !/^[A-Za-z0-9_.:-]{1,120}$/u.test(receipt?.runId ?? '') ||
      !Number.isInteger(receipt?.sequence) || receipt.sequence < 1 || receipt.sequence > 3 ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(receipt?.generatedAt ?? '') ||
      !SHA256.test(receipt?.receiptSha256 ?? '') || !verifySyntheticSmokeReceiptChecksum(receipt)) {
    throw new Error('synthetic smoke receipt identity is invalid')
  }
  const scenarios = receipt.scenarios ?? {}
  return {
    p_release_id: release.releaseId,
    p_environment: release.environment,
    p_cohort_id: receipt.cohortId,
    p_run_id: receipt.runId,
    p_sequence: receipt.sequence,
    p_auto_quote_passed: scenarios.autoQuote === true,
    p_rfq_or_inspection_passed: scenarios.rfqOrInspection === true,
    p_recovery_passed: scenarios.recovery === true,
    p_release_identity_match: receipt.releaseIdentityMatch === true,
    p_terminal_reconcile_passed: receipt.terminalReconcilePassed === true,
    p_synthetic_leak_count: integer(receipt.syntheticLeakCount, 'synthetic leak count'),
    p_duplicate_job_count: integer(receipt.duplicateJobCount, 'duplicate job count'),
    p_duplicate_broadcast_count: integer(receipt.duplicateBroadcastCount, 'duplicate broadcast count'),
    p_safe_error_code_ratio: finiteNumber(receipt.safeErrorCodeRatio, 'safe error code ratio'),
    p_confirm_acceptance_ms: integer(receipt.confirmAcceptanceMs, 'confirm acceptance latency'),
    p_worker_offer_visible_ms: integer(receipt.workerOfferVisibleMs, 'worker offer latency'),
    p_support_trace_count: integer(receipt.supportTraceCount, 'support trace count'),
    p_receipt_generated_at: receipt.generatedAt,
    p_receipt_sha256: receipt.receiptSha256,
  }
}

function assertFailureReceipt(release, receipt) {
  if (receipt?.status !== 'aborted' || receipt.releaseId !== release.releaseId ||
      receipt.releaseBundleSha256 !== release.bundleSha256 || !SHA256.test(receipt.receiptSha256 ?? '') ||
      !COHORT_ID.test(receipt.cohortId ?? '') || !verifyReleaseFailureReceiptChecksum(receipt)) {
    throw new Error('abort requires a checksummed failure receipt for this release and cohort')
  }
}

function controlIsRecovered(control, previousReleaseId) {
  return Boolean(control) && control.active_release_id === previousReleaseId &&
    control.candidate_release_id === null && control.candidate_cohort_id === null &&
    control.candidate_packet_sha256 === null
}

function assertRelease(release) {
  const problems = checkHarnessRelease(release ?? {})
  if (problems.length) throw new Error(`release artifact is invalid: ${problems.join('; ')}`)
}

function assertReleaseCore(release) {
  if (!RELEASE_ID.test(release?.releaseId ?? '') ||
      !['staging', 'production'].includes(release?.environment) ||
      !SHA256.test(release?.bundleSha256 ?? '')) {
    throw new Error('release-control requires a valid hosted immutable release')
  }
}

function assertPacket(release, packet, cohortId) {
  const problems = release?.environment === 'staging'
    ? verifyStage1StagingValidationPacket(packet)
    : verifyStage1PromotionPacket(packet)
  if (problems.length > 0 || packet?.release?.releaseId !== release.releaseId ||
      packet?.release?.bundleSha256 !== release.bundleSha256 ||
      packet?.environment !== release.environment || packet?.cohortId !== cohortId) {
    throw new Error('promotion packet does not match the selected release')
  }
}

function assertCohort(value) {
  if (!COHORT_ID.test(value ?? '')) throw new Error('release-control cohort ID is invalid')
}

function assertSourceProof(release, proof, expectedFunctionName) {
  try {
    verifyEdgeSourceProof(proof)
  } catch {
    throw new Error('release-control requires a valid source deployment proof')
  }
  if (proof.releaseId !== release.releaseId || proof.environment !== release.environment ||
      proof.functionName !== expectedFunctionName) {
    throw new Error('release-control source deployment proof does not match the release')
  }
}

function integer(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} is invalid`)
  return value
}

function finiteNumber(value, label) {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} is invalid`)
  return value
}

function requireValue(args, index, option) {
  const value = args[index]
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`)
  return value
}

function readJson(path) {
  if (!path) return undefined
  return JSON.parse(readFileSync(resolveReleaseArtifactPath(ROOT, path), 'utf8'))
}

function projectUrl(environment, projectRef) {
  if (!['staging', 'production'].includes(environment)) throw new Error('release-control requires staging or production')
  return `https://${projectRef}.supabase.co`
}

async function main() {
  const args = parseReleaseControlArgs()
  if (!args.environment || !args.projectRef) throw new Error('--environment and --project-ref are required')
  const release = readJson(args.releasePath)
  if (release && release.environment !== args.environment) throw new Error('CLI environment does not match release artifact')
  const client = createReleaseControlClient({
    environment: args.environment,
    projectRef: args.projectRef,
    projectUrl: projectUrl(args.environment, args.projectRef),
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  })
  const result = await executeReleaseControl({
    ...args,
    release,
    packet: readJson(args.packetPath),
    receipt: readJson(args.receiptPath),
    sourceProof: readJson(args.sourceProofPath),
    maintainerSourceProof: readJson(args.maintainerSourceProofPath),
  }, client)
  process.stdout.write(`${JSON.stringify(result)}\n`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`release-control failed: ${error.message}\n`)
    process.exitCode = 1
  })
}
