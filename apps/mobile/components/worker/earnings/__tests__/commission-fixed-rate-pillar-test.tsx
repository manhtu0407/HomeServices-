import { render, screen } from '@testing-library/react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import type { EarningsResponse } from '@/lib/api-types'

import { WorkerV5CommissionPolicy } from '../commission-policy-surfaces'

export const PILLAR = {
  id: 'P210-commission-copy-fixed-rate',
  invariant:
    'the worker commission policy shows the platform fee the server reports as fixed for every job, derives the worker share from that same rate, and never promises a level-based fee reduction or shows a commission level',
  authority: [
    'governance/RULES.md #8 (no promise the data cannot deliver)',
    'Tu 2026-09-25: commission fixed at 15%, rewards replace fee cuts',
  ],
  target: 'apps/mobile/components/worker/earnings/commission-policy-surfaces.tsx',
  layer: 'ui-visual',
  siblings: ['P24-worker-earnings-period-palette', 'P209-commission-tiers-service-only-sql'],
  mutation:
    'restore the "Bậc hiện tại" line or the "Làm tốt để giữ lại nhiều hơn" level-reduction card, or hardcode 85% in the paragraph — the no-level, no-reduction or server-rate cases turn red',
} as const satisfies PillarManifest

function earningsWithRate(rateBps: number | null): EarningsResponse {
  return {
    current_commission_level: 3,
    current_commission_rate_bps: rateBps,
  } as unknown as EarningsResponse
}

function renderPolicy(rateBps: number | null) {
  render(
    <WorkerV5CommissionPolicy
      earnings={earningsWithRate(rateBps)}
      language="vi"
      reduceTransparency={false}
    />,
  )
  return screen.getByTestId('worker-v5-commission-policy')
}

describe('Worker commission policy — fixed platform fee', () => {
  it('shows the server rate and the worker share derived from it', () => {
    const policy = renderPolicy(1500)
    withPillarContext(PILLAR, () => {
      expect(policy).toHaveTextContent(/15%/)
      expect(policy).toHaveTextContent(/85% còn lại thuộc về thợ/)
      expect(policy).toHaveTextContent(/Cố định cho mọi công việc/)
    })
  })

  it('follows the server rate instead of a hardcoded split', () => {
    const policy = renderPolicy(1200)
    withPillarContext(PILLAR, () => {
      expect(policy).toHaveTextContent(/88% còn lại thuộc về thợ/)
      expect(policy).not.toHaveTextContent(/85%/)
    })
  })

  it('never shows a commission level or promises a fee reduction', () => {
    const policy = renderPolicy(1500)
    withPillarContext(PILLAR, () => {
      expect(policy).not.toHaveTextContent(/Bậc hiện tại/)
      expect(policy).not.toHaveTextContent(/Làm tốt để giữ lại nhiều hơn/)
      expect(policy).not.toHaveTextContent(/giảm để bạn giữ lại/)
      expect(policy).toHaveTextContent(/Thưởng thay cho giảm phí/)
    })
  })

  it('shows an honest pending state when the rate is not loaded', () => {
    const policy = renderPolicy(null)
    withPillarContext(PILLAR, () => {
      expect(policy).toHaveTextContent(/Đang cập nhật/)
      expect(policy).not.toHaveTextContent(/\d+%/)
    })
  })
})
