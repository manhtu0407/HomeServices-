import * as ExpoLinking from 'expo-linking'
import type { Session } from '@supabase/supabase-js'
import { Linking, Platform } from 'react-native'
import { isTrustedOAuthAuthorizationUrl } from './oauth-callback'
import { mobileRuntimeConfig } from './runtime-config'
import { supabase } from './supabase'

export function getOAuthRedirectUrl() {
  const runtime = globalThis as typeof globalThis & { location?: { origin?: string } }
  if (Platform.OS === 'web' && runtime.location?.origin) return `${runtime.location.origin}/`
  return ExpoLinking.createURL('/')
}

export function subscribeToOAuthCallbackUrls(onUrl: (url: string) => Promise<unknown>) {
  let cancelled = false
  let liveUrlReceived = false
  let processingUrl: string | null = null
  let queuedUrl: string | null = null
  let lastProcessedUrl: string | null = null

  const processUrl = async (url: string) => {
    processingUrl = url
    try {
      await onUrl(url)
    } catch {
      // The auth controller owns the safe user-facing error state.
    } finally {
      lastProcessedUrl = url
      processingUrl = null
      const nextUrl = queuedUrl
      queuedUrl = null
      if (!cancelled && nextUrl && nextUrl !== url) void processUrl(nextUrl)
    }
  }
  const handleUrl = (url: string | null) => {
    if (cancelled || !url) return
    if (url === lastProcessedUrl || url === queuedUrl) return
    if (processingUrl) {
      if (url !== processingUrl) queuedUrl = url
      return
    }
    void processUrl(url)
  }

  const subscription = Linking.addEventListener('url', ({ url }) => {
    liveUrlReceived = true
    handleUrl(url)
  })
  Linking.getInitialURL()
    .then((url) => {
      if (!liveUrlReceived) handleUrl(url)
    })
    .catch(() => undefined)
  return () => {
    cancelled = true
    queuedUrl = null
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
    const redirectUrl = getOAuthRedirectUrl()
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        skipBrowserRedirect: Platform.OS !== 'web',
      },
    })

    if (error || (Platform.OS !== 'web' && !data.url)) {
      return { success: false, error: 'Không thể mở đăng nhập Google. Vui lòng thử lại sau.' }
    }

    if (
      Platform.OS !== 'web'
      && !isTrustedOAuthAuthorizationUrl(data.url, mobileRuntimeConfig.supabaseUrl, redirectUrl)
    ) {
      return { success: false, error: 'Không thể mở đăng nhập Google. Vui lòng thử lại sau.' }
    }
    if (Platform.OS !== 'web') await Linking.openURL(data.url)
    return { success: true }
  } catch {
    return { success: false, error: 'Không thể kết nối đăng nhập Google. Vui lòng thử lại sau.' }
  }
}

export async function exchangeOAuthCodeForSession(code: string): Promise<{ session: Session | null; error?: string }> {
  if (!supabase) return { session: null }

  try {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (error || !data.session) throw error
    return { session: data.session }
  } catch {
    return { session: null, error: 'Không thể hoàn tất đăng nhập Google. Vui lòng thử lại sau.' }
  }
}
