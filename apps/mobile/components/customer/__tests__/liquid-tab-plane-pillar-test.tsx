import { fireEvent, render, screen, within } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { getCustomerThemeTokens, getReducedTransparencyCustomerTokens } from '@/components/customer/customer-theme'
import { liquidTabLensTheme } from '@/design/theme'
import { LiquidTabPlane, type LiquidTabItem } from '@/components/customer/dock/liquid-tab-plane'
import {
  LIQUID_LENS_LIFT_SCALE,
  liquidLensDragX,
  liquidLensRestX,
  liquidLensStretch,
  liquidTabIndexAt,
  liquidTabWidth,
} from '@/components/customer/dock/liquid-tab-plane-model'

export const PILLAR = {
  id: 'P292-liquid-tab-plane',
  invariant: 'the liquid tab bar maps a finger to exactly one of its four tabs across the whole plane, keeps the lens inside the bar while dragging, stretches it more for a longer or faster move within a cap, and always renders one lens, one selected tab and a screen-reader press path under Reduce Motion and Reduce Transparency',
  authority: ['governance/design/motion.md (springs from motion-tokens, Reduce Motion fallback)', 'governance/protocols/frontend-test.md G4 (Reduce Motion, Reduce Transparency)'],
  target: 'apps/mobile/components/customer/dock/liquid-tab-plane.tsx',
  layer: 'ui-visual',
  siblings: ['P09-native-ios-liquid-tabs', 'P08-worker-dock-motion'],
  mutation: 'drop the clamp in liquidTabIndexAt or liquidLensDragX, or the cap in liquidLensStretch — the edge and cap cases turn red',
} as const satisfies PillarManifest

const geometry = { count: 4, padding: 3, width: 309 }
const tabWidth = liquidTabWidth(geometry)
const ITEMS: readonly LiquidTabItem<'home' | 'jobs' | 'earnings' | 'profile'>[] = [
  { icon: 'home', key: 'home', label: 'Trang chủ', testID: 'tab-home' },
  { icon: 'services', key: 'jobs', label: 'Công việc', testID: 'tab-jobs' },
  { icon: 'earnings', key: 'earnings', label: 'Thu nhập', testID: 'tab-earnings' },
  { icon: 'profile', key: 'profile', label: 'Hồ sơ', testID: 'tab-profile' },
]

function mountPlane({
  reduceMotion = false,
  reduceTransparency = false,
  selectedKey = 'jobs',
}: {
  reduceMotion?: boolean
  reduceTransparency?: boolean
  selectedKey?: (typeof ITEMS)[number]['key'] | null
} = {}) {
  const base = getCustomerThemeTokens('light')
  const tokens = reduceTransparency ? getReducedTransparencyCustomerTokens(base) : base
  const onSelect = jest.fn()
  render(
    <LiquidTabPlane
      items={ITEMS}
      onSelect={onSelect}
      reduceMotion={reduceMotion}
      reduceTransparency={reduceTransparency}
      selectedKey={selectedKey}
      testID="plane"
      tokens={tokens}
      width={geometry.width}
    />,
  )
  return { onSelect, tokens }
}

describe('liquid tab plane geometry', () => {
  it('maps every point of the plane to one tab, clamping the rounded ends', () => {
    withPillarContext(
      PILLAR,
      () => {
        expect(liquidTabIndexAt(-40, geometry)).toBe(0)
        expect(liquidTabIndexAt(geometry.padding, geometry)).toBe(0)
        expect(liquidTabIndexAt(geometry.padding + tabWidth - 0.5, geometry)).toBe(0)
        expect(liquidTabIndexAt(geometry.padding + tabWidth + 0.5, geometry)).toBe(1)
        expect(liquidTabIndexAt(geometry.padding + tabWidth * 2.5, geometry)).toBe(2)
        expect(liquidTabIndexAt(geometry.width, geometry)).toBe(3)
        expect(liquidTabIndexAt(geometry.width + 80, geometry)).toBe(3)
      },
      'a drag that leaves the bar sideways must still land on the nearest tab, never on an index that does not exist',
    )
  })

  it('keeps the dragged lens inside the bar and rests it on the tab slot', () => {
    withPillarContext(
      PILLAR,
      () => {
        expect(liquidLensDragX(-100, geometry)).toBe(geometry.padding)
        expect(liquidLensDragX(geometry.width + 100, geometry)).toBe(geometry.padding + tabWidth * 3)
        expect(liquidLensDragX(geometry.padding + tabWidth * 1.5, geometry)).toBeCloseTo(geometry.padding + tabWidth)
        expect(liquidLensRestX(2, geometry)).toBeCloseTo(geometry.padding + tabWidth * 2)
      },
      'the lens follows the finger but never slides past the first or last tab',
    )
  })

  it('stretches more for a longer or faster move, within a cap, and thins across its travel', () => {
    const short = liquidLensStretch(1)
    const long = liquidLensStretch(3)
    const flung = liquidLensStretch(3, 8)
    withPillarContext(
      PILLAR,
      () => {
        expect(liquidLensStretch(0)).toEqual({ scaleX: 1, scaleY: 1 })
        expect(long.scaleX).toBeGreaterThan(short.scaleX)
        expect(flung.scaleX).toBeLessThanOrEqual(1.34)
        expect(flung.scaleY).toBeLessThan(1)
        expect(liquidLensStretch(-3)).toEqual(long)
        expect(LIQUID_LENS_LIFT_SCALE).toBeGreaterThan(1)
      },
      'an uncapped stretch turns a fast swipe into a smeared bar instead of a liquid drop',
    )
  })
})

