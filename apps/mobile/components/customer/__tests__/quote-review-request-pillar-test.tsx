import { fireEvent, render, screen } from '@testing-library/react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { getCustomerThemeTokens } from '../customer-theme'
import {
  QuoteReadinessReviewResponse,
  unpricedQuoteRequestKind,
} from '../kael-chat/quote-readiness-review-response'

export const PILLAR = {
  id: 'P375-quote-review-send-request',
  invariant:
    'when the server offers a worker-quote or inspection request with no price, the existing review card carries one send button that states no price is set; it never shows beside an estimate, after confirmation, during a send, or under a safety hold',
  authority: [
    'governance/RULES.md #4 (a worker quotes and the customer approves before work starts)',
    'governance/RULES.md #7 (the customer confirms the request explicitly)',
    'governance/protocols/frontend-test.md G2 (state coverage)',
  ],
  target: 'apps/mobile/components/customer/kael-chat/quote-readiness-review-response.tsx',
  layer: 'ui-visual',
  siblings: ['P365-kael-rfq-fallback-edge', 'P46-stage1-customer-intake-mode', 'P369-kael-work-next-action-chips'],
  mutation:
    'drop the hasEstimate check — the priced case returns a request and turns red; render the button under a safety hold — the safety case turns red',
} as const satisfies PillarManifest

const ready = { canConfirm: true, confirmationKind: 'rfq_request', confirmed: false, hasEstimate: false, processing: false }

describe(`${PILLAR.id}`, () => {
  it('offers the request only for an unpriced request the server allows', () => {
    withPillarContext(PILLAR, () => {
      expect(unpricedQuoteRequestKind(ready)).toBe('rfq_request')
      expect(unpricedQuoteRequestKind({ ...ready, confirmationKind: 'inspection_request' })).toBe('inspection_request')
      expect(unpricedQuoteRequestKind({ ...ready, hasEstimate: true })).toBeNull()
      expect(unpricedQuoteRequestKind({ ...ready, canConfirm: false })).toBeNull()
      expect(unpricedQuoteRequestKind({ ...ready, confirmed: true })).toBeNull()
      expect(unpricedQuoteRequestKind({ ...ready, processing: true })).toBeNull()
      expect(unpricedQuoteRequestKind({ ...ready, confirmationKind: 'priced_offer' })).toBeNull()
    }, 'a priced offer keeps its own estimate card')
  })

  it('sends once from the review card and says no price is set', () => {
    const onSend = jest.fn()
    render(
      <QuoteReadinessReviewResponse
        language="vi"
        reduceMotion
        request={{ busy: false, kind: 'rfq_request', onSend }}
        tokens={getCustomerThemeTokens('light')}
      />,
    )
    expect(screen.getByText('Báo giá cần rà soát')).toBeOnTheScreen()
    expect(screen.getByText(/Chưa có giá ở bước này/)).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('customer-v21-quote-review-send-request'))
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it('names an inspection request in English', () => {
    render(
      <QuoteReadinessReviewResponse
        language="en"
        reduceMotion
        request={{ busy: false, kind: 'inspection_request', onSend: jest.fn() }}
        tokens={getCustomerThemeTokens('light')}
      />,
    )
    expect(screen.getByText('Send inspection request')).toBeOnTheScreen()
    expect(screen.getByText(/No price is set at this step/)).toBeOnTheScreen()
  })

  it('keeps the safety hold without a send button', () => {
    render(
      <QuoteReadinessReviewResponse
        language="vi"
        reduceMotion
        request={{ busy: false, kind: 'rfq_request', onSend: jest.fn() }}
        safetyMessages={['Cần ngắt nguồn điện trước khi tiếp tục.']}
        tokens={getCustomerThemeTokens('light')}
      />,
    )
    withPillarContext(PILLAR, () => {
      expect(screen.queryByTestId('customer-v21-quote-review-send-request')).toBeNull()
    }, 'a safety hold is never sent to workers from this card')
  })
})
