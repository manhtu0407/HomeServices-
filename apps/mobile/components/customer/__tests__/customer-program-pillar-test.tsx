import AsyncStorage from '@react-native-async-storage/async-storage'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { clearPendingInvite, loadPendingInvite, savePendingInvite } from '@/lib/referral/pending-invite'
import { claimPendingInvite } from '@/lib/referral/use-claim-pending-invite'
import { disciplineService } from '@/lib/services/discipline-service'
import { membershipService } from '@/lib/services/membership-service'

import { membershipRank } from '../profile/membership-rank'
import { getCustomerThemeTokens } from '../customer-theme'
import { ActiveWorkCard, ActiveWorkEntry, isWorkerAtWorkStatus } from '../report/worker-report-entry'
import { WorkerReportSheet } from '../report/worker-report-sheet'

export const PILLAR = {
  id: 'P275-customer-invite-rank-report',
  invariant:
    'a customer invite code survives signup and is claimed once, kept only while a later attempt could still succeed; the usage rank shows server ledger points against server thresholds, never a fixed 1,000-point cycle; and a worker report needs a category and a real statement, warns that a false report locks the account, and points a harm report to 113',
  authority: [
    'governance/RULES.md #8',
    'Tu 2026-09-25: invite claim window, membership on the ledger, fabricated report locks the customer',
  ],
  target: 'apps/mobile/lib/referral/use-claim-pending-invite.ts',
  layer: 'ui-visual',
  siblings: ['P263-referral-claim-window-sql', 'P264-customer-membership-ledger-sql', 'P270-discipline-edge-routes'],
  mutation:
    'clear the pending code on RATE_LIMITED, restore the "% 1000" cycle in membershipRank, or enable the report submit without a category — the retry, threshold or report case turns red',
} as const satisfies PillarManifest

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))

jest.mock('@/lib/auth-provider', () => ({
  useAuth: () => ({ session: { access_token: 'customer-token' } }),
}))

jest.mock('@/lib/services/membership-service', () => ({
  ...jest.requireActual('@/lib/services/membership-service'),
  membershipService: { claimReferralCode: jest.fn(), getMembership: jest.fn() },
}))

jest.mock('@/lib/services/discipline-service', () => ({
  disciplineService: { reportWorker: jest.fn() },
}))

const claim = membershipService.claimReferralCode as jest.Mock
const report = disciplineService.reportWorker as jest.Mock

describe('Customer invite claim', () => {
  beforeEach(async () => {
    claim.mockReset()
    await clearPendingInvite()
  })

  it('normalizes and keeps a code from the invite link', async () => {
    await savePendingInvite(' kx7m-4q2p ')
    const code = await loadPendingInvite()
    withPillarContext(PILLAR, () => expect(code).toBe('KX7M4Q2P'))
    expect(await savePendingInvite('bad')).toBeNull()
  })

  it('drops an expired code', async () => {
    await AsyncStorage.setItem('nestscout.pending-invite.v1', JSON.stringify({ code: 'KX7M4Q2P', saved_at: Date.now() - 15 * 86_400_000 }))
    expect(await loadPendingInvite()).toBeNull()
  })

  it('keeps the code only while a later attempt could still succeed', async () => {
    await savePendingInvite('KX7M4Q2P')
    claim.mockResolvedValueOnce({ success: true, status: 200, data: { outcome: 'RATE_LIMITED' } })
    expect(await claimPendingInvite('customer-token')).toBe('RATE_LIMITED')
    const kept = await loadPendingInvite()
    withPillarContext(PILLAR, () => expect(kept).toBe('KX7M4Q2P'))

    claim.mockResolvedValueOnce({ success: false, status: 0, code: 'NETWORK_ERROR', error: '' })
    expect(await claimPendingInvite('customer-token')).toBeNull()
    expect(await loadPendingInvite()).toBe('KX7M4Q2P')

    claim.mockResolvedValueOnce({ success: true, status: 200, data: { outcome: 'LINKED' } })
    expect(await claimPendingInvite('customer-token')).toBe('LINKED')
    expect(await loadPendingInvite()).toBeNull()
    expect(claim).toHaveBeenLastCalledWith('KX7M4Q2P', 'customer-token')
  })

  it('keeps the code after an expired token or rate limiting', async () => {
    await savePendingInvite('KX7M4Q2P')
    for (const status of [401, 429]) {
      claim.mockResolvedValueOnce({ success: false, status, code: 'RETRY', error: '' })
      await claimPendingInvite('customer-token')
      const kept = await loadPendingInvite()
      withPillarContext(PILLAR, () => expect(kept).toBe('KX7M4Q2P'))
    }
  })

  it('drops a code the server refuses outright', async () => {
    await savePendingInvite('KX7M4Q2P')
    claim.mockResolvedValueOnce({ success: false, status: 400, code: 'VALIDATION', error: '' })
    await claimPendingInvite('customer-token')
    expect(await loadPendingInvite()).toBeNull()
  })
})

