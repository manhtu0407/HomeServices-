import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native'
import { Share } from 'react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import type { WorkerAmbassadorSummary } from '@/lib/api-types/program'
import type { LocalDeal } from '@nestscout/shared'
import { useWorkerAmbassador } from '@/lib/frontend-workflow/use-worker-ambassador'
import { ambassadorService } from '@/lib/services/ambassador-service'

import { getWorkerV5Screen } from '../dock/screens'
import { buildWorkerV5OfferPriceRows } from '../jobs/offer'
import { WorkerV5InviteCode } from '../profile/invite-code-surfaces'
import { WorkerV5ProfileProductionSurface } from '../profile/production-overview-surfaces'

export const PILLAR = {
  id: 'P310-worker-invite-code-profile',
  invariant:
    'A worker reaches the invite code from Profile like any other setting; the screen shows only the server code, creates it on request, reports a refused or failed creation instead of staying silent, shares the real code, states the claim rule and customer counts from the server, and the offer states the platform fee as fixed for every worker rather than tied to a level',
  authority: [
    'governance/structures/pricing-fees-scope.md (fixed platform fee for every worker; Ambassador program)',
    'governance/RULES.md #8 (no silent failure, no invented numbers)',
    'governance/RULES.md #5 (one selected language per visible screen)',
  ],
  target: 'apps/mobile/components/worker/profile/invite-code-surfaces.tsx',
  layer: 'ui-visual',
  siblings: ['P273-ambassador-screen-honest', 'P308-invite-claim-edge-flow', 'P309-customer-invite-claim-flow'],
  mutation:
    'drop codeErrorCode from the ensureReferralCode result, or remove the invite-code row from buildProfileGroups — the creation-error or the Profile-entry case turns red',
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
      milestones: [{ id: 'm1', rank: 1, title_vi: 'Khởi động', title_en: 'Starter', points_required: 10, reward_vnd: 20000 }],
      multipliers: [],
    },
    referral_code: null,
    points_milli: 0,
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
    codeErrorCode: null,
    reload: jest.fn(async () => undefined),
    redeem: jest.fn(async () => undefined),
    ensureReferralCode: jest.fn(async () => undefined),
    ...overrides,
  }
}

