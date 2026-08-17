import { render, screen } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import {
  CUSTOMER_LIQUID_NAV_DOCK_HEIGHT,
  CUSTOMER_LIQUID_NAV_RAIL_PADDING,
  customerV21DockStyles,
} from '@/components/customer/dock/dock-styles'

const mockAccessibility = { reduceMotion: false, reduceTransparency: false }
let mockRouteParams: Record<string, string | string[] | undefined> = {}

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockRouteParams,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}))

jest.mock('@/components/ui/accessibility-motion', () => ({
  useGlassAccessibility: () => mockAccessibility,
}))

import {
  WorkerDockLayoutProvider,
  WorkerRebuildDockOverlay,
} from '../dock/worker-v5-dock-overlay'

export const PILLAR = {
  id: 'P08-worker-dock-motion',
  invariant:
    'the worker dock exposes four labelled tabs with exactly one selected, and neither Reduce Motion nor Reduce Transparency removes a tab or its selected state',
  authority: [
    'governance/protocols/frontend-test.md G4 (Reduce Motion, Reduce Transparency)',
    'governance/design/runtime.md (motion is decoration, never the carrier of state)',
  ],
  target: 'apps/mobile/components/worker/dock/worker-v5-dock-overlay.tsx',
  layer: 'ui-visual',
  siblings: ['P07-worker-verification-states', 'P06-payment-unlock-gate'],
  mutation:
    'drop `accessibilityState={{ selected }}` from WorkerV5DockTabButton — the single-selected-tab cases turn red',
} as const satisfies PillarManifest

const TAB_LABELS_VI = ['Trang chủ', 'Công việc', 'Thu nhập', 'Hồ sơ']
const TAB_LABELS_EN = ['Home', 'Jobs', 'Earnings', 'Profile']

function mountDock(active: 'home' | 'jobs' | 'earnings' | 'profile' = 'home') {
  return render(
    <WorkerDockLayoutProvider>
      <WorkerRebuildDockOverlay active={active} />
    </WorkerDockLayoutProvider>,
  )
}

beforeEach(() => {
  mockAccessibility.reduceMotion = false
  mockAccessibility.reduceTransparency = false
  mockRouteParams = {}
})

