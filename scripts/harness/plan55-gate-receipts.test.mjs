import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import {
  assertPlan55FinalizationArtifactFiles,
  downloadPlan55GitHubRunArtifact,
  loadPlan55GateEvidenceSet,
  verifyPlan55GitHubArtifactProvenance,
} from './plan55-gate-receipts.mjs'
import { loadPlan55ProductionOnlyPolicy } from './promotion.mjs'

const policy = loadPlan55ProductionOnlyPolicy(resolve('.'))
const release = {
  environment: 'production',
  releaseId: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb',
  gitSha: 'a'.repeat(40),
  releaseLane: 'plan55-production-only',
}
const targetState = 'receipts_validated'
const requiredGates = policy.requiredGatesByTarget.receipts_validated

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function streamResponse(bytes) {
  let sent = false
  return {
    body: {
      getReader: () => ({
        read: async () => {
          if (sent) return { done: true }
          sent = true
          return { done: false, value: bytes }
        },
        cancel: async () => {},
      }),
    },
  }
}

function zipStored(files) {
  const localParts = []
  const centralParts = []
  let offset = 0
  for (const [path, content] of files) {
    const name = Buffer.from(path)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt32LE(content.length, 18)
    local.writeUInt32LE(content.length, 22)
    local.writeUInt16LE(name.length, 26)
    localParts.push(local, name, content)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt32LE(content.length, 20)
    central.writeUInt32LE(content.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt32LE(offset, 42)
    centralParts.push(central, name)
    offset += local.length + name.length + content.length
  }
  const centralDirectory = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(centralDirectory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...localParts, centralDirectory, end])
}

function makeEvidenceSet(t, overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'plan55-gate-evidence-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const receipts = []
  const artifactArchives = new Map()
  for (const [index, gate] of requiredGates.entries()) {
    const evidencePath = `evidence/${gate}.json`
    const receiptPath = `receipts/${gate}.json`
    mkdirSync(join(root, 'evidence'), { recursive: true })
    mkdirSync(join(root, 'receipts'), { recursive: true })
    const evidenceBytes = Buffer.from(JSON.stringify({
      schemaVersion: 'plan55-gate-result.v1',
      gate,
      status: 'PASS',
      environment: 'production',
      projectRef: policy.projectRef,
      policyId: policy.policyId,
      policySha256: policy.policySha256,
      releaseId: release.releaseId,
      sourceSha: release.gitSha,
      targetState,
    }) + '\n')
    writeFileSync(join(root, evidencePath), evidenceBytes)
    const artifactId = 100 + index
    const artifactBytes = zipStored([[evidencePath, evidenceBytes]])
    artifactArchives.set(artifactId, artifactBytes)
    const receipt = {
      schemaVersion: 'plan55-gate-evidence.v1',
      gate,
      status: 'PASS',
      environment: 'production',
      projectRef: policy.projectRef,
      policyId: policy.policyId,
      policySha256: policy.policySha256,
      releaseId: release.releaseId,
      sourceSha: release.gitSha,
      targetState,
      evidence: { path: evidencePath, sha256: digest(evidenceBytes), reference: `artifact://${100 + index}/${gate}` },
      provenance: {
        repository: 'manhtu0407/HomeServices-',
        workflowPath: '.github/workflows/plan55-production-only.yml',
        runId: String(9000 + index),
        runAttempt: 1,
        workflowHeadSha: release.gitSha,
        artifactId,
        artifactName: `plan55-gate-${gate}`,
        artifactDigest: `sha256:${digest(artifactBytes)}`,
      },
      ...overrides.receipt,
    }
    const receiptBytes = Buffer.from(JSON.stringify(receipt) + '\n')
    writeFileSync(join(root, receiptPath), receiptBytes)
    receipts.push({ gate, receiptPath, receiptSha256: digest(receiptBytes) })
  }
  const manifest = {
    schemaVersion: 'plan55-gate-evidence-set.v1',
    policyId: policy.policyId,
    policySha256: policy.policySha256,
    environment: 'production',
    projectRef: policy.projectRef,
    releaseId: release.releaseId,
    sourceSha: release.gitSha,
    targetState,
    receipts: overrides.receipts ?? receipts,
  }
  const manifestPath = join(root, 'gate-evidence-set.json')
  writeFileSync(manifestPath, JSON.stringify(manifest) + '\n')
  return { root, manifestPath, manifest, artifactArchives }
}

