import { act, renderHook, waitFor } from '@testing-library/react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRfqPrice } from '../frontend-workflow/use-rfq-price'
import { type PillarManifest } from '@/__tests__/pillar-manifest'

export const PILLAR = {
  id: 'P179-rfq-price-mobile-recovery',
  invariant: 'Price consent persists before send and remains bound to the originating actor and job across retry and relaunch',
  authority: ['governance/RULES.md #4', 'governance/RULES.md #7'],
  target: 'apps/mobile/lib/frontend-workflow/use-rfq-price.ts',
  layer: 'integration',
  siblings: ['P178-rfq-price-public-contract'],
  mutation: 'Generate a new proposal ID after a transport failure; retry duplicates the unknown command',
} as const satisfies PillarManifest
const JOB = 'e1790000-0000-4000-8000-000000000001'
const CUSTOMER = 'e1790000-0000-4000-8000-000000000002'
const WORKER = 'e1790000-0000-4000-8000-000000000003'
const mockLoad = jest.fn()
const mockExecute = jest.fn()
jest.mock('../services/rfq-price', () => ({ rfqPriceService: {
  load: (...args: unknown[]) => mockLoad(...args), execute: (...args: unknown[]) => mockExecute(...args),
} }))
const proposal = { id: 'e1790000-0000-4000-8000-000000000004', job_id: JOB,
  worker_id: WORKER, customer_id: CUSTOMER, quote_mode: 'rfq' as const,
  scope_summary: 'Thay đầu nối sau khảo sát, gồm công và vật tư.', customer_total: 220000,
  currency: 'VND' as const, status: 'pending' as const, created_at: '2026-09-13T00:00:00Z', decided_at: null }
function success<T>(data: T) { return { success: true, data, status: 200 } }
function setup(role: 'worker' | 'customer' = 'worker') {
  return renderHook<ReturnType<typeof useRfqPrice>, { ownerId: string }>(({ ownerId }) => useRfqPrice({ jobId: JOB, ownerId, role, token: ownerId + '-token',
    language: 'vi', onChanged: jest.fn() }), { initialProps: { ownerId: role === 'worker' ? WORKER : CUSTOMER } })
}
beforeEach(async () => {
  jest.clearAllMocks()
  await AsyncStorage.clear()
  mockLoad.mockResolvedValue(success({ job_id: JOB, quote_mode: 'rfq', proposal: null }))
  mockExecute.mockImplementation(async command => success({ ...proposal, id: command.input?.request_id ?? command.proposal.id,
    ...(command.kind === 'decide' ? { status: command.approve ? 'approved' : 'rejected', decided_at: '2026-09-13T00:01:00Z' } : {}) }))
})
it('persists exactly one Worker command before sending and serializes double taps', async () => {
  const view = setup()
  await waitFor(() => expect(view.result.current.loaded).toBe(true))
  mockExecute.mockImplementationOnce(async command => {
    const keys = await AsyncStorage.getAllKeys()
    const saved = JSON.parse((await AsyncStorage.getItem(keys.find(key => key.includes('rfq-price'))!))!)
    expect(saved).toEqual(command)
    return success({ ...proposal, id: command.input.request_id })
  })
  await act(async () => { await Promise.all([
    view.result.current.propose(220000, proposal.scope_summary), view.result.current.propose(220000, proposal.scope_summary),
  ]) })
  expect(mockExecute).toHaveBeenCalledTimes(1)
  expect(view.result.current.proposal?.status).toBe('pending')
})
it('recovers an unknown command after relaunch with the same intent, actor and token', async () => {
  const first = setup()
  await waitFor(() => expect(first.result.current.loaded).toBe(true))
  mockExecute.mockResolvedValueOnce({ success: false, code: 'TIMEOUT', error: '', status: 0 })
  await act(async () => { await first.result.current.propose(220000, proposal.scope_summary) })
  expect(first.result.current.pending).toBe(true)
  const command = mockExecute.mock.calls[0][0]
  first.unmount()
  const second = setup()
  await waitFor(() => expect(mockExecute).toHaveBeenCalledTimes(2))
  expect(mockExecute.mock.calls[1]).toEqual([command, WORKER + '-token'])
  await waitFor(() => expect(second.result.current.pending).toBe(false))
})
it('never sends when durable storage fails', async () => {
  const view = setup()
  await waitFor(() => expect(view.result.current.loaded).toBe(true))
  jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'))
  await act(async () => { await view.result.current.propose(220000, proposal.scope_summary) })
  expect(mockExecute).not.toHaveBeenCalled()
  expect(view.result.current.error).toContain('thiết bị')
})
it('rejects retired callbacks after the actor switches', async () => {
  const view = setup()
  await waitFor(() => expect(view.result.current.loaded).toBe(true))
  const retired = view.result.current.propose
  view.rerender({ ownerId: CUSTOMER })
  await act(async () => { await retired(220000, proposal.scope_summary) })
  expect(mockExecute).not.toHaveBeenCalled()
})
it('does not let the Customer reverse an unresolved decision', async () => {
  mockLoad.mockResolvedValue(success({ job_id: JOB, quote_mode: 'rfq', proposal }))
  const view = setup('customer')
  await waitFor(() => expect(view.result.current.proposal?.id).toBe(proposal.id))
  mockExecute.mockResolvedValueOnce({ success: false, code: 'RFQ_PRICE_OUTCOME_UNKNOWN', error: '', status: 503 })
  await act(async () => { await view.result.current.decide(true) })
  await act(async () => { await view.result.current.decide(false) })
  expect(mockExecute).toHaveBeenCalledTimes(1)
  expect(mockExecute.mock.calls[0][0]).toMatchObject({ kind: 'decide', approve: true, proposal })
  expect(view.result.current.pending).toBe(true)
})
