import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { AdminFinancePanel } from '../admin-finance'
import { adminControlService } from '@/lib/services'

jest.mock('@/lib/app-language', () => ({ useAppLanguage: () => 'vi' }))
jest.mock('@/lib/services', () => ({
  adminControlService: {
    decidePaymentReconciliation: jest.fn(),
    getFinanceSummary: jest.fn(),
    listPaymentReconciliations: jest.fn(),
    recordFinanceBalanceSnapshot: jest.fn(),
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

describe('AdminFinancePanel', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.mocked(adminControlService.getFinanceSummary).mockResolvedValue({ success: true, data: summary, status: 200 })
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
  })

  it('shows real reconciliation data and leaves variance unknown when snapshots are missing', async () => {
    render(<AdminFinancePanel actor={{ access_level: 'owner', capabilities: ['finance.reconcile'] }} reduceMotion reduceTransparency />)

    expect(await screen.findByTestId('admin-finance-reconciliation-payment-order-1')).toBeTruthy()
    expect(screen.getAllByText('Chưa đủ dữ liệu').length).toBeGreaterThan(0)
    expect(screen.getAllByText('450.000 ₫').length).toBeGreaterThan(0)
    expect(screen.getByTestId('admin-finance-reconciliation-payment-order-1')).toBeTruthy()
  })

  it('uses the selected range for the server summary and never invents a balance snapshot', async () => {
    render(<AdminFinancePanel actor={{ access_level: 'owner', capabilities: ['finance.reconcile'] }} reduceMotion reduceTransparency />)

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
    render(<AdminFinancePanel actor={{ access_level: 'owner', capabilities: ['finance.reconcile'] }} reduceMotion reduceTransparency />)

    const card = await screen.findByTestId('admin-finance-reconciliation-direct-order-1')
    fireEvent.press(card)

    expect(screen.getAllByText('Đang chờ xác nhận hai phía').length).toBeGreaterThan(0)
    expect(screen.queryByText('Xác nhận trả trực tiếp')).toBeNull()
  })
})
