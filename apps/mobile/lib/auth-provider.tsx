import { createContext, use, useCallback, useEffect, useMemo, useRef, useReducer } from 'react'
import * as ExpoLinking from 'expo-linking'
import { useRouter } from 'expo-router'
import { Linking, Platform } from 'react-native'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { USER_ROLES, type UserRole } from '@home-services/shared'
import { addPushNotificationResponseListener, setupPushNotifications } from './push-notifications'

type ProfileStatus = 'idle' | 'loading' | 'ready' | 'profile_missing' | 'profile_error' | 'config_missing'

type AuthState = {
  session: Session | null
  role: UserRole | null
  loading: boolean
  profileStatus: ProfileStatus
  authError: string | null
  signInWithGoogle: () => Promise<{ success: boolean; error?: string }>
  signInWithPassword: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  updateCustomerProfile: (profile: CustomerProfileDraft) => Promise<{ success: boolean; error?: string }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<UserRole | null>
}

type AuthSnapshot = Pick<AuthState, 'session' | 'role' | 'loading' | 'profileStatus' | 'authError'>

type CustomerProfileDraft = {
  defaultAddress?: string
  displayName?: string
  phone?: string
}

const INITIAL_AUTH_SNAPSHOT: AuthSnapshot = {
  session: null,
  role: null,
  loading: true,
  profileStatus: 'idle',
  authError: null,
}

const AuthContext = createContext<AuthState>({
  session: null,
  role: null,
  loading: true,
  profileStatus: 'idle',
  authError: null,
  signInWithGoogle: async () => ({ success: false, error: 'Đăng nhập Google chưa sẵn sàng' }),
  signInWithPassword: async () => ({ success: false, error: 'Đăng nhập chưa sẵn sàng' }),
  updateCustomerProfile: async () => ({ success: false, error: 'Lưu hồ sơ khách chưa sẵn sàng' }),
  signOut: async () => undefined,
  refreshProfile: async () => null,
})

function authSnapshotReducer(current: AuthSnapshot, patch: Partial<AuthSnapshot>): AuthSnapshot {
  return { ...current, ...patch }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const authValue = useAuthController()

  return (
    <AuthContext.Provider value={authValue}>
      {children}
    </AuthContext.Provider>
  )
}

