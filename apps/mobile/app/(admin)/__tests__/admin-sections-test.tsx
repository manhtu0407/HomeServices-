import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { LinearGradient, Stop } from 'react-native-svg'
import AdminSections from '../sections'
import { component } from '@/design/theme'
import type {
  AdminViewOperationsResponse,
  AdminViewOverviewDetailsResponse,
  AdminViewDisputeSummary,
  AdminViewPriceBaselineSummary,
  AdminViewPayoutMethodSummary,
  AdminViewOperatorProvisioningSummary,
  AdminViewSubAdminAccountCandidate,
  AdminViewSubAdminSummary,
  AdminViewTransactionDetailResponse,
  AdminViewTransactionSummary,
  AdminViewWithdrawalRequestSummary,
  AdminViewWorkerApplicationSummary,
  AdminViewWorkerReviewDetail,
  AdminWorkerFinanceSnapshotResponse,
} from '@/lib/api-types/admin'
import { adminControlService } from '@/lib/services'

jest.mock('react-native-safe-area-context', () => {
  const actual = jest.requireActual('react-native-safe-area-context')
  return { ...actual, useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }) }
})

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
  stage: 'pending_access',
  checklist: { completed_count: 0, total_count: 11, missing: ['legal_name'] },
  profile_review_queue_id: null,
  worker_profile: null,
  review: null,
} satisfies AdminViewWorkerApplicationSummary

const readyWorkerApplication = {
  ...workerApplication,
  account_role: 'worker',
  checklist: { completed_count: 11, total_count: 11, missing: [] },
  full_name: 'Worker Ready To Verify',
  profile_review_queue_id: 'profile-queue-1',
  stage: 'ready_verification',
  worker_profile: {
    verification_status: 'submitted',
    is_approved: false,
    is_suspended: false,
    service_types: ['plumbing'],
    districts: ['quan_1'],
    has_cccd: true,
    has_selfie: true,
  },
} satisfies AdminViewWorkerApplicationSummary

const workerReviewDetail = {
  application: readyWorkerApplication,
  login_gates: { email: 'worker@gmail.com', phone: '+84901232814', full_name: readyWorkerApplication.full_name, created_at: '2026-08-07T04:10:00.000Z' },
  profile: {
    updated_at: '2026-08-08T04:12:00.123456+00:00',
    legal_name: 'NGUYEN VAN THO',
    date_of_birth: '1990-01-02',
    gender: null,
    service_types: ['plumbing'],
    years_experience: 6,
    districts: ['quan_1'],
    service_radius_km: 8,
    problem_specializations: [],
    bank_account: '0123456789',
    bank_name: 'Vietcombank',
    documents: {
      cccd_front_url: 'https://signed.test/front',
      cccd_back_url: 'https://signed.test/back',
      selfie_url: 'https://signed.test/selfie',
      expires_at: '2026-08-08T05:10:00.000Z',
    },
  },
  history: [{ stage: 'access', decision: 'approve', reason: null, decided_at: '2026-08-08T04:11:00.000Z', decided_by_name: 'Owner Admin' }],
} satisfies AdminViewWorkerReviewDetail

const workerFinanceSnapshot = {
  worker_id: 'worker-1',
  total_jobs_paid: 2,
  gross_earnings: 700000,
  platform_fee_total: 105000,
  net_earnings: 595000,
  available_balance: 420000,
  withdrawal_reserved_amount: 250000,
  withdrawn_total: 0,
  cash_commission_collected_total: 30000,
  cash_commission_due_total: 0,
  pending_payment_count: 1,
  pending_payment_amount: 200000,
  provisional_payment_count: 1,
  provisional_payment_amount: 200000,
  on_hold_amount: 200000,
  current_commission_level: 1,
  current_commission_rate_bps: 1500,
  withdrawal_eligible_at: '2026-08-09T03:20:00.000Z',
  recent_transactions: [],
  daily_earnings: [],
  from_date: '2026-08-01',
  to_date: '2026-08-08',
} satisfies AdminWorkerFinanceSnapshotResponse

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
  version: 1,
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
  processing_by_me: false,
  processed_at: null,
  processed_by_name: null,
  transfer_reference_suffix: null,
  resolution_reason: null,
  updated_at: '2026-08-08T03:20:00.000Z',
  version: 1,
} satisfies AdminViewWithdrawalRequestSummary

const operations = {
  actor: {
    access_level: 'owner',
    capabilities: ['operations.read', 'workers.read', 'workers.review', 'workers.manage', 'transactions.read', 'finance.read', 'payouts.read', 'payouts.process', 'team.read'],
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

const overviewInServiceDetails = {
  key: 'inService',
  generated_at: '2026-08-08T07:00:00.000Z',
  total_count: 1,
  status_breakdown: [{ key: 'repairing', count: 1 }],
  service_breakdown: [{ key: 'plumbing', count: 1 }],
  oldest_updated_at: '2026-08-08T06:30:00.000Z',
  records: [{
    kind: 'job',
    job_id: 'job-1',
    display_code: 'NS-JOB-001',
    service_type: 'plumbing',
    status: 'repairing',
    updated_at: '2026-08-08T06:30:00.000Z',
  }],
  has_more: false,
  next_cursor: null,
} satisfies AdminViewOverviewDetailsResponse

const subAdmin = {
  user_id: 'sub-admin-1',
  full_name: 'Operations Team One',
  phone_masked: '•••• 8801',
  baseline_role: 'worker',
  status: 'active',
  capabilities: ['operations.read', 'workers.read'],
  version: 1,
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

const pendingOperator = {
  id: 'operator-provisioning-1',
  full_name: 'Admin Account One',
  email_masked: 'a•••@gmail.com',
  status: 'pending_password_change',
  capabilities: ['finance.read', 'operations.read'],
  created_at: '2026-08-09T05:00:00.000Z',
  updated_at: '2026-08-09T05:00:00.000Z',
  last_activity_at: null,
} satisfies AdminViewOperatorProvisioningSummary

let mockLocalSearchParams: { ns_admin_capability?: string | string[]; ns_admin_section?: string | string[]; ns_finance_view?: string | string[] } = {}
let mockAuthSessionProvider: string | undefined
let mockFocusEffectCallback: (() => void | (() => void)) | undefined
const mockReplace = jest.fn()
const mockSetParams = jest.fn()
const mockRouter = { replace: mockReplace, setParams: mockSetParams }
const mockSignOut = jest.fn()

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void | (() => void)) => {
    mockFocusEffectCallback = callback
  },
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
  useAuth: () => ({
    role: 'admin',
    session: mockAuthSessionProvider ? { access_token: 'admin-fixture-token', user: { id: 'admin-fixture', app_metadata: { provider: mockAuthSessionProvider } } } : null,
    signOut: mockSignOut,
  }),
}))

