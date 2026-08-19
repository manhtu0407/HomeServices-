import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type { PillarManifest } from '@/__tests__/pillar-manifest'

const mobileRoot = resolve(__dirname, '..', '..')

function readMobileSource(relativePath: string) {
  return readFileSync(resolve(mobileRoot, relativePath), 'utf8')
}

export const PILLAR = {
  id: 'P09-native-ios-liquid-tabs',
  invariant: 'iOS primary navigation uses the system native tab host with exactly four source-defined routes',
  authority: [
    'NestScout_iOS26_6_Liquid_Navigation_Source.zip/native/NestScoutNativeTabs.swift',
    'governance/protocols/frontend-test.md G4',
  ],
  target: 'apps/mobile/app/(customer)/(tabs)/_layout.tsx',
  layer: 'ui-visual',
  siblings: ['P08-worker-dock-motion', 'P07-worker-verification-states'],
  mutation: 'remove NativeTabs or leave a duplicate primary route beside the native tab group — the contract turns red',
} as const satisfies PillarManifest

describe('native iOS 26.6 tab wiring', () => {
  it('keeps primary Customer and Worker routes inside native tab layouts', () => {
    const customerLayout = readMobileSource('app/(customer)/_layout.tsx')
    const workerLayout = readMobileSource('app/(worker)/_layout.tsx')
    const customerTabs = readMobileSource('app/(customer)/(tabs)/_layout.tsx')
    const workerTabs = readMobileSource('app/(worker)/(tabs)/_layout.tsx')

    expect(customerLayout).toContain('name="(tabs)"')
    expect(customerLayout).not.toContain('CustomerDockOverlay')
    expect(workerLayout).toContain('name="(tabs)"')
    expect(workerLayout).not.toContain('WorkerRebuildDockOverlay')

    for (const source of [customerTabs, workerTabs]) {
      expect(source).toContain("Platform.OS === 'ios'")
      expect(source).toContain('NativeTabs')
      expect(source).toContain('minimizeBehavior="never"')
      expect(source).toContain('sf="house"')
      expect(source).toContain('sf="square.grid.2x2"')
      expect(source).toContain('sf="clock"')
      expect(source).toContain('sf="person"')
      expect(source).toContain('NativeTabs.BottomAccessory')
      expect(source).toContain('NativeKaelBottomAccessory')
      expect(source).not.toContain('GlassSurface')
    }
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
