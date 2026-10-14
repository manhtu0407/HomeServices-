import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyTransactionBehaviorReceipt } from './transaction-behavior-receipt.mjs'
import { checkHarnessRelease, resolveReleaseArtifactPath } from './release-bundle.mjs'
import { verifyEdgeSourceProof } from './edge-source-proof.mjs'
import { verifyBackendReleaseProbeReceipt } from '../system-monitor/backend-release-probe.mjs'
import { verifyCloudflareRuntimeEvidence } from '../system-monitor/verify-cloudflare-runtime.mjs'

const TARGET = 'iwevizmsedyqozxlawwl'
const HASH = /^[0-9a-f]{64}$/u
const RELEASE_ID = /^harness-[0-9a-f]{12}-[0-9a-f]{12}$/u
const GATE_SCHEMA = 'backend-system-health-gate-receipt/v1'
const GATE_NAMES = Object.freeze(['quality', 'parity', 'expand', 'rollback'])
const GATE_WORKFLOW = '.github/workflows/release-backend-system-health.yml'
const GATE_FIELDS = Object.freeze(['schemaVersion', 'gate', 'status', 'environment', 'projectRef',
  'releaseId', 'sourceSha', 'releaseManifestSha256', 'baselineSha256', 'workflowPath', 'runId',
  'runAttempt', 'completedAt', 'evidenceSha256', 'receiptSha256'])
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

export function buildBackendGateReceipt(input) {
  const { release, gate, evidenceBytes, workflowRun } = input ?? {}
  if (!GATE_NAMES.includes(gate) || release?.environment !== 'production' ||
      release?.releaseLane !== 'backend-system-health' || !HASH.test(release?.backendHostedStateSha256 ?? '') ||
      !HASH.test(release?.manifestSha256 ?? '') || !/^[0-9a-f]{40}$/u.test(release?.gitSha ?? '') ||
      !new RegExp(`^harness-${release.gitSha.slice(0, 12)}-[0-9a-f]{12}$`, 'u').test(release?.releaseId ?? '') ||
      !(evidenceBytes instanceof Uint8Array) || evidenceBytes.byteLength === 0 ||
      workflowRun?.workflowPath !== GATE_WORKFLOW || !/^\d{1,20}$/u.test(String(workflowRun?.runId ?? '')) ||
      !Number.isSafeInteger(workflowRun?.runAttempt) || workflowRun.runAttempt < 1) {
    throw new Error('BACKEND_GATE_RECEIPT_INPUT_INVALID')
  }
  const receipt = {
    schemaVersion: GATE_SCHEMA,
    gate,
    status: 'PASS',
    environment: 'production',
    projectRef: TARGET,
    releaseId: release.releaseId,
    sourceSha: release.gitSha,
    releaseManifestSha256: release.manifestSha256,
    baselineSha256: release.backendHostedStateSha256,
    workflowPath: workflowRun.workflowPath,
    runId: String(workflowRun.runId),
    runAttempt: workflowRun.runAttempt,
    completedAt: new Date(input.now ?? Date.now()).toISOString(),
    evidenceSha256: sha256(evidenceBytes),
    receiptSha256: '',
  }
  receipt.receiptSha256 = sha256(canonicalJson({ ...receipt, receiptSha256: undefined }))
  if (verifyBackendGateReceipt({ receipt, evidenceBytes, release, gate, workflowRun, now: input.now }).length) {
    throw new Error('BACKEND_GATE_RECEIPT_INVALID')
  }
  return Object.freeze(receipt)
}

