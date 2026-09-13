import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  workerRegistrationCommandSchema,
  workerRegistrationCommandReceiptSchema,
  type WorkerRegistrationCommandInput,
  type WorkerRegistrationCommandReceipt,
  type WorkerRegistrationDraftInput,
} from '@nestscout/shared'
import { generateClientRequestId } from '../client-request-id'
import { withNetworkDeadline } from '../response-guard'
import { workerService } from '../services'

export type WorkerRegistrationRecoveryView = {
  phase: 'idle' | 'saving' | 'reconciling' | 'unknown' | 'submitted' | 'rejected' | 'storage_error' | 'draft_error'
  receipt: WorkerRegistrationCommandReceipt | null
}

type RegistrationRecord = {
  version: 1
  ownerId: string
  command: WorkerRegistrationCommandInput
  receipt: WorkerRegistrationCommandReceipt | null
}

const ownerTasks = new Map<string, Promise<unknown>>()
const storageTasks = new Map<string, Promise<unknown>>()
const OWNER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function serialize<T>(tasks: Map<string, Promise<unknown>>, owner: string, action: () => Promise<T>) {
  const pending = (tasks.get(owner) ?? Promise.resolve()).catch(() => undefined).then(action)
  tasks.set(owner, pending)
  try { return await pending } finally {
    if (tasks.get(owner) === pending) tasks.delete(owner)
  }
}

function storage<T>(owner: string, action: () => Promise<T>) {
  // A timed-out native write can still finish; later reads/writes must stay behind it.
  return withNetworkDeadline(() => serialize(storageTasks, owner, action), 5_000)
}

function key(owner: string) { return `nestscout.worker-registration.v1.${owner}` }

function sameRevision(left: string, right: string) {
  const fraction = (value: string) => (value.match(/\.(\d+)/)?.[1] ?? '').padEnd(6, '0')
  return Number.isFinite(Date.parse(left)) && Date.parse(left) === Date.parse(right) && fraction(left) === fraction(right)
}

function receiptFor(value: unknown, record: RegistrationRecord) {
  const parsed = workerRegistrationCommandReceiptSchema.safeParse(value)
  if (!parsed.success || parsed.data.worker_id !== record.ownerId
    || parsed.data.client_request_id !== record.command.client_request_id
    || !sameRevision(parsed.data.draft_updated_at, record.command.expected_draft_updated_at)) {
    throw new Error('REGISTRATION_RECEIPT_INVALID')
  }
  return parsed.data
}

async function readRecord(owner: string): Promise<RegistrationRecord | null> {
  const raw = await storage(owner, () => AsyncStorage.getItem(key(owner)))
  if (raw === null) return null
  if (raw.length > 4_096) throw new Error('REGISTRATION_RECORD_INVALID')
  const value = JSON.parse(raw)
  if (!value || value.version !== 1 || value.ownerId !== owner
    || Object.keys(value).sort().join(',') !== 'command,ownerId,receipt,version') {
    throw new Error('REGISTRATION_RECORD_INVALID')
  }
  const command = workerRegistrationCommandSchema.parse(value.command)
  const record: RegistrationRecord = { version: 1, ownerId: owner, command, receipt: null }
  if (value.receipt !== null) record.receipt = receiptFor(value.receipt, record)
  return record
}

async function writeRecord(record: RegistrationRecord) {
  await storage(record.ownerId, () => AsyncStorage.setItem(key(record.ownerId), JSON.stringify(record)))
}

export function createWorkerRegistrationRecovery({ ownerId, accessToken, isCurrent, onChange }: {
  ownerId: string
  accessToken: string
  isCurrent: () => boolean
  onChange: (view: WorkerRegistrationRecoveryView) => void
}) {
  let busy = false
  let replayAttempts = 0
  const current = () => OWNER_ID.test(ownerId) && Boolean(accessToken.trim()) && isCurrent()
  const report = (phase: WorkerRegistrationRecoveryView['phase'], receipt: WorkerRegistrationCommandReceipt | null = null) => {
    if (current()) onChange({ phase, receipt })
  }
  const run = async (action: () => Promise<boolean>) => {
    if (!current() || busy) return false
    busy = true
    try {
      return await serialize(ownerTasks, ownerId, async () => current() ? action() : false)
    } catch {
      report('storage_error')
      return false
    } finally { busy = false }
  }

  const resolve = async (record: RegistrationRecord, readFirst: boolean) => {
    if (record.receipt) {
      report(record.receipt.outcome, record.receipt)
      return record.receipt.outcome === 'submitted'
    }
    report('reconciling')
    if (!current()) return false
    try {
      let response = readFirst
        ? await workerService.getRegistrationCommand(record.command.client_request_id, accessToken)
        : await workerService.submitRegistrationCommand(record.command, accessToken)
      if (!current()) return false
      if (readFirst && response.success && response.data.state === 'unknown'
        && response.data.client_request_id === record.command.client_request_id && replayAttempts < 2) {
        // Replay only the persisted explicit consent; never create an intent during recovery.
        replayAttempts += 1
        response = await workerService.submitRegistrationCommand(record.command, accessToken)
      }
      if (!current()) return false
      if (!response.success || response.data.state !== 'resolved') {
        report('unknown')
        return false
      }
      const receipt = receiptFor(response.data.receipt, record)
      await writeRecord({ ...record, receipt })
      report(receipt.outcome, receipt)
      return receipt.outcome === 'submitted'
    } catch {
      report('unknown')
      return false
    }
  }

  const saveDraft = async (input: WorkerRegistrationDraftInput) => {
    if (!current() || busy) return false
    try {
      return await serialize(ownerTasks, ownerId, async () => {
        if (!current()) return false
        const record = await readRecord(ownerId)
        if (!current()) return false
        if (record && !record.receipt) { report('unknown'); return false }
        const result = await workerService.saveRegistrationDraft(input, accessToken)
        return current() && result.success && result.data.worker_id === ownerId
      })
    } catch { return false }
  }

  const submit = (input: WorkerRegistrationDraftInput) => run(async () => {
    const prior = await readRecord(ownerId)
    if (!current()) return false
    if (prior && !prior.receipt) return resolve(prior, true)
    report('saving')
    let saved: Awaited<ReturnType<typeof workerService.saveRegistrationDraft>>
    try {
      saved = await workerService.saveRegistrationDraft(input, accessToken)
    } catch {
      report('draft_error')
      return false
    }
    if (!current()) return false
    if (!saved.success || saved.data.worker_id !== ownerId
      || !['draft', 'rejected'].includes(saved.data.verification_status)) {
      report('draft_error')
      return false
    }
    const command = workerRegistrationCommandSchema.safeParse({
      client_request_id: generateClientRequestId(), expected_draft_updated_at: saved.data.updated_at,
    })
    if (!command.success) { report('draft_error'); return false }
    const record: RegistrationRecord = { version: 1, ownerId, command: command.data, receipt: null }
    await writeRecord(record)
    if (!current()) return false
    return resolve(record, false)
  })

  const reconcile = (explicitRetry = false) => run(async () => {
    if (explicitRetry) replayAttempts = 0
    const record = await readRecord(ownerId)
    if (!current()) return false
    if (!record) { report('idle'); return false }
    return resolve(record, true)
  })

  return { saveDraft, submit, reconcile }
}
