import { createContext, use, useCallback, useEffect, useMemo, useRef, useReducer, useState } from 'react'
import { useRouter } from 'expo-router'
import { Platform } from 'react-native'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { USER_ROLES, type UserRole } from '@nestscout/shared'
import { addPushNotificationResponseListener } from './push-notifications'
import {
  clearStableClientRequestId,
  stableClientRequestId,
  type PendingClientRequestId,
} from './client-request-id'
import { parseAuthIdentifier, validateAuthIdentifier } from './auth-identifier'
import { isValidEmail, staleAccountMutation } from './auth-provider-guards'
import { getRuntimeAuthCallbackUrl, isPasswordRecoveryCallbackUrl } from './auth-callback'
import { requestPasswordRecoveryEmail, updateRecoveredPassword } from './password-recovery'
import { isBoundedLoginPassword, validateNewPassword, validateSignupPassword } from './auth-password'
import { buildLocalVisualAuditSession, getLocalVisualAuditRole } from './auth-visual-audit'
import { clearPendingKaelChatDraft } from './pending-kael-chat-draft'
import { buildCustomerProfileMetadata } from './customer-profile-metadata'
import { inspectOAuthCallbackUrl } from './oauth-callback'
import {
  exchangeOAuthCodeForSession,
  getOAuthRedirectUrl,
  startAppleOAuthRequest,
  startGoogleOAuthRequest,
  subscribeToOAuthCallbackUrls,
} from './auth-oauth-runtime'
import { workerService } from './services'
import { useSessionPushRegistration } from './use-session-push-registration'

type ProfileStatus = 'idle' | 'loading' | 'ready' | 'profile_missing' | 'profile_error' | 'config_missing'
type OAuthProvider = 'apple' | 'google'

type AuthState = {
  session: Session | null
  role: UserRole | null
  guestMode: boolean
  loading: boolean
  profileStatus: ProfileStatus
  authError: string | null
  passwordRecoveryPending: boolean
  enterGuestMode: () => void
  signInWithApple: () => Promise<{ success: boolean; error?: string }>
  signInWithGoogle: () => Promise<{ success: boolean; error?: string }>
  signInWithPassword: (email: string, password: string) => Promise<{ success: boolean; error?: string; role?: UserRole }>
  signUpWithIdentifier: (profile: CustomerIdentifierSignupDraft) => Promise<{ success: boolean; error?: string }>
  requestPasswordRecovery: (email: string) => Promise<{ success: boolean; error?: string }>
  completePasswordRecovery: (password: string) => Promise<{ success: boolean; error?: string }>
  submitWorkerApplication: (draft: WorkerApplicationDraft) => Promise<{ success: boolean; error?: string; applicationId?: string }>
  updateCustomerProfile: (profile: CustomerProfileDraft) => Promise<{ success: boolean; error?: string }>
  updatePassword: (passwords: CustomerPasswordUpdateDraft) => Promise<{ success: boolean; error?: string }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<UserRole | null>
}

type AuthSnapshot = Pick<AuthState, 'session' | 'role' | 'loading' | 'profileStatus' | 'authError'>

type CustomerProfileDraft = {
  birthDate?: string; defaultAddress?: string; displayName?: string
  email?: string; fullName?: string; gender?: string; nickname?: string
  phone?: string; salutation?: string
  savedAddresses?: string[]
}