describe('Worker invite code in Profile', () => {
  it('reaches the invite code from its own Special group at the top of Profile, with the ticket icon', () => {
    const navigate = jest.fn()
    render(
      <WorkerV5ProfileProductionSurface
        avatarUploadBusy={false}
        insights={null}
        language="vi"
        navigateToScreen={navigate}
        onPickAvatar={jest.fn()}
        onSignOut={jest.fn()}
        profile={null}
      />,
    )
    const group = screen.getByTestId('worker-v5-profile-group-special')
    const groups = screen.getByTestId('worker-v5-profile-groups')
    withPillarContext(PILLAR, () => {
      expect(group).toHaveTextContent(/^Đặc biệt/)
      expect(group).toHaveTextContent(/Mã mời khách/)
      expect(screen.getByTestId('worker-v5-profile-group-settings')).not.toHaveTextContent(/Mã mời khách/)
      expect(groups).toHaveTextContent(/^Đặc biệt\s*Mã mời khách/)
      expect(screen.getByTestId('worker-v5-profile-row-invite-code-icon')).toBeOnTheScreen()
    })
    fireEvent.press(screen.getByTestId('worker-v5-profile-row-invite-code'))
    withPillarContext(PILLAR, () => expect(navigate).toHaveBeenCalledWith('5.16-worker-invite-code'))
    expect(getWorkerV5Screen('5.16-worker-invite-code')).toMatchObject({ section: 'profile', title: { vi: 'Mã mời khách' } })
  })

  it('shows no code before the summary loads', () => {
    render(<WorkerV5InviteCode controller={controller({ summary: null, loading: true })} language="vi" onOpenRewards={jest.fn()} />)
    withPillarContext(PILLAR, () => {
      expect(screen.getByText('Đang tải mã mời')).toBeOnTheScreen()
      expect(screen.queryByTestId('worker-v5-invite-code-value')).toBeNull()
      expect(screen.queryByTestId('worker-v5-invite-code-retry')).toBeNull()
    })
  })

  it('offers a retry when the summary cannot load', () => {
    const view = controller({ summary: null, loading: false, loadErrorCode: 'NETWORK' })
    render(<WorkerV5InviteCode controller={view} language="vi" onOpenRewards={jest.fn()} />)
    fireEvent.press(screen.getByTestId('worker-v5-invite-code-retry'))
    withPillarContext(PILLAR, () => expect(view.reload).toHaveBeenCalledTimes(1))
  })

  it('creates the code on request and ignores a second tap while it is being created', () => {
    const view = controller()
    const { rerender } = render(<WorkerV5InviteCode controller={view} language="vi" onOpenRewards={jest.fn()} />)
    withPillarContext(PILLAR, () => expect(screen.getByText('Bạn chưa có mã mời')).toBeOnTheScreen())
    fireEvent.press(screen.getByTestId('worker-v5-invite-code-create'))
    expect(view.ensureReferralCode).toHaveBeenCalledTimes(1)

    const busy = controller({ codeBusy: true })
    rerender(<WorkerV5InviteCode controller={busy} language="vi" onOpenRewards={jest.fn()} />)
    fireEvent.press(screen.getByTestId('worker-v5-invite-code-create'))
    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('worker-v5-invite-code-create-status')).toHaveTextContent('Đang tạo')
      expect(busy.ensureReferralCode).not.toHaveBeenCalled()
    })
  })

  it.each([
    ['WORKER_NOT_ELIGIBLE', /cần được duyệt và đang hoạt động/],
    ['NETWORK_ERROR', /Chưa tạo được mã mời/],
  ])('reports a %s creation failure instead of staying silent', (code, copy) => {
    render(<WorkerV5InviteCode controller={controller({ codeErrorCode: code })} language="vi" onOpenRewards={jest.fn()} />)
    withPillarContext(PILLAR, () => expect(screen.getByTestId('worker-v5-invite-code-error')).toHaveTextContent(copy))
  })

  it('shows and shares the real code with the server claim rule and customer counts', () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' })
    render(<WorkerV5InviteCode controller={controller({ summary: summary({ referral_code: 'ABCD2345' }) })} language="vi" onOpenRewards={jest.fn()} />)
    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('worker-v5-invite-code-value')).toHaveTextContent('ABCD2345')
      expect(screen.getByLabelText('Mã mời A B C D 2 3 4 5')).toBe(screen.getByTestId('worker-v5-invite-code-value'))
      expect(screen.queryByTestId('worker-v5-invite-code-create')).toBeNull()
      expect(screen.getByTestId('worker-v5-invite-code-customers')).toHaveTextContent('3 khách đã liên kết · 2 khách đang hoạt động')
      expect(screen.getByTestId('worker-v5-invite-code-claim-rule')).toHaveTextContent(/trong 7 ngày sau khi đăng ký.*Liên kết kéo dài 12 tháng/)
    })
    fireEvent.press(screen.getByTestId('worker-v5-invite-code-share'))
    withPillarContext(PILLAR, () => expect(share).toHaveBeenCalledWith({ message: expect.stringContaining('nhập mã ABCD2345') }))
    share.mockRestore()
  })

  it('opens points and milestones from the rewards row', () => {
    const openRewards = jest.fn()
    render(<WorkerV5InviteCode controller={controller()} language="vi" onOpenRewards={openRewards} />)
    fireEvent.press(screen.getByTestId('worker-v5-invite-code-open-rewards'))
    expect(openRewards).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('worker-v5-invite-code-open-rewards')).toHaveTextContent(/1 điểm cho mỗi 10.000đ phí nền tảng/)
  })

  it('keeps a creation failure apart from the summary load state', async () => {
    mockedService.getSummary.mockResolvedValue({ success: true, data: summary() } as never)
    mockedService.ensureReferralCode.mockResolvedValue({ success: false, code: 'WORKER_NOT_ELIGIBLE', status: 409 } as never)
    const { result } = renderHook(() => useWorkerAmbassador())
    await waitFor(() => expect(result.current.summary).not.toBeNull())
    await act(async () => {
      await result.current.ensureReferralCode()
    })
    withPillarContext(PILLAR, () => {
      expect(result.current.codeErrorCode).toBe('WORKER_NOT_ELIGIBLE')
      expect(result.current.loadErrorCode).toBeNull()
      expect(result.current.summary?.referral_code).toBeNull()
    })
  })

  it('states the platform fee on an offer as fixed for every worker', () => {
    const deal = {
      broadcast: {
        priceQuote: {
          commissionLevel: 3,
          commissionRateBps: 1500,
          customerTotal: 300000,
          evidenceSummary: { baselineSourceCount: 2, confidence: 'high', marketSourceCount: 1 },
          platformFee: 45000,
          referencePriceMax: 320000,
          referencePriceMin: 280000,
          workerNet: 255000,
        },
      },
    } as unknown as LocalDeal
    const fee = buildWorkerV5OfferPriceRows(deal, 'vi').find((row) => row.status === 'Phí nền tảng')
    withPillarContext(PILLAR, () => {
      expect(fee?.meta).toBe('15% cố định cho mọi thợ; không đổi sau khi bạn xác nhận.')
      expect(fee?.meta).not.toMatch(/theo cấp/)
    })
  })
})