jest.mock('@/lib/services', () => ({
  adminControlService: {
    getActor: jest.fn(),
    decideWorkerApplication: jest.fn(),
    decideWorkerProfile: jest.fn(),
    exportFinanceCsv: jest.fn(),
    decidePayoutMethod: jest.fn(),
    accessPayoutMethodSensitive: jest.fn(),
    accessWithdrawalSensitive: jest.fn(),
    getFinanceOverview: jest.fn(),
    getFinanceSummary: jest.fn(),
    getPayoutMethod: jest.fn(),
    nominateManager: jest.fn(),
    getOperations: jest.fn(),
    getOverviewDetails: jest.fn(),
    listAiCosts: jest.fn(),
    listDisputes: jest.fn(),
    listLearningRules: jest.fn(),
    listPaymentReconciliations: jest.fn(),
    listFinanceTaxPolicies: jest.fn(),
    listFinanceTransactions: jest.fn(),
    getTransaction: jest.fn(),
    getWithdrawalRequest: jest.fn(),
    getWorkerReviewDetail: jest.fn(),
    getWorkerFinanceSnapshot: jest.fn(),
    claimWithdrawalRequest: jest.fn(),
    listPayoutMethods: jest.fn(),
    listPriceBaselines: jest.fn(),
    listSupportCases: jest.fn(),
    listSystemPriceBaselines: jest.fn(),
    listSubAdmins: jest.fn(),
    listTransactions: jest.fn(),
    listWithdrawalRequests: jest.fn(),
    cancelManagerNomination: jest.fn(),
    listWorkerApplications: jest.fn(),
    provisionOperator: jest.fn(),
    resolveWithdrawalRequest: jest.fn(),
    resetPendingOperatorPassword: jest.fn(),
    searchSubAdminAccounts: jest.fn(),
    setSubAdminAccess: jest.fn(),
    setWorkerAccess: jest.fn(),
  },
}))

function mockSuccessfulLoad() {
  jest.mocked(adminControlService.getActor).mockResolvedValue({ success: true, data: operations.actor, status: 200 })
  jest.mocked(adminControlService.getOperations).mockResolvedValue({ success: true, data: operations, status: 200 })
  jest.mocked(adminControlService.getOverviewDetails).mockResolvedValue({ success: true, data: overviewInServiceDetails, status: 200 })
  jest.mocked(adminControlService.listWorkerApplications).mockResolvedValue({
    success: true,
    data: { applications: [workerApplication], has_more: false, next_offset: null, next_cursor: null, total_count: 1 },
    status: 200,
  })
  jest.mocked(adminControlService.getWorkerFinanceSnapshot).mockResolvedValue({ success: true, data: workerFinanceSnapshot, status: 200 })
  jest.mocked(adminControlService.listTransactions).mockResolvedValue({
    success: true,
    data: { transactions: [transaction], has_more: false, next_offset: null, total_count: 1 },
    status: 200,
  })
  jest.mocked(adminControlService.listPayoutMethods).mockResolvedValue({
    success: true,
    data: { generated_at: '2026-08-08T07:00:00.000Z', payout_methods: [payoutMethod], has_more: false, next_cursor: null, total_count: 1 },
    status: 200,
  })
  jest.mocked(adminControlService.listWithdrawalRequests).mockResolvedValue({
    success: true,
    data: { generated_at: '2026-08-08T07:00:00.000Z', withdrawal_requests: [withdrawalRequest], has_more: false, next_cursor: null, total_count: 1 },
    status: 200,
  })
  jest.mocked(adminControlService.listSubAdmins).mockResolvedValue({
    success: true,
    data: { actor: operations.actor, generated_at: '2026-08-08T07:00:00.000Z', total_count: 1, members: [subAdmin], nominations: [], pending_accounts: [], has_more: false, next_cursor: null },
    status: 200,
  })
  jest.mocked(adminControlService.listDisputes).mockResolvedValue({
    success: true,
    data: { disputes: [dispute], has_more: false, next_offset: null, total_count: 1 },
    status: 200,
  })
  jest.mocked(adminControlService.listSupportCases).mockResolvedValue({
    success: true,
    data: {
      counts: [{ count: 1, key: 'dispute' }],
      generated_at: '2026-08-08T07:00:00.000Z',
      has_more: false,
      next_cursor: null,
      records: [{
        case_id: dispute.id,
        display_code: dispute.display_code,
        job_id: dispute.job_id,
        priority: 'high',
        reason_code: dispute.dispute_type,
        service_type: 'handyman',
        source: 'dispute',
        source_status: dispute.status,
        type: 'dispute',
        updated_at: dispute.updated_at,
      }],
    },
    status: 200,
  })
  jest.mocked(adminControlService.listSystemPriceBaselines).mockResolvedValue({
    success: true,
    data: {
      data_quality: 'available',
      generated_at: '2026-08-08T07:00:00.000Z',
      has_more: false,
      next_cursor: null,
      next_offset: null,
      records: [{
        accepted_evidence_count: 2,
        complexity: 'small',
        district_code: priceBaseline.district_code,
        effective_from: priceBaseline.updated_at,
        evidence_quorum_met: true,
        id: priceBaseline.id,
        lifecycle: 'active',
        price_max: priceBaseline.price_max,
        price_min: priceBaseline.price_min,
        problem_id: 'problem-handyman-shelf',
        problem_label_en: 'Mount a shelf',
        problem_label_vi: 'Lắp kệ',
        problem_slug: 'mount_shelf',
        service_label_en: 'Handyman',
        service_label_vi: 'Sửa chữa vặt',
        service_type: priceBaseline.service_type,
        unit: 'job',
        updated_at: priceBaseline.updated_at,
        version: priceBaseline.version,
      }],
      summary: { active_count: 1, attention_count: 0, inactive_count: 0, quorum_count: 1 },
    },
    status: 200,
  })
  jest.mocked(adminControlService.listPriceBaselines).mockResolvedValue({
    success: true,
    data: { price_baselines: [priceBaseline], has_more: false, next_offset: null, total_count: 1 },
    status: 200,
  })
  jest.mocked(adminControlService.getFinanceSummary).mockResolvedValue({
    success: true,
    data: {
      generated_at: '2026-08-08T07:00:00.000Z',
      range: 'month',
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-09-01T00:00:00.000Z',
      platform_incoming: 450000,
      payout_outflow: 0,
      commission_accrued: 67500,
      commission_collected: 0,
      commission_receivable: 0,
      worker_hold: 382500,
      worker_available: 0,
      payout_pending: 0,
      direct_payment_total: 0,
      opening_balance: null,
      closing_balance: null,
      expected_bank_change: null,
      actual_bank_change: null,
      unexplained_variance: null,
    },
    status: 200,
  })
  jest.mocked(adminControlService.getFinanceOverview).mockResolvedValue({
    success: false,
    code: 'UNAVAILABLE',
    error: 'overview unavailable',
    status: 503,
  })
  jest.mocked(adminControlService.listFinanceTaxPolicies).mockResolvedValue({
    success: true,
    data: { generated_at: '2026-08-08T07:00:00.000Z', active_policy_ids: [], tax_policies: [] },
    status: 200,
  })
  jest.mocked(adminControlService.listFinanceTransactions).mockResolvedValue({
    success: true,
    data: { generated_at: '2026-08-08T07:00:00.000Z', has_more: false, next_cursor: null, transactions: [] },
    status: 200,
  })
}

