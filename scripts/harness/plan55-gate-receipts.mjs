import { createHash } from 'node:crypto'
import { readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { inflateRawSync } from 'node:zlib'

const GATE_SET_SCHEMA = 'plan55-gate-evidence-set.v1'
const GATE_RECEIPT_SCHEMA = 'plan55-gate-evidence.v1'
const SHA256 = /^[a-f0-9]{64}$/u
const GIT_SHA = /^[a-f0-9]{40}$/u
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u
const WORKFLOW_PATH = /^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$/u
const MAX_ARTIFACT_ARCHIVE_BYTES = 64 * 1024 * 1024
const MAX_ARTIFACT_UNCOMPRESSED_BYTES = 64 * 1024 * 1024
const MAX_EVIDENCE_FILE_BYTES = 16 * 1024 * 1024
const GITHUB_REQUEST_TIMEOUT_MS = 30_000

export function loadPlan55GateEvidenceSet(manifestPath, { policy, release, targetState, requiredGates }) {
  const resolvedManifest = realpathSync(resolve(manifestPath))
  const manifestRoot = realpathSync(dirname(resolvedManifest))
  const manifest = parseJson(readFileSync(resolvedManifest), 'gate evidence set')
  const expectedGates = [...new Set(requiredGates ?? [])].sort()
  if (expectedGates.length !== (requiredGates ?? []).length ||
      manifest.schemaVersion !== GATE_SET_SCHEMA ||
      !Array.isArray(manifest.receipts) || manifest.receipts.length !== expectedGates.length) {
    throw new Error('Plan 55 gate inventory is invalid')
  }
  assertIdentity(manifest, { policy, release, targetState })

  const receiptEntries = new Map()
  for (const entry of manifest.receipts) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) ||
        typeof entry.gate !== 'string' || receiptEntries.has(entry.gate) ||
        !expectedGates.includes(entry.gate)) {
      throw new Error('Plan 55 gate inventory is invalid')
    }
    receiptEntries.set(entry.gate, entry)
  }
  if (JSON.stringify([...receiptEntries.keys()].sort()) !== JSON.stringify(expectedGates)) {
    throw new Error('Plan 55 gate inventory is invalid')
  }

  return Object.fromEntries(expectedGates.map((gate) => {
    const entry = receiptEntries.get(gate)
    const receiptPath = resolveEvidenceFile(manifestRoot, entry.receiptPath, `receipt for ${gate}`)
    const receiptBytes = readFileSync(receiptPath)
    if (!isSha256(entry.receiptSha256) || sha256(receiptBytes) !== entry.receiptSha256) {
      throw new Error(`Plan 55 receipt checksum mismatch: ${gate}`)
    }
    const receipt = parseJson(receiptBytes, `receipt for ${gate}`)
    if (!receiptBytes.equals(Buffer.from(`${JSON.stringify(receipt)}\n`))) {
      throw new Error(`Plan 55 receipt serialization is invalid: ${gate}`)
    }
    assertReceiptIdentity(receipt, gate, { policy, release, targetState })

    const evidencePath = resolveEvidenceFile(manifestRoot, receipt.evidence?.path, `evidence for ${gate}`)
    const evidenceBytes = readFileSync(evidencePath)
    if (!isSha256(receipt.evidence?.sha256) || sha256(evidenceBytes) !== receipt.evidence.sha256) {
      throw new Error(`Plan 55 evidence checksum mismatch: ${gate}`)
    }
    const evidence = parseJson(evidenceBytes, `evidence for ${gate}`)
    assertEvidenceIdentity(evidence, gate, { policy, release, targetState })
    if (!isTrustedGitHubArtifactProvenance(receipt.provenance, policy)) {
      throw new Error(`Plan 55 artifact provenance is invalid: ${gate}`)
    }

    return [gate, Object.freeze({
      receipt,
      receiptSha256: sha256(Buffer.from(JSON.stringify(receipt))),
      receiptFileSha256: entry.receiptSha256,
      evidenceSha256: receipt.evidence.sha256,
      evidenceBytes,
      evidencePath: receipt.evidence.path,
    })]
  }))
}

