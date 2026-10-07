import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import {
  clearPendingInvite,
  saveInviteClaimResult,
  savePendingInvite,
  takeInviteClaimResult,
} from '@/lib/referral/pending-invite'
import { claimPendingInvite } from '@/lib/referral/use-claim-pending-invite'
import { membershipService } from '@/lib/services/membership-service'

import { CustomerMembershipCard } from '../profile/membership-card'

export const PILLAR = {
  id: 'P309-customer-invite-claim-flow',
  invariant:
    'The customer sees the invite-code field only while the server says a claim can still succeed, with its deadline; a character that is never issued is caught before any request; a code is sent only on a second confirming tap that states the link length; a closed claim explains why instead of offering the field; and the outcome of a claim made from an invite link is shown once',
  authority: [
    'governance/structures/pricing-fees-scope.md (Ambassador program: claim window, before any paid order, one active link, 12 months)',
    'governance/RULES.md #8 (no silent outcome)',
    'governance/RULES.md #5 (one selected language per visible screen)',
  ],
  target: 'apps/mobile/components/customer/profile/membership-card.tsx',
  layer: 'ui-visual',
  siblings: ['P307-customer-invite-claim-status-sql', 'P308-invite-claim-edge-flow', 'P275-customer-invite-rank-report'],
  mutation:
    'send the claim on the first tap of the apply button, or show the field for every status — the two-tap or the closed-window case turns red',
} as const satisfies PillarManifest

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))

jest.mock('@/lib/auth-provider', () => ({
  useAuth: () => ({ session: { access_token: 'customer-token', user: { id: 'customer-invite-test' } } }),
}))

jest.mock('@/lib/services/membership-service', () => ({
  ...jest.requireActual('@/lib/services/membership-service'),
  membershipService: { claimReferralCode: jest.fn(), getMembership: jest.fn() },
}))

const getMembership = membershipService.getMembership as jest.Mock
const claim = membershipService.claimReferralCode as jest.Mock

const WORKER = 'worker-1'
const CLOSES_AT = '2026-10-12T00:00:00.000Z'

type InviteClaim = { status: string; closes_at: string | null; claim_days: number | null; link_months: number | null } | null | undefined

function membership(inviteClaim: InviteClaim, linked = false) {
  return {
    success: true,
    data: {
      points: 0,
      customer_vnd_per_point: 10000,
      linked_worker: linked
        ? { worker_id: WORKER, display_name: 'Thợ Minh', source: 'invite_code', expires_at: '2027-10-05T00:00:00.000Z' }
        : null,
      ...(inviteClaim === undefined ? {} : { invite_claim: inviteClaim }),
    },
  }
}

const open = { status: 'open', closes_at: CLOSES_AT, claim_days: 7, link_months: 12 }

async function renderCard() {
  render(<CustomerMembershipCard />)
  await screen.findByTestId('customer-membership-card')
}

