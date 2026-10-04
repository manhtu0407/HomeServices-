import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { PRODUCTION_PROJECT_REF } from './kael-playbook-production-attestation.mjs'
import { buildPlan55ServiceSlices } from './plan55-production-canary-core.mjs'

const sourceSha = 'a'.repeat(40)
const deployment = {
  project_ref: PRODUCTION_PROJECT_REF,
  release_id: `harness-${sourceSha.slice(0, 12)}-abc123`,
  git_sha: sourceSha,
}

function receiptFor(slice) {
  const artifactNames = ['slice.json', 'slice.raw.json', 'slice.md', 'source-attestation.json']
  const artifactFiles = Object.fromEntries(artifactNames.map((name) => [
    name,
    `docs/test-logs/plan55/${sourceSha}/${slice.service}/${slice.id}/run-1/${name}`,
  ]))
  const artifactSha256 = Object.fromEntries(artifactNames.map((name) => [name, 'b'.repeat(64)]))
  return {
    sliceId: slice.id,
    caseCount: 12,
    errorCount: 0,
    artifactIntegrity: 'pass',
    sourceSha,
    sourceAttestationSha256: 'e'.repeat(64),
    corpusPath: slice.corpusPath,
    playbookPath: slice.playbookPath,
    playbookEnabled: slice.playbookEnabled,
    metrics: { overall_pass_rate: 0.75, passed: 9, total: 12 },
    runId: `run-${slice.id}`,
    artifactFiles,
    artifactSha256,
  }
}

function cleanReceipt() {
  return {
    globalFlags: 'absent',
    canaryFlag: 'absent',
    canaryActorId: 'absent',
    authStatus: 404,
    orphanWorkers: 0,
    actorLifecycle: {
      authAdminVerified: true,
      syntheticActorCreated: true,
      actorScopeVerified: true,
      disposableWorkerIsolated: true,
    },
    rows: {
      profiles: 0,
      customer_profiles: 0,
      customer_account_deletion_requests: 0,
      kael_chat_sessions: 0,
      kael_chat_turns: 0,
      worker_profiles: 0,
      jobs_as_customer: 0,
      jobs_as_worker: 0,
      job_broadcasts_as_worker: 0,
      job_events_as_actor: 0,
      chat_messages_as_sender: 0,
      notifications_as_user: 0,
    },
  }
}

async function makeStore(t) {
  const rootDir = await mkdtemp(join(tmpdir(), 'plan55-checkpoint-'))
  t.after(() => rm(rootDir, { recursive: true, force: true }))
  const { createPlan55FileCheckpointStore } = await import('./plan55-production-canary-checkpoint-store.mjs')
  return { rootDir, store: createPlan55FileCheckpointStore({ rootDir }) }
}

test('Plan 55 file checkpoints are exclusive, exact-source, and reusable only after cleanup', async (t) => {
  const { rootDir, store } = await makeStore(t)
  const competitor = (await import('./plan55-production-canary-checkpoint-store.mjs'))
    .createPlan55FileCheckpointStore({ rootDir })
  const slice = buildPlan55ServiceSlices('hvac')[0]
  const receipt = receiptFor(slice)
  const checkpoint = await store.beginServiceCheckpoint({
    service: 'hvac', deployment, slices: [slice],
  })

  await assert.rejects(
    competitor.loadVerifiedSliceReceipt({ service: 'hvac', slice, deployment }),
    { message: 'plan55_checkpoint_service_active' },
  )
  await assert.rejects(
    competitor.readVerifiedServiceStatus({ service: 'hvac', deployment }),
    { message: 'plan55_checkpoint_service_active' },
  )
  await assert.rejects(
    competitor.beginServiceCheckpoint({ service: 'hvac', deployment, slices: [slice] }),
    { message: 'plan55_checkpoint_service_active' },
  )
  await store.persistVerifiedSliceReceipt({
    checkpoint, service: 'hvac', slice, deployment, receipt,
  })
  await assert.rejects(
    competitor.loadVerifiedSliceReceipt({ service: 'hvac', slice, deployment }),
    { message: 'plan55_checkpoint_service_active' },
  )

  await store.persistVerifiedServiceCleanup({
    checkpoint, service: 'hvac', deployment, slices: [receipt], cleanup: cleanReceipt(),
  })
  assert.deepEqual(
    await competitor.loadVerifiedSliceReceipt({ service: 'hvac', slice, deployment }),
    receipt,
  )

  const changedDeployment = {
    ...deployment,
    git_sha: 'b'.repeat(40),
    release_id: `harness-${'b'.repeat(12)}-abc123`,
  }
  assert.equal(
    await competitor.loadVerifiedSliceReceipt({
      service: 'hvac', slice, deployment: changedDeployment,
    }),
    null,
  )

  const recordName = (await readdir(join(rootDir, 'records')))[0]
  const recordPath = join(rootDir, 'records', recordName)
  const record = JSON.parse(await readFile(recordPath, 'utf8'))
  record.digest = '0'.repeat(64)
  await writeFile(recordPath, `${JSON.stringify(record)}\n`)
  await assert.rejects(
    competitor.loadVerifiedSliceReceipt({ service: 'hvac', slice, deployment }),
    { message: 'plan55_checkpoint_integrity_failed' },
  )
  await assert.rejects(
    competitor.readVerifiedServiceStatus({ service: 'hvac', deployment }),
    { message: 'plan55_checkpoint_integrity_failed' },
  )
})

