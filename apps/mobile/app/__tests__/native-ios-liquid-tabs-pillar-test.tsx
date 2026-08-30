import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { render, screen, within } from '@testing-library/react-native'
import { StyleSheet } from 'react-native'

import type { PillarManifest } from '@/__tests__/pillar-manifest'
import { getCustomerThemeTokens } from '@/components/customer/customer-theme'
import { CustomerV21DockOverlayView } from '@/components/customer/dock/dock-stateful-surfaces'

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}))

const mobileRoot = resolve(__dirname, '..', '..')

function readMobileSource(relativePath: string) {
  return readFileSync(resolve(mobileRoot, relativePath), 'utf8')
}

export const PILLAR = {
  id: 'P09-native-ios-liquid-tabs',
  invariant: 'Production Customer and Worker navigation keep four primary routes on the left, use the Production route tints, and retain the transparent artwork-only Kael accessory on the right without route-following decoration',
  authority: [
    'customer/worker dock surfaces and the native-device regression report',
    'governance/protocols/frontend-test.md G4',
  ],
  target: 'apps/mobile/components/customer/dock/dock-stateful-surfaces.tsx',
  layer: 'ui-visual',
  siblings: ['P08-worker-dock-motion', 'P07-worker-verification-states'],
  mutation: 'restore LiquidSelectionLens or any dock shimmer, caustic, aura, or inner-refraction layer — the Production source guard turns red',
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

  it('keeps Kael as a sibling to the primary route cluster inside the same row', () => {
    const customerDock = readMobileSource('components/customer/dock/dock-stateful-surfaces.tsx')
    const workerDock = readMobileSource('components/worker/dock/worker-v5-dock-overlay.tsx')
    const customerStyles = readMobileSource('components/customer/dock/dock-styles.ts')

    expect(customerDock.indexOf('testID="customer-v21-primary-dock"')).toBeLessThan(customerDock.indexOf('testID="customer-v21-kael-accessory"'))
    expect(workerDock.indexOf('testID="worker-v5-primary-dock"')).toBeLessThan(workerDock.indexOf('testID="worker-v5-kael-accessory"'))
    expect(customerStyles).toContain('dockRow:')
    expect(customerStyles).toContain("flexDirection: 'row'")
  })

  it('keeps exactly four Worker routes on the left and Kael on the same row to the right', () => {
    const workerDock = readMobileSource('components/worker/dock/worker-v5-dock-overlay.tsx')
    const routeIds = [...workerDock.matchAll(/\{ icon: '[^']+', id: '([^']+)'/g)].map((match) => match[1])

    expect(routeIds).toEqual(['home', 'jobs', 'earnings', 'profile'])
    expect(workerDock.indexOf('<GlassSurface')).toBeLessThan(workerDock.indexOf('<KaelNavigationAccessory'))
    expect(workerDock).toContain('style={[dockStyles.dockRow')
    expect(workerDock).not.toContain('NativeKaelBottomAccessory')
  })

  it('keeps the approved static selection treatment in Production without route-following layers', () => {
    const customerProduction = readMobileSource('components/customer/dock/dock-stateful-surfaces.tsx')
    const workerProduction = readMobileSource('components/worker/dock/worker-v5-dock-overlay.tsx')

    const productionNavigationSource = `${customerProduction}\n${workerProduction}`
    expect(productionNavigationSource).not.toMatch(/LiquidSelectionLens|dock-lens|dock-shimmer|dock-caustic|inner-refraction/)
    expect(existsSync(resolve(mobileRoot, 'components/customer/dock/liquid-selection-lens.tsx'))).toBe(false)
  })

  it('renders the Customer Production dock with four semantic tabs and no route-following layer', () => {
    const tokens = getCustomerThemeTokens('light')
    render(
      <CustomerV21DockOverlayView
        activeTab="profile"
        animatedDockScrollStyle={{}}
        kaelActive={false}
        language="vi"
        liquidDockWidth={309}
        liquidNavWidth={384}
        mode="light"
        navItems={[
          { image: { uri: 'unused' }, key: 'home', route: '/home' },
          { image: { uri: 'unused' }, key: 'services', route: '/services' },
          { image: { uri: 'unused' }, key: 'activity', route: '/activity' },
          { image: { uri: 'unused' }, key: 'profile', route: '/profile' },
        ]}
        onKaelPress={jest.fn()}
        onTabPress={jest.fn()}
        reduceMotion={false}
        tokens={tokens}
      />,
    )

    const tabs = screen.getAllByRole('tab')
    const selectedTabs = tabs.filter((tab) => tab.props.accessibilityState?.selected === true)
    const selectedLabelStyle = StyleSheet.flatten(
      within(selectedTabs[0]).getByText('Hồ sơ').props.style,
    )

    expect(tabs).toHaveLength(4)
    expect(selectedTabs).toHaveLength(1)
    expect(selectedTabs[0]?.props.accessibilityLabel).toBe('Hồ sơ')
    expect(selectedLabelStyle.color).toBe(tokens.primary)
    expect(screen.queryByTestId('customer-v21-dock-lens')).toBeNull()
    expect(screen.queryByTestId('customer-v21-dock-shimmer')).toBeNull()
    expect(screen.queryByTestId('customer-v21-dock-caustic')).toBeNull()
    expect(screen.getByTestId('customer-v21-kael-accessory')).toBeTruthy()
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
