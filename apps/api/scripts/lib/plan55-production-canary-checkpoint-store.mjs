import { createHash, randomUUID } from 'node:crypto'
import { mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import { PRODUCTION_PROJECT_REF } from './kael-playbook-production-attestation.mjs'
import {
  PLAN55_SERVICE_ORDER,
  assertPlan55Cleanup,
  buildPlan55ServiceSlices,
  isSafeArtifactReceipt,
} from './plan55-production-canary-core.mjs'

const STORE_SCHEMA = 'plan55-production-canary-checkpoint/v1'
const LOCK_SCHEMA = 'plan55-production-canary-lock/v1'
const HANDLE_SCHEMA = 'plan55-production-canary-lock-handle/v1'
const CLEANUP_TABLES = Object.freeze([
  'profiles',
  'customer_profiles',
  'customer_account_deletion_requests',
  'kael_chat_sessions',
  'kael_chat_turns',
])

export function createPlan55FileCheckpointStore({
  rootDir,
  clock = () => new Date(),
} = {}) {
  if (typeof rootDir !== 'string' || rootDir.length === 0 || typeof clock !== 'function') {
    throw new Error('plan55_checkpoint_configuration_invalid')
  }

  const root = resolve(rootDir)
  const recordsDir = join(root, 'records')
  const lockPath = join(root, 'active.lock')

  return Object.freeze({
    async readVerifiedServiceStatus({ service, deployment }) {
      const identity = checkpointIdentity(service, deployment)
      const slices = buildPlan55ServiceSlices(service)
      await assertNoActiveCheckpoint(lockPath)
      const body = await readCheckpoint(recordsDir, identity)
      if (!body) return serviceCheckpointStatus(service, slices, null)
      if (!body.cleanup || Object.keys(body.pendingSlices).length > 0) {
        throw new Error('plan55_checkpoint_integrity_failed')
      }
      assertPlan55Cleanup(body.cleanup)

      const expectedSlices = new Map(slices.map((slice) => [slice.id, slice]))
      for (const [sliceId, entry] of Object.entries(body.verifiedSlices)) {
        const slice = expectedSlices.get(sliceId)
        if (!slice) throw new Error('plan55_checkpoint_integrity_failed')
        assertStoredSlice(entry, slice, identity)
      }
      return serviceCheckpointStatus(service, slices, body.verifiedSlices)
    },

    async loadVerifiedSliceReceipt({ service, slice, deployment }) {
      const identity = checkpointIdentity(service, deployment)
      const canonicalSlice = canonicalPlanSlice(service, slice)
      await assertNoActiveCheckpoint(lockPath)
      const body = await readCheckpoint(recordsDir, identity)
      if (!body) return null
      if (!body.cleanup) throw new Error('plan55_checkpoint_integrity_failed')
      assertPlan55Cleanup(body.cleanup)
      const entry = body.verifiedSlices[canonicalSlice.id]
      if (!entry) return null
      assertStoredSlice(entry, canonicalSlice, identity)
      return structuredClone(entry.receipt)
    },

    async beginServiceCheckpoint({ service, deployment, slices }) {
      const identity = checkpointIdentity(service, deployment)
      if (!Array.isArray(slices) || slices.length === 0) {
        throw new Error('plan55_checkpoint_slice_set_invalid')
      }
      const sliceIds = slices.map((slice) => canonicalPlanSlice(service, slice).id)
      if (new Set(sliceIds).size !== sliceIds.length) {
        throw new Error('plan55_checkpoint_slice_set_invalid')
      }

      await mkdir(root, { recursive: true })
      const lock = {
        schema: LOCK_SCHEMA,
        token: randomUUID(),
        identity,
        sliceIds,
        createdAt: nowIso(clock),
      }
      let handle
      try {
        handle = await open(lockPath, 'wx', 0o600)
      } catch (error) {
        if (error?.code === 'EEXIST') {
          throw new Error('plan55_checkpoint_service_active')
        }
        throw new Error('plan55_checkpoint_lock_create_failed')
      }
      try {
        await handle.writeFile(`${JSON.stringify(lock)}\n`, 'utf8')
        await handle.sync()
      } catch {
        await handle.close().catch(() => {})
        await rm(lockPath, { force: true }).catch(() => {})
        throw new Error('plan55_checkpoint_lock_create_failed')
      }
      await handle.close()
      return Object.freeze({
        schema: HANDLE_SCHEMA,
        token: lock.token,
        service,
        identityKey: JSON.stringify(identity),
      })
    },

    async persistVerifiedSliceReceipt({ checkpoint, service, slice, deployment, receipt }) {
      const identity = checkpointIdentity(service, deployment)
      const canonicalSlice = canonicalPlanSlice(service, slice)
      const safeReceipt = sanitizeReceipt(receipt, canonicalSlice, identity)
      await assertActiveCheckpoint(lockPath, checkpoint, service, identity)
      const body = await readCheckpoint(recordsDir, identity) ?? emptyCheckpoint(identity, nowIso(clock))
      body.pendingSlices[canonicalSlice.id] = { slice: canonicalSlice, receipt: safeReceipt }
      body.updatedAt = nowIso(clock)
      await writeCheckpoint(recordsDir, identity, body)
    },

    async persistVerifiedServiceCleanup({ checkpoint, service, deployment, slices, cleanup }) {
      const identity = checkpointIdentity(service, deployment)
      await assertActiveCheckpoint(lockPath, checkpoint, service, identity)
      assertPlan55Cleanup(cleanup)
      if (!Array.isArray(slices)) throw new Error('plan55_checkpoint_slice_set_invalid')

      const body = await readCheckpoint(recordsDir, identity) ?? emptyCheckpoint(identity, nowIso(clock))
      const verifiedSlices = { ...body.verifiedSlices }
      const included = new Set()
      for (const receipt of slices) {
        const slice = findCanonicalSlice(service, receipt?.sliceId)
        const safeReceipt = sanitizeReceipt(receipt, slice, identity)
        const entry = { slice, receipt: safeReceipt }
        const prior = body.pendingSlices[slice.id] ?? body.verifiedSlices[slice.id]
        if (!prior || !isDeepStrictEqual(prior, entry)) {
          throw new Error('plan55_checkpoint_slice_not_staged')
        }
        if (included.has(slice.id)) throw new Error('plan55_checkpoint_slice_set_invalid')
        included.add(slice.id)
        verifiedSlices[slice.id] = entry
      }
      if (Object.keys(body.pendingSlices).some((sliceId) => !included.has(sliceId))) {
        throw new Error('plan55_checkpoint_staged_slice_unaccounted')
      }

      const nextBody = {
        ...body,
        verifiedSlices,
        pendingSlices: {},
        cleanup: sanitizeCleanup(cleanup),
        updatedAt: nowIso(clock),
      }
      await writeCheckpoint(recordsDir, identity, nextBody)
      await releaseCheckpointLock(lockPath, checkpoint, service, identity)
    },
  })
}

function serviceCheckpointStatus(service, slices, verifiedSlices) {
  const verifiedSliceIds = slices
    .filter(({ id }) => verifiedSlices && Object.hasOwn(verifiedSlices, id))
    .map(({ id }) => id)
  const verified = new Set(verifiedSliceIds)
  const missingSliceIds = slices.filter(({ id }) => !verified.has(id)).map(({ id }) => id)
  return {
    service,
    verifiedSliceIds,
    missingSliceIds,
    cleanupVerified: verifiedSlices !== null,
    complete: missingSliceIds.length === 0 && verifiedSlices !== null,
  }
}

function checkpointIdentity(service, deployment) {
  if (!PLAN55_SERVICE_ORDER.includes(service) || !deployment ||
      deployment.project_ref !== PRODUCTION_PROJECT_REF ||
      typeof deployment.release_id !== 'string' ||
      !/^harness-[0-9a-f]{12}-[a-z0-9-]{6,40}$/i.test(deployment.release_id) ||
      typeof deployment.git_sha !== 'string' || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(deployment.git_sha)) {
    throw new Error('plan55_checkpoint_identity_invalid')
  }
  return Object.freeze({
    project_ref: PRODUCTION_PROJECT_REF,
    service,
    release_id: deployment.release_id,
    git_sha: deployment.git_sha.toLowerCase(),
  })
}

function canonicalPlanSlice(service, slice) {
  if (!slice || typeof slice.id !== 'string') {
    throw new Error('plan55_checkpoint_slice_invalid')
  }
  return findCanonicalSlice(service, slice.id, slice)
}

function findCanonicalSlice(service, sliceId, actual) {
  const expected = buildPlan55ServiceSlices(service).find((slice) => slice.id === sliceId)
  if (!expected || (actual && !isDeepStrictEqual(expected, actual))) {
    throw new Error('plan55_checkpoint_slice_invalid')
  }
  return expected
}

function sanitizeReceipt(receipt, slice, identity) {
  if (!receipt || receipt.sliceId !== slice.id || receipt.caseCount !== 12 ||
      receipt.errorCount !== 0 || receipt.artifactIntegrity !== 'pass' ||
      typeof receipt.sourceSha !== 'string' || receipt.sourceSha.toLowerCase() !== identity.git_sha ||
      typeof receipt.sourceAttestationSha256 !== 'string' ||
      !/^[a-f0-9]{64}$/iu.test(receipt.sourceAttestationSha256) ||
      receipt.corpusPath !== slice.corpusPath || receipt.playbookPath !== slice.playbookPath ||
      receipt.playbookEnabled !== slice.playbookEnabled ||
      typeof receipt.runId !== 'string' || !/^[a-z0-9._:-]{1,160}$/i.test(receipt.runId) ||
      !isSafeArtifactReceipt(receipt.artifactFiles, receipt.artifactSha256, slice, identity) ||
      !receipt.metrics || typeof receipt.metrics !== 'object' || Array.isArray(receipt.metrics) ||
      !isSafeMetricTree(receipt.metrics)) {
    throw new Error('plan55_checkpoint_receipt_invalid')
  }
  return {
    sliceId: slice.id,
    caseCount: 12,
    errorCount: 0,
    artifactIntegrity: 'pass',
    sourceSha: identity.git_sha,
    sourceAttestationSha256: receipt.sourceAttestationSha256.toLowerCase(),
    corpusPath: slice.corpusPath,
    playbookPath: slice.playbookPath,
    playbookEnabled: slice.playbookEnabled,
    metrics: JSON.parse(JSON.stringify(receipt.metrics)),
    runId: receipt.runId,
    artifactFiles: { ...receipt.artifactFiles },
    artifactSha256: { ...receipt.artifactSha256 },
  }
}

function isSafeMetricTree(value, seen = new Set()) {
  if (value === null || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (!value || typeof value !== 'object' || seen.has(value)) return false
  seen.add(value)
  if (Array.isArray(value)) return value.every((entry) => isSafeMetricTree(entry, seen))
  if (Object.getPrototypeOf(value) !== Object.prototype) return false
  return Object.entries(value).every(([key, entry]) =>
    /^[a-z0-9_-]{1,80}$/i.test(key) && !key.startsWith('__') && isSafeMetricTree(entry, seen))
}

function sanitizeCleanup(cleanup) {
  assertPlan55Cleanup(cleanup)
  return {
    canaryFlag: 'absent',
    canaryActorId: 'absent',
    authStatus: 404,
    rows: Object.fromEntries(CLEANUP_TABLES.map((table) => [table, 0])),
    orphanWorkers: 0,
  }
}

function assertStoredSlice(entry, slice, identity) {
  if (!entry || !isDeepStrictEqual(entry.slice, slice)) {
    throw new Error('plan55_checkpoint_integrity_failed')
  }
  const safeReceipt = sanitizeReceipt(entry.receipt, slice, identity)
  if (!isDeepStrictEqual(safeReceipt, entry.receipt)) {
    throw new Error('plan55_checkpoint_integrity_failed')
  }
}

function emptyCheckpoint(identity, updatedAt) {
  return {
    schema: STORE_SCHEMA,
    identity,
    verifiedSlices: {},
    pendingSlices: {},
    cleanup: null,
    updatedAt,
  }
}

function recordPath(recordsDir, identity) {
  const key = createHash('sha256').update(JSON.stringify(identity)).digest('hex')
  return join(recordsDir, `${identity.service}-${key}.json`)
}

async function readCheckpoint(recordsDir, identity) {
  let text
  try {
    text = await readFile(recordPath(recordsDir, identity), 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw new Error('plan55_checkpoint_read_failed')
  }

  let envelope
  try {
    envelope = JSON.parse(text)
  } catch {
    throw new Error('plan55_checkpoint_integrity_failed')
  }
  const body = envelope?.body
  if (!body || envelope.digest !== sha256(JSON.stringify(body)) ||
      body.schema !== STORE_SCHEMA || !isDeepStrictEqual(body.identity, identity) ||
      !isRecord(body.verifiedSlices) || !isRecord(body.pendingSlices) ||
      (body.cleanup !== null && !body.cleanup)) {
    throw new Error('plan55_checkpoint_integrity_failed')
  }
  if (body.cleanup) assertPlan55Cleanup(body.cleanup)
  return body
}

async function writeCheckpoint(recordsDir, identity, body) {
  await mkdir(recordsDir, { recursive: true })
  const destination = recordPath(recordsDir, identity)
  const temporary = `${destination}.${randomUUID()}.tmp`
  const envelope = { body, digest: sha256(JSON.stringify(body)) }
  let handle
  try {
    handle = await open(temporary, 'wx', 0o600)
    await handle.writeFile(`${JSON.stringify(envelope)}\n`, 'utf8')
    await handle.sync()
    await handle.close()
    handle = null
    await rename(temporary, destination)
  } catch {
    if (handle) await handle.close().catch(() => {})
    await rm(temporary, { force: true }).catch(() => {})
    throw new Error('plan55_checkpoint_write_failed')
  }
}

async function assertNoActiveCheckpoint(lockPath) {
  try {
    await readFile(lockPath)
    throw new Error('plan55_checkpoint_service_active')
  } catch (error) {
    if (error?.message === 'plan55_checkpoint_service_active') throw error
    if (error?.code === 'ENOENT') return
    throw new Error('plan55_checkpoint_lock_unreadable')
  }
}

async function assertActiveCheckpoint(lockPath, checkpoint, service, identity) {
  if (!checkpoint || checkpoint.schema !== HANDLE_SCHEMA || checkpoint.service !== service ||
      checkpoint.identityKey !== JSON.stringify(identity) || typeof checkpoint.token !== 'string') {
    throw new Error('plan55_checkpoint_lock_lost')
  }
  let lock
  try {
    lock = JSON.parse(await readFile(lockPath, 'utf8'))
  } catch {
    throw new Error('plan55_checkpoint_lock_lost')
  }
  if (lock?.schema !== LOCK_SCHEMA || lock.token !== checkpoint.token ||
      !isDeepStrictEqual(lock.identity, identity)) {
    throw new Error('plan55_checkpoint_lock_lost')
  }
}

async function releaseCheckpointLock(lockPath, checkpoint, service, identity) {
  await assertActiveCheckpoint(lockPath, checkpoint, service, identity)
  try {
    await rm(lockPath)
  } catch {
    throw new Error('plan55_checkpoint_lock_release_failed')
  }
}

function isRecord(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function nowIso(clock) {
  let value
  try {
    value = clock()
  } catch {
    throw new Error('plan55_checkpoint_clock_invalid')
  }
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error('plan55_checkpoint_clock_invalid')
  return date.toISOString()
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}
