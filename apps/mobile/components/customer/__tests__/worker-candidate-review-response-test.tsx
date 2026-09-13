import { fireEvent, render } from '@testing-library/react-native'

import { WorkerCandidateReviewResponse } from '../kael-chat/worker-candidate-review-response'
import { getCustomerThemeTokens } from '../customer-theme'

const tokens = getCustomerThemeTokens('light')
const originalScopePriceQuote = {
  schema_version: 'original_scope_price_quote.v1' as const,
  quote_id: 'a1510000-0000-4000-8000-000000000001',
  reference_price_min: 300000,
  reference_price_max: 500000,
  customer_total: 400000,
  platform_fee: 40000,
  worker_net: 360000,
  commission_level: 1,
  commission_rate_bps: 1000,
  price_source: 'baseline_with_market',
  selection_rule: 'verified_neutral_midpoint_with_bilateral_confirmation' as const,
  worker_confirmation_required: true as const,
  customer_confirmation_required: true as const,
  worker_confirmed_at: '2026-07-11T01:01:00.000Z',
  expires_at: '2026-07-11T01:10:00.000Z',
  evidence_summary: {
    confidence: 'high' as const,
    baseline_source_count: 2,
    market_source_count: 2,
    high_trust_source_count: 1,
    quorum_met: true as const,
    cap_statement: 'Current scope only.',
  },
}