test('loads exact source-bound gate receipts and verifies the referenced evidence bytes', (t) => {
  const { root, manifestPath } = makeEvidenceSet(t)
  const receiptSet = loadPlan55GateEvidenceSet(manifestPath, {
    policy, release, targetState, requiredGates,
  })
  assert.deepEqual(Object.keys(receiptSet).sort(), [...requiredGates].sort())
  for (const gate of requiredGates) {
    assert.match(receiptSet[gate].receiptSha256, /^[a-f0-9]{64}$/u)
    assert.match(receiptSet[gate].evidenceSha256, /^[a-f0-9]{64}$/u)
    assert.equal(receiptSet[gate].receipt.gate, gate)
    assert.equal(readFileSync(join(root, receiptSet[gate].receipt.evidence.path)).length > 0, true)
  }
})

test('rejects an incomplete, duplicate, or extra gate inventory', (t) => {
  const missing = makeEvidenceSet(t, { receipts: [] })
  assert.throws(() => loadPlan55GateEvidenceSet(missing.manifestPath, {
    policy, release, targetState, requiredGates,
  }), /gate inventory/u)

  const duplicate = makeEvidenceSet(t)
  duplicate.manifest.receipts[1] = { ...duplicate.manifest.receipts[0] }
  writeFileSync(duplicate.manifestPath, JSON.stringify(duplicate.manifest))
  assert.throws(() => loadPlan55GateEvidenceSet(duplicate.manifestPath, {
    policy, release, targetState, requiredGates,
  }), /gate inventory/u)
})

test('fails closed for stale source, release, policy, target, or non-pass evidence', (t) => {
  const staleSource = makeEvidenceSet(t, { receipt: { sourceSha: 'b'.repeat(40) } })
  assert.throws(() => loadPlan55GateEvidenceSet(staleSource.manifestPath, {
    policy, release, targetState, requiredGates,
  }), /source identity/u)

  const wrongTarget = makeEvidenceSet(t)
  wrongTarget.manifest.targetState = 'production'
  writeFileSync(wrongTarget.manifestPath, JSON.stringify(wrongTarget.manifest))
  assert.throws(() => loadPlan55GateEvidenceSet(wrongTarget.manifestPath, {
    policy, release, targetState, requiredGates,
  }), /target\/source identity/u)

  const wrongRelease = makeEvidenceSet(t)
  wrongRelease.manifest.releaseId = 'harness-cccccccccccc-dddddddddddd'
  writeFileSync(wrongRelease.manifestPath, JSON.stringify(wrongRelease.manifest))
  assert.throws(() => loadPlan55GateEvidenceSet(wrongRelease.manifestPath, {
    policy, release, targetState, requiredGates,
  }), /target\/source identity/u)

  const stalePolicy = makeEvidenceSet(t, { receipt: { policySha256: '0'.repeat(64) } })
  assert.throws(() => loadPlan55GateEvidenceSet(stalePolicy.manifestPath, {
    policy, release, targetState, requiredGates,
  }), /receipt identity mismatch/u)

  const failed = makeEvidenceSet(t, { receipt: { status: 'blocked' } })
  assert.throws(() => loadPlan55GateEvidenceSet(failed.manifestPath, {
    policy, release, targetState, requiredGates,
  }), /not PASS/u)
})

test('rejects artifact provenance from a workflow outside the explicit trusted allowlist', (t) => {
  const untrustedWorkflow = makeEvidenceSet(t)
  const entry = untrustedWorkflow.manifest.receipts[0]
  const receiptPath = join(untrustedWorkflow.root, entry.receiptPath)
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
  receipt.provenance.workflowPath = '.github/workflows/untrusted.yml'
  const receiptBytes = Buffer.from(`${JSON.stringify(receipt)}\n`)
  writeFileSync(receiptPath, receiptBytes)
  entry.receiptSha256 = digest(receiptBytes)
  writeFileSync(untrustedWorkflow.manifestPath, `${JSON.stringify(untrustedWorkflow.manifest)}\n`)

  assert.throws(() => loadPlan55GateEvidenceSet(untrustedWorkflow.manifestPath, {
    policy, release, targetState, requiredGates,
  }), /artifact provenance is invalid/u)
})