test('Plan 55 status reads are read-only and reuse only exact, cleaned source receipts', async (t) => {
  const { rootDir, store } = await makeStore(t)
  const slices = buildPlan55ServiceSlices('hvac')
  const emptyStatus = {
    service: 'hvac',
    verifiedSliceIds: [],
    missingSliceIds: slices.map(({ id }) => id),
    cleanupVerified: false,
    cleanup: null,
    complete: false,
  }

  assert.deepEqual(
    await store.readVerifiedServiceStatus({ service: 'hvac', deployment }),
    emptyStatus,
  )
  assert.deepEqual(await readdir(rootDir), [])

  const checkpoint = await store.beginServiceCheckpoint({
    service: 'hvac', deployment, slices: [slices[0]],
  })
  const receipt = receiptFor(slices[0])
  await store.persistVerifiedSliceReceipt({
    checkpoint, service: 'hvac', slice: slices[0], deployment, receipt,
  })
  await store.persistVerifiedServiceCleanup({
    checkpoint, service: 'hvac', deployment, slices: [receipt], cleanup: cleanReceipt(),
  })

  assert.deepEqual(
    await store.readVerifiedServiceStatus({ service: 'hvac', deployment }),
    {
      service: 'hvac',
      verifiedSliceIds: [slices[0].id],
      missingSliceIds: slices.slice(1).map(({ id }) => id),
      cleanupVerified: true,
      cleanup: cleanReceipt(),
      complete: false,
    },
  )

  const changedDeployment = {
    ...deployment,
    git_sha: 'b'.repeat(40),
    release_id: `harness-${'b'.repeat(12)}-abc123`,
  }
  assert.deepEqual(
    await store.readVerifiedServiceStatus({ service: 'hvac', deployment: changedDeployment }),
    emptyStatus,
  )
})

test('Plan 55 checkpoint preserves only the closed actor lifecycle boolean proof', async (t) => {
  const { store } = await makeStore(t)
  const slice = buildPlan55ServiceSlices('hvac')[0]
  const checkpoint = await store.beginServiceCheckpoint({ service: 'hvac', deployment, slices: [slice] })
  const receipt = receiptFor(slice)
  await store.persistVerifiedSliceReceipt({ checkpoint, service: 'hvac', slice, deployment, receipt })

  const malformed = cleanReceipt()
  malformed.actorLifecycle.secret = 'must-not-be-persisted'
  await assert.rejects(store.persistVerifiedServiceCleanup({
    checkpoint, service: 'hvac', deployment, slices: [receipt], cleanup: malformed,
  }), { message: 'plan55_checkpoint_integrity_failed' })

  const clean = cleanReceipt()
  await store.persistVerifiedServiceCleanup({
    checkpoint, service: 'hvac', deployment, slices: [receipt], cleanup: clean,
  })
  const status = await store.readVerifiedServiceStatus({ service: 'hvac', deployment })
  assert.deepEqual(status.cleanup.actorLifecycle, clean.actorLifecycle)
})

