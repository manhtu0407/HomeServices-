import * as ExpoLinking from 'expo-linking'
import type { Session } from '@supabase/supabase-js'
import { Linking, Platform } from 'react-native'
import { supabase } from './supabase'

export function getAuthRedirectUrl() {
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

export function subscribeToAuthCallbackUrls(onUrl: (url: string) => void) {
  let cancelled = false
  const handleUrl = (url: string | null) => {
    if (cancelled || !url) return
    onUrl(url)
  }

  Linking.getInitialURL().then(handleUrl).catch(() => undefined)
  const subscription = Linking.addEventListener('url', ({ url }) => handleUrl(url))
  return () => {
    cancelled = true
    subscription.remove()
  }
}

export async function startGoogleOAuthRequest(): Promise<{ success: boolean; error?: string; configMissing?: boolean }> {
  if (!supabase) {
    return {
      success: false,
      configMissing: true,
      error: 'Dịch vụ đăng nhập chưa sẵn sàng. Vui lòng thử lại sau.',
    }
  }

  try {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getAuthRedirectUrl(),
        skipBrowserRedirect: Platform.OS !== 'web',
      },
    })

    if (error || (Platform.OS !== 'web' && !data.url)) {
      return { success: false, error: 'Không thể mở đăng nhập Google. Vui lòng thử lại sau.' }
    }

    if (Platform.OS !== 'web') await Linking.openURL(data.url)
    return { success: true }
  } catch {
    return { success: false, error: 'Không thể kết nối đăng nhập Google. Vui lòng thử lại sau.' }
  }
}

export async function createSessionFromAuthCallback(url: string): Promise<{ session: Session | null; error?: string; recovery: boolean }> {
  const recovery = isPasswordRecoveryCallbackUrl(url)
  if (!supabase) return { session: null, recovery }
  const params = extractAuthCallbackParams(url)
  if (params.error_code || params.error) {
    return { session: null, error: 'Không thể hoàn tất xác thực. Vui lòng thử lại sau.', recovery }
  }

  try {
    if (params.access_token && params.refresh_token) {
      const { data, error } = await supabase.auth.setSession({
        access_token: params.access_token,
        refresh_token: params.refresh_token,
      })
      if (error || !data.session) throw error
      return { session: data.session, recovery }
    }

    if (params.code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(params.code)
      if (error || !data.session) throw error
      return { session: data.session, recovery }
    }
  } catch {
    return { session: null, error: 'Không thể hoàn tất xác thực. Vui lòng thử lại sau.', recovery }
  }

  return { session: null, recovery }
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