function useAuthController(): AuthState {
  const { push: pushRoute } = useRouter()
  const [{ session, role, loading, profileStatus, authError }, patchAuth] = useReducer(authSnapshotReducer, INITIAL_AUTH_SNAPSHOT)
  const loadingRef = useRef(INITIAL_AUTH_SNAPSHOT.loading)
  const pushRegistrationKeyRef = useRef<string | null>(null)
  const sessionRef = useRef<Session | null>(INITIAL_AUTH_SNAPSHOT.session)

  const fetchRole = useCallback(async (userId: string): Promise<UserRole | null> => {
    if (!supabase) {
      patchAuth({ role: null, profileStatus: 'config_missing', loading: false })
      return null
    }

    patchAuth({ loading: true, profileStatus: 'loading', authError: null })

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle()

      if (error) {
        patchAuth({
          role: null,
          profileStatus: 'profile_error',
          authError: 'Không thể tải hồ sơ đăng nhập',
          loading: false,
        })
        return null
      }

      if (!data?.role) {
        patchAuth({
          role: null,
          profileStatus: 'profile_missing',
          authError: 'Tài khoản chưa có hồ sơ vai trò',
          loading: false,
        })
        return null
      }

      if (!USER_ROLES.includes(data.role as UserRole)) {
        patchAuth({
          role: null,
          profileStatus: 'profile_error',
          authError: 'Vai trò tài khoản không hợp lệ',
          loading: false,
        })
        return null
      }

      const nextRole = data.role as UserRole
      patchAuth({ role: nextRole, profileStatus: 'ready', loading: false })
      return nextRole
    } catch {
      patchAuth({
        role: null,
        profileStatus: 'profile_error',
        authError: 'Không thể tải hồ sơ đăng nhập',
        loading: false,
      })
      return null
    }
  }, [])

  const createSessionFromOAuthUrl = useCallback(async (url: string) => {
    const result = await createSessionFromOAuthCallback(url)
    if (result.error) {
      patchAuth({
        authError: result.error,
        loading: false,
        profileStatus: 'profile_error',
      })
      return null
    }

    if (!result.session?.user) return null
    patchAuth({ session: result.session })
    await fetchRole(result.session.user.id)
    return result.session
  }, [fetchRole])

  useEffect(() => {
    loadingRef.current = loading
    sessionRef.current = session
  }, [loading, session])

  useEffect(() => {
    const subscription = addPushNotificationResponseListener((path) => {
      pushRoute(path as never)
    })
    return () => subscription.remove()
  }, [pushRoute])

  useEffect(() => {
    if (!supabase || Platform.OS === 'web') return () => undefined
    return subscribeToOAuthCallbackUrls((url) => {
      void createSessionFromOAuthUrl(url)
    })
  }, [createSessionFromOAuthUrl])

  useEffect(() => {
    const userId = session?.user.id ?? null
    if (!userId || !role || profileStatus !== 'ready') {
      pushRegistrationKeyRef.current = null
      return
    }

    const registrationKey = `${userId}:${role}`
    if (pushRegistrationKeyRef.current === registrationKey) return
    pushRegistrationKeyRef.current = registrationKey
    void setupPushNotifications({ role }).then((result) => {
      if (result.status === 'error') {
        pushRegistrationKeyRef.current = null
      }
    })
  }, [profileStatus, role, session?.user.id])

  useEffect(() => {
    if (!supabase) {
      patchAuth({ session: null, role: null, profileStatus: 'config_missing', loading: false })
      return
    }

    const bootstrapTimeout = setTimeout(() => {
      if (!loadingRef.current) {
        return
      }

      patchAuth({
        session: sessionRef.current,
        role: null,
        profileStatus: 'profile_error',
        authError: 'Không thể tải phiên đăng nhập. Vui lòng thử lại.',
        loading: false,
      })
    }, Platform.OS === 'web' ? 900 : 7000)

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (session?.user) {
          patchAuth({ session })
          void fetchRole(session.user.id)
        } else {
          patchAuth({ session, role: null, profileStatus: 'idle', loading: false })
        }
      })
      .catch(() => {
        patchAuth({
          session: null,
          role: null,
          profileStatus: 'profile_error',
          authError: 'Không thể khôi phục phiên đăng nhập',
          loading: false,
        })
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        patchAuth({ session })
        void fetchRole(session.user.id)
      } else {
        patchAuth({ session, role: null, profileStatus: 'idle', authError: null, loading: false })
      }
    })

    return () => {
      clearTimeout(bootstrapTimeout)
      subscription.unsubscribe()
    }
  }, [fetchRole])

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      const error = 'Dịch vụ đăng nhập chưa sẵn sàng. Vui lòng thử lại sau.'
      patchAuth({ authError: error, profileStatus: 'config_missing', loading: false })
      return { success: false, error }
    }

    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail || !password) {
      const error = 'Nhập email và mật khẩu để tiếp tục'
      patchAuth({ authError: error })
      return { success: false, error }
    }
    if (!isValidEmail(normalizedEmail)) {
      const error = 'Email không hợp lệ'
      patchAuth({ authError: error })
      return { success: false, error }
    }

    patchAuth({ loading: true, authError: null })
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      })

      if (error || !data.session?.user) {
        const message = 'Email hoặc mật khẩu không đúng'
        patchAuth({
          session: null,
          role: null,
          profileStatus: 'idle',
          authError: message,
          loading: false,
        })
        return { success: false, error: message }
      }

      patchAuth({ session: data.session })
      const nextRole = await fetchRole(data.session.user.id)
      if (!nextRole) {
        return { success: false, error: 'Không thể tải vai trò tài khoản' }
      }

      return { success: true }
    } catch {
      const message = 'Không thể kết nối dịch vụ đăng nhập. Vui lòng thử lại sau.'
      patchAuth({
        session: null,
        role: null,
        profileStatus: 'profile_error',
        authError: message,
        loading: false,
      })
      return { success: false, error: message }
    }
  }, [fetchRole])

  const signInWithGoogle = useCallback(async () => {
    patchAuth({ loading: true, authError: null })
    const result = await startGoogleOAuthRequest()
    if (!result.success) {
      patchAuth({
        authError: result.error ?? 'Không thể mở đăng nhập Google. Vui lòng thử lại sau.',
        loading: false,
        profileStatus: result.configMissing ? 'config_missing' : profileStatus,
      })
      return result
    }

    if (Platform.OS !== 'web') patchAuth({ loading: false })
    return { success: true }
  }, [profileStatus])

  const updateCustomerProfile = useCallback(async (profile: CustomerProfileDraft) => {
    if (!supabase || !session?.user) {
      const error = 'Dịch vụ hồ sơ khách chưa sẵn sàng. Vui lòng thử lại sau.'
      patchAuth({ authError: error, loading: false })
      return { success: false, error }
    }

    const displayName = profile.displayName?.trim()
    const phone = profile.phone?.trim()
    const defaultAddress = profile.defaultAddress?.trim()
    const nextMetadata = {
      ...session.user.user_metadata,
      ...(displayName ? { full_name: displayName, name: displayName } : {}),
      ...(phone ? { phone_number: phone } : {}),
      ...(defaultAddress ? { default_address: defaultAddress } : {}),
    }

    patchAuth({ loading: true, authError: null })
    try {
      const { error } = await supabase.auth.updateUser({ data: nextMetadata })
      if (error) {
        const message = 'Không thể lưu hồ sơ khách. Vui lòng thử lại sau.'
        patchAuth({ authError: message, loading: false })
        return { success: false, error: message }
      }

      const { data } = await supabase.auth.getSession()
      patchAuth({ session: data.session ?? session, loading: false })
      return { success: true }
    } catch {
      const message = 'Không thể kết nối dịch vụ hồ sơ. Vui lòng thử lại sau.'
      patchAuth({ authError: message, loading: false })
      return { success: false, error: message }
    }
  }, [session])

  const signOut = useCallback(async () => {
    try {
      if (supabase) {
        await supabase.auth.signOut({ scope: 'local' })
      }
    } catch {
      // Local auth state still needs to clear when the remote sign-out request fails.
    }
    patchAuth({
      session: null,
      role: null,
      profileStatus: 'idle',
      authError: null,
      loading: false,
    })
  }, [])

  const refreshProfile = useCallback(async () => {
    if (!session?.user) {
      patchAuth({ role: null, profileStatus: 'idle' })
      return null
    }

    return fetchRole(session.user.id)
  }, [fetchRole, session?.user])

  const authValue = useMemo(
    () => ({ session, role, loading, profileStatus, authError, signInWithGoogle, signInWithPassword, updateCustomerProfile, signOut, refreshProfile }),
    [authError, loading, profileStatus, refreshProfile, role, session, signInWithGoogle, signInWithPassword, signOut, updateCustomerProfile],
  )

  return authValue
}

