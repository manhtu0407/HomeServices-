import { fireEvent, render } from '@testing-library/react-native'

import { WorkerCandidateReviewCard } from '../kael-chat/worker-candidate-review-card'
import { getCustomerThemeTokens } from '../customer-theme'

const tokens = getCustomerThemeTokens('light')

it('shows only real candidate facts and keeps the address locked until confirmation', () => {
  const onConfirm = jest.fn()
  const onReject = jest.fn()
  const onToggleFavorite = jest.fn()
  const view = render(
    <WorkerCandidateReviewCard
      busy={false}
      candidate={{
        avatar_url: null,
        candidate_id: 'candidate-1',
        customer_decided_at: null,
        display_name: 'Nguyễn An',
        expires_at: '2026-07-11T01:10:00.000Z',
        is_favorite: true,
        proposed_at: '2026-07-11T01:00:00.000Z',
        rating: null,
        status: 'proposed',
        total_jobs: 0,
        verification_status: 'approved',
        worker_id: 'worker-1',
        years_experience: 0,
      }}
      error={null}
      language="vi"
      onConfirm={onConfirm}
      onReject={onReject}
      onRetry={jest.fn()}
      onToggleFavorite={onToggleFavorite}
      tokens={tokens}
    />,
  )

  expect(view.getByText('Nguyễn An')).toBeTruthy()
  expect(view.getByTestId('customer-v21-worker-candidate-favorite')).toBeTruthy()
  expect(view.getByText('Địa chỉ chi tiết vẫn được khóa cho tới khi bạn chọn thợ này.')).toBeTruthy()
  expect(view.queryByText('0')).toBeNull()
  expect(view.queryByText('--')).toBeNull()
  fireEvent.press(view.getByTestId('customer-v21-worker-candidate-confirm'))
  fireEvent.press(view.getByTestId('customer-v21-worker-candidate-reject'))
  fireEvent.press(view.getByTestId('customer-v21-worker-candidate-favorite-toggle'))
  expect(onConfirm).toHaveBeenCalledTimes(1)
  expect(onReject).toHaveBeenCalledTimes(1)
  expect(onToggleFavorite).toHaveBeenCalledWith(false)
})
