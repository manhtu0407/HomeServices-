import { fireEvent, render, screen } from '@testing-library/react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import type { DisciplinePolicyView, WorkerViolationCaseView } from '@/lib/api-types/program'
import type { useWorkerViolations } from '@/lib/frontend-workflow/use-worker-violations'

import { WorkerV5Violations } from '../violation-surfaces'

export const PILLAR = {
  id: 'P274-violations-screen-due-process',
  invariant:
    'the worker violation screen states every penalty number from the live policy row, says a proposed case carries no penalty yet, marks restored consequences, offers an appeal only inside the appeal window with the days left, and will not send an appeal whose reason is shorter than the server minimum',
  authority: [
    'governance/structures/do-not-build-now.md §21',
    'Tu 2026-09-25: system proposes, admin confirms; 7-day appeal with evidence; overturn restores 100%',
  ],
  target: 'apps/mobile/components/worker/discipline/violation-surfaces.tsx',
  layer: 'ui-visual',
  siblings: ['P270-discipline-edge-routes', 'P268-appeal-restores-exactly-sql'],
  mutation:
    'hardcode "20 điểm" in levelRules, show the appeal form for an expired deadline, or enable submit below 20 characters — the policy, window or reason case turns red',
} as const satisfies PillarManifest

const policy: DisciplinePolicyView = {
  l1_matching_days: 7,
  l2_points_debit: 20,
  l2_network_freeze_days: 30,
  l3_freeze_days: 90,
  strike_window_months: 12,
  appeal_window_days: 7,
  withdrawal_hold_days: 90,
}

const DAY = 86_400_000

function violation(overrides: Partial<WorkerViolationCaseView> = {}): WorkerViolationCaseView {
  return {
    id: 'case-1',
    violation_code: 'off_app_dealing',
    level: 3,
    source: 'customer_report',
    statement: null,
    status: 'confirmed',
    decision_deadline_at: new Date(Date.now() + DAY).toISOString(),
    decided_at: new Date().toISOString(),
    decision_reason: 'Có tin nhắn hẹn làm ngoài app',
    appeal_status: 'none',
    appeal_deadline_at: new Date(Date.now() + 3 * DAY - 1000).toISOString(),
    suspended_pending_review: false,
    created_at: new Date().toISOString(),
    consequences: [
      { entry_kind: 'points_forfeit', effective_until: null, restored: false },
      { entry_kind: 'redemption_freeze', effective_until: new Date(Date.now() + 90 * DAY).toISOString(), restored: false },
    ],
    ...overrides,
  }
}

function controller(cases: WorkerViolationCaseView[], overrides: Partial<ReturnType<typeof useWorkerViolations>> = {}): ReturnType<typeof useWorkerViolations> {
  return {
    cases,
    policy,
    loading: false,
    loadErrorCode: null,
    submittingCaseId: null,
    appealErrorCode: null,
    reload: jest.fn(async () => undefined),
    submitAppeal: jest.fn(async () => true),
    ...overrides,
  }
}

describe('Worker violations screen', () => {
  it('states the penalty numbers from the policy row', () => {
    render(<WorkerV5Violations controller={controller([], { policy: { ...policy, l2_points_debit: 35, l3_freeze_days: 60 } })} language="vi" />)
    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('worker-v5-discipline-rule-2')).toHaveTextContent(/Trừ 35 điểm/)
      expect(screen.getByTestId('worker-v5-discipline-rule-3')).toHaveTextContent(/khóa đổi thưởng 60 ngày/)
      expect(screen.getByTestId('worker-v5-discipline-rules')).toHaveTextContent(/không bao giờ bị trừ/)
      expect(screen.getByTestId('worker-v5-violations-empty')).toBeOnTheScreen()
    })
  })

  it('says a proposed case carries no penalty yet', () => {
    render(<WorkerV5Violations controller={controller([violation({ status: 'proposed', decided_at: null, appeal_deadline_at: null, consequences: [] })])} language="vi" />)
    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('worker-v5-violation-case-1')).toHaveTextContent(/Chưa có hình phạt nào được áp dụng/)
      expect(screen.queryByTestId('worker-v5-appeal-form-case-1')).toBeNull()
    })
  })

  it('marks a cleared case and its restored consequences', () => {
    render(<WorkerV5Violations
      controller={controller([violation({ appeal_status: 'overturned', consequences: [{ entry_kind: 'points_forfeit', effective_until: null, restored: true }] })])}
      language="vi"
    />)
    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('worker-v5-violation-status-case-1')).toHaveTextContent(/Đã minh oan/)
      expect(screen.getByTestId('worker-v5-violation-case-1')).toHaveTextContent(/Mất toàn bộ điểm chưa đổi · đã khôi phục/)
      expect(screen.queryByTestId('worker-v5-appeal-form-case-1')).toBeNull()
    })
  })

  it('offers an appeal only inside the window, with the days left', () => {
    const view = render(<WorkerV5Violations controller={controller([violation()])} language="vi" />)
    withPillarContext(PILLAR, () => expect(screen.getByTestId('worker-v5-appeal-form-case-1')).toHaveTextContent(/Còn 3 ngày/))
    view.unmount()
    render(<WorkerV5Violations controller={controller([violation({ appeal_deadline_at: new Date(Date.now() - 1000).toISOString() })])} language="vi" />)
    withPillarContext(PILLAR, () => expect(screen.queryByTestId('worker-v5-appeal-form-case-1')).toBeNull())
  })

  it('will not send a reason shorter than the server minimum', () => {
    const view = controller([violation()])
    render(<WorkerV5Violations controller={view} language="vi" />)
    fireEvent.changeText(screen.getByTestId('worker-v5-appeal-reason-case-1'), 'Tôi bị oan')
    fireEvent.press(screen.getByTestId('worker-v5-appeal-submit-case-1'))
    withPillarContext(PILLAR, () => expect(view.submitAppeal).not.toHaveBeenCalled())
    fireEvent.changeText(screen.getByTestId('worker-v5-appeal-reason-case-1'), 'Tôi chỉ nhắn số để báo đến trễ, không hẹn làm ngoài app.')
    fireEvent.press(screen.getByTestId('worker-v5-appeal-submit-case-1'))
    withPillarContext(PILLAR, () => expect(view.submitAppeal).toHaveBeenCalledWith('case-1', 'Tôi chỉ nhắn số để báo đến trễ, không hẹn làm ngoài app.', []))
  })
})