test('Plan 55 status rejects staged receipts without their active lock', async (t) => {
  const { rootDir, store } = await makeStore(t)
  const slice = buildPlan55ServiceSlices('plumbing')[0]
  const checkpoint = await store.beginServiceCheckpoint({
    service: 'plumbing', deployment, slices: [slice],
  })
  await store.persistVerifiedSliceReceipt({
    checkpoint, service: 'plumbing', slice, deployment, receipt: receiptFor(slice),
  })

  await rm(join(rootDir, 'active.lock'))
  await assert.rejects(
    store.readVerifiedServiceStatus({ service: 'plumbing', deployment }),
    { message: 'plan55_checkpoint_integrity_failed' },
  )
})

test('Plan 55 retains the service lock and staged receipt when cleanup proof fails', async (t) => {
  const { rootDir, store } = await makeStore(t)
  const competitor = (await import('./plan55-production-canary-checkpoint-store.mjs'))
    .createPlan55FileCheckpointStore({ rootDir })
  const slice = buildPlan55ServiceSlices('plumbing')[0]
  const receipt = receiptFor(slice)
  const checkpoint = await store.beginServiceCheckpoint({
    service: 'plumbing', deployment, slices: [slice],
  })
  await store.persistVerifiedSliceReceipt({
    checkpoint, service: 'plumbing', slice, deployment, receipt,
  })

  await assert.rejects(
    store.persistVerifiedServiceCleanup({
      checkpoint,
      service: 'plumbing',
      deployment,
      slices: [receipt],
      cleanup: { ...cleanReceipt(), canaryFlag: 'present' },
    }),
    { message: 'plan55_cleanup_canary_flag_still_enabled' },
  )
  await assert.rejects(
    store.persistVerifiedServiceCleanup({
      checkpoint,
      service: 'plumbing',
      deployment,
      slices: [receipt],
      cleanup: { ...cleanReceipt(), globalFlags: 'present' },
    }),
    { message: 'plan55_cleanup_global_flags_remain' },
  )
  await assert.rejects(
    competitor.beginServiceCheckpoint({ service: 'plumbing', deployment, slices: [slice] }),
    { message: 'plan55_checkpoint_service_active' },
  )
  await assert.rejects(
    competitor.loadVerifiedSliceReceipt({ service: 'plumbing', slice, deployment }),
    { message: 'plan55_checkpoint_service_active' },
  )
})

test('Plan 55 interrupted recovery revalidates receipts, preserves valid slices, and releases the exact lock', async (t) => {
  const { rootDir, store } = await makeStore(t)
  const slices = buildPlan55ServiceSlices('hvac')
  const firstReceipt = receiptFor(slices[0])
  const secondReceipt = receiptFor(slices[1])
  const firstAttempt = await store.beginServiceCheckpoint({
    service: 'hvac', deployment, slices: [slices[0]],
  })
  await store.persistVerifiedSliceReceipt({
    checkpoint: firstAttempt, service: 'hvac', slice: slices[0], deployment, receipt: firstReceipt,
  })
  await store.persistVerifiedServiceCleanup({
    checkpoint: firstAttempt, service: 'hvac', deployment, slices: [firstReceipt], cleanup: cleanReceipt(),
  })

  const interruptedAttempt = await store.beginServiceCheckpoint({
    service: 'hvac', deployment, slices: [slices[1]],
  })
  await store.persistVerifiedSliceReceipt({
    checkpoint: interruptedAttempt, service: 'hvac', slice: slices[1], deployment, receipt: secondReceipt,
  })
  const interrupted = await store.readInterruptedServiceCheckpoint({ service: 'hvac', deployment })

  assert.deepEqual(interrupted.sliceIds, [slices[1].id])
  assert.deepEqual(interrupted.receipts.map(({ sliceId }) => sliceId), [slices[0].id, slices[1].id])
  await store.recoverInterruptedServiceCheckpoint({
    checkpoint: interrupted,
    service: 'hvac',
    deployment,
    validatedReceipts: [firstReceipt, secondReceipt],
    invalidatedSliceIds: [],
    cleanup: cleanReceipt(),
  })

  assert.deepEqual(
    (await store.readVerifiedServiceStatus({ service: 'hvac', deployment })).verifiedSliceIds,
    [slices[0].id, slices[1].id],
  )
  await assert.rejects(store.readInterruptedServiceCheckpoint({ service: 'hvac', deployment }), {
    message: 'plan55_checkpoint_service_not_interrupted',
  })
  assert.deepEqual(await readdir(rootDir), ['records'])
})