describe('WorkerRebuildDockOverlay', () => {
  it('exposes every route as a labelled tab', () => {
    mountDock()
    withPillarContext(
      PILLAR,
      () => {
        for (const label of TAB_LABELS_VI) {
          expect(screen.getByRole('tab', { name: label })).toBeTruthy()
        }
      },
      'a dock tab with no accessible name is unreachable by screen reader',
    )
  })

  it.each([
    ['home', 'Trang chủ'],
    ['jobs', 'Công việc'],
    ['earnings', 'Thu nhập'],
    ['profile', 'Hồ sơ'],
  ] as const)('marks only the %s tab selected', (active, selectedLabel) => {
    mountDock(active)
    withPillarContext(
      PILLAR,
      () => {
        const selected = TAB_LABELS_VI.filter(
          (label) => screen.getByRole('tab', { name: label }).props.accessibilityState?.selected === true,
        )
        expect(selected).toEqual([selectedLabel])
      },
      'exactly one tab may report selected, or assistive tech announces the wrong location',
    )
  })

  it('renders English tab names when the route asks for English', () => {
    mockRouteParams = { ns_worker_lang: 'en' }
    mountDock()
    withPillarContext(
      PILLAR,
      () => {
        for (const label of TAB_LABELS_EN) {
          expect(screen.getByRole('tab', { name: label })).toBeTruthy()
        }
        expect(screen.queryByRole('tab', { name: 'Trang chủ' })).toBeNull()
      },
      'one language per selected mode',
    )
  })

  // Motion is decoration here. Turning it off may remove the sweep, never a destination.
  it.each([[true], [false]])('keeps every tab and the selection when Reduce Motion is %s', (reduceMotion) => {
    mockAccessibility.reduceMotion = reduceMotion
    mountDock('jobs')
    withPillarContext(
      PILLAR,
      () => {
        for (const label of TAB_LABELS_VI) {
          expect(screen.getByRole('tab', { name: label })).toBeTruthy()
        }
        expect(screen.getByRole('tab', { name: 'Công việc' }).props.accessibilityState?.selected).toBe(true)
      },
      `reduceMotion=${String(reduceMotion)} must not change what the dock offers`,
    )
  })

  it('hands the dock an opaque surface when Reduce Transparency is on', () => {
    const dockFill = () =>
      StyleSheet.flatten(screen.getByTestId('worker-v5-primary-dock').props.style).backgroundColor

    mockAccessibility.reduceTransparency = false
    mountDock()
    const translucent = dockFill()

    screen.unmount()
    mockAccessibility.reduceTransparency = true
    mountDock()
    const opaque = dockFill()

    withPillarContext(
      PILLAR,
      () => {
        expect(opaque).not.toBe(translucent)
        expect(String(opaque)).not.toMatch(/rgba\([^)]*,\s*0?\.\d+\s*\)/)
      },
      'the glass surface must become a solid fill, not merely a different translucent one',
    )
  })

  it('keeps every tab reachable when Reduce Transparency is on', () => {
    mockAccessibility.reduceTransparency = true
    mountDock('profile')
    withPillarContext(
      PILLAR,
      () => {
        for (const label of TAB_LABELS_VI) {
          expect(screen.getByRole('tab', { name: label })).toBeTruthy()
        }
        expect(screen.getByRole('tab', { name: 'Hồ sơ' }).props.accessibilityState?.selected).toBe(true)
        expect(screen.queryByTestId('worker-v5-dock-lens')).toBeNull()
        expect(screen.queryByTestId('worker-v5-dock-shimmer')).toBeNull()
        expect(screen.queryByTestId('worker-v5-dock-caustic')).toBeNull()
      },
      'an opaque dock is still a full dock',
    )
  })

  it('keeps the source-aligned rail geometry and restrained press feedback', () => {
    mountDock()
    const dockPlane = StyleSheet.flatten(customerV21DockStyles.dockPlane)
    const dockIcon = StyleSheet.flatten(customerV21DockStyles.dockIcon)
    const pressedItem = StyleSheet.flatten(customerV21DockStyles.dockItemPressed)

    expect(dockPlane).toMatchObject({
      borderRadius: CUSTOMER_LIQUID_NAV_DOCK_HEIGHT / 2,
      height: CUSTOMER_LIQUID_NAV_DOCK_HEIGHT,
      minHeight: CUSTOMER_LIQUID_NAV_DOCK_HEIGHT,
      padding: CUSTOMER_LIQUID_NAV_RAIL_PADDING,
    })
    expect(dockIcon).toMatchObject({
      height: 21,
      opacity: 1,
      width: 21,
    })
    expect(pressedItem.transform).toEqual([{ scale: 0.976 }])
    for (const id of ['home', 'jobs', 'earnings', 'profile']) {
      expect(screen.getByTestId(`worker-v5-dock-${id}-icon`)).toBeTruthy()
    }
    expect(screen.getByTestId('worker-v5-dock-lens')).toBeTruthy()
    expect(screen.getByTestId('worker-v5-dock-shimmer')).toBeTruthy()
    expect(screen.getByTestId('worker-v5-dock-caustic')).toBeTruthy()
    expect(screen.getByTestId('worker-v5-kael-accessory')).toBeTruthy()
  })

  it('mounts the dedicated earnings icon on the Worker earnings route', () => {
    mountDock('earnings')

    expect(screen.getByTestId('worker-v5-dock-earnings-icon')).toBeTruthy()
    expect(screen.getByTestId('worker-v5-dock-earnings').props.accessibilityState?.selected).toBe(true)
  })
})
