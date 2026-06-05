import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import AdminDashboard from '../dashboard'
import { adminLearningService } from '@/lib/services'
import type { KaelLearningCandidateSummary } from '@/lib/api-types'

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn() }),
}))

jest.mock('@/lib/auth-provider', () => ({
  useAuth: () => ({ signOut: jest.fn() }),
}))

jest.mock('@/lib/services', () => ({
  adminLearningService: {
    approveCandidate: jest.fn(),
    listCandidates: jest.fn(),
    rejectCandidate: jest.fn(),
  },
}))

const candidate: KaelLearningCandidateSummary = {
  id: 'candidate-1',
  candidate_type: 'service_knowledge_candidate',
  affected_service: 'cleaning',
  affected_problem: 'deep_clean',
  affected_district: 'q7',
  confidence: 0.7,
  evidence_count: 3,
  status: 'manual_review',
  audit_reason: null,
  created_at: '2026-06-04T00:00:00.000Z',
  updated_at: '2026-06-04T00:00:00.000Z',
  promoted_at: null,
  rolled_back_at: null,
  suggested_payload: { skill_id: 'LS5' },
  evidence_snapshot: { source: 'completed_reviewed_jobs' },
}

describe('AdminDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(Date, 'now').mockReturnValue(new Date('2026-06-08T00:00:00.000Z').getTime())
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('renders manual review learning candidates and approves one through the admin service', async () => {
    jest.mocked(adminLearningService.listCandidates)
      .mockResolvedValueOnce({ success: true, data: { candidates: [candidate] }, status: 200 })
      .mockResolvedValueOnce({ success: true, data: { candidates: [] }, status: 200 })
    jest.mocked(adminLearningService.approveCandidate)
      .mockResolvedValueOnce({
        success: true,
        data: {
          ok: true,
          candidate_id: 'candidate-1',
          rule_id: 'rule-1',
          rule_version: 1,
          status: 'auto_promoted',
          knowledge_apply: {
            ok: true,
            error_code: null,
            knowledge_table: 'service_knowledge_boxes',
            record_key: 'plumbing:pipe_leak',
            knowledge_version: 1,
          },
        },
        status: 200,
      })

    render(<AdminDashboard />)

    expect(await screen.findByText('Tri thức dịch vụ')).toBeTruthy()
    expect(screen.getByText('Nguồn: Việc đã hoàn tất và được đánh giá')).toBeTruthy()
    expect(screen.getByText('Quá hạn 3 ngày')).toBeTruthy()
    fireEvent.press(screen.getByTestId('admin-learning-approve-candidate-1'))

    await waitFor(() => {
      expect(adminLearningService.approveCandidate).toHaveBeenCalledWith('candidate-1')
    })
    expect(await screen.findByText('Đã duyệt đề xuất học của Kael.')).toBeTruthy()
  })

  it('requires a reject reason before rejecting a learning candidate', async () => {
    jest.mocked(adminLearningService.listCandidates)
      .mockResolvedValueOnce({ success: true, data: { candidates: [candidate] }, status: 200 })
      .mockResolvedValueOnce({ success: true, data: { candidates: [] }, status: 200 })
    jest.mocked(adminLearningService.rejectCandidate)
      .mockResolvedValueOnce({
        success: true,
        data: { ok: true, candidate_id: 'candidate-1', status: 'archived' },
        status: 200,
      })

    render(<AdminDashboard />)

    expect(await screen.findByText('Tri thức dịch vụ')).toBeTruthy()
    fireEvent.press(screen.getByTestId('admin-learning-reject-candidate-1'))
    expect(await screen.findByText('Nhập lý do từ chối trước khi lưu quyết định.')).toBeTruthy()
    expect(adminLearningService.rejectCandidate).not.toHaveBeenCalled()

    fireEvent.changeText(screen.getByTestId('admin-learning-reason-candidate-1'), 'insufficient_evidence')
    fireEvent.press(screen.getByTestId('admin-learning-reject-candidate-1'))

    await waitFor(() => {
      expect(adminLearningService.rejectCandidate).toHaveBeenCalledWith('candidate-1', {
        reason: 'insufficient_evidence',
      })
    })
  })
})
