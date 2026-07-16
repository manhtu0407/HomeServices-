import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import AdminDashboard from '../dashboard'
import { adminLearningService } from '@/lib/services'
import type { KaelLearningCandidateSummary } from '@/lib/api-types'

let mockLanguage: 'en' | 'vi' = 'vi'

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn() }),
}))

jest.mock('@/lib/app-language', () => {
  const actual = jest.requireActual('@/lib/app-language')
  return {
    ...actual,
    useAppLanguage: () => mockLanguage,
  }
})

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

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('AdminDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockLanguage = 'vi'
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
    expect(screen.getByText('Quá thời hạn duyệt 3 ngày')).toBeTruthy()
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

  it('keeps a newer refresh result when the initial request resolves last', async () => {
    const initialRequest = deferred<{
      data: { candidates: KaelLearningCandidateSummary[] }
      status: number
      success: true
    }>()
    const refreshRequest = deferred<{
      data: { candidates: KaelLearningCandidateSummary[] }
      status: number
      success: true
    }>()
    const refreshedCandidate = { ...candidate, id: 'candidate-refreshed' }
    jest.mocked(adminLearningService.listCandidates)
      .mockReturnValueOnce(initialRequest.promise)
      .mockReturnValueOnce(refreshRequest.promise)

    render(<AdminDashboard />)
    expect(screen.getByText('Đang tải số đề xuất...')).toBeTruthy()
    expect(screen.queryByText('0 đề xuất chờ duyệt')).toBeNull()
    fireEvent.press(screen.getByTestId('admin-learning-refresh'))

    await act(async () => {
      refreshRequest.resolve({
        success: true,
        data: { candidates: [refreshedCandidate] },
        status: 200,
      })
      await Promise.resolve()
    })
    expect(screen.getByTestId('admin-learning-candidate-candidate-refreshed')).toBeTruthy()

    await act(async () => {
      initialRequest.resolve({ success: true, data: { candidates: [candidate] }, status: 200 })
      await Promise.resolve()
    })
    expect(screen.getByTestId('admin-learning-candidate-candidate-refreshed')).toBeTruthy()
    expect(screen.queryByTestId('admin-learning-candidate-candidate-1')).toBeNull()
  })

  it('renders complete English review copy and never exposes a raw Vietnamese action error', async () => {
    const rawBackendError = 'Bạn không có quyền duyệt đề xuất này.'
    mockLanguage = 'en'
    jest.mocked(adminLearningService.listCandidates)
      .mockResolvedValueOnce({ success: true, data: { candidates: [candidate] }, status: 200 })
    jest.mocked(adminLearningService.approveCandidate)
      .mockResolvedValueOnce({ success: false, code: 'forbidden', error: rawBackendError, status: 403 })

    const view = render(<AdminDashboard />)

    expect(await screen.findByText('Service knowledge')).toBeTruthy()
    expect(screen.getByText('Kael administration')).toBeTruthy()
    expect(screen.getByText('Review learning proposals')).toBeTruthy()
    expect(screen.getByText('1 learning proposal awaiting review')).toBeTruthy()
    expect(screen.getByText('LS5 · Home cleaning')).toBeTruthy()
    expect(screen.getByText('Past the 3-day review window')).toBeTruthy()
    expect(screen.getByText('Awaiting review')).toBeTruthy()
    expect(screen.getByText('Evidence')).toBeTruthy()
    expect(screen.getByText('Confidence')).toBeTruthy()
    expect(screen.getByText('Area')).toBeTruthy()
    expect(screen.getByText('Problem code: deep_clean')).toBeTruthy()
    expect(screen.getByText('Source: Completed and reviewed jobs')).toBeTruthy()
    expect(screen.getByLabelText('Rejection reason')).toBeTruthy()
    expect(screen.getByText('Switch account')).toBeTruthy()
    expect(screen.getByText('Sign out')).toBeTruthy()

    fireEvent.press(screen.getByTestId('admin-learning-reject-candidate-1'))
    expect(await screen.findByText('Enter a rejection reason before saving this decision.')).toBeTruthy()

    fireEvent.press(screen.getByTestId('admin-learning-approve-candidate-1'))

    expect(await screen.findByText('Unable to approve this proposal right now. Please try again.')).toBeTruthy()
    expect(screen.queryByText(rawBackendError)).toBeNull()
    expect(JSON.stringify(view.toJSON())).not.toMatch(/[À-ỹĐđ]/)
  })

  it('maps a raw list failure to the selected-language safe error', async () => {
    const rawBackendError = 'Không thể tải vì lỗi nội bộ.'
    mockLanguage = 'en'
    jest.mocked(adminLearningService.listCandidates)
      .mockResolvedValueOnce({ success: false, code: 'internal_error', error: rawBackendError, status: 500 })

    render(<AdminDashboard />)

    expect(await screen.findByText('Unable to load the review queue right now. Please try again.')).toBeTruthy()
    expect(screen.getByText('Review count unavailable')).toBeTruthy()
    expect(screen.queryByText('0 learning proposals awaiting review')).toBeNull()
    expect(screen.queryByText(rawBackendError)).toBeNull()
  })

  it('maps a raw rejection failure to the selected-language safe error', async () => {
    const rawBackendError = 'Không thể từ chối vì lỗi nội bộ.'
    mockLanguage = 'en'
    jest.mocked(adminLearningService.listCandidates)
      .mockResolvedValueOnce({ success: true, data: { candidates: [candidate] }, status: 200 })
    jest.mocked(adminLearningService.rejectCandidate)
      .mockResolvedValueOnce({ success: false, code: 'internal_error', error: rawBackendError, status: 500 })

    render(<AdminDashboard />)

    expect(await screen.findByText('Service knowledge')).toBeTruthy()
    fireEvent.changeText(screen.getByTestId('admin-learning-reason-candidate-1'), 'insufficient_evidence')
    fireEvent.press(screen.getByTestId('admin-learning-reject-candidate-1'))

    expect(await screen.findByText('Unable to reject this proposal right now. Please try again.')).toBeTruthy()
    expect(screen.queryByText(rawBackendError)).toBeNull()
  })
})
