import { Children, isValidElement } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'
import { LinearGradient } from 'react-native-svg'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { color } from '@/design/theme'
import type { EarningsResponse } from '@/lib/api-types'

import { WorkerV5EarningsOverviewBody } from '../earnings/body-surfaces'
import { workerIncomeDashboardTokens as incomeTokens } from '../earnings/income-dashboard-tokens'
import { WorkerV5PayoutRequest } from '../earnings/payout-request-surfaces'
import { WorkerV5EarningsDashboard } from '../earnings/salary-overview-surfaces'
import { getReducedTransparencyWorkerTokens, getWorkerThemeTokens } from '../worker-theme'

function hcmcDateKey(daysAgo: number) {
  const date = new Date(Date.now() + 7 * 60 * 60 * 1000)
  date.setUTCDate(date.getUTCDate() - daysAgo)
  return date.toISOString().slice(0, 10)
}

function buildEarnings(): EarningsResponse {
  return {
    available_balance: 1_200_000,
    cash_commission_collected_total: 0,
    cash_commission_due_total: 0,
    collateral_reserved_amount: 0,
    current_commission_level: 2,
    current_commission_rate_bps: 1200,
    daily_earnings: [
      { date: hcmcDateKey(1), gross_earnings: 220_000, net_earnings: 180_000, paid_job_count: 1, platform_fee_total: 40_000 },
      { date: hcmcDateKey(0), gross_earnings: 400_000, net_earnings: 320_000, paid_job_count: 2, platform_fee_total: 80_000 },
    ],
    from_date: hcmcDateKey(1),
    gross_earnings: 620_000,
    net_earnings: 500_000,
    on_hold_amount: 0,
    pending_payment_amount: 50_000,
    pending_payment_count: 1,
    platform_fee_total: 120_000,
    provisional_payment_amount: 50_000,
    provisional_payment_count: 1,
    recent_transactions: [],
    to_date: hcmcDateKey(0),
    total_jobs_paid: 3,
    withdrawal_reserved_amount: 0,
    withdrawn_total: 90_000,
    worker_id: 'worker_test_1',
  }
}

function expectIncomeOrbGradient() {
  const definition = screen
    .UNSAFE_getAllByType(LinearGradient)
    .find((gradient) => gradient.props.id === 'workerIncomeOrbWithdrawGradient')

  if (!definition) throw new Error('Missing Worker Income orb withdrawal gradient')
  expect(definition.props).toMatchObject({ x1: '0', x2: '1', y1: '0', y2: '0' })
  expect(Children.toArray(definition.props.children).map((child) => ({
    offset: isValidElement<{ offset: number; stopColor: string }>(child) ? child.props.offset : null,
    stopColor: isValidElement<{ offset: number; stopColor: string }>(child) ? child.props.stopColor : null,
  }))).toEqual([
    { offset: 0, stopColor: '#9669F9' },
    { offset: 0.5, stopColor: '#8A5DF5' },
    { offset: 1, stopColor: '#8658F6' },
  ])
}

export const PILLAR = {
  id: 'P24-worker-earnings-period-palette',
  invariant:
    'Worker Earnings uses a frameless responsive income canvas aligned to the Production content rhythm while period selection inherits the Worker Navigation teal lens and 44-point target',
  authority: [
    'governance/RULES.md (visual consistency and language)',
    'governance/protocols/frontend-test.md G1 (layout) and G4 (accessibility state)',
    'reference/accepted-design.png in the audited Final White package',
  ],
  target: 'apps/mobile/components/worker/earnings/period-selector.tsx',
  layer: 'ui-visual',
  siblings: ['P08-worker-dock-motion', 'P55-worker-home-earnings-snapshot'],
  mutation:
    'restore the scaled 317-wide frame, narrow the money panels, restore the violet period state, remove the navigation lens, or shrink the tab hit area — the layout and selected-state assertions turn red',
} as const satisfies PillarManifest

