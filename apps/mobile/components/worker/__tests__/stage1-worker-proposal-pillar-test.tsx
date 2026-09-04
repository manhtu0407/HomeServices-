import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

const mockPostWithIdempotency = jest.fn()

jest.mock('@/lib/api', () => ({
  api: {
    postWithIdempotency: (...args: unknown[]) => mockPostWithIdempotency(...args),
  },
}))

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import {
  workerV5CanReviewOpenOpportunity,
} from '../jobs/acceptance'
import { WorkerBroadcastProposalForm } from '../jobs/worker-broadcast-proposal-form'
import { getWorkerThemeTokens } from '../worker-theme'
import { workerService } from '@/lib/services'

export const PILLAR = {
  id: 'P61-stage1-worker-proposal',
  invariant: 'priced offers keep the existing accept path, RFQ requires real scope and price bounds, inspection accepts scope only, and unknown actions remain unreachable',
  authority: [
    'governance/RULES.md #5 (one selected language)',
    'governance/RULES.md #8 (no fake prices or workflow claims)',
    'governance/protocols/frontend-test.md G2 (validation, busy, success, accessibility)',
  ],
  target: 'apps/mobile/components/worker/jobs/worker-broadcast-proposal-form.tsx',
  layer: 'ui-visual',
  siblings: ['P45-stage1-response-identity', 'P47-stage1-worker-delivery'],
  mutation: 'allow a missing proposal_action through the route gate, show price fields for inspection, or remove the local submit latch; this pillar turns red',
} as const satisfies PillarManifest

const openDeal = {
  broadcast: {
    jobId: 'job-a',
    priceQuote: { workerConfirmedAt: null },
    status: 'sent',
  },
} as any

describe('Stage-1 worker proposal action', () => {
  beforeEach(() => {
    mockPostWithIdempotency.mockReset()
  })

  it.each([
    'accept_priced_offer',
    'submit_rfq_proposal',
    'submit_inspection_scope',
  ] as const)('lets the server-backed %s action reach offer detail', (action) => {
    withPillarContext(PILLAR, () => {
      expect(workerV5CanReviewOpenOpportunity(openDeal, 'remote_backend', action)).toBe(true)
    }, `recognized action ${action}`)
  })

  it.each([undefined, null, 'unknown_action'])('fails closed for action %s', (action) => {
    withPillarContext(PILLAR, () => {
      expect(workerV5CanReviewOpenOpportunity(openDeal, 'remote_backend', action)).toBe(false)
    }, 'route access comes only from the Edge-provided action')
  })

  it('submits one valid RFQ proposal on a double press', async () => {
    let resolveSubmit!: (value: boolean) => void
    const onSubmit = jest.fn(() => new Promise<boolean>((resolve) => {
      resolveSubmit = resolve
    }))
    render(<WorkerBroadcastProposalForm
      action="submit_rfq_proposal"
      busy={false}
      language="vi"
      onSubmit={onSubmit}
      submitted={false}
      tokens={getWorkerThemeTokens('light')}
    />)

    fireEvent.changeText(screen.getByTestId('worker-stage1-proposal-scope'), 'Kiểm tra và thay van khóa bị rò.')
    fireEvent.changeText(screen.getByTestId('worker-stage1-proposal-price-min'), '250000')
    fireEvent.changeText(screen.getByTestId('worker-stage1-proposal-price-max'), '350000')
    fireEvent.press(screen.getByTestId('worker-stage1-proposal-submit'))
    fireEvent.press(screen.getByTestId('worker-stage1-proposal-submit'))

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1))
    withPillarContext(PILLAR, () => {
      expect(onSubmit).toHaveBeenCalledWith({
        price_max: 350000,
        price_min: 250000,
        scope_summary: 'Kiểm tra và thay van khóa bị rò.',
      })
      expect(screen.getByTestId('worker-stage1-proposal-submit')).toBeDisabled()
    }, 'one customer-visible proposal per broadcast while the first request is pending')
    await act(async () => {
      resolveSubmit(true)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    await waitFor(() => expect(screen.getByTestId('worker-stage1-proposal-submit')).not.toBeDisabled())
  })

  it('uses one encoded proposal route and stable broadcast idempotency key', () => {
    const input = {
      price_max: 350_000,
      price_min: 250_000,
      scope_summary: 'Inspect and replace the leaking valve.',
    }

    workerService.submitBroadcastProposal('broadcast/unsafe', input)
    withPillarContext(PILLAR, () => {
      expect(mockPostWithIdempotency).toHaveBeenCalledWith(
        '/workers/me/broadcasts/broadcast%2Funsafe/proposal',
        input,
        'matching-proposal:broadcast/unsafe',
      )
    }, 'the same broadcast reuses one server idempotency identity')
  })

  it('keeps an incomplete RFQ local and explains the validation in Vietnamese', () => {
    const onSubmit = jest.fn(async () => true)
    render(<WorkerBroadcastProposalForm
      action="submit_rfq_proposal"
      busy={false}
      language="vi"
      onSubmit={onSubmit}
      submitted={false}
      tokens={getWorkerThemeTokens('light')}
    />)

    fireEvent.press(screen.getByTestId('worker-stage1-proposal-submit'))
    withPillarContext(PILLAR, () => {
      expect(onSubmit).not.toHaveBeenCalled()
      expect(screen.getByText('Phạm vi cần từ 3 đến 2.000 ký tự.')).toBeTruthy()
      expect(screen.queryByText('Scope must be between 3 and 2,000 characters.')).toBeNull()
    }, 'invalid input remains on device until the worker corrects it')
  })

  it('renders English inspection scope without price inputs or Vietnamese leakage', async () => {
    const onSubmit = jest.fn(async () => true)
    render(<WorkerBroadcastProposalForm
      action="submit_inspection_scope"
      busy={false}
      language="en"
      onSubmit={onSubmit}
      submitted={false}
      tokens={getWorkerThemeTokens('light')}
    />)

    fireEvent.changeText(screen.getByTestId('worker-stage1-proposal-scope'), 'Inspect access and confirm the repair scope.')
    await act(async () => {
      fireEvent.press(screen.getByTestId('worker-stage1-proposal-submit'))
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    withPillarContext(PILLAR, () => {
      expect(screen.getByText('Inspection scope')).toBeTruthy()
      expect(screen.queryByTestId('worker-stage1-proposal-price-min')).toBeNull()
      expect(screen.queryByText('Phạm vi khảo sát')).toBeNull()
      expect(onSubmit).toHaveBeenCalledWith({ scope_summary: 'Inspect access and confirm the repair scope.' })
    }, 'inspection_only forbids price bounds and selected English stays clean')
  })
})
