import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import AdminSections from '../sections'
import type {
  AdminViewOperationsResponse,
  AdminViewDisputeSummary,
  AdminViewPriceBaselineSummary,
  AdminViewPayoutMethodSummary,
  AdminViewSubAdminAccountCandidate,
  AdminViewSubAdminSummary,
  AdminViewTransactionDetailResponse,
  AdminViewTransactionSummary,
  AdminViewWithdrawalRequestSummary,
  AdminViewWorkerApplicationSummary,
} from '@/lib/api-types/admin'
import { adminControlService } from '@/lib/services'

const workerApplication = {
  id: 'worker-application-1',
  worker_id: 'worker-1',
  status: 'open',
  submitted_at: '2026-08-08T04:10:00.000Z',
  updated_at: '2026-08-08T04:10:00.000Z',
  contact_type: 'phone',
  contact_suffix: '2814',
  source: 'password',
  language: 'vi',
  account_role: 'customer',
  full_name: 'Worker Application One',
  phone_masked: '•••• 2814',
  worker_profile: null,
  review: null,
} satisfies AdminViewWorkerApplicationSummary

const transaction = {
  job_id: 'job-1',
  display_code: 'NS-TEST-0001',
  service_type: 'plumbing',
  status: 'paid',
  payment_status: 'received',
  payment_provider: 'sepay_vietqr',
  gross_amount: 420000,
  platform_fee: 63000,
  worker_net: 357000,
  customer_name: 'Customer One',
  worker_name: 'Worker One',
  dispute_status: null,
  updated_at: '2026-08-08T03:20:00.000Z',
  paid_at: '2026-08-08T03:19:00.000Z',
} satisfies AdminViewTransactionSummary

const transactionDetail = {
  transaction,
  timeline: [
    { key: 'created', label_key: 'created', occurred_at: '2026-08-07T22:00:00.000Z' },
    { key: 'paid', label_key: 'paid', occurred_at: '2026-08-08T03:19:00.000Z' },
  ],
  ledger: {
    created_at: '2026-08-08T03:19:30.000Z',
    payment_state: 'available',
    available_at: '2026-08-08T03:19:30.000Z',
    gross_amount: 420000,
    platform_fee: 63000,
    worker_net: 357000,
    commission_level: 1,
    commission_rate_bps: 1500,
    sepay_transaction_suffix: '1234',
    sepay_reference_suffix: '5678',
  },
} satisfies AdminViewTransactionDetailResponse

const dispute = {
  id: 'dispute-1',
  job_id: 'job-1',
  display_code: 'NS-TEST-0001',
  dispute_type: 'quality',
  initiated_by: 'customer',
  status: 'admin_review',
  created_at: '2026-08-08T03:20:00.000Z',
  updated_at: '2026-08-08T03:20:00.000Z',
  decided_at: null,
} satisfies AdminViewDisputeSummary

const priceBaseline = {
  id: 'price-baseline-1',
  service_type: 'handyman',
  district_code: 'hcmc_all',
  complexity: 'small',
  price_min: 150000,
  price_max: 300000,
  source: 'onefix_drill_or_mount_shelf_per_item_2026_07',
  version: 1,
  updated_at: '2026-08-01T00:00:00.000Z',
} satisfies AdminViewPriceBaselineSummary

function transactionAt(index: number) {
  return {
    ...transaction,
    job_id: `paged-job-${index}`,
    display_code: `NS-PAGE-${String(index).padStart(4, '0')}`,
  } satisfies AdminViewTransactionSummary
}

const payoutMethod = {
  id: 'payout-method-1',
  worker_id: 'worker-1',
  worker_name: 'Worker One',
  bank_key: 'VCB',
  bank_name: 'Vietcombank',
  bank_account_masked: '•••• 6789',
  status: 'pending_verification',
  reviewed_at: null,
  review_reason: null,
  created_at: '2026-08-08T03:20:00.000Z',
  updated_at: '2026-08-08T03:20:00.000Z',
} satisfies AdminViewPayoutMethodSummary

