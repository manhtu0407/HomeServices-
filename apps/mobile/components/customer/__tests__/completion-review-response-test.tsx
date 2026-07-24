import { fireEvent, render } from '@testing-library/react-native'

import { CompletionReviewResponse } from '../kael-chat/completion-review-response'
import { getCustomerThemeTokens } from '../customer-theme'
import type { LocalDeal } from '@nestscout/shared'

const deal = {
  completionNotes: 'Đã vệ sinh và chạy thử ổn định.',
  completionPhotoUrls: ['file:///completion-photo.jpg'],
} as LocalDeal

it('requires an explicit customer action before completion can advance', () => {
  const onConfirm = jest.fn()
  const onReportIssue = jest.fn()
  const view = render(
    <CompletionReviewResponse
      busy={false}
      deal={deal}
      language="vi"
      onConfirm={onConfirm}
      onReportIssue={onReportIssue}
      tokens={getCustomerThemeTokens('light')}
    />,
  )

  expect(view.getByText('Thanh toán chỉ mở sau bước xác nhận này.')).toBeTruthy()
  expect(view.getByTestId('customer-completion-after-gallery-image-0').props.contentFit).toBe('contain')
  fireEvent.press(view.getByTestId('customer-completion-after-gallery-tile-0'))
  expect(view.getByTestId('customer-completion-after-gallery-viewer')).toBeTruthy()
  fireEvent.press(view.getByTestId('customer-completion-after-gallery-viewer-close'))
  fireEvent.press(view.getByTestId('customer-v21-completion-confirm'))
  fireEvent.press(view.getByTestId('customer-v21-completion-report-issue'))
  expect(onConfirm).toHaveBeenCalledTimes(1)
  expect(onReportIssue).toHaveBeenCalledTimes(1)
})
