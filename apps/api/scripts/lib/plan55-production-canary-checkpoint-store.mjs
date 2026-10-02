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
const RECOVERY_SCHEMA = 'plan55-production-canary-interrupted-checkpoint/v1'
const RECOVERY_COMMIT_SCHEMA = 'plan55-production-canary-recovery-commit/v1'
const CLEANUP_TABLES = Object.freeze([
  'profiles',
  'customer_profiles',
  'customer_account_deletion_requests',
  'kael_chat_sessions',
  'kael_chat_turns',
  'worker_profiles',
  'jobs_as_customer',
  'jobs_as_worker',
  'job_broadcasts_as_worker',
  'job_events_as_actor',
  'chat_messages_as_sender',
  'notifications_as_user',
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

    async readInterruptedServiceCheckpoint({ service, deployment }) {
      const identity = checkpointIdentity(service, deployment)
      const lock = await readAndValidateActiveLock(lockPath, service, identity)
      const body = await readCheckpoint(recordsDir, identity)
      const slices = new Map(buildPlan55ServiceSlices(service).map((slice) => [slice.id, slice]))
      const verifiedSlices = body?.verifiedSlices ?? {}
      const pendingSlices = body?.pendingSlices ?? {}
      const recoveryCommit = body?.recoveryCommit ?? null
      if (recoveryCommit) assertRecoveryCommit(recoveryCommit, service, identity, slices)
      const commitMatchesLock = recoveryCommit?.lockToken === lock.token

      for (const [sliceId, entry] of Object.entries(verifiedSlices)) {
        const slice = slices.get(sliceId)
        if (!slice || (lock.sliceIds.includes(sliceId) && !commitMatchesLock)) {
          throw new Error('plan55_checkpoint_integrity_failed')
        }
        assertStoredSlice(entry, slice, identity)
      }
      for (const [sliceId, entry] of Object.entries(pendingSlices)) {
        const slice = slices.get(sliceId)
        if (!slice || !lock.sliceIds.includes(sliceId)) {
          throw new Error('plan55_checkpoint_integrity_failed')
        }
        assertStoredSlice(entry, slice, identity)
      }

      if (commitMatchesLock) {
        assertCommittedRecoveryTransition({ recoveryCommit, lock, body, verifiedSlices })
        await releaseInterruptedCheckpointLock(lockPath, lock)
        throw new Error('plan55_checkpoint_service_not_interrupted')
      }

      const receipts = [...Object.values(verifiedSlices), ...Object.values(pendingSlices)]
        .map(({ receipt }) => structuredClone(receipt))
      return Object.freeze({
        schema: RECOVERY_SCHEMA,
        service,
        identityKey: JSON.stringify(identity),
        lockToken: lock.token,
        sliceIds: [...lock.sliceIds],
        receipts,
      })
    },

    async recoverInterruptedServiceCheckpoint({
      checkpoint, service, deployment, validatedReceipts, invalidatedSliceIds, cleanup,
    }) {
      const identity = checkpointIdentity(service, deployment)
      if (!checkpoint || checkpoint.schema !== RECOVERY_SCHEMA || checkpoint.service !== service ||
          checkpoint.identityKey !== JSON.stringify(identity) || typeof checkpoint.lockToken !== 'string' ||
          !Array.isArray(validatedReceipts) || !Array.isArray(invalidatedSliceIds)) {
        throw new Error('plan55_checkpoint_lock_lost')
      }
      assertPlan55Cleanup(cleanup)

      const activeLock = await readAndValidateActiveLock(lockPath, service, identity)
      if (activeLock.token !== checkpoint.lockToken) {
        throw new Error('plan55_checkpoint_lock_lost')
      }
      const body = await readCheckpoint(recordsDir, identity)
      const verifiedSlices = body?.verifiedSlices ?? {}
      const pendingSlices = body?.pendingSlices ?? {}
      const priorEntries = new Map([
        ...Object.entries(verifiedSlices),
        ...Object.entries(pendingSlices),
      ])
      if (priorEntries.size !== Object.keys(verifiedSlices).length + Object.keys(pendingSlices).length) {
        throw new Error('plan55_checkpoint_integrity_failed')
      }

      const expectedIds = new Set([...priorEntries.keys(), ...activeLock.sliceIds])
      const accounted = new Set()
      const nextVerifiedSlices = {}
      for (const receipt of validatedReceipts) {
        const slice = findCanonicalSlice(service, receipt?.sliceId)
        const safeReceipt = sanitizeReceipt(receipt, slice, identity)
        const id = slice.id
        const prior = priorEntries.get(id)
        if (!prior || !isDeepStrictEqual(prior, { slice, receipt: safeReceipt }) || accounted.has(id)) {
          throw new Error('plan55_checkpoint_recovery_receipt_invalid')
        }
        accounted.add(id)
        nextVerifiedSlices[id] = { slice, receipt: safeReceipt }
      }

      const invalidated = new Set()
      for (const sliceId of invalidatedSliceIds) {
        const slice = findCanonicalSlice(service, sliceId)
        if (!expectedIds.has(slice.id) || accounted.has(slice.id) || invalidated.has(slice.id)) {
          throw new Error('plan55_checkpoint_recovery_accounting_invalid')
        }
        accounted.add(slice.id)
        invalidated.add(slice.id)
      }
      if (accounted.size !== expectedIds.size || [...expectedIds].some((id) => !accounted.has(id))) {
        throw new Error('plan55_checkpoint_recovery_accounting_invalid')
      }

      const nextBody = {
        ...(body ?? emptyCheckpoint(identity, nowIso(clock))),
        verifiedSlices: nextVerifiedSlices,
        pendingSlices: {},
        cleanup: sanitizeCleanup(cleanup),
        recoveryCommit: {
          schema: RECOVERY_COMMIT_SCHEMA,
          lockToken: activeLock.token,
          sliceIds: [...activeLock.sliceIds],
          invalidatedSliceIds: [...invalidated],
          committedAt: nowIso(clock),
        },
        updatedAt: nowIso(clock),
      }
      await writeCheckpoint(recordsDir, identity, nextBody)
      await releaseInterruptedCheckpointLock(lockPath, activeLock)
      return Object.freeze({
        service,
        retainedSliceCount: Object.keys(nextVerifiedSlices).length,
        invalidatedSliceIds: [...invalidated],
      })
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
    globalFlags: 'absent',
    canaryFlag: 'absent',
    canaryActorId: 'absent',
    authStatus: 404,
    orphanWorkers: cleanup.orphanWorkers,
    rows: Object.fromEntries(CLEANUP_TABLES.map((table) => [table, 0])),
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

function assertRecoveryCommit(commit, service, identity, slices) {
  const expectedKeys = ['committedAt', 'invalidatedSliceIds', 'lockToken', 'schema', 'sliceIds']
  if (!isRecord(commit) || !isDeepStrictEqual(Object.keys(commit).sort(), expectedKeys) ||
      commit.schema !== RECOVERY_COMMIT_SCHEMA ||
      typeof commit.lockToken !== 'string' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu.test(commit.lockToken) ||
      !Array.isArray(commit.sliceIds) || commit.sliceIds.length === 0 ||
      !Array.isArray(commit.invalidatedSliceIds) || !Number.isFinite(Date.parse(commit.committedAt))) {
    throw new Error('plan55_checkpoint_integrity_failed')
  }
  const seen = new Set()
  for (const sliceId of commit.sliceIds) {
    if (!slices.has(sliceId) || seen.has(sliceId)) throw new Error('plan55_checkpoint_integrity_failed')
    seen.add(sliceId)
  }
  const invalidated = new Set()
  for (const sliceId of commit.invalidatedSliceIds) {
    if (!seen.has(sliceId) || invalidated.has(sliceId)) {
      throw new Error('plan55_checkpoint_integrity_failed')
    }
    invalidated.add(sliceId)
  }
  if (identity.service !== service) throw new Error('plan55_checkpoint_integrity_failed')
}

function assertCommittedRecoveryTransition({ recoveryCommit, lock, body, verifiedSlices }) {
  if (!isDeepStrictEqual(recoveryCommit.sliceIds, lock.sliceIds) ||
      Object.keys(body.pendingSlices).length > 0 || !body.cleanup) {
    throw new Error('plan55_checkpoint_integrity_failed')
  }
  const invalidated = new Set(recoveryCommit.invalidatedSliceIds)
  const expectedVerified = lock.sliceIds.filter((sliceId) => !invalidated.has(sliceId)).sort()
  const actualVerified = lock.sliceIds.filter((sliceId) => Object.hasOwn(verifiedSlices, sliceId)).sort()
  if (!isDeepStrictEqual(actualVerified, expectedVerified)) {
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

async function readAndValidateActiveLock(lockPath, service, identity) {
  let lock
  try {
    lock = JSON.parse(await readFile(lockPath, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error('plan55_checkpoint_service_not_interrupted')
    throw new Error('plan55_checkpoint_lock_unreadable')
  }
  const slices = new Map(buildPlan55ServiceSlices(service).map((slice) => [slice.id, slice]))
  if (lock?.schema !== LOCK_SCHEMA || !isDeepStrictEqual(lock.identity, identity) ||
      typeof lock.token !== 'string' || !/^[a-f0-9-]{36}$/iu.test(lock.token) ||
      !Array.isArray(lock.sliceIds) || lock.sliceIds.length === 0 ||
      !Number.isFinite(Date.parse(lock.createdAt))) {
    throw new Error('plan55_checkpoint_lock_lost')
  }
  const seen = new Set()
  for (const sliceId of lock.sliceIds) {
    if (!slices.has(sliceId) || seen.has(sliceId)) {
      throw new Error('plan55_checkpoint_integrity_failed')
    }
    seen.add(sliceId)
  }
  return lock
}

async function releaseInterruptedCheckpointLock(lockPath, expectedLock) {
  const current = await readAndValidateActiveLock(lockPath, expectedLock.identity.service, expectedLock.identity)
  if (!isDeepStrictEqual(current, expectedLock)) throw new Error('plan55_checkpoint_lock_lost')
  try {
    await rm(lockPath)
  } catch {
    throw new Error('plan55_checkpoint_lock_release_failed')
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