describe('Customer usage rank', () => {
  it('shows ledger points against the server threshold', () => {
    const rank = membershipRank({ usage_rank_level: 4, usage_rank_points: 620, usage_rank_level_floor_points: 600, usage_rank_next_level_points: 800 } as never, 'vi')
    withPillarContext(PILLAR, () => {
      expect(rank.pointsLabel).toBe('620 / 800 điểm')
      expect(rank.pointsToNext).toBe(180)
      expect(rank.nextRank).toBe(5)
      expect(rank.progressPercent).toBe(10)
    })
  })

  it('has no next level at the top and shows nothing before data arrives', () => {
    const top = membershipRank({ usage_rank_level: 5, usage_rank_points: 1450, usage_rank_level_floor_points: 800, usage_rank_next_level_points: null } as never, 'vi')
    expect(top.pointsLabel).toBe('1.450 điểm')
    expect(top.nextRank).toBeNull()
    expect(top.levelProgressPercent).toBe(100)
    expect(membershipRank(null, 'vi').pointsLabel).toBeNull()
  })
})

describe('Customer worker report sheet', () => {
  beforeEach(() => report.mockReset())

  it('needs a category and a real statement, and warns about false reports', () => {
    render(<WorkerReportSheet jobId="job-1" language="vi" onClose={jest.fn()} visible />)
    withPillarContext(PILLAR, () => expect(screen.getByTestId('customer-worker-report-sheet')).toHaveTextContent(/Báo cáo sai sự thật có thể khiến tài khoản của bạn bị khóa/))
    fireEvent.changeText(screen.getByTestId('customer-worker-report-statement'), 'Thợ đòi thêm 200.000đ tiền mặt.')
    withPillarContext(PILLAR, () => expect(screen.getByTestId('customer-worker-report-submit').props.accessibilityState).toMatchObject({ disabled: true }))
    fireEvent.press(screen.getByTestId('customer-worker-report-submit'))
    withPillarContext(PILLAR, () => expect(report).not.toHaveBeenCalled())
  })

  it('points a harm report to 113 and sends the chosen category', async () => {
    report.mockResolvedValueOnce({ success: true, status: 201, data: { case_id: 'c1', level: 5, status: 'proposed' } })
    render(<WorkerReportSheet jobId="job-1" language="vi" onClose={jest.fn()} visible />)
    fireEvent.press(screen.getByTestId('customer-worker-report-option-theft'))
    withPillarContext(PILLAR, () => expect(screen.getByTestId('customer-worker-report-urgent')).toHaveTextContent(/113/))
    fireEvent.changeText(screen.getByTestId('customer-worker-report-statement'), 'Mất đồng hồ trên bàn sau khi thợ về.')
    fireEvent.press(screen.getByTestId('customer-worker-report-submit'))
    await waitFor(() => expect(screen.getByTestId('customer-worker-report-result')).toHaveTextContent(/Đã gửi báo cáo/))
    expect(report).toHaveBeenCalledWith('job-1', 'theft', 'Mất đồng hồ trên bàn sau khi thợ về.', 'customer-token')
  })

  it.each([
    [{ code: 'AUTH_REQUIRED', status: 401 }, /Đăng nhập lại/],
    [{ code: 'NETWORK_ERROR', status: 0 }, /Kiểm tra kết nối/],
    [{ code: 'DB_ERROR', status: 500 }, /thử lại sau ít phút/],
  ])('tells the customer what to do when sending fails with %o', async (failure, copy) => {
    report.mockResolvedValueOnce({ success: false, error: '', ...failure })
    render(<WorkerReportSheet jobId="job-1" language="vi" onClose={jest.fn()} visible />)
    fireEvent.press(screen.getByTestId('customer-worker-report-option-extra_cash'))
    fireEvent.changeText(screen.getByTestId('customer-worker-report-statement'), 'Thợ đòi thêm 300.000đ tiền mặt.')
    fireEvent.press(screen.getByTestId('customer-worker-report-submit'))
    await waitFor(() => expect(screen.getByTestId('customer-worker-report-result')).toHaveTextContent(copy))
  })

  it('does not show the 113 note for a non-harm category', () => {
    render(<WorkerReportSheet jobId="job-1" language="vi" onClose={jest.fn()} visible />)
    fireEvent.press(screen.getByTestId('customer-worker-report-option-extra_cash'))
    expect(screen.queryByTestId('customer-worker-report-urgent')).toBeNull()
  })
})