const withdrawalRequest = {
  id: 'withdrawal-request-1',
  worker_id: 'worker-1',
  worker_name: 'Worker One',
  amount_vnd: 250000,
  available_balance_before_vnd: 420000,
  bank_key: 'VCB',
  bank_name: 'Vietcombank',
  bank_account_masked: '•••• 6789',
  status: 'pending',
  requested_at: '2026-08-08T03:20:00.000Z',
  processing_at: null,
  processing_by_name: null,
  processed_at: null,
  processed_by_name: null,
  transfer_reference: null,
  resolution_reason: null,
  updated_at: '2026-08-08T03:20:00.000Z',
} satisfies AdminViewWithdrawalRequestSummary

const operations = {
  actor: {
    access_level: 'owner',
    capabilities: ['operations.read', 'workers.read', 'workers.review', 'workers.manage', 'transactions.read', 'payouts.read', 'payouts.process', 'team.read'],
  },
  generated_at: '2026-08-08T07:00:00.000Z',
  attention: [
    { key: 'worker_applications', target_section: 'workers', count: 1 },
    { key: 'payment_attention', target_section: 'transactions', count: 1 },
  ],
  flow: [{ status: 'repairing', count: 1 }],
  quality: [{ key: 'workers_in_verification', count: 1 }],
  audit_events: [{
    id: 'audit-1',
    actor_id: 'owner-1',
    actor_name: 'Owner Admin',
    actor_role: 'admin',
    action: 'review',
    topic: 'worker_application',
    decision: 'allow',
    occurred_at: '2026-08-08T06:00:00.000Z',
  }],
} satisfies AdminViewOperationsResponse

const subAdmin = {
  user_id: 'sub-admin-1',
  full_name: 'Operations Team One',
  phone_masked: '•••• 8801',
  baseline_role: 'worker',
  status: 'active',
  capabilities: ['operations.read', 'workers.read'],
  granted_at: '2026-08-08T05:00:00.000Z',
  updated_at: '2026-08-08T05:00:00.000Z',
  last_activity_at: null,
} satisfies AdminViewSubAdminSummary

const subAdminCandidate = {
  user_id: 'sub-admin-candidate-1',
  full_name: 'Registered Account One',
  phone_masked: '•••• 4422',
  role: 'customer',
} satisfies AdminViewSubAdminAccountCandidate

const managerNomination = {
  id: 'manager-nomination-1',
  user_id: subAdminCandidate.user_id,
  full_name: subAdminCandidate.full_name,
  phone_masked: subAdminCandidate.phone_masked,
  role: subAdminCandidate.role,
  nominated_at: '2026-08-09T05:00:00.000Z',
}

let mockLocalSearchParams: { ns_admin_section?: string | string[] } = {}
const mockReplace = jest.fn()
const mockRouter = { replace: mockReplace }
const mockSignOut = jest.fn()

jest.mock('expo-router', () => ({
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => mockLocalSearchParams,
  useRouter: () => mockRouter,
}))

jest.mock('@/lib/app-language', () => ({
  localizedStatusLabel: (status: string | null) => ({
    paid: 'Đã nhận thanh toán',
    repairing: 'Đang sửa',
  }[status ?? ''] ?? 'Chưa có phiếu'),
  useAppLanguage: () => 'vi',
}))

jest.mock('@/lib/auth-provider', () => ({
  useAuth: () => ({ signOut: mockSignOut, role: 'admin' }),
}))