describe('Worker Earnings period palette contract', () => {
  it('uses the Worker Navigation teal lens for the selected period', () => {
    const tokens = getWorkerThemeTokens('light')
    render(
      <WorkerV5EarningsDashboard
        earnings={null}
        earningsError={null}
        language="vi"
        onRetry={async () => true}
        reduceMotion={false}
        reduceTransparency={false}
      />,
    )

    const monthTab = screen.getByTestId('worker-v5-earnings-period-month')
    fireEvent(screen.getByTestId('worker-v5-earnings-period-rail'), 'layout', {
      nativeEvent: { layout: { height: 46, width: 400, x: 0, y: 0 } },
    })
    const rawStyle = monthTab.props.style
    const resolvedStyle = typeof rawStyle === 'function' ? rawStyle({ pressed: false }) : rawStyle
    const tabStyle = StyleSheet.flatten(resolvedStyle)
    const labelStyle = StyleSheet.flatten(within(monthTab).getByText('Tháng').props.style)
    const surfaceStyle = StyleSheet.flatten(screen.getByTestId('worker-v5-earnings-period-tabs').props.style)
    const lensStyle = StyleSheet.flatten(screen.getByTestId('worker-v5-earnings-period-lens').props.style)

    withPillarContext(
      PILLAR,
      () => {
        expect(surfaceStyle).toMatchObject({
          backgroundColor: tokens.raised,
          borderColor: tokens.border,
          borderRadius: 25,
          borderWidth: 1,
          height: 50,
        })
        expect(tabStyle).toMatchObject({
          backgroundColor: 'transparent',
          borderWidth: 0,
          minHeight: 44,
        })
        expect(lensStyle).toMatchObject({
          backgroundColor: tokens.glassStrong,
          borderColor: tokens.primary,
          borderRadius: 21,
          borderWidth: 1,
          width: 96,
        })
        expect(labelStyle.color).toBe(tokens.primary)
        expect(labelStyle.color).toBe('#08AF9C')
        expect(labelStyle.fontSize).toBeGreaterThanOrEqual(10)
        expect(monthTab.props.accessibilityState).toEqual({ selected: true })
      },
      'the selected period must inherit the Worker Navigation teal semantic and liquid lens without changing period meaning',
    )
  })

  it('keeps the selected period state when transparency is reduced and removes liquid decoration', () => {
    const tokens = getReducedTransparencyWorkerTokens(getWorkerThemeTokens('light'))
    render(
      <WorkerV5EarningsDashboard
        earnings={null}
        earningsError={null}
        language="vi"
        onRetry={async () => true}
        reduceMotion={false}
        reduceTransparency
      />,
    )

    const monthTab = screen.getByTestId('worker-v5-earnings-period-month')
    expect(monthTab.props.accessibilityState).toEqual({ selected: true })
    const rawStyle = monthTab.props.style
    const selectedStyle = StyleSheet.flatten(typeof rawStyle === 'function' ? rawStyle({ pressed: false }) : rawStyle)
    expect(selectedStyle).toMatchObject({ backgroundColor: tokens.glassStrong, borderColor: tokens.primary, borderWidth: 1 })
    expect(StyleSheet.flatten(within(monthTab).getByText('Tháng').props.style).color).toBe(tokens.primary)
    expect(screen.queryByTestId('worker-v5-earnings-period-lens')).toBeNull()
  })

  it.each(['day', 'week', 'month', 'year'] as const)('moves the selected navigation lens with the %s period', (period) => {
    render(
      <WorkerV5EarningsDashboard
        earnings={null}
        earningsError={null}
        language="vi"
        onRetry={async () => true}
        reduceMotion
        reduceTransparency={false}
      />,
    )

    fireEvent.press(screen.getByTestId(`worker-v5-earnings-period-${period}`))

    for (const candidate of ['day', 'week', 'month', 'year'] as const) {
      expect(screen.getByTestId(`worker-v5-earnings-period-${candidate}`).props.accessibilityState).toEqual({ selected: candidate === period })
    }
    expect(screen.getByTestId('worker-v5-earnings-period-lens')).toBeOnTheScreen()
  })

  it('starts on the validated period supplied by the Salary route', () => {
    render(
      <WorkerV5EarningsDashboard
        earnings={null}
        earningsError={null}
        initialPeriod="year"
        language="vi"
        onRetry={async () => true}
        reduceMotion
        reduceTransparency={false}
      />,
    )

    expect(screen.getByTestId('worker-v5-earnings-period-year').props.accessibilityState).toEqual({ selected: true })
    expect(screen.getByTestId('worker-v5-earnings-period-month').props.accessibilityState).toEqual({ selected: false })
  })

  it('maps real data into the Final White dashboard and keeps only the withdrawal action in the header area', () => {
    const onWithdraw = jest.fn()
    render(
      <WorkerV5EarningsDashboard
        earnings={buildEarnings()}
        earningsError={null}
        initialPeriod="day"
        language="vi"
        onRetry={async () => true}
        onWithdraw={onWithdraw}
        reduceMotion={false}
        reduceTransparency={false}
      />,
    )

    expect(screen.queryByTestId('worker-v5-income-dashboard-title')).toBeNull()
    expect(screen.getByTestId('worker-v5-earnings-metric-total-value')).toHaveTextContent('400.000đ')
    expect(screen.getByTestId('worker-v5-earnings-metric-available-value')).toHaveTextContent('1.200.000đ')
    expect(screen.getByTestId('worker-v5-income-dashboard-cashflow')).toHaveTextContent('320.000đ')
    expect(screen.getByTestId('worker-v5-earnings-metric-withdrawn-value')).toHaveTextContent('90.000đ')
    expect(screen.getByTestId('worker-v5-earnings-metric-pending-value')).toHaveTextContent('50.000đ')
    expect(screen.getByTestId('worker-v5-earnings-metric-fee-value')).toHaveTextContent('80.000đ')
    expect(screen.queryByText('8')).toBeNull()
    expect(screen.getByTestId('worker-v5-income-dashboard-ambient')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-income-dashboard-notifications')).toBeNull()
    expect(screen.getByTestId('worker-v5-income-dashboard-orb-withdraw').props.accessibilityRole).toBe('button')
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-income-dashboard-orb-withdraw').props.style)).toMatchObject({ height: 48, width: 120 })
    expectIncomeOrbGradient()
    for (const testID of [
      'worker-v5-earnings-metric-total-value',
      'worker-v5-earnings-metric-available-value',
      'worker-v5-income-dashboard-cashflow',
      'worker-v5-earnings-metric-withdrawn-value',
      'worker-v5-earnings-metric-pending-value',
      'worker-v5-earnings-metric-fee-value',
    ]) {
      expect(screen.getByTestId(testID).props.numberOfLines).toBeUndefined()
    }

    fireEvent.press(screen.getByTestId('worker-v5-income-dashboard-orb-withdraw'))
    expect(onWithdraw).toHaveBeenCalledTimes(1)
  })

  it('localizes the Final White dashboard without mixing visible Vietnamese copy', () => {
    render(
      <WorkerV5EarningsDashboard
        earnings={buildEarnings()}
        earningsError={null}
        initialPeriod="day"
        language="en"
        onRetry={async () => true}
        reduceMotion
        reduceTransparency
      />,
    )

    expect(screen.queryByTestId('worker-v5-income-dashboard-title')).toBeNull()
    expect(screen.getByText('Total income')).toBeOnTheScreen()
    expect(screen.getByText('Withdrawable')).toBeOnTheScreen()
    expect(screen.getByText('Cash flow after fees')).toBeOnTheScreen()
    expect(screen.getByText('Transferred')).toBeOnTheScreen()
    expect(screen.getByText('Expected')).toBeOnTheScreen()
    expect(screen.getByText('Fees deducted')).toBeOnTheScreen()
    expect(screen.queryByText('Thu nhập')).toBeNull()
    expect(screen.queryByText('Có thể rút')).toBeNull()
    expect(screen.queryByTestId('worker-v5-income-dashboard-ambient')).toBeNull()
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-income-dashboard-card').props.style).backgroundColor).toBe('transparent')
    expect(screen.getByTestId('worker-v5-income-dashboard-background-bleed')).toBeOnTheScreen()
  })

  it('uses a frameless responsive canvas aligned with the Production content below', () => {
    render(
      <WorkerV5EarningsDashboard earnings={buildEarnings()} earningsError={null} language="vi" onRetry={async () => true} reduceMotion reduceTransparency />,
    )

    fireEvent(screen.getByTestId('worker-v5-earnings-dashboard'), 'layout', { nativeEvent: { layout: { height: 540, width: 439, x: 0, y: 0 } } })
    const rootStyle = StyleSheet.flatten(screen.getByTestId('worker-v5-earnings-dashboard').props.style)
    const stageStyle = StyleSheet.flatten(screen.getByTestId('worker-v5-income-dashboard-stage').props.style)
    const cardStyle = StyleSheet.flatten(screen.getByTestId('worker-v5-income-dashboard-card').props.style)
    const backgroundBleedStyle = StyleSheet.flatten(screen.getByTestId('worker-v5-income-dashboard-background-bleed').props.style)
    const heroStyle = StyleSheet.flatten(screen.getByTestId('worker-v5-income-dashboard-total-hero').props.style)
    const orbStyle = StyleSheet.flatten(screen.getByTestId('worker-v5-income-dashboard-orb').props.style)
    const orbAmountFrameStyle = StyleSheet.flatten(screen.getByTestId('worker-v5-earnings-amount').props.style)
    const cashflowStyle = StyleSheet.flatten(screen.getByTestId('worker-v5-earnings-chart').props.style)
    const statsStyle = StyleSheet.flatten(screen.getByTestId('worker-v5-income-dashboard-stats').props.style)
    const periodStyle = StyleSheet.flatten(screen.getByTestId('worker-v5-income-dashboard-period').props.style)
    const dynamicExtra = stageStyle.height - 510

    expect(rootStyle).toMatchObject({ alignSelf: 'center', minHeight: stageStyle.height, width: 439 })
    expect(stageStyle.height).toBeGreaterThanOrEqual(510)
    expect(stageStyle.width).toBe(439)
    expect(stageStyle.transform).toBeUndefined()
    expect(backgroundBleedStyle).toMatchObject({ height: stageStyle.height, top: 0, width: 439 })
    expect(cardStyle).toMatchObject({ backgroundColor: 'transparent', width: '100%' })
    expect(cardStyle.borderRadius).toBeUndefined()
    expect(cardStyle.boxShadow).toBeUndefined()
    expect(heroStyle.top).toBe(44)
    expect(orbStyle).toMatchObject({ left: 113.5, top: 118 + dynamicExtra * 0.35, width: 212 })
    expect(orbAmountFrameStyle.left).toBe(orbAmountFrameStyle.right)
    expect(cashflowStyle).toMatchObject({ height: 64 + dynamicExtra * 0.15, left: 29, top: 308 + dynamicExtra * 0.7, width: 381 })
    expect(statsStyle).toMatchObject({ height: 64 + dynamicExtra * 0.15, left: 29, top: 380 + dynamicExtra * 0.85, width: 381 })
    expect(periodStyle).toMatchObject({ height: 50, left: 29, top: 460 + dynamicExtra, width: 381 })
    expect(cashflowStyle.top).toBeGreaterThanOrEqual(orbStyle.top + orbStyle.height + 5)
    expect(periodStyle.top + periodStyle.height).toBe(stageStyle.height)
    expect(cashflowStyle.backgroundColor).toBe('#FBFAFF')
    expect(statsStyle.backgroundColor).toBe('#FBFAFF')
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-earnings-period-tabs').props.style).width).toBe('100%')
    expect(rootStyle.minHeight).toBe(stageStyle.height)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-earnings-dashboard-stack').props.style).gap).toBeLessThanOrEqual(8)

    fireEvent(screen.getByTestId('worker-v5-earnings-dashboard'), 'layout', { nativeEvent: { layout: { height: 540, width: 700, x: 0, y: 0 } } })
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-income-dashboard-stage').props.style).width).toBe(700)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-earnings-chart').props.style)).toMatchObject({ left: 103, width: 494 })
  })

  it('keeps loading, unavailable, stale, and hydrated zero visually distinct', () => {
    const loading = render(
      <WorkerV5EarningsDashboard earnings={null} earningsError={null} language="vi" onRetry={async () => true} reduceMotion reduceTransparency />,
    )
    expect(screen.queryByText('Đang tải…')).toBeNull()
    expect(screen.queryByText('Đang tải dữ liệu thu nhập…')).toBeNull()
    expect(screen.queryByTestId('worker-v5-earnings-error-loading')).toBeNull()
    expect(screen.getAllByTestId('worker-v5-income-dashboard-loading-value')).toHaveLength(6)
    expect(StyleSheet.flatten(within(screen.getByTestId('worker-v5-earnings-metric-available-value')).getByTestId('worker-v5-income-dashboard-loading-value').props.style)).toMatchObject({ alignSelf: 'center' })
    expect(screen.queryByText('0đ')).toBeNull()
    loading.unmount()

    const unavailable = render(
      <WorkerV5EarningsDashboard earnings={null} earningsError="offline" language="vi" onRetry={async () => true} reduceMotion reduceTransparency />,
    )
    expect(screen.getByText('Chưa thể tải thông tin thu nhập')).toBeOnTheScreen()
    expect(screen.queryByText('0đ')).toBeNull()
    unavailable.unmount()

    const stale = render(
      <WorkerV5EarningsDashboard earnings={buildEarnings()} earningsError="offline" initialPeriod="day" language="vi" onRetry={async () => true} reduceMotion reduceTransparency />,
    )
    expect(screen.getByTestId('worker-v5-earnings-metric-total-value')).toHaveTextContent('400.000đ')
    expect(screen.getByText('Chưa thể tải thông tin thu nhập')).toBeOnTheScreen()
    stale.unmount()

    render(
      <WorkerV5EarningsDashboard earnings={{ ...buildEarnings(), daily_earnings: [], gross_earnings: 0, net_earnings: 0, platform_fee_total: 0 }} earningsError={null} language="vi" onRetry={async () => true} reduceMotion reduceTransparency />,
    )
    expect(screen.getAllByText('0đ').length).toBeGreaterThan(0)
    expect(screen.getByText('Chưa phát sinh thu nhập trong kỳ đã chọn')).toBeOnTheScreen()
  })

  it('keeps only the orb withdrawal entry and the three existing utility routes below the rebuilt overview', () => {
    const navigateToScreen = jest.fn()
    const runtime = {
      actions: { workerRefresh: jest.fn(async () => true) },
      workerEarnings: buildEarnings(),
      workerEarningsError: null,
    }
    render(
      <WorkerV5EarningsOverviewBody
        initialPeriod="day"
        language="vi"
        navigateToScreen={navigateToScreen}
        reduceMotion
        reduceTransparency
        runtime={runtime as never}
      />,
    )

    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-earnings-overview-layout').props.style)).toMatchObject({
      alignSelf: 'center',
      backgroundColor: incomeTokens.colors.opaqueTint,
      maxWidth: 520,
      width: '100%',
    })
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-earnings-production-content').props.style)).toMatchObject({
      backgroundColor: incomeTokens.colors.page,
      gap: 14,
      paddingBottom: 158,
      paddingHorizontal: 29,
      paddingTop: 16,
    })
    expect(screen.getByTestId('worker-v5-earnings-production-background').props).toMatchObject({
      accessible: false,
      contentFit: 'cover',
      pointerEvents: 'none',
    })
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-earnings-production-background').props.style)).toMatchObject({
      bottom: 0,
      left: 0,
      right: 0,
      top: 0,
      transform: [{ scaleY: -1 }],
    })
    expect(screen.queryByTestId('worker-v5-earnings-utilities-title')).toBeNull()
    expect(screen.queryByText('Quản lý thu nhập')).toBeNull()
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-earnings-utilities').props.style)).toMatchObject({
      backgroundColor: incomeTokens.colors.contentSurface,
      borderColor: incomeTokens.colors.borderSoft,
      borderRadius: incomeTokens.layout.panelRadius,
      borderWidth: StyleSheet.hairlineWidth,
    })
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-earnings-utilities').props.style)).not.toHaveProperty('shadowOpacity')
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-earnings-utilities').props.style)).not.toHaveProperty('elevation')
    for (const testID of ['history', 'account', 'commission']) {
      const row = screen.getByTestId(`worker-v5-earnings-utility-${testID}`)
      const rowStyle = typeof row.props.style === 'function' ? row.props.style({ pressed: false }) : row.props.style
      expect(StyleSheet.flatten(rowStyle)).toMatchObject({ minHeight: 68 })
      const iconTileStyle = StyleSheet.flatten(screen.getByTestId(`worker-v5-earnings-utility-${testID}-icon-tile`).props.style)
      expect(iconTileStyle).toMatchObject({ height: 44, width: 44 })
      expect(iconTileStyle).not.toHaveProperty('backgroundColor')
      expect(iconTileStyle).not.toHaveProperty('borderColor')
      expect(iconTileStyle).not.toHaveProperty('borderRadius')
      expect(iconTileStyle).not.toHaveProperty('borderWidth')
      expect(screen.getByTestId(`worker-v5-earnings-utility-${testID}-icon`).props).toMatchObject({
        height: 28,
        width: 28,
      })
      expect(screen.getByTestId(`worker-v5-earnings-utility-${testID}-detail`).props.numberOfLines).toBeUndefined()
    }
    expect(screen.queryByTestId('worker-v5-earnings-withdrawal-area')).toBeNull()
    expect(screen.queryByTestId('worker-v5-earnings-withdraw-action')).toBeNull()
    expect(screen.queryByText('Tạo yêu cầu rút tiền')).toBeNull()
    expect(screen.getByTestId('worker-v5-earnings-utilities')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('worker-v5-income-dashboard-orb-withdraw'))
    fireEvent.press(screen.getByTestId('worker-v5-earnings-utility-history'))
    fireEvent.press(screen.getByTestId('worker-v5-earnings-utility-account'))
    fireEvent.press(screen.getByTestId('worker-v5-earnings-utility-commission'))

    expect(navigateToScreen.mock.calls).toEqual([
      ['4.3-payout-request'],
      ['4.2-ledger-detail'],
      ['4.4-payout-method'],
      ['4.5-commission-policy'],
    ])
  })

  it('keeps payout request money surfaces solid white without a mint aura', () => {
    const runtime = {
      actions: {
        workerRefresh: jest.fn(async () => true),
        workerRequestWithdrawal: jest.fn(async () => true),
      },
      workerEarnings: buildEarnings(),
      workerEarningsError: null,
      workerPayoutMethod: null,
      workerWithdrawalRequests: [],
    }

    const standard = render(
      <WorkerV5PayoutRequest language="vi" reduceTransparency={false} runtime={runtime as never} />,
    )

    withPillarContext(PILLAR, () => {
      expect(screen.queryByTestId('worker-v5-payout-request-formula-mint-aura')).toBeNull()
      expect(StyleSheet.flatten(screen.getByTestId('worker-v5-payout-request').props.style)).toMatchObject({
        backgroundColor: color.surface.base,
      })
      expect(StyleSheet.flatten(screen.getByTestId('worker-v5-payout-balance-block').props.style)).toMatchObject({
        backgroundColor: color.surface.base,
      })
    }, 'withdrawal money surfaces must stay opaque and neutral')
    standard.unmount()

    render(<WorkerV5PayoutRequest language="vi" reduceTransparency runtime={runtime as never} />)
    expect(StyleSheet.flatten(screen.getByTestId('worker-v5-payout-request').props.style)).toMatchObject({
      backgroundColor: color.surface.base,
    })
  })
})
