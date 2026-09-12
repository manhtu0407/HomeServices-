import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import type { ComponentProps } from 'react'
import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import type { AdminViewWorkerApplicationSummary, AdminViewWorkerReviewDetail, AdminWorkerFinanceSnapshotResponse } from '@/lib/api-types/admin'
import { adminControlService } from '@/lib/services'
import { AdminWorkerReviewModal } from '../admin-worker-review-modal'
import { adminSectionsCopy } from '../admin-sections-copy'

jest.mock('@/lib/services', () => ({ adminControlService: {
  getWorkerReviewDetail: jest.fn(), getWorkerFinanceSnapshot: jest.fn(), decideWorkerProfile: jest.fn(),
} }))

let mockReviewSession: { user: { id: string }; access_token: string } | null
let mockReviewRole: string
jest.mock('@/lib/auth-provider', () => ({ useAuth: () => ({ session: mockReviewSession, role: mockReviewRole }) }))

export const PILLAR = {
  id: 'P173-admin-worker-review-snapshot-ui',
  invariant: 'Admin KYC confirmation submits the displayed snapshot once and does not misreport an unknown outcome or close another Worker review',
  authority: ['governance/RULES.md #0', 'governance/design/accessible-content.md'],
  target: 'apps/mobile/components/admin/admin-worker-review-modal.tsx',
  layer: 'integration',
  siblings: ['P172-admin-worker-review-snapshot'],
  mutation: 'omit the displayed queue/revision or the in-flight guard; exact-payload, missing-snapshot and double-press assertions fail',
} as const satisfies PillarManifest

const worker: AdminViewWorkerApplicationSummary = {
  id: 'd7700000-0000-4000-8000-000000000001', worker_id: 'd7700000-0000-4000-8000-000000000002',
  status: 'resolved', submitted_at: '2026-09-10T00:00:00Z', updated_at: '2026-09-10T00:00:00Z',
  contact_type: 'email', contact_suffix: null, source: null, language: 'vi', account_role: 'worker',
  full_name: 'Review fixture', phone_masked: null, stage: 'ready_verification',
  checklist: { completed_count: 11, total_count: 11, missing: [] },
  profile_review_queue_id: 'd7700000-0000-4000-8000-000000000003',
  worker_profile: { verification_status: 'submitted', is_approved: false, is_suspended: false, service_types: ['electrical'], districts: ['q1'], has_cccd: true, has_selfie: true },
  review: null,
}
const detail = {
  application: { ...worker, profile_review_queue_id: 'd7700000-0000-4000-8000-000000000004' },
  login_gates: { email: null, phone: null, full_name: 'Review fixture', created_at: null },
  profile: {
    updated_at: '2026-09-10T00:00:00.123456+00:00', legal_name: 'Review fixture', date_of_birth: null, gender: null,
    service_types: ['electrical'], years_experience: 3, districts: ['q1'], service_radius_km: 5,
    problem_specializations: [], bank_account: null, bank_name: null,
    documents: { cccd_front_url: null, cccd_back_url: null, selfie_url: null, expires_at: null },
  }, history: [],
} satisfies AdminViewWorkerReviewDetail

function props(language: 'vi' | 'en' = 'vi'): ComponentProps<typeof AdminWorkerReviewModal> {
  return {
    worker, actionPending: null, canManage: false, canReadFinance: false, canReview: true,
    copy: adminSectionsCopy[language], formatDate: value => value ?? '', language,
    onAccessApprove: jest.fn(), onAccessReject: jest.fn(), onAccessRequestChanges: jest.fn(),
    onClose: jest.fn(), onRefresh: jest.fn(async () => undefined), onReinstate: jest.fn(), onSuspend: jest.fn(),
    reduceMotion: true, serviceLabel: () => language === 'vi' ? 'Điện' : 'Electrical',
  }
}