export async function verifyPlan55GitHubArtifactProvenance(receiptSet, {
  repository, trustedEvidenceWorkflowPaths, sourceSha, token, fetchImpl = fetch,
}) {
  if (!REPOSITORY.test(repository ?? '') || !Array.isArray(trustedEvidenceWorkflowPaths) ||
      !GIT_SHA.test(sourceSha ?? '') || typeof token !== 'string' || !token.trim() ||
      typeof fetchImpl !== 'function') {
    throw new Error('Plan 55 GitHub artifact verification requires repository, token, and fetch')
  }
  const uniqueArtifacts = new Map()
  for (const receiptRecord of Object.values(receiptSet ?? {})) {
    const provenance = receiptRecord?.receipt?.provenance
    if (!isTrustedGitHubArtifactProvenance(provenance, { repository, trustedEvidenceWorkflowPaths })) {
      throw new Error('Plan 55 GitHub artifact provenance is invalid')
    }
    if (provenance.workflowHeadSha !== sourceSha) {
      throw new Error('Plan 55 GitHub artifact workflow source SHA mismatch')
    }
    const previous = uniqueArtifacts.get(provenance.artifactId)
    if (previous && JSON.stringify(previous) !== JSON.stringify(provenance)) {
      throw new Error('Plan 55 artifact ID has conflicting provenance')
    }
    uniqueArtifacts.set(provenance.artifactId, provenance)
  }

  for (const [artifactId, provenance] of uniqueArtifacts) {
    const artifact = await githubJson(fetchImpl, token, repository,
      `/actions/artifacts/${artifactId}`)
    const workflowRunId = String(artifact.workflow_run?.id ?? '')
    const workflowHeadSha = artifact.workflow_run?.head_sha
    if (Number(artifact.id) !== artifactId || artifact.name !== provenance.artifactName ||
        artifact.expired !== false || workflowRunId !== provenance.runId ||
        workflowHeadSha !== provenance.workflowHeadSha ||
        !/^sha256:[a-f0-9]{64}$/u.test(artifact.digest ?? '') ||
        artifact.digest !== provenance.artifactDigest ||
        artifact.archive_download_url !== `https://api.github.com/repos/${repository}/actions/artifacts/${artifactId}/zip`) {
      throw new Error(`Plan 55 artifact identity verification failed: ${artifactId}`)
    }

    const run = await githubJson(fetchImpl, token, repository,
      `/actions/runs/${provenance.runId}`)
    if (Number(run.id) !== Number(provenance.runId) ||
        Number(run.run_attempt) !== provenance.runAttempt ||
        run.status !== 'completed' || run.conclusion !== 'success' ||
        run.head_sha !== provenance.workflowHeadSha || run.head_sha !== sourceSha ||
        run.path !== provenance.workflowPath || run.head_branch !== 'main' ||
        run.repository?.full_name !== repository) {
      throw new Error(`Plan 55 workflow-run provenance verification failed: ${artifactId}`)
    }

    const archiveResponse = await fetchImpl(artifact.archive_download_url, {
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
      },
      signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
    })
    if (!archiveResponse?.ok) throw new Error(`Plan 55 artifact download failed: ${artifactId}`)
    const archive = await readBoundedArtifactArchive(archiveResponse)
    if (`sha256:${sha256(archive)}` !== artifact.digest) {
      throw new Error(`Plan 55 artifact archive checksum mismatch: ${artifactId}`)
    }
    const archivedFiles = readZipFiles(archive)
    for (const receiptRecord of Object.values(receiptSet)) {
      if (receiptRecord.receipt.provenance.artifactId !== artifactId) continue
      const archivedEvidence = archivedFiles.get(receiptRecord.evidencePath)
      if (!archivedEvidence || !archivedEvidence.equals(receiptRecord.evidenceBytes)) {
        throw new Error(`Plan 55 evidence is not present in its attested artifact: ${artifactId}`)
      }
    }
  }
  return true
}