test('Plan 55 recovers a durable checkpoint commit when the exact old lock survives the rename', async (t) => {
  const { rootDir, store } = await makeStore(t)
  const slices = buildPlan55ServiceSlices('hvac')
  const receipt = receiptFor(slices[0])
  const checkpoint = await store.beginServiceCheckpoint({
    service: 'hvac', deployment, slices: [slices[0], slices[1]],
  })
  const lockPath = join(rootDir, 'active.lock')
  const originalLock = await readFile(lockPath, 'utf8')
  await store.persistVerifiedSliceReceipt({ checkpoint, service: 'hvac', slice: slices[0], deployment, receipt })
  const interrupted = await store.readInterruptedServiceCheckpoint({ service: 'hvac', deployment })
  await store.recoverInterruptedServiceCheckpoint({
    checkpoint: interrupted,
    service: 'hvac',
    deployment,
    validatedReceipts: [receipt],
    invalidatedSliceIds: [slices[1].id],
    cleanup: cleanReceipt(),
  })

  await writeFile(lockPath, originalLock, { flag: 'wx' })
  await assert.rejects(store.readInterruptedServiceCheckpoint({ service: 'hvac', deployment }), {
    message: 'plan55_checkpoint_service_not_interrupted',
  })
  assert.deepEqual(
    (await store.readVerifiedServiceStatus({ service: 'hvac', deployment })).verifiedSliceIds,
    [slices[0].id],
  )
  assert.deepEqual(
    (await store.readVerifiedServiceStatus({ service: 'hvac', deployment })).missingSliceIds,
    slices.slice(1).map(({ id }) => id),
  )
  assert.deepEqual(await readdir(rootDir), ['records'])
})

test('Plan 55 does not mistake a newer lock for an already committed recovery', async (t) => {
  const { store } = await makeStore(t)
  const slices = buildPlan55ServiceSlices('hvac')
  const firstReceipt = receiptFor(slices[0])
  const first = await store.beginServiceCheckpoint({ service: 'hvac', deployment, slices: [slices[0]] })
  await store.persistVerifiedSliceReceipt({
    checkpoint: first, service: 'hvac', slice: slices[0], deployment, receipt: firstReceipt,
  })
  const interrupted = await store.readInterruptedServiceCheckpoint({ service: 'hvac', deployment })
  await store.recoverInterruptedServiceCheckpoint({
    checkpoint: interrupted,
    service: 'hvac',
    deployment,
    validatedReceipts: [firstReceipt],
    invalidatedSliceIds: [],
    cleanup: cleanReceipt(),
  })

  const next = await store.beginServiceCheckpoint({ service: 'hvac', deployment, slices: [slices[1]] })
  const nextInterrupted = await store.readInterruptedServiceCheckpoint({ service: 'hvac', deployment })
  assert.deepEqual(nextInterrupted.sliceIds, [slices[1].id])
  assert.equal(nextInterrupted.lockToken, next.token)
  await assert.rejects(store.readVerifiedServiceStatus({ service: 'hvac', deployment }), {
    message: 'plan55_checkpoint_service_active',
  })
})

