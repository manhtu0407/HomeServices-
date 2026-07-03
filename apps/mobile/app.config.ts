import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { isAbsolute, resolve } from 'node:path'
import type { ExpoConfig, ConfigContext } from 'expo/config'
import { withEntitlementsPlist, withXcodeProject, type ConfigPlugin } from 'expo/config-plugins'

const configDir = __dirname
const repoRoot = resolve(configDir, '../..')

const explicitEnvFiles = (process.env.NESTSCOUT_MOBILE_ENV_FILE ?? '')
  .split(/[;,\n]/)
  .map((value: string) => value.trim())
  .filter(Boolean)
  .map((filePath: string) => (isAbsolute(filePath) ? filePath : resolve(repoRoot, filePath)))

const localEnv = [
  resolve(repoRoot, '.env'),
  resolve(repoRoot, '.env.local'),
  resolve(configDir, '.env'),
  resolve(configDir, '.env.local'),
  ...explicitEnvFiles,
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

const supabaseUrl = fromEnv('EXPO_PUBLIC_SUPABASE_URL')
const supabasePublishableKey = fromEnv('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
const configuredApiBaseUrl = fromEnv('EXPO_PUBLIC_API_BASE_URL')
const apiBaseUrl =
  configuredApiBaseUrl || (supabaseUrl ? `${supabaseUrl.replace(/\/$/, '')}/functions/v1/mobile-api` : '')
const buildGitSha = fromEnv('NESTSCOUT_BUILD_GIT_SHA', 'EAS_BUILD_GIT_COMMIT_HASH', 'GITHUB_SHA') || fromGit('rev-parse', 'HEAD')
const buildGitBranch = fromEnv('NESTSCOUT_BUILD_GIT_BRANCH', 'EAS_BUILD_GIT_COMMIT_REF', 'GITHUB_REF_NAME') || fromGit('rev-parse', '--abbrev-ref', 'HEAD')
const runtimeBuildInfo = {
  builtAt: fromEnv('NESTSCOUT_BUILD_CREATED_AT', 'EAS_BUILD_CREATED_AT') || new Date().toISOString(),
  easBuildId: fromEnv('EAS_BUILD_ID'),
  easBuildPlatform: fromEnv('EAS_BUILD_PLATFORM'),
  easBuildProfile: fromEnv('EAS_BUILD_PROFILE'),
  gitBranch: buildGitBranch,
  gitSha: buildGitSha,
  gitShortSha: buildGitSha ? buildGitSha.slice(0, 12) : '',
}

const withoutIosPushEntitlement: ConfigPlugin = (expoConfig) => {
  const configWithoutEntitlement = withEntitlementsPlist(expoConfig, (config) => {
    delete config.modResults['aps-environment']
    return config
  })

  return withXcodeProject(configWithoutEntitlement, (config) => {
    const project = config.modResults
    const projectAttributes = project.getFirstProject()?.firstProject?.attributes as
      | { TargetAttributes?: Record<string, { SystemCapabilities?: Record<string, unknown> }> }
      | undefined

    const targetAttributes = projectAttributes?.TargetAttributes
    if (targetAttributes) {
      for (const attributes of Object.values(targetAttributes)) {
        delete attributes.SystemCapabilities?.['com.apple.Push']
      }
    }

    return config
  })
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'NestScout',
  slug: 'nestscout',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/nestscout-aurora-nest-appstore-1024.png',
  userInterfaceStyle: 'automatic',
  newArchEnabled: true,
  scheme: 'nestscout',
  splash: {
    image: './assets/nestscout-aurora-nest-appstore-1024.png',
    resizeMode: 'contain',
    backgroundColor: '#ffffff',
  },
  ios: {
    supportsTablet: false,
    buildNumber: '1',
    bundleIdentifier: 'com.phanmanhtu.nestscout',
    config: {
      usesNonExemptEncryption: false,
    },
    infoPlist: {
      NSCameraUsageDescription:
        'NestScout cần quyền camera nếu bạn muốn chụp hiện trạng sửa chữa hoặc giấy tờ xác minh.',
      NSMicrophoneUsageDescription:
        'NestScout cần quyền micro nếu bạn muốn ghi chú giọng nói cho Kael phân tích ca dịch vụ.',
      NSPhotoLibraryUsageDescription:
        'NestScout cần quyền chọn ảnh hoặc video để bạn mô tả tình trạng sửa chữa hoặc gửi hồ sơ xác minh.',
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: './assets/nestscout-aurora-nest-appstore-1024.png',
      backgroundColor: '#ffffff',
    },
    versionCode: 1,
    permissions: [],
    blockedPermissions: ['android.permission.RECORD_AUDIO'],
    edgeToEdgeEnabled: true,
    package: 'com.phanmanhtu.nestscout',
  },
  plugins: [
    'expo-router',
    [
      'expo-audio',
      {
        microphonePermission:
          'NestScout cần quyền micro nếu bạn muốn ghi chú giọng nói cho Kael phân tích ca dịch vụ.',
        recordAudioAndroid: false,
      },
    ],
    'expo-secure-store',
    [
      'expo-image-picker',
      {
        photosPermission:
          'NestScout cần quyền chọn ảnh hoặc video để bạn mô tả tình trạng sửa chữa.',
        cameraPermission:
          'NestScout cần quyền camera nếu bạn muốn chụp hiện trạng sửa chữa.',
      },
    ],
    withoutIosPushEntitlement as unknown as string,
  ],
  extra: {
    supabaseUrl,
    supabasePublishableKey,
    apiBaseUrl,
    runtimeBuildInfo,
    eas: {
      projectId: 'df74d6a3-f85b-4b40-85ef-fe3162023d6e',
    },
  },
})
