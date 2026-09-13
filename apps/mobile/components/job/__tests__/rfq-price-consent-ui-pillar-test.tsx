import { fireEvent, render } from '@testing-library/react-native'
import { RfqPricePanelView } from '../rfq-price-panel'
import { getCustomerThemeTokens } from '@/components/customer/customer-theme'
import type { useRfqPrice } from '@/lib/frontend-workflow/use-rfq-price'
import type { PillarManifest } from '@/__tests__/pillar-manifest'

export const PILLAR = {
  id: 'P180-rfq-price-consent-ui',
  invariant: 'The RFQ screen shows the exact Worker scope and total and requires an enabled, explicit Customer decision; unknown outcomes disable further consent',
  authority: ['governance/RULES.md #4', 'governance/RULES.md #7'],
  target: 'apps/mobile/components/job/rfq-price-panel.tsx',
  layer: 'ui-visual',
  siblings: ['P179-rfq-price-mobile-recovery'],
  mutation: 'Enable the approval action during reconciliation; pressing it sends a second money decision',
} as const satisfies PillarManifest
const proposal = { id: 'e1800000-0000-4000-8000-000000000004', job_id: 'e1800000-0000-4000-8000-000000000001',
  worker_id: 'e1800000-0000-4000-8000-000000000003', customer_id: 'e1800000-0000-4000-8000-000000000002',
  quote_mode: 'rfq' as const, scope_summary: 'Thay đầu nối, gồm vật tư và công.', customer_total: 220000,
  currency: 'VND' as const, status: 'pending' as const, created_at: '2026-09-13T00:00:00Z', decided_at: null }
function state(extra: Partial<ReturnType<typeof useRfqPrice>> = {}): ReturnType<typeof useRfqPrice> {
  return { loaded: true, busy: false, pending: false, error: null, proposal,
    snapshot: { job_id: proposal.job_id, quote_mode: 'rfq', proposal },
    propose: jest.fn(), decide: jest.fn(), refresh: jest.fn(), ...extra }
}
it.each(['light','dark'] as const)('shows exact human quote and explicit Customer consent in %s mode', mode => {
  const value = state()
  const view = render(<RfqPricePanelView actorRole="customer" language="vi" tokens={getCustomerThemeTokens(mode)} state={value} />)
  expect(view.getByText(proposal.scope_summary)).toBeTruthy()
  expect(view.getByTestId('rfq-exact-total').props.children.join('')).toBe('220.000 VND')
  fireEvent.press(view.getByTestId('rfq-price-approve'))
  expect(value.decide).toHaveBeenCalledWith(true)
  expect(view.queryByTestId('rfq-price-send')).toBeNull()
})
it('blocks further decisions during outcome reconciliation', () => {
  const value = state({ pending: true, error: 'Đang đối soát báo giá.' })
  const view = render(<RfqPricePanelView actorRole="customer" language="vi" tokens={getCustomerThemeTokens('light')} state={value} />)
  expect(view.getByTestId('rfq-price-approve').props.accessibilityState.disabled).toBe(true)
  fireEvent.press(view.getByTestId('rfq-price-approve'))
  fireEvent.press(view.getByTestId('rfq-price-reject'))
  expect(value.decide).not.toHaveBeenCalled()
  fireEvent.press(view.getByTestId('rfq-price-refresh'))
  expect(value.refresh).toHaveBeenCalledTimes(1)
})
it('does not invent a zero quote or allow Worker approval and uses English copy in English mode', () => {
  const value = state({ proposal: null })
  const view = render(<RfqPricePanelView actorRole="worker" language="en" tokens={getCustomerThemeTokens('dark')} state={value} />)
  expect(view.queryByTestId('rfq-exact-total')).toBeNull()
  expect(view.queryByTestId('rfq-price-approve')).toBeNull()
  expect(view.queryByText('Báo giá sau khảo sát')).toBeNull()
  fireEvent.changeText(view.getByTestId('rfq-price-input'), '220000')
  fireEvent.changeText(view.getByTestId('rfq-scope-input'), 'Replace the fitting including labor.')
  fireEvent.press(view.getByTestId('rfq-price-send'))
  expect(value.propose).toHaveBeenCalledWith(220000, 'Replace the fitting including labor.')
})
it('does not silently round or reinterpret a fractional price', () => {
  const value = state({ proposal: null })
  const view = render(<RfqPricePanelView actorRole="worker" language="vi" tokens={getCustomerThemeTokens('light')} state={value} />)
  fireEvent.changeText(view.getByTestId('rfq-price-input'), '22.5')
  fireEvent.press(view.getByTestId('rfq-price-send'))
  expect(value.propose).toHaveBeenCalledWith(NaN, '')
})
it('never offers the RFQ controls for a priced auto-quote', () => {
  const value = state({ proposal: null, snapshot: { job_id: proposal.job_id, quote_mode: 'kael_auto_quote', proposal: null } })
  const view = render(<RfqPricePanelView actorRole="worker" language="vi" tokens={getCustomerThemeTokens('light')} state={value} />)
  expect(view.queryByTestId('rfq-price-panel')).toBeNull()
})
