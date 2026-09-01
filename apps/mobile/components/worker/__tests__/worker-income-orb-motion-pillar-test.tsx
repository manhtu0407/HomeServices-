import { fireEvent, render, screen, within } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

import { WorkerIncomeDashboard } from '../earnings/income-dashboard-surface'

export const PILLAR = {
  id: 'P61-worker-income-orb-motion',
  invariant:
    'Worker Earnings lifts the total-income group and gives the balance orb a one-shot direct-or-near touch reaction without coupling decorative feedback to the withdrawal action',
  authority: [
    'governance/design/motion.md (one-shot liquid feedback and reduced-motion fallback)',
    'governance/protocols/frontend-test.md G2 (interaction and accessibility coverage)',
    'AGENTS.md Motion Rules and Performance Budget',
  ],
  target: 'apps/mobile/components/worker/earnings/income-dashboard-surface.tsx',
  layer: 'ui-visual',
  siblings: ['P08-worker-dock-motion', 'P24-worker-earnings-period-palette'],
  mutation:
    'restore the total hero to its lower position, remove either touch entry, couple a nearby touch to withdrawal, or render sheen under reduced preferences — the position, interaction, and fallback assertions turn red',
} as const satisfies PillarManifest

function renderDashboard({
  onWithdraw = jest.fn(),
  reduceMotion = false,
  reduceTransparency = false,
}: {
  onWithdraw?: () => void
  reduceMotion?: boolean
  reduceTransparency?: boolean
} = {}) {
  return render(
    <WorkerIncomeDashboard
      earnings={null}
      earningsError={null}
      language="vi"
      onWithdraw={onWithdraw}
      reduceMotion={reduceMotion}
      reduceTransparency={reduceTransparency}
    />,
  )
}

describe('Worker Income balance-orb motion contract', () => {
  it('lifts the total-income label and value frame together', () => {
    renderDashboard({ reduceMotion: true, reduceTransparency: true })

    const hero = screen.getByTestId('worker-v5-income-dashboard-total-hero')
    withPillarContext(
      PILLAR,
      () => {
        expect(StyleSheet.flatten(hero.props.style).top).toBe(44)
        expect(within(hero).getByText('Tổng thu nhập')).toBeOnTheScreen()
        expect(within(hero).getByTestId('worker-v5-earnings-metric-total-value')).toBeOnTheScreen()
      },
      'the label and its loading or hydrated value must move as one total-income group',
    )
  })

  it('reacts to direct and nearby touches without withdrawing money', () => {
    const onWithdraw = jest.fn()
    renderDashboard({ onWithdraw })

    const proximityZone = screen.getByTestId(
      'worker-v5-income-dashboard-orb-proximity-zone',
      { includeHiddenElements: true },
    )
    const orb = screen.getByTestId('worker-v5-income-dashboard-orb')

    withPillarContext(
      PILLAR,
      () => {
        expect(typeof proximityZone.props.onPointerDown).toBe('function')
        expect(typeof proximityZone.props.onPointerMove).toBe('function')
        expect(typeof proximityZone.props.onPointerUp).toBe('function')
        expect(proximityZone.props.accessible).toBe(false)
        expect(typeof orb.props.onPointerDown).toBe('function')
        expect(typeof orb.props.onPointerMove).toBe('function')
        expect(typeof orb.props.onPointerCancel).toBe('function')
        expect(screen.getByTestId('worker-v5-income-dashboard-orb-reaction-frost')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-income-dashboard-orb-reaction-ring')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-income-dashboard-orb-reaction-caustic')).toBeOnTheScreen()
        expect(screen.getByTestId('worker-v5-income-dashboard-orb-reaction-sheen')).toBeOnTheScreen()

        fireEvent(proximityZone, 'pointerDown', { nativeEvent: { offsetX: 24, offsetY: 116 } })
        fireEvent(proximityZone, 'pointerMove', { nativeEvent: { offsetX: 52, offsetY: 88 } })
        fireEvent(proximityZone, 'pointerUp')
        fireEvent(orb, 'pointerDown', { nativeEvent: { offsetX: 106, offsetY: 92 } })
        fireEvent(orb, 'pointerMove', { nativeEvent: { offsetX: 164, offsetY: 54 } })
        fireEvent(orb, 'pointerCancel')
        expect(onWithdraw).not.toHaveBeenCalled()

        fireEvent.press(screen.getByTestId('worker-v5-income-dashboard-orb-withdraw'))
        expect(onWithdraw).toHaveBeenCalledTimes(1)
      },
      'visual reaction must be available around the orb while withdrawal remains exclusive to its labeled button',
    )
  })

  it('drops deformation and translucent decoration under reduced preferences', () => {
    const reducedMotion = renderDashboard({ reduceMotion: true })
    expect(screen.getByTestId('worker-v5-income-dashboard-orb-reaction-frost')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-income-dashboard-orb-reaction-ring')).toBeOnTheScreen()
    expect(screen.getByTestId('worker-v5-income-dashboard-orb-reaction-caustic')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-income-dashboard-orb-reaction-sheen')).toBeNull()
    reducedMotion.unmount()

    renderDashboard({ reduceTransparency: true })
    expect(screen.getByTestId('worker-v5-income-dashboard-orb-reaction-ring')).toBeOnTheScreen()
    expect(screen.queryByTestId('worker-v5-income-dashboard-orb-reaction-frost')).toBeNull()
    expect(screen.queryByTestId('worker-v5-income-dashboard-orb-reaction-caustic')).toBeNull()
    expect(screen.queryByTestId('worker-v5-income-dashboard-orb-reaction-sheen')).toBeNull()
  })
})
