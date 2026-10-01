import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import type { WorkerAmbassadorSummary } from '@/lib/api-types/program'
import { useWorkerAmbassador } from '@/lib/frontend-workflow/use-worker-ambassador'
import { ambassadorService } from '@/lib/services/ambassador-service'

import { WorkerV5Ambassador } from '../ambassador-surfaces'

export const PILLAR = {
  id: 'P273-ambassador-screen-honest',
  invariant:
    'the ambassador screen shows only server numbers: no point count before the summary loads, points and milestone gaps from the ledger and the approved program, redemption only for affordable milestones behind a confirming second tap and only once the bonus tax policy is ready, a receipt with gross, withheld and net, and a retried redemption reuses its request id so points are never spent twice',
  authority: [
    'governance/RULES.md #7, #8',
    'Tu 2026-09-25: 1 point = 10,000đ commission, milestone redemption with tax withholding',
  ],
  target: 'apps/mobile/components/worker/earnings/ambassador-surfaces.tsx',
  layer: 'ui-visual',
  siblings: ['P262-redemption-idempotent-balance-sql', 'P266-ambassador-edge-routes'],
  mutation:
    'render summary?.points_milli ?? 0 while loading, drop the confirm step in pressRedeem, or generate a new client request id on every redeem attempt — the loading, confirm or replay case turns red',
} as const satisfies PillarManifest

jest.mock('@/lib/auth-provider', () => ({
  useAuth: () => ({ session: { access_token: 'worker-token' } }),
}))

jest.mock('@/lib/services/ambassador-service', () => ({
  ambassadorService: {
    ensureReferralCode: jest.fn(),
    getSummary: jest.fn(),
    redeem: jest.fn(),
  },
}))

const mockedService = ambassadorService as jest.Mocked<typeof ambassadorService>

function summary(overrides: Partial<WorkerAmbassadorSummary> = {}): WorkerAmbassadorSummary {
  return {
    program: {
      id: 'program-1',
      version: 1,
      commission_vnd_per_point: 10000,
      link_months: 12,
      network_window_days: 90,
      invite_claim_days: 7,
      milestones: [
        { id: 'm1', rank: 1, title_vi: 'Khởi động', title_en: 'Starter', points_required: 10, reward_vnd: 20000 },
        { id: 'm2', rank: 2, title_vi: 'Kết nối', title_en: 'Connector', points_required: 50, reward_vnd: 125000 },
      ],
      multipliers: [{ min_active_customers: 5, multiplier_bps: 11000 }],
    },
    referral_code: 'ABCD2345',
    points_milli: 12500,
    linked_customers: 3,
    active_customers: 2,
    multiplier_bps: 10000,
    redemption_frozen_until: null,
    network_frozen_until: null,
    tax_policy_ready: true,
    recent_entries: [],
    redemptions: [],
    ...overrides,
  }
}

function controller(overrides: Partial<ReturnType<typeof useWorkerAmbassador>> = {}): ReturnType<typeof useWorkerAmbassador> {
  return {
    summary: summary(),
    loading: false,
    loadErrorCode: null,
    redeemingMilestoneId: null,
    redeemErrorCode: null,
    receipt: null,
    codeBusy: false,
    reload: jest.fn(async () => undefined),
    redeem: jest.fn(async () => undefined),
    ensureReferralCode: jest.fn(async () => undefined),
    ...overrides,
  }
}

describe('Worker ambassador screen', () => {
  it('shows no point count before the summary loads', () => {
    render(<WorkerV5Ambassador controller={controller({ summary: null, loading: true })} language="vi" onOpenViolations={jest.fn()} />)
    withPillarContext(PILLAR, () => {
      expect(screen.queryByTestId('worker-v5-ambassador-points')).toBeNull()
      expect(screen.getByText('Đang tải chương trình thưởng')).toBeOnTheScreen()
    })
  })

  it('shows ledger points and the gap to the next approved milestone', () => {
    render(<WorkerV5Ambassador controller={controller()} language="vi" onOpenViolations={jest.fn()} />)
    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('worker-v5-ambassador-points')).toHaveTextContent('12,5')
      expect(screen.getByTestId('worker-v5-ambassador-next')).toHaveTextContent('Còn 37,5 điểm tới mốc Kết nối (125.000đ).')
      expect(screen.getByTestId('worker-v5-ambassador-redeem-1')).toBeOnTheScreen()
      expect(screen.queryByTestId('worker-v5-ambassador-redeem-2')).toBeNull()
    })
  })

  it('redeems only after a confirming second tap', () => {
    const view = controller()
    render(<WorkerV5Ambassador controller={view} language="vi" onOpenViolations={jest.fn()} />)
    fireEvent.press(screen.getByTestId('worker-v5-ambassador-redeem-1'))
    withPillarContext(PILLAR, () => expect(view.redeem).not.toHaveBeenCalled())
    fireEvent.press(screen.getByTestId('worker-v5-ambassador-redeem-1'))
    withPillarContext(PILLAR, () => expect(view.redeem).toHaveBeenCalledWith('m1'))
  })

  it('holds redemption until the bonus tax policy is approved', () => {
    render(<WorkerV5Ambassador controller={controller({ summary: summary({ tax_policy_ready: false }) })} language="vi" onOpenViolations={jest.fn()} />)
    withPillarContext(PILLAR, () => {
      expect(screen.queryByTestId('worker-v5-ambassador-redeem-1')).toBeNull()
      expect(screen.getByTestId('worker-v5-ambassador-tax-pending')).toBeOnTheScreen()
    })
  })

  it('shows gross, withheld and net on the receipt', () => {
    render(<WorkerV5Ambassador
      controller={controller({ receipt: { redemption_id: 'r1', reward_vnd: 1400000, tax_withheld_vnd: 140000, net_vnd: 1260000, points_left_milli: 0, replayed: false } })}
      language="vi"
      onOpenViolations={jest.fn()}
    />)
    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('worker-v5-ambassador-receipt-gross')).toHaveTextContent('1.400.000đ')
      expect(screen.getByTestId('worker-v5-ambassador-receipt-withheld')).toHaveTextContent('140.000đ')
      expect(screen.getByTestId('worker-v5-ambassador-receipt-net')).toHaveTextContent('1.260.000đ')
    })
  })
})

describe('Worker ambassador redemption retry', () => {
  beforeEach(() => {
    mockedService.getSummary.mockResolvedValue({ success: true, data: summary(), status: 200 })
  })

  it('replays a dropped redemption with the same request id and starts fresh after success', async () => {
    mockedService.redeem
      .mockResolvedValueOnce({ success: false, code: 'NETWORK_ERROR', error: '', status: 0 })
      .mockResolvedValueOnce({ success: true, status: 201, data: { redemption_id: 'r1', reward_vnd: 20000, tax_withheld_vnd: 0, net_vnd: 20000, points_left_milli: 2500, replayed: true } })
      .mockResolvedValueOnce({ success: true, status: 201, data: { redemption_id: 'r2', reward_vnd: 20000, tax_withheld_vnd: 0, net_vnd: 20000, points_left_milli: 0, replayed: false } })
    const { result } = renderHook(() => useWorkerAmbassador())
    await act(async () => { await result.current.redeem('m1') })
    await act(async () => { await result.current.redeem('m1') })
    await act(async () => { await result.current.redeem('m1') })
    const ids = mockedService.redeem.mock.calls.map((call) => call[1])
    withPillarContext(PILLAR, () => {
      expect(ids[0]).toBe(ids[1])
      expect(ids[2]).not.toBe(ids[1])
      expect(result.current.receipt?.redemption_id).toBe('r2')
    })
  })
})
