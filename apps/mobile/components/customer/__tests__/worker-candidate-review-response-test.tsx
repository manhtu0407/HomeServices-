import { fireEvent, render } from '@testing-library/react-native'

import { WorkerCandidateReviewResponse } from '../kael-chat/worker-candidate-review-response'
import { getCustomerThemeTokens } from '../customer-theme'

const tokens = getCustomerThemeTokens('light')

it('shows only real candidate facts and keeps the address locked until confirmation', () => {
  const onConfirm = jest.fn()
  const onReject = jest.fn()
  const onToggleFavorite = jest.fn()
  const view = render(
    <WorkerCandidateReviewResponse
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
      onRetrySavedWorkers={jest.fn()}
      onToggleFavorite={onToggleFavorite}
      savedWorkers={[]}
      savedWorkersStatus="ready"
      tokens={tokens}
    />,
  )

  expect(view.getByText('Nguyễn An')).toBeTruthy()
  expect(view.getByTestId('customer-v21-worker-candidate-favorite')).toBeTruthy()
  expect(view.getByText('Địa chỉ chi tiết vẫn được khóa cho tới khi bạn chọn thợ này.')).toBeTruthy()
  expect(view.queryByText('0')).toBeNull()
  expect(view.queryByText('--')).toBeNull()
  fireEvent.press(view.getByTestId('customer-v21-worker-candidate-reject'))
  fireEvent.press(view.getByTestId('customer-v21-worker-candidate-favorite-toggle'))
  fireEvent.press(view.getByTestId('customer-v21-worker-candidate-confirm'))
  expect(onConfirm).not.toHaveBeenCalled()
  expect(view.getByTestId('customer-v21-worker-candidate-saved-empty')).toBeTruthy()
  fireEvent.press(view.getByTestId('customer-v21-worker-candidate-final-confirm'))
  expect(onConfirm).toHaveBeenCalledTimes(1)
  expect(onReject).toHaveBeenCalledTimes(1)
  expect(onToggleFavorite).toHaveBeenCalledWith(false)
})

it('opens a final review with saved workers before confirming the candidate', () => {
  const onConfirm = jest.fn()
  const view = render(
    <WorkerCandidateReviewResponse
      busy={false}
      candidate={{
        avatar_url: null,
        candidate_id: 'candidate-1',
        customer_decided_at: null,
        display_name: 'Nguyễn An',
        expires_at: '2026-07-11T01:10:00.000Z',
        is_favorite: false,
        proposed_at: '2026-07-11T01:00:00.000Z',
        rating: 4.9,
        status: 'proposed',
        total_jobs: 18,
        verification_status: 'approved',
        worker_id: 'worker-1',
        years_experience: 3,
      }}
      error={null}
      language="vi"
      onConfirm={onConfirm}
      onReject={jest.fn()}
      onRetry={jest.fn()}
      onRetrySavedWorkers={jest.fn()}
      onToggleFavorite={jest.fn()}
      savedWorkers={[
        { avatarUrl: null, displayName: 'Chị Lan', id: 'worker-2' },
      ]}
      savedWorkersStatus="ready"
      tokens={tokens}
    />,
  )

  fireEvent.press(view.getByTestId('customer-v21-worker-candidate-confirm'))

  expect(onConfirm).not.toHaveBeenCalled()
  expect(view.getByTestId('customer-v21-worker-candidate-final-review')).toBeTruthy()
  expect(view.getByText('Thợ đã lưu từ Hoạt động')).toBeTruthy()
  expect(view.getByText('Chị Lan')).toBeTruthy()

  fireEvent.press(view.getByTestId('customer-v21-worker-candidate-final-confirm'))
  expect(onConfirm).toHaveBeenCalledTimes(1)
})

it('keeps final confirmation available when saved-worker history cannot load', () => {
  const onConfirm = jest.fn()
  const onRetrySavedWorkers = jest.fn()
  const view = render(
    <WorkerCandidateReviewResponse
      busy={false}
      candidate={{
        avatar_url: null,
        candidate_id: 'candidate-1',
        customer_decided_at: null,
        display_name: 'Nguyễn An',
        expires_at: null,
        is_favorite: false,
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
      onReject={jest.fn()}
      onRetry={jest.fn()}
      onRetrySavedWorkers={onRetrySavedWorkers}
      onToggleFavorite={jest.fn()}
      savedWorkers={[]}
      savedWorkersStatus="error"
      tokens={tokens}
    />,
  )

  fireEvent.press(view.getByTestId('customer-v21-worker-candidate-confirm'))
  expect(view.getByTestId('customer-v21-worker-candidate-saved-error')).toBeTruthy()
  fireEvent.press(view.getByTestId('customer-v21-worker-candidate-saved-retry'))
  expect(onRetrySavedWorkers).toHaveBeenCalledTimes(1)

  fireEvent.press(view.getByTestId('customer-v21-worker-candidate-final-confirm'))
  expect(onConfirm).toHaveBeenCalledTimes(1)
})