describe('Customer invite-claim flow', () => {
  beforeEach(async () => {
    getMembership.mockReset()
    claim.mockReset()
    await clearPendingInvite()
    await takeInviteClaimResult()
  })

  it('offers the field with its deadline while a claim can still succeed', async () => {
    getMembership.mockResolvedValue(membership(open))
    await renderCard()
    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('customer-membership-code-entry')).toBeOnTheScreen()
      expect(screen.getByTestId('customer-membership-claim-deadline')).toHaveTextContent(/^Nhập mã trước 12\/10\/2026/)
      expect(screen.getByText('Áp dụng mã')).toBeOnTheScreen()
    })
  })

  it.each([
    ['window_closed', 'Mã mời chỉ nhập được trong 7 ngày đầu sau khi đăng ký.'],
    ['transacted', 'Mã mời chỉ áp dụng trước đơn thanh toán đầu tiên.'],
    ['program_unavailable', 'Chương trình mời đang tạm dừng.'],
  ])('explains a %s claim instead of offering the field', async (status, copy) => {
    getMembership.mockResolvedValue(membership({ ...open, status }))
    await renderCard()
    withPillarContext(PILLAR, () => {
      expect(screen.queryByTestId('customer-membership-code-entry')).toBeNull()
      expect(screen.getByTestId('customer-membership-claim-closed')).toHaveTextContent(copy)
    })
  })

  it('shows the linked worker and nothing to claim once linked', async () => {
    getMembership.mockResolvedValue(membership({ ...open, status: 'linked' }, true))
    await renderCard()
    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('customer-membership-linked')).toHaveTextContent(/Thợ quen của bạn: Thợ Minh/)
      expect(screen.queryByTestId('customer-membership-code-entry')).toBeNull()
      expect(screen.queryByTestId('customer-membership-claim-closed')).toBeNull()
    })
  })

  it('keeps the field for an older server that sends no claim status', async () => {
    getMembership.mockResolvedValue(membership(undefined))
    await renderCard()
    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('customer-membership-code-entry')).toBeOnTheScreen()
      expect(screen.queryByTestId('customer-membership-claim-deadline')).toBeNull()
    })
  })

  it('catches a character that is never issued before any request', async () => {
    getMembership.mockResolvedValue(membership(open))
    await renderCard()
    fireEvent.changeText(screen.getByTestId('customer-membership-code-input'), 'kx7m4q2o')
    fireEvent.press(screen.getByTestId('customer-membership-code-submit'))
    fireEvent.press(screen.getByTestId('customer-membership-code-submit'))
    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('customer-membership-code-input').props.value).toBe('KX7M4Q2O')
      expect(screen.getByTestId('customer-membership-code-hint')).toHaveTextContent(/không có số 0, số 1, chữ O và chữ I/)
      expect(claim).not.toHaveBeenCalled()
    })
  })

  it('sends the code only on a second tap that states the link length, then shows the link', async () => {
    getMembership.mockResolvedValueOnce(membership(open)).mockResolvedValueOnce(membership({ ...open, status: 'linked' }, true))
    claim.mockResolvedValue({ success: true, data: { outcome: 'LINKED' } })
    await renderCard()
    fireEvent.changeText(screen.getByTestId('customer-membership-code-input'), 'kx7m-4q2p')
    fireEvent.press(screen.getByTestId('customer-membership-code-submit'))
    withPillarContext(PILLAR, () => {
      expect(claim).not.toHaveBeenCalled()
      expect(screen.getByTestId('customer-membership-code-confirm')).toHaveTextContent(/trong 12 tháng/)
      expect(screen.getByText('Xác nhận áp dụng mã')).toBeOnTheScreen()
    })
    await act(async () => {
      fireEvent.press(screen.getByTestId('customer-membership-code-submit'))
    })
    await waitFor(() => expect(screen.getByTestId('customer-membership-linked')).toBeOnTheScreen())
    withPillarContext(PILLAR, () => {
      expect(claim).toHaveBeenCalledWith('KX7M4Q2P', 'customer-token')
      expect(screen.getByTestId('customer-membership-message')).toHaveTextContent('Đã kết nối với thợ đã mời bạn.')
      expect(screen.queryByTestId('customer-membership-code-entry')).toBeNull()
    })
  })

  it('drops the pending confirmation when the code is edited', async () => {
    getMembership.mockResolvedValue(membership(open))
    await renderCard()
    fireEvent.changeText(screen.getByTestId('customer-membership-code-input'), 'KX7M4Q2P')
    fireEvent.press(screen.getByTestId('customer-membership-code-submit'))
    fireEvent.changeText(screen.getByTestId('customer-membership-code-input'), 'KX7M4Q2R')
    withPillarContext(PILLAR, () => {
      expect(screen.queryByTestId('customer-membership-code-confirm')).toBeNull()
      expect(screen.getByText('Áp dụng mã')).toBeOnTheScreen()
    })
  })

  it('shows the outcome of a claim made from an invite link once', async () => {
    await savePendingInvite('KX7M4Q2P')
    claim.mockResolvedValue({ success: true, data: { outcome: 'CLAIM_WINDOW_CLOSED' } })
    await claimPendingInvite('customer-token')
    getMembership.mockResolvedValue(membership({ ...open, status: 'window_closed' }))
    await renderCard()
    await waitFor(() => expect(screen.getByTestId('customer-membership-message')).toBeOnTheScreen())
    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('customer-membership-message')).toHaveTextContent(
        'Mã từ link mời: Đã quá thời hạn nhập mã mời cho tài khoản này.',
      )
    })
    expect(await takeInviteClaimResult()).toBeNull()
  })

  it('ignores a stored value that is not a claim outcome', async () => {
    await saveInviteClaimResult('SOMETHING_ELSE')
    getMembership.mockResolvedValue(membership(open))
    await renderCard()
    await waitFor(() => expect(screen.getByTestId('customer-membership-code-entry')).toBeOnTheScreen())
    expect(screen.queryByTestId('customer-membership-message')).toBeNull()
  })

  it('updates a card already on screen when the invite-link claim lands after it loaded', async () => {
    getMembership.mockResolvedValue(membership(open))
    await renderCard()
    await waitFor(() => expect(screen.getByTestId('customer-membership-code-entry')).toBeOnTheScreen())
    await savePendingInvite('KX7M4Q2P')
    claim.mockResolvedValue({ success: true, data: { outcome: 'LINKED' } })
    getMembership.mockResolvedValue(membership(null, true))
    await act(async () => {
      await claimPendingInvite('customer-token')
    })
    await waitFor(() => expect(screen.getByTestId('customer-membership-message')).toBeOnTheScreen())
    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('customer-membership-message')).toHaveTextContent(/^Mã từ link mời: /)
      expect(getMembership).toHaveBeenCalledTimes(2)
    })
  })
})
