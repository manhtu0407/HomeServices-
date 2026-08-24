import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native'
import { AdminFinancePanel } from '../admin-finance'
import { adminControlService } from '@/lib/services'

jest.mock('@/lib/app-language', () => ({ useAppLanguage: () => 'vi' }))
jest.mock('@/lib/services', () => ({
  adminControlService: {
    approveFinanceTaxPolicy: jest.fn(),
    createFinanceTaxPolicyDraft: jest.fn(),
    decidePaymentReconciliation: jest.fn(),
    getFinanceOverview: jest.fn(),
    getFinanceSummary: jest.fn(),
    exportFinanceCsv: jest.fn(),
    listFinanceTaxPolicies: jest.fn(),
    listFinanceTransactions: jest.fn(),
    listPaymentReconciliations: jest.fn(),
    recordFinanceBalanceSnapshot: jest.fn(),
    retireFinanceTaxPolicy: jest.fn(),
    updateFinanceTaxPolicyDraft: jest.fn(),
  },
}))

const summary = {
  range: 'month' as const,
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
}

const draftTaxPolicy = {
  approved_at: null,
  approved_by: null,
  basis: 'commission_retained' as const,
  created_at: '2026-08-13T00:00:00.000Z',
  effective_from: '2026-09-01',
  effective_to: null,
  id: 'tax-policy-1',
  name: 'Thuế giá trị gia tăng',
  rate_bps: 500,
  source_reference: 'KT-2026-09',
  status: 'draft' as const,
  subject: 'platform' as const,
  tax_type: 'vat',
  updated_at: '2026-08-13T00:00:00.000Z',
  version: 1,
}

