import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { adminProgramService } from '@/lib/services/admin-program-service'

import {
  AdminAmbassadorProgramWorkspace,
  AMBASSADOR_PAYOUT_CAP_BPS,
  milestonePayoutBps,
} from '../admin-ambassador-program-workspace'
import { AdminDisciplineWorkspace } from '../admin-discipline-workspace'
import { AdminWorkerIdentityNumber } from '../admin-worker-identity-number'

export const PILLAR = {
  id: 'P277-admin-program-discipline',
  invariant:
    'the admin program editor previews the same 60% cap the database enforces and will not offer approval while the server reports a violation; a discipline decision needs a written reason, only a customer report can be marked fabricated, a withdrawal hold is extended only with an authority reference, a compensation transfer is recorded only for an agreed amount and with a bank reference, and the CCCD field accepts exactly 12 digits before anything is sent',
  authority: [
    'governance/structures/do-not-build-now.md §21',
    'Tu 2026-09-25: 60% cap, approver differs from editor, admin one-tap confirm, CCCD at approval',
  ],
  target: 'apps/mobile/components/admin/admin-discipline-workspace.tsx',
  layer: 'ui-visual',
  siblings: ['P261-milestone-cap-sql', 'P270-discipline-edge-routes', 'P271-identity-hmac-no-plaintext'],
  mutation:
    'change the preview divisor so 60.01% reads as allowed, drop the reason length check on the confirm button, or show the fabricated action for a detector case — the cap, reason or fabricated case turns red',
} as const satisfies PillarManifest

jest.mock('@/lib/services/admin-program-service', () => ({
  adminProgramService: {
    approveAmbassadorProgram: jest.fn(),
    decideAppeal: jest.fn(),
    decideViolationCase: jest.fn(),
    extendWithdrawalHold: jest.fn(),
    getAmbassadorProgram: jest.fn(),
    getViolationCase: jest.fn(),
    listCompensation: jest.fn(),
    getCompensationPayee: jest.fn(),
    recordCompensationPaid: jest.fn(),
    liftIdentityBlock: jest.fn(),
    listIdentityBlocks: jest.fn(),
    listViolationCases: jest.fn(),
    saveAmbassadorProgramDraft: jest.fn(),
    setWorkerIdentityNumber: jest.fn(),
    suspendForCase: jest.fn(),
  },
}))

const service = adminProgramService as jest.Mocked<typeof adminProgramService>

const version = {
  id: 'v1', version: 1, status: 'approved' as const, commission_vnd_per_point: 10000, customer_vnd_per_point: 10000,
  link_months: 12, network_window_days: 90, rebook_min_jobs: 2, invite_claim_days: 7, approved_at: '2026-09-25', updated_at: '2026-09-25',
  milestones: [
    { id: 'm1', rank: 1, title_vi: 'Khởi động', title_en: 'Starter', points_required: 10, reward_vnd: 20000 },
    { id: 'm6', rank: 2, title_vi: 'Đại sứ', title_en: 'Ambassador', points_required: 2000, reward_vnd: 10000000 },
  ],
  multipliers: [{ min_active_customers: 5, multiplier_bps: 11000 }, { min_active_customers: 10, multiplier_bps: 12000 }],
  created_by: 'a', approved_by: 'b', violations: [],
}

const baseCase = {
  id: 'c1', worker_id: 'w1', worker_name: 'Thợ A', violation_code: 'late_arrival', level: 1, source: 'detector' as const,
  statement: null, status: 'proposed' as const, decision_deadline_at: '2026-09-28T00:00:00Z', decided_at: null, decision_reason: null,
  appeal_status: 'none' as const, appeal_deadline_at: null, suspended_pending_review: false, created_at: '2026-09-25T00:00:00Z', consequences: [],
}

describe('Admin ambassador program editor', () => {
  it('previews the database cap exactly at its boundary', () => {
    const draft = { ...version, milestones: version.milestones.map(({ id: _id, ...m }) => m) }
    withPillarContext(PILLAR, () => {
      expect(milestonePayoutBps(draft, draft.milestones[1]!)).toBe(AMBASSADOR_PAYOUT_CAP_BPS)
      expect(milestonePayoutBps(draft, { ...draft.milestones[1]!, reward_vnd: 10000001 })).toBeGreaterThan(AMBASSADOR_PAYOUT_CAP_BPS)
    })
  })

  it('does not offer approval while the server reports a violation', async () => {
    service.getAmbassadorProgram.mockResolvedValue({ success: true, status: 200, data: { approved: version, draft: { ...version, id: 'd1', status: 'draft', violations: ['CAP_EXCEEDED'] } } } as never)
    render(<AdminAmbassadorProgramWorkspace language="vi" />)
    await waitFor(() => expect(screen.getByTestId('admin-ambassador-approve')).toBeOnTheScreen())
    withPillarContext(PILLAR, () => expect(screen.getByTestId('admin-ambassador-approve').props.accessibilityState).toMatchObject({ disabled: true }))
  })
})

