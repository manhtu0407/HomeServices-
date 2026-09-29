import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { render, screen, within } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import {
  getCustomerThemeTokens,
  getReducedTransparencyCustomerTokens,
  type ThemeMode,
} from '@/components/customer/customer-theme'
import { CustomerV21DockOverlayView } from '@/components/customer/dock/dock-stateful-surfaces'
import type { CustomerPrimaryTab } from '@/components/customer/ui/types'
import type { AppLanguage } from '@/lib/app-language'

const mockGlassAccessibility = { reduceMotion: false, reduceTransparency: false }

jest.mock('@/components/ui/accessibility-motion', () => ({
  useGlassAccessibility: () => mockGlassAccessibility,
}))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}))

const mobileRoot = resolve(__dirname, '..', '..')
const CUSTOMER_NAV_ITEMS = [
  { image: { uri: 'unused' }, key: 'home', route: '/home' },
  { image: { uri: 'unused' }, key: 'services', route: '/services' },
  { image: { uri: 'unused' }, key: 'activity', route: '/activity' },
  { image: { uri: 'unused' }, key: 'profile', route: '/profile' },
] as const
const CUSTOMER_TAB_LABELS = {
  en: ['Home', 'Services', 'Activity', 'Profile'],
  vi: ['Trang chủ', 'Dịch vụ', 'Hoạt động', 'Hồ sơ'],
} as const

function readMobileSource(relativePath: string) {
  return readFileSync(resolve(mobileRoot, relativePath), 'utf8')
}

function mountCustomerDock({
  activeTab = 'home',
  language = 'vi',
  mode = 'light',
  reduceMotion = false,
  reduceTransparency = false,
}: {
  activeTab?: CustomerPrimaryTab
  language?: AppLanguage
  mode?: ThemeMode
  reduceMotion?: boolean
  reduceTransparency?: boolean
} = {}) {
  mockGlassAccessibility.reduceMotion = reduceMotion
  mockGlassAccessibility.reduceTransparency = reduceTransparency
  const baseTokens = getCustomerThemeTokens(mode)
  const tokens = reduceTransparency
    ? getReducedTransparencyCustomerTokens(baseTokens)
    : baseTokens
  const rendered = render(
    <CustomerV21DockOverlayView
      activeTab={activeTab}
      animatedDockScrollStyle={{}}
      kaelActive={false}
      language={language}
      liquidDockWidth={309}
      liquidNavWidth={384}
      navItems={[...CUSTOMER_NAV_ITEMS]}
      onKaelPress={jest.fn()}
      onTabPress={jest.fn()}
      reduceMotion={reduceMotion}
      tokens={tokens}
    />,
  )

  return { ...rendered, tokens }
}

beforeEach(() => {
  mockGlassAccessibility.reduceMotion = false
  mockGlassAccessibility.reduceTransparency = false
})

export const PILLAR = {
  id: 'P09-native-ios-liquid-tabs',
  invariant: 'Production Customer and Worker navigation keep four primary routes on one glass plane with a single selection lens, use the Production route tints, and keep the artwork-only Kael accessory outside that plane as its sibling in the same row, with no ambient decoration (shimmer, caustic, aura, refraction)',
  authority: [
    'customer/worker dock surfaces and the native-device regression report',
    'governance/protocols/frontend-test.md G4',
  ],
  target: 'apps/mobile/components/customer/dock/dock-stateful-surfaces.tsx',
  layer: 'ui-visual',
  siblings: ['P08-worker-dock-motion', 'P07-worker-verification-states'],
  mutation: 'render the Kael accessory inside the tab plane (or above the row), or add a dock shimmer, caustic, aura, or refraction layer — the row-geometry or decoration case turns red',
} as const satisfies PillarManifest

