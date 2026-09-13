import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import type { FavoriteWorkerForMatching, MatchingState } from '@nestscout/shared'

import { getCustomerThemeTokens } from '../customer-theme'
import { FindingWorkersReceipt } from '../kael-chat/finding-workers-receipt'

const AVAILABLE_WORKER: FavoriteWorkerForMatching = {
  availability: 'available',
  availability_reason: null,
  avatar_url: null,
  display_name: 'Anh Minh',
  id: '10fe7ac1-78e7-4e8a-9eb2-1a2c5c7b9d10',
  rating: 4.8,
  total_jobs: 32,
}

const UNAVAILABLE_WORKER: FavoriteWorkerForMatching = {
  availability: 'unavailable',
  availability_reason: 'not_available_for_this_request',
  avatar_url: null,
  display_name: 'Chị Lan',
  id: '18d9e50d-8c9e-4f90-a1cc-3a70bbc62d12',
  rating: null,
  total_jobs: 0,
}

function awaitingChoiceState(): MatchingState {
  return {
    batch: null,
    checks: [
      { kind: 'service_capability', state: 'pending' },
      { kind: 'service_area', state: 'pending' },
      { kind: 'availability', state: 'pending' },
    ],
    event_history: [{ kind: 'awaiting_customer_choice', occurred_at: '2026-08-11T08:00:00.000Z' }],
    stage: 'awaiting_choice',
    strategy: 'pending_choice',
  }
}

function renderReceipt(
  matchingState: MatchingState = awaitingChoiceState(),
  options: {
    onChoosePreference?: jest.Mock
    onLoadSavedWorkers?: jest.Mock
    onRetry?: jest.Mock
    onStop?: jest.Mock
  } = {},
) {
  const onChoosePreference = options.onChoosePreference ?? jest.fn(async () => true)
  const onLoadSavedWorkers = options.onLoadSavedWorkers ?? jest.fn(async () => [AVAILABLE_WORKER, UNAVAILABLE_WORKER])
  const onRetry = options.onRetry ?? jest.fn()
  const onStop = options.onStop ?? jest.fn()
  render(
    <FindingWorkersReceipt
      language="vi"
      matchingState={matchingState}
      selectionState={{ jobId: 'test-job', scopeKey: 'test-owner:test-job', ready: true, choice: null }}
      onChoosePreference={onChoosePreference}
      onLoadSavedWorkers={onLoadSavedWorkers}
      onRetry={onRetry}
      onStop={onStop}
      reduceMotion
      tokens={getCustomerThemeTokens('light')}
    />,
  )
  return { onChoosePreference, onLoadSavedWorkers, onRetry, onStop }
}

describe('Finding Workers receipt', () => {
  it('waits for a real customer choice before displaying a saved-worker list or sending a batch', async () => {
    const { onChoosePreference, onLoadSavedWorkers } = renderReceipt()

    expect(screen.getByTestId('customer-v21-finding-workers-choice-actions')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-finding-workers-batch')).toBeNull()
    expect(screen.queryByText(/ETA|queue|score/i)).toBeNull()

    fireEvent.press(screen.getByTestId('customer-v21-finding-workers-saved-open'))
    await waitFor(() => expect(onLoadSavedWorkers).toHaveBeenCalledTimes(1))
    expect(screen.getByTestId(`customer-v21-finding-workers-saved-${AVAILABLE_WORKER.id}`)).toBeOnTheScreen()
    expect(screen.getByTestId(`customer-v21-finding-workers-saved-select-${UNAVAILABLE_WORKER.id}`)).toHaveProp(
      'accessibilityState',
      expect.objectContaining({ disabled: true }),
    )

    fireEvent.press(screen.getByTestId(`customer-v21-finding-workers-saved-select-${AVAILABLE_WORKER.id}`))
    await waitFor(() => expect(onChoosePreference).toHaveBeenCalledWith({
      auto_general: false,
      mode: 'saved_worker_first',
      worker_id: AVAILABLE_WORKER.id,
    }))
  })

  it('uses server-provided batch data and exposes an honest exhausted recovery choice', async () => {
    const onRetry = jest.fn()
    const onStop = jest.fn()
    renderReceipt({
      batch: {
        attempt: 2,
        deadline_at: null,
        recipient_count: 3,
        seconds_remaining: null,
        strategy: 'general',
      },
      checks: [
        { kind: 'service_capability', state: 'verified' },
        { kind: 'service_area', state: 'verified' },
        { kind: 'availability', state: 'verified' },
      ],
      event_history: [
        { kind: 'saved_worker_no_response', occurred_at: '2026-08-11T08:01:00.000Z' },
        { kind: 'search_expanded', occurred_at: '2026-08-11T08:01:01.000Z', recipient_count: 3 },
        { kind: 'no_worker_found', occurred_at: '2026-08-11T08:02:00.000Z' },
      ],
      stage: 'exhausted',
      strategy: 'saved_worker_first',
    }, { onRetry, onStop })

    expect(screen.getByTestId('customer-v21-finding-workers-batch')).toHaveTextContent(/3/)
    expect(screen.getByTestId('customer-v21-finding-workers-exhausted-actions')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('customer-v21-finding-workers-exhausted-retry'))
    await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1))
    fireEvent.press(screen.getByTestId('customer-v21-finding-workers-stop'))

    await waitFor(() => {
      expect(onStop).toHaveBeenCalledTimes(1)
    })
  })

  it('offers a safe retry when a worker request could not be confirmed', async () => {
    const onRetry = jest.fn()
    renderReceipt({
      batch: null,
      checks: [
        { kind: 'service_capability', state: 'verified' },
        { kind: 'service_area', state: 'verified' },
        { kind: 'availability', state: 'verified' },
      ],
      event_history: [{ kind: 'matching_recovery_required', occurred_at: '2026-08-11T08:02:00.000Z' }],
      stage: 'recovery_required',
      strategy: 'saved_worker_first',
    }, { onRetry })

    expect(screen.getByTestId('customer-v21-finding-workers-exhausted-actions')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('customer-v21-finding-workers-exhausted-retry'))
    await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1))
  })

  it('shows loading, retryable failure, and an empty saved-worker list without inventing a worker', async () => {
    let resolveFirstLoad!: (workers: FavoriteWorkerForMatching[] | null) => void
    const onLoadSavedWorkers = jest.fn()
      .mockImplementationOnce(() => new Promise<FavoriteWorkerForMatching[] | null>((resolve) => {
        resolveFirstLoad = resolve
      }))
      .mockResolvedValueOnce([])
    renderReceipt(awaitingChoiceState(), { onLoadSavedWorkers })

    fireEvent.press(screen.getByTestId('customer-v21-finding-workers-saved-open'))
    expect(screen.getByTestId('customer-v21-finding-workers-saved-loading')).toBeOnTheScreen()

    resolveFirstLoad(null)
    await waitFor(() => expect(screen.getByTestId('customer-v21-finding-workers-saved-error')).toBeOnTheScreen())
    expect(screen.queryByTestId(`customer-v21-finding-workers-saved-${AVAILABLE_WORKER.id}`)).toBeNull()

    fireEvent.press(screen.getByTestId('customer-v21-finding-workers-saved-retry'))
    await waitFor(() => expect(screen.getByTestId('customer-v21-finding-workers-saved-empty')).toBeOnTheScreen())
    expect(onLoadSavedWorkers).toHaveBeenCalledTimes(2)
  })
})