async function openAdminCapability({ capability, section, tab }: {
  capability: string
  section: string
  tab: string
}) {
  fireEvent.press(await screen.findByTestId(tab))
  await screen.findByTestId(`admin-production-section-${section}`)
  fireEvent.press(await screen.findByTestId(`admin-production-capability-${capability}`))
  return screen.findByTestId(`admin-production-capability-workspace-${capability}`)
}

describe('AdminSections', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSetParams.mockReset()
    mockAuthSessionProvider = 'email'
    mockLocalSearchParams = {}
    mockFocusEffectCallback = undefined
    mockSignOut.mockResolvedValue(undefined)
  })

  it('does not automatically reload the active Admin section as time passes', async () => {
    mockLocalSearchParams = { ns_admin_section: 'operations' }
    mockSuccessfulLoad()

    render(<AdminSections />)
    await screen.findByTestId('admin-production-section-operations')

    const actorCalls = jest.mocked(adminControlService.getActor).mock.calls.length
    const operationsCalls = jest.mocked(adminControlService.getOperations).mock.calls.length

    jest.useFakeTimers()
    let cleanup: void | (() => void) = undefined
    await act(async () => {
      cleanup = mockFocusEffectCallback?.()
      jest.advanceTimersByTime(5 * 60_000)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(mockFocusEffectCallback).toBeUndefined()
    expect(adminControlService.getActor).toHaveBeenCalledTimes(actorCalls)
    expect(adminControlService.getOperations).toHaveBeenCalledTimes(operationsCalls)
    expect(screen.getByTestId('admin-production-section-operations')).toBeTruthy()
    const cleanupFn = cleanup as (() => void) | undefined
    cleanupFn?.()
    jest.useRealTimers()
  })

  it('updates all six Admin section params in place without replacing the mounted route', async () => {
    mockSuccessfulLoad()
    mockSetParams.mockImplementation((next: typeof mockLocalSearchParams) => {
      mockLocalSearchParams = { ...mockLocalSearchParams, ...next }
    })
    const sections = [
      ['admin-sections-transactions-tab', 'operations'],
      ['admin-sections-worker-tab', 'workers'],
      ['admin-sections-finance-tab', 'finance'],
      ['admin-sections-team-tab', 'team'],
      ['admin-sections-governance-tab', 'system'],
      ['admin-sections-overview-tab', 'overview'],
    ] as const

    render(<AdminSections />)
    await screen.findByTestId('admin-production-section-overview')

    for (const [tabTestId, section] of sections) {
      fireEvent.press(screen.getByTestId(tabTestId))
      expect(await screen.findByTestId(`admin-production-section-${section}`)).toBeTruthy()
      expect(screen.getByTestId('admin-sections-production-shell')).toBeTruthy()
      expect(screen.queryByText('Đang tải dữ liệu quản trị...')).toBeNull()
      expect(screen.queryByTestId('admin-production-capability-close')).toBeNull()
    }

    expect(mockSetParams.mock.calls).toEqual(sections.map(([, section]) => [{
      ns_admin_capability: undefined,
      ns_admin_section: section,
      ns_finance_view: undefined,
      panel: undefined,
    }]))
    expect(adminControlService.getActor).toHaveBeenCalledTimes(1)
    expect(mockReplace.mock.calls.filter(([href]) => String(href).startsWith('/sections?'))).toEqual([])
  })

  it('uses the canonical primary gradient for the shared capability-sheet close action', async () => {
    mockSuccessfulLoad()

    render(<AdminSections />)
    await openAdminCapability({
      capability: 'operations-job-monitor',
      section: 'operations',
      tab: 'admin-sections-transactions-tab',
    })

    const closeButton = screen.getByTestId('admin-production-capability-close')
    expect(closeButton.findAllByType(LinearGradient)).toHaveLength(1)
    expect(closeButton.findAllByType(Stop).map((stop) => stop.props.stopColor)).toEqual([
      ...component.button.primary.gradient,
    ])
  })

  it('fits all six compact Admin tabs into one equal-width navigation row', async () => {
    mockSuccessfulLoad()

    render(<AdminSections />)
    await screen.findByTestId('admin-production-section-overview')

    expect(screen.getByTestId('admin-sections-primary-navigation-scroll')).toHaveStyle({
      flexDirection: 'row',
      width: '100%',
    })

    for (const testID of [
      'admin-sections-overview-tab',
      'admin-sections-transactions-tab',
      'admin-sections-worker-tab',
      'admin-sections-finance-tab',
      'admin-sections-team-tab',
      'admin-sections-governance-tab',
    ]) {
      expect(screen.getByTestId(testID)).toHaveStyle({ flexBasis: 0, flexGrow: 1, minWidth: 0 })
    }
  })

  it('starts the Admin header with a left-aligned workspace title and no back control', async () => {
    mockSuccessfulLoad()

    render(<AdminSections />)
    await screen.findByTestId('admin-production-section-overview')

    expect(screen.queryByTestId('admin-sections-back')).toBeNull()
    expect(screen.getByTestId('admin-sections-title')).toHaveStyle({ flex: 1, textAlign: 'left' })
  })

  it('moves View all to the filtered specialist workspace without pushing a new route', async () => {
    mockSuccessfulLoad()

    render(<AdminSections />)
    await screen.findByTestId('admin-production-section-overview')

    fireEvent.press(screen.getByTestId('admin-overview-operation-inService'))
    expect(await screen.findByText('NS-JOB-001')).toBeTruthy()
    fireEvent.press(screen.getByTestId('admin-overview-detail-view-all'))

    expect(mockSetParams).toHaveBeenLastCalledWith({
      ns_admin_capability: 'operations-job-monitor',
      ns_admin_section: 'operations',
      ns_finance_view: undefined,
      panel: undefined,
    })
    expect(mockReplace.mock.calls.filter(([href]) => String(href).startsWith('/sections?'))).toEqual([])
    expect(await screen.findByTestId('admin-overview-filtered-worklist')).toBeTruthy()
    expect(screen.getByText('Đang thực hiện')).toBeTruthy()
    expect(adminControlService.getOverviewDetails).toHaveBeenLastCalledWith({ cursor: '0', key: 'inService', limit: 20 })
  })

  it('loads only the active Admin section instead of fetching every dataset at the root', async () => {
    mockSuccessfulLoad()

    render(<AdminSections />)
    await screen.findByTestId('admin-production-section-overview')

    expect(adminControlService.getOperations).toHaveBeenCalledTimes(1)
    expect(adminControlService.getFinanceOverview).toHaveBeenCalledWith({ range: 'month' })
    expect(adminControlService.listWorkerApplications).not.toHaveBeenCalled()
    expect(adminControlService.listTransactions).not.toHaveBeenCalled()
    expect(adminControlService.listSubAdmins).not.toHaveBeenCalled()

    fireEvent.press(screen.getByTestId('admin-sections-team-tab'))
    fireEvent.press(await screen.findByTestId('admin-production-capability-team-directory'))
    expect(await screen.findByText('Operations Team One')).toBeTruthy()
    expect(adminControlService.listSubAdmins).toHaveBeenCalledTimes(1)
    expect(adminControlService.listWorkerApplications).not.toHaveBeenCalled()
    expect(adminControlService.listTransactions).not.toHaveBeenCalled()
  })

  it('ignores an older section response after the operator navigates away', async () => {
    mockSuccessfulLoad()
    let resolveTransactions!: (value: Awaited<ReturnType<typeof adminControlService.listTransactions>>) => void
    jest.mocked(adminControlService.listTransactions).mockImplementation(() => new Promise((resolve) => {
      resolveTransactions = resolve
    }))

    render(<AdminSections />)
    await screen.findByTestId('admin-production-section-overview')
    fireEvent.press(screen.getByTestId('admin-sections-transactions-tab'))
    await waitFor(() => expect(adminControlService.listTransactions).toHaveBeenCalledTimes(1))

    fireEvent.press(screen.getByTestId('admin-sections-worker-tab'))
    fireEvent.press(await screen.findByTestId('admin-production-capability-workers-applications'))
    expect(await screen.findByText('Worker Application One')).toBeTruthy()

    resolveTransactions({
      success: true,
      data: {
        has_more: false,
        next_offset: null,
        total_count: 1,
        transactions: [{ ...transaction, display_code: 'NS-STALE-RESPONSE' }],
      },
      status: 200,
    })
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.queryByText('NS-STALE-RESPONSE')).toBeNull()
    expect(screen.getByText('Worker Application One')).toBeTruthy()
  })

  it('confirms Admin sign-out before returning to Login Gates', async () => {
    mockSuccessfulLoad()

    render(<AdminSections />)

    await screen.findByTestId('admin-production-section-overview')
    const signOutButton = screen.getByTestId('admin-sign-out')
    expect(signOutButton).toHaveStyle({ minHeight: 44 })
    expect(screen.getByTestId('admin-sign-out-icon')).toBeTruthy()
    fireEvent.press(signOutButton)

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

    expect(screen.queryByText('Khu vực quản trị')).toBeNull()
    await screen.findByTestId('admin-production-section-overview')
    await openAdminCapability({
      capability: 'operations-job-monitor',
      section: 'operations',
      tab: 'admin-sections-transactions-tab',
    })
    expect(screen.getByTestId('admin-operations-overview')).toBeTruthy()
    expect(screen.getByTestId('admin-sections-production-shell')).toBeTruthy()
    expect(screen.getByTestId('admin-sections-primary-navigation')).toBeTruthy()
    expect(screen.queryByTestId('admin-sections-mint-aura')).toBeNull()
    expect(screen.queryByText('Dữ liệu minh họa cục bộ')).toBeNull()
    expect(adminControlService.getOperations).toHaveBeenCalled()
    expect(screen.getByText('Đang sửa')).toBeTruthy()
    expect(screen.getByText('Duyệt hồ sơ')).toBeTruthy()
    expect(screen.getByText('Quản trị viên chính · Hồ sơ thợ')).toBeTruthy()
    expect(screen.queryByText('repairing')).toBeNull()

    fireEvent.press(screen.getByTestId('admin-operation-attention-worker_applications'))
    fireEvent.press(await screen.findByTestId('admin-production-capability-workers-applications'))
    expect(await screen.findByText('Worker Application One')).toBeTruthy()
    expect(adminControlService.listWorkerApplications).toHaveBeenCalledWith({ status: 'all', stage: 'pending_access', query: '', limit: 8, offset: 0 })

    fireEvent.press(screen.getByTestId('admin-sections-transactions-tab'))
    fireEvent.press(await screen.findByTestId('admin-production-capability-operations-service-transactions'))
    expect(await screen.findByText('NS-TEST-0001')).toBeTruthy()
    expect(screen.queryByTestId('admin-transaction-job-1-formula-mint-aura')).toBeNull()
    expect(screen.queryByTestId('admin-transaction-job-2-formula-mint-aura')).toBeNull()
    expect(screen.getAllByText('Công việc')).toHaveLength(2)
    expect(screen.getAllByText('Đã nhận thanh toán')).toHaveLength(2)
    expect(screen.getAllByText('Chuyển khoản qua mã QR')).toHaveLength(2)
    expect(screen.queryByText('Đã xử lý')).toBeNull()
    fireEvent.press(screen.getByTestId('admin-transaction-job-1'))
    expect(await screen.findByTestId('admin-transaction-detail')).toBeTruthy()
    expect(screen.getByTestId('admin-transaction-detail-formula-mint-aura')).toBeTruthy()
    expect(screen.getByTestId('admin-transaction-detail-amount-formula-mint-aura')).toBeTruthy()
    expect(screen.getByTestId('admin-transaction-detail')).toHaveStyle({ overflow: 'hidden' })
    expect(screen.getByTestId('admin-transaction-detail-content')).toHaveStyle({ flex: 1, minHeight: 0 })
    expect(screen.getByTestId('admin-transaction-detail-scroll')).toHaveStyle({ flex: 1, minHeight: 0 })
    expect(screen.getByText('Sổ cái thợ')).toBeTruthy()
    expect(screen.getByText('Phí nền tảng')).toBeTruthy()

    fireEvent.press(screen.getByTestId('admin-sections-team-tab'))
    fireEvent.press(await screen.findByTestId('admin-production-capability-team-directory'))
    expect(await screen.findByTestId('admin-team-workspace-team-directory')).toBeTruthy()
    expect(await screen.findByText('Operations Team One')).toBeTruthy()
  })

  it('keeps the Team section usable while an older Edge release omits pending accounts', async () => {
    mockSuccessfulLoad()
    jest.mocked(adminControlService.listSubAdmins).mockResolvedValue({
      success: true,
      data: {
        actor: operations.actor,
        members: [subAdmin],
        nominations: [],
      } as never,
      status: 200,
    })

    render(<AdminSections />)
    await screen.findByTestId('admin-production-section-overview')
    fireEvent.press(screen.getByTestId('admin-sections-team-tab'))
    fireEvent.press(await screen.findByTestId('admin-production-capability-team-directory'))

    expect(await screen.findByTestId('admin-team-workspace-team-directory')).toBeTruthy()
    expect(screen.getByText('Operations Team One')).toBeTruthy()
  })

  it('labels the current manual bank payment states without hiding them as unrecorded', async () => {
    mockSuccessfulLoad()
    const manualClaim = {
      ...transaction,
      job_id: 'manual-claim-job',
      display_code: 'NS-MANUAL-0001',
      status: 'payment_pending',
      payment_status: 'manual_customer_claimed',
      payment_provider: 'platform_bank_manual',
      paid_at: null,
    } satisfies AdminViewTransactionSummary
    jest.mocked(adminControlService.listTransactions).mockResolvedValue({
      success: true,
      data: { transactions: [manualClaim], has_more: false, next_offset: null, total_count: 1 },
      status: 200,
    })

    render(<AdminSections />)
    await screen.findByTestId('admin-production-section-overview')
    fireEvent.press(screen.getByTestId('admin-sections-transactions-tab'))
    fireEvent.press(await screen.findByTestId('admin-production-capability-operations-service-transactions'))

    expect(await screen.findByText('NS-MANUAL-0001')).toBeTruthy()
    expect(screen.getAllByText('Khách đã báo chuyển').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Chuyển khoản ngân hàng qua nền tảng')).toBeTruthy()
    expect(screen.queryByText('Chưa ghi nhận')).toBeNull()
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
    await screen.findByTestId('admin-production-section-overview')
    fireEvent.press(screen.getByTestId('admin-sections-transactions-tab'))
    fireEvent.press(await screen.findByTestId('admin-production-capability-operations-service-transactions'))

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

    const callsBeforeSearch = jest.mocked(adminControlService.listTransactions).mock.calls.length
    fireEvent.changeText(screen.getByLabelText('Tìm theo tên, mã việc hoặc trạng thái'), 'Q')
    fireEvent.changeText(screen.getByLabelText('Tìm theo tên, mã việc hoặc trạng thái'), 'QA')
    expect(adminControlService.listTransactions).toHaveBeenCalledTimes(callsBeforeSearch)
    await waitFor(() => {
      expect(adminControlService.listTransactions).toHaveBeenLastCalledWith({ query: 'QA', limit: 8, offset: 0 })
      expect(adminControlService.listTransactions).toHaveBeenCalledTimes(callsBeforeSearch + 1)
    })
  })

  it('opens the Production support workspace with live dispute data', async () => {
    mockSuccessfulLoad()

    render(<AdminSections />)
    await screen.findByTestId('admin-production-section-overview')
    await openAdminCapability({
      capability: 'operations-disputes',
      section: 'operations',
      tab: 'admin-sections-transactions-tab',
    })

    expect(await screen.findByTestId('admin-support-case-list')).toBeTruthy()
    expect(adminControlService.listSupportCases).toHaveBeenCalled()
    expect(adminControlService.listPriceBaselines).not.toHaveBeenCalled()
    expect(adminControlService.listAiCosts).not.toHaveBeenCalled()
    expect(adminControlService.listLearningRules).not.toHaveBeenCalled()
  })

  it('localizes system-monitoring values instead of exposing internal price-source codes', async () => {
    mockSuccessfulLoad()

    render(<AdminSections />)
    await screen.findByTestId('admin-production-section-overview')
    await openAdminCapability({
      capability: 'system-price-baseline',
      section: 'system',
      tab: 'admin-sections-governance-tab',
    })
    await screen.findByTestId('admin-system-price-list')

    expect(adminControlService.listSystemPriceBaselines).toHaveBeenCalled()
    expect(screen.queryByText(priceBaseline.source)).toBeNull()
  })

  it('paginates worker applications with a server-reported total instead of rendering an unbounded list', async () => {
    mockSuccessfulLoad()
    const secondWorker = { ...workerApplication, id: 'worker-application-2', full_name: 'Worker Application Two' }
    jest.mocked(adminControlService.listWorkerApplications).mockImplementation(async ({ offset = 0 } = {}) => ({
      success: true,
      data: offset === 8
        ? { applications: [secondWorker], has_more: false, next_offset: null, next_cursor: null, total_count: 9 }
        : { applications: Array.from({ length: 8 }, (_, index) => ({ ...workerApplication, id: `worker-application-${index + 1}`, full_name: `Worker Application ${index + 1}` })), has_more: true, next_offset: 8, next_cursor: null, total_count: 9 },
      status: 200,
    }))

    render(<AdminSections />)
    await screen.findByTestId('admin-production-section-overview')
    fireEvent.press(screen.getByTestId('admin-sections-worker-tab'))
    fireEvent.press(await screen.findByTestId('admin-production-capability-workers-applications'))

    expect(await screen.findByText('Worker Application 1')).toBeTruthy()
    expect(screen.queryByText('Worker Application Two')).toBeNull()
    expect(adminControlService.listWorkerApplications).toHaveBeenLastCalledWith({ status: 'all', stage: 'pending_access', query: '', limit: 8, offset: 0 })

    fireEvent.press(screen.getByTestId('admin-worker-page-2'))
    expect(await screen.findByText('Worker Application Two')).toBeTruthy()
    expect(adminControlService.listWorkerApplications).toHaveBeenLastCalledWith({ status: 'all', stage: 'pending_access', query: '', limit: 8, offset: 8 })
  })

  it('sends worker approval decisions to the production service when the actor has workers.review', async () => {
    mockSuccessfulLoad()
    let workerAccessApproved = false
    const workerListStates: boolean[] = []
    jest.mocked(adminControlService.listWorkerApplications).mockImplementation(async () => {
      workerListStates.push(workerAccessApproved)
      return {
        success: true,
        data: {
          applications: workerAccessApproved ? [] : [workerApplication],
          has_more: false,
          next_offset: null,
          next_cursor: null,
          total_count: workerAccessApproved ? 0 : 1,
        },
        status: 200,
      }
    })
    jest.mocked(adminControlService.decideWorkerApplication).mockImplementation(async () => {
      workerAccessApproved = true
      return {
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
      }
    })

    render(<AdminSections />)
    await screen.findByTestId('admin-production-section-overview')
    await openAdminCapability({
      capability: 'workers-applications',
      section: 'workers',
      tab: 'admin-sections-worker-tab',
    })
    fireEvent.press(await screen.findByTestId(`admin-worker-approve-${workerApplication.id}`))

    await waitFor(() => {
      expect(adminControlService.decideWorkerApplication).toHaveBeenCalledWith(workerApplication.id, { decision: 'approve' })
      expect(jest.mocked(adminControlService.listWorkerApplications).mock.calls.length).toBeGreaterThanOrEqual(2)
      expect(workerListStates).toContain(true)
      expect(screen.queryByTestId(`admin-worker-application-${workerApplication.id}`)).toBeNull()
    })
    expect(screen.getByText('Đã cấp quyền vào luồng thợ. Tài khoản vẫn cần hoàn tất hồ sơ xác minh.')).toBeTruthy()
  })

  it('shows the complete worker review in the Admin Sections modal and verifies a ready profile', async () => {
    mockSuccessfulLoad()
    jest.mocked(adminControlService.listWorkerApplications).mockResolvedValue({
      success: true,
      data: { applications: [readyWorkerApplication], has_more: false, next_offset: null, next_cursor: null, total_count: 1 },
      status: 200,
    })
    jest.mocked(adminControlService.getWorkerReviewDetail).mockResolvedValue({ success: true, data: workerReviewDetail, status: 200 })
    jest.mocked(adminControlService.decideWorkerProfile).mockResolvedValue({
      success: true,
      data: {
        ok: true,
        application_id: readyWorkerApplication.id,
        worker_id: readyWorkerApplication.worker_id,
        decision: 'approve',
        verification_status: 'approved',
        decided_at: '2026-08-08T05:00:00.000Z',
      },
      status: 200,
    })

    render(<AdminSections />)
    await screen.findByTestId('admin-production-section-overview')
    fireEvent.press(screen.getByTestId('admin-sections-worker-tab'))
    fireEvent.press(await screen.findByTestId('admin-production-capability-workers-profile-review'))
    fireEvent.press(await screen.findByLabelText(readyWorkerApplication.full_name))

    expect(await screen.findByTestId('admin-worker-review-detail')).toBeTruthy()
    expect(await screen.findByText('Thông tin đăng ký')).toBeTruthy()
    expect(screen.getByText('Giấy tờ xác minh')).toBeTruthy()
    expect(screen.getAllByText('Ngân hàng').length).toBeGreaterThanOrEqual(1)
    expect(await screen.findByTestId('admin-worker-finance-snapshot')).toBeTruthy()
    expect(screen.getByText('Tạm ghi nhận')).toBeTruthy()
    expect(adminControlService.getWorkerFinanceSnapshot).toHaveBeenCalledWith(readyWorkerApplication.worker_id, {}, 'admin-fixture-token')
    fireEvent.press(screen.getByText('Xác minh hồ sơ'))

    await waitFor(() => {
      expect(adminControlService.getWorkerReviewDetail).toHaveBeenCalledWith(readyWorkerApplication.id, 'admin-fixture-token')
      expect(adminControlService.decideWorkerProfile).toHaveBeenCalledWith(readyWorkerApplication.id, {
        decision: 'approve', profile_review_queue_id: readyWorkerApplication.profile_review_queue_id,
        expected_profile_updated_at: workerReviewDetail.profile.updated_at,
      }, 'admin-fixture-token')
    })
  })

  it('keeps full bank details out of the payout list and loads them only after an authorized admin opens the item', async () => {
    mockSuccessfulLoad()
    jest.mocked(adminControlService.getPayoutMethod).mockResolvedValue({
      success: true,
      data: { generated_at: '2026-08-08T07:00:00.000Z', payout_method: payoutMethod },
      status: 200,
    })
    jest.mocked(adminControlService.accessPayoutMethodSensitive).mockResolvedValue({
      success: true,
      data: { account_holder_name: 'NGUYEN VAN A', bank_account: '0123456789', expires_at: '2026-08-08T07:05:00.000Z' },
      status: 200,
    })
    jest.mocked(adminControlService.decidePayoutMethod).mockResolvedValue({
      success: true,
      data: {
        ok: true,
        payout_method_id: payoutMethod.id,
        status: 'verified',
        reviewed_at: '2026-08-08T04:00:00.000Z',
        version: 2,
        generated_at: '2026-08-08T04:00:00.000Z',
      },
      status: 200,
    })

    render(<AdminSections />)
    await screen.findByTestId('admin-production-section-overview')
    await openAdminCapability({
      capability: 'finance-payouts',
      section: 'finance',
      tab: 'admin-sections-finance-tab',
    })

    expect(await screen.findByTestId('admin-payout-panel')).toBeTruthy()
    expect(await screen.findByTestId(`admin-payout-method-${payoutMethod.id}`)).toBeTruthy()
    expect(adminControlService.listWithdrawalRequests).not.toHaveBeenCalled()
    expect(screen.queryByTestId(`admin-payout-method-${payoutMethod.id}-formula-mint-aura`)).toBeNull()
    expect(screen.queryByText('0123456789')).toBeNull()

    fireEvent.press(screen.getByTestId(`admin-payout-method-${payoutMethod.id}`))
    expect(await screen.findByTestId('admin-payout-method-detail')).toBeTruthy()
    expect(adminControlService.getPayoutMethod).toHaveBeenCalledWith(payoutMethod.id)
    expect(screen.queryByText('0123456789')).toBeNull()
    fireEvent.changeText(screen.getByLabelText('Lý do cần xem thông tin tài khoản'), 'Đối chiếu thông tin chi trả')
    fireEvent.press(screen.getByText('Mở thông tin tài khoản'))
    expect(await screen.findByText('0123456789')).toBeTruthy()
    expect(adminControlService.accessPayoutMethodSensitive).toHaveBeenCalledWith(payoutMethod.id, { reason: 'Đối chiếu thông tin chi trả' })

    fireEvent.press(screen.getByText('Lưu'))
    await waitFor(() => {
      expect(adminControlService.decidePayoutMethod).toHaveBeenCalledWith(payoutMethod.id, expect.objectContaining({ decision: 'verify', expected_version: 1, client_request_id: expect.any(String) }))
    })
  })

  it('opens the withdrawal queue directly from the withdrawal deep link', async () => {
    mockLocalSearchParams = { ns_admin_section: ['withdrawals'] }
    mockSuccessfulLoad()

    render(<AdminSections />)

    expect(await screen.findByTestId('admin-payout-panel')).toBeTruthy()
    expect(await screen.findByTestId(`admin-withdrawal-request-${withdrawalRequest.id}`)).toBeTruthy()
    expect(adminControlService.listPayoutMethods).not.toHaveBeenCalled()
  })

  it('opens the top-level Finance section on its capability index before opening overview', async () => {
    mockLocalSearchParams = { ns_admin_section: 'finance' }
    mockSuccessfulLoad()

    render(<AdminSections />)

    expect(await screen.findByTestId('admin-production-section-finance')).toBeTruthy()
    expect(screen.queryByTestId('admin-production-capability-close')).toBeNull()
    expect(screen.getByTestId('admin-sections-finance-tab').props.accessibilityState).toEqual({ selected: true })

    fireEvent.press(screen.getByTestId('admin-production-capability-finance-overview'))

    expect(await screen.findByTestId('admin-finance-view-overview')).toBeTruthy()
    expect(screen.queryByTestId('admin-finance-view-navigation')).toBeNull()
  })

  it('opens Finance for a finance-only operator without requesting forbidden Admin sections', async () => {
    mockSuccessfulLoad()
    jest.mocked(adminControlService.getActor).mockResolvedValue({
      success: true,
      data: { access_level: 'operator', capabilities: ['finance.read'] },
      status: 200,
    })

    render(<AdminSections />)

    await screen.findByTestId('admin-production-section-finance')
    fireEvent.press(screen.getByTestId('admin-production-capability-finance-overview'))
    expect(await screen.findByTestId('admin-finance-view-overview')).toBeTruthy()
    expect(screen.getByTestId('admin-sections-finance-tab')).toBeTruthy()
    expect(screen.queryByTestId('admin-sections-operations-tab')).toBeNull()
    expect(screen.queryByTestId('admin-sections-team-tab')).toBeNull()
    expect(adminControlService.getOperations).not.toHaveBeenCalled()
    expect(adminControlService.listWorkerApplications).not.toHaveBeenCalled()
    expect(adminControlService.listTransactions).not.toHaveBeenCalled()
    expect(adminControlService.listSubAdmins).not.toHaveBeenCalled()
  })

  it('returns the localhost Admin visual-audit Finance route to Login Gates instead of rendering Finance without a backend session', async () => {
    mockAuthSessionProvider = 'local-visual-audit'
    mockLocalSearchParams = { ns_admin_section: 'finance' }
    const unavailable = { success: false, code: 'AUTH_MISSING', error: 'Preview data unavailable', status: 401 } as const
    jest.mocked(adminControlService.getOperations).mockResolvedValue(unavailable)
    jest.mocked(adminControlService.listWorkerApplications).mockResolvedValue(unavailable)
    jest.mocked(adminControlService.listTransactions).mockResolvedValue(unavailable)
    jest.mocked(adminControlService.listSubAdmins).mockResolvedValue(unavailable)
    jest.mocked(adminControlService.getFinanceSummary).mockResolvedValue(unavailable)
    jest.mocked(adminControlService.getFinanceOverview).mockResolvedValue(unavailable)

    render(<AdminSections />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/login?stage=login&ns_audit_role=none')
    })
    expect(screen.queryByTestId('admin-sections-finance-tab')).toBeNull()
    expect(screen.queryByTestId('admin-finance-view-overview')).toBeNull()
  })

  it('does not load or render Finance for a direct route without an authenticated Admin session', async () => {
    mockAuthSessionProvider = undefined
    mockLocalSearchParams = { ns_admin_section: 'finance' }

    render(<AdminSections />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/login?stage=login')
    })
    expect(adminControlService.getActor).not.toHaveBeenCalled()
    expect(adminControlService.getOperations).not.toHaveBeenCalled()
    expect(screen.queryByTestId('admin-sections-finance-tab')).toBeNull()
    expect(screen.queryByTestId('admin-finance-view-overview')).toBeNull()
  })

  it('switches Finance capabilities through the capability index rather than nested tabs', async () => {
    mockSuccessfulLoad()

    render(<AdminSections />)
    await screen.findByTestId('admin-production-section-overview')
    fireEvent.press(screen.getByTestId('admin-sections-finance-tab'))

    expect(mockSetParams).toHaveBeenLastCalledWith({ ns_admin_capability: undefined, ns_admin_section: 'finance', ns_finance_view: undefined, panel: undefined })
    fireEvent.press(await screen.findByTestId('admin-production-capability-finance-overview'))
    expect(await screen.findByTestId('admin-finance-view-overview')).toBeTruthy()
    expect(screen.queryByTestId('admin-finance-tab-tax')).toBeNull()
    fireEvent.press(screen.getByTestId('admin-production-capability-close'))
    fireEvent.press(await screen.findByTestId('admin-production-capability-finance-tax'))
    expect(await screen.findByTestId('admin-finance-tax-reports')).toBeTruthy()
    await waitFor(() => expect(adminControlService.listFinanceTaxPolicies).toHaveBeenCalled())
  })

  it('keeps Finance visible for authenticated admins during capability backfill', async () => {
    mockSuccessfulLoad()
    jest.mocked(adminControlService.getOperations).mockResolvedValue({
      success: true,
      data: { ...operations, actor: { ...operations.actor, capabilities: operations.actor.capabilities.filter((capability) => capability !== 'finance.read') } },
      status: 200,
    })

    render(<AdminSections />)

    await screen.findByTestId('admin-production-section-overview')
    expect(await screen.findByTestId('admin-sections-finance-tab')).toBeTruthy()
    fireEvent.press(screen.getByTestId('admin-sections-finance-tab'))
    fireEvent.press(await screen.findByTestId('admin-production-capability-finance-overview'))
    expect(await screen.findByTestId('admin-finance-view-overview')).toBeTruthy()
    expect(screen.queryByTestId('admin-finance-no-access')).toBeNull()
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
    await screen.findByTestId('admin-production-section-overview')
    fireEvent.press(await screen.findByTestId('admin-sections-team-tab'))
    fireEvent.press(await screen.findByTestId('admin-production-capability-team-provisioning'))
    fireEvent.press(await screen.findByTestId('admin-team-provisioning-search'))
    const accountSearch = await screen.findAllByLabelText('Tìm tài khoản khách/thợ đã đăng ký')
    fireEvent.changeText(accountSearch[0], 'Registered')
    fireEvent.press(accountSearch[accountSearch.length - 1])
    fireEvent.press(await screen.findByText('Registered Account One'))

    await waitFor(() => {
      expect(adminControlService.nominateManager).toHaveBeenCalledWith(subAdminCandidate.user_id)
    })
  })

  it('requires review before updating an existing Admin capability set', async () => {
    mockSuccessfulLoad()
    jest.mocked(adminControlService.setSubAdminAccess).mockResolvedValue({
      success: true,
      data: {
        ok: true,
        user_id: subAdmin.user_id,
        status: 'active',
        role: 'admin_operator',
        capabilities: ['finance.read', 'operations.read'],
        version: 1,
        event_id: 'f6900000-0000-4000-8000-000000000002',
        generated_at: '2026-08-09T05:01:00.000Z',
        replayed: false,
        updated_at: '2026-08-09T05:01:00.000Z',
      },
      status: 200,
    })
    jest.mocked(adminControlService.listSubAdmins).mockResolvedValue({
      success: true,
      data: { actor: operations.actor, generated_at: '2026-08-09T05:00:00.000Z', total_count: 1, members: [subAdmin], nominations: [managerNomination], pending_accounts: [], has_more: false, next_cursor: null },
      status: 200,
    })

    render(<AdminSections />)
    await screen.findByTestId('admin-production-section-overview')
    fireEvent.press(await screen.findByTestId('admin-sections-team-tab'))
    fireEvent.press(await screen.findByTestId('admin-production-capability-team-capabilities'))

    expect(await screen.findByTestId('admin-team-workspace-team-capabilities')).toBeTruthy()
    fireEvent.press(screen.getByText('Operations Team One'))
    await screen.findByLabelText('Đọc vận hành')
    fireEvent.press(screen.getByText('Rà soát'))
    fireEvent.press(screen.getByText('Xác nhận'))

    await waitFor(() => {
      expect(adminControlService.setSubAdminAccess).toHaveBeenCalledWith(subAdmin.user_id, expect.objectContaining({
        action: 'update',
        capabilities: subAdmin.capabilities,
        client_request_id: expect.any(String),
        expected_version: subAdmin.version,
      }))
    })
  })

  it('lets only the Owner create a Gmail-identified Admin account from the shared team surface', async () => {
    mockSuccessfulLoad()
    jest.mocked(adminControlService.listSubAdmins).mockResolvedValue({
      success: true,
      data: { actor: operations.actor, generated_at: '2026-08-09T05:00:00.000Z', total_count: 1, members: [subAdmin], nominations: [], pending_accounts: [pendingOperator], has_more: false, next_cursor: null },
      status: 200,
    })
    jest.mocked(adminControlService.provisionOperator).mockResolvedValue({
      success: true,
      data: { ok: true, account: pendingOperator },
      status: 201,
    })

    render(<AdminSections />)
    await screen.findByTestId('admin-production-section-overview')
    fireEvent.press(screen.getByTestId('admin-sections-team-tab'))
    fireEvent.press(await screen.findByTestId('admin-production-capability-team-provisioning'))

    expect(await screen.findByTestId('admin-team-workspace-team-provisioning')).toBeTruthy()
    expect(screen.getByText(pendingOperator.full_name)).toBeTruthy()
    fireEvent.press(screen.getByTestId('admin-team-provisioning-create'))
    fireEvent.changeText(await screen.findByLabelText('Họ và tên'), 'Admin Account Two')
    fireEvent.changeText(screen.getByLabelText('Địa chỉ Gmail'), 'admin.two@gmail.com')
    fireEvent.changeText(screen.getByLabelText('Mật khẩu ban đầu'), 'InitialPass123!')
    fireEvent.changeText(screen.getByLabelText('Nhập lại mật khẩu'), 'InitialPass123!')
    fireEvent.press(screen.getByLabelText('Tài khoản phải đổi mật khẩu ở lần đăng nhập đầu.'))
    fireEvent.press(screen.getByText('Rà soát'))
    fireEvent.press(screen.getByText('Xác nhận'))

    await waitFor(() => {
      expect(adminControlService.provisionOperator).toHaveBeenCalledWith({
        full_name: 'Admin Account Two',
        email: 'admin.two@gmail.com',
        initial_password: 'InitialPass123!',
        capabilities: ['finance.read'],
      })
    })
  })

  it('hides Owner account actions from an Admin operator', async () => {
    mockSuccessfulLoad()
    const operatorActor = { ...operations.actor, access_level: 'operator' as const }
    jest.mocked(adminControlService.getActor).mockResolvedValue({
      success: true,
      data: operatorActor,
      status: 200,
    })
    jest.mocked(adminControlService.getOperations).mockResolvedValue({
      success: true,
      data: { ...operations, actor: operatorActor },
      status: 200,
    })
    jest.mocked(adminControlService.listSubAdmins).mockResolvedValue({
      success: true,
      data: { actor: operatorActor, generated_at: '2026-08-09T05:00:00.000Z', total_count: 1, members: [subAdmin], nominations: [], pending_accounts: [], has_more: false, next_cursor: null },
      status: 200,
    })

    render(<AdminSections />)
    await screen.findByTestId('admin-production-section-overview')
    fireEvent.press(screen.getByTestId('admin-sections-team-tab'))
    fireEvent.press(await screen.findByTestId('admin-production-capability-team-directory'))

    expect(await screen.findByTestId('admin-team-workspace-team-directory')).toBeTruthy()
    expect(screen.queryByTestId('admin-team-owner-actions')).toBeNull()
    expect(screen.queryByTestId('admin-create-operator')).toBeNull()
  })

  it('shows the actual service failure without falling back to local sample content', async () => {
    jest.mocked(adminControlService.getActor).mockResolvedValue({ success: true, data: operations.actor, status: 200 })
    jest.mocked(adminControlService.getOperations).mockResolvedValue({ success: false, code: 'internal_error', error: 'backend error', status: 500 })
    jest.mocked(adminControlService.listWorkerApplications).mockResolvedValue({ success: false, code: 'internal_error', error: 'backend error', status: 500 })
    jest.mocked(adminControlService.listTransactions).mockResolvedValue({ success: false, code: 'internal_error', error: 'backend error', status: 500 })
    jest.mocked(adminControlService.listSubAdmins).mockResolvedValue({ success: false, code: 'internal_error', error: 'backend error', status: 500 })

    render(<AdminSections />)

    await screen.findByTestId('admin-production-section-overview')
    await openAdminCapability({
      capability: 'operations-job-monitor',
      section: 'operations',
      tab: 'admin-sections-transactions-tab',
    })
    expect(await screen.findByText('backend error')).toBeTruthy()
    expect(screen.queryByText('Dữ liệu minh họa cục bộ')).toBeNull()
    expect(screen.queryByText('NS-TEST-0001')).toBeNull()
  })

  it('returns an expired Admin backend session to Login Gates before rendering an ambiguous retry state', async () => {
    mockSuccessfulLoad()
    jest.mocked(adminControlService.getOperations).mockResolvedValue({
      success: false,
      code: 'AUTH_MISSING',
      error: 'Vui lòng đăng nhập',
      status: 401,
    })

    render(<AdminSections />)

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/login?stage=login')
    })
    expect(adminControlService.getActor).toHaveBeenCalledTimes(1)
    expect(adminControlService.getOperations).toHaveBeenCalledTimes(1)
  })
})
