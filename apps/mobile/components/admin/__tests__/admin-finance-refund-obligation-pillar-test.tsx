import { fireEvent, render, screen, within } from '@testing-library/react-native'
import type { AdminFinanceTransaction } from '@nestscout/shared'
import type { RefundSummary } from '@nestscout/shared'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { adminControlService } from '@/lib/services'
import { FinanceTransactionsPanel } from '../admin-finance-reports'

export const PILLAR = {
  id: 'P92-admin-finance-refund-obligation',
  invariant: 'Admin transaction detail distinguishes an unapproved review request from a recorded refund obligation without claiming returned money or offering unverified transfer actions.',
  authority: ['governance/RULES.md #7', 'governance/RULES.md #8'],
  target: 'apps/mobile/components/admin/admin-finance-reports.tsx',
  layer: 'ui-visual',
  siblings: ['P88-refund-obligations-runtime', 'P89-refund-obligation-integrity-sql'],
  mutation: 'Remove the refund detail block or label its pending obligation as refunded; the rendered state and denial assertions turn red.',
} as const satisfies PillarManifest

jest.mock('@/lib/services', () => ({
  adminControlService: { listFinanceTransactions: jest.fn(), getFinanceTransaction: jest.fn() },
}))

const transaction: AdminFinanceTransaction = {
  job_id: 'd8900000-0000-4000-8000-000000000101', display_code: 'NS-P92',
  customer_ref: 'C-92', worker_ref: 'W-92', service_type: 'plumbing',
  payment_method: 'platform_bank_manual', status: 'paid', gross_amount_vnd: 450000,
  platform_fee_vnd: 67500, worker_net_vnd: 382500, refund_amount_vnd: null,
  commission_reversal_vnd: null, worker_credit_vnd: null, paid_at: '2026-09-05T00:00:00Z',
  data_quality: 'available', unavailable_reason: null,
}
const review: RefundSummary = {
  state: 'review_required', amount_vnd: null, obligation_ids: [],
  requested_at: '2026-09-05T00:00:00Z', receipt_verification_available: false,
}
const obligation: RefundSummary = {
  ...review, state: 'refund_required', amount_vnd: 100000,
  obligation_ids: ['d8900000-0000-4000-8000-000000000201'],
}

async function openDetail(refund: RefundSummary | null | undefined, language: 'vi' | 'en') {
  jest.mocked(adminControlService.listFinanceTransactions).mockResolvedValue({ success: true, status: 200,
    data: { generated_at: review.requested_at, transactions: [transaction], has_more: false, next_cursor: null } })
  jest.mocked(adminControlService.getFinanceTransaction).mockResolvedValue({ success: true, status: 200,
    data: { generated_at: review.requested_at, transaction, timeline: [], refund } })
  render(<FinanceTransactionsPanel language={language} period={{ range: 'month' }} formatCurrency={(value) => `${value} VND`} />)
  fireEvent.press(await screen.findByTestId(`admin-finance-transaction-${transaction.job_id}`))
  await screen.findByTestId('admin-finance-transaction-detail')
  expect(adminControlService.getFinanceTransaction).toHaveBeenCalledWith(transaction.job_id)
}

describe(PILLAR.id, () => {
  beforeEach(() => jest.clearAllMocks())

  it.each(['vi', 'en'] as const)('renders %s review without an approved amount or transfer action', async (language) => {
    await openDetail(review, language)
    const block = within(screen.getByTestId('admin-finance-refund-summary'))
    withPillarContext(PILLAR, () => {
      expect(block.getByText(language === 'vi' ? 'Yêu cầu hoàn tiền đang được xem xét' : 'Refund request under review')).toBeTruthy()
      expect(block.getByText(language === 'vi'
        ? 'Chưa có quyết định duyệt hoàn tiền hoặc số tiền được duyệt. Giao dịch đã thanh toán vẫn được giữ nguyên.'
        : 'No refund or amount has been approved. The recorded payment remains unchanged.')).toBeTruthy()
      expect(block.queryByTestId('admin-finance-refund-amount')).toBeNull()
      expect(block.queryAllByRole('button')).toHaveLength(0)
      expect(block.queryAllByRole('textbox')).toHaveLength(0)
      expect(block.queryByText(language === 'vi' ? 'Refund request under review' : 'Yêu cầu hoàn tiền đang được xem xét')).toBeNull()
    })
  })

  it.each(['vi', 'en'] as const)('renders %s obligation as pending, with accessible untruncated money', async (language) => {
    await openDetail(obligation, language)
    const block = within(screen.getByTestId('admin-finance-refund-summary'))
    withPillarContext(PILLAR, () => {
      const title = block.getByRole('header', { name: language === 'vi' ? 'Nghĩa vụ hoàn tiền đã được ghi nhận' : 'Refund obligation recorded' })
      expect(title.props.allowFontScaling).toBe(true)
      expect(title.props.numberOfLines).toBeUndefined()
      const amount = block.getByTestId('admin-finance-refund-amount')
      expect(amount.props.children).toEqual([language === 'vi' ? 'Số tiền cần hoàn' : 'Amount to return', ': ', '100000 VND'])
      expect(amount.props.allowFontScaling).toBe(true)
      expect(amount.props.numberOfLines).toBeUndefined()
      expect(block.getByText(language === 'vi'
        ? 'Chưa có chứng từ hoàn tiền được xác minh. Chưa xác nhận đã chuyển tiền.'
        : 'No verified refund receipt is available. A completed transfer has not been confirmed.')).toBeTruthy()
      expect(block.queryByText(/^(Đã hoàn tiền|Refunded)$/i)).toBeNull()
      expect(block.queryAllByRole('button')).toHaveLength(0)
      expect(block.queryAllByRole('textbox')).toHaveLength(0)
    })
    expect(screen.getByTestId('admin-finance-refund-summary').props.accessibilityLiveRegion).toBe('polite')
  })

  it.each([null, undefined])('does not invent refund state when the receipt is %s', async (refund) => {
    await openDetail(refund, 'vi')
    withPillarContext(PILLAR, () => expect(screen.queryByTestId('admin-finance-refund-summary')).toBeNull())
  })

  it('keeps a failed detail lookup out of the refund view', async () => {
    jest.mocked(adminControlService.listFinanceTransactions).mockResolvedValue({ success: true, status: 200,
      data: { generated_at: review.requested_at, transactions: [transaction], has_more: false, next_cursor: null } })
    jest.mocked(adminControlService.getFinanceTransaction).mockResolvedValue({ success: false, status: 503,
      code: 'REFUND_READ_UNAVAILABLE', error: 'Không thể đối soát nghĩa vụ hoàn tiền lúc này.' })
    render(<FinanceTransactionsPanel language="vi" period={{ range: 'month' }} formatCurrency={(value) => `${value} VND`} />)
    fireEvent.press(await screen.findByTestId(`admin-finance-transaction-${transaction.job_id}`))
    await screen.findByText('Dữ liệu giao dịch chi tiết đang chờ đồng bộ.')
    withPillarContext(PILLAR, () => expect(screen.queryByTestId('admin-finance-refund-summary')).toBeNull())
  })
})