describe('AdminFinancePanel', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(adminControlService.getFinanceOverview).mockResolvedValue({ success: false, code: 'UNAVAILABLE', error: 'overview unavailable', status: 503 })
    jest.mocked(adminControlService.getFinanceSummary).mockResolvedValue({ success: true, data: summary, status: 200 })
    jest.mocked(adminControlService.approveFinanceTaxPolicy).mockResolvedValue({ success: true, data: { ...draftTaxPolicy, approved_at: '2026-08-13T01:00:00.000Z', approved_by: 'owner-1', status: 'approved' }, status: 200 })
    jest.mocked(adminControlService.createFinanceTaxPolicyDraft).mockResolvedValue({ success: true, data: draftTaxPolicy, status: 201 })
    jest.mocked(adminControlService.listFinanceTaxPolicies).mockResolvedValue({ success: true, data: { active_policy_ids: [], tax_policies: [] }, status: 200 })
    jest.mocked(adminControlService.listFinanceTransactions).mockResolvedValue({ success: true, data: { has_more: false, next_cursor: null, transactions: [] }, status: 200 })
    jest.mocked(adminControlService.listPaymentReconciliations).mockResolvedValue({
      success: true,
      data: {
        payment_reconciliations: [{
          id: 'payment-order-1',
          job_id: 'job-1',
          payment_method: 'platform_bank_manual',
          status: 'manual_customer_claimed',
          gross_amount: 450000,
          amount_received: null,
          customer_transfer_claimed_at: '2026-08-11T10:00:00.000Z',
          response_deadline: null,
          created_at: '2026-08-11T09:00:00.000Z',
          updated_at: '2026-08-11T10:00:00.000Z',
        }],
        has_more: false,
        next_offset: null,
      },
      status: 200,
    })
    jest.mocked(adminControlService.retireFinanceTaxPolicy).mockResolvedValue({ success: true, data: { ...draftTaxPolicy, status: 'retired' }, status: 200 })
    jest.mocked(adminControlService.updateFinanceTaxPolicyDraft).mockResolvedValue({ success: true, data: draftTaxPolicy, status: 200 })
  })

  it('shows real reconciliation data and starts pending financial figures at zero', async () => {
    render(<AdminFinancePanel actor={{ access_level: 'owner', capabilities: ['finance.read', 'finance.reconcile'] }} initialView="cash" reduceMotion reduceTransparency />)

    expect(await screen.findByTestId('admin-finance-reconciliation-payment-order-1')).toBeTruthy()
    expect(screen.queryByText('Chưa đủ dữ liệu')).toBeNull()
    expect(screen.getAllByText('0 ₫').length).toBeGreaterThan(0)
    expect(screen.getAllByText('450.000 ₫').length).toBeGreaterThan(0)
    expect(screen.getByTestId('admin-finance-reconciliation-payment-order-1')).toBeTruthy()
  })

  it('uses the selected range for the server summary and never invents a balance snapshot', async () => {
    render(<AdminFinancePanel actor={{ access_level: 'owner', capabilities: ['finance.read', 'finance.reconcile'] }} initialView="cash" reduceMotion reduceTransparency />)

    await screen.findByTestId('admin-finance-reconciliation-payment-order-1')
    fireEvent.press(screen.getByTestId('admin-finance-range-week'))

    await waitFor(() => {
      expect(adminControlService.getFinanceSummary).toHaveBeenLastCalledWith({ range: 'week' })
    })
    expect(adminControlService.recordFinanceBalanceSnapshot).not.toHaveBeenCalled()
  })

  it('does not let finance settle a direct payment before it reaches reconciliation', async () => {
    jest.mocked(adminControlService.listPaymentReconciliations).mockResolvedValue({
      success: true,
      data: {
        payment_reconciliations: [{
          id: 'direct-order-1',
          job_id: 'job-2',
          payment_method: 'direct_worker',
          status: 'direct_awaiting_worker_confirmation',
          gross_amount: 450000,
          amount_received: null,
          customer_transfer_claimed_at: null,
          response_deadline: '2026-08-12T10:00:00.000Z',
          created_at: '2026-08-11T09:00:00.000Z',
          updated_at: '2026-08-11T10:00:00.000Z',
        }],
        has_more: false,
        next_offset: null,
      },
      status: 200,
    })
    render(<AdminFinancePanel actor={{ access_level: 'owner', capabilities: ['finance.read', 'finance.reconcile'] }} initialView="cash" reduceMotion reduceTransparency />)

    const card = await screen.findByTestId('admin-finance-reconciliation-direct-order-1')
    fireEvent.press(card)

    expect(screen.getAllByText('Đang chờ xác nhận hai phía').length).toBeGreaterThan(0)
    expect(screen.queryByText('Xác nhận trả trực tiếp')).toBeNull()
  })

  it('opens on the overview and exposes four accessible finance views', async () => {
    render(<AdminFinancePanel actor={{ access_level: 'operator', capabilities: ['finance.read'] }} reduceMotion reduceTransparency />)

    expect(await screen.findByTestId('admin-finance-view-overview')).toBeTruthy()
    expect(screen.getByTestId('admin-finance-view-navigation-active-lens')).toBeTruthy()
    expect(screen.getByTestId('admin-finance-view-navigation-inner-refraction')).toBeTruthy()
    expect(screen.getByTestId('admin-finance-tab-overview').props.accessibilityState).toEqual({ selected: true })
    expect(screen.getByTestId('admin-finance-tab-cash').props.accessibilityState).toEqual({ selected: false })
    expect(screen.getByTestId('admin-finance-tab-commission').props.accessibilityState).toEqual({ selected: false })
    expect(screen.getByTestId('admin-finance-tab-tax').props.accessibilityState).toEqual({ selected: false })

    fireEvent.press(screen.getByTestId('admin-finance-tab-cash'))
    expect(screen.getByTestId('admin-finance-view-cash')).toBeTruthy()

    fireEvent.press(screen.getByTestId('admin-finance-tab-commission'))
    expect(screen.getByTestId('admin-finance-view-commission')).toBeTruthy()

    fireEvent.press(screen.getByTestId('admin-finance-tab-tax'))
    expect(screen.getByTestId('admin-finance-view-tax')).toBeTruthy()
    expect(await screen.findByTestId('admin-finance-tax-reports')).toBeTruthy()
    expect(await screen.findByText('Chưa có chính sách thuế. Chưa có ước tính.')).toBeTruthy()
    expect(screen.getByText('Chưa cấu hình — chưa có ước tính')).toBeTruthy()
  })

  it('renders pending commission figures as zero while synchronization is pending', async () => {
    render(<AdminFinancePanel actor={{ access_level: 'operator', capabilities: ['finance.read'] }} initialView="commission" reduceMotion reduceTransparency />)

    expect(await screen.findByTestId('admin-finance-view-commission')).toBeTruthy()
    expect(screen.queryByText('Chưa đủ dữ liệu')).toBeNull()
    expect(within(screen.getByTestId('admin-finance-metric-commission-collected')).getByText('0 ₫')).toBeTruthy()
    expect(within(screen.getByTestId('admin-finance-metric-commission-rate')).getByText('0%')).toBeTruthy()
    expect(screen.getByTestId('admin-finance-metric-commission-rate-source')).toHaveTextContent('Đang chờ đồng bộ')
  })

  it('uses clear admin copy when transaction detail is unavailable', async () => {
    jest.mocked(adminControlService.listFinanceTransactions).mockResolvedValue({ success: false, code: 'NOT_FOUND', error: 'Không tìm thấy endpoint', status: 404 })
    render(<AdminFinancePanel actor={{ access_level: 'operator', capabilities: ['finance.read'] }} initialView="commission" reduceMotion reduceTransparency />)

    expect(await screen.findByTestId('admin-finance-transactions')).toBeTruthy()
    expect(await screen.findByText('Dữ liệu giao dịch chi tiết đang chờ đồng bộ.')).toBeTruthy()
    expect(screen.queryByText('Đang tải dữ liệu…')).toBeNull()
    expect(screen.queryByText('Không tìm thấy endpoint')).toBeNull()
  })

  it('uses clear admin copy when tax policy data is unavailable', async () => {
    jest.mocked(adminControlService.listFinanceTaxPolicies).mockResolvedValue({ success: false, code: 'NOT_FOUND', error: 'Không tìm thấy endpoint', status: 404 })
    render(<AdminFinancePanel actor={{ access_level: 'operator', capabilities: ['finance.read'] }} initialView="tax" reduceMotion reduceTransparency />)

    expect(await screen.findByTestId('admin-finance-tax-reports')).toBeTruthy()
    expect(screen.getByText('Chưa thể tải chính sách thuế lúc này.')).toBeTruthy()
    expect(screen.queryByText('Không tìm thấy endpoint')).toBeNull()
    fireEvent.press(screen.getByTestId('admin-finance-tax-retry'))
    await waitFor(() => expect(adminControlService.listFinanceTaxPolicies).toHaveBeenCalledTimes(2))
  })

  it('lets a tax manager save a valid draft through the server-backed workflow', async () => {
    render(<AdminFinancePanel actor={{ access_level: 'operator', capabilities: ['finance.read', 'finance.tax.manage'] }} initialView="tax" reduceMotion reduceTransparency />)

    fireEvent.press(await screen.findByTestId('admin-finance-tax-create'))
    fireEvent.changeText(screen.getByTestId('admin-finance-tax-form-name'), 'Thuế giá trị gia tăng')
    fireEvent.changeText(screen.getByTestId('admin-finance-tax-form-type'), 'vat')
    fireEvent.changeText(screen.getByTestId('admin-finance-tax-form-rate'), '5')
    fireEvent.changeText(screen.getByTestId('admin-finance-tax-form-effective-from'), '2026-09-01')
    fireEvent.changeText(screen.getByTestId('admin-finance-tax-form-source-reference'), 'KT-2026-09')
    fireEvent.press(screen.getByTestId('admin-finance-tax-editor-submit'))

    await waitFor(() => expect(adminControlService.createFinanceTaxPolicyDraft).toHaveBeenCalledWith({
      basis: 'commission_retained',
      effective_from: '2026-09-01',
      name: 'Thuế giá trị gia tăng',
      rate_bps: 500,
      source_reference: 'KT-2026-09',
      subject: 'platform',
      tax_type: 'vat',
    }))
  })

  it('requires Owner accounting evidence before approving a draft', async () => {
    jest.mocked(adminControlService.listFinanceTaxPolicies).mockResolvedValue({ success: true, data: { active_policy_ids: [], tax_policies: [draftTaxPolicy] }, status: 200 })
    render(<AdminFinancePanel actor={{ access_level: 'owner', capabilities: ['finance.read', 'finance.tax.manage'] }} initialView="tax" reduceMotion reduceTransparency />)

    fireEvent.press(await screen.findByTestId('admin-finance-tax-approve-tax-policy-1'))
    fireEvent.press(screen.getByTestId('admin-finance-tax-editor-submit'))
    expect(adminControlService.approveFinanceTaxPolicy).not.toHaveBeenCalled()

    fireEvent.changeText(screen.getByTestId('admin-finance-tax-form-approval-reference'), 'KT-APPROVED-2026-09')
    fireEvent.press(screen.getByTestId('admin-finance-tax-editor-submit'))
    await waitFor(() => expect(adminControlService.approveFinanceTaxPolicy).toHaveBeenCalledWith('tax-policy-1', { accountant_approval_reference: 'KT-APPROVED-2026-09' }))
  })

  it('keeps tax policy management actions hidden from a finance reader', async () => {
    jest.mocked(adminControlService.listFinanceTaxPolicies).mockResolvedValue({ success: true, data: { active_policy_ids: [], tax_policies: [draftTaxPolicy] }, status: 200 })
    render(<AdminFinancePanel actor={{ access_level: 'operator', capabilities: ['finance.read'] }} initialView="tax" reduceMotion reduceTransparency />)

    await screen.findByTestId('admin-finance-tax-policy-tax-policy-1')
    expect(screen.queryByTestId('admin-finance-tax-create')).toBeNull()
    expect(screen.queryByTestId('admin-finance-tax-edit-tax-policy-1')).toBeNull()
    expect(screen.queryByTestId('admin-finance-tax-approve-tax-policy-1')).toBeNull()
  })

  it('uses title-case finance tab names while preserving readable accessibility labels', async () => {
    render(<AdminFinancePanel actor={{ access_level: 'operator', capabilities: ['finance.read'] }} reduceMotion reduceTransparency />)

    await screen.findByTestId('admin-finance-view-overview')
    expect(screen.getByText('Tổng quan')).toBeTruthy()
    expect(screen.getByText('Dòng tiền & đối soát')).toBeTruthy()
    expect(screen.getByText('Hoa hồng & chi trả')).toBeTruthy()
    expect(screen.getByText('Thuế & báo cáo')).toBeTruthy()
    expect(screen.getByTestId('admin-finance-tab-overview').props.accessibilityLabel).toBe('Tổng quan')
  })

  it.each([
    ['overview', 'admin-finance-view-overview'],
    ['cash', 'admin-finance-view-cash'],
    ['commission', 'admin-finance-view-commission'],
    ['tax', 'admin-finance-view-tax'],
  ] as const)('keeps %s usable without a page-level finance load alert', async (view, viewTestId) => {
    render(<AdminFinancePanel actor={{ access_level: 'operator', capabilities: ['finance.read'] }} initialView={view} reduceMotion reduceTransparency />)

    expect(await screen.findByTestId(viewTestId)).toBeTruthy()
    expect(screen.queryByText('Chưa đủ dữ liệu')).toBeNull()
    expect(screen.queryByText(/không thể tải đầy đủ dữ liệu tài chính/i)).toBeNull()
  })

  it('requests a custom inclusive date range in Ho Chi Minh City time', async () => {
    render(<AdminFinancePanel actor={{ access_level: 'operator', capabilities: ['finance.read'] }} reduceMotion reduceTransparency />)
    await screen.findByTestId('admin-finance-view-overview')

    fireEvent.press(screen.getByTestId('admin-finance-range-custom-toggle'))
    fireEvent.changeText(screen.getByTestId('admin-finance-custom-from'), '2026-08-01')
    fireEvent.changeText(screen.getByTestId('admin-finance-custom-to'), '2026-08-13')
    fireEvent.press(screen.getByTestId('admin-finance-range-custom'))

    await waitFor(() => {
      expect(adminControlService.getFinanceOverview).toHaveBeenLastCalledWith({
        from: '2026-07-31T17:00:00.000Z',
        to: '2026-08-13T17:00:00.000Z',
      })
    })
  })

  it('keeps reconciliation actions hidden for a read-only finance admin', async () => {
    render(<AdminFinancePanel actor={{ access_level: 'operator', capabilities: ['finance.read'] }} initialView="cash" reduceMotion reduceTransparency />)

    expect(await screen.findByTestId('admin-finance-view-cash')).toBeTruthy()
    expect(screen.getByText('Chỉ xem')).toBeTruthy()
    expect(screen.queryByText('Lưu số dư quan sát')).toBeNull()
    expect(screen.queryByTestId('admin-finance-reconciliation-payment-order-1')).toBeNull()
    expect(adminControlService.listPaymentReconciliations).not.toHaveBeenCalled()
  })

  it('starts unavailable overview metrics at zero and explains their source while synchronization is pending', async () => {
    render(<AdminFinancePanel actor={{ access_level: 'operator', capabilities: ['finance.read'] }} reduceMotion reduceTransparency />)

    expect(await screen.findByTestId('admin-finance-view-overview')).toBeTruthy()
    expect(within(screen.getByTestId('admin-finance-metric-gmv')).getByText('0 ₫')).toBeTruthy()
    expect(within(screen.getByTestId('admin-finance-metric-paid-jobs')).getByText('0')).toBeTruthy()
    expect(within(screen.getByTestId('admin-finance-metric-business-retained')).getByText('0 ₫')).toBeTruthy()
    expect(screen.getByTestId('admin-finance-metric-gmv-source')).toHaveTextContent('Nguồn: Khoản thanh toán hoàn tất · Đang chờ đồng bộ')
    expect(screen.getByTestId('admin-finance-metric-business-retained-source')).toHaveTextContent('Công thức: Hoa hồng đã thu − hoàn hoặc đảo phí · Đang chờ đồng bộ')
  })
})
