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
    requestedDescription: 'Phát hiện dây âm tường bị chập',
    reason: 'Dây âm tường bị chập, phải đi lại dây mới',
    priceMin: 450000,
    priceMax: 650000,
    kaelProgress: null,
    kaelReview: {
      problem_summary: 'Chập dây âm tường, có rủi ro cháy',
      advisory: 'Nên thay đoạn dây cũ',
      complexity_assessment: 'medium',
      confidence: 0.82,
      fallback_used: false,
    },
    evidencePhotoUrls: [],
    createdAt: '2026-05-29T10:00:00Z',
    ...overrides,
  }
}

function setup(overrides: { scopeChange?: LocalScopeChange | null; visible?: boolean } = {}) {
  const onApprove = jest.fn()
  const onReject = jest.fn()
  render(
    <ScopeChangeHardStopModal
      language="vi"
      newScopeLabel="Đi lại dây âm tường"
      originalEstimateLabel="150.000đ - 250.000đ"
      originalScopeLabel="Kiểm tra ổ cắm"
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
    expect(screen.getByText(/Thợ đang chờ quyết định của Kael/)).toBeOnTheScreen()
  })

  it('shows the old vs new scope and old vs new Kael estimate', () => {
    setup()
    expect(screen.getByText('Kiểm tra ổ cắm')).toBeOnTheScreen()
    expect(screen.getByText('Đi lại dây âm tường')).toBeOnTheScreen()
    expect(screen.getByText('150.000đ - 250.000đ')).toBeOnTheScreen()
    // newEstimate is formatted by the component from priceMin/priceMax (vi-VN grouping).
    expect(screen.getByText('450.000đ - 650.000đ')).toBeOnTheScreen()
  })

  it('shows the Kael policy price disclaimer (price honesty)', () => {
    setup()
    expect(screen.getByText(/ước tính do Kael tính theo dữ liệu hiện có/)).toBeOnTheScreen()
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

  it('does not invent a price when Kael has no estimate yet (price honesty)', () => {
    setup({ scopeChange: makeScopeChange({ priceMin: null, priceMax: null }) })
    // the specific computed range must be absent…
    expect(screen.queryByText('450.000đ - 650.000đ')).toBeNull()
    // …and the new-estimate slot falls back to a pending label instead of a fake number
    expect(screen.getAllByText('Kael đang xét').length).toBeGreaterThan(0)
  })
})
