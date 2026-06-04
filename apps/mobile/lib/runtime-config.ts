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

// Expo web injects EXPO_PUBLIC_* into the JS runtime even when a stale
// Constants.extra payload was baked when the dev server started. Prefer the
// runtime env so local previews do not accidentally point at placeholder
// Supabase config, while native builds still fall back to app.config extra.
const supabaseUrl = envString('EXPO_PUBLIC_SUPABASE_URL') || extraString('supabaseUrl')
const supabasePublishableKey = envString('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY') || extraString('supabasePublishableKey')
const configuredApiBaseUrl = envString('EXPO_PUBLIC_API_BASE_URL') || extraString('apiBaseUrl')

export const mobileRuntimeConfig = {
  apiBaseUrl: configuredApiBaseUrl || (supabaseUrl ? `${supabaseUrl.replace(/\/$/, '')}/functions/v1/mobile-api` : ''),
  supabasePublishableKey,
  supabaseUrl,
}