describe('Admin discipline queue', () => {
  beforeEach(() => {
    service.listViolationCases.mockResolvedValue({ success: true, status: 200, data: { cases: [baseCase] } } as never)
    service.listIdentityBlocks.mockResolvedValue({ success: true, status: 200, data: { blocks: [] } } as never)
    service.listCompensation.mockResolvedValue({ success: true, status: 200, data: { negotiations: [] } } as never)
  })

  it('loads every list once and switches chips without a loading state', async () => {
    render(<AdminDisciplineWorkspace language="vi" />)
    await waitFor(() => expect(screen.getByText('Đến trễ so với giờ hẹn')).toBeOnTheScreen())
    expect(service.listViolationCases).toHaveBeenCalledWith('confirmed')
    expect(service.listIdentityBlocks).toHaveBeenCalled()
    expect(service.listCompensation).toHaveBeenCalled()
    fireEvent.press(screen.getByText('Bị chặn'))
    withPillarContext(PILLAR, () => expect(screen.queryByText('Đang tải')).toBeNull())
    fireEvent.press(screen.getByText('Vi phạm'))
    expect(screen.getByText('Đến trễ so với giờ hẹn')).toBeOnTheScreen()
  })

  it('needs a written reason before a decision and hides "fabricated" for a detector case', async () => {
    service.getViolationCase.mockResolvedValue({ success: true, status: 200, data: { ...baseCase, customer_id: null, job_id: null, evidence: {}, identity_recorded: true, appeal: null, chat_evidence: [], events: [] } } as never)
    render(<AdminDisciplineWorkspace language="vi" />)
    await waitFor(() => expect(screen.getByText('Đến trễ so với giờ hẹn')).toBeOnTheScreen())
    fireEvent.press(screen.getByText('Đến trễ so với giờ hẹn'))
    await waitFor(() => expect(screen.getByTestId('admin-discipline-confirm')).toBeOnTheScreen())
    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('admin-discipline-confirm').props.accessibilityState).toMatchObject({ disabled: true })
      expect(screen.queryByTestId('admin-discipline-fabricated')).toBeNull()
    })
    fireEvent.changeText(screen.getByTestId('admin-discipline-reason'), 'GPS cho thấy đến trễ 40 phút')
    expect(screen.getByTestId('admin-discipline-confirm').props.accessibilityState).toMatchObject({ disabled: false })
  })

  it('offers "fabricated" and immediate suspension for an open customer harm report', async () => {
    const harm = { ...baseCase, id: 'c5', violation_code: 'theft', level: 5, source: 'customer_report' as const }
    service.listViolationCases.mockResolvedValue({ success: true, status: 200, data: { cases: [harm] } } as never)
    service.getViolationCase.mockResolvedValue({ success: true, status: 200, data: { ...harm, customer_id: 'c', job_id: 'j', evidence: {}, identity_recorded: true, appeal: null, chat_evidence: [], events: [] } } as never)
    render(<AdminDisciplineWorkspace language="vi" />)
    await waitFor(() => expect(screen.getByText('Lấy tài sản của khách')).toBeOnTheScreen())
    fireEvent.press(screen.getByText('Lấy tài sản của khách'))
    await waitFor(() => expect(screen.getByTestId('admin-discipline-fabricated')).toBeOnTheScreen())
    withPillarContext(PILLAR, () => expect(screen.getByTestId('admin-discipline-suspend')).toBeOnTheScreen())
  })

  it('extends a live withdrawal hold only once an authority reference is written', async () => {
    const harm = {
      ...baseCase, id: 'c6', violation_code: 'theft', level: 5, source: 'customer_report' as const, status: 'confirmed' as const,
      decided_at: '2026-09-26T00:00:00Z', consequences: [{ entry_kind: 'withdrawal_hold', effective_until: '2026-12-25T00:00:00Z', restored: false }],
    }
    service.listViolationCases.mockResolvedValue({ success: true, status: 200, data: { cases: [harm] } } as never)
    service.getViolationCase.mockResolvedValue({ success: true, status: 200, data: { ...harm, customer_id: 'c', job_id: 'j', evidence: {}, identity_recorded: true, appeal: null, chat_evidence: [], events: [] } } as never)
    service.extendWithdrawalHold.mockResolvedValue({ success: true, status: 200, data: harm } as never)
    render(<AdminDisciplineWorkspace language="vi" />)
    await waitFor(() => expect(screen.getByText('Lấy tài sản của khách')).toBeOnTheScreen())
    fireEvent.press(screen.getByText('Lấy tài sản của khách'))
    await waitFor(() => expect(screen.getByTestId('admin-discipline-hold-extend')).toBeOnTheScreen())
    withPillarContext(PILLAR, () => expect(screen.getByTestId('admin-discipline-hold-extend').props.accessibilityState).toMatchObject({ disabled: true }))
    fireEvent.changeText(screen.getByTestId('admin-discipline-hold-reference'), 'CA-Q7-2026/118')
    fireEvent.press(screen.getByTestId('admin-discipline-hold-extend'))
    await waitFor(() => expect(service.extendWithdrawalHold).toHaveBeenCalledWith('c6', expect.objectContaining({ authority_reference: 'CA-Q7-2026/118' })))
  })
})