export async function downloadPlan55GitHubRunArtifact({
  repository,
  trustedWorkflowPaths,
  sourceSha,
  artifactId,
  artifactName,
  runId,
  runAttempt,
  workflowPath,
  token,
  fetchImpl = fetch,
}) {
  if (!REPOSITORY.test(repository ?? '') || !Array.isArray(trustedWorkflowPaths) ||
      !trustedWorkflowPaths.includes(workflowPath) || !WORKFLOW_PATH.test(workflowPath ?? '') ||
      !GIT_SHA.test(sourceSha ?? '') || !Number.isSafeInteger(artifactId) || artifactId < 1 ||
      !Number.isSafeInteger(runId) || runId < 1 || !Number.isSafeInteger(runAttempt) || runAttempt < 1 ||
      typeof artifactName !== 'string' || !/^[A-Za-z0-9_.-]{1,128}$/u.test(artifactName) ||
      typeof token !== 'string' || !token.trim() || typeof fetchImpl !== 'function') {
    throw new Error('Plan 55 finalization artifact verification requires trusted exact-source inputs')
  }

  const artifact = await githubJson(fetchImpl, token, repository,
    `/actions/artifacts/${artifactId}`)
  const archiveUrl = `https://api.github.com/repos/${repository}/actions/artifacts/${artifactId}/zip`
  if (Number(artifact.id) !== artifactId || artifact.name !== artifactName ||
      artifact.expired !== false || Number(artifact.workflow_run?.id) !== runId ||
      artifact.workflow_run?.head_sha !== sourceSha ||
      !/^sha256:[a-f0-9]{64}$/u.test(artifact.digest ?? '') ||
      artifact.archive_download_url !== archiveUrl) {
    throw new Error('Plan 55 finalization artifact identity verification failed')
  }

  const run = await githubJson(fetchImpl, token, repository, `/actions/runs/${runId}`)
  if (Number(run.id) !== runId || Number(run.run_attempt) !== runAttempt ||
      run.status !== 'completed' || run.conclusion !== 'success' || run.head_sha !== sourceSha ||
      run.path !== workflowPath || run.head_branch !== 'main' ||
      run.repository?.full_name !== repository) {
    throw new Error('Plan 55 finalization workflow-run provenance verification failed')
  }

  const archiveResponse = await fetchImpl(archiveUrl, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
    },
    signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
  })
  if (!archiveResponse?.ok) throw new Error('Plan 55 finalization artifact download failed')
  const archive = await readBoundedArtifactArchive(archiveResponse)
  if (`sha256:${sha256(archive)}` !== artifact.digest) {
    throw new Error('Plan 55 finalization artifact archive checksum mismatch')
  }
  return Object.freeze({
    artifactId,
    artifactName,
    runId,
    runAttempt,
    sourceSha,
    workflowPath,
    files: readZipFiles(archive),
  })
}

export function assertPlan55FinalizationArtifactFiles(files) {
  if (!(files instanceof Map) || files.size < 3 || files.size > 512) {
    throw new Error('Plan 55 finalization artifact file inventory is invalid')
  }
  const fileNames = new Set()
  for (const [name, bytes] of files) {
    const directoryName = typeof name === 'string' && name.endsWith('/') ? name.slice(0, -1) : null
    const normalizedName = directoryName ?? name
    if (typeof name !== 'string' || name.includes('\\') || name.startsWith('/') ||
        normalizedName.split('/').some((part) => !part || part === '.' || part === '..') ||
        !(bytes instanceof Buffer)) {
      throw new Error('Plan 55 finalization artifact path is invalid')
    }
    if (directoryName !== null) {
      if (!['receipts', 'evidence'].includes(directoryName)) {
        throw new Error('Plan 55 finalization artifact directory is invalid')
      }
      continue
    }
    if (!['release-manifest.json', 'evaluation-report.json', 'gate-evidence-set.json'].includes(name) &&
        !/^receipts\/[a-z0-9][a-z0-9-]{0,127}\.json$/u.test(name) &&
        !/^evidence\/[a-z0-9][a-z0-9-]{0,127}\.json$/u.test(name)) {
      throw new Error('Plan 55 finalization artifact contains an unexpected file')
    }
    fileNames.add(name)
  }

  const required = new Set([
    'release-manifest.json',
    'evaluation-report.json',
    'gate-evidence-set.json',
  ])
  if ([...required].some((name) => !fileNames.has(name))) {
    throw new Error('Plan 55 finalization artifact is missing required inputs')
  }

  const manifest = parseJson(files.get('gate-evidence-set.json'), 'finalization gate evidence set')
  if (!Array.isArray(manifest.receipts) || !manifest.receipts.length || manifest.receipts.length > 256) {
    throw new Error('Plan 55 finalization gate evidence inventory is invalid')
  }
  for (const entry of manifest.receipts) {
    if (!entry || typeof entry.gate !== 'string' || !/^[a-z0-9][a-z0-9-]{0,127}$/u.test(entry.gate) ||
        entry.receiptPath !== `receipts/${entry.gate}.json` ||
        !fileNames.has(entry.receiptPath)) {
      throw new Error('Plan 55 finalization receipt path is invalid')
    }
    const receipt = parseJson(files.get(entry.receiptPath), 'finalization receipt')
    const evidencePath = receipt.evidence?.path
    if (evidencePath !== `evidence/${entry.gate}.json` || !fileNames.has(evidencePath)) {
      throw new Error('Plan 55 finalization evidence path is invalid')
    }
    required.add(entry.receiptPath)
    required.add(evidencePath)
  }
  if (fileNames.size !== required.size || [...fileNames].some((name) => !required.has(name))) {
    throw new Error('Plan 55 finalization artifact has missing or unreferenced files')
  }
  return true
}