beforeEach(() => {
  jest.resetAllMocks()
  mockReviewSession = { user: { id: 'd7700000-0000-4000-8000-000000000008' }, access_token: 'reviewer-fixture-token' }
  mockReviewRole = 'admin'
  jest.mocked(adminControlService.getWorkerReviewDetail).mockResolvedValue({ success: true, data: detail, status: 200 })
  jest.mocked(adminControlService.decideWorkerProfile).mockImplementation(() => new Promise(() => undefined))
})

it.each(['signed_out', 'customer'] as const)('does not fetch or expose a KYC review for %s', async state => {
  if (state === 'signed_out') mockReviewSession = null
  else mockReviewRole = 'customer'
  render(<AdminWorkerReviewModal {...props()} />)
  expect(screen.queryByTestId('admin-worker-review-detail')).toBeNull()
  expect(adminControlService.getWorkerReviewDetail).not.toHaveBeenCalled()
})

it('binds review reads and mutations to the initiating reviewer token', async () => {
  jest.mocked(adminControlService.getWorkerFinanceSnapshot).mockResolvedValue({ success: false, status: 503, code: 'UNAVAILABLE', error: 'unavailable' })
  render(<AdminWorkerReviewModal {...props()} canReadFinance />)
  fireEvent.press(await screen.findByText('Xác minh hồ sơ'))
  expect(adminControlService.getWorkerReviewDetail).toHaveBeenCalledWith(worker.id, 'reviewer-fixture-token')
  expect(adminControlService.getWorkerFinanceSnapshot).toHaveBeenCalledWith(worker.worker_id, {}, 'reviewer-fixture-token')
  expect(jest.mocked(adminControlService.decideWorkerProfile).mock.calls[0]).toEqual([
    worker.id, expect.objectContaining({ decision: 'approve' }), 'reviewer-fixture-token',
  ])
})