export function verifyBackendGateReceipt(input) {
  const { receipt, evidenceBytes, release, gate, workflowRun, now = Date.now() } = input ?? {}
  const problems = []
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt) ||
      Object.keys(receipt).sort().join('|') !== [...GATE_FIELDS].sort().join('|')) {
    return ['BACKEND_GATE_RECEIPT_FIELDS_INVALID']
  }
  if (receipt.schemaVersion !== GATE_SCHEMA || receipt.gate !== gate || !GATE_NAMES.includes(gate) ||
      receipt.status !== 'PASS' || receipt.environment !== 'production' || receipt.projectRef !== TARGET ||
      receipt.releaseId !== release?.releaseId || receipt.sourceSha !== release?.gitSha ||
      receipt.releaseManifestSha256 !== release?.manifestSha256 ||
      receipt.baselineSha256 !== release?.backendHostedStateSha256 ||
      receipt.workflowPath !== GATE_WORKFLOW || receipt.workflowPath !== workflowRun?.workflowPath ||
      receipt.runId !== String(workflowRun?.runId ?? '') || receipt.runAttempt !== workflowRun?.runAttempt) {
    problems.push('BACKEND_GATE_RECEIPT_IDENTITY_INVALID')
  }
  const completedAt = Date.parse(receipt.completedAt ?? '')
  if (!Number.isFinite(now) || !Number.isFinite(completedAt) || completedAt > now ||
      !(evidenceBytes instanceof Uint8Array) || evidenceBytes.byteLength === 0 ||
      receipt.evidenceSha256 !== sha256(evidenceBytes)) {
    problems.push('BACKEND_GATE_RECEIPT_EVIDENCE_INVALID')
  }
  if (!HASH.test(receipt.receiptSha256 ?? '') ||
      receipt.receiptSha256 !== sha256(canonicalJson({ ...receipt, receiptSha256: undefined }))) {
    problems.push('BACKEND_GATE_RECEIPT_CHECKSUM_INVALID')
  }
  return [...new Set(problems)]
}

export function requireBackendTransactionEvidence(receipt, coverage) {
  if (verifyTransactionBehaviorReceipt(receipt).length) throw new Error('TRANSACTION_EVIDENCE_INVALID')
  if (receipt.partialCount !== 0 || receipt.unverifiedCount !== 0 || receipt.mappedCount !== receipt.entryCount) {
    throw new Error('STRICT_MAPPING_REQUIRED')
  }
  if (coverage?.manifestSha256 !== receipt.manifestSha256 || coverage?.entryCount !== receipt.entryCount ||
      coverage?.boundAssertionsRequired !== receipt.boundAssertions.required) {
    throw new Error('TRANSACTION_CATALOG_MISMATCH')
  }
  return Object.freeze({ entries: receipt.entryCount, mapped: receipt.mappedCount,
    partial: 0, unverified: 0, manifestSha256: receipt.manifestSha256 })
}

export function verifyBackendSystemMonitorEdgeProof(proof, release) {
  const expected = release?.systemHealthObserver
  const id = proof?.edgeFunctionId ?? ''
  if (proof?.status !== 'verified' || proof.releaseId !== release?.releaseId || proof.gitSha !== release?.gitSha ||
      proof.profileId !== 'cloudflare-admin-v1' || proof.edgeFunction !== 'system-monitor' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id) ||
      !Number.isSafeInteger(proof.edgeVersion) || proof.edgeVersion < 1 ||
      proof.sourceSha256 !== expected?.edgeFunction?.sha256 ||
      proof.runtimeConfigurationSha256 !== expected?.edgeFunction?.runtimeConfiguration?.sha256 ||
      JSON.stringify(proof.sourceInputs) !== JSON.stringify(expected?.edgeFunction?.inputs)) {
    throw new Error('BACKEND_SYSTEM_MONITOR_SOURCE_MISMATCH')
  }
  return Object.freeze({
    releaseId: proof.releaseId,
    gitSha: proof.gitSha,
    profileId: proof.profileId,
    edgeFunctionId: id,
    edgeVersion: proof.edgeVersion,
    sourceSha256: proof.sourceSha256,
    runtimeConfigurationSha256: proof.runtimeConfigurationSha256,
    proofSha256: sha256(canonicalJson(proof)),
  })
}