type CustomerIdentifierSignupDraft = { displayName: string; identifier: string; password: string }
type WorkerApplicationDraft = { contact: string; language: 'vi' | 'en' }
type CustomerPasswordUpdateDraft = { currentPassword: string; newPassword: string }

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
  passwordRecoveryPending: false,
  enterGuestMode: () => undefined,
  signInWithApple: async () => ({ success: false, error: 'Đăng nhập Apple chưa sẵn sàng' }),
  signInWithGoogle: async () => ({ success: false, error: 'Đăng nhập Google chưa sẵn sàng' }),
  signInWithPassword: async () => ({ success: false, error: 'Đăng nhập chưa sẵn sàng' }),
  signUpWithIdentifier: async () => ({ success: false, error: 'Đăng ký chưa sẵn sàng' }),
  requestPasswordRecovery: async () => ({ success: false, error: 'Khôi phục mật khẩu chưa sẵn sàng' }),
  completePasswordRecovery: async () => ({ success: false, error: 'Đặt lại mật khẩu chưa sẵn sàng' }),
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
  return <AuthContext.Provider value={authValue}>{children}</AuthContext.Provider>
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
  const [passwordRecoveryPending, setPasswordRecoveryPending] = useState(() => isPasswordRecoveryCallbackUrl(getRuntimeAuthCallbackUrl()))
  const passwordRecoveryPendingRef = useRef(passwordRecoveryPending)
  const passwordRecoverySessionReadyRef = useRef(false)
  const pendingWorkerApplicationRequestRef = useRef<PendingClientRequestId | null>(null)
  const accountMutationSequenceRef = useRef(0)
  const roleLookupSequenceRef = useRef(0)
  const oauthPromiseRef = useRef<Promise<{ success: boolean; error?: string }> | null>(null)
  const lastOAuthCallbackCodeRef = useRef<string | null>(null)
  const sessionRef = useRef<Session | null>(localVisualAuditSnapshot?.session ?? INITIAL_AUTH_SNAPSHOT.session)
  const unregisterPushTokenForSession = useSessionPushRegistration({
    disabled: Boolean(localVisualAuditRole),
    profileReady: profileStatus === 'ready',
    role,
    session,
    sessionRef,
  })
  const setCurrentSession = useCallback((nextSession: Session | null) => {
    const previousSession = sessionRef.current
    const previousUserId = previousSession?.user.id
    const nextUserId = nextSession?.user.id
    if (previousUserId !== nextUserId) accountMutationSequenceRef.current += 1
    if (previousUserId && previousUserId !== nextUserId) {
      unregisterPushTokenForSession(previousSession)
      void clearPendingKaelChatDraft(previousUserId)
    }
    sessionRef.current = nextSession
    roleLookupSequenceRef.current += 1
  }, [unregisterPushTokenForSession])

  const fetchRole = useCallback(async (userId: string): Promise<UserRole | null> => {
    const lookupSequence = ++roleLookupSequenceRef.current
    const isCurrentLookup = () => (
      roleLookupSequenceRef.current === lookupSequence &&
      sessionRef.current?.user.id === userId
    )

    if (localVisualAuditRole) {
      if (!isCurrentLookup()) return null
      patchAuth({ role: localVisualAuditRole, profileStatus: 'ready', loading: false })
      return localVisualAuditRole
    }

    if (!supabase) {
      if (!isCurrentLookup()) return null
      patchAuth({ role: null, profileStatus: 'config_missing', loading: false })
      return null
    }

    if (!isCurrentLookup()) return null
    patchAuth({ loading: true, profileStatus: 'loading', authError: null })

    try {
      // The post-I/O owner check prevents an older account lookup from committing into a newer session.
      // react-doctor-disable-next-line react-doctor/async-defer-await
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle()

      if (!isCurrentLookup()) return null
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
      if (!isCurrentLookup()) return null
      patchAuth({
        role: null,
        profileStatus: 'profile_error',
        authError: 'Không thể tải hồ sơ đăng nhập',
        loading: false,
      })
      return null
    }
  }, [localVisualAuditRole])

  const createSessionFromAuthUrl = useCallback(async (url: string) => {
    const callback = inspectOAuthCallbackUrl(url, getOAuthRedirectUrl())
    if (callback.kind === 'error') {
      patchAuth({
        authError: 'Không thể hoàn tất đăng nhập. Vui lòng thử lại sau.',
        loading: false,
        profileStatus: 'profile_error',
      })
      return null
    }
    if (callback.kind === 'ignored' || callback.code === lastOAuthCallbackCodeRef.current) return null
    lastOAuthCallbackCodeRef.current = callback.code

    const recoveryCallback = isPasswordRecoveryCallbackUrl(url)
    if (recoveryCallback) {
      passwordRecoveryPendingRef.current = true
      setPasswordRecoveryPending(true)
      patchAuth({ role: null, profileStatus: 'idle', authError: null, loading: true })
    }

    const result = await exchangeOAuthCodeForSession(callback.code)
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
    setCurrentSession(result.session)
    if (recoveryCallback || passwordRecoveryPendingRef.current) {
      passwordRecoveryPendingRef.current = true
      passwordRecoverySessionReadyRef.current = recoveryCallback
      setPasswordRecoveryPending(true)
      patchAuth({ session: result.session, role: null, profileStatus: 'idle', authError: null, loading: false })
      return result.session
    }

    patchAuth({ session: result.session, role: null })
    await fetchRole(result.session.user.id)
    return result.session
  }, [fetchRole, setCurrentSession])

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
    return subscribeToOAuthCallbackUrls(createSessionFromAuthUrl)
  }, [createSessionFromAuthUrl, localVisualAuditRole])

  useEffect(() => {
    if (localVisualAuditSnapshot) {
      setCurrentSession(localVisualAuditSnapshot.session)
      patchAuth(localVisualAuditSnapshot)
      return () => undefined
    }

    if (!supabase) {
      setCurrentSession(null)
      patchAuth({ session: null, role: null, profileStatus: 'config_missing', loading: false })
      return
    }

    const bootstrapSequence = roleLookupSequenceRef.current
    let bootstrapPending = true

    const bootstrapTimeout = setTimeout(() => {
      if (!bootstrapPending || roleLookupSequenceRef.current !== bootstrapSequence) return
      bootstrapPending = false

      patchAuth({
        session: sessionRef.current,
        role: null,
        profileStatus: 'profile_error',
        authError: 'Không thể tải phiên đăng nhập. Vui lòng thử lại.',
        loading: false,
      })
    }, Platform.OS === 'web' ? 900 : 7000)

    const settleBootstrap = () => {
      if (!bootstrapPending) return false
      bootstrapPending = false
      clearTimeout(bootstrapTimeout)
      return true
    }

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (!settleBootstrap() || roleLookupSequenceRef.current !== bootstrapSequence) return
        setCurrentSession(session)
        if (session?.user) {
          setGuestMode(false)
          if (passwordRecoveryPendingRef.current) {
            patchAuth({ session, role: null, profileStatus: 'idle', authError: null, loading: false })
          } else {
            patchAuth({ session, role: null, profileStatus: 'loading', authError: null, loading: true })
            void fetchRole(session.user.id)
          }
        } else {
          patchAuth({ session, role: null, profileStatus: 'idle', loading: false })
        }
      })
      .catch(() => {
        if (!settleBootstrap() || roleLookupSequenceRef.current !== bootstrapSequence) return
        setCurrentSession(null)
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
    } = supabase.auth.onAuthStateChange((event, session) => {
      settleBootstrap()
      setCurrentSession(session)
      if (session?.user) {
        setGuestMode(false)
        if (event === 'PASSWORD_RECOVERY' || passwordRecoveryPendingRef.current) {
          passwordRecoveryPendingRef.current = true
          if (event === 'PASSWORD_RECOVERY') passwordRecoverySessionReadyRef.current = true
          setPasswordRecoveryPending(true)
          patchAuth({ session, role: null, profileStatus: 'idle', authError: null, loading: false })
          return
        }

        patchAuth({ session, role: null, profileStatus: 'loading', authError: null, loading: true })
        void fetchRole(session.user.id)
      } else {
        if (event === 'SIGNED_OUT') {
          passwordRecoveryPendingRef.current = false
          passwordRecoverySessionReadyRef.current = false
          setPasswordRecoveryPending(false)
        }
        patchAuth({ session, role: null, profileStatus: 'idle', authError: null, loading: false })
      }
    })

    return () => {
      clearTimeout(bootstrapTimeout)
      subscription.unsubscribe()
    }
  }, [fetchRole, localVisualAuditSnapshot, setCurrentSession])

  const enterGuestMode = useCallback(() => {
    passwordRecoveryPendingRef.current = false
    passwordRecoverySessionReadyRef.current = false
    setPasswordRecoveryPending(false)
    setCurrentSession(null)
    setGuestMode(true)
    patchAuth({
      session: null,
      role: null,
      profileStatus: 'idle',
      authError: null,
      loading: false,
    })
  }, [setCurrentSession])

  const completePasswordRecovery = useCallback(async (newPassword: string) => {
    if (!passwordRecoveryPendingRef.current || !passwordRecoverySessionReadyRef.current || !session?.user) {
      const error = 'Liên kết đặt lại mật khẩu không còn hiệu lực. Vui lòng yêu cầu liên kết mới.'
      patchAuth({ authError: error, loading: false })
      return { success: false, error }
    }

    patchAuth({ authError: null, loading: true })
    const result = await updateRecoveredPassword(newPassword)
    patchAuth({ authError: result.error ?? null, loading: false })
    return result
  }, [session?.user])

  const signInWithPassword = useCallback(async (identifierInput: string, password: string) => {
    if (!supabase) {
      const error = 'Dịch vụ đăng nhập chưa sẵn sàng. Vui lòng thử lại sau.'
      patchAuth({ authError: error, profileStatus: 'config_missing', loading: false })
      return { success: false, error }
    }

    const identifier = parseAuthIdentifier(identifierInput)
    const identifierError = validateAuthIdentifier(identifierInput)
    if (!identifier || !isBoundedLoginPassword(password)) {
      const error = identifierError ?? 'Mật khẩu đăng nhập không hợp lệ.'
      patchAuth({ authError: error })
      return { success: false, error }
    }

    patchAuth({ loading: true, authError: null })
    try {
      const credentials = identifier.kind === 'email'
        ? { email: identifier.value, password }
        : { phone: identifier.value, password }
      const { data, error } = await supabase.auth.signInWithPassword(credentials)

      if (error || !data.session?.user) {
        const message = 'Email/SDT hoặc mật khẩu không đúng'
        setCurrentSession(null)
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
      setCurrentSession(data.session)
      patchAuth({ session: data.session, role: null })
      const nextRole = await fetchRole(data.session.user.id)
      if (!nextRole) {
        return { success: false, error: 'Không thể tải vai trò tài khoản' }
      }

      return { success: true, role: nextRole }
    } catch {
      const message = 'Không thể kết nối dịch vụ đăng nhập. Vui lòng thử lại sau.'
      setCurrentSession(null)
      patchAuth({
        session: null,
        role: null,
        profileStatus: 'profile_error',
        authError: message,
        loading: false,
      })
      return { success: false, error: message }
    }
  }, [fetchRole, setCurrentSession])

  const beginProviderSignIn = useCallback((provider: OAuthProvider) => {
    const pendingRequest = oauthPromiseRef.current
    if (pendingRequest) return pendingRequest

    const request = (async () => {
      const providerName = provider === 'apple' ? 'Apple' : 'Google'
      setGuestMode(false)
      patchAuth({ loading: true, authError: null })
      const result = provider === 'apple'
        ? await startAppleOAuthRequest()
        : await startGoogleOAuthRequest()
      if (!result.success) {
        patchAuth({
          authError: result.error ?? `Không thể mở đăng nhập ${providerName}. Vui lòng thử lại sau.`,
          loading: false,
          profileStatus: result.configMissing ? 'config_missing' : profileStatus,
        })
        return result
      }

      if (Platform.OS !== 'web') patchAuth({ loading: false })
      return { success: true }
    })()
    oauthPromiseRef.current = request
    const clearPendingRequest = () => {
      if (oauthPromiseRef.current === request) oauthPromiseRef.current = null
    }
    void request.then(clearPendingRequest, clearPendingRequest)
    return request
  }, [profileStatus])

  const signInWithApple = useCallback(() => beginProviderSignIn('apple'), [beginProviderSignIn])
  const signInWithGoogle = useCallback(() => beginProviderSignIn('google'), [beginProviderSignIn])

  const signUpWithIdentifier = useCallback(async ({ displayName, identifier: identifierInput, password }: CustomerIdentifierSignupDraft) => {
    setGuestMode(false)
    if (!supabase) {
      const error = 'Dịch vụ đăng ký chưa sẵn sàng. Vui lòng thử lại sau.'
      patchAuth({ authError: error, profileStatus: 'config_missing', loading: false })
      return { success: false, error }
    }

    const identifier = parseAuthIdentifier(identifierInput)
    const identifierError = validateAuthIdentifier(identifierInput)
    const normalizedName = typeof displayName === 'string'
      ? displayName.trim().replace(/\s+/g, ' ')
      : ''
    if (normalizedName.length < 2 || normalizedName.length > 100) {
      const error = 'Nhập họ tên để tạo tài khoản'
      patchAuth({ authError: error })
      return { success: false, error }
    }
    if (!identifier) {
      const error = identifierError ?? 'Nhập Email hoặc SDT và mật khẩu để đăng ký'
      patchAuth({ authError: error })
      return { success: false, error }
    }
    if (identifier.kind !== 'email') {
      const error = 'Đăng ký bằng SDT chưa sẵn sàng. Vui lòng dùng email.'
      patchAuth({ authError: error })
      return { success: false, error }
    }
    const passwordError = validateSignupPassword(password)
    if (passwordError) {
      const error = passwordError
      patchAuth({ authError: error })
      return { success: false, error }
    }

    patchAuth({ loading: true, authError: null })
    try {
      const { data, error } = await supabase.auth.signUp({
        email: identifier.value,
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
        const message = 'Không thể tạo tài khoản. Vui lòng thử lại sau.'
        patchAuth({ authError: message, loading: false, profileStatus: 'idle', role: null, session: null })
        return { success: false, error: message }
      }

      setGuestMode(false)
      setCurrentSession(data.session)
      patchAuth({ session: data.session, role: null })
      const nextRole = await fetchRole(data.session.user.id)
      if (!nextRole) {
        return { success: false, error: 'Không thể tải vai trò tài khoản' }
      }

      return { success: true }
    } catch {
      const message = 'Không thể kết nối dịch vụ đăng ký. Vui lòng thử lại sau.'
      setCurrentSession(null)
      patchAuth({
        session: null,
        role: null,
        profileStatus: 'profile_error',
        authError: message,
        loading: false,
      })
      return { success: false, error: message }
    }
  }, [fetchRole, setCurrentSession])

  const submitWorkerApplication = useCallback(async ({ contact, language }: WorkerApplicationDraft) => {
    const parsedContact = parseAuthIdentifier(contact)
    if (!parsedContact) {
      return { success: false, error: 'Nhập email hoặc số điện thoại để gửi xét duyệt.' }
    }
    const normalizedContact = parsedContact.value

    try {
      const requestFingerprint = JSON.stringify({
        contact: normalizedContact,
        language,
        source: 'auth_worker_create',
      })
      const result = await workerService.submitApplication({
        contact: normalizedContact,
        language,
        source: 'auth_worker_create',
        client_request_id: stableClientRequestId(
          pendingWorkerApplicationRequestRef,
          requestFingerprint,
        ),
      })
      if (!result.success) {
        return { success: false, error: result.error }
      }
      clearStableClientRequestId(pendingWorkerApplicationRequestRef, requestFingerprint)
      return { success: true, applicationId: result.data.application_id }
    } catch {
      return { success: false, error: 'Không thể gửi xét duyệt lúc này. Vui lòng thử lại.' }
    }
  }, [])

  const updateCustomerProfile = useCallback(async (profile: CustomerProfileDraft) => {
    if (!supabase || !session?.user) {
      const error = 'Dịch vụ hồ sơ khách chưa sẵn sàng. Vui lòng thử lại sau.'
      patchAuth({ authError: error, loading: false })
      return { success: false, error }
    }

    const metadata = buildCustomerProfileMetadata(profile)
    if (!metadata.success) {
      patchAuth({ authError: metadata.error, loading: false })
      return metadata
    }

    const ownerId = session.user.id
    if (sessionRef.current?.user.id !== ownerId) return staleAccountMutation()
    const mutationSequence = ++accountMutationSequenceRef.current
    const isCurrentMutation = () => (
      accountMutationSequenceRef.current === mutationSequence
      && sessionRef.current?.user.id === ownerId
    )

    patchAuth({ loading: true, authError: null })
    try {
      // The post-I/O guard prevents an earlier account mutation from committing after an account switch.
      // react-doctor-disable-next-line react-doctor/async-defer-await
      const { error } = await supabase.auth.updateUser({ data: metadata.data })
      if (!isCurrentMutation()) return staleAccountMutation()
      if (error) {
        const message = 'Không thể lưu hồ sơ khách. Vui lòng thử lại sau.'
        patchAuth({ authError: message, loading: false })
        return { success: false, error: message }
      }

      // react-doctor-disable-next-line react-doctor/async-defer-await
      const { data } = await supabase.auth.getSession()
      if (!isCurrentMutation()) return staleAccountMutation()
      const nextSession = data.session ?? session
      if (nextSession.user.id !== ownerId) return staleAccountMutation()
      setCurrentSession(nextSession)
      patchAuth({ session: nextSession, loading: false })
      return { success: true }
    } catch {
      if (!isCurrentMutation()) return staleAccountMutation()
      const message = 'Không thể kết nối dịch vụ hồ sơ. Vui lòng thử lại sau.'
      patchAuth({ authError: message, loading: false })
      return { success: false, error: message }
    }
  }, [session, setCurrentSession])

  const updatePassword = useCallback(async ({ currentPassword, newPassword }: CustomerPasswordUpdateDraft) => {
    if (!supabase || !session?.user) {
      const error = 'Dịch vụ tài khoản chưa sẵn sàng. Vui lòng thử lại sau.'
      patchAuth({ authError: error, loading: false })
      return { success: false, error }
    }

    const ownerId = session.user.id
    if (sessionRef.current?.user.id !== ownerId) return staleAccountMutation()

    const email = session.user.email?.trim().toLowerCase()
    if (!email || !isValidEmail(email)) {
      const error = 'Tài khoản này chưa hỗ trợ đổi mật khẩu bằng mật khẩu hiện tại.'
      patchAuth({ authError: error, loading: false })
      return { success: false, error }
    }
    const passwordError = validateNewPassword(currentPassword, newPassword)
    if (passwordError) {
      const error = passwordError
      patchAuth({ authError: error, loading: false })
      return { success: false, error }
    }

    const mutationSequence = ++accountMutationSequenceRef.current
    const isCurrentMutation = () => (
      accountMutationSequenceRef.current === mutationSequence
      && sessionRef.current?.user.id === ownerId
    )

    patchAuth({ loading: true, authError: null })
    try {
      // Each post-I/O owner check is intentional; password work must stop if the active account changes.
      // react-doctor-disable-next-line react-doctor/async-defer-await
      const { data: reauthData, error: reauthError } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      })
      if (!isCurrentMutation()) return staleAccountMutation()
      if (reauthError || reauthData.session?.user.id !== session.user.id) {
        const message = 'Mật khẩu hiện tại không đúng.'
        patchAuth({ authError: message, loading: false })
        return { success: false, error: message }
      }

      // react-doctor-disable-next-line react-doctor/async-defer-await
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (!isCurrentMutation()) return staleAccountMutation()
      if (error) {
        const message = 'Không thể cập nhật mật khẩu. Vui lòng thử lại sau.'
        patchAuth({ authError: message, loading: false })
        return { success: false, error: message }
      }

      // react-doctor-disable-next-line react-doctor/async-defer-await
      const { data } = await supabase.auth.getSession()
      if (!isCurrentMutation()) return staleAccountMutation()
      const nextSession = data.session ?? reauthData.session ?? session
      if (nextSession.user.id !== ownerId) return staleAccountMutation()
      setCurrentSession(nextSession)
      patchAuth({ session: nextSession, loading: false })
      return { success: true }
    } catch {
      if (!isCurrentMutation()) return staleAccountMutation()
      const message = 'Không thể kết nối dịch vụ tài khoản. Vui lòng thử lại sau.'
      patchAuth({ authError: message, loading: false })
      return { success: false, error: message }
    }
  }, [session, setCurrentSession])

  const signOut = useCallback(async () => {
    passwordRecoveryPendingRef.current = false
    passwordRecoverySessionReadyRef.current = false
    setPasswordRecoveryPending(false)
    if (localVisualAuditSnapshot) {
      setCurrentSession(localVisualAuditSnapshot.session)
      patchAuth(localVisualAuditSnapshot)
      return
    }

    setCurrentSession(null)
    patchAuth({
      session: null,
      role: null,
      profileStatus: 'idle',
      authError: null,
      loading: false,
    })
    setGuestMode(false)
    try {
      if (supabase) {
        await supabase.auth.signOut({ scope: 'local' })
      }
    } catch {
      // Local auth state still needs to clear when the remote sign-out request fails.
    }
  }, [localVisualAuditSnapshot, setCurrentSession])

  const refreshProfile = useCallback(async () => {
    if (localVisualAuditRole) {
      if (localVisualAuditSnapshot?.session) setCurrentSession(localVisualAuditSnapshot.session)
      patchAuth({ role: localVisualAuditRole, profileStatus: 'ready' })
      return localVisualAuditRole
    }

    if (!session?.user) {
      setCurrentSession(null)
      patchAuth({ role: null, profileStatus: 'idle' })
      return null
    }

    return fetchRole(session.user.id)
  }, [fetchRole, localVisualAuditRole, localVisualAuditSnapshot?.session, session?.user, setCurrentSession])

  const authValue = useMemo(
    () => ({ session, role, guestMode, loading, profileStatus, authError, passwordRecoveryPending, enterGuestMode, signInWithApple, signInWithGoogle, signInWithPassword, signUpWithIdentifier, requestPasswordRecovery: requestPasswordRecoveryEmail, completePasswordRecovery, submitWorkerApplication, updateCustomerProfile, updatePassword, signOut, refreshProfile }),
    [authError, completePasswordRecovery, enterGuestMode, guestMode, loading, passwordRecoveryPending, profileStatus, refreshProfile, role, session, signInWithApple, signInWithGoogle, signInWithPassword, signOut, signUpWithIdentifier, submitWorkerApplication, updateCustomerProfile, updatePassword],
  )

  return authValue
}

export function useAuth() {
  return use(AuthContext)
}