it('places the real worker avatar before the name and shows only available personal facts', () => {
  const view = render(
    <WorkerCandidateReviewResponse
      busy={false}
      candidate={{
        avatar_url: 'https://storage.example.test/worker-avatar.webp',
        birth_year: 1990,
        candidate_id: 'candidate-avatar',
        original_scope_price_quote: originalScopePriceQuote,
        worker_proposal: null,
        customer_decided_at: null,
        display_name: 'Nguyễn An',
        expires_at: null,
        gender: 'male',
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
      onConfirm={jest.fn()}
      onReject={jest.fn()}
      onRetry={jest.fn()}
      onRetrySavedWorkers={jest.fn()}
      onToggleFavorite={jest.fn()}
      savedWorkers={[]}
      savedWorkersStatus="ready"
      tokens={tokens}
    />,
  )

  expect(view.getByTestId('customer-v21-worker-candidate-identity')).toBeTruthy()
  expect(view.getByTestId('customer-v21-worker-candidate-avatar').props.source).toEqual([{
    uri: 'https://storage.example.test/worker-avatar.webp',
  }])
  expect(view.getByText('Nguyễn An')).toBeTruthy()
  expect(view.getByText('Sinh năm 1990 · Nam')).toBeTruthy()
  expect(view.getByTestId('customer-v21-worker-candidate-price-receipt')).toBeTruthy()
  expect(view.getByText('400.000đ')).toBeTruthy()
  expect(view.getByText('40.000đ · 10%')).toBeTruthy()
  expect(view.getByText('360.000đ')).toBeTruthy()
  expect(view.getByText('300.000đ – 500.000đ')).toBeTruthy()
  expect(view.getByText(/2 nguồn giá nền.*2 nguồn thị trường.*độ tin cậy cao/)).toBeTruthy()
})

it('fails closed when a proposed candidate has no worker-confirmed price receipt', () => {
  const onConfirm = jest.fn()
  const view = render(
    <WorkerCandidateReviewResponse
      busy={false}
      candidate={{
        avatar_url: null,
        candidate_id: 'candidate-no-price',
        customer_decided_at: null,
        display_name: 'Nguyễn An',
        expires_at: '2026-07-11T01:10:00.000Z',
        is_favorite: false,
        original_scope_price_quote: null,
        worker_proposal: null,
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
      onRetrySavedWorkers={jest.fn()}
      onToggleFavorite={jest.fn()}
      savedWorkers={[]}
      savedWorkersStatus="ready"
      tokens={tokens}
    />,
  )

  const action = view.getByTestId('customer-v21-worker-candidate-confirm')
  expect(view.getByTestId('customer-v21-worker-candidate-price-blocked')).toBeTruthy()
  expect(view.getByText('Chờ Kael tải giá')).toBeTruthy()
  expect(action.props.accessibilityState.disabled).toBe(true)
  fireEvent.press(action)
  expect(view.queryByTestId('customer-v21-worker-candidate-final-review')).toBeNull()
  expect(onConfirm).not.toHaveBeenCalled()
})

it('lets the customer confirm an RFQ proposal without presenting it as a locked Kael price', () => {
  const onConfirm = jest.fn()
  const view = render(
    <WorkerCandidateReviewResponse
      busy={false}
      candidate={{
        avatar_url: null,
        candidate_id: 'candidate-rfq',
        customer_decided_at: null,
        display_name: 'Nguyễn An',
        expires_at: '2026-07-11T01:10:00.000Z',
        is_favorite: false,
        original_scope_price_quote: null,
        proposed_at: '2026-07-11T01:00:00.000Z',
        rating: null,
        status: 'proposed',
        total_jobs: 0,
        verification_status: 'approved',
        worker_id: 'worker-1',
        worker_proposal: {
          price_max: 260000,
          price_min: 180000,
          proposal_id: 'proposal-rfq',
          scope_summary: 'Khảo sát ổ cắm chập chờn và thay linh kiện nếu được duyệt',
          status: 'proposed',
        },
        years_experience: 2,
      }}
      error={null}
      language="vi"
      onConfirm={onConfirm}
      onReject={jest.fn()}
      onRetry={jest.fn()}
      onRetrySavedWorkers={jest.fn()}
      onToggleFavorite={jest.fn()}
      savedWorkers={[]}
      savedWorkersStatus="ready"
      tokens={tokens}
    />,
  )

  expect(view.getByTestId('customer-v21-worker-candidate-rfq-proposal')).toBeTruthy()
  expect(view.getByText('180.000đ – 260.000đ')).toBeTruthy()
  expect(view.getByText(/chưa phải giá cuối đã khóa/)).toBeTruthy()
  expect(view.queryByTestId('customer-v21-worker-candidate-price-receipt')).toBeNull()
  expect(view.queryByTestId('customer-v21-worker-candidate-price-blocked')).toBeNull()
  fireEvent.press(view.getByTestId('customer-v21-worker-candidate-confirm'))
  expect(view.getByText(/mọi báo giá hoặc thay đổi vẫn cần bạn duyệt/)).toBeTruthy()
  fireEvent.press(view.getByTestId('customer-v21-worker-candidate-final-confirm'))
  expect(onConfirm).toHaveBeenCalledTimes(1)
})

it('lets the customer select an inspection worker without inventing a repair price', () => {
  const onConfirm = jest.fn()
  const view = render(
    <WorkerCandidateReviewResponse
      busy={false}
      candidate={{
        avatar_url: null,
        candidate_id: 'candidate-inspection',
        customer_decided_at: null,
        display_name: 'Nguyen An',
        expires_at: '2026-07-11T01:10:00.000Z',
        is_favorite: false,
        original_scope_price_quote: null,
        proposed_at: '2026-07-11T01:00:00.000Z',
        rating: null,
        status: 'proposed',
        total_jobs: 0,
        verification_status: 'approved',
        worker_id: 'worker-1',
        worker_proposal: {
          price_max: null,
          price_min: null,
          proposal_id: 'proposal-inspection',
          scope_summary: 'Inspect the indoor unit and confirm the repair scope',
          status: 'proposed',
        },
        years_experience: 2,
      }}
      error={null}
      language="en"
      onConfirm={onConfirm}
      onReject={jest.fn()}
      onRetry={jest.fn()}
      onRetrySavedWorkers={jest.fn()}
      onToggleFavorite={jest.fn()}
      savedWorkers={[]}
      savedWorkersStatus="ready"
      tokens={tokens}
    />,
  )

  expect(view.getByTestId('customer-v21-worker-candidate-inspection-proposal')).toBeTruthy()
  expect(view.getByText(/There is no repair price at this step/)).toBeTruthy()
  expect(view.queryByText(/đ/)).toBeNull()
  fireEvent.press(view.getByTestId('customer-v21-worker-candidate-confirm'))
  expect(view.getByText(/not confirming a repair price or scope/)).toBeTruthy()
  fireEvent.press(view.getByTestId('customer-v21-worker-candidate-final-confirm'))
  expect(onConfirm).toHaveBeenCalledTimes(1)
})

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
        original_scope_price_quote: originalScopePriceQuote,
        worker_proposal: null,
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

it.each([false, true])('does not advertise the retired direct-payment rail when legacy availability is %s', (availability) => {
  const view = render(
    <WorkerCandidateReviewResponse
      busy={false}
      candidate={{
        avatar_url: null,
        candidate_id: 'candidate-1',
        original_scope_price_quote: originalScopePriceQuote,
        worker_proposal: null,
        customer_decided_at: null,
        direct_payment_available: availability,
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
      onConfirm={jest.fn()}
      onReject={jest.fn()}
      onRetry={jest.fn()}
      onRetrySavedWorkers={jest.fn()}
      onToggleFavorite={jest.fn()}
      savedWorkers={[]}
      savedWorkersStatus="ready"
      tokens={tokens}
    />,
  )

  expect(view.queryByTestId('customer-v21-worker-candidate-payment-direct-available')).toBeNull()
  expect(view.queryByTestId('customer-v21-worker-candidate-payment-direct-unavailable')).toBeNull()
  expect(view.queryByText(/trả trực tiếp/i)).toBeNull()
})

it('opens a final review with saved workers before confirming the candidate', () => {
  const onConfirm = jest.fn()
  const view = render(
    <WorkerCandidateReviewResponse
      busy={false}
      candidate={{
        avatar_url: null,
        candidate_id: 'candidate-1',
        original_scope_price_quote: originalScopePriceQuote,
        worker_proposal: null,
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
        original_scope_price_quote: originalScopePriceQuote,
        worker_proposal: null,
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
