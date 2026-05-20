import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { ExpoConfig, ConfigContext } from 'expo/config'

const configDir = __dirname
const repoRoot = resolve(configDir, '../..')

const localEnv = [
  resolve(repoRoot, '.env'),
  resolve(repoRoot, '.env.local'),
  resolve(configDir, '.env'),
  resolve(configDir, '.env.local'),
].reduce<Record<string, string>>((env, filePath) => {
  if (!existsSync(filePath)) {
    return env
  }

  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/)

  for (const line of lines) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)

    if (!match) {
      continue
    }

    const [, key, rawValue] = match
    const value = rawValue.replace(/^(['"])(.*)\1$/, '$2')
    env[key] = value
  }

  return env
}, {})

const fromEnv = (...keys: string[]) => {
  for (const key of keys) {
    const value = process.env[key] ?? localEnv[key]

    if (value && value.trim().length > 0) {
      return value
    }
  }

  return ''
}

const supabaseUrl = fromEnv('EXPO_PUBLIC_SUPABASE_URL')
const supabasePublishableKey = fromEnv('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
const configuredApiBaseUrl = fromEnv('EXPO_PUBLIC_API_BASE_URL')
const apiBaseUrl =
  configuredApiBaseUrl || (supabaseUrl ? `${supabaseUrl.replace(/\/$/, '')}/functions/v1/mobile-api` : '')

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Home Services',
  slug: 'home-services',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  scheme: 'homeservices',
  splash: {
    image: './assets/splash-icon.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  ios: {
    supportsTablet: false,
    buildNumber: '1',
    bundleIdentifier: 'com.phanmanhtu.homeservices',
    config: {
      usesNonExemptEncryption: false,
    },
    infoPlist: {
      NSCameraUsageDescription:
        'Home Services cần quyền camera nếu bạn muốn chụp hiện trạng sửa chữa hoặc giấy tờ xác minh.',
      NSPhotoLibraryUsageDescription:
        'Home Services cần quyền chọn ảnh hoặc video để bạn mô tả tình trạng sửa chữa hoặc gửi hồ sơ xác minh.',
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/adaptive-icon.png',
      backgroundColor: '#ffffff',
    },
    versionCode: 1,
    permissions: [],
    blockedPermissions: ['android.permission.RECORD_AUDIO'],
    edgeToEdgeEnabled: true,
    package: 'com.phanmanhtu.homeservices',
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-image-picker',
      {
        photosPermission:
          'Home Services cần quyền chọn ảnh hoặc video để bạn mô tả tình trạng sửa chữa.',
        cameraPermission:
          'Home Services cần quyền camera nếu bạn muốn chụp hiện trạng sửa chữa.',
      },
    ],
  ],
  extra: {
    supabaseUrl,
    supabasePublishableKey,
    apiBaseUrl,
    eas: {
      projectId: 'df74d6a3-f85b-4b40-85ef-fe3162023d6e',
    },
  },
})