describe('Customer report entry while the worker is on the job', () => {
  it('offers the report only while a worker is attached to an open job', () => {
    withPillarContext(PILLAR, () => {
      for (const status of ['worker_on_way', 'arrived', 'repairing', 'completed_by_worker'] as const) expect(isWorkerAtWorkStatus(status)).toBe(true)
      for (const status of ['draft', 'broadcasting', 'paid', 'cancelled'] as const) expect(isWorkerAtWorkStatus(status)).toBe(false)
    })
  })

  it('keeps the active job folded into one row until the customer opens it', () => {
    render(<ActiveWorkEntry
      language="vi"
      summary={{ jobId: 'job-active', onOpen: jest.fn(), serviceLabel: 'Sửa điện', statusLabel: 'Đang sửa', workerName: 'Thợ Minh' }}
      tokens={getCustomerThemeTokens('light')}
    />)
    expect(screen.getByTestId('customer-v21-history-active-work-entry')).toHaveTextContent(/Sửa điện · Thợ Minh · Đang sửa/)
    withPillarContext(PILLAR, () => expect(screen.queryByTestId('customer-v21-history-active-work-report')).toBeNull())
    fireEvent.press(screen.getByTestId('customer-v21-history-active-work-entry'))
    expect(screen.getByTestId('customer-v21-history-active-work-report')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('customer-v21-history-active-work-entry'))
    expect(screen.queryByTestId('customer-v21-history-active-work')).toBeNull()
  })

  it('opens the report sheet for that job from the active work card', async () => {
    report.mockResolvedValueOnce({ success: true, status: 201, data: { case_id: 'c1', level: 3, status: 'proposed' } })
    const onOpen = jest.fn()
    render(<ActiveWorkCard
      language="vi"
      summary={{ jobId: 'job-active', onOpen, serviceLabel: 'Sửa điện', statusLabel: 'Đang sửa', workerName: 'Thợ Minh' }}
      tokens={getCustomerThemeTokens('light')}
    />)
    expect(screen.getByTestId('customer-v21-history-active-work')).toHaveTextContent(/Thợ đang làm/)
    fireEvent.press(screen.getByTestId('customer-v21-history-active-work-open'))
    expect(onOpen).toHaveBeenCalled()
    fireEvent.press(screen.getByTestId('customer-v21-history-active-work-report'))
    fireEvent.press(screen.getByTestId('customer-worker-report-option-extra_cash'))
    fireEvent.changeText(screen.getByTestId('customer-worker-report-statement'), 'Thợ đòi thêm 300.000đ tiền mặt.')
    fireEvent.press(screen.getByTestId('customer-worker-report-submit'))
    await waitFor(() => expect(report).toHaveBeenCalledWith('job-active', 'extra_cash', 'Thợ đòi thêm 300.000đ tiền mặt.', 'customer-token'))
  })
})