describe('liquid tab plane rendering', () => {
  it('renders one lens and reports exactly the routed tab as selected', () => {
    mountPlane({ selectedKey: 'earnings' })
    withPillarContext(
      PILLAR,
      () => {
        expect(screen.getAllByTestId('plane-lens')).toHaveLength(1)
        const selected = screen.getAllByRole('tab').filter((tab) => tab.props.accessibilityState?.selected === true)
        expect(selected.map((tab) => tab.props.accessibilityLabel)).toEqual(['Thu nhập'])
      },
      'selection state is carried by accessibility, not only by the lens position',
    )
  })

  it('keeps a press path for screen readers that selects the pressed tab', () => {
    const { onSelect } = mountPlane()
    fireEvent.press(screen.getByRole('tab', { name: 'Hồ sơ' }))
    expect(onSelect).toHaveBeenCalledWith('profile')
  })

  it('hides the lens and selects nothing while Kael is the active destination', () => {
    mountPlane({ selectedKey: null })
    withPillarContext(
      PILLAR,
      () => {
        expect(StyleSheet.flatten(screen.getByTestId('plane-lens').props.style).opacity).toBe(0)
        expect(screen.getAllByRole('tab').some((tab) => tab.props.accessibilityState?.selected === true)).toBe(false)
      },
      'no route tab may look selected when the Kael accessory is the current destination',
    )
  })

  it.each([true, false])('keeps four tabs and one selection when Reduce Motion is %s', (reduceMotion) => {
    mountPlane({ reduceMotion, selectedKey: 'home' })
    expect(within(screen.getByTestId('plane-plane')).getAllByRole('tab')).toHaveLength(4)
    expect(screen.getByRole('tab', { name: 'Trang chủ' }).props.accessibilityState?.selected).toBe(true)
  })

  it('draws a solid lens and no clear-glass lift under Reduce Transparency', () => {
    const { tokens } = mountPlane({ reduceTransparency: true })
    const lens = screen.getByTestId('plane-lens')
    withPillarContext(
      PILLAR,
      () => {
        expect(StyleSheet.flatten(lens.props.style).backgroundColor).toBe(tokens.statusSurface)
        expect(StyleSheet.flatten(lens.props.children.props.style).opacity).toBe(0)
      },
      'Reduce Transparency replaces glass with a solid surface while keeping the selection visible',
    )
  })

  it('lets every label use the full tab width instead of truncating it', () => {
    mountPlane()
    const label = within(screen.getByRole('tab', { name: 'Công việc' })).getByText('Công việc')
    withPillarContext(
      PILLAR,
      () => {
        expect(StyleSheet.flatten(label.props.style).maxWidth).toBe('100%')
        expect(label.props.numberOfLines).toBe(1)
        expect(label.props.adjustsFontSizeToFit).toBe(true)
      },
      'TestFlight 46: "Hoạt động" rendered as "Hoạt độ…" under a fixed 64pt label cap',
    )
  })

  it('rests the selection on a neutral platter and keeps the accent on the selected tab', () => {
    const { tokens } = mountPlane({ selectedKey: 'jobs' })
    withPillarContext(
      PILLAR,
      () => {
        expect(StyleSheet.flatten(screen.getByTestId('plane-lens').props.style).backgroundColor).toBe(liquidTabLensTheme.light.restFill)
        expect(StyleSheet.flatten(within(screen.getByRole('tab', { name: 'Công việc' })).getByText('Công việc').props.style).color).toBe(tokens.primary)
        expect(StyleSheet.flatten(within(screen.getByRole('tab', { name: 'Hồ sơ' })).getByText('Hồ sơ').props.style).color).toBe(tokens.text)
      },
      'Apple: be judicious with color in navigation; the accent belongs to the selected tab, not the platter',
    )
  })
})
