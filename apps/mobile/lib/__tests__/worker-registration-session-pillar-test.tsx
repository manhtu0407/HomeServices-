import { act, renderHook, waitFor } from '@testing-library/react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { AppState } from 'react-native'
import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { useWorkerRegistrationActions } from '../frontend-workflow/use-worker-registration-actions'

const mockSave = jest.fn()
const mockSubmit = jest.fn()
const mockGet = jest.fn()
jest.mock('../services', () => ({ workerService: {
  saveRegistrationDraft: (...args: unknown[]) => mockSave(...args),
  submitRegistrationCommand: (...args: unknown[]) => mockSubmit(...args),
  getRegistrationCommand: (...args: unknown[]) => mockGet(...args),
} }))

export const PILLAR = {
  id: 'P169-worker-registration-session',
  invariant: 'Mounted Worker registration actions reconcile durable receipts after relaunch and retire old-session mutations and UI updates on account switch',
  authority: ['governance/RULES.md #8', 'governance/structures/worker-workflow.md B0'],
  target: 'apps/mobile/lib/frontend-workflow/use-worker-registration-actions.ts',
  layer: 'integration',
  siblings: ['P168-worker-registration-recovery', 'P163-worker-registration-draft-gate'],
  mutation: 'leave the old session active on cleanup; resolving its delayed draft save POSTs after account switch',
} as const satisfies PillarManifest

const OWNER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const REVISION = '2026-09-09T01:00:00.123456Z'
const failure = { success: false, status: 0, code: 'NETWORK_ERROR', error: 'unavailable' }
const refresh = jest.fn(async () => true)

function setup(owner = OWNER) {
  return renderHook<ReturnType<typeof useWorkerRegistrationActions>, { id: string }>(({ id }) => useWorkerRegistrationActions({ ownerId: id, accessToken: `token:${id}`, refresh }), {
    initialProps: { id: owner },
  })
}

beforeEach(async () => {
  jest.clearAllMocks()
  await AsyncStorage.clear()
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'background' })
  mockSave.mockResolvedValue({ success: true, data: { worker_id: OWNER, verification_status: 'draft', updated_at: REVISION } })
  mockSubmit.mockResolvedValue(failure)
  mockGet.mockResolvedValue(failure)
})

it('retires an in-flight draft and stale callback when the account switches', async () => {
  let resolve!: (value: unknown) => void
  mockSave.mockReturnValueOnce(new Promise(done => { resolve = done }))
  const view = setup()
  const retired = view.result.current
  let submitted!: Promise<boolean>
  act(() => { submitted = retired.workerSubmitRegistration({ legal_name: 'Fixture' }) })
  await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1))
  view.rerender({ id: OTHER })
  await act(async () => {
    resolve({ success: true, data: { worker_id: OWNER, verification_status: 'draft', updated_at: REVISION } })
    await submitted
    await retired.workerSubmitRegistration({ legal_name: 'Retired' })
  })
  withPillarContext(PILLAR, () => {
    expect(mockSubmit).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
    expect(view.result.current.workerRegistrationRecovery.phase).toBe('idle')
  }, 'the old token and delayed callback cannot mutate or update the new account')
  view.unmount()
})

it('restores a submitted receipt on relaunch without a second submission', async () => {
  const first = setup()
  await act(async () => { await first.result.current.workerSubmitRegistration({ legal_name: 'Fixture' }) })
  expect(first.result.current.workerRegistrationRecovery.phase).toBe('unknown')
  const command = mockSubmit.mock.calls[0][0]
  first.unmount()
  mockGet.mockResolvedValue({ success: true, data: { state: 'resolved', receipt: {
    operation_id: '33333333-3333-4333-8333-333333333333', worker_id: OWNER,
    client_request_id: command.client_request_id, draft_updated_at: REVISION,
    recorded_at: REVISION, submitted_at: REVISION, outcome: 'submitted', verification_status: 'submitted', error_code: null,
  } } })
  Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' })
  const restarted = setup()
  await waitFor(() => expect(restarted.result.current.workerRegistrationRecovery.phase).toBe('submitted'))
  withPillarContext(PILLAR, () => {
    expect(mockSubmit).toHaveBeenCalledTimes(1)
    expect(mockSave).toHaveBeenCalledTimes(1)
    expect(mockGet).toHaveBeenCalledWith(command.client_request_id, `token:${OWNER}`)
    expect(refresh).toHaveBeenCalledTimes(1)
  }, 'rehydration reads the receipt and refreshes profile instead of reapplying the form')
  restarted.unmount()
})
