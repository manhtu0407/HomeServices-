import Constants from 'expo-constants'
import { resolveMobilePublicAuthEnv } from '../config/public-auth-env'

type ExpoExtra = Record<string, unknown>
type RuntimeBuildInfo = {
  builtAt: string
  easBuildId: string
  easBuildPlatform: string
  easBuildProfile: string
  gitBranch: string
  gitSha: string
  gitShortSha: string
  releaseId: string
  contractEpoch: string
  runtimeVersion: string
}

const runtimeProcess = globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> }
}

const manifestExtra = Constants.expoConfig?.extra ??
  (Constants as unknown as { manifest?: { extra?: ExpoExtra } }).manifest?.extra ??
  (Constants as unknown as { manifest2?: { extra?: { expoClient?: { extra?: ExpoExtra } } } }).manifest2?.extra?.expoClient?.extra ??
  {}

function extraString(key: string) {
  const value = (manifestExtra as ExpoExtra)[key]
  return typeof value === 'string' ? value.trim() : ''
}

function extraRecord(key: string) {
  const value = (manifestExtra as ExpoExtra)[key]
  return value && typeof value === 'object' && !Array.isArray(value) ? value as ExpoExtra : {}
}

function extraBoolean(key: string) {
  return (manifestExtra as ExpoExtra)[key] === true
}

function recordString(record: ExpoExtra, key: string) {
  const value = record[key]
  return typeof value === 'string' ? value.trim() : ''
}

function envString(...keys: string[]) {
  for (const key of keys) {
    const value = runtimeProcess.process?.env?.[key]
    if (value && value.trim().length > 0) return value.trim()
  }
  return ''
}

const PRODUCTION_PROJECT_REF = 'iwevizmsedyqozxlawwl'
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '0.0.0.0', 'host.docker.internal'])

function assertRuntimeTargets(supabaseValue: string, apiValue: string) {
  if (!supabaseValue && !apiValue) return true
  if (!supabaseValue || !apiValue) {
    throw new Error('Mobile runtime requires both Supabase and mobile-api targets.')
  }

  let supabase: URL
  let api: URL
  try {
    supabase = new URL(supabaseValue)
    api = new URL(apiValue)
  } catch {
    throw new Error('Mobile runtime Supabase targets are invalid.')
  }

  const localSupabase = LOCAL_HOSTS.has(supabase.hostname)
  const localApi = LOCAL_HOSTS.has(api.hostname)
  const supabasePath = supabase.pathname.replace(/\/+$/, '') || '/'
  const apiPath = api.pathname.replace(/\/+$/, '') || '/'
  if (
    !['http:', 'https:'].includes(supabase.protocol) ||
    !['http:', 'https:'].includes(api.protocol) ||
    supabase.username || supabase.password || supabase.search || supabase.hash ||
    api.username || api.password || api.search || api.hash ||
    supabasePath !== '/' || apiPath !== '/functions/v1/mobile-api' ||
    localSupabase !== localApi || supabase.origin !== api.origin
  ) {
    throw new Error('Mobile runtime Supabase and mobile-api targets must share one exact origin and path.')
  }
  if (localSupabase) return true
  if (
    supabase.protocol !== 'https:' ||
    supabase.hostname !== `${PRODUCTION_PROJECT_REF}.supabase.co` ||
    api.protocol !== 'https:'
  ) {
    throw new Error('Only the registered Production Supabase backend is available; this target is locked.')
  }
  return false
}

// Expo web injects EXPO_PUBLIC_* into the JS runtime even when a stale
// Constants.extra payload was baked when the dev server started. Prefer the
// runtime env so local previews do not accidentally point at placeholder
// Supabase config, while native builds still fall back to app.config extra.
const runtimePublicAuthEnv = resolveMobilePublicAuthEnv(runtimeProcess.process?.env ?? {})
const supabaseUrl = runtimePublicAuthEnv.supabaseUrl || extraString('supabaseUrl')
const supabasePublishableKey = runtimePublicAuthEnv.supabasePublishableKey || extraString('supabasePublishableKey')
const configuredApiBaseUrl = envString('EXPO_PUBLIC_API_BASE_URL') || extraString('apiBaseUrl')
const apiBaseUrl = configuredApiBaseUrl || (supabaseUrl ? `${supabaseUrl.replace(/\/$/, '')}/functions/v1/mobile-api` : '')
const isLocalRuntime = assertRuntimeTargets(supabaseUrl, apiBaseUrl)
const stagingPaymentRailRequested = ['1', 'true', 'yes', 'on'].includes(
  envString('EXPO_PUBLIC_STAGING_PAYMENT_RAIL_ENABLED').toLowerCase(),
) || extraBoolean('stagingPaymentRailEnabled')
const stagingPaymentRailEnabled = isLocalRuntime && stagingPaymentRailRequested
const webPreviewClientEnabled = process.env.EXPO_PUBLIC_WEB_PREVIEW_CLIENT === 'true'
const runtimeBuildInfoExtra = extraRecord('runtimeBuildInfo')
const runtimeBuildInfo: RuntimeBuildInfo = {
  builtAt: envString('EXPO_PUBLIC_NESTSCOUT_BUILD_CREATED_AT') || recordString(runtimeBuildInfoExtra, 'builtAt'),
  easBuildId: envString('EXPO_PUBLIC_NESTSCOUT_EAS_BUILD_ID') || recordString(runtimeBuildInfoExtra, 'easBuildId'),
  easBuildPlatform: envString('EXPO_PUBLIC_NESTSCOUT_EAS_BUILD_PLATFORM') || recordString(runtimeBuildInfoExtra, 'easBuildPlatform'),
  easBuildProfile: envString('EXPO_PUBLIC_NESTSCOUT_EAS_BUILD_PROFILE') || recordString(runtimeBuildInfoExtra, 'easBuildProfile'),
  gitBranch: envString('EXPO_PUBLIC_NESTSCOUT_GIT_BRANCH') || recordString(runtimeBuildInfoExtra, 'gitBranch'),
  gitSha: envString('EXPO_PUBLIC_NESTSCOUT_GIT_SHA') || recordString(runtimeBuildInfoExtra, 'gitSha'),
  gitShortSha: envString('EXPO_PUBLIC_NESTSCOUT_GIT_SHORT_SHA') || recordString(runtimeBuildInfoExtra, 'gitShortSha'),
  releaseId: envString('EXPO_PUBLIC_RELEASE_ID', 'EXPO_PUBLIC_NESTSCOUT_RELEASE_ID') || recordString(runtimeBuildInfoExtra, 'releaseId'),
  contractEpoch: recordString(runtimeBuildInfoExtra, 'contractEpoch'),
  runtimeVersion: recordString(runtimeBuildInfoExtra, 'runtimeVersion'),
}

export const mobileRuntimeConfig = {
  apiBaseUrl,
  webPreviewClientEnabled,
  runtimeBuildInfo,
  stagingPaymentRailEnabled,
  supabasePublishableKey,
  supabaseUrl,
}
