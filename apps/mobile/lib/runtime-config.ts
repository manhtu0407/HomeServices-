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

// Expo web injects EXPO_PUBLIC_* into the JS runtime even when a stale
// Constants.extra payload was baked when the dev server started. Prefer the
// runtime env so local previews do not accidentally point at placeholder
// Supabase config, while native builds still fall back to app.config extra.
const runtimePublicAuthEnv = resolveMobilePublicAuthEnv(runtimeProcess.process?.env ?? {})
const supabaseUrl = runtimePublicAuthEnv.supabaseUrl || extraString('supabaseUrl')
const supabasePublishableKey = runtimePublicAuthEnv.supabasePublishableKey || extraString('supabasePublishableKey')
const configuredApiBaseUrl = envString('EXPO_PUBLIC_API_BASE_URL') || extraString('apiBaseUrl')
const stagingPaymentRailEnabled = ['1', 'true', 'yes', 'on'].includes(
  envString('EXPO_PUBLIC_STAGING_PAYMENT_RAIL_ENABLED').toLowerCase(),
) || extraBoolean('stagingPaymentRailEnabled')
const runtimeBuildInfoExtra = extraRecord('runtimeBuildInfo')
const runtimeBuildInfo: RuntimeBuildInfo = {
  builtAt: envString('EXPO_PUBLIC_NESTSCOUT_BUILD_CREATED_AT') || recordString(runtimeBuildInfoExtra, 'builtAt'),
  easBuildId: envString('EXPO_PUBLIC_NESTSCOUT_EAS_BUILD_ID') || recordString(runtimeBuildInfoExtra, 'easBuildId'),
  easBuildPlatform: envString('EXPO_PUBLIC_NESTSCOUT_EAS_BUILD_PLATFORM') || recordString(runtimeBuildInfoExtra, 'easBuildPlatform'),
  easBuildProfile: envString('EXPO_PUBLIC_NESTSCOUT_EAS_BUILD_PROFILE') || recordString(runtimeBuildInfoExtra, 'easBuildProfile'),
  gitBranch: envString('EXPO_PUBLIC_NESTSCOUT_GIT_BRANCH') || recordString(runtimeBuildInfoExtra, 'gitBranch'),
  gitSha: envString('EXPO_PUBLIC_NESTSCOUT_GIT_SHA') || recordString(runtimeBuildInfoExtra, 'gitSha'),
  gitShortSha: envString('EXPO_PUBLIC_NESTSCOUT_GIT_SHORT_SHA') || recordString(runtimeBuildInfoExtra, 'gitShortSha'),
}

export const mobileRuntimeConfig = {
  apiBaseUrl: configuredApiBaseUrl || (supabaseUrl ? `${supabaseUrl.replace(/\/$/, '')}/functions/v1/mobile-api` : ''),
  runtimeBuildInfo,
  stagingPaymentRailEnabled,
  supabasePublishableKey,
  supabaseUrl,
}