describe('cross-platform navigation wiring', () => {
  it('keeps one custom liquid dock on every platform so iOS preserves the intended row geometry', () => {
    const customerLayout = readMobileSource('app/(customer)/_layout.tsx')
    const workerLayout = readMobileSource('app/(worker)/_layout.tsx')
    const customerTabs = readMobileSource('app/(customer)/(tabs)/_layout.tsx')
    const workerTabs = readMobileSource('app/(worker)/(tabs)/_layout.tsx')

    expect(customerLayout).toContain('name="(tabs)"')
    expect(customerLayout).not.toContain('CustomerDockOverlay')
    expect(workerLayout).toContain('name="(tabs)"')
    expect(workerLayout).not.toContain('WorkerRebuildDockOverlay')

    expect(customerTabs).not.toContain('NativeTabs')
    expect(customerTabs).not.toContain('NativeKaelBottomAccessory')
    expect(customerTabs).toContain('return <CustomerFallbackTabs />')
    expect(customerTabs).toContain('DockScrollStateProvider')
    expect(customerTabs).toContain('CustomerDockOverlay')

    expect(workerTabs).not.toContain('NativeTabs')
    expect(workerTabs).not.toContain('NativeKaelBottomAccessory')
    expect(workerTabs).toContain('return <WorkerFallbackTabs />')
    expect(workerTabs).toContain('WorkerDockLayoutProvider')
    expect(workerTabs).toContain('WorkerRebuildDockOverlay')
  })

  it('renders Kael as a sibling of the tab plane in the same row, never inside or above it', () => {
    mountCustomerDock({ activeTab: 'home' })
    const row = screen.getByTestId('customer-v21-liquid-navigation')
    const plane = screen.getByTestId('customer-v21-primary-dock-plane')
    const kael = screen.getByTestId('customer-v21-kael-accessory')
    const ancestors = (element: typeof kael) => {
      const chain: (typeof kael)[] = []
      for (let node = element.parent; node; node = node.parent) chain.push(node)
      return chain
    }
    const customerStyles = readMobileSource('components/customer/dock/dock-styles.ts')

    withPillarContext(
      PILLAR,
      () => {
        expect(ancestors(within(plane).getAllByRole('tab')[0])).toContain(plane)
        expect(ancestors(kael)).not.toContain(plane)
        expect(ancestors(kael)).toContain(row)
        expect(ancestors(plane)).toContain(row)
        expect(within(plane).queryByTestId('customer-v21-kael-accessory')).toBeNull()
        expect(within(plane).getAllByRole('tab')).toHaveLength(4)
        expect(customerStyles).toContain('dockRow:')
        expect(customerStyles).toContain("flexDirection: 'row'")
      },
      'Tu: the upgrade must never turn the Kael mascot beside the four tabs into a separate bar above them',
    )
  })

  it('keeps exactly four Worker routes on the left and Kael on the same row to the right', () => {
    const workerDock = readMobileSource('components/worker/dock/worker-v5-dock-overlay.tsx')
    const routeIds = [...workerDock.matchAll(/\{ icon: '[^']+', id: '([^']+)'/g)].map((match) => match[1])

    expect(routeIds).toEqual(['home', 'jobs', 'earnings', 'profile'])
    expect(workerDock.indexOf('<LiquidTabPlane')).toBeGreaterThan(-1)
    expect(workerDock.indexOf('<LiquidTabPlane')).toBeLessThan(workerDock.indexOf('<KaelNavigationAccessory'))
    expect(workerDock).toContain('style={[dockStyles.dockRow')
    expect(workerDock).not.toContain('NativeKaelBottomAccessory')
  })

  it('keeps a single selection lens and no ambient dock decoration', () => {
    const navigationSource = [
      'components/customer/dock/dock-stateful-surfaces.tsx',
      'components/customer/dock/liquid-tab-plane.tsx',
      'components/worker/dock/worker-v5-dock-overlay.tsx',
    ].map(readMobileSource).join('\n')

    expect(navigationSource).not.toMatch(/shimmer|caustic|aura|refraction|LiquidSelectionLens/i)
    expect(existsSync(resolve(mobileRoot, 'components/customer/dock/liquid-selection-lens.tsx'))).toBe(false)
  })

  it('renders the Customer Production dock with four semantic tabs and one selection lens', () => {
    mountCustomerDock({ activeTab: 'profile' })

    const tabs = screen.getAllByRole('tab')
    const selectedTabs = tabs.filter((tab) => tab.props.accessibilityState?.selected === true)

    expect(tabs).toHaveLength(4)
    expect(selectedTabs).toHaveLength(1)
    expect(selectedTabs[0]?.props.accessibilityLabel).toBe('Hồ sơ')
    expect(screen.getAllByTestId('customer-v21-primary-dock-lens')).toHaveLength(1)
    expect(screen.queryByTestId('customer-v21-dock-shimmer')).toBeNull()
    expect(screen.queryByTestId('customer-v21-dock-caustic')).toBeNull()
    expect(screen.getByTestId('customer-v21-kael-accessory')).toBeTruthy()
  })

  it.each([
    ['home', 'Trang chủ'],
    ['services', 'Dịch vụ'],
    ['activity', 'Hoạt động'],
    ['profile', 'Hồ sơ'],
  ] as const)('marks only the Customer %s tab selected', (activeTab, selectedLabel) => {
    mountCustomerDock({ activeTab })
    withPillarContext(
      PILLAR,
      () => {
        const selected = CUSTOMER_TAB_LABELS.vi.filter(
          (label) => screen.getByRole('tab', { name: label }).props.accessibilityState?.selected === true,
        )
        expect(selected).toEqual([selectedLabel])
      },
      'exactly one Customer destination may report selected',
    )
  })

  it.each([
    ['vi', 'Trang chủ', 'Home'],
    ['en', 'Home', 'Trang chủ'],
  ] as const)('renders only the %s Customer tab labels', (language, visibleHome, hiddenHome) => {
    mountCustomerDock({ language })
    withPillarContext(
      PILLAR,
      () => {
        for (const label of CUSTOMER_TAB_LABELS[language]) {
          expect(screen.getByRole('tab', { name: label })).toBeTruthy()
        }
        expect(screen.queryByRole('tab', { name: hiddenHome })).toBeNull()
        expect(screen.getByRole('tab', { name: visibleHome })).toBeTruthy()
      },
      'Customer navigation must expose one language per selected mode',
    )
  })

  it.each(['light', 'dark'] as const)('uses the Production selected tint in %s mode', (mode) => {
    const { tokens } = mountCustomerDock({ activeTab: 'activity', mode })
    const selectedLabelStyle = StyleSheet.flatten(
      within(screen.getByRole('tab', { name: 'Hoạt động' })).getByText('Hoạt động').props.style,
    )
    const unselectedLabelStyle = StyleSheet.flatten(
      within(screen.getByRole('tab', { name: 'Trang chủ' })).getByText('Trang chủ').props.style,
    )

    withPillarContext(
      PILLAR,
      () => {
        expect(selectedLabelStyle.color).toBe(tokens.primary)
        expect(unselectedLabelStyle.color).toBe(tokens.text)
      },
      `${mode} mode: accent on the selected tab only, highest-contrast label colour elsewhere (Apple HIG Materials)`,
    )
  })

  it.each([true, false])('keeps every Customer tab and the selection when Reduce Motion is %s', (reduceMotion) => {
    mountCustomerDock({ activeTab: 'services', reduceMotion })
    withPillarContext(
      PILLAR,
      () => {
        for (const label of CUSTOMER_TAB_LABELS.vi) {
          expect(screen.getByRole('tab', { name: label })).toBeTruthy()
        }
        expect(screen.getByRole('tab', { name: 'Dịch vụ' }).props.accessibilityState?.selected).toBe(true)
      },
      `reduceMotion=${String(reduceMotion)} must not change Customer navigation state`,
    )
  })

  it('uses an opaque Customer dock without losing routes under Reduce Transparency', () => {
    const translucentRender = mountCustomerDock()
    const translucent = StyleSheet.flatten(
      screen.getByTestId('customer-v21-primary-dock').props.style,
    ).backgroundColor

    translucentRender.unmount()
    const opaqueRender = mountCustomerDock({ activeTab: 'profile', reduceTransparency: true })
    const opaque = StyleSheet.flatten(
      screen.getByTestId('customer-v21-primary-dock').props.style,
    ).backgroundColor

    withPillarContext(
      PILLAR,
      () => {
        expect(opaque).not.toBe(translucent)
        expect(String(opaque)).not.toMatch(/rgba\([^)]*,\s*0?\.\d+\s*\)/)
        expect(screen.getAllByRole('tab')).toHaveLength(4)
        expect(screen.getByRole('tab', { name: 'Hồ sơ' }).props.accessibilityState?.selected).toBe(true)
      },
      'Reduce Transparency must keep the Customer dock complete while replacing translucent glass',
    )

    opaqueRender.unmount()
  })

  it('does not leave duplicate primary routes beside the native tab group', () => {
    const primaryRoutes = [
      ['customer', 'home'],
      ['customer', 'booking'],
      ['customer', 'history'],
      ['customer', 'profile'],
      ['worker', 'home'],
      ['worker', 'jobs'],
      ['worker', 'earnings'],
      ['worker', 'profile'],
    ] as const

    for (const [role, route] of primaryRoutes) {
      expect(existsSync(resolve(mobileRoot, `app/(${role})/(tabs)/${route}.tsx`))).toBe(true)
      expect(existsSync(resolve(mobileRoot, `app/(${role})/${route}.tsx`))).toBe(false)
    }
  })
})
