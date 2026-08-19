import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { PillarManifest } from '@/__tests__/pillar-manifest'

const mobileRoot = resolve(__dirname, '..', '..')

function readMobileSource(relativePath: string) {
  return readFileSync(resolve(mobileRoot, relativePath), 'utf8')
}

export const PILLAR = {
  id: 'P09-native-ios-liquid-tabs',
  invariant: 'Customer and Worker iOS navigation use one custom liquid dock with four routes and Kael in the same surface',
  authority: [
    'customer/worker dock surfaces and the native-device regression report',
    'governance/protocols/frontend-test.md G4',
  ],
  target: 'apps/mobile/app/(customer)/(tabs)/_layout.tsx',
  layer: 'ui-visual',
  siblings: ['P08-worker-dock-motion', 'P07-worker-verification-states'],
  mutation: 'restore NativeTabs.BottomAccessory beside the custom dock — the contract turns red',
} as const satisfies PillarManifest

describe('cross-platform liquid dock wiring', () => {
  it('keeps one custom dock with four routes and Kael on both role gates', () => {
    const customerLayout = readMobileSource('app/(customer)/_layout.tsx')
    const workerLayout = readMobileSource('app/(worker)/_layout.tsx')
    const customerTabs = readMobileSource('app/(customer)/(tabs)/_layout.tsx')
    const workerTabs = readMobileSource('app/(worker)/(tabs)/_layout.tsx')

    expect(customerLayout).toContain('name="(tabs)"')
    expect(customerLayout).not.toContain('CustomerDockOverlay')
    expect(workerLayout).toContain('name="(tabs)"')
    expect(workerLayout).not.toContain('WorkerRebuildDockOverlay')

    expect(customerTabs).toContain('<Slot />')
    expect(customerTabs).toContain('DockScrollStateProvider')
    expect(customerTabs).toContain('CustomerDockOverlay')
    expect(customerTabs).not.toContain('NativeTabs')
    expect(customerTabs).not.toContain('NativeKaelBottomAccessory')

    expect(workerTabs).toContain('<Slot />')
    expect(workerTabs).toContain('WorkerDockLayoutProvider')
    expect(workerTabs).toContain('WorkerRebuildDockOverlay')
    expect(workerTabs).not.toContain('NativeTabs')
    expect(workerTabs).not.toContain('NativeKaelBottomAccessory')
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
