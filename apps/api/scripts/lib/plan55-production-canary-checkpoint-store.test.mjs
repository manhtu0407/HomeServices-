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
    canaryFlag: 'absent',
    canaryActorId: 'absent',
    authStatus: 404,
    rows: {
      profiles: 0,
      customer_profiles: 0,
      customer_account_deletion_requests: 0,
      kael_chat_sessions: 0,
      kael_chat_turns: 0,
    },
    orphanWorkers: 0,
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
    competitor.beginServiceCheckpoint({ service: 'plumbing', deployment, slices: [slice] }),
    { message: 'plan55_checkpoint_service_active' },
  )
  await assert.rejects(
    competitor.loadVerifiedSliceReceipt({ service: 'plumbing', slice, deployment }),
    { message: 'plan55_checkpoint_service_active' },
  )
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
  assert.equal(storedText.includes('synthetic contact'), false)
})
