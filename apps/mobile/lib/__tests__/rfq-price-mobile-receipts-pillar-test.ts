import { rfqPriceService, type RfqCommand } from '../services/rfq-price'
import { readRfqCommand, writeRfqCommand } from '../frontend-workflow/rfq-price-recovery'
import { localizeRfqNotification } from '../frontend-workflow/notifications'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { PillarManifest } from '@/__tests__/pillar-manifest'

export const PILLAR = {
  id: 'P181-rfq-price-mobile-receipts',
  invariant: 'The mobile price adapter rejects substituted consent receipts and a late resolution cannot erase newer durable intent',
  authority: ['governance/RULES.md #4', 'governance/RULES.md #7'],
  target: 'apps/mobile/lib/services/rfq-price.ts',
  layer: 'security-negative',
  siblings: ['P178-rfq-price-public-contract', 'P179-rfq-price-mobile-recovery'],
  mutation: 'Accept a different customer_total in the approval response; the displayed approval binds the wrong money',
} as const satisfies PillarManifest
const mockPost = jest.fn(), mockGet = jest.fn()
jest.mock('../api', () => ({ api: { postAuthenticated: (...args: unknown[]) => mockPost(...args),
  getAuthenticated: (...args: unknown[]) => mockGet(...args) }, createClientDiagnosticMetadata: () => ({ supportCode: 'RFQ12345' }) }))
const proposal = { id: 'e1810000-0000-4000-8000-000000000004', job_id: 'e1810000-0000-4000-8000-000000000001',
  worker_id: 'e1810000-0000-4000-8000-000000000003', customer_id: 'e1810000-0000-4000-8000-000000000002',
  quote_mode: 'rfq' as const, scope_summary: 'Replace the fitting with labor included.', customer_total: 220000,
  currency: 'VND' as const, status: 'pending' as const, created_at: '2026-09-13T00:00:00Z', decided_at: null }
const command: RfqCommand = { ownerId: proposal.customer_id, role: 'customer', jobId: proposal.job_id,
  kind: 'decide', proposal, approve: true }
const approved = { ...proposal, status: 'approved', decided_at: '2026-09-13T00:01:00Z' }
beforeEach(async () => { jest.clearAllMocks(); await AsyncStorage.clear() })
it('binds exact Customer decision to the supplied auth token', async () => {
  mockPost.mockResolvedValue({ success: true, status: 200, data: approved })
  expect((await rfqPriceService.execute(command, 'owner-token')).success).toBe(true)
  expect(mockPost).toHaveBeenCalledWith(`/jobs/${proposal.job_id}/rfq-price/decide`, { proposal_id: proposal.id, approve: true }, 'owner-token')
})
it.each([null, proposal, { ...approved, customer_total: 1 }, { ...approved, scope_summary: 'Other scope text.' },
  { ...approved, customer_id: proposal.worker_id }, { ...approved, id: proposal.job_id }, { ...approved, decided_at: null }])(
  'keeps malformed or substituted approval unknown (%j)', async data => {
    mockPost.mockResolvedValue({ success: true, status: 200, data })
    expect(await rfqPriceService.execute(command, 'owner-token')).toMatchObject({ success: false, code: 'RFQ_PRICE_OUTCOME_UNKNOWN' })
  })
it('does not clear a newer intent when a prior response arrives late', async () => {
  await writeRfqCommand(command, command, () => true)
  expect(await writeRfqCommand(command, null, () => true, command)).toBe(true)
  const newer: RfqCommand = { ...command, proposal: { ...proposal, id: 'e1810000-0000-4000-8000-000000000005' } }
  await writeRfqCommand(newer, newer, () => true)
  expect(await writeRfqCommand(command, null, () => true, command)).toBe(false)
  expect(await readRfqCommand(command)).toEqual(newer)
})
it.each(['rfq_price_proposed','rfq_price_approved','rfq_price_rejected'])('localizes %s notifications without trusting raw copy', event_type => {
  const source = { event_type, title: 'Raw Vietnamese text', body: 'Untranslated raw copy' }
  const en = localizeRfqNotification(source, 'en')
  expect(en.title).not.toBe(source.title)
  expect(en.body).not.toBe(source.body)
  expect(en.title + en.body).toMatch(/quote|Quote/)
  expect(localizeRfqNotification(source, 'vi').title).toMatch(/giá/)
})