export function buildBackendPromotionPacket(input) {
  const { release, transactionReceipt, sourceProofs, systemMonitorEdgeProof, readonlyProbe, previous } = input
  if (checkHarnessRelease(release).length || release.releaseLane !== 'backend-system-health' ||
      release.environment !== 'production') throw new Error('BACKEND_RELEASE_INVALID')
  const strictMapping = requireBackendTransactionEvidence(transactionReceipt, release.transactionCoverage)
  if (!Number.isSafeInteger(previous?.revision) || previous.revision < 0 ||
      previous.releaseId !== release.backendHostedBaseline?.controlActiveReleaseId ||
      previous.revision !== release.backendHostedBaseline?.revision) throw new Error('BACKEND_BASELINE_MISMATCH')
  const sources = {}
  for (const name of ['mobile-api', 'kael-matching-maintainer']) {
    const proof = sourceProofs?.[name]
    verifyEdgeSourceProof(proof)
    if (proof.functionName !== name || proof.environment !== 'production' || proof.projectRef !== TARGET ||
        proof.releaseId !== release.releaseId || proof.sourceSha256 !== release.edgeFunctions[name]) {
      throw new Error('BACKEND_SOURCE_MISMATCH')
    }
    sources[name] = { deploymentId: proof.deploymentId, proofSha256: proof.proofSha256 }
  }
  sources['system-monitor'] = verifyBackendSystemMonitorEdgeProof(systemMonitorEdgeProof, release)
  const now = input.now ?? Date.now()
  if (verifyBackendReleaseProbeReceipt(readonlyProbe, release, now).length) throw new Error('BACKEND_READONLY_PROBE_INVALID')
  const cloudflare = verifyCloudflareRuntimeEvidence({ ...input.cloudflare, release, nowMs: now })
  const observer = { releaseId: cloudflare.releaseId, gitSha: cloudflare.gitSha,
    workerBundleSha256: cloudflare.workerBundleSha256, d1MigrationsSha256: cloudflare.d1MigrationsSha256,
    completedAt: cloudflare.latestTick.completedAt,
    receiptSha256: createHash('sha256').update(canonicalJson(cloudflare)).digest('hex') }
  for (const evidence of [observer, readonlyProbe]) {
    const completed = Date.parse(evidence?.completedAt ?? '')
    if (evidence?.releaseId !== release.releaseId || evidence?.gitSha !== release.gitSha ||
        !HASH.test(evidence?.receiptSha256 ?? '') || !Number.isFinite(completed) ||
        completed > now || now - completed >= 180_000) throw new Error('BACKEND_RUNTIME_EVIDENCE_INVALID')
  }
  if (readonlyProbe.inferenceRequests !== 0 || observer.workerBundleSha256 !== release.systemHealthObserver.workerBundleSha256 ||
      observer.d1MigrationsSha256 !== release.systemHealthObserver.d1MigrationsSha256) {
    throw new Error('BACKEND_RUNTIME_EVIDENCE_MISMATCH')
  }
  const workflowRun = input.workflowRun
  const gates = { strictMapping, boundAssertions: { required: transactionReceipt.boundAssertions.required,
    passed: transactionReceipt.boundAssertions.passed, failed: 0 } }
  for (const name of GATE_NAMES) {
    const artifact = input.gates?.[name]
    const receipt = artifact?.receipt
    if (verifyBackendGateReceipt({ receipt, evidenceBytes: artifact?.evidenceBytes, release,
      gate: name, workflowRun, now }).length) throw new Error('BACKEND_REQUIRED_GATE_INVALID')
    gates[`${name}ReceiptSha256`] = receipt.receiptSha256
  }
  const packet = { schemaVersion: 'backend-system-health-promotion/v1', environment: 'production',
    projectRef: TARGET, releaseId: release.releaseId, gitSha: release.gitSha, bundleSha256: release.bundleSha256,
    previous: { releaseId: previous.releaseId, revision: previous.revision }, sourceProofs: sources, gates,
    observer: { releaseId: observer.releaseId, gitSha: observer.gitSha, workerBundleSha256: observer.workerBundleSha256,
      d1MigrationsSha256: observer.d1MigrationsSha256, receiptSha256: observer.receiptSha256, completedAt: observer.completedAt },
    readonlyProbe: { releaseId: readonlyProbe.releaseId, gitSha: readonlyProbe.gitSha,
      receiptSha256: readonlyProbe.receiptSha256, completedAt: readonlyProbe.completedAt, inferenceRequests: 0 },
    generatedAt: new Date(now).toISOString() }
  const complete = Object.freeze({ ...packet, packetSha256: createHash('sha256').update(canonicalJson(packet)).digest('hex') })
  if (verifyBackendPromotionPacket(complete, release).length) throw new Error('BACKEND_PROMOTION_PACKET_INVALID')
  return complete
}

