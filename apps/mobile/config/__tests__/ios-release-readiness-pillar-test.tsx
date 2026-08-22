import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Platform } from 'react-native'
import type { ConfigContext, ExpoConfig } from 'expo/config'

import type { PillarManifest } from '@/__tests__/pillar-manifest'

const mockGetPermissionsAsync = jest.fn()
const mockRequestPermissionsAsync = jest.fn()
const mockGetExpoPushTokenAsync = jest.fn()
const mockRegisterDeviceToken = jest.fn()

jest.mock('expo/config-plugins', () => ({
  withEntitlementsPlist: (config: ExpoConfig) => config,
  withXcodeProject: (config: ExpoConfig) => config,
}))

jest.mock('expo-notifications', () => ({
  getExpoPushTokenAsync: mockGetExpoPushTokenAsync,
  getPermissionsAsync: mockGetPermissionsAsync,
  requestPermissionsAsync: mockRequestPermissionsAsync,
}))

jest.mock('@/lib/services', () => ({
  notificationService: {
    registerDeviceToken: mockRegisterDeviceToken,
    unregisterDeviceToken: jest.fn(),
  },
}))

import createExpoConfig from '../../app.config'
import { setupPushNotifications } from '@/lib/push-notifications'

export const PILLAR = {
  id: 'P37-ios-release-readiness',
  invariant:
    'the store-bound iOS release uses one Build 44 identity and aligned metadata, purpose strings, audio posture, and push-entitlement runtime gate',
  authority: [
    'Apple App Review submission for NestScout 0.1.0 Build 44',
    'governance/RULES.md #8 (no fake or silently degraded runtime state)',
  ],
  target: 'apps/mobile/app.config.ts',
  layer: 'security-negative',
  siblings: ['P08-worker-dock-motion', 'P09-native-ios-liquid-tabs'],
  mutation:
    'set ios.buildNumber back to 43 or let iOS push setup continue when iosPushNotificationsEnabled is false — the release identity or no-permission-call case turns red',
} as const satisfies PillarManifest

const mobileRoot = resolve(__dirname, '..', '..')

type StaticExpoConfig = {
  expo: {
    extra?: { iosPushNotificationsEnabled?: boolean }
    ios: {
      buildNumber: string
      infoPlist: Record<string, string>
    }
    plugins: ExpoConfig['plugins']
    version: string
  }
}

type StoreConfig = {
  apple: {
    advisory: { messagingAndChat: boolean; userGeneratedContent: boolean }
    info: {
      vi: { privacyPolicyUrl: string; supportUrl: string }
    }
    release: { automaticRelease: boolean }
    version: string
  }
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(resolve(mobileRoot, relativePath), 'utf8')) as T
}

function pluginOptions(plugins: ExpoConfig['plugins'], name: string) {
  const plugin = plugins?.find((entry) => Array.isArray(entry) && entry[0] === name)
  if (!Array.isArray(plugin) || typeof plugin[1] !== 'object' || plugin[1] === null) {
    throw new Error(`Missing ${name} plugin options`)
  }
  return plugin[1] as Record<string, unknown>
}

describe('iOS release readiness', () => {
  const originalPlatform = Platform.OS

  beforeEach(() => {
    jest.clearAllMocks()
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' })
  })

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform })
  })

  it('keeps the evaluated, static, and store release identities aligned', () => {
    const evaluated = createExpoConfig({
      config: { name: 'NestScout', slug: 'home-services' },
    } as ConfigContext)
    const staticConfig = readJson<StaticExpoConfig>('app.json').expo
    const storeConfig = readJson<StoreConfig>('store.config.json').apple

    expect(evaluated.version).toBe('0.1.0')
    expect(staticConfig.version).toBe(evaluated.version)
    expect(evaluated.ios?.buildNumber).toBe('44')
    expect(staticConfig.ios.buildNumber).toBe(evaluated.ios?.buildNumber)
    expect(storeConfig.version).toBe(evaluated.version)
    expect(storeConfig.release.automaticRelease).toBe(false)
    expect(storeConfig.advisory.messagingAndChat).toBe(true)
    expect(storeConfig.advisory.userGeneratedContent).toBe(true)
    expect(storeConfig.info.vi.privacyPolicyUrl).toBe('https://manhtu0407.github.io/nestscout-privacy-policy/')
    expect(storeConfig.info.vi.supportUrl).toBe(storeConfig.info.vi.privacyPolicyUrl)
  })

  it('keeps every native permission explanation and the audio posture in sync', () => {
    const evaluated = createExpoConfig({
      config: { name: 'NestScout', slug: 'home-services' },
    } as ConfigContext)
    const staticConfig = readJson<StaticExpoConfig>('app.json').expo
    const dynamicInfo = evaluated.ios?.infoPlist ?? {}
    const staticInfo = staticConfig.ios.infoPlist
    const dynamicAudio = pluginOptions(evaluated.plugins, 'expo-audio')
    const staticAudio = pluginOptions(staticConfig.plugins, 'expo-audio')
    const dynamicPicker = pluginOptions(evaluated.plugins, 'expo-image-picker')
    const staticPicker = pluginOptions(staticConfig.plugins, 'expo-image-picker')
    const dynamicLocation = pluginOptions(evaluated.plugins, 'expo-location')
    const staticLocation = pluginOptions(staticConfig.plugins, 'expo-location')

    expect(staticInfo).toEqual(dynamicInfo)
    expect(dynamicAudio.microphonePermission).toBe(dynamicInfo.NSMicrophoneUsageDescription)
    expect(staticAudio).toEqual(dynamicAudio)
    expect(dynamicAudio.enableBackgroundPlayback).toBe(false)
    expect(dynamicPicker.cameraPermission).toBe(dynamicInfo.NSCameraUsageDescription)
    expect(dynamicPicker.photosPermission).toBe(dynamicInfo.NSPhotoLibraryUsageDescription)
    expect(staticPicker).toEqual(dynamicPicker)
    expect(dynamicLocation.locationWhenInUsePermission).toBe(dynamicInfo.NSLocationWhenInUseUsageDescription)
    expect(staticLocation).toEqual(dynamicLocation)
  })

  it('never asks for iOS notification permission while the release entitlement is absent', async () => {
    const evaluated = createExpoConfig({
      config: { name: 'NestScout', slug: 'home-services' },
    } as ConfigContext)

    expect(evaluated.extra?.iosPushNotificationsEnabled).toBe(false)
    await expect(setupPushNotifications({
      accessToken: 'release-test-token',
      role: 'customer',
    })).resolves.toEqual({ status: 'unsupported' })
    expect(mockGetPermissionsAsync).not.toHaveBeenCalled()
    expect(mockRequestPermissionsAsync).not.toHaveBeenCalled()
    expect(mockGetExpoPushTokenAsync).not.toHaveBeenCalled()
    expect(mockRegisterDeviceToken).not.toHaveBeenCalled()
  })
})