test('Plan 55 interrupted recovery reruns only invalidated slices and requires exact receipt accounting', async (t) => {
  const { store } = await makeStore(t)
  const slices = buildPlan55ServiceSlices('handyman')
  const checkpoint = await store.beginServiceCheckpoint({
    service: 'handyman', deployment, slices: [slices[0], slices[1]],
  })
  const firstReceipt = receiptFor(slices[0])
  await store.persistVerifiedSliceReceipt({
    checkpoint, service: 'handyman', slice: slices[0], deployment, receipt: firstReceipt,
  })
  const interrupted = await store.readInterruptedServiceCheckpoint({ service: 'handyman', deployment })

  await assert.rejects(store.recoverInterruptedServiceCheckpoint({
    checkpoint: interrupted,
    service: 'handyman',
    deployment,
    validatedReceipts: [firstReceipt],
    invalidatedSliceIds: [],
    cleanup: cleanReceipt(),
  }), { message: 'plan55_checkpoint_recovery_accounting_invalid' })
  await assert.rejects(store.recoverInterruptedServiceCheckpoint({
    checkpoint: interrupted,
    service: 'handyman',
    deployment,
    validatedReceipts: [firstReceipt],
    invalidatedSliceIds: [slices[1].id],
    cleanup: { ...cleanReceipt(), globalFlags: 'present' },
  }), { message: 'plan55_cleanup_global_flags_remain' })

  await store.recoverInterruptedServiceCheckpoint({
    checkpoint: interrupted,
    service: 'handyman',
    deployment,
    validatedReceipts: [firstReceipt],
    invalidatedSliceIds: [slices[1].id],
    cleanup: cleanReceipt(),
  })
  const status = await store.readVerifiedServiceStatus({ service: 'handyman', deployment })
  assert.deepEqual(status.verifiedSliceIds, [slices[0].id])
  assert.equal(status.missingSliceIds.includes(slices[1].id), true)
  const next = await store.beginServiceCheckpoint({
    service: 'handyman', deployment, slices: [slices[1]],
  })
  await store.persistVerifiedServiceCleanup({
    checkpoint: next, service: 'handyman', deployment, slices: [], cleanup: cleanReceipt(),
  })
})

test('Plan 55 interrupted recovery refuses a lock for another service or a changed lock token', async (t) => {
  const { rootDir, store } = await makeStore(t)
  const hvacSlice = buildPlan55ServiceSlices('hvac')[0]
  const checkpoint = await store.beginServiceCheckpoint({
    service: 'hvac', deployment, slices: [hvacSlice],
  })
  await assert.rejects(store.readInterruptedServiceCheckpoint({ service: 'handyman', deployment }), {
    message: 'plan55_checkpoint_lock_lost',
  })

  const interrupted = await store.readInterruptedServiceCheckpoint({ service: 'hvac', deployment })
  const lockPath = join(rootDir, 'active.lock')
  const lock = JSON.parse(await readFile(lockPath, 'utf8'))
  lock.token = checkpoint.token === 'a'.repeat(36) ? 'b'.repeat(36) : 'a'.repeat(36)
  await writeFile(lockPath, `${JSON.stringify(lock)}\n`)
  await assert.rejects(store.recoverInterruptedServiceCheckpoint({
    checkpoint: interrupted,
    service: 'hvac',
    deployment,
    validatedReceipts: [],
    invalidatedSliceIds: [hvacSlice.id],
    cleanup: cleanReceipt(),
  }), { message: 'plan55_checkpoint_lock_lost' })
})

test('Plan 55 checkpoint metrics reject free text before it reaches disk', async (t) => {
  const { rootDir, store } = await makeStore(t)
  const slice = buildPlan55ServiceSlices('cleaning')[0]
  const checkpoint = await store.beginServiceCheckpoint({
    service: 'cleaning', deployment, slices: [slice],
  })
  const receipt = {
    ...receiptFor(slice),
    metrics: { overall_pass_rate: 0.75, diagnostic: 'synthetic contact 555-0100' },
  }

  await assert.rejects(
    store.persistVerifiedSliceReceipt({
      checkpoint, service: 'cleaning', slice, deployment, receipt,
    }),
    { message: 'plan55_checkpoint_receipt_invalid' },
  )
  await store.persistVerifiedServiceCleanup({
    checkpoint, service: 'cleaning', deployment, slices: [], cleanup: cleanReceipt(),
  })

  const recordFiles = await readdir(join(rootDir, 'records'))
  const storedText = await readFile(join(rootDir, 'records', recordFiles[0]), 'utf8')
  assert.equal(JSON.parse(storedText).body.cleanup.globalFlags, 'absent')
  assert.equal(storedText.includes('synthetic contact'), false)
})