export function isPlan55GateReceiptRecord(value, gate, { policy, release, targetState }) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  try {
    const receipt = value.receipt
    if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) return false
    const serializedReceipt = JSON.stringify(receipt)
    if (typeof serializedReceipt !== 'string') return false
    return isSha256(value.receiptSha256) && isSha256(value.receiptFileSha256) &&
      isSha256(value.evidenceSha256) && value.receiptSha256 === sha256(Buffer.from(serializedReceipt)) &&
      value.receiptFileSha256 === sha256(Buffer.from(`${serializedReceipt}\n`)) &&
      value.evidenceSha256 === receipt.evidence?.sha256 &&
      isReceiptIdentity(receipt, gate, { policy, release, targetState }) &&
      isTrustedGitHubArtifactProvenance(receipt.provenance, policy)
  } catch {
    return false
  }
}

function assertIdentity(value, { policy, release, targetState }) {
  if (value.policyId !== policy.policyId || value.policySha256 !== policy.policySha256 ||
      value.environment !== release.environment || value.environment !== policy.environment ||
      value.projectRef !== policy.projectRef || value.releaseId !== release.releaseId ||
      value.sourceSha !== release.gitSha || value.targetState !== targetState) {
    throw new Error('Plan 55 gate evidence target/source identity mismatch')
  }
}

function assertReceiptIdentity(receipt, gate, context) {
  if (!isReceiptIdentity(receipt, gate, context)) {
    if (receipt?.provenance?.workflowHeadSha !== context.release?.gitSha) {
      throw new Error(`Plan 55 gate workflow source SHA mismatch: ${gate}`)
    }
    if (receipt?.sourceSha !== context.release?.gitSha) {
      throw new Error(`Plan 55 gate source identity mismatch: ${gate}`)
    }
    if (receipt?.status !== 'PASS') throw new Error(`Plan 55 gate receipt is not PASS: ${gate}`)
    throw new Error(`Plan 55 gate receipt identity mismatch: ${gate}`)
  }
}

function isReceiptIdentity(receipt, gate, { policy, release, targetState }) {
  return Boolean(receipt && typeof receipt === 'object' && !Array.isArray(receipt) &&
    receipt.schemaVersion === GATE_RECEIPT_SCHEMA && receipt.gate === gate && receipt.status === 'PASS' &&
    receipt.policyId === policy.policyId && receipt.policySha256 === policy.policySha256 &&
    receipt.environment === release.environment && receipt.environment === policy.environment &&
    receipt.projectRef === policy.projectRef && receipt.releaseId === release.releaseId &&
    receipt.sourceSha === release.gitSha && receipt.targetState === targetState &&
    receipt.evidence && typeof receipt.evidence === 'object' && !Array.isArray(receipt.evidence) &&
    typeof receipt.evidence.path === 'string' && receipt.evidence.path.length > 0 &&
    isSha256(receipt.evidence.sha256) && receipt.provenance?.workflowHeadSha === release.gitSha &&
    isGitHubArtifactProvenance(receipt.provenance, policy.repository))
}