test('rejects trusted workflow artifacts produced from a different source SHA', (t) => {
  const staleWorkflowSource = makeEvidenceSet(t)
  const entry = staleWorkflowSource.manifest.receipts[0]
  const receiptPath = join(staleWorkflowSource.root, entry.receiptPath)
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
  receipt.provenance.workflowHeadSha = 'c'.repeat(40)
  const receiptBytes = Buffer.from(`${JSON.stringify(receipt)}\n`)
  writeFileSync(receiptPath, receiptBytes)
  entry.receiptSha256 = digest(receiptBytes)
  writeFileSync(staleWorkflowSource.manifestPath, `${JSON.stringify(staleWorkflowSource.manifest)}\n`)
  assert.throws(() => loadPlan55GateEvidenceSet(staleWorkflowSource.manifestPath, {
    policy, release, targetState, requiredGates,
  }), /workflow source SHA mismatch/u)
})

test('rejects tampered receipt/evidence bytes and paths outside the evidence set', (t) => {
  const tampered = makeEvidenceSet(t)
  writeFileSync(join(tampered.root, 'evidence', `${requiredGates[0]}.json`), 'tampered\n')
  assert.throws(() => loadPlan55GateEvidenceSet(tampered.manifestPath, {
    policy, release, targetState, requiredGates,
  }), /evidence checksum mismatch/u)

  const changedReceipt = makeEvidenceSet(t)
  writeFileSync(join(changedReceipt.root, changedReceipt.manifest.receipts[0].receiptPath), 'tampered\n')
  assert.throws(() => loadPlan55GateEvidenceSet(changedReceipt.manifestPath, {
    policy, release, targetState, requiredGates,
  }), /receipt checksum mismatch/u)

  const escaped = makeEvidenceSet(t, { receipt: { evidence: { path: '../outside.json', sha256: 'a'.repeat(64), reference: 'artifact://1/outside' } } })
  assert.throws(() => loadPlan55GateEvidenceSet(escaped.manifestPath, {
    policy, release, targetState, requiredGates,
  }), /outside the evidence set/u)
})

