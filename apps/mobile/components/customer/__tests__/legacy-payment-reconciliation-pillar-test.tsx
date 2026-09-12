import { fireEvent, render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import type { LocalDeal } from '@nestscout/shared'

import { getCustomerThemeTokens } from '../customer-theme'
import { CustomerPaymentRailSurface } from '../kael-chat/customer-payment-rail-surface'
import { isDealPaymentProtected } from '../kael-chat/case-work-money-display-model'
import { buildCaseWorkResponseModel } from '../kael-chat/case-work-response-model'

export const PILLAR = {
  id: 'P80-legacy-payment-reconciliation',
  invariant: 'legacy QR records stay read-only while manual-bank claims and verified paid receipts preserve their explicit customer actions',
  authority: [
    'governance/RULES.md #8 (never fabricate provider availability or payment success)',
    'governance/structures/customer-workflow-fulfillment.md A13 (unavailable payment rails stay unavailable)',
  ],
  target: 'apps/mobile/components/customer/kael-chat/customer-payment-rail-surface.tsx',
  layer: 'ui-visual',
  siblings: ['P06-payment-unlock-gate', 'P68-completion-payment-authority'],
  mutation: 'restore the legacy ready QR rendering — the read-only legacy receipt assertion turns red',
} as const satisfies PillarManifest

const PAYMENT_CODE = 'NS1234567890ABCDEF12345678'

function paymentFixture(overrides: Partial<NonNullable<LocalDeal['payment']>> = {}): NonNullable<LocalDeal['payment']> {
  return {
    grossAmount: 450_000,
    paymentCode: PAYMENT_CODE,
    platformFee: 67_500,
    provider: 'sepay_vietqr',
    qrImageUrl: `https://vietqr.app/img?acc=1234567890&bank=MB&amount=450000&des=${PAYMENT_CODE}`,
    status: 'vietqr_ready',
    transferContent: PAYMENT_CODE,
    workerNet: 382_500,
    ...overrides,
  }
}

function mount({
  language = 'vi',
  mode = 'light',
  payment = paymentFixture(),
  paymentRailAvailable,
  paymentRailProvider = 'platform_bank_manual',
  status = 'payment_pending',
}: {
  language?: 'vi' | 'en'
  mode?: 'light' | 'dark'
  payment?: LocalDeal['payment']
  paymentRailAvailable?: boolean
  paymentRailProvider?: LocalDeal['paymentRailProvider']
  status?: LocalDeal['status']
} = {}) {
  const onClaim = jest.fn()
  const onCreate = jest.fn()
  const onRefresh = jest.fn()
  render(
    <CustomerPaymentRailSurface
      deal={{ id: 'job-payment', status, payment, paymentRailAvailable } as LocalDeal}
      language={language}
      onClaimManualBankPayment={onClaim}
      onCreateManualBankPaymentOrder={onCreate}
      onRefreshPayment={onRefresh}
      paymentBusy={false}
      paymentBusyAction={null}
      paymentRailProvider={paymentRailProvider}
      paymentRefreshResult={null}
      refreshingPayment={false}
      reduceMotion
      reviewControls={<Text testID="payment-review-controls">Review controls</Text>}
      tokens={getCustomerThemeTokens(mode)}
    />,
  )
  return { onClaim, onCreate, onRefresh }
}

describe('legacy payment reconciliation', () => {
  it.each([
    ['vi', 'light', 'Biên nhận chuyển khoản cũ cần đối soát', 'Mã QR thanh toán cho công việc này'],
    ['en', 'dark', 'Legacy transfer receipt needs reconciliation', 'Payment QR for this work'],
  ] as const)('keeps a valid legacy QR read-only in %s', (language, mode, title, qrLabel) => {
    const { onClaim, onCreate, onRefresh } = mount({ language, mode })
    withPillarContext(PILLAR, () => {
      expect(screen.queryByLabelText(qrLabel)).toBeNull()
      expect(screen.queryByText(PAYMENT_CODE)).toBeNull()
      expect(screen.getByText(title)).toBeOnTheScreen()
      expect(screen.queryByTestId('customer-v21-case-manual-payment-claim')).toBeNull()
      expect(screen.queryByTestId('payment-review-controls')).toBeNull()
      expect(onClaim).not.toHaveBeenCalled()
      expect(onCreate).not.toHaveBeenCalled()
    }, 'a stored valid QR does not prove the legacy provider is currently usable')
    fireEvent.press(screen.getByTestId('customer-v21-case-payment-refresh'))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it.each(['amount_mismatch', 'received'] as const)('retains the recorded amount for %s without asking for another transfer', (status) => {
    mount({ payment: paymentFixture({ amountReceived: 400_000, status }) })
    expect(screen.getByText('Số tiền giao dịch ghi nhận')).toBeOnTheScreen()
    expect(screen.getByText('400.000đ')).toBeOnTheScreen()
    expect(screen.queryByLabelText('Mã QR thanh toán cho công việc này')).toBeNull()
    expect(screen.queryByTestId('payment-review-controls')).toBeNull()
  })

  it('keeps the supported manual-bank payment explicit and pending after a claim', () => {
    const { onClaim } = mount({
      payment: paymentFixture({ provider: 'platform_bank_manual', status: 'manual_qr_ready' }),
    })
    expect(screen.getByTestId('customer-v21-case-manual-qr')).toBeOnTheScreen()
    expect(screen.getByText(PAYMENT_CODE)).toBeOnTheScreen()
    expect(onClaim).not.toHaveBeenCalled()
    fireEvent.press(screen.getByTestId('customer-v21-case-manual-payment-claim'))
    expect(onClaim).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('customer-v21-case-payment-confirmed')).toBeNull()
    expect(screen.queryByTestId('payment-review-controls')).toBeNull()
  })

  it.each([
    { paymentRailProvider: null },
    { paymentRailProvider: 'platform_bank_manual', paymentRailAvailable: false },
  ] as const)('withholds a stored manual-bank QR and claim when readiness is $paymentRailProvider/$paymentRailAvailable', (readiness) => {
    const { onClaim, onRefresh } = mount({
      payment: paymentFixture({ provider: 'platform_bank_manual', status: 'manual_qr_ready' }),
      ...readiness,
    })
    expect(screen.queryByTestId('customer-v21-case-manual-qr')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-manual-payment-claim')).toBeNull()
    expect(screen.queryByText(PAYMENT_CODE)).toBeNull()
    expect(screen.getByText('Thanh toán đang tạm dừng')).toBeOnTheScreen()
    expect(screen.getByText('Số tiền trên lệnh thanh toán')).toBeOnTheScreen()
    expect(onClaim).not.toHaveBeenCalled()
    fireEvent.press(screen.getByTestId('customer-v21-case-payment-refresh'))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it.each(['manual_customer_claimed', 'manual_reconcile_required'] as const)('keeps %s read-only until reconciliation completes', (status) => {
    mount({ payment: paymentFixture({ provider: 'platform_bank_manual', status }), paymentRailProvider: null })
    expect(screen.getByText('Số tiền trên lệnh thanh toán')).toBeOnTheScreen()
    expect(screen.queryByText('Số tiền cần chuyển')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-manual-qr')).toBeNull()
    expect(screen.queryByTestId('customer-v21-case-manual-payment-claim')).toBeNull()
    expect(screen.queryByTestId('payment-review-controls')).toBeNull()
  })

  it('keeps a verified receipt visible while the work status is still pending', () => {
    mount({
      payment: paymentFixture({ provider: 'platform_bank_manual', status: 'manual_verified' }),
      paymentRailProvider: null,
    })
    expect(screen.getByText('Biên nhận đã được xác minh, nhưng trạng thái công việc chưa khớp. Bộ phận vận hành cần đối soát trước khi mở đánh giá. Không chuyển thêm tiền.')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-case-manual-qr')).toBeNull()
    expect(screen.queryByTestId('payment-review-controls')).toBeNull()
  })

  it.each([
    ['platform_bank_manual', 'manual_customer_claimed'],
    ['platform_bank_manual', 'manual_reconcile_required'],
    ['sepay_vietqr', 'amount_mismatch'],
  ] as const)('withholds review when a paid job still has an unverified %s receipt', (provider, status) => {
    mount({ status: 'paid', payment: paymentFixture({ provider, status }) })
    expect(screen.getByTestId('customer-v21-case-payment-receipt-unverified')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-case-payment-confirmed')).toBeNull()
    expect(screen.queryByTestId('payment-review-controls')).toBeNull()
  })

  it('withholds confirmed state when a paid job has no receipt', () => {
    mount({ status: 'paid', payment: null })
    expect(screen.getByTestId('customer-v21-case-payment-receipt-unverified')).toBeOnTheScreen()
    expect(screen.queryByTestId('payment-review-controls')).toBeNull()
  })

  it('keeps a deprecated simulator receipt out of the public paid and review surface', () => {
    mount({ status: 'paid', payment: paymentFixture({ provider: 'staging_simulator', status: 'received' }) })
    expect(screen.queryByTestId('customer-v21-case-payment-confirmed')).toBeNull()
    expect(screen.queryByTestId('payment-review-controls')).toBeNull()
  })

  it.each([
    ['platform_bank_manual', 'manual_verified'],
    ['sepay_vietqr', 'received'],
    ['direct_worker', 'direct_paid'],
  ] as const)('preserves the verified %s receipt without reopening payment', (provider, status) => {
    const { onClaim, onCreate } = mount({
      status: 'paid',
      payment: paymentFixture({ amountReceived: 450_000, provider, status }),
    })
    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('customer-v21-case-payment-confirmed')).toBeOnTheScreen()
      expect(screen.getByText('450.000đ')).toBeOnTheScreen()
      expect(screen.getByTestId('payment-review-controls')).toBeOnTheScreen()
      expect(screen.queryByLabelText('Mã QR thanh toán cho công việc này')).toBeNull()
      expect(screen.queryByTestId('customer-v21-case-manual-payment-claim')).toBeNull()
      expect(onClaim).not.toHaveBeenCalled()
      expect(onCreate).not.toHaveBeenCalled()
    }, 'a verified historical receipt grants review, never a second payment invitation')
  })

  it('uses the current server phase when the locally retained payment state disagrees', () => {
    const deal = {
      status: 'paid',
      backendStatus: 'payment_pending',
      payment: paymentFixture({ status: 'received' }),
    } as LocalDeal
    expect(isDealPaymentProtected(deal)).toBe(false)
    expect(isDealPaymentProtected({ ...deal, status: 'payment_pending', backendStatus: 'paid' })).toBe(true)
    expect(isDealPaymentProtected({ ...deal, backendStatus: 'reviewed' })).toBe(true)
  })

  it.each(['vi', 'en'] as const)('does not advertise a legacy provider as ready from a capability hint in %s', (language) => {
    const model = buildCaseWorkResponseModel({
      deal: { status: 'confirmed_by_customer', payment: null } as LocalDeal,
      language,
      paymentRailProvider: 'sepay_vietqr',
      phase: 'customer_confirmed_completion',
    })
    expect(model.noteCopy).toBe(language === 'vi'
      ? 'Phương thức thanh toán chưa khả dụng cho công việc này.'
      : 'No payment method is available for this work yet.')
  })
})
