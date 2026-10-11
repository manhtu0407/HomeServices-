import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native'
import type { AdminFinanceOverviewResponse } from '@nestscout/shared'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { color } from '@/design/theme'
import { adminControlService } from '@/lib/services'

const mockReadAdminDataRevisions = jest.fn()
const mockSubscribeToAdminDataRevisions = jest.fn()

jest.mock('@/lib/admin-data-sync-source', () => ({
  readAdminDataRevisions: (...args: unknown[]) => mockReadAdminDataRevisions(...args),
}))
jest.mock('@/lib/realtime', () => ({
  subscribeToAdminDataRevisions: (...args: unknown[]) => mockSubscribeToAdminDataRevisions(...args),
}))

export const PILLAR = {
  id: 'P52-admin-finance-focused-capabilities',
  invariant:
    'Admin Finance displays NestScout transfer content as a lookup aid, separately requires the real bank transaction reference, and refreshes Admin Overview only after a successful reconciliation decision',
  authority: [
    'user-approved Admin Finance Production completion plan',
    'governance/RULES.md #8 (unavailable Production data is never displayed as zero)',
    'governance/design/screen-recipes.md (one sheet, list-to-detail without nested modal)',
  ],
  target:
    'apps/mobile/components/admin/admin-finance.tsx; apps/mobile/components/admin/admin-finance-state.ts; apps/mobile/components/admin/admin-finance-controls.tsx; apps/mobile/components/admin/admin-finance-reconciliation-modal.tsx; apps/mobile/components/admin/admin-sections.tsx; apps/mobile/components/admin/admin-overview-dashboard.tsx; apps/mobile/components/admin/admin-payouts.tsx; apps/mobile/components/admin/admin-finance-reports.tsx',
  layer: 'ui-visual',
  siblings: ['P45-admin-overview-dashboard', 'P51-admin-finance-operations-contract'],
  mutation:
    'prefill an unverified expected amount as received, replace the inline bank-reference error with a generic page error, invoke Admin Overview refresh before a successful Backend decision, or fail to refresh Overview snapshots afterward',
} as const satisfies PillarManifest

jest.mock('@/lib/app-language', () => ({ useAppLanguage: () => 'vi' }))
jest.mock('@/lib/services', () => ({
  adminControlService: {
    claimPaymentReconciliation: jest.fn(),
    decidePayoutMethod: jest.fn(),
    decidePaymentReconciliation: jest.fn(),
    getFinanceOverview: jest.fn(),
    getPayoutMethod: jest.fn(),
    getFinanceSummary: jest.fn(),
    getPaymentReconciliation: jest.fn(),
    listFinanceTaxPolicies: jest.fn(),
    listFinanceTransactions: jest.fn(),
    listPaymentReconciliations: jest.fn(),
    listPayoutMethods: jest.fn(),
    recordFinanceBalanceSnapshot: jest.fn(),
  },
}))

import { AdminFinancePanel } from '../admin-finance'
import { AdminPayoutsPanel } from '../admin-payouts'
import { FinanceControls } from '../admin-finance-controls'
import { AdminTabNavigation } from '../admin-tab-navigation'
import { AdminDataSyncProvider } from '@/lib/admin-data-sync'

const unavailableMetric = {
  change_percent: null,
  change_value: null,
  data_quality: 'unavailable' as const,
  direction: 'unavailable' as const,
  previous_value: null,
  unavailable_reason: 'NO_RECORDED_DATA',
  value: null,
}