test('verifies each immutable receipt artifact against the completed main-branch GitHub run', async (t) => {
  const { manifestPath, artifactArchives } = makeEvidenceSet(t)
  const receiptSet = loadPlan55GateEvidenceSet(manifestPath, {
    policy, release, targetState, requiredGates,
  })
  const requests = []
  let overLimit = false
  let omitStream = false
  let archiveBuffered = false
  const fetchImpl = async (url, options) => {
    requests.push({ url, options })
    const artifactMatch = /\/actions\/artifacts\/(\d+)$/u.exec(url)
    const archiveMatch = /\/actions\/artifacts\/(\d+)\/zip$/u.exec(url)
    if (archiveMatch) {
      const archive = artifactArchives.get(Number(archiveMatch[1]))
      return {
        ok: true,
        headers: { get: () => String(overLimit ? 64 * 1024 * 1024 + 1 : archive.length) },
        ...(omitStream ? {
          arrayBuffer: async () => {
            archiveBuffered = true
            return archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength)
          },
        } : streamResponse(archive)),
      }
    }
    if (artifactMatch) {
      const id = Number(artifactMatch[1])
      const receipt = Object.values(receiptSet).find((item) => item.receipt.provenance.artifactId === id).receipt
      return {
        ok: true,
        json: async () => ({
          id,
          name: receipt.provenance.artifactName,
          expired: false,
          digest: receipt.provenance.artifactDigest,
          archive_download_url: `https://api.github.com/repos/${policy.repository}/actions/artifacts/${id}/zip`,
          workflow_run: { id: Number(receipt.provenance.runId), head_sha: receipt.provenance.workflowHeadSha },
        }),
      }
    }
    const runMatch = /\/actions\/runs\/(\d+)$/u.exec(url)
    assert.ok(runMatch)
    const receipt = Object.values(receiptSet).find((item) => item.receipt.provenance.runId === runMatch[1]).receipt
    return {
      ok: true,
      json: async () => ({
        id: Number(receipt.provenance.runId),
        run_attempt: receipt.provenance.runAttempt,
        status: 'completed',
        conclusion: 'success',
        head_sha: receipt.provenance.workflowHeadSha,
        head_branch: 'main',
        path: receipt.provenance.workflowPath,
        repository: { full_name: receipt.provenance.repository },
      }),
    }
  }
  assert.equal(await verifyPlan55GitHubArtifactProvenance(receiptSet, {
    repository: policy.repository,
    trustedEvidenceWorkflowPaths: policy.trustedEvidenceWorkflowPaths,
    sourceSha: release.gitSha,
    token: 'test-token', fetchImpl,
  }), true)
  assert.equal(requests.length, requiredGates.length * 3)
  assert.ok(requests.every(({ options }) => options.headers.authorization === 'Bearer test-token'))
  assert.ok(requests.every(({ options }) => options.signal instanceof AbortSignal && !options.signal.aborted))
  overLimit = true
  archiveBuffered = false
  await assert.rejects(verifyPlan55GitHubArtifactProvenance(receiptSet, {
    repository: policy.repository,
    trustedEvidenceWorkflowPaths: policy.trustedEvidenceWorkflowPaths,
    sourceSha: release.gitSha,
    token: 'test-token', fetchImpl,
  }), /artifact archive is too large/u)
  assert.equal(archiveBuffered, false)
  overLimit = false
  omitStream = true
  archiveBuffered = false
  await assert.rejects(verifyPlan55GitHubArtifactProvenance(receiptSet, {
    repository: policy.repository,
    trustedEvidenceWorkflowPaths: policy.trustedEvidenceWorkflowPaths,
    sourceSha: release.gitSha,
    token: 'test-token', fetchImpl,
  }), /requires a bounded stream/u)
  assert.equal(archiveBuffered, false)
})

test('rejects a workflow-source mismatch before calling the GitHub API', async (t) => {
  const { manifestPath } = makeEvidenceSet(t)
  const receiptSet = loadPlan55GateEvidenceSet(manifestPath, {
    policy, release, targetState, requiredGates,
  })
  let requestCount = 0
  await assert.rejects(verifyPlan55GitHubArtifactProvenance(receiptSet, {
    repository: policy.repository,
    trustedEvidenceWorkflowPaths: policy.trustedEvidenceWorkflowPaths,
    sourceSha: 'b'.repeat(40),
    token: 'test-token',
    fetchImpl: async () => {
      requestCount += 1
      throw new Error('unexpected GitHub request')
    },
  }), /workflow source SHA mismatch/u)
  assert.equal(requestCount, 0)
})