export function verifyBackendPromotionPacket(packet, release) {
  const fields = ['schemaVersion', 'environment', 'projectRef', 'releaseId', 'gitSha', 'bundleSha256',
    'previous', 'sourceProofs', 'gates', 'observer', 'readonlyProbe', 'generatedAt', 'packetSha256']
  const problems = []
  if (!packet || typeof packet !== 'object' || Array.isArray(packet) ||
      Object.keys(packet).sort().join('|') !== [...fields].sort().join('|')) return ['BACKEND_PROMOTION_PACKET_FIELDS_INVALID']
  if (packet.schemaVersion !== 'backend-system-health-promotion/v1' || packet.environment !== 'production' ||
      packet.projectRef !== TARGET || packet.releaseId !== release?.releaseId || packet.gitSha !== release?.gitSha ||
      packet.bundleSha256 !== release?.bundleSha256 || release?.releaseLane !== 'backend-system-health' ||
      release?.environment !== 'production') problems.push('BACKEND_PROMOTION_PACKET_IDENTITY_INVALID')
  const expectedGateFields = ['strictMapping', 'boundAssertions', 'qualityReceiptSha256',
    'parityReceiptSha256', 'expandReceiptSha256', 'rollbackReceiptSha256']
  if (!hasExactKeys(packet.gates, expectedGateFields) ||
      !HASH.test(packet.gates?.qualityReceiptSha256 ?? '') || !HASH.test(packet.gates?.parityReceiptSha256 ?? '') ||
      !HASH.test(packet.gates?.expandReceiptSha256 ?? '') || !HASH.test(packet.gates?.rollbackReceiptSha256 ?? '') ||
      packet.gates.strictMapping?.partial !== 0 || packet.gates.strictMapping?.unverified !== 0 ||
      packet.gates.strictMapping?.entries !== packet.gates.strictMapping?.mapped ||
      packet.gates.boundAssertions?.failed !== 0 ||
      packet.gates.boundAssertions?.passed !== packet.gates.boundAssertions?.required) {
    problems.push('BACKEND_PROMOTION_PACKET_GATES_INVALID')
  }
  const previous = packet.previous
  if (!hasExactKeys(previous, ['releaseId', 'revision']) ||
      !(previous?.releaseId === null || RELEASE_ID.test(previous?.releaseId ?? '')) ||
      !Number.isSafeInteger(previous?.revision) || previous.revision < 0 ||
      previous.releaseId !== release?.backendHostedBaseline?.controlActiveReleaseId ||
      previous.revision !== release?.backendHostedBaseline?.revision) problems.push('BACKEND_PROMOTION_PACKET_BASELINE_INVALID')
  if (!hasExactKeys(packet.sourceProofs, ['mobile-api', 'kael-matching-maintainer', 'system-monitor'])) {
    problems.push('BACKEND_PROMOTION_PACKET_SOURCE_SET_INVALID')
  }
  for (const name of ['mobile-api', 'kael-matching-maintainer']) {
    const proof = packet.sourceProofs?.[name]
    if (!hasExactKeys(proof, ['deploymentId', 'proofSha256']) || !proof.deploymentId || !HASH.test(proof.proofSha256 ?? '')) {
      problems.push('BACKEND_PROMOTION_PACKET_SOURCE_INVALID')
    }
  }
  const monitorProof = packet.sourceProofs?.['system-monitor']
  if (!hasExactKeys(monitorProof, ['releaseId', 'gitSha', 'profileId', 'edgeFunctionId', 'edgeVersion',
    'sourceSha256', 'runtimeConfigurationSha256', 'proofSha256']) ||
      monitorProof.releaseId !== packet.releaseId || monitorProof.gitSha !== packet.gitSha ||
      monitorProof.profileId !== 'cloudflare-admin-v1' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(monitorProof.edgeFunctionId ?? '') ||
      !Number.isSafeInteger(monitorProof.edgeVersion) || monitorProof.edgeVersion < 1 ||
      monitorProof.sourceSha256 !== release?.systemHealthObserver?.edgeFunction?.sha256 ||
      monitorProof.runtimeConfigurationSha256 !== release?.systemHealthObserver?.edgeFunction?.runtimeConfiguration?.sha256 ||
      !HASH.test(monitorProof.proofSha256 ?? '')) problems.push('BACKEND_PROMOTION_PACKET_SYSTEM_MONITOR_SOURCE_INVALID')
  const hashes = [packet.observer?.workerBundleSha256, packet.observer?.d1MigrationsSha256,
    packet.observer?.receiptSha256, packet.readonlyProbe?.receiptSha256]
  if (hashes.some((value) => !HASH.test(value ?? '')) || packet.readonlyProbe?.inferenceRequests !== 0 ||
      packet.observer?.releaseId !== packet.releaseId || packet.observer?.gitSha !== packet.gitSha ||
      packet.readonlyProbe?.releaseId !== packet.releaseId || packet.readonlyProbe?.gitSha !== packet.gitSha ||
      !Number.isFinite(Date.parse(packet.generatedAt ?? ''))) problems.push('BACKEND_PROMOTION_PACKET_EVIDENCE_INVALID')
  if (!HASH.test(packet.packetSha256 ?? '') ||
      packet.packetSha256 !== createHash('sha256').update(canonicalJson({ ...packet, packetSha256: undefined })).digest('hex')) {
    problems.push('BACKEND_PROMOTION_PACKET_CHECKSUM_INVALID')
  }
  return [...new Set(problems)]
}

