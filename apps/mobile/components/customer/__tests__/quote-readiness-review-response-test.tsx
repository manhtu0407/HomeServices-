import { render, screen } from '@testing-library/react-native'

import { getCustomerThemeTokens } from '../customer-theme'
import { QuoteReadinessReviewResponse } from '../kael-chat/quote-readiness-review-response'

describe('QuoteReadinessReviewResponse', () => {
  it('renders a safety hold through the content-first Kael response anatomy', () => {
    render(
      <QuoteReadinessReviewResponse
        language="vi"
        reduceMotion
        safetyMessages={['Cần ngắt nguồn điện trước khi tiếp tục.']}
        tokens={getCustomerThemeTokens('light')}
      />,
    )

    expect(screen.getByTestId('customer-v21-quote-readiness-review')).toBeOnTheScreen()
    expect(screen.getByText('Cần xử lý an toàn trước')).toBeOnTheScreen()
    expect(screen.getByText('Cần ngắt nguồn điện trước khi tiếp tục.')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-quote-readiness-review-card')).not.toBeOnTheScreen()
  })

  it('keeps the non-safety review explanation localized', () => {
    render(
      <QuoteReadinessReviewResponse
        language="en"
        reason="missing_profile_fact:wall_surface_or_substrate"
        reduceMotion
        tokens={getCustomerThemeTokens('light')}
      />,
    )

    expect(screen.getByText('Quote requires review')).toBeOnTheScreen()
    expect(screen.getByText(/no worker search or payment has started/i)).toBeOnTheScreen()
  })
})
