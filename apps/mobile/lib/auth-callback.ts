import * as ExpoLinking from 'expo-linking'
import { Platform } from 'react-native'

function getAuthRedirectUrl() {
  const runtime = globalThis as typeof globalThis & { location?: { origin?: string } }
  if (Platform.OS === 'web' && runtime.location?.origin) return `${runtime.location.origin}/`
  try {
    return ExpoLinking.createURL('/') || 'nestscout:///'
  } catch {
    return 'nestscout:///'
  }
}

export function getPasswordRecoveryRedirectUrl() {
  const redirectUrl = getAuthRedirectUrl()
  const separator = redirectUrl.includes('?') ? '&' : '?'
  return `${redirectUrl}${separator}auth_flow=password-recovery`
}

export function getEmailConfirmationRedirectUrl() {
  return getAuthRedirectUrl()
}

export function getRuntimeAuthCallbackUrl() {
  if (Platform.OS !== 'web') return null
  const runtime = globalThis as typeof globalThis & { location?: { href?: string } }
  return runtime.location?.href ?? null
}

export function isPasswordRecoveryCallbackUrl(url: string | null | undefined) {
  if (!url) return false
  const params = extractAuthCallbackParams(url)
  return params.type === 'recovery' || params.auth_flow === 'password-recovery'
}

function extractAuthCallbackParams(url: string) {
  const [, fragment = ''] = url.split('#')
  const query = url.includes('?') ? url.slice(url.indexOf('?') + 1).split('#')[0] : ''
  const search = new URLSearchParams([query, fragment].filter(Boolean).join('&'))
  return {
    access_token: search.get('access_token') ?? undefined,
    auth_flow: search.get('auth_flow') ?? undefined,
    code: search.get('code') ?? undefined,
    error: search.get('error') ?? undefined,
    error_code: search.get('error_code') ?? undefined,
    refresh_token: search.get('refresh_token') ?? undefined,
    type: search.get('type') ?? undefined,
  }
}
