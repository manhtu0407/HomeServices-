import { render, screen, fireEvent } from '@testing-library/react-native'
import type { LocalScopeChange } from '@nestscout/shared'
import { ScopeChangeHardStopModal } from '../scope-change-hard-stop-modal'

// A11 scope-change hard stop is the highest-risk money surface: the worker is
// blocked until Kael has a policy-checked decision, and the price shown is
// Kael-computed. These tests lock that contract — the customer must see the
// before/after scope + estimate, and agreement/appeal actions fire only from an
// explicit press.

const tokens = {
  aqua: '#CFF8EF',
  base: '#FFFEFA',
  border: '#E2EFEA',
  borderStrong: '#0D8677',
  copper: '#9A691D',
  danger: '#B43F3F',
  glassStrong: '#FFFFFF',
  muted: '#647672',
  primary: '#087F70',
  primaryText: '#FFFFFF',
  raised: '#FFFFFF',
  text: '#12231F',
  warm: '#FFF4DB',
}

function makeScopeChange(overrides: Partial<LocalScopeChange> = {}): LocalScopeChange {
  return {
    id: 'sc_1',
    status: 'waiting_customer_decision',
    requestedDescription: 'Thay đúng hai bản lề tủ bếp bị nứt',
    reason: 'Hai bản lề nứt; gỗ và cánh tủ còn nguyên, lối tiếp cận bình thường',
    priceMin: 258000,
    priceMax: 258000,
    kaelProgress: null,
    kaelReview: {
      baseline_evidence: baselineEvidenceReceipt(),
      baseline_source: 'multi_source_hcmc_cabinet_door_2026_08',
      baseline_used: 'handyman:replace_cabinet_hinges:small:hcmc_all',
      problem_summary: 'Thay đúng hai bản lề tương thích và căn chỉnh lại một cánh tủ',
      advisory: 'Không gồm sửa gỗ, cánh cong vênh hoặc bản lề chuyên dụng.',
      complexity_assessment: 'small',
      confirmed_facts: ['Hai bản lề nứt', 'Gỗ và cánh tủ còn nguyên', 'Lối tiếp cận bình thường'],
      unknowns: [],
      confidence: 0.82,
      fallback_used: false,
      price_source: 'verified_baseline',
      reference_price_max: 375000,
      reference_price_min: 140000,
      pricing_basis: {
        calculation: 'neutral midpoint of verified one-door scope 140000-375000 VND = 258000 VND',
        quantity: 1,
        unit: 'cabinet_door_scope',
        unit_price_max: 258000,
        unit_price_min: 258000,
      },
      pricing_mode: 'full_scope_total',
      selection_rule: 'verified_neutral_midpoint_with_bilateral_confirmation',
      stakeholder_balance: {
        commission_level: 1,
        commission_rate_bps: 1500,
        customer_confirmation_required: true,
        customer_total: 258000,
        platform_fee: 38700,
        worker_confirmation_required: true,
        worker_net: 219300,
      },
      worker_price_confirmation: {
        confirmed: true,
        confirmed_at: '2026-08-13T08:00:00.000Z',
        quote_id: 'a7500000-0000-4000-8000-000000000010',
      },
    },
    evidencePhotoUrls: [],
    requestTiming: 'pre_arrival',
    resumeJobStatus: 'worker_on_way',
    createdAt: '2026-05-29T10:00:00Z',
    ...overrides,
  }
}

function baselineEvidenceReceipt() {
  return {
    schema_version: 'baseline_price_evidence_receipt.v1',
    accepted_source_count: 2,
    aggregate_price_min: 140000,
    aggregate_price_max: 375000,
    high_trust_source_count: 2,
    quorum_met: true,
    required_quorum: 2,
    unit: 'per_cabinet_door',
    sources: [
      {
        domain: 'suachuatainha.com.vn',
        url: 'https://suachuatainha.com.vn/price',
        observed_at: '2026-08-13',
        price_min: 120000,
        price_max: 250000,
        unit: 'per_cabinet_door',
        effective_tier: 1,
        weight: 1,
      },
      {
        domain: 'nhabepsaigon.vn',
        url: 'https://nhabepsaigon.vn/price',
        observed_at: '2026-08-13',
        price_min: 160000,
        price_max: 500000,
        unit: 'per_cabinet_door',
        effective_tier: 1,
        weight: 1,
      },
    ],
  }
}

function setup(overrides: { busy?: boolean; scopeChange?: LocalScopeChange | null; visible?: boolean } = {}) {
  const onApprove = jest.fn()
  const onReject = jest.fn()
  render(
    <ScopeChangeHardStopModal
      busy={overrides.busy}
      language="vi"
      newScopeLabel="Thay đúng hai bản lề tủ bếp bị nứt"
      originalEstimateLabel="150.000đ - 350.000đ"
      originalScopeLabel="Siết vít và căn chỉnh hai bản lề"
      onApprove={onApprove}
      onReject={onReject}
      scopeChange={overrides.scopeChange === undefined ? makeScopeChange() : overrides.scopeChange}
      tokens={tokens}
      visible={overrides.visible ?? true}
    />,
  )
  return { onApprove, onReject }
}

