import { createHash } from 'node:crypto'

const RELEASE_ID = /^harness-[0-9a-f]{12}-[0-9a-f]{12}$/u
const COHORT_ID = /^synthetic-stage1-[0-9a-f]{12}-[0-9a-f]{12}-[A-Za-z0-9_-]{1,48}$/u
const RUN_ID = /^[A-Za-z0-9_.:-]{1,120}$/u
const DEDICATED_EMAIL = /^nestscout-stage1-(?:staging|production)-(?:customer|worker)@example\.test$/u

export function validateSyntheticActorProvisionInput(input) {
  if (!RELEASE_ID.test(input?.releaseId ?? '') ||
      !COHORT_ID.test(input?.cohortId ?? '') ||
      !RUN_ID.test(input?.runId ?? '') ||
      !['staging', 'production'].includes(input?.environment)) {
    throw new Error('synthetic actor provision identity is invalid')
  }
  if (!input.cohortId.startsWith(`synthetic-stage1-${input.releaseId.slice(8, 20)}-${input.releaseId.slice(21)}-`)) {
    throw new Error('synthetic actor cohort is not bound to the release')
  }
  const customer = validateCredential(input.customer, 'customer', input.environment)
  const worker = validateCredential(input.worker, 'worker', input.environment)
  if (customer.email === worker.email || customer.password === worker.password) {
    throw new Error('synthetic actor credentials must be distinct')
  }
  return { customer, worker }
}

export function buildSyntheticActorProvisionReceipt(input) {
  validateSyntheticActorProvisionInput(input)
  for (const field of ['createdActorCount', 'reusedActorCount', 'boundMemberCount', 'workerMarkerCount']) {
    if (!Number.isSafeInteger(input?.[field]) || input[field] < 0) {
      throw new Error(`synthetic actor provision field is invalid: ${field}`)
    }
  }
  if (input.createdActorCount + input.reusedActorCount !== 2 ||
      input.boundMemberCount !== 2 || input.workerMarkerCount !== 1 ||
      input.presentationSafe !== true || input.authenticationVerified !== true) {
    throw new Error('synthetic actors were not safely provisioned and permanently classified')
  }
  const receipt = {
    schemaVersion: 'stage1-synthetic-actor-provision.v1',
    status: 'provisioned',
    releaseId: input.releaseId,
    environment: input.environment,
    cohortId: input.cohortId,
    runId: input.runId,
    actorCount: 2,
    createdActorCount: input.createdActorCount,
    reusedActorCount: input.reusedActorCount,
    boundMemberCount: input.boundMemberCount,
    workerMarkerCount: input.workerMarkerCount,
    presentationSafe: true,
    authenticationVerified: true,
    generatedAt: new Date(input.now ?? Date.now()).toISOString(),
    receiptSha256: '',
  }
  receipt.receiptSha256 = syntheticActorProvisionReceiptSha256(receipt)
  return receipt
}

function syntheticActorProvisionReceiptSha256(receipt) {
  return createHash('sha256').update([
    receipt.schemaVersion,
    receipt.status,
    receipt.releaseId,
    receipt.environment,
    receipt.cohortId,
    receipt.runId,
    receipt.actorCount,
    receipt.createdActorCount,
    receipt.reusedActorCount,
    receipt.boundMemberCount,
    receipt.workerMarkerCount,
    receipt.presentationSafe,
    receipt.authenticationVerified,
    receipt.generatedAt,
  ].map(String).join('\n')).digest('hex')
}

export function verifySyntheticActorProvisionReceipt(receipt) {
  return typeof receipt?.receiptSha256 === 'string' &&
    receipt.receiptSha256 === syntheticActorProvisionReceiptSha256(receipt)
}

function validateCredential(value, role, environment) {
  const email = value?.email?.trim().toLowerCase()
  const password = value?.password
  if (!DEDICATED_EMAIL.test(email ?? '') ||
      email !== `nestscout-stage1-${environment}-${role}@example.test` ||
      typeof password !== 'string' || password.length < 32 || password.length > 128) {
    throw new Error(`dedicated synthetic ${role} credential is invalid`)
  }
  return { email, password }
}
