import { fireEvent, render } from '@testing-library/react-native'

import { CompletionReviewCard } from '../kael-chat/completion-review-card'
import { getCustomerThemeTokens } from '../customer-theme'
import type { LocalDeal } from '@nestscout/shared'

const deal = {
  completionNotes: 'Đã vệ sinh và chạy thử ổn định.',
  completionPhotoUrls: ['supabase://job-media/job-1/after/photo.jpg'],
} as LocalDeal

it('requires an explicit customer action before completion can advance', () => {
  const onConfirm = jest.fn()
  const onReportIssue = jest.fn()
  const view = render(
    <CompletionReviewCard
      busy={false}
      deal={deal}
      language="vi"
      onConfirm={onConfirm}
      onReportIssue={onReportIssue}
      tokens={getCustomerThemeTokens('light')}
    />,
  )

  expect(view.getByText('Thanh toán chỉ mở sau bước xác nhận này.')).toBeTruthy()
  fireEvent.press(view.getByTestId('customer-v21-completion-confirm'))
  fireEvent.press(view.getByTestId('customer-v21-completion-report-issue'))
  expect(onConfirm).toHaveBeenCalledTimes(1)
  expect(onReportIssue).toHaveBeenCalledTimes(1)
})
