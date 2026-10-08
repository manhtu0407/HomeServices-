import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ConfigContext, ExpoConfig } from 'expo/config'

import type { PillarManifest } from '@/__tests__/pillar-manifest'

import createExpoConfig from '../../app.config'

export const PILLAR = {
  id: 'P37-ios-release-readiness',
  invariant:
    'the store-bound iOS release uses one version 0.2.1 Build 54 identity and aligned metadata, purpose strings, audio posture, and an enabled notification entitlement path',
  authority: [
    'apps/mobile/eas.json production profile with appVersionSource local',
    'governance/RULES.md #8 (no fake or silently degraded runtime state)',
  ],
  target: 'apps/mobile/app.config.ts',
  layer: 'security-negative',
  siblings: ['P08-worker-dock-motion', 'P09-native-ios-liquid-tabs'],
  mutation:
    'set ios.buildNumber below 54, remove expo-notifications, or disable iosPushNotificationsEnabled — release identity or push setup turns red',
} as const satisfies PillarManifest

const mobileRoot = resolve(__dirname, '..', '..')

type StaticExpoConfig = {
  expo: {
    extra?: {
      eas?: { projectId?: string }
      iosPushNotificationsEnabled?: boolean
    }
    ios: {
      buildNumber: string
      infoPlist: Record<string, string>
    }
    owner?: string
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

type EasConfig = {
  build: { production: { autoIncrement: boolean } }
  cli: { appVersionSource: string }
  submit: { production: { ios: { appleTeamId: string; ascAppId: string } } }
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
  it('keeps the evaluated, static, and store release identities aligned', () => {
    const evaluated = createExpoConfig({
      config: { name: 'NestScout', slug: 'home-services' },
    } as ConfigContext)
    const staticConfig = readJson<StaticExpoConfig>('app.json').expo
    const storeConfig = readJson<StoreConfig>('store.config.json').apple
    const easConfig = readJson<EasConfig>('eas.json')
    const packageConfig = readJson<{ version: string }>('package.json')

    expect(evaluated.version).toBe('0.2.1')
    expect(staticConfig.version).toBe(evaluated.version)
    expect(packageConfig.version).toBe(evaluated.version)
    expect(evaluated.extra?.runtimeBuildInfo?.runtimeVersion).toBe(evaluated.version)
    expect(evaluated.owner).toBe('nestscout')
    expect(staticConfig.owner).toBe(evaluated.owner)
    expect(evaluated.extra?.eas?.projectId).toBe('c2fd8ae7-a6fa-4b6e-a9a0-df85b52ac94b')
    expect(staticConfig.extra?.eas?.projectId).toBe(evaluated.extra?.eas?.projectId)
    expect(evaluated.ios?.buildNumber).toBe('54')
    expect(staticConfig.ios.buildNumber).toBe(evaluated.ios?.buildNumber)
    expect(storeConfig.version).toBe(evaluated.version)
    expect(storeConfig.release.automaticRelease).toBe(false)
    expect(storeConfig.advisory.messagingAndChat).toBe(true)
    expect(storeConfig.advisory.userGeneratedContent).toBe(true)
    expect(storeConfig.info.vi.privacyPolicyUrl).toBe('https://manhtu0407.github.io/nestscout-privacy-policy/')
    expect(storeConfig.info.vi.supportUrl).toBe(storeConfig.info.vi.privacyPolicyUrl)
    expect(easConfig.cli.appVersionSource).toBe('local')
    expect(easConfig.build.production.autoIncrement).toBe(false)
    expect(easConfig.submit.production.ios.ascAppId).toBe('6771323477')
    expect(easConfig.submit.production.ios.appleTeamId).toBe('7S4723Q8LP')
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

  it('keeps the notification plugin and iOS runtime capability enabled in both config sources', () => {
    const evaluated = createExpoConfig({
      config: { name: 'NestScout', slug: 'home-services' },
    } as ConfigContext)
    const staticConfig = readJson<StaticExpoConfig>('app.json').expo

    expect(evaluated.plugins).toContain('expo-notifications')
    expect(staticConfig.plugins).toContain('expo-notifications')
    expect(evaluated.extra?.iosPushNotificationsEnabled).toBe(true)
    expect(staticConfig.extra?.iosPushNotificationsEnabled).toBe(true)
  })
})
