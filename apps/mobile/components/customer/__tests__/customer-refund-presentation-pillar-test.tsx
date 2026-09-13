import { fireEvent, render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { createInitialLocalWorkflowState, localWorkflowReducer, toWorkflowPhase, type LocalDeal, type RefundSummary } from '@nestscout/shared'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import type { JobDetailResponse } from '@/lib/api-types'
import { dealToSnapshot, jobDetailToSnapshot } from '@/lib/frontend-workflow/snapshots'
import { getCustomerThemeTokens } from '../customer-theme'
import { buildCaseWorkResponseModel } from '../kael-chat/case-work-response-model'
import { CustomerPaymentRailSurface } from '../kael-chat/customer-payment-rail-surface'

export const PILLAR = {
  id: 'P93-customer-refund-presentation',
  invariant: 'audited refund obligations survive hydration and replace payment or review invitations without claiming money was returned',
  authority: ['governance/RULES.md #8 (payment data honesty)', 'governance/structures/customer-workflow-fulfillment.md A13 (payment reconciliation)'],
  target: 'apps/mobile/components/customer/kael-chat/customer-payment-rail-surface.tsx',
  layer: 'ui-visual',
  siblings: ['P80-legacy-payment-reconciliation'],
  mutation: 'drop payment_receipt.refund from the snapshot — obligation propagation and read-only presentation turn red',
} as const satisfies PillarManifest

const REQUESTED_AT = '2026-09-05T00:00:00.000Z'
const REFUND_REVIEW: RefundSummary = { state: 'review_required', amount_vnd: null, obligation_ids: [], requested_at: REQUESTED_AT, receipt_verification_available: false }
const REFUND_REQUIRED: RefundSummary = { state: 'refund_required', amount_vnd: 120_000, obligation_ids: ['d0e7b537-e79d-40c6-a60b-20722070e4a9'], requested_at: REQUESTED_AT, receipt_verification_available: false }

function jobDetail(refund: unknown = REFUND_REQUIRED, status: JobDetailResponse['job']['status'] = 'paid'): JobDetailResponse {
  return {
    job: {
      id: 'job-customer-refund', status, service_type: 'electrical', description: 'Kiểm tra ổ cắm', problem_chips: ['outlet_not_working'],
      photo_urls: [], customer_evidence_photo_urls: [], field_evidence_photo_urls: [], address_building: 'Tòa A', address_unit: null, address_floor: null, address_district: 'district_7',
      address_access: { release_stage: 'area_only', exact_unit_released: false, worker_checked_in: false, check_in_required: false, identity_check_required: false, customer_handoff_required: false, evidence_mode: 'none', access_profile: {} },
      scheduled_at: null, kael_problem_identified: null, kael_complexity: null, kael_price_min: null, kael_price_max: null, kael_advisory: null,
      kael_estimate_card_v3: null, kael_worker_brief_core: null, kael_worker_brief_guidance: null, kael_progress: null, final_price: 450_000,
      payment_rail_available: true, payment_rail_provider: 'platform_bank_manual', payment_provider: 'platform_bank_manual', payment_status: 'manual_verified',
      payment_code: 'NS-REFUND-TEST', payment_transfer_content: 'NS-REFUND-TEST', payment_qr_image_url: 'https://example.invalid/payment-qr.png',
      payment_received_at: REQUESTED_AT, payment_amount_received: 450_000, gross_amount: 450_000, platform_fee: 67_500, worker_net: 382_500,
      payment_receipt: {
        method: 'platform_bank_manual', status: 'manual_verified', gross_amount: 450_000,
        customer_transfer_claimed_at: REQUESTED_AT, customer_transferred_at: REQUESTED_AT, response_deadline: null, hold_until: null,
        customer_confirmed_at: null, worker_confirmed_at: null, collateral_amount: null, bank_code: 'MB', account_holder: 'NestScout', account_masked: '***1234',
        ...{ refund },
      } as NonNullable<JobDetailResponse['job']['payment_receipt']>,
      completion_notes: null, completion_photo_urls: [], created_at: REQUESTED_AT, matched_at: null, arrived_at: null,
      completed_at: REQUESTED_AT, confirmed_at: REQUESTED_AT, paid_at: REQUESTED_AT, reviewed_at: null,
    }, worker: null, broadcast_state: null, matching_state: null, current_scope_change: null,
  }
}

function hydrate(response: JobDetailResponse): LocalDeal {
  const state = localWorkflowReducer(createInitialLocalWorkflowState(), { type: 'hydrate_remote_job', job: jobDetailToSnapshot(response) })
  expect(state.lastError).toBeNull()
  expect(state.deal).not.toBeNull()
  return state.deal!
}

function mount(deal: LocalDeal, language: 'vi' | 'en' = 'vi', refreshing = false) {
  const onRefresh = jest.fn()
  const onClaim = jest.fn()
  const onCreate = jest.fn()
  render(<CustomerPaymentRailSurface
    deal={deal} language={language} onClaimManualBankPayment={onClaim} onCreateManualBankPaymentOrder={onCreate}
    onRefreshPayment={onRefresh} paymentBusy={false} paymentBusyAction={null} paymentRailProvider="platform_bank_manual"
    paymentRefreshResult={null} refreshingPayment={refreshing} reduceMotion reviewControls={<Text testID="payment-review-controls">Review controls</Text>}
    tokens={getCustomerThemeTokens(language === 'vi' ? 'light' : 'dark')}
  />)
  return { onRefresh, onClaim, onCreate }
}

function assertNoFinancialAction() {
  expect(screen.queryByTestId('customer-v21-case-manual-qr')).toBeNull()
  expect(screen.queryByTestId('customer-v21-case-manual-payment-claim')).toBeNull()
  expect(screen.queryByTestId('customer-v21-case-manual-payment-create')).toBeNull()
  expect(screen.queryByTestId('customer-v21-case-payment-confirmed')).toBeNull()
  expect(screen.queryByTestId('payment-review-controls')).toBeNull()
  expect(screen.queryByText('NS-REFUND-TEST')).toBeNull()
  expect(screen.queryByText(/^(Đã hoàn tiền|Refunded)$/)).toBeNull()
}

describe('Customer refund obligation presentation', () => {
  it.each([REFUND_REVIEW, REFUND_REQUIRED])('preserves $state through API hydration and relaunch snapshot', (refund) => {
    const deal = hydrate(jobDetail(refund, 'cancelled'))
    const restored = localWorkflowReducer(createInitialLocalWorkflowState(), { type: 'hydrate_remote_job', job: dealToSnapshot(deal) }).deal
    withPillarContext(PILLAR, () => {
      expect(deal.payment).toMatchObject({ refund })
      expect(restored?.payment).toMatchObject({ refund })
    }, 'read-only refund obligations cannot be discarded during recovery')
  })

  it.each([
    ['vi', 'paid', REFUND_REVIEW, 'Yêu cầu hoàn tiền cần rà soát', 'Chờ rà soát'],
    ['en', 'cancelled', REFUND_REVIEW, 'Refund request needs review', 'Awaiting review'],
    ['vi', 'cancelled', REFUND_REQUIRED, 'Đã ghi nhận khoản cần hoàn tiền', 'Chờ hoàn tiền'],
    ['en', 'paid', REFUND_REQUIRED, 'Refund obligation recorded', 'Refund pending'],
  ] as const)('shows an honest readonly %s/%s refund state', (language, status, refund, title, stateLabel) => {
    const deal = hydrate(jobDetail(refund, status))
    const { onClaim, onCreate, onRefresh } = mount(deal, language)
    expect(screen.getByText(title)).toBeOnTheScreen()
    expect(screen.getByText(stateLabel)).toBeOnTheScreen()
    assertNoFinancialAction()
    if (refund.state === 'refund_required') {
      expect(screen.getByText(language === 'vi' ? 'Số tiền cần hoàn' : 'Amount to return')).toBeOnTheScreen()
      expect(screen.getByText(language === 'vi' ? '120.000đ' : '120,000đ')).toBeOnTheScreen()
    } else {
      expect(screen.queryByText(language === 'vi' ? 'Số tiền cần hoàn' : 'Amount to return')).toBeNull()
      expect(screen.queryByText(/450[.,]000/)).toBeNull()
    }
    const response = buildCaseWorkResponseModel({ deal, language, phase: toWorkflowPhase(deal.backendStatus ?? deal.status), subject: 'Ổ cắm', workerName: null })
    expect(response).toMatchObject({ actionKind: 'none', title, status: stateLabel })
    fireEvent.press(screen.getByTestId('customer-v21-case-payment-refresh'))
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(onClaim).not.toHaveBeenCalled()
    expect(onCreate).not.toHaveBeenCalled()
  })

  it.each([
    { ...REFUND_REQUIRED, state: 'refunded' },
    { ...REFUND_REQUIRED, amount_vnd: 0 },
    { ...REFUND_REQUIRED, receipt_verification_available: true },
    { ...REFUND_REVIEW, obligation_ids: REFUND_REQUIRED.obligation_ids },
  ])('fails closed for an invalid refund contract %#', (invalid) => {
    const deal = hydrate(jobDetail(invalid))
    mount(deal)
    expect(deal.payment).toMatchObject({ refund: null, refundDataUnavailable: true })
    expect(screen.getByText('Thông tin hoàn tiền cần đối soát')).toBeOnTheScreen()
    assertNoFinancialAction()
    expect(buildCaseWorkResponseModel({ deal, language: 'vi', phase: 'paid', subject: 'Ổ cắm', workerName: null }).actionKind).toBe('none')
  })

  it('keeps refund-only data even when no payment status or amount is available', () => {
    const response = jobDetail(REFUND_REVIEW, 'cancelled')
    Object.assign(response.job, { payment_status: null, payment_provider: null, payment_amount_received: null, payment_received_at: null,
      gross_amount: null, platform_fee: null, worker_net: null, payment_code: null, payment_transfer_content: null, payment_qr_image_url: null })
    response.job.payment_receipt!.status = 'unknown'
    expect(hydrate(response).payment).toMatchObject({ status: 'not_started', refund: REFUND_REVIEW })
  })

  it('disables duplicate refresh while reconciliation is in progress', () => {
    const { onRefresh } = mount(hydrate(jobDetail()), 'vi', true)
    expect(screen.getByRole('button', { busy: true, disabled: true })).toBe(screen.getByTestId('customer-v21-case-payment-refresh'))
    fireEvent.press(screen.getByTestId('customer-v21-case-payment-refresh'))
    expect(onRefresh).not.toHaveBeenCalled()
    assertNoFinancialAction()
  })

  it('preserves the genuine paid receipt when there is no refund case', () => {
    mount(hydrate(jobDetail(null)))
    expect(screen.getByTestId('customer-v21-case-payment-confirmed')).toBeOnTheScreen()
    expect(screen.getByTestId('payment-review-controls')).toBeOnTheScreen()
    expect(screen.queryByTestId('customer-v21-case-refund-reconciliation')).toBeNull()
  })
})