function canonicalJson(value) {
  return JSON.stringify(sort(value))
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function hasExactKeys(value, keys) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join('|') === [...keys].sort().join('|'))
}

function sort(value) {
  if (Array.isArray(value)) return value.map(sort)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sort(value[key])]))
}

function parseArgs(args) {
  const result = {}
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index]
    const value = args[index + 1]
    if (!key?.startsWith('--') || !value || value.startsWith('--')) throw new Error('BACKEND_PROMOTION_ARGUMENTS_INVALID')
    result[key.slice(2)] = value
    index += 1
  }
  return result
}

function readJson(path) {
  return JSON.parse(readFileSync(resolveReleaseArtifactPath(ROOT, path), 'utf8'))
}

function buildFromFiles(args) {
  const required = ['release', 'transaction-receipt', 'mobile-source-proof', 'maintainer-source-proof', 'system-monitor-edge-proof',
    'readonly-probe', 'previous-control', 'cloudflare-deployments', 'cloudflare-d1-evidence',
    'quality-receipt', 'quality-evidence', 'parity-receipt', 'parity-evidence',
    'expand-receipt', 'expand-evidence', 'rollback-receipt', 'rollback-evidence', 'output']
  if (required.some((key) => !args[key]) || !/^\d{1,20}$/u.test(args['workflow-run-id'] ?? '') ||
      !/^[1-9]\d{0,5}$/u.test(args['workflow-run-attempt'] ?? '')) {
    throw new Error('BACKEND_PROMOTION_ARGUMENTS_INVALID')
  }
  const release = readJson(args.release)
  const previousRecord = readJson(args['previous-control'])
  const previousState = previousRecord.result ?? previousRecord
  const gates = Object.fromEntries(GATE_NAMES.map((gate) => [gate, {
    receipt: readJson(args[`${gate}-receipt`]),
    evidenceBytes: readFileSync(resolveReleaseArtifactPath(ROOT, args[`${gate}-evidence`])),
  }]))
  return buildBackendPromotionPacket({
    release,
    transactionReceipt: readJson(args['transaction-receipt']),
    sourceProofs: {
      'mobile-api': readJson(args['mobile-source-proof']),
      'kael-matching-maintainer': readJson(args['maintainer-source-proof']),
    },
    systemMonitorEdgeProof: readJson(args['system-monitor-edge-proof']),
    readonlyProbe: readJson(args['readonly-probe']),
    previous: { releaseId: previousState.active_release_id ?? null, revision: previousState.revision },
    cloudflare: {
      deployments: readJson(args['cloudflare-deployments']),
      d1Evidence: readJson(args['cloudflare-d1-evidence']),
    },
    gates,
    workflowRun: { workflowPath: GATE_WORKFLOW, runId: args['workflow-run-id'],
      runAttempt: Number(args['workflow-run-attempt']) },
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2))
    const packet = buildFromFiles(args)
    const output = resolveReleaseArtifactPath(ROOT, args.output)
    mkdirSync(dirname(output), { recursive: true })
    writeFileSync(output, `${JSON.stringify(packet, null, 2)}\n`, { flag: 'wx' })
    process.stdout.write(`Backend system-health promotion packet written: ${relative(ROOT, output).replaceAll('\\', '/')}\n`)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'BACKEND_PROMOTION_PACKET_FAILED'}\n`)
    process.exitCode = 1
  }
}