test('rejects failed, stale, expired, or mismatched GitHub artifact provenance', async (t) => {
  const { manifestPath, artifactArchives } = makeEvidenceSet(t)
  const receiptSet = loadPlan55GateEvidenceSet(manifestPath, {
    policy, release, targetState, requiredGates,
  })
  let runConclusion = 'failure'
  const fetchImpl = async (url) => {
    const archiveMatch = /\/actions\/artifacts\/(\d+)\/zip$/u.exec(url)
    if (archiveMatch) {
      const archive = artifactArchives.get(Number(archiveMatch[1]))
      return {
        ok: true,
        arrayBuffer: async () => archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength),
      }
    }
    if (url.includes('/actions/artifacts/')) {
      const id = Number(url.match(/artifacts\/(\d+)$/u)[1])
      const receipt = Object.values(receiptSet).find((item) => item.receipt.provenance.artifactId === id).receipt
      return {
        ok: true,
        json: async () => ({
          id,
          name: receipt.provenance.artifactName,
          expired: false,
          digest: receipt.provenance.artifactDigest,
          archive_download_url: `https://api.github.com/repos/${policy.repository}/actions/artifacts/${id}/zip`,
          workflow_run: { id: Number(receipt.provenance.runId), head_sha: receipt.provenance.workflowHeadSha },
        }),
      }
    }
    const runId = url.match(/\/actions\/runs\/(\d+)$/u)?.[1]
    const receipt = Object.values(receiptSet).find((item) => item.receipt.provenance.runId === runId).receipt
    return {
      ok: true,
      json: async () => ({
        id: Number(runId),
        run_attempt: receipt.provenance.runAttempt,
        status: 'completed',
        conclusion: runConclusion,
        head_sha: receipt.provenance.workflowHeadSha,
        head_branch: 'main',
        path: `${receipt.provenance.workflowPath}@main`,
        repository: { full_name: receipt.provenance.repository },
      }),
    }
  }
  await assert.rejects(verifyPlan55GitHubArtifactProvenance(receiptSet, {
    repository: policy.repository,
    trustedEvidenceWorkflowPaths: policy.trustedEvidenceWorkflowPaths,
    sourceSha: release.gitSha,
    token: 'test-token', fetchImpl,
  }), /workflow-run provenance verification failed/u)
  runConclusion = 'success'
  await assert.rejects(verifyPlan55GitHubArtifactProvenance(receiptSet, {
    repository: policy.repository,
    trustedEvidenceWorkflowPaths: policy.trustedEvidenceWorkflowPaths,
    sourceSha: release.gitSha,
    token: 'test-token', fetchImpl,
  }), /workflow-run provenance verification failed/u)
  await assert.rejects(verifyPlan55GitHubArtifactProvenance(receiptSet, {
    repository: policy.repository,
    trustedEvidenceWorkflowPaths: policy.trustedEvidenceWorkflowPaths,
    sourceSha: release.gitSha,
    token: '', fetchImpl,
  }), /requires repository, token, and fetch/u)
})

test('downloads a finalization artifact only from its exact successful main-branch source run', async () => {
  const artifactId = 9701
  const runId = 9702
  const runAttempt = 2
  const workflowPath = '.github/workflows/plan55-production-only.yml'
  const artifactName = `plan55-finalization-inputs-${runId}-${runAttempt}`
  const archive = zipStored([
    ['release-manifest.json', Buffer.from('{"gitSha":"' + release.gitSha + '"}\n')],
  ])
  const artifact = {
    id: artifactId,
    name: artifactName,
    expired: false,
    digest: `sha256:${digest(archive)}`,
    archive_download_url: `https://api.github.com/repos/${policy.repository}/actions/artifacts/${artifactId}/zip`,
    workflow_run: { id: runId, head_sha: release.gitSha },
  }
  const run = {
    id: runId,
    run_attempt: runAttempt,
    status: 'completed',
    conclusion: 'success',
    head_sha: release.gitSha,
    head_branch: 'main',
    path: workflowPath,
    repository: { full_name: policy.repository },
  }
  const requests = []
  const result = await downloadPlan55GitHubRunArtifact({
    repository: policy.repository,
    trustedWorkflowPaths: policy.trustedEvidenceWorkflowPaths,
    sourceSha: release.gitSha,
    artifactId,
    artifactName,
    runId,
    runAttempt,
    workflowPath,
    token: 'test-token',
    fetchImpl: async (url, options) => {
      requests.push({ url, options })
      if (url.endsWith(`/actions/artifacts/${artifactId}/zip`)) {
        return { ok: true, ...streamResponse(archive) }
      }
      return {
        ok: true,
        json: async () => url.endsWith(`/actions/artifacts/${artifactId}`) ? artifact : run,
      }
    },
  })

  assert.equal(result.artifactId, artifactId)
  assert.equal(result.runId, runId)
  assert.equal(result.files.get('release-manifest.json').toString(), `{"gitSha":"${release.gitSha}"}\n`)
  assert.equal(requests.length, 3)
  assert.ok(requests.every(({ options }) => options.headers.authorization === 'Bearer test-token'))
})