const overview: AdminFinanceOverviewResponse = {
  bank_reconciliation: {
    actual_change_vnd: { data_quality: 'unavailable', unavailable_reason: 'NO_SNAPSHOT', value: null },
    closing_balance_vnd: { data_quality: 'unavailable', unavailable_reason: 'NO_SNAPSHOT', value: null },
    expected_change_vnd: { data_quality: 'unavailable', unavailable_reason: 'NO_SNAPSHOT', value: null },
    opening_balance_vnd: { data_quality: 'unavailable', unavailable_reason: 'NO_SNAPSHOT', value: null },
    unexplained_variance_vnd: { data_quality: 'unavailable', unavailable_reason: 'NO_SNAPSHOT', value: null },
  },
  current_balances: {
    payout_pending_vnd: { data_quality: 'available', unavailable_reason: null, value: 0 },
    worker_available_vnd: { data_quality: 'available', unavailable_reason: null, value: 0 },
    worker_hold_vnd: { data_quality: 'available', unavailable_reason: null, value: 0 },
  },
  data_quality: 'partial',
  from: '2026-08-01T00:00:00.000+07:00',
  generated_at: '2026-08-25T08:00:00.000+07:00',
  metrics: {
    average_order_value_vnd: unavailableMetric,
    business_kept_vnd: unavailableMetric,
    commission_accrued_vnd: unavailableMetric,
    commission_collected_vnd: unavailableMetric,
    commission_receivable_vnd: unavailableMetric,
    gmv_vnd: unavailableMetric,
    kael_ai_cost_usd: unavailableMetric,
    net_cash_flow_vnd: unavailableMetric,
    paid_jobs: unavailableMetric,
    payout_outflow_vnd: unavailableMetric,
    platform_incoming_vnd: unavailableMetric,
    refund_completed_vnd: unavailableMetric,
    tax_estimate_vnd: unavailableMetric,
  },
  payment_methods: [],
  preset: 'month',
  previous_from: '2026-07-01T00:00:00.000+07:00',
  previous_to: '2026-08-01T00:00:00.000+07:00',
  services: [],
  tax_policy_ids: [],
  to: '2026-09-01T00:00:00.000+07:00',
  trend: [],
}

const reconciliation = {
  amount_received: null,
  assigned_at: null,
  assigned_to: null,
  assigned_to_name: null,
  assigned_to_me: false,
  created_at: '2026-08-24T08:00:00.000+07:00',
  customer_transfer_claimed_at: '2026-08-24T08:30:00.000+07:00',
  display_code: 'NS-FIN-001',
  gross_amount: 450_000,
  id: 'payment-order-1',
  job_id: 'job-1',
  payment_method: 'platform_bank_manual' as const,
  response_deadline: '2026-08-25T08:30:00.000+07:00',
  settlement_state: 'customer_claimed' as const,
  status: 'manual_customer_claimed',
  updated_at: '2026-08-24T08:30:00.000+07:00',
  version: 1,
}

const reconciliationWithOwner = { ...reconciliation, assigned_to: 'owner-1', assigned_to_me: true }
const transferContentByOrder = {
  'payment-order-1': 'NSABCDEFGHIJKLMNOPQRSTUVWX',
  'payment-order-2': 'NSZYXWVUTSRQPONMLKJIHGFEDC',
}
const payoutMethod = {
  id: 'payout-method-live',
  worker_id: 'worker-live',
  worker_name: 'Worker Live',
  bank_key: 'VCB',
  bank_name: 'Vietcombank',
  bank_account_masked: '•••• 6789',
  status: 'pending_verification' as const,
  reviewed_at: null,
  review_reason: null,
  created_at: '2026-08-25T08:00:00.000+07:00',
  updated_at: '2026-08-25T08:00:00.000+07:00',
  version: 1,
}

