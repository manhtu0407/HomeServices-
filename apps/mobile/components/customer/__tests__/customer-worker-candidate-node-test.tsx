import { fireEvent, render, waitFor } from '@testing-library/react-native'
import type { ComponentProps } from 'react'

import { getCustomerThemeTokens } from '../customer-theme'
import { CustomerWorkerCandidateNode } from '../kael-chat/customer-worker-candidate-node'

const mockListMyServiceHistory = jest.fn()

jest.mock('@/lib/services', () => ({
  jobService: {
    listMyServiceHistory: (...args: unknown[]) => mockListMyServiceHistory(...args),
  },
}))

it('loads saved workers from Activity and keeps the backend decision behind final confirmation', async () => {
  mockListMyServiceHistory.mockResolvedValue({
    data: {
      service_history: [
        {
          ended_at: '2026-07-14T08:00:00.000Z',
          final_price: 240000,
          id: 'job-history',
          service_type: 'handyman',
          status: 'reviewed',
          worker: {
            avatar_url: null,
            display_name: 'Chị Lan',
            id: 'worker-2',
            is_favorite: true,
          },
        },
      ],
    },
    success: true,
  })
  const decideWorkerCandidate = jest.fn(async () => true)
  const controller = {
    candidateJobId: 'job-current',
    language: 'vi',
    mode: 'case',
    tokens: getCustomerThemeTokens('light'),
    workflow: {
      actions: {
        decideWorkerCandidate,
        refreshWorkerCandidate: jest.fn(async () => true),
        setWorkerCandidateFavorite: jest.fn(async () => true),
      },
      customerWorkerCandidate: {
        avatar_url: null,
        candidate_id: 'candidate-1',
        customer_decided_at: null,
        display_name: 'Nguyễn An',
        expires_at: null,
        is_favorite: false,
        original_scope_price_quote: {
          schema_version: 'original_scope_price_quote.v1',
          quote_id: 'a1510000-0000-4000-8000-000000000012',
          reference_price_min: 300000,
          reference_price_max: 500000,
          customer_total: 400000,
          platform_fee: 60000,
          worker_net: 340000,
          commission_level: 1,
          commission_rate_bps: 1500,
          price_source: 'baseline_with_market',
          selection_rule: 'verified_neutral_midpoint_with_bilateral_confirmation',
          worker_confirmation_required: true,
          customer_confirmation_required: true,
          worker_confirmed_at: '2026-07-14T09:00:30.000Z',
          expires_at: '2099-07-14T09:10:00.000Z',
          evidence_summary: {
            confidence: 'high',
            baseline_source_count: 2,
            market_source_count: 2,
            high_trust_source_count: 2,
            quorum_met: true,
            cap_statement: 'Current confirmed scope only.',
          },
        },
        proposed_at: '2026-07-14T09:00:00.000Z',
        rating: 4.9,
        status: 'proposed',
        total_jobs: 18,
        verification_status: 'approved',
        worker_id: 'worker-1',
        years_experience: 3,
      },
      customerWorkerCandidateBusy: false,
      customerWorkerCandidateError: null,
    },
  } as unknown as ComponentProps<typeof CustomerWorkerCandidateNode>['controller']

  const view = render(<CustomerWorkerCandidateNode controller={controller} />)

  await waitFor(() => expect(mockListMyServiceHistory).toHaveBeenCalledTimes(1))
  fireEvent.press(view.getByTestId('customer-v21-worker-candidate-confirm'))

  expect(view.getByText('Chị Lan')).toBeTruthy()
  expect(decideWorkerCandidate).not.toHaveBeenCalled()

  fireEvent.press(view.getByTestId('customer-v21-worker-candidate-final-confirm'))
  expect(decideWorkerCandidate).toHaveBeenCalledWith('confirm')
})
