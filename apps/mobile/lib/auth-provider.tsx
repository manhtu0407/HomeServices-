import { createContext, use, useCallback, useEffect, useMemo, useRef, useReducer, useState } from 'react'
import * as ExpoLinking from 'expo-linking'
import { useRouter } from 'expo-router'
import { Linking, Platform } from 'react-native'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { USER_ROLES, type UserRole } from '@nestscout/shared'
import { addPushNotificationResponseListener, setupPushNotifications } from './push-notifications'
import { generateClientRequestId } from './client-request-id'
import { workerService } from './services'

type ProfileStatus = 'idle' | 'loading' | 'ready' | 'profile_missing' | 'profile_error' | 'config_missing'

type AuthState = {
  session: Session | null
  role: UserRole | null
  guestMode: boolean
  loading: boolean
  profileStatus: ProfileStatus
  authError: string | null
  enterGuestMode: () => void
  signInWithGoogle: () => Promise<{ success: boolean; error?: string }>
  signInWithPassword: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  signUpWithEmail: (profile: CustomerEmailSignupDraft) => Promise<{ success: boolean; error?: string; needsConfirmation?: boolean }>
  submitWorkerApplication: (draft: WorkerApplicationDraft) => Promise<{ success: boolean; error?: string; applicationId?: string }>
  updateCustomerProfile: (profile: CustomerProfileDraft) => Promise<{ success: boolean; error?: string }>
  updatePassword: (passwords: CustomerPasswordUpdateDraft) => Promise<{ success: boolean; error?: string }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<UserRole | null>
}

type AuthSnapshot = Pick<AuthState, 'session' | 'role' | 'loading' | 'profileStatus' | 'authError'>

type CustomerProfileDraft = {
  birthDate?: string
  defaultAddress?: string
  displayName?: string
  email?: string
  fullName?: string
  gender?: string
  nickname?: string
  phone?: string
  salutation?: string
  savedAddresses?: string[]
}

type CustomerEmailSignupDraft = {
  displayName: string
  email: string
  password: string
}

type WorkerApplicationDraft = {
  contact: string
  language: 'vi' | 'en'
}