jest.mock('@/lib/services', () => ({
  adminControlService: {
    decideWorkerApplication: jest.fn(),
    decidePayoutMethod: jest.fn(),
    getPayoutMethod: jest.fn(),
    nominateManager: jest.fn(),
    getOperations: jest.fn(),
    listAiCosts: jest.fn(),
    listDisputes: jest.fn(),
    listLearningRules: jest.fn(),
    getTransaction: jest.fn(),
    getWithdrawalRequest: jest.fn(),
    claimWithdrawalRequest: jest.fn(),
    listPayoutMethods: jest.fn(),
    listPriceBaselines: jest.fn(),
    listSubAdmins: jest.fn(),
    listTransactions: jest.fn(),
    listWithdrawalRequests: jest.fn(),
    cancelManagerNomination: jest.fn(),
    listWorkerApplications: jest.fn(),
    resolveWithdrawalRequest: jest.fn(),
    searchSubAdminAccounts: jest.fn(),
    setSubAdminAccess: jest.fn(),
    setWorkerAccess: jest.fn(),
  },
}))

function mockSuccessfulLoad() {
  jest.mocked(adminControlService.getOperations).mockResolvedValue({ success: true, data: operations, status: 200 })
  jest.mocked(adminControlService.listWorkerApplications).mockResolvedValue({
    success: true,
    data: { applications: [workerApplication], has_more: false, next_offset: null, total_count: 1 },
    status: 200,
  })
  jest.mocked(adminControlService.listTransactions).mockResolvedValue({
    success: true,
    data: { transactions: [transaction], has_more: false, next_offset: null, total_count: 1 },
    status: 200,
  })
  jest.mocked(adminControlService.listPayoutMethods).mockResolvedValue({
    success: true,
    data: { payout_methods: [payoutMethod], has_more: false, next_offset: null, total_count: 1 },
    status: 200,
  })
  jest.mocked(adminControlService.listWithdrawalRequests).mockResolvedValue({
    success: true,
    data: { withdrawal_requests: [withdrawalRequest], has_more: false, next_offset: null, total_count: 1 },
    status: 200,
  })
  jest.mocked(adminControlService.listSubAdmins).mockResolvedValue({
    success: true,
    data: { actor: operations.actor, members: [subAdmin], nominations: [] },
    status: 200,
  })
  jest.mocked(adminControlService.listDisputes).mockResolvedValue({
    success: true,
    data: { disputes: [dispute], has_more: false, next_offset: null, total_count: 1 },
    status: 200,
  })
  jest.mocked(adminControlService.listPriceBaselines).mockResolvedValue({
    success: true,
    data: { price_baselines: [priceBaseline], has_more: false, next_offset: null, total_count: 1 },
    status: 200,
  })
}