describe('ScopeChangeHardStopModal (A11 hard stop)', () => {
  it('tells the customer the worker is paused awaiting Kael decision', () => {
    setup()
    expect(screen.getByText(/chỉ bạn mới có thể xác nhận thay đổi/)).toBeOnTheScreen()
    expect(screen.getByText('Trước khi thợ đến')).toBeOnTheScreen()
  })

  it('shows the old vs new scope and old vs new Kael estimate', () => {
    setup()
    expect(screen.getByText('Siết vít và căn chỉnh hai bản lề')).toBeOnTheScreen()
    expect(screen.getByText('Thay đúng hai bản lề tủ bếp bị nứt')).toBeOnTheScreen()
    expect(screen.getByText('150.000đ - 350.000đ')).toBeOnTheScreen()
    // newEstimate is formatted by the component from priceMin/priceMax (vi-VN grouping).
    expect(screen.getByText('258.000đ')).toBeOnTheScreen()
  })

  it('shows the Kael policy price disclaimer (price honesty)', () => {
    setup()
    expect(screen.getByText(/tổng giá cho toàn bộ phạm vi thay thế/)).toBeOnTheScreen()
  })

  it('separates the worker report from Kael verification and exposes the price receipt', () => {
    setup()

    expect(screen.getByText('Thợ báo cáo')).toBeOnTheScreen()
    expect(screen.getByText(/Hai bản lề nứt; gỗ và cánh tủ còn nguyên/)).toBeOnTheScreen()
    expect(screen.getByText('Kael đã đối chiếu')).toBeOnTheScreen()
    expect(screen.getByText('Facts Kael dùng để tính case này')).toBeOnTheScreen()
    expect(screen.getByText(/Gỗ và cánh tủ còn nguyên/)).toBeOnTheScreen()
    expect(screen.getByText(/Không còn unknown quyết định giá/)).toBeOnTheScreen()
    expect(screen.getByText('Căn cứ giá đã xác minh')).toBeOnTheScreen()
    expect(screen.getByText(/một cánh tủ.*140\.000.*375\.000.*trung điểm.*258\.000/)).toBeOnTheScreen()
    expect(screen.getByText(/đúng mức 258\.000đ.*thợ xem trước.*sẽ trở thành giá cuối/)).toBeOnTheScreen()
    expect(screen.getByText(/Khách trả 258\.000đ.*phí nền tảng 38\.700đ.*15%.*thợ dự kiến nhận 219\.300đ/)).toBeOnTheScreen()
    expect(screen.getByText(/Đủ số nguồn 2\/2.*suachuatainha\.com\.vn.*nhabepsaigon\.vn/s)).toBeOnTheScreen()
  })

  it('shows every scope evidence image without cropping and opens the full viewer', () => {
    const refs = Array.from({ length: 4 }, (_, index) => `file:///scope-evidence-${index + 1}.jpg`)
    setup({ scopeChange: makeScopeChange({ evidencePhotoUrls: refs }) })

    refs.forEach((_, index) => {
      expect(screen.getByTestId(`customer-scope-change-evidence-gallery-tile-${index}`)).toBeOnTheScreen()
      expect(screen.getByTestId(`customer-scope-change-evidence-gallery-image-${index}`).props.contentFit).toBe('contain')
    })
    fireEvent.press(screen.getByTestId('customer-scope-change-evidence-gallery-tile-3'))
    expect(screen.getByTestId('customer-scope-change-evidence-gallery-viewer-counter')).toHaveTextContent('4 / 4')
  })

  it('does not auto-approve or auto-reject on mount', () => {
    const { onApprove, onReject } = setup()
    expect(onApprove).not.toHaveBeenCalled()
    expect(onReject).not.toHaveBeenCalled()
  })

  it('fires onApprove only on an explicit approve press', () => {
    const { onApprove, onReject } = setup()
    fireEvent.press(screen.getByTestId('customer-scope-change-modal-approve'))
    expect(onApprove).toHaveBeenCalledTimes(1)
    expect(onReject).not.toHaveBeenCalled()
  })

  it('fires onReject on an explicit reject press', () => {
    const { onApprove, onReject } = setup()
    fireEvent.press(screen.getByTestId('customer-scope-change-modal-reject'))
    expect(onReject).toHaveBeenCalledTimes(1)
    expect(onApprove).not.toHaveBeenCalled()
  })

  it('disables both decisions while the server is handling the first press', () => {
    const { onApprove, onReject } = setup({ busy: true })
    fireEvent.press(screen.getByTestId('customer-scope-change-modal-approve'))
    fireEvent.press(screen.getByTestId('customer-scope-change-modal-reject'))
    expect(onApprove).not.toHaveBeenCalled()
    expect(onReject).not.toHaveBeenCalled()
  })

  it('does not invent a price when Kael has no estimate yet (price honesty)', () => {
    const { onApprove, onReject } = setup({ scopeChange: makeScopeChange({ priceMin: null, priceMax: null }) })
    // the specific computed range must be absent…
    expect(screen.queryByText('258.000đ')).toBeNull()
    // …and the new-estimate slot falls back to a pending label instead of a fake number
    expect(screen.getAllByText('Kael đang xét').length).toBeGreaterThan(0)
    fireEvent.press(screen.getByTestId('customer-scope-change-modal-approve'))
    fireEvent.press(screen.getByTestId('customer-scope-change-modal-reject'))
    expect(onApprove).not.toHaveBeenCalled()
    expect(onReject).not.toHaveBeenCalled()
  })

  it.each(['requested_by_worker', 'reviewing_by_kael'] as const)(
    'keeps both decisions disabled while the server scope state is %s',
    (status) => {
      const { onApprove, onReject } = setup({ scopeChange: makeScopeChange({ status }) })
      fireEvent.press(screen.getByTestId('customer-scope-change-modal-approve'))
      fireEvent.press(screen.getByTestId('customer-scope-change-modal-reject'))
      expect(onApprove).not.toHaveBeenCalled()
      expect(onReject).not.toHaveBeenCalled()
      expect(screen.queryByText('258.000đ')).toBeNull()
    },
  )

  it('enables decisions only for a reviewed price in waiting_customer_decision', () => {
    const { onApprove } = setup()
    fireEvent.press(screen.getByTestId('customer-scope-change-modal-approve'))
    expect(onApprove).toHaveBeenCalledTimes(1)
  })
})