type CustomerPasswordUpdateDraft = {
  currentPassword: string
  newPassword: string
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
  guestMode: false,
  loading: true,
  profileStatus: 'idle',
  authError: null,
  enterGuestMode: () => undefined,
  signInWithGoogle: async () => ({ success: false, error: 'Đăng nhập Google chưa sẵn sàng' }),
  signInWithPassword: async () => ({ success: false, error: 'Đăng nhập chưa sẵn sàng' }),
  signUpWithEmail: async () => ({ success: false, error: 'Đăng ký email chưa sẵn sàng' }),
  submitWorkerApplication: async () => ({ success: false, error: 'Gửi xét duyệt thợ chưa sẵn sàng' }),
  updateCustomerProfile: async () => ({ success: false, error: 'Lưu hồ sơ khách chưa sẵn sàng' }),
  updatePassword: async () => ({ success: false, error: 'Đổi mật khẩu chưa sẵn sàng' }),
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
  const localVisualAuditRole = getLocalVisualAuditRole()
  const localVisualAuditSnapshot = useMemo<AuthSnapshot | null>(() => {
    if (!localVisualAuditRole) return null
    return {
      session: buildLocalVisualAuditSession(localVisualAuditRole),
      role: localVisualAuditRole,
      loading: false,
      profileStatus: 'ready',
      authError: null,
    }
  }, [localVisualAuditRole])
  const { push: pushRoute } = useRouter()
  const [{ session, role, loading, profileStatus, authError }, patchAuth] = useReducer(authSnapshotReducer, localVisualAuditSnapshot ?? INITIAL_AUTH_SNAPSHOT)
  const [guestMode, setGuestMode] = useState(false)
  const loadingRef = useRef(INITIAL_AUTH_SNAPSHOT.loading)
  const pushRegistrationKeyRef = useRef<string | null>(null)
  const sessionRef = useRef<Session | null>(INITIAL_AUTH_SNAPSHOT.session)

  const fetchRole = useCallback(async (userId: string): Promise<UserRole | null> => {
    if (localVisualAuditRole) {
      patchAuth({ role: localVisualAuditRole, profileStatus: 'ready', loading: false })
      return localVisualAuditRole
    }

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
    setGuestMode(false)
    patchAuth({ session: result.session })
    await fetchRole(result.session.user.id)
    return result.session
  }, [fetchRole])

  useEffect(() => {
    loadingRef.current = loading
    sessionRef.current = session
  }, [loading, session])

  useEffect(() => {
    if (localVisualAuditRole) return () => undefined

    const subscription = addPushNotificationResponseListener((path) => {
      pushRoute(path as never)
    })
    return () => subscription.remove()
  }, [localVisualAuditRole, pushRoute])

  useEffect(() => {
    if (localVisualAuditRole) return () => undefined
    if (!supabase || Platform.OS === 'web') return () => undefined
    return subscribeToOAuthCallbackUrls((url) => {
      void createSessionFromOAuthUrl(url)
    })
  }, [createSessionFromOAuthUrl, localVisualAuditRole])

  useEffect(() => {
    if (localVisualAuditRole) return

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
  }, [localVisualAuditRole, profileStatus, role, session?.user.id])

  useEffect(() => {
    if (localVisualAuditSnapshot) {
      patchAuth(localVisualAuditSnapshot)
      return () => undefined
    }

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
          setGuestMode(false)
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
        setGuestMode(false)
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
  }, [fetchRole, localVisualAuditSnapshot])

  const enterGuestMode = useCallback(() => {
    setGuestMode(true)
    patchAuth({
      session: null,
      role: null,
      profileStatus: 'idle',
      authError: null,
      loading: false,
    })
  }, [])

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

      setGuestMode(false)
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
    setGuestMode(false)
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

  const signUpWithEmail = useCallback(async ({ displayName, email, password }: CustomerEmailSignupDraft) => {
    setGuestMode(false)
    if (!supabase) {
      const error = 'Dịch vụ đăng ký chưa sẵn sàng. Vui lòng thử lại sau.'
      patchAuth({ authError: error, profileStatus: 'config_missing', loading: false })
      return { success: false, error }
    }

    const normalizedEmail = email.trim().toLowerCase()
    const normalizedName = displayName.trim().replace(/\s+/g, ' ')
    if (normalizedName.length < 2) {
      const error = 'Nhập họ tên để tạo tài khoản'
      patchAuth({ authError: error })
      return { success: false, error }
    }
    if (!normalizedEmail || !password) {
      const error = 'Nhập email và mật khẩu để đăng ký'
      patchAuth({ authError: error })
      return { success: false, error }
    }
    if (!isValidEmail(normalizedEmail)) {
      const error = 'Email không hợp lệ'
      patchAuth({ authError: error })
      return { success: false, error }
    }
    if (password.length < 6) {
      const error = 'Mật khẩu cần ít nhất 6 ký tự'
      patchAuth({ authError: error })
      return { success: false, error }
    }

    patchAuth({ loading: true, authError: null })
    try {
      const { data, error } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            full_name: normalizedName,
            name: normalizedName,
          },
        },
      })

      if (error || !data.user) {
        const message = 'Không thể tạo tài khoản. Vui lòng thử lại sau.'
        patchAuth({ authError: message, loading: false, profileStatus: 'idle' })
        return { success: false, error: message }
      }

      if (!data.session?.user) {
        patchAuth({ loading: false, profileStatus: 'idle' })
        return { success: true, needsConfirmation: true }
      }

      setGuestMode(false)
      patchAuth({ session: data.session })
      const nextRole = await fetchRole(data.session.user.id)
      if (!nextRole) {
        return { success: false, error: 'Không thể tải vai trò tài khoản' }
      }

      return { success: true }
    } catch {
      const message = 'Không thể kết nối dịch vụ đăng ký. Vui lòng thử lại sau.'
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

  const submitWorkerApplication = useCallback(async ({ contact, language }: WorkerApplicationDraft) => {
    const normalizedContact = contact.trim()
    if (!normalizedContact) {
      return { success: false, error: 'Nhập email hoặc số điện thoại để gửi xét duyệt.' }
    }

    try {
      const result = await workerService.submitApplication({
        contact: normalizedContact,
        language,
        source: 'auth_worker_create',
        client_request_id: generateClientRequestId(),
      })
      if (!result.success) {
        return { success: false, error: result.error }
      }
      return { success: true, applicationId: result.data.application_id }
    } catch {
      return { success: false, error: 'Không thể gửi xét duyệt lúc này. Vui lòng thử lại.' }
    }
  }, [localVisualAuditRole])

  const updateCustomerProfile = useCallback(async (profile: CustomerProfileDraft) => {
    if (!supabase || !session?.user) {
      const error = 'Dịch vụ hồ sơ khách chưa sẵn sàng. Vui lòng thử lại sau.'
      patchAuth({ authError: error, loading: false })
      return { success: false, error }
    }

    const birthDate = profile.birthDate?.trim()
    const displayName = profile.displayName?.trim()
    const email = profile.email?.trim()
    const fullName = profile.fullName?.trim()
    const gender = profile.gender?.trim()
    const nickname = profile.nickname?.trim()
    const phone = profile.phone?.trim()
    const salutation = profile.salutation?.trim()
    const defaultAddress = profile.defaultAddress?.trim()
    const savedAddresses = profile.savedAddresses
      ?.map((address) => address.trim())
      .filter(Boolean)
      .slice(0, 8)
    const nextMetadata = {
      ...session.user.user_metadata,
      ...(displayName ? { full_name: displayName, name: displayName } : {}),
      ...(fullName ? { full_name: fullName, name: fullName } : {}),
      ...(nickname ? { nickname, preferred_name: nickname } : {}),
      ...(salutation ? { salutation } : {}),
      ...(gender ? { gender } : {}),
      ...(birthDate ? { birth_date: birthDate } : {}),
      ...(phone ? { phone_number: phone } : {}),
      ...(email ? { contact_email: email } : {}),
      ...(defaultAddress ? { default_address: defaultAddress } : {}),
      ...(profile.savedAddresses ? { saved_addresses: savedAddresses ?? [] } : {}),
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

  const updatePassword = useCallback(async ({ currentPassword, newPassword }: CustomerPasswordUpdateDraft) => {
    if (!supabase || !session?.user) {
      const error = 'Dịch vụ tài khoản chưa sẵn sàng. Vui lòng thử lại sau.'
      patchAuth({ authError: error, loading: false })
      return { success: false, error }
    }

    const email = session.user.email?.trim().toLowerCase()
    if (!email || !isValidEmail(email)) {
      const error = 'Tài khoản này chưa hỗ trợ đổi mật khẩu bằng mật khẩu hiện tại.'
      patchAuth({ authError: error, loading: false })
      return { success: false, error }
    }
    if (!currentPassword || !newPassword) {
      const error = 'Nhập mật khẩu hiện tại và mật khẩu mới để tiếp tục.'
      patchAuth({ authError: error, loading: false })
      return { success: false, error }
    }

    patchAuth({ loading: true, authError: null })
    try {
      const { data: reauthData, error: reauthError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      })
      if (reauthError || reauthData.session?.user.id !== session.user.id) {
        const message = 'Mật khẩu hiện tại không đúng.'
        patchAuth({ authError: message, loading: false })
        return { success: false, error: message }
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) {
        const message = 'Không thể cập nhật mật khẩu. Vui lòng thử lại sau.'
        patchAuth({ authError: message, loading: false })
        return { success: false, error: message }
      }

      const { data } = await supabase.auth.getSession()
      patchAuth({ session: data.session ?? reauthData.session ?? session, loading: false })
      return { success: true }
    } catch {
      const message = 'Không thể kết nối dịch vụ tài khoản. Vui lòng thử lại sau.'
      patchAuth({ authError: message, loading: false })
      return { success: false, error: message }
    }
  }, [session])

  const signOut = useCallback(async () => {
    if (localVisualAuditSnapshot) {
      patchAuth(localVisualAuditSnapshot)
      return
    }

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
    setGuestMode(false)
  }, [localVisualAuditSnapshot])

  const refreshProfile = useCallback(async () => {
    if (localVisualAuditRole) {
      patchAuth({ role: localVisualAuditRole, profileStatus: 'ready' })
      return localVisualAuditRole
    }

    if (!session?.user) {
      patchAuth({ role: null, profileStatus: 'idle' })
      return null
    }

    return fetchRole(session.user.id)
  }, [fetchRole, localVisualAuditRole, session?.user])

  const authValue = useMemo(
    () => ({ session, role, guestMode, loading, profileStatus, authError, enterGuestMode, signInWithGoogle, signInWithPassword, signUpWithEmail, submitWorkerApplication, updateCustomerProfile, updatePassword, signOut, refreshProfile }),
    [authError, enterGuestMode, guestMode, loading, profileStatus, refreshProfile, role, session, signInWithGoogle, signInWithPassword, signOut, signUpWithEmail, submitWorkerApplication, updateCustomerProfile, updatePassword],
  )

  return authValue
}

export function useAuth() {
  return use(AuthContext)
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function getLocalVisualAuditRole(): Extract<UserRole, 'customer' | 'worker'> | null {
  if (!__DEV__ || Platform.OS !== 'web') return null

  const runtime = globalThis as typeof globalThis & {
    location?: {
      hostname?: string
      search?: string
    }
  }
  const hostname = runtime.location?.hostname ?? ''
  if (!['localhost', '127.0.0.1', '::1'].includes(hostname)) return null

  const role = new URLSearchParams(runtime.location?.search ?? '').get('ns_audit_role')
  return role === 'customer' || role === 'worker' ? role : null
}

function buildLocalVisualAuditSession(role: Extract<UserRole, 'customer' | 'worker'>): Session {
  const now = Math.floor(Date.now() / 1000)
  const isoNow = new Date(now * 1000).toISOString()
  const displayName = role === 'customer' ? 'Phan Manh Tu' : 'NestScout Worker'
  const email = role === 'customer' ? 'manhtu0407+customer@gmail.com' : 'worker.audit@nestscout.local'

  return {
    access_token: 'local-visual-audit',
    expires_at: now + 3600,
    expires_in: 3600,
    refresh_token: 'local-visual-audit',
    token_type: 'bearer',
    user: {
      app_metadata: { provider: 'local-visual-audit', providers: ['local-visual-audit'] },
      aud: 'authenticated',
      created_at: isoNow,
      email,
      id: `local-visual-audit-${role}`,
      role: 'authenticated',
      updated_at: isoNow,
      user_metadata: {
        full_name: displayName,
        name: displayName,
      },
    },
  } as Session
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