export function useAuth() {
  return use(AuthContext)
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function getOAuthRedirectUrl() {
  const runtime = globalThis as typeof globalThis & { location?: { origin?: string } }
  if (Platform.OS === 'web' && runtime.location?.origin) return `${runtime.location.origin}/`
  return ExpoLinking.createURL('/')
}

function subscribeToOAuthCallbackUrls(onUrl: (url: string) => void) {
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

async function startGoogleOAuthRequest(): Promise<{ success: boolean; error?: string; configMissing?: boolean }> {
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
        redirectTo: getOAuthRedirectUrl(),
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

async function createSessionFromOAuthCallback(url: string): Promise<{ session: Session | null; error?: string }> {
  if (!supabase) return { session: null }
  const params = extractOAuthParamsFromUrl(url)
  if (params.error_code || params.error) {
    return { session: null, error: 'Không thể hoàn tất đăng nhập Google. Vui lòng thử lại sau.' }
  }

  try {
    if (params.access_token && params.refresh_token) {
      const { data, error } = await supabase.auth.setSession({
        access_token: params.access_token,
        refresh_token: params.refresh_token,
      })
      if (error || !data.session) throw error
      return { session: data.session }
    }

    if (params.code) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(params.code)
      if (error || !data.session) throw error
      return { session: data.session }
    }
  } catch {
    return { session: null, error: 'Không thể hoàn tất đăng nhập Google. Vui lòng thử lại sau.' }
  }

  return { session: null }
}

function extractOAuthParamsFromUrl(url: string) {
  const [, fragment = ''] = url.split('#')
  const query = url.includes('?') ? url.slice(url.indexOf('?') + 1).split('#')[0] : ''
  const search = new URLSearchParams([query, fragment].filter(Boolean).join('&'))
  return {
    access_token: search.get('access_token') ?? undefined,
    code: search.get('code') ?? undefined,
    error: search.get('error') ?? undefined,
    error_code: search.get('error_code') ?? undefined,
    refresh_token: search.get('refresh_token') ?? undefined,
  }
}