describe('Admin Finance focused capability sheets', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockReadAdminDataRevisions.mockResolvedValue({ success: true, revisions: { finance: 1 } })
    mockSubscribeToAdminDataRevisions.mockReturnValue({ unsubscribe: jest.fn(async () => 'ok') })
    jest.mocked(adminControlService.getFinanceOverview).mockResolvedValue({ data: overview, status: 200, success: true })
    jest.mocked(adminControlService.getFinanceSummary).mockResolvedValue({ code: 'UNAVAILABLE', error: 'unavailable', status: 503, success: false })
    jest.mocked(adminControlService.getPaymentReconciliation).mockResolvedValue({
      data: {
        customer_ref: 'C-1122AABB',
        expected_amount_vnd: 450_000,
        generated_at: '2026-08-25T08:00:00.000+07:00',
        received_amount_vnd: null,
        reconciliation,
        service_type: 'cleaning',
        timeline: [],
        transfer_content: 'NSABCDEFGHIJKLMNOPQRSTUVWX',
        worker_ref: 'W-3344CCDD',
      },
      status: 200,
      success: true,
    })
    jest.mocked(adminControlService.listFinanceTransactions).mockResolvedValue({
      data: { generated_at: '2026-08-25T08:00:00.000+07:00', has_more: false, next_cursor: null, transactions: [] },
      status: 200,
      success: true,
    })
    jest.mocked(adminControlService.listPayoutMethods).mockResolvedValue({
      data: { generated_at: '2026-08-25T08:00:00.000+07:00', has_more: false, next_cursor: null, payout_methods: [payoutMethod], total_count: 1 },
      status: 200,
      success: true,
    })
    jest.mocked(adminControlService.getPayoutMethod).mockResolvedValue({
      data: { generated_at: '2026-08-25T08:00:00.000+07:00', payout_method: payoutMethod },
      status: 200,
      success: true,
    })
    jest.mocked(adminControlService.claimPaymentReconciliation).mockResolvedValue({
      data: {
        assigned_at: '2026-08-25T08:05:00.000+07:00',
        assigned_to: 'owner-1',
        generated_at: '2026-08-25T08:05:00.000+07:00',
        ok: true,
        payment_order_id: 'payment-order-1',
        version: 2,
      },
      status: 200,
      success: true,
    })
    jest.mocked(adminControlService.decidePaymentReconciliation).mockResolvedValue({
      data: {
        event_id: 'event-1',
        generated_at: '2026-08-25T08:10:00.000+07:00',
        hold_until: null,
        job_id: 'job-1',
        ok: true,
        outcome: 'paid',
        payment_order_id: 'payment-order-1',
        payment_status: 'paid',
        status: 'paid',
        version: 3,
      },
      status: 200,
      success: true,
    })
    jest.mocked(adminControlService.listPaymentReconciliations).mockResolvedValue({
      data: {
        generated_at: '2026-08-25T08:00:00.000+07:00',
        has_more: false,
        next_cursor: null,
        payment_reconciliations: [reconciliation],
        total_amount_vnd: 450_000,
        total_count: 1,
      },
      status: 200,
      success: true,
    })
  })

  it('does not expose cross-capability navigation and keeps unavailable GMV distinct from verified zero', async () => {
    render(<AdminFinancePanel actor={{ access_level: 'operator', capabilities: ['finance.read'] }} initialView="overview" reduceMotion reduceTransparency />)

    await screen.findByTestId('admin-finance-view-overview')
    withPillarContext(PILLAR, () => expect(screen.queryByTestId('admin-finance-view-navigation')).toBeNull())
    const gmv = within(screen.getByTestId('admin-finance-metric-gmv'))
    withPillarContext(PILLAR, () => expect(gmv.getByText('Chưa ghi nhận')).toBeTruthy())
    withPillarContext(PILLAR, () => expect(gmv.queryByText('0 ₫')).toBeNull())
  })

  it('uses one neutral, accessible control grammar for periods and Admin tabs', () => {
    render(<>
      <FinanceControls
        copy={{ customApply: 'Áp dụng', customFrom: 'Từ ngày', customRange: 'Tùy chọn', customTo: 'Đến ngày', period: 'Kỳ báo cáo', timeZone: 'Múi giờ Asia/Ho_Chi_Minh' }}
        customEditorOpen={false}
        customFrom="2026-08-01"
        customMode={false}
        customTo="2026-09-01"
        language="vi"
        onApplyCustom={jest.fn()}
        onChangeCustomFrom={jest.fn()}
        onChangeCustomTo={jest.fn()}
        onSelectRange={jest.fn()}
        onToggleCustom={jest.fn()}
        range="month"
      />
      <AdminTabNavigation
        items={[
          { key: 'accounts', label: 'Tài khoản nhận tiền', onPress: jest.fn(), selected: true, testID: 'finance-accounts-tab' },
          { key: 'withdrawals', label: 'Yêu cầu rút tiền', onPress: jest.fn(), selected: false, testID: 'finance-withdrawals-tab' },
        ]}
        testID="finance-tabs"
      />
    </>)

    const month = screen.getByTestId('admin-finance-range-month')
    expect(month.props.accessibilityState).toMatchObject({ selected: true })
    expect(month).toHaveStyle({ backgroundColor: color.surface.base, borderColor: color.text.strong, minHeight: 44 })
    expect(screen.getByText('✓ Tháng')).toBeOnTheScreen()
    expect(screen.queryByTestId('admin-finance-refresh')).toBeNull()
    expect(screen.getByTestId('finance-accounts-tab-indicator')).toBeOnTheScreen()
    expect(screen.getByTestId('finance-accounts-tab')).toHaveStyle({ backgroundColor: color.surface.base, minHeight: 44 })
  })

  it('opens reconciliation in the same sheet and does not mutate on open', async () => {
    render(<AdminFinancePanel actor={{ access_level: 'owner', capabilities: ['finance.read', 'finance.reconcile'] }} initialView="cash" reduceMotion reduceTransparency />)

    fireEvent.press(await screen.findByTestId('admin-finance-reconciliation-payment-order-1'))
    await waitFor(() => expect(screen.getByTestId('admin-finance-reconciliation-detail')).toBeTruthy())
    await waitFor(() => expect(adminControlService.getPaymentReconciliation).toHaveBeenCalledWith('payment-order-1'))
    withPillarContext(PILLAR, () => expect(adminControlService.claimPaymentReconciliation).not.toHaveBeenCalled())
    withPillarContext(PILLAR, () => expect(adminControlService.decidePaymentReconciliation).not.toHaveBeenCalled())
  })

  it('requires claim and final confirmation before recording reconciliation', async () => {
    const onFinanceUpdated = jest.fn()
    render(<AdminFinancePanel actor={{ access_level: 'owner', capabilities: ['finance.read', 'finance.reconcile'] }} initialView="cash" onFinanceUpdated={onFinanceUpdated} reduceMotion reduceTransparency />)

    fireEvent.press(await screen.findByTestId('admin-finance-reconciliation-payment-order-1'))
    await waitFor(() => expect(screen.getByText('Nhận xử lý')).toBeTruthy())
    fireEvent.press(screen.getByText('Nhận xử lý'))
    await waitFor(() => expect(adminControlService.claimPaymentReconciliation).toHaveBeenCalled())
    fireEvent.changeText(screen.getByLabelText('Số tiền thực nhận'), '450000')
    await waitFor(() => expect(screen.getByLabelText('Nội dung chuyển khoản NestScout').props.value).toBe('NSABCDEFGHIJKLMNOPQRSTUVWX'))
    expect(screen.getByLabelText('Nội dung chuyển khoản NestScout').props.editable).toBe(false)
    expect(screen.getByLabelText('Mã giao dịch ngân hàng').props.value).toBe('')
    fireEvent.press(screen.getByText('Xác nhận tiền vào'))
    withPillarContext(PILLAR, () => expect(adminControlService.decidePaymentReconciliation).not.toHaveBeenCalled())
    expect(screen.getByTestId('admin-finance-reconciliation-review')).toBeTruthy()
    fireEvent.press(screen.getByTestId('admin-finance-reconciliation-confirm'))
    expect(await screen.findByText(/Chưa nhập mã giao dịch thật trên sao kê/)).toBeTruthy()
    expect(adminControlService.decidePaymentReconciliation).not.toHaveBeenCalled()
    fireEvent.changeText(screen.getByLabelText('Mã giao dịch ngân hàng'), 'BANK-TRX-20261011')
    fireEvent.press(screen.getByTestId('admin-finance-reconciliation-confirm'))
    await waitFor(() => expect(adminControlService.decidePaymentReconciliation).toHaveBeenCalledWith('payment-order-1', expect.objectContaining({
      bank_reference: 'BANK-TRX-20261011',
      client_request_id: expect.any(String),
      decision: 'confirm',
      expected_version: 2,
    })))
    expect(onFinanceUpdated).toHaveBeenCalledTimes(1)
  })

  it('loads the matching NS transfer content when Admin opens a different reconciliation', async () => {
    const secondReconciliation = {
      ...reconciliationWithOwner,
      display_code: 'NS-FIN-002',
      id: 'payment-order-2',
      job_id: 'job-2',
    }
    jest.mocked(adminControlService.listPaymentReconciliations).mockResolvedValue({
      data: {
        generated_at: '2026-08-25T08:00:00.000+07:00',
        has_more: false,
        next_cursor: null,
        payment_reconciliations: [reconciliationWithOwner, secondReconciliation],
        total_amount_vnd: 900_000,
        total_count: 2,
      },
      status: 200,
      success: true,
    })
    jest.mocked(adminControlService.getPaymentReconciliation).mockImplementation(async (id) => ({
      data: {
        customer_ref: 'C-1122AABB',
        expected_amount_vnd: 450_000,
        generated_at: '2026-08-25T08:00:00.000+07:00',
        received_amount_vnd: null,
        reconciliation: id === 'payment-order-2' ? secondReconciliation : reconciliationWithOwner,
        service_type: 'cleaning',
        timeline: [],
        transfer_content: transferContentByOrder[id as keyof typeof transferContentByOrder],
        worker_ref: 'W-3344CCDD',
      },
      status: 200,
      success: true,
    }))
    render(<AdminFinancePanel actor={{ access_level: 'owner', capabilities: ['finance.read', 'finance.reconcile'] }} initialView="cash" reduceMotion reduceTransparency />)

    fireEvent.press(await screen.findByTestId('admin-finance-reconciliation-payment-order-1'))
    await waitFor(() => expect(screen.getByLabelText('Nội dung chuyển khoản NestScout').props.value).toBe(transferContentByOrder['payment-order-1']))
    expect(screen.getByLabelText('Nội dung chuyển khoản NestScout').props.editable).toBe(false)
    expect(screen.getByLabelText('Mã giao dịch ngân hàng').props.value).toBe('')
    fireEvent.press(screen.getByText('Hủy'))

    fireEvent.press(await screen.findByTestId('admin-finance-reconciliation-payment-order-2'))
    await waitFor(() => expect(screen.getByLabelText('Nội dung chuyển khoản NestScout').props.value).toBe(transferContentByOrder['payment-order-2']))
    expect(screen.getByLabelText('Nội dung chuyển khoản NestScout').props.editable).toBe(false)
    expect(screen.getByLabelText('Mã giao dịch ngân hàng').props.value).toBe('')
  })

  it('retries missing NS content automatically and keeps the final payment decision gated', async () => {
    jest.mocked(adminControlService.getPaymentReconciliation).mockResolvedValueOnce({
      data: {
        customer_ref: 'C-1122AABB',
        expected_amount_vnd: 450_000,
        generated_at: '2026-08-25T08:00:00.000+07:00',
        received_amount_vnd: null,
        reconciliation,
        service_type: 'cleaning',
        timeline: [],
        transfer_content: null,
        worker_ref: 'W-3344CCDD',
      },
      status: 200,
      success: true,
    })
    jest.mocked(adminControlService.getPaymentReconciliation).mockResolvedValueOnce({
      data: {
        customer_ref: 'C-1122AABB',
        expected_amount_vnd: 450_000,
        generated_at: '2026-08-25T08:00:00.000+07:00',
        received_amount_vnd: null,
        reconciliation,
        service_type: 'cleaning',
        timeline: [],
        transfer_content: transferContentByOrder['payment-order-1'],
        worker_ref: 'W-3344CCDD',
      },
      status: 200,
      success: true,
    })
    render(<AdminFinancePanel actor={{ access_level: 'owner', capabilities: ['finance.read', 'finance.reconcile'] }} initialView="cash" reduceMotion reduceTransparency />)

    fireEvent.press(await screen.findByTestId('admin-finance-reconciliation-payment-order-1'))
    await waitFor(() => expect(adminControlService.getPaymentReconciliation).toHaveBeenCalledTimes(2), { timeout: 2_000 })
    fireEvent.press(await screen.findByText('Nhận xử lý'))
    await waitFor(() => expect(adminControlService.claimPaymentReconciliation).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByLabelText('Nội dung chuyển khoản NestScout').props.value).toBe(transferContentByOrder['payment-order-1']))
    expect(screen.queryByText('Tải lại')).toBeNull()
    expect(screen.getByLabelText('Nội dung chuyển khoản NestScout').props.editable).toBe(false)
    expect(screen.getByLabelText('Mã giao dịch ngân hàng').props.value).toBe('')
    expect(screen.getByLabelText('Xác nhận tiền vào').props.accessibilityState?.disabled).not.toBe(true)
    expect(adminControlService.decidePaymentReconciliation).not.toHaveBeenCalled()
  })

  it('recovers a transient detail-read failure automatically without asking Admin to reload', async () => {
    jest.mocked(adminControlService.getPaymentReconciliation)
      .mockResolvedValueOnce({ code: 'SERVICE_UNAVAILABLE', error: 'temporarily unavailable', status: 503, success: false })
      .mockResolvedValueOnce({
        data: {
          customer_ref: 'C-1122AABB',
          expected_amount_vnd: 450_000,
          generated_at: '2026-08-25T08:00:00.000+07:00',
          received_amount_vnd: null,
          reconciliation: reconciliationWithOwner,
          service_type: 'cleaning',
          timeline: [],
          transfer_content: transferContentByOrder['payment-order-1'],
          worker_ref: 'W-3344CCDD',
        },
        status: 200,
        success: true,
      })

    render(<AdminFinancePanel actor={{ access_level: 'owner', capabilities: ['finance.read', 'finance.reconcile'] }} initialView="cash" reduceMotion reduceTransparency />)
    fireEvent.press(await screen.findByTestId('admin-finance-reconciliation-payment-order-1'))

    await waitFor(() => expect(adminControlService.getPaymentReconciliation).toHaveBeenCalledTimes(2), { timeout: 2_000 })
    await waitFor(() => expect(screen.getByLabelText('Nội dung chuyển khoản NestScout').props.value).toBe(transferContentByOrder['payment-order-1']))
    expect(screen.queryByText('Tải lại')).toBeNull()
    expect(adminControlService.decidePaymentReconciliation).not.toHaveBeenCalled()
  })

  it('retries a thrown Finance detail read instead of leaving the reconciliation loading forever', async () => {
    jest.mocked(adminControlService.getPaymentReconciliation).mockRejectedValueOnce(new Error('temporary network failure'))

    render(<AdminFinancePanel actor={{ access_level: 'owner', capabilities: ['finance.read', 'finance.reconcile'] }} initialView="cash" reduceMotion reduceTransparency />)
    fireEvent.press(await screen.findByTestId('admin-finance-reconciliation-payment-order-1'))

    await waitFor(() => expect(adminControlService.getPaymentReconciliation).toHaveBeenCalledTimes(2), { timeout: 2_000 })
    await waitFor(() => expect(screen.queryByText('Đang đồng bộ trạng thái…')).toBeNull())
    expect(screen.queryByText('Chưa thể tải chi tiết đối soát.')).toBeNull()
    fireEvent.press(await screen.findByText('Nhận xử lý'))
    await waitFor(() => expect(adminControlService.claimPaymentReconciliation).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByLabelText('Nội dung chuyển khoản NestScout').props.value).toBe(transferContentByOrder['payment-order-1']))
    expect(adminControlService.decidePaymentReconciliation).not.toHaveBeenCalled()
  })

  it('retries a thrown Finance overview read instead of silently leaving the first load stale', async () => {
    jest.mocked(adminControlService.getFinanceOverview).mockRejectedValueOnce(new Error('temporary network failure'))

    render(<AdminFinancePanel actor={{ access_level: 'owner', capabilities: ['finance.read'] }} initialView="overview" reduceMotion reduceTransparency />)

    await waitFor(() => expect(adminControlService.getFinanceOverview).toHaveBeenCalledTimes(2), { timeout: 2_000 })
    await screen.findByTestId('admin-finance-view-overview')
    expect(screen.queryByText('Chưa thể đồng bộ dữ liệu tài chính. Kael sẽ tự thử lại khi có kết nối.')).toBeNull()
  })

  it('keeps the Admin revision signal usable after its first read rejects', async () => {
    mockReadAdminDataRevisions
      .mockRejectedValueOnce(new Error('temporary network failure'))
      .mockResolvedValue({ success: true, revisions: { finance: 1 } })

    render(<AdminDataSyncProvider enabled ownerId="admin-owner"><></></AdminDataSyncProvider>)
    await waitFor(() => expect(mockReadAdminDataRevisions).toHaveBeenCalledTimes(1))
    const onStatus = mockSubscribeToAdminDataRevisions.mock.calls[0]?.[2] as ((status: string) => void) | undefined
    expect(onStatus).toBeDefined()
    await act(async () => { onStatus?.('SUBSCRIBED') })
    await waitFor(() => expect(mockReadAdminDataRevisions).toHaveBeenCalledTimes(2))
  })

  it('refreshes the real Finance surface when an authorized live revision arrives', async () => {
    render(<AdminDataSyncProvider enabled ownerId="admin-owner">
      <AdminFinancePanel actor={{ access_level: 'owner', capabilities: ['finance.read', 'finance.reconcile'] }} initialView="overview" reduceMotion reduceTransparency />
    </AdminDataSyncProvider>)
    await waitFor(() => expect(adminControlService.getFinanceOverview).toHaveBeenCalledTimes(1))

    const onRevision = mockSubscribeToAdminDataRevisions.mock.calls[0]?.[1] as ((revision: { revision: number; section: string }) => void) | undefined
    expect(onRevision).toBeDefined()
    await act(async () => { onRevision?.({ revision: 2, section: 'finance' }) })

    await waitFor(() => expect(adminControlService.getFinanceOverview).toHaveBeenCalledTimes(2))
    expect(adminControlService.decidePaymentReconciliation).not.toHaveBeenCalled()
  })

  it('preserves unsaved reconciliation inputs when a Finance revision refreshes an open detail', async () => {
    const detail = {
      customer_ref: 'C-1122AABB',
      expected_amount_vnd: 450_000,
      generated_at: '2026-08-25T08:00:00.000+07:00',
      received_amount_vnd: null,
      reconciliation: reconciliationWithOwner,
      service_type: 'cleaning',
      timeline: [],
      transfer_content: transferContentByOrder['payment-order-1'],
      worker_ref: 'W-3344CCDD',
    }
    jest.mocked(adminControlService.getPaymentReconciliation)
      .mockResolvedValueOnce({ data: { ...detail, reconciliation }, status: 200, success: true })
      .mockResolvedValueOnce({ data: detail, status: 200, success: true })

    render(<AdminDataSyncProvider enabled ownerId="admin-owner">
      <AdminFinancePanel actor={{ access_level: 'owner', capabilities: ['finance.read', 'finance.reconcile'] }} initialView="cash" reduceMotion reduceTransparency />
    </AdminDataSyncProvider>)

    fireEvent.press(await screen.findByTestId('admin-finance-reconciliation-payment-order-1'))
    fireEvent.press(await screen.findByText('Nhận xử lý'))
    await waitFor(() => expect(adminControlService.claimPaymentReconciliation).toHaveBeenCalled())
    fireEvent.changeText(await screen.findByLabelText('Số tiền thực nhận'), '450000')
    fireEvent.changeText(screen.getByLabelText('Mã giao dịch ngân hàng'), 'BANK-DRAFT-731')

    const onRevision = mockSubscribeToAdminDataRevisions.mock.calls[0]?.[1] as ((revision: { revision: number; section: string }) => void) | undefined
    expect(onRevision).toBeDefined()
    await act(async () => { onRevision?.({ revision: 2, section: 'finance' }) })

    await waitFor(() => expect(adminControlService.getPaymentReconciliation).toHaveBeenCalledTimes(2))
    expect(screen.getByLabelText('Số tiền thực nhận').props.value).toBe('450000')
    expect(screen.getByLabelText('Mã giao dịch ngân hàng').props.value).toBe('BANK-DRAFT-731')
    expect(adminControlService.decidePaymentReconciliation).not.toHaveBeenCalled()
  })

  it('reads the revision baseline again after Realtime subscribes to close the handshake gap', async () => {
    mockReadAdminDataRevisions
      .mockResolvedValueOnce({ success: true, revisions: { finance: 1 } })
      .mockResolvedValueOnce({ success: true, revisions: { finance: 2 } })

    render(<AdminDataSyncProvider enabled ownerId="admin-owner">
      <AdminFinancePanel actor={{ access_level: 'owner', capabilities: ['finance.read', 'finance.reconcile'] }} initialView="overview" reduceMotion reduceTransparency />
    </AdminDataSyncProvider>)
    await waitFor(() => expect(adminControlService.getFinanceOverview).toHaveBeenCalledTimes(1))

    const onStatus = mockSubscribeToAdminDataRevisions.mock.calls[0]?.[2] as ((status: string) => void) | undefined
    expect(onStatus).toBeDefined()
    await act(async () => { onStatus?.('SUBSCRIBED') })

    await waitFor(() => expect(adminControlService.getFinanceOverview).toHaveBeenCalledTimes(2))
    expect(adminControlService.decidePaymentReconciliation).not.toHaveBeenCalled()
  })

  it('ignores delayed Realtime status callbacks after the Admin sync provider unmounts', async () => {
    const view = render(<AdminDataSyncProvider enabled ownerId="admin-owner">
      <AdminFinancePanel actor={{ access_level: 'owner', capabilities: ['finance.read', 'finance.reconcile'] }} initialView="overview" reduceMotion reduceTransparency />
    </AdminDataSyncProvider>)
    await waitFor(() => expect(mockReadAdminDataRevisions).toHaveBeenCalled())

    const onStatus = mockSubscribeToAdminDataRevisions.mock.calls[0]?.[2] as ((status: string) => void) | undefined
    const readCount = mockReadAdminDataRevisions.mock.calls.length
    view.unmount()
    await act(async () => { onStatus?.('CLOSED') })

    expect(mockReadAdminDataRevisions).toHaveBeenCalledTimes(readCount)
  })

  it('refreshes payout lists and the open detail from Finance revisions without a manual reload control', async () => {
    render(<AdminDataSyncProvider enabled ownerId="admin-owner">
      <AdminPayoutsPanel actor={{ access_level: 'owner', capabilities: ['finance.read', 'payouts.read', 'payouts.process'] }} reduceMotion reduceTransparency />
    </AdminDataSyncProvider>)
    expect(await screen.findByTestId('admin-payout-method-payout-method-live')).toBeTruthy()
    expect(adminControlService.listPayoutMethods).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Tải lại')).toBeNull()

    fireEvent.press(screen.getByTestId('admin-payout-method-payout-method-live'))
    expect(await screen.findByTestId('admin-payout-method-detail')).toBeTruthy()
    expect(adminControlService.getPayoutMethod).toHaveBeenCalledTimes(1)

    const onRevision = mockSubscribeToAdminDataRevisions.mock.calls[0]?.[1] as ((revision: { revision: number; section: string }) => void) | undefined
    expect(onRevision).toBeDefined()
    await act(async () => { onRevision?.({ revision: 2, section: 'finance' }) })

    await waitFor(() => expect(adminControlService.listPayoutMethods).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(adminControlService.getPayoutMethod).toHaveBeenCalledTimes(2))
    expect(adminControlService.decidePayoutMethod).not.toHaveBeenCalled()
  })

  it('keeps payout and reporting details inline, masked and file-based', () => {
    const payouts = readFileSync(resolve(__dirname, '../admin-payouts.tsx'), 'utf8')
    const reports = readFileSync(resolve(__dirname, '../admin-finance-reports.tsx'), 'utf8')
    withPillarContext(PILLAR, () => expect(payouts).not.toMatch(/<Modal\b/))
    withPillarContext(PILLAR, () => expect(payouts).toContain('external_transfer_confirmed: true'))
    withPillarContext(PILLAR, () => expect(payouts).toContain('accessWithdrawalSensitive'))
    withPillarContext(PILLAR, () => expect(reports).not.toMatch(/<Modal\b/))
    withPillarContext(PILLAR, () => expect(reports).toContain("await import('expo-file-system')"))
    withPillarContext(PILLAR, () => expect(reports).toContain('Share.share({ title: filename, url: file.uri })'))
    withPillarContext(PILLAR, () => expect(reports).not.toContain('Share.share({ message: csv'))
  })
})