function assertEvidenceIdentity(evidence, gate, { policy, release, targetState }) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence) ||
      evidence.schemaVersion !== 'plan55-gate-result.v1' || evidence.gate !== gate ||
      evidence.status !== 'PASS' || evidence.policyId !== policy.policyId ||
      evidence.policySha256 !== policy.policySha256 || evidence.environment !== release.environment ||
      evidence.projectRef !== policy.projectRef || evidence.releaseId !== release.releaseId ||
      evidence.sourceSha !== release.gitSha || evidence.targetState !== targetState) {
    throw new Error(`Plan 55 gate evidence identity mismatch: ${gate}`)
  }
}

function isGitHubArtifactProvenance(value, repository) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    value.repository === repository && REPOSITORY.test(value.repository ?? '') &&
    WORKFLOW_PATH.test(value.workflowPath ?? '') && Number.isSafeInteger(Number(value.runId)) && Number(value.runId) > 0 &&
    Number.isSafeInteger(value.runAttempt) && value.runAttempt > 0 &&
    Number.isSafeInteger(value.artifactId) && value.artifactId > 0 &&
    typeof value.artifactName === 'string' && /^[A-Za-z0-9_.-]{1,128}$/u.test(value.artifactName) &&
    isGitSha(value.workflowHeadSha) && /^sha256:[a-f0-9]{64}$/u.test(value.artifactDigest ?? ''))
}

function isTrustedGitHubArtifactProvenance(value, policy) {
  return isGitHubArtifactProvenance(value, policy?.repository) &&
    Array.isArray(policy?.trustedEvidenceWorkflowPaths) &&
    policy.trustedEvidenceWorkflowPaths.includes(value.workflowPath)
}

async function githubJson(fetchImpl, token, repository, path) {
  const response = await fetchImpl(`https://api.github.com/repos/${repository}${path}`, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
    },
    signal: AbortSignal.timeout(GITHUB_REQUEST_TIMEOUT_MS),
  })
  if (!response?.ok) throw new Error('Plan 55 GitHub artifact provenance lookup failed')
  return response.json()
}

function readZipFiles(archive) {
  const endSignature = 0x06054b50
  const centralSignature = 0x02014b50
  const localSignature = 0x04034b50
  const searchStart = Math.max(0, archive.length - 65_557)
  let endOffset = -1
  for (let offset = archive.length - 22; offset >= searchStart; offset -= 1) {
    if (archive.readUInt32LE(offset) === endSignature) {
      endOffset = offset
      break
    }
  }
  if (endOffset < 0 || archive.readUInt16LE(endOffset + 4) !== 0 ||
      archive.readUInt16LE(endOffset + 6) !== 0 ||
      endOffset + 22 + archive.readUInt16LE(endOffset + 20) !== archive.length) {
    throw new Error('Plan 55 artifact archive format is invalid')
  }
  const entryCount = archive.readUInt16LE(endOffset + 10)
  const centralSize = archive.readUInt32LE(endOffset + 12)
  const centralOffset = archive.readUInt32LE(endOffset + 16)
  if (archive.readUInt16LE(endOffset + 8) !== entryCount || centralOffset + centralSize > endOffset) {
    throw new Error('Plan 55 artifact archive index is invalid')
  }

  const files = new Map()
  let cursor = centralOffset
  let totalUncompressedSize = 0
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > archive.length || archive.readUInt32LE(cursor) !== centralSignature) {
      throw new Error('Plan 55 artifact archive entry is invalid')
    }
    const flags = archive.readUInt16LE(cursor + 8)
    const method = archive.readUInt16LE(cursor + 10)
    const compressedSize = archive.readUInt32LE(cursor + 20)
    const uncompressedSize = archive.readUInt32LE(cursor + 24)
    totalUncompressedSize += uncompressedSize
    const nameLength = archive.readUInt16LE(cursor + 28)
    const extraLength = archive.readUInt16LE(cursor + 30)
    const commentLength = archive.readUInt16LE(cursor + 32)
    const localOffset = archive.readUInt32LE(cursor + 42)
    const nameStart = cursor + 46
    const nameEnd = nameStart + nameLength
    const entryEnd = nameEnd + extraLength + commentLength
    if (entryEnd > archive.length || (flags & 1) !== 0 ||
        compressedSize === 0xffffffff || uncompressedSize === 0xffffffff ||
        uncompressedSize > MAX_EVIDENCE_FILE_BYTES ||
        totalUncompressedSize > MAX_ARTIFACT_UNCOMPRESSED_BYTES ||
        localOffset + 30 > archive.length || archive.readUInt32LE(localOffset) !== localSignature) {
      throw new Error('Plan 55 artifact archive entry is unsupported')
    }
    let name
    try {
      name = new TextDecoder('utf-8', { fatal: true }).decode(archive.subarray(nameStart, nameEnd))
    } catch {
      throw new Error('Plan 55 artifact archive filename is invalid')
    }
    const localNameLength = archive.readUInt16LE(localOffset + 26)
    const localExtraLength = archive.readUInt16LE(localOffset + 28)
    const localFlags = archive.readUInt16LE(localOffset + 6)
    const localMethod = archive.readUInt16LE(localOffset + 8)
    const localName = archive.subarray(localOffset + 30, localOffset + 30 + localNameLength).toString('utf8')
    if (localFlags !== flags || localMethod !== method || localName !== name) {
      throw new Error('Plan 55 artifact archive local header is inconsistent')
    }
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    const dataEnd = dataStart + compressedSize
    if (dataEnd > centralOffset) throw new Error('Plan 55 artifact archive data is invalid')
    const compressed = archive.subarray(dataStart, dataEnd)
    let content
    try {
      content = method === 0
        ? Buffer.from(compressed)
        : method === 8
          ? inflateRawSync(compressed, { maxOutputLength: MAX_EVIDENCE_FILE_BYTES })
          : null
    } catch {
      throw new Error('Plan 55 artifact archive compression is invalid')
    }
    if (!content || content.length !== uncompressedSize || files.has(name)) {
      throw new Error('Plan 55 artifact archive content is invalid')
    }
    files.set(name, content)
    cursor = entryEnd
  }
  if (cursor !== centralOffset + centralSize) throw new Error('Plan 55 artifact archive index is inconsistent')
  return files
}