test('rejects finalization artifacts with wrong source, run, path, status, expiry, or checksum', async () => {
  const artifactId = 9711
  const runId = 9712
  const runAttempt = 1
  const workflowPath = '.github/workflows/plan55-production-only.yml'
  const artifactName = `plan55-finalization-inputs-${runId}-${runAttempt}`
  const archive = zipStored([['release-manifest.json', Buffer.from('{}\n')]])
  const artifact = {
    id: artifactId,
    name: artifactName,
    expired: false,
    digest: `sha256:${digest(archive)}`,
    archive_download_url: `https://api.github.com/repos/${policy.repository}/actions/artifacts/${artifactId}/zip`,
    workflow_run: { id: runId, head_sha: release.gitSha },
  }
  const run = {
    id: runId,
    run_attempt: runAttempt,
    status: 'completed',
    conclusion: 'success',
    head_sha: release.gitSha,
    head_branch: 'main',
    path: workflowPath,
    repository: { full_name: policy.repository },
  }
  let artifactOverride = {}
  let runOverride = {}
  let archiveRequested = false
  const fetchImpl = async (url) => {
    if (url.endsWith('/zip')) {
      archiveRequested = true
      return { ok: true, ...streamResponse(archive) }
    }
    return {
      ok: true,
      json: async () => url.includes('/actions/artifacts/')
        ? { ...artifact, ...artifactOverride }
        : { ...run, ...runOverride },
    }
  }
  const verify = () => downloadPlan55GitHubRunArtifact({
    repository: policy.repository,
    trustedWorkflowPaths: policy.trustedEvidenceWorkflowPaths,
    sourceSha: release.gitSha,
    artifactId,
    artifactName,
    runId,
    runAttempt,
    workflowPath,
    token: 'test-token',
    fetchImpl,
  })

  artifactOverride = { expired: true }
  await assert.rejects(verify(), /artifact identity verification failed/u)
  assert.equal(archiveRequested, false)
  artifactOverride = { workflow_run: { id: runId, head_sha: 'b'.repeat(40) } }
  await assert.rejects(verify(), /artifact identity verification failed/u)
  assert.equal(archiveRequested, false)
  artifactOverride = {}
  runOverride = { conclusion: 'failure' }
  await assert.rejects(verify(), /workflow-run provenance verification failed/u)
  assert.equal(archiveRequested, false)
  runOverride = { path: '.github/workflows/untrusted.yml' }
  await assert.rejects(verify(), /workflow-run provenance verification failed/u)
  assert.equal(archiveRequested, false)
  runOverride = {}
  artifactOverride = { digest: `sha256:${'0'.repeat(64)}` }
  await assert.rejects(verify(), /artifact archive checksum mismatch/u)
  assert.equal(archiveRequested, true)
})

test('accepts only a closed finalization file inventory with referenced receipt and evidence files', () => {
  const files = new Map([
    ['receipts/', Buffer.alloc(0)],
    ['evidence/', Buffer.alloc(0)],
    ['release-manifest.json', Buffer.from('{}\n')],
    ['evaluation-report.json', Buffer.from('{}\n')],
    ['gate-evidence-set.json', Buffer.from(JSON.stringify({
      receipts: [{ gate: 'plan55-example-gate', receiptPath: 'receipts/plan55-example-gate.json' }],
    }))],
    ['receipts/plan55-example-gate.json', Buffer.from(JSON.stringify({
      evidence: { path: 'evidence/plan55-example-gate.json' },
    }))],
    ['evidence/plan55-example-gate.json', Buffer.from('{}\n')],
  ])
  assert.equal(assertPlan55FinalizationArtifactFiles(files), true)

  const traversal = new Map(files)
  traversal.set('evidence/../release.json', Buffer.from('{}\n'))
  assert.throws(() => assertPlan55FinalizationArtifactFiles(traversal), /artifact path is invalid/u)

  const unreferenced = new Map(files)
  unreferenced.set('evidence/other-gate.json', Buffer.from('{}\n'))
  assert.throws(() => assertPlan55FinalizationArtifactFiles(unreferenced), /missing or unreferenced/u)
})