describe('AdminSections', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockLocalSearchParams = {}
    mockSignOut.mockResolvedValue(undefined)
  })

  it('confirms Admin sign-out before returning to Login Gates', async () => {
    mockSuccessfulLoad()

    render(<AdminSections />)

    await screen.findByTestId('admin-operations-overview')
    fireEvent.press(screen.getByTestId('admin-sign-out'))

    expect(await screen.findByTestId('admin-sign-out-confirmation')).toBeTruthy()
    fireEvent.press(screen.getByTestId('admin-sign-out-confirm'))

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledTimes(1)
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/login?stage=login')
    })
  })

  it('loads live operations, routes attention to the matching worker and transaction views, and exposes the real team', async () => {
    mockSuccessfulLoad()
    const secondTransaction = { ...transaction, display_code: 'NS-TEST-0002', job_id: 'job-2' }
    jest.mocked(adminControlService.listTransactions).mockResolvedValue({
      success: true,
      data: { transactions: [transaction, secondTransaction], has_more: false, next_offset: null, total_count: 2 },
      status: 200,
    })
    jest.mocked(adminControlService.getTransaction).mockResolvedValue({ success: true, data: transactionDetail, status: 200 })

    render(<AdminSections />)

    expect(screen.getByTestId('admin-sections-mint-aura')).toBeTruthy()
    expect(screen.queryByText('Khu vực quản trị')).toBeNull()
    expect(await screen.findByTestId('admin-operations-overview')).toBeTruthy()
    expect(screen.getByTestId('admin-sections-primary-navigation-active-lens')).toBeTruthy()
    expect(screen.getByTestId('admin-sections-primary-navigation-shimmer')).toBeTruthy()
    expect(screen.getByTestId('admin-sections-operation-navigation-active-lens')).toBeTruthy()
    expect(screen.queryByText('Dữ liệu minh họa cục bộ')).toBeNull()
    expect(adminControlService.getOperations).toHaveBeenCalled()
    expect(screen.getByText('Đang sửa')).toBeTruthy()
    expect(screen.getByText('Duyệt hồ sơ')).toBeTruthy()
    expect(screen.getByText('Quản trị viên chính · Hồ sơ thợ')).toBeTruthy()
    expect(screen.queryByText('repairing')).toBeNull()

    fireEvent.press(screen.getByTestId('admin-operation-attention-worker_applications'))
    expect(await screen.findByText('Worker Application One')).toBeTruthy()
    expect(adminControlService.listWorkerApplications).toHaveBeenCalledWith({ status: 'open', query: '', limit: 8, offset: 0 })

    fireEvent.press(screen.getByTestId('admin-sections-transactions-tab'))
    expect(await screen.findByText('NS-TEST-0001')).toBeTruthy()
    expect(screen.getByTestId('admin-transaction-job-1-formula-mint-aura')).toBeTruthy()
    expect(screen.getByTestId('admin-transaction-job-2-formula-mint-aura')).toBeTruthy()
    expect(screen.getAllByText('Công việc')).toHaveLength(2)
    expect(screen.getAllByText('Đã nhận thanh toán')).toHaveLength(2)
    expect(screen.getAllByText('Chuyển khoản qua mã QR')).toHaveLength(2)
    expect(screen.queryByText('Đã xử lý')).toBeNull()
    fireEvent.press(screen.getByTestId('admin-transaction-job-1'))
    expect(await screen.findByTestId('admin-transaction-detail')).toBeTruthy()
    expect(screen.getByTestId('admin-transaction-detail-formula-mint-aura')).toBeTruthy()
    expect(screen.getByTestId('admin-transaction-detail-amount-formula-mint-aura')).toBeTruthy()
    expect(screen.getByText('Sổ cái thợ')).toBeTruthy()
    expect(screen.getByText('Phí nền tảng')).toBeTruthy()

    fireEvent.press(screen.getByTestId('admin-sections-team-tab'))
    expect(await screen.findByTestId('admin-sub-admin-panel')).toBeTruthy()
    expect(screen.getByText('Operations Team One')).toBeTruthy()
  })

  it('shows eight service transactions per page and returns to the first page when searching', async () => {
    mockSuccessfulLoad()
    const firstPage = Array.from({ length: 8 }, (_, index) => transactionAt(index + 1))
    const secondPage = [transactionAt(9)]
    jest.mocked(adminControlService.listTransactions).mockImplementation(async ({ offset = 0 } = {}) => ({
      success: true,
      data: offset === 8
        ? { transactions: secondPage, has_more: false, next_offset: null, total_count: 9 }
        : { transactions: firstPage, has_more: true, next_offset: 8, total_count: 9 },
      status: 200,
    }))

    render(<AdminSections />)
    await screen.findByTestId('admin-operations-overview')
    fireEvent.press(screen.getByTestId('admin-sections-transactions-tab'))

    expect(await screen.findByText('NS-PAGE-0001')).toBeTruthy()
    expect(screen.queryByText('NS-PAGE-0009')).toBeNull()
    expect(adminControlService.listTransactions).toHaveBeenLastCalledWith({ query: '', limit: 8, offset: 0 })
    expect(screen.getByTestId('admin-transaction-page-previous')).toHaveStyle({ alignItems: 'center', justifyContent: 'center' })
    expect(screen.getByTestId('admin-transaction-page-next')).toHaveStyle({ alignItems: 'center', justifyContent: 'center' })
    expect(screen.getByTestId('admin-transaction-page-previous-chevron')).toHaveStyle({ height: 16, width: 16 })
    expect(screen.getByTestId('admin-transaction-page-next-chevron')).toHaveStyle({ height: 16, width: 16 })

    fireEvent.press(screen.getByTestId('admin-transaction-page-2'))
    expect(await screen.findByText('NS-PAGE-0009')).toBeTruthy()
    expect(screen.queryByText('NS-PAGE-0001')).toBeNull()
    expect(adminControlService.listTransactions).toHaveBeenLastCalledWith({ query: '', limit: 8, offset: 8 })

    fireEvent.changeText(screen.getByLabelText('Tìm theo tên, mã việc hoặc trạng thái'), 'QA')
    await waitFor(() => {
      expect(adminControlService.listTransactions).toHaveBeenLastCalledWith({ query: 'QA', limit: 8, offset: 0 })
    })
  })

  it('opens owner-only system monitoring with live dispute data', async () => {
    mockSuccessfulLoad()

    render(<AdminSections />)
    await screen.findByTestId('admin-operations-overview')
    fireEvent.press(screen.getByTestId('admin-sections-governance-tab'))

    expect(await screen.findByTestId('admin-governance-panel')).toBeTruthy()
    expect(await screen.findByText('NS-TEST-0001')).toBeTruthy()
    expect(adminControlService.listDisputes).toHaveBeenCalledWith({ limit: 8, offset: 0 })
  })

  it('localizes system-monitoring values instead of exposing internal price-source codes', async () => {
    mockSuccessfulLoad()

    render(<AdminSections />)
    await screen.findByTestId('admin-operations-overview')
    fireEvent.press(screen.getByTestId('admin-sections-governance-tab'))
    await screen.findByTestId('admin-governance-panel')
    fireEvent.press(screen.getByTestId('admin-governance-prices-tab'))

    expect(await screen.findByText('Sửa chữa vặt')).toBeTruthy()
    expect(screen.getByText('Nhỏ')).toBeTruthy()
    expect(screen.getByText('TP. Hồ Chí Minh · Phiên bản 1')).toBeTruthy()
    expect(screen.queryByText(priceBaseline.source)).toBeNull()
  })

  it('paginates worker applications with a server-reported total instead of rendering an unbounded list', async () => {
    mockSuccessfulLoad()
    const secondWorker = { ...workerApplication, id: 'worker-application-2', full_name: 'Worker Application Two' }
    jest.mocked(adminControlService.listWorkerApplications).mockImplementation(async ({ offset = 0 } = {}) => ({
      success: true,
      data: offset === 8
        ? { applications: [secondWorker], has_more: false, next_offset: null, total_count: 9 }
        : { applications: Array.from({ length: 8 }, (_, index) => ({ ...workerApplication, id: `worker-application-${index + 1}`, full_name: `Worker Application ${index + 1}` })), has_more: true, next_offset: 8, total_count: 9 },
      status: 200,
    }))

    render(<AdminSections />)
    await screen.findByTestId('admin-operations-overview')
    fireEvent.press(screen.getByTestId('admin-sections-worker-tab'))

    expect(await screen.findByText('Worker Application 1')).toBeTruthy()
    expect(screen.queryByText('Worker Application Two')).toBeNull()
    expect(adminControlService.listWorkerApplications).toHaveBeenLastCalledWith({ status: 'open', query: '', limit: 8, offset: 0 })

    fireEvent.press(screen.getByTestId('admin-worker-page-2'))
    expect(await screen.findByText('Worker Application Two')).toBeTruthy()
    expect(adminControlService.listWorkerApplications).toHaveBeenLastCalledWith({ status: 'open', query: '', limit: 8, offset: 8 })
  })

  it('sends worker approval decisions to the production service when the actor has workers.review', async () => {
    mockSuccessfulLoad()
    jest.mocked(adminControlService.decideWorkerApplication).mockResolvedValue({
      success: true,
      data: {
        ok: true,
        application_id: workerApplication.id,
        worker_id: workerApplication.worker_id,
        decision: 'approve',
        status: 'resolved',
        role: 'worker',
        verification_status: 'draft',
        decided_at: '2026-08-08T04:12:00.000Z',
      },
      status: 200,
    })

    render(<AdminSections />)
    await screen.findByTestId('admin-operations-overview')
    fireEvent.press(await screen.findByTestId('admin-operation-attention-worker_applications'))
    fireEvent.press(await screen.findByTestId(`admin-worker-approve-${workerApplication.id}`))

    await waitFor(() => {
      expect(adminControlService.decideWorkerApplication).toHaveBeenCalledWith(workerApplication.id, { decision: 'approve' })
    })
  })

  it('keeps full bank details out of the payout list and loads them only after an authorized admin opens the item', async () => {
    mockSuccessfulLoad()
    jest.mocked(adminControlService.getPayoutMethod).mockResolvedValue({
      success: true,
      data: { payout_method: { ...payoutMethod, account_holder_name: 'NGUYEN VAN A', bank_account: '0123456789' } },
      status: 200,
    })
    jest.mocked(adminControlService.decidePayoutMethod).mockResolvedValue({
      success: true,
      data: {
        ok: true,
        payout_method_id: payoutMethod.id,
        status: 'verified',
        reviewed_at: '2026-08-08T04:00:00.000Z',
      },
      status: 200,
    })

    render(<AdminSections />)
    await screen.findByTestId('admin-operations-overview')
    fireEvent.press(screen.getByTestId('admin-sections-transactions-tab'))
    fireEvent.press(await screen.findByTestId('admin-worker-payouts-tab'))

    expect(await screen.findByTestId('admin-payout-panel')).toBeTruthy()
    expect(await screen.findByTestId(`admin-payout-method-${payoutMethod.id}`)).toBeTruthy()
    expect(screen.getByTestId(`admin-payout-method-${payoutMethod.id}-formula-mint-aura`)).toBeTruthy()
    expect(screen.queryByText('0123456789')).toBeNull()

    fireEvent.press(screen.getByTestId(`admin-payout-method-${payoutMethod.id}`))
    expect(await screen.findByTestId('admin-payout-method-detail')).toBeTruthy()
    expect(adminControlService.getPayoutMethod).toHaveBeenCalledWith(payoutMethod.id)
    expect(screen.getByText('0123456789')).toBeTruthy()

    fireEvent.press(screen.getByText('Lưu'))
    await waitFor(() => {
      expect(adminControlService.decidePayoutMethod).toHaveBeenCalledWith(payoutMethod.id, { decision: 'verify' })
    })
  })

  it('opens the withdrawal queue directly from the withdrawal deep link', async () => {
    mockLocalSearchParams = { ns_admin_section: ['withdrawals'] }
    mockSuccessfulLoad()

    render(<AdminSections />)

    expect(await screen.findByTestId('admin-payout-panel')).toBeTruthy()
    expect(await screen.findByTestId(`admin-withdrawal-request-${withdrawalRequest.id}`)).toBeTruthy()
  })

  it('requires Owner nomination before a registered account can be granted Admin-team capability', async () => {
    mockSuccessfulLoad()
    jest.mocked(adminControlService.searchSubAdminAccounts).mockResolvedValue({
      success: true,
      data: { accounts: [subAdminCandidate] },
      status: 200,
    })
    jest.mocked(adminControlService.nominateManager).mockResolvedValue({
      success: true,
      data: {
        ok: true,
        nomination: managerNomination,
      },
      status: 200,
    })

    render(<AdminSections />)
    await screen.findByTestId('admin-operations-overview')
    fireEvent.press(await screen.findByTestId('admin-sections-team-tab'))
    fireEvent.press(await screen.findByLabelText('Đề cử quản lý'))
    fireEvent.changeText(await screen.findByLabelText('Tên hoặc số điện thoại'), 'Registered')
    fireEvent.press(screen.getByText('Tìm tài khoản'))
    fireEvent.press(await screen.findByText('Registered Account One'))
    fireEvent.press(screen.getByText('Đề cử'))

    await waitFor(() => {
      expect(adminControlService.nominateManager).toHaveBeenCalledWith(subAdminCandidate.user_id)
    })
  })

  it('shows an Owner nomination before opening the capability grant step', async () => {
    mockSuccessfulLoad()
    jest.mocked(adminControlService.setSubAdminAccess).mockResolvedValue({
      success: true,
      data: {
        ok: true,
        user_id: managerNomination.user_id,
        status: 'active',
        role: 'admin_operator',
        capabilities: ['operations.read'],
        updated_at: '2026-08-09T05:01:00.000Z',
      },
      status: 200,
    })
    jest.mocked(adminControlService.listSubAdmins).mockResolvedValue({
      success: true,
      data: { actor: operations.actor, members: [subAdmin], nominations: [managerNomination] },
      status: 200,
    })

    render(<AdminSections />)
    await screen.findByTestId('admin-operations-overview')
    fireEvent.press(await screen.findByTestId('admin-sections-team-tab'))

    expect(await screen.findByTestId(`admin-manager-nomination-${managerNomination.id}`)).toBeTruthy()
    expect(screen.getByText('Quản lý do Owner đề cử')).toBeTruthy()
    expect(screen.getByText('Chờ cấp quyền')).toBeTruthy()
    fireEvent.press(screen.getByTestId(`admin-manager-nomination-${managerNomination.id}-grant`))
    fireEvent.press(await screen.findByLabelText('Xem vận hành'))
    fireEvent.press(await screen.findByLabelText('Lưu quyền'))

    await waitFor(() => {
      expect(adminControlService.setSubAdminAccess).toHaveBeenCalledWith(managerNomination.user_id, {
        action: 'grant',
        capabilities: ['operations.read'],
      })
    })
  })

  it('shows the actual service failure without falling back to local sample content', async () => {
    jest.mocked(adminControlService.getOperations).mockResolvedValue({ success: false, code: 'internal_error', error: 'backend error', status: 500 })
    jest.mocked(adminControlService.listWorkerApplications).mockResolvedValue({ success: false, code: 'internal_error', error: 'backend error', status: 500 })
    jest.mocked(adminControlService.listTransactions).mockResolvedValue({ success: false, code: 'internal_error', error: 'backend error', status: 500 })
    jest.mocked(adminControlService.listSubAdmins).mockResolvedValue({ success: false, code: 'internal_error', error: 'backend error', status: 500 })

    render(<AdminSections />)

    expect(await screen.findByText('backend error')).toBeTruthy()
    expect(screen.queryByText('Dữ liệu minh họa cục bộ')).toBeNull()
    expect(screen.queryByText('NS-TEST-0001')).toBeNull()
  })

  it('returns an unauthenticated admin retry to Login Gates after the backend check', async () => {
    mockSuccessfulLoad()
    jest.mocked(adminControlService.getOperations).mockResolvedValue({
      success: false,
      code: 'AUTH_MISSING',
      error: 'Vui lòng đăng nhập',
      status: 401,
    })

    render(<AdminSections />)

    expect(await screen.findByText('Vui lòng đăng nhập')).toBeTruthy()
    const workerApplicationCallsBeforeRetry = jest.mocked(adminControlService.listWorkerApplications).mock.calls.length
    fireEvent.press(screen.getByText('Thử lại'))

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/login?stage=login')
    })
    expect(adminControlService.getOperations).toHaveBeenCalledTimes(2)
    expect(adminControlService.listWorkerApplications).toHaveBeenCalledTimes(workerApplicationCallsBeforeRetry)
  })
})