it('does not apply an old reviewer receipt after account switch with the same Worker selected', async () => {
  const pending = deferred<Awaited<ReturnType<typeof adminControlService.decideWorkerProfile>>>()
  jest.mocked(adminControlService.decideWorkerProfile).mockReturnValue(pending.promise)
  const options = props()
  const view = render(<AdminWorkerReviewModal {...options} />)
  fireEvent.press(await screen.findByText('Xác minh hồ sơ'))
  mockReviewSession = { user: { id: 'd7700000-0000-4000-8000-000000000009' }, access_token: 'second-reviewer-fixture-token' }
  view.rerender(<AdminWorkerReviewModal {...options} />)
  await act(async () => pending.resolve(approved))
  expect(options.onRefresh).not.toHaveBeenCalled()
  expect(options.onClose).not.toHaveBeenCalled()
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

const nextWorker = { ...worker, id: 'd7700000-0000-4000-8000-000000000005', worker_id: 'd7700000-0000-4000-8000-000000000006', full_name: 'Next review' }
const nextDetail = { ...detail, application: nextWorker, profile: { ...detail.profile, bank_name: 'NEXT_BANK' } }
const approved = { success: true as const, status: 200, data: {
  ok: true as const, application_id: worker.id, worker_id: worker.worker_id, decision: 'approve' as const,
  verification_status: 'approved' as const, decided_at: '2026-09-10T01:00:00Z',
} }

it('discards a detail retry that finishes after a different Worker is selected', async () => {
  const retry = deferred<Awaited<ReturnType<typeof adminControlService.getWorkerReviewDetail>>>()
  jest.mocked(adminControlService.getWorkerReviewDetail)
    .mockResolvedValueOnce({ success: false, status: 503, code: 'UNAVAILABLE', error: 'unavailable' })
    .mockReturnValueOnce(retry.promise)
    .mockResolvedValueOnce({ success: true, status: 200, data: nextDetail })
  const options = props()
  const view = render(<AdminWorkerReviewModal {...options} />)
  fireEvent.press(await screen.findByText('Thử lại'))
  view.rerender(<AdminWorkerReviewModal {...options} worker={nextWorker} />)
  expect(await screen.findByText('NEXT_BANK')).toBeTruthy()
  await act(async () => retry.resolve({ success: true, status: 200, data: { ...detail, profile: { ...detail.profile, bank_name: 'OLD_PRIVATE_BANK' } } }))
  expect(screen.queryByText('OLD_PRIVATE_BANK')).toBeNull()
  expect(screen.getByText('NEXT_BANK')).toBeTruthy()
})

it('rejects mismatched detail identity before rendering private fields', async () => {
  jest.mocked(adminControlService.getWorkerReviewDetail).mockResolvedValue({ success: true, status: 200, data: nextDetail })
  render(<AdminWorkerReviewModal {...props()} />)
  expect(await screen.findByRole('button', { name: 'Thử lại' })).toBeTruthy()
  expect(screen.queryByText('NEXT_BANK')).toBeNull()
  expect(screen.queryByText('Xác minh hồ sơ')).toBeNull()
})

const finance: AdminWorkerFinanceSnapshotResponse = {
  worker_id: worker.worker_id, total_jobs_paid: 1, gross_earnings: 999000, platform_fee_total: 0,
  net_earnings: 999000, available_balance: 999000, withdrawal_reserved_amount: 0, withdrawn_total: 0,
  cash_commission_collected_total: 0, cash_commission_due_total: 0, pending_payment_count: 0,
  pending_payment_amount: 0, provisional_payment_count: 0, provisional_payment_amount: 0,
  on_hold_amount: 0, current_commission_level: 1, current_commission_rate_bps: 1500,
  withdrawal_eligible_at: null, recent_transactions: [], daily_earnings: [], from_date: '2026-09-01', to_date: '2026-09-12',
}

it.each(['selection', 'permission'] as const)('does not show late finance data after a %s change', async change => {
  const pending = deferred<Awaited<ReturnType<typeof adminControlService.getWorkerFinanceSnapshot>>>()
  jest.mocked(adminControlService.getWorkerFinanceSnapshot)
    .mockReturnValueOnce(pending.promise).mockResolvedValue({ success: false, status: 503, code: 'UNAVAILABLE', error: 'unavailable' })
  const options = { ...props(), canReadFinance: true }
  const view = render(<AdminWorkerReviewModal {...options} />)
  await screen.findByText('Xác minh hồ sơ')
  if (change === 'selection') {
    jest.mocked(adminControlService.getWorkerReviewDetail).mockResolvedValue({ success: true, status: 200, data: nextDetail })
    view.rerender(<AdminWorkerReviewModal {...options} worker={nextWorker} />)
    await screen.findByText('NEXT_BANK')
  } else {
    view.rerender(<AdminWorkerReviewModal {...options} canReadFinance={false} />)
    await screen.findByText('Xác minh hồ sơ')
  }
  await act(async () => pending.resolve({ success: true, status: 200, data: finance }))
  expect(screen.queryByText(/999[.,]000/)).toBeNull()
})

it('retains known success when refreshing the list fails and retries only the read', async () => {
  jest.mocked(adminControlService.decideWorkerProfile).mockResolvedValue(approved)
  const options = props()
  jest.mocked(options.onRefresh).mockRejectedValueOnce(new Error('PRIVATE_REFRESH')).mockResolvedValueOnce(undefined)
  render(<AdminWorkerReviewModal {...options} />)
  fireEvent.press(await screen.findByText('Xác minh hồ sơ'))
  expect(await screen.findByText('Quyết định đã được lưu, nhưng chưa tải lại được danh sách.')).toBeTruthy()
  expect(screen.queryByText(/Chưa xác định được kết quả/)).toBeNull()
  expect(screen.queryByRole('button', { name: 'Xác minh hồ sơ' })).toBeNull()
  fireEvent.press(screen.getByRole('button', { name: 'Tải lại danh sách' }))
  await waitFor(() => expect(options.onClose).toHaveBeenCalledTimes(1))
  expect(adminControlService.decideWorkerProfile).toHaveBeenCalledTimes(1)
  expect(options.onRefresh).toHaveBeenCalledTimes(2)
})

it('freezes an unknown decision and its reason so reconciliation replays exactly the original command', async () => {
  jest.mocked(adminControlService.decideWorkerProfile).mockRejectedValue(new Error('transport'))
  render(<AdminWorkerReviewModal {...props()} />)
  fireEvent.press(await screen.findByText('Yêu cầu bổ sung'))
  fireEvent.changeText(screen.getByLabelText('Nêu rõ nội dung thợ cần bổ sung'), 'Ảnh mặt sau chưa rõ')
  fireEvent.press(screen.getByRole('button', { name: 'Yêu cầu bổ sung' }))
  await screen.findByText('Chưa xác định được kết quả. Thử lại cùng quyết định để đối soát.')
  expect(screen.getByLabelText('Nêu rõ nội dung thợ cần bổ sung')).toHaveProp('editable', false)
  fireEvent.changeText(screen.getByLabelText('Nêu rõ nội dung thợ cần bổ sung'), 'Lý do khác')
  expect(screen.queryByRole('button', { name: 'Tải lại hồ sơ' })).toBeNull()
  fireEvent.press(screen.getByRole('button', { name: 'Đối soát quyết định' }))
  await waitFor(() => expect(adminControlService.decideWorkerProfile).toHaveBeenCalledTimes(2))
  expect(jest.mocked(adminControlService.decideWorkerProfile).mock.calls[1]).toEqual(jest.mocked(adminControlService.decideWorkerProfile).mock.calls[0])
})

it('does not cancel an in-flight decision when the list returns an equivalent Worker object', async () => {
  const pending = deferred<Awaited<ReturnType<typeof adminControlService.decideWorkerProfile>>>()
  jest.mocked(adminControlService.decideWorkerProfile).mockReturnValue(pending.promise)
  const options = props()
  const view = render(<AdminWorkerReviewModal {...options} />)
  fireEvent.press(await screen.findByText('Xác minh hồ sơ'))
  view.rerender(<AdminWorkerReviewModal {...options} worker={{ ...worker }} />)
  await act(async () => pending.resolve(approved))
  await waitFor(() => expect(options.onClose).toHaveBeenCalledTimes(1))
  expect(adminControlService.getWorkerReviewDetail).toHaveBeenCalledTimes(1)
})

it('submits the queue and microsecond revision displayed in the detail, not the stale list row', async () => {
  render(<AdminWorkerReviewModal {...props()} />)
  fireEvent.press(await screen.findByText('Xác minh hồ sơ'))
  withPillarContext(PILLAR, () => expect(adminControlService.decideWorkerProfile).toHaveBeenCalledWith(worker.id, {
    decision: 'approve', profile_review_queue_id: detail.application.profile_review_queue_id,
    expected_profile_updated_at: detail.profile.updated_at,
  }, 'reviewer-fixture-token'))
})

it.each(['revision', 'queue'] as const)('does not submit without a displayed %s', async missing => {
  jest.mocked(adminControlService.getWorkerReviewDetail).mockResolvedValue({ success: true, status: 200, data: {
    ...detail, profile: { ...detail.profile, updated_at: missing === 'revision' ? null : detail.profile.updated_at },
    application: { ...detail.application, profile_review_queue_id: missing === 'queue' ? null : detail.application.profile_review_queue_id },
  } })
  render(<AdminWorkerReviewModal {...props()} />)
  const button = await screen.findByRole('button', { name: 'Xác minh hồ sơ' })
  expect(button).toBeDisabled()
  fireEvent.press(button)
  expect(adminControlService.decideWorkerProfile).not.toHaveBeenCalled()
})

it('fences two presses in one render before pending state can update', async () => {
  render(<AdminWorkerReviewModal {...props()} />)
  const button = await screen.findByRole('button', { name: 'Xác minh hồ sơ' })
  act(() => { fireEvent.press(button); fireEvent.press(button) })
  expect(adminControlService.decideWorkerProfile).toHaveBeenCalledTimes(1)
})

it.each([
  ['vi', 'Xác minh hồ sơ', 'Chưa xác định được kết quả. Thử lại cùng quyết định để đối soát.'],
  ['en', 'Verify profile', 'The outcome is not confirmed. Retry the same decision to reconcile.'],
] as const)('keeps a thrown transport outcome honest in %s', async (language, action, message) => {
  jest.mocked(adminControlService.decideWorkerProfile).mockRejectedValue(new Error('PRIVATE_TRANSPORT_SENTINEL'))
  const options = props(language)
  render(<AdminWorkerReviewModal {...options} />)
  fireEvent.press(await screen.findByText(action))
  expect(await screen.findByText(message)).toBeTruthy()
  expect(screen.getByText(/NSL-[A-Z0-9-]+/)).toBeTruthy()
  expect(options.onClose).not.toHaveBeenCalled()
  expect(screen.queryByText('PRIVATE_TRANSPORT_SENTINEL')).toBeNull()
})

it('does not let an old request close the next Worker modal', async () => {
  let finish!: (result: Awaited<ReturnType<typeof adminControlService.decideWorkerProfile>>) => void
  jest.mocked(adminControlService.decideWorkerProfile).mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const options = props()
  const view = render(<AdminWorkerReviewModal {...options} />)
  fireEvent.press(await screen.findByText('Xác minh hồ sơ'))
  view.rerender(<AdminWorkerReviewModal {...options} worker={{ ...worker, id: 'd7700000-0000-4000-8000-000000000005' }} />)
  await act(async () => finish({ success: true, status: 200, data: {
    ok: true, application_id: worker.id, worker_id: worker.worker_id, decision: 'approve',
    verification_status: 'approved', decided_at: '2026-09-10T01:00:00Z',
  } }))
  await waitFor(() => expect(options.onClose).not.toHaveBeenCalled())
})

it('does not close the review when HTTP success contains a receipt for another Worker', async () => {
  jest.mocked(adminControlService.decideWorkerProfile).mockResolvedValue({ success: true, status: 200, data: {
    ok: true, application_id: worker.id, worker_id: 'd7700000-0000-4000-8000-000000000009',
    decision: 'approve', verification_status: 'approved', decided_at: '2026-09-10T01:00:00Z',
  } })
  const options = props()
  render(<AdminWorkerReviewModal {...options} />)
  fireEvent.press(await screen.findByText('Xác minh hồ sơ'))
  expect(await screen.findByText('Chưa xác định được kết quả. Thử lại cùng quyết định để đối soát.')).toBeTruthy()
  expect(screen.getByText(/NSL-[A-Z0-9-]+/)).toBeTruthy()
  expect(options.onClose).not.toHaveBeenCalled()
  expect(options.onRefresh).not.toHaveBeenCalled()
})

it.each([
  ['vi', 'Quyền truy cập · Đã duyệt', '3 năm'],
  ['en', 'Access · Approved', '3 years'],
] as const)('uses the Admin locale for review history and experience in %s', async (language, history, experience) => {
  jest.mocked(adminControlService.getWorkerReviewDetail).mockResolvedValue({ success: true, status: 200, data: {
    ...detail, history: [{ stage: 'access', decision: 'approve', reason: null, decided_at: '2026-09-10T01:00:00Z', decided_by_name: null }],
  } })
  render(<AdminWorkerReviewModal {...props(language)} />)
  expect(await screen.findByText(history)).toBeTruthy()
  expect(screen.getByText(experience)).toBeTruthy()
  expect(screen.queryByText(/· approve$/)).toBeNull()
})