async function readBoundedArtifactArchive(response) {
  const contentLengthHeader = response.headers?.get?.('content-length')
  const contentLength = typeof contentLengthHeader === 'string' && contentLengthHeader.trim()
    ? Number(contentLengthHeader)
    : Number.NaN
  if (Number.isFinite(contentLength) && contentLength > MAX_ARTIFACT_ARCHIVE_BYTES) {
    throw new Error('Plan 55 artifact archive is too large')
  }
  const reader = response.body?.getReader?.()
  if (!reader) throw new Error('Plan 55 artifact download requires a bounded stream')
  const chunks = []
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = Buffer.from(value)
      total += chunk.length
      if (total > MAX_ARTIFACT_ARCHIVE_BYTES) {
        try {
          await reader.cancel()
        } catch {}
        throw new Error('Plan 55 artifact archive is too large')
      }
      chunks.push(chunk)
    }
  } catch (error) {
    if (total > MAX_ARTIFACT_ARCHIVE_BYTES) throw error
    throw new Error('Plan 55 artifact download stream failed')
  }
  return Buffer.concat(chunks, total)
}

function resolveEvidenceFile(root, path, label) {
  if (typeof path !== 'string' || !path.trim() || isAbsolute(path) ||
      path.split(/[\\/]/u).includes('..')) {
    throw new Error(`Plan 55 ${label} path is invalid or outside the evidence set`)
  }
  let resolved
  try {
    resolved = realpathSync(resolve(root, path))
  } catch {
    throw new Error(`Plan 55 ${label} file is missing`)
  }
  const fromRoot = relative(root, resolved)
  if (!fromRoot || fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot) ||
      !statSync(resolved).isFile()) {
    throw new Error(`Plan 55 ${label} path is outside the evidence set`)
  }
  return resolved
}

function parseJson(bytes, label) {
  try {
    return JSON.parse(bytes.toString('utf8'))
  } catch {
    throw new Error(`Plan 55 ${label} JSON is invalid`)
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function isSha256(value) {
  return typeof value === 'string' && SHA256.test(value)
}

function isGitSha(value) {
  return typeof value === 'string' && GIT_SHA.test(value)
}
