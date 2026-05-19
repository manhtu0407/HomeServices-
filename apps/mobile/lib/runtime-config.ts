import Constants from 'expo-constants'

type ExpoExtra = Record<string, unknown>

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

function envString(...keys: string[]) {
  for (const key of keys) {
    const value = runtimeProcess.process?.env?.[key]
    if (value && value.trim().length > 0) return value.trim()
  }
  return ''
}

const supabaseUrl = extraString('supabaseUrl') || envString('EXPO_PUBLIC_SUPABASE_URL')
const supabasePublishableKey = extraString('supabasePublishableKey') || envString('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY')
const configuredApiBaseUrl = extraString('apiBaseUrl') || envString('EXPO_PUBLIC_API_BASE_URL')

export const mobileRuntimeConfig = {
  apiBaseUrl: configuredApiBaseUrl || (supabaseUrl ? `${supabaseUrl.replace(/\/$/, '')}/functions/v1/mobile-api` : ''),
  supabasePublishableKey,
  supabaseUrl,
}
