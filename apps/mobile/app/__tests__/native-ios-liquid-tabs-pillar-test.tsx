import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { PillarManifest } from '@/__tests__/pillar-manifest'

const mobileRoot = resolve(__dirname, '..', '..')

function readMobileSource(relativePath: string) {
  return readFileSync(resolve(mobileRoot, relativePath), 'utf8')
}

export const PILLAR = {
  id: 'P09-native-ios-liquid-tabs',
  invariant: 'Customer and Worker navigation keep the four primary routes together on the left and Kael as a sibling accessory on the right',
  authority: [
    'customer/worker dock surfaces and the native-device regression report',
    'governance/protocols/frontend-test.md G4',
  ],
  target: 'apps/mobile/app/(customer)/(tabs)/_layout.tsx',
  layer: 'ui-visual',
  siblings: ['P08-worker-dock-motion', 'P07-worker-verification-states'],
  mutation: 'render NativeTabs.BottomAccessory or place Kael above the primary route cluster — the navigation geometry contract turns red',
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
    expect(workerDock).toContain('itemCount={WORKER_V5_DOCK_ROUTE_ITEMS.length}')
    expect(workerDock.indexOf('<GlassSurface')).toBeLessThan(workerDock.indexOf('<KaelNavigationAccessory'))
    expect(workerDock).toContain('style={[dockStyles.dockRow')
    expect(workerDock).not.toContain('NativeKaelBottomAccessory')
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
