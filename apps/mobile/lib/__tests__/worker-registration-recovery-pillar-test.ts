import AsyncStorage from '@react-native-async-storage/async-storage'
import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { createWorkerRegistrationRecovery } from '../frontend-workflow/worker-registration-recovery'

const mockSave = jest.fn()
const mockSubmit = jest.fn()
const mockGet = jest.fn()
jest.mock('../services', () => ({ workerService: {
  saveRegistrationDraft: (...args: unknown[]) => mockSave(...args),
  submitRegistrationCommand: (...args: unknown[]) => mockSubmit(...args),
  getRegistrationCommand: (...args: unknown[]) => mockGet(...args),
} }))

export const PILLAR = {
  id: 'P168-worker-registration-recovery',
  invariant: 'Worker submission persists only an actor-bound opaque command before POST and reconciles the same consent after transport failure without replaying KYC data',
  authority: ['governance/RULES.md #8', 'governance/RULES.md #9', 'governance/structures/worker-workflow.md B0'],
  target: 'apps/mobile/lib/frontend-workflow/worker-registration-recovery.ts',
  layer: 'security-negative',
  siblings: ['P163-worker-registration-draft-gate', 'P167-worker-registration-command-http'],
  mutation: 'make saveDraft acquire the submission mutex; the earlier-draft ordering assertion fails because Submit never reaches the server',
} as const satisfies PillarManifest

const OWNER = '11111111-1111-4111-8111-111111111111'
const REVISION = '2026-09-09T01:00:00.123456+00:00'
const failure = { success: false, status: 0, code: 'NETWORK_ERROR', error: 'unavailable' }
const draft = { legal_name: 'Fixture worker', bank_name: 'Fixture bank', bank_account: '123456789' }

beforeEach(async () => {
  jest.clearAllMocks()
  await AsyncStorage.clear()
  mockSave.mockResolvedValue({ success: true, data: { worker_id: OWNER, verification_status: 'draft', updated_at: REVISION } })
  mockSubmit.mockResolvedValue(failure)
  mockGet.mockResolvedValue(failure)
})

it('joins earlier draft writes before choosing the submitted revision', async () => {
  let finish!: (value: unknown) => void
  const deferred = new Promise(resolve => { finish = resolve })
  mockSave.mockReturnValueOnce(deferred)
  const recovery = createWorkerRegistrationRecovery({ ownerId: OWNER, accessToken: 'bound-token', isCurrent: () => true, onChange: jest.fn() })
  const saving = recovery.saveDraft({ legal_name: 'Earlier draft' })
  await Promise.resolve()
  const submitting = recovery.submit(draft)
  finish({ success: true, data: { worker_id: OWNER, verification_status: 'draft', updated_at: REVISION } })
  await saving
  await submitting
  expect(mockSave).toHaveBeenCalledTimes(2)
  expect(mockSave).toHaveBeenLastCalledWith(draft, 'bound-token')
  expect(mockSubmit).toHaveBeenCalledTimes(1)
})

it('refuses a retired actor before any request or storage write', async () => {
  const retired = createWorkerRegistrationRecovery({ ownerId: OWNER, accessToken: 'old-token', isCurrent: () => false, onChange: jest.fn() })
  await retired.saveDraft(draft)
  await retired.submit(draft)
  await retired.reconcile()
  expect(mockSave).not.toHaveBeenCalled()
  expect(mockSubmit).not.toHaveBeenCalled()
  expect(mockGet).not.toHaveBeenCalled()
  expect(await AsyncStorage.getAllKeys()).toEqual([])
})

it('does not submit after the initiating account retires during draft saving', async () => {
  let active = true
  const changed = jest.fn()
  mockSave.mockImplementationOnce(async () => {
    active = false
    return { success: true, data: { worker_id: OWNER, verification_status: 'draft', updated_at: REVISION } }
  })
  const recovery = createWorkerRegistrationRecovery({ ownerId: OWNER, accessToken: 'old-token', isCurrent: () => active, onChange: changed })
  await recovery.submit(draft)
  expect(mockSubmit).not.toHaveBeenCalled()
  expect(await AsyncStorage.getAllKeys()).toEqual([])
  expect(changed).toHaveBeenCalledTimes(1)
})

it('never POSTs when durable storage rejects the command', async () => {
  jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('disk full'))
  const changed = jest.fn()
  const recovery = createWorkerRegistrationRecovery({ ownerId: OWNER, accessToken: 'token', isCurrent: () => true, onChange: changed })
  await recovery.submit(draft)
  expect(mockSubmit).not.toHaveBeenCalled()
  expect(changed).toHaveBeenLastCalledWith({ phase: 'storage_error', receipt: null })
})

