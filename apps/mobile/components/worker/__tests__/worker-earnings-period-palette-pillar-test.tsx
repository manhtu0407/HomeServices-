import { fireEvent, render, screen, within } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

import { customerTheme } from '@/design/theme'
import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

import { WorkerV5EarningsDashboard } from '../earnings/salary-overview-surfaces'

export const PILLAR = {
  id: 'P24-worker-earnings-period-palette',
  invariant:
    'Worker Earnings period selection uses the same mint selected-state palette as the active Income dock tab while preserving tab semantics',
  authority: [
    'governance/RULES.md (visual consistency and language)',
    'governance/protocols/frontend-test.md G1 (layout) and G4 (accessibility state)',
    'governance/design/runtime.md (reuse existing semantic tokens)',
  ],
  target: 'apps/mobile/components/worker/earnings/salary-overview-surfaces.tsx',
  layer: 'ui-visual',
  siblings: ['P08-worker-dock-motion'],
  mutation:
    'restore the period selector to the generic service fill — the selected tab no longer shares the dock mint palette',
} as const satisfies PillarManifest

describe('Worker Earnings period palette contract', () => {
  it('uses the dock-aligned mint fill and primary text for the selected period', () => {
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
    const rawStyle = monthTab.props.style
    const resolvedStyle = typeof rawStyle === 'function' ? rawStyle({ pressed: false }) : rawStyle
    const tabStyle = StyleSheet.flatten(resolvedStyle)
    const labelStyle = StyleSheet.flatten(within(monthTab).getByText('Tháng').props.style)
    const lensStyle = StyleSheet.flatten(screen.getByTestId('worker-v5-earnings-period-lens').props.style)

    withPillarContext(
      PILLAR,
      () => {
        expect(tabStyle).toMatchObject({
          backgroundColor: 'transparent',
          borderWidth: 0,
        })
        expect(lensStyle).toMatchObject({
          backgroundColor: customerTheme.lightLayer.glassStrong,
          boxShadow: customerTheme.lightLayer.glassFloatShadow,
          borderColor: customerTheme.lightLayer.borderStrong,
        })
        expect(labelStyle.color).toBe(customerTheme.lightLayer.primary)
        expect(monthTab.props.accessibilityState).toEqual({ selected: true })
      },
      'the selected period must carry the same mint language as the selected Income dock tab',
    )
  })

  it('keeps the selected period state when transparency is reduced and removes liquid decoration', () => {
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

    expect(screen.getByTestId('worker-v5-earnings-period-month').props.accessibilityState).toEqual({ selected: true })
    expect(screen.queryByTestId('worker-v5-earnings-period-lens')).toBeNull()
  })

  it.each(['day', 'week', 'month', 'year'] as const)('moves the selected lens with the %s period', (period) => {
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
})
