import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { isAbsolute, resolve } from 'node:path'
import type { ExpoConfig, ConfigContext } from 'expo/config'
import { assertReleaseAuthConfig, resolveMobileEnvFiles } from './config/release-auth-config.cjs'
import { resolveClientContractEpoch } from './config/client-contract-epoch.cjs'

const configDir = existsSync(resolve(process.cwd(), 'app.json'))
  ? process.cwd()
  : resolve(process.cwd(), 'apps/mobile')
const repoRoot = resolve(configDir, '../..')

const explicitEnvFiles = (process.env.NESTSCOUT_MOBILE_ENV_FILE ?? '')
  .split(/[;,\n]/)
  .flatMap((value: string) => {
    const filePath = value.trim()
    return filePath ? [isAbsolute(filePath) ? filePath : resolve(repoRoot, filePath)] : []
  })

const isEasBuild = Boolean(process.env.EAS_BUILD_ID || process.env.EAS_BUILD_PLATFORM || process.env.EAS_BUILD_PROFILE)

const localEnv = resolveMobileEnvFiles({
  configDir,
  explicitEnvFiles,
  isEasBuild,
  repoRoot,
}).reduce<Record<string, string>>((env, filePath) => {
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
      return value.trim()
    }
  }

  return ''
}

const fromGit = (...args: string[]) => {
  try {
    return execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

const supabaseUrl = fromEnv('EXPO_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL')
const supabasePublishableKey = fromEnv(
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
)
const configuredApiBaseUrl = fromEnv('EXPO_PUBLIC_API_BASE_URL')
const vietmapDisplayKey = fromEnv('EXPO_PUBLIC_VIETMAP_DISPLAY_KEY', 'VIETMAP_DISPLAY_KEY')
const vietmapMapStyleUrl = fromEnv('EXPO_PUBLIC_VIETMAP_MAP_STYLE_URL')
const mapProxyBaseUrl = fromEnv('EXPO_PUBLIC_MAP_PROXY_BASE_URL')
const nativeArchitectureConfig = { newArchEnabled: true } as unknown as Partial<ExpoConfig>
const stagingPaymentRailEnabled = false
const iosPushNotificationsEnabled = true
const androidGoogleServicesFile = fromEnv('GOOGLE_SERVICES_JSON')
const iosPurposeStrings = {
  NSCameraUsageDescription:
    'NestScout cần quyền camera nếu bạn muốn chụp ảnh đại diện thật, hiện trạng sửa chữa hoặc giấy tờ xác minh.',
  NSLocationWhenInUseUsageDescription:
    'NestScout cần vị trí của bạn khi mở lộ trình đến địa chỉ khách hàng.',
  NSMicrophoneUsageDescription:
    'NestScout cần quyền micro để chuyển giọng nói thành bản chép lời có thể chỉnh sửa ngay trên thiết bị.',
  NSPhotoLibraryUsageDescription:
    'NestScout cần quyền chọn ảnh hoặc video để đặt ảnh đại diện thật, mô tả tình trạng sửa chữa hoặc gửi hồ sơ xác minh.',
} as const
const apiBaseUrl =
  configuredApiBaseUrl || (supabaseUrl ? `${supabaseUrl.replace(/\/$/, '')}/functions/v1/mobile-api` : '')
assertReleaseAuthConfig({
  apiBaseUrl,
  buildProfile: fromEnv('EAS_BUILD_PROFILE'),
  isEasBuild,
  supabasePublishableKey,
  supabaseUrl,
})
const buildGitSha = fromEnv('NESTSCOUT_BUILD_GIT_SHA', 'EAS_BUILD_GIT_COMMIT_HASH', 'GITHUB_SHA') || fromGit('rev-parse', 'HEAD')
const buildGitBranch = fromEnv('NESTSCOUT_BUILD_GIT_BRANCH', 'EAS_BUILD_GIT_COMMIT_REF', 'GITHUB_REF_NAME') || fromGit('rev-parse', '--abbrev-ref', 'HEAD')
const buildReleaseId = fromEnv('NESTSCOUT_RELEASE_ID', 'EXPO_PUBLIC_RELEASE_ID', 'EXPO_PUBLIC_NESTSCOUT_RELEASE_ID')
const easBuildId = fromEnv('EAS_BUILD_ID')
const clientContractEpoch = resolveClientContractEpoch({
  buildReleaseId,
  easBuildId,
  gitSha: buildGitSha,
})
const runtimeBuildInfo = {
  builtAt: fromEnv('NESTSCOUT_BUILD_CREATED_AT', 'EAS_BUILD_CREATED_AT') || new Date().toISOString(),
  easBuildId,
  easBuildPlatform: fromEnv('EAS_BUILD_PLATFORM'),
  easBuildProfile: fromEnv('EAS_BUILD_PROFILE'),
  gitBranch: buildGitBranch,
  gitSha: buildGitSha,
  gitShortSha: buildGitSha ? buildGitSha.slice(0, 12) : '',
  releaseId: buildReleaseId,
  contractEpoch: clientContractEpoch,
  runtimeVersion: '0.2.0',
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  ...nativeArchitectureConfig,
  name: 'NestScout',
  slug: 'home-services',
  owner: 'nestscout',
  version: '0.2.0',
  runtimeVersion: { policy: 'appVersion' },
  orientation: 'portrait',
  icon: './assets/nestscout-aurora-nest-appstore-1024.png',
  userInterfaceStyle: 'automatic',
  scheme: 'nestscout',
  ios: {
    supportsTablet: false,
    buildNumber: '49',
    bundleIdentifier: 'com.phanmanhtu.homeservices',
    config: {
      usesNonExemptEncryption: false,
    },
    infoPlist: {
      CFBundleDisplayName: 'NestScout',
      ...iosPurposeStrings,
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/nestscout-aurora-nest-foreground-1024.png',
      backgroundColor: '#ffffff',
    },
    versionCode: 4,
    permissions: [],
    package: 'com.phanmanhtu.nestscout',
    ...(androidGoogleServicesFile ? { googleServicesFile: androidGoogleServicesFile } : {}),
  },
  plugins: [
    'expo-asset',
    'expo-image',
    [
      'expo-splash-screen',
      {
        image: './assets/prototypes/nestscout-logo-motion/nestscout-horizontal-lockup.png',
        imageWidth: 220,
        resizeMode: 'contain',
        backgroundColor: '#ffffff',
      },
    ],
    'expo-router',
    'expo-notifications',
    [
      'expo-audio',
      {
        enableBackgroundPlayback: false,
        microphonePermission: iosPurposeStrings.NSMicrophoneUsageDescription,
        recordAudioAndroid: false,
      },
    ],
    [
      'expo-speech-recognition',
      {
        microphonePermission: iosPurposeStrings.NSMicrophoneUsageDescription,
        speechRecognitionPermission:
          'NestScout dùng nhận dạng giọng nói trên thiết bị để tạo bản chép lời có thể chỉnh sửa.',
      },
    ],
    'expo-secure-store',
    'expo-status-bar',
    '@vietmap/vietmap-gl-react-native',
    [
      'expo-image-picker',
      {
        photosPermission: iosPurposeStrings.NSPhotoLibraryUsageDescription,
        cameraPermission: iosPurposeStrings.NSCameraUsageDescription,
      },
    ],
    [
      'expo-location',
      {
        locationWhenInUsePermission: iosPurposeStrings.NSLocationWhenInUseUsageDescription,
      },
    ],
  ],
  extra: {
    supabaseUrl,
    supabasePublishableKey,
    apiBaseUrl,
    vietmapDisplayKey,
    vietmapMapStyleUrl,
    mapProxyBaseUrl,
    iosPushNotificationsEnabled,
    stagingPaymentRailEnabled,
    runtimeBuildInfo,
    eas: {
      projectId: 'c2fd8ae7-a6fa-4b6e-a9a0-df85b52ac94b',
    },
  },
})