it.each(['transport', 'revision'] as const)('keeps a %s draft-save failure distinct from local journal failure and safely retryable', async (failureKind) => {
  if (failureKind === 'transport') mockSave.mockRejectedValueOnce(new Error('network unavailable'))
  else mockSave.mockResolvedValueOnce({ success: true, data: { worker_id: OWNER, verification_status: 'draft', updated_at: 'invalid' } })
  const changed = jest.fn()
  const recovery = createWorkerRegistrationRecovery({ ownerId: OWNER, accessToken: 'token', isCurrent: () => true, onChange: changed })
  expect(await recovery.submit(draft)).toBe(false)
  expect(changed).toHaveBeenLastCalledWith({ phase: 'draft_error', receipt: null })
  expect(mockSubmit).not.toHaveBeenCalled()
  expect(await AsyncStorage.getAllKeys()).toEqual([])
  await recovery.submit(draft)
  expect(mockSubmit).toHaveBeenCalledTimes(1)
  expect(changed).toHaveBeenLastCalledWith({ phase: 'unknown', receipt: null })
})

it('rejects a foreign receipt and keeps the original command for reconciliation', async () => {
  const changed = jest.fn()
  const recovery = createWorkerRegistrationRecovery({ ownerId: OWNER, accessToken: 'token', isCurrent: () => true, onChange: changed })
  mockSubmit.mockImplementation(async (command) => ({ success: true, data: { state: 'resolved', receipt: {
    operation_id: '22222222-2222-4222-8222-222222222222', worker_id: '33333333-3333-4333-8333-333333333333',
    client_request_id: command.client_request_id, draft_updated_at: REVISION,
    recorded_at: REVISION, submitted_at: REVISION, outcome: 'submitted', verification_status: 'submitted', error_code: null,
  } } }))
  expect(await recovery.submit(draft)).toBe(false)
  expect(changed).toHaveBeenLastCalledWith({ phase: 'unknown', receipt: null })
  const stored = await AsyncStorage.multiGet(await AsyncStorage.getAllKeys())
  expect(JSON.parse(stored[0][1]!).receipt).toBeNull()
})

it('persists only opaque intent before POST and resumes that exact command after restart', async () => {
  const first = createWorkerRegistrationRecovery({ ownerId: OWNER, accessToken: 'first-token', isCurrent: () => true, onChange: jest.fn() })
  mockSubmit.mockImplementationOnce(async (input) => {
    const rows = await AsyncStorage.multiGet(await AsyncStorage.getAllKeys())
    withPillarContext(PILLAR, () => {
      expect(rows).toHaveLength(1)
      expect(JSON.parse(rows[0][1]!)).toEqual({ version: 1, ownerId: OWNER, command: input, receipt: null })
      expect(rows[0][1]).not.toMatch(/Fixture|123456789|first-token|supabase:/)
    }, 'storage acknowledgement precedes the first submission')
    return failure
  })
  expect(await first.submit(draft)).toBe(false)
  const command = mockSubmit.mock.calls[0][0]
  const restarted = createWorkerRegistrationRecovery({ ownerId: OWNER, accessToken: 'restored-token', isCurrent: () => true, onChange: jest.fn() })
  mockGet.mockResolvedValue({ success: true, data: { state: 'unknown', client_request_id: command.client_request_id } })
  await restarted.reconcile()
  withPillarContext(PILLAR, () => {
    expect(mockSave).toHaveBeenCalledTimes(1)
    expect(mockSubmit).toHaveBeenLastCalledWith(command, 'restored-token')
    expect(mockGet).toHaveBeenCalledWith(command.client_request_id, 'restored-token')
  }, 'restart reuses consent and never resends private draft fields')
})

it('bounds POST replay while continuing read-only reconciliation of an unknown outcome', async () => {
  const recovery = createWorkerRegistrationRecovery({ ownerId: OWNER, accessToken: 'token', isCurrent: () => true, onChange: jest.fn() })
  await recovery.submit(draft)
  const command = mockSubmit.mock.calls[0][0]
  mockGet.mockResolvedValue({ success: true, data: { state: 'unknown', client_request_id: command.client_request_id } })
  for (let check = 0; check < 5; check += 1) await recovery.reconcile()
  expect(mockSubmit).toHaveBeenCalledTimes(3)
  expect(mockGet).toHaveBeenCalledTimes(5)
  expect(mockSave).toHaveBeenCalledTimes(1)
  await recovery.reconcile(true)
  expect(mockSubmit).toHaveBeenCalledTimes(4)
  expect(mockSubmit).toHaveBeenLastCalledWith(command, 'token')
})

it('does not overwrite a corrupt or foreign-owner journal with a new consent', async () => {
  const key = `nestscout.worker-registration.v1.${OWNER}`
  const corrupt = JSON.stringify({ version: 1, ownerId: 'another-owner', command: {}, receipt: null })
  await AsyncStorage.setItem(key, corrupt)
  const changed = jest.fn()
  const recovery = createWorkerRegistrationRecovery({ ownerId: OWNER, accessToken: 'token', isCurrent: () => true, onChange: changed })
  await recovery.submit(draft)
  expect(mockSave).not.toHaveBeenCalled()
  expect(mockSubmit).not.toHaveBeenCalled()
  expect(await AsyncStorage.getItem(key)).toBe(corrupt)
  expect(changed).toHaveBeenLastCalledWith({ phase: 'storage_error', receipt: null })
})