describe('Admin compensation transfers', () => {
  it('records a transfer only for an agreed amount and only with a bank reference', async () => {
    service.listViolationCases.mockResolvedValue({ success: true, status: 200, data: { cases: [] } } as never)
    const agreed = {
      id: 'n1', case_id: 'c6', job_id: 'j', violation_code: 'theft', worker_name: 'Thợ A', worker_id: 'w1', customer_name: 'Khách B',
      status: 'agreed' as const, current_amount_vnd: 600000, respond_by: '2026-10-01T00:00:00Z', offers_left: 2, agreed_at: '2026-09-28T01:00:00Z',
      payout: { status: 'reserved' as const, amount_vnd: 600000, paid_at: null },
      offers: [{ actor_role: 'customer' as const, action: 'claim' as const, amount_vnd: 600000, note: 'Mất đồng hồ', created_at: '2026-09-28T00:00:00Z' }],
      evidence: [],
    }
    service.listCompensation.mockResolvedValue({ success: true, status: 200, data: { negotiations: [agreed] } } as never)
    service.listIdentityBlocks.mockResolvedValue({ success: true, status: 200, data: { blocks: [] } } as never)
    service.recordCompensationPaid.mockResolvedValue({ success: true, status: 200, data: agreed } as never)
    render(<AdminDisciplineWorkspace language="vi" />)
    fireEvent.press(screen.getByText('Bồi thường'))
    await waitFor(() => expect(screen.getByTestId('admin-discipline-compensation')).toBeOnTheScreen())
    fireEvent.press(await screen.findByText('Lấy tài sản của khách'))
    await waitFor(() => expect(screen.getByTestId('admin-compensation-paid')).toBeOnTheScreen())
    service.getCompensationPayee.mockResolvedValue({ success: true, status: 200, data: { account: { bank_name: 'Vietcombank', account_holder_name: 'NGUYEN VAN KHACH', bank_account: '0123456789', verified: false } } } as never)
    withPillarContext(PILLAR, () => expect(screen.queryByText('0123456789')).toBeNull())
    fireEvent.press(screen.getByTestId('admin-compensation-show-payee'))
    await waitFor(() => expect(screen.getByText('0123456789')).toBeOnTheScreen())
    expect(service.getCompensationPayee).toHaveBeenCalledWith('n1')
    withPillarContext(PILLAR, () => expect(screen.getByTestId('admin-compensation-paid').props.accessibilityState).toMatchObject({ disabled: true }))
    fireEvent.changeText(screen.getByTestId('admin-compensation-reference'), 'VCB-778899')
    fireEvent.press(screen.getByTestId('admin-compensation-paid'))
    await waitFor(() => expect(service.recordCompensationPaid).toHaveBeenCalledWith('n1', 'VCB-778899'))
  })
})

describe('Admin CCCD entry', () => {
  it('sends only a 12-digit number', async () => {
    service.setWorkerIdentityNumber.mockResolvedValue({ success: true, status: 200, data: { worker_id: 'w1', cccd_last4: '2345' } } as never)
    render(<AdminWorkerIdentityNumber language="vi" workerId="w1" />)
    fireEvent.changeText(screen.getByTestId('admin-worker-identity-number-input'), '07920101234')
    fireEvent.press(screen.getByTestId('admin-worker-identity-number-save'))
    withPillarContext(PILLAR, () => expect(service.setWorkerIdentityNumber).not.toHaveBeenCalled())
    fireEvent.changeText(screen.getByTestId('admin-worker-identity-number-input'), '079201012345')
    fireEvent.press(screen.getByTestId('admin-worker-identity-number-save'))
    await waitFor(() => expect(screen.getByTestId('admin-worker-identity-number-saved')).toHaveTextContent(/••••2345/))
    expect(service.setWorkerIdentityNumber).toHaveBeenCalledWith('w1', '079201012345')
  })
})
