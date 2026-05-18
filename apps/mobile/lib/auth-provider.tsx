import { createContext, use, useEffect, useReducer } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { USER_ROLES, type UserRole } from '@home-services/shared'

type ProfileStatus = 'idle' | 'loading' | 'ready' | 'profile_missing' | 'profile_error' | 'config_missing'

type AuthState = {
  session: Session | null
  role: UserRole | null
  loading: boolean
  profileStatus: ProfileStatus
  authError: string | null
  signInWithPassword: (email: string, password: string) => Promise<{ success: boolean; error?: string }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<UserRole | null>
}

type AuthSnapshot = Pick<AuthState, 'session' | 'role' | 'loading' | 'profileStatus' | 'authError'>

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
  signInWithPassword: async () => ({ success: false, error: 'Auth chưa sẵn sàng' }),
  signOut: async () => undefined,
  refreshProfile: async () => null,
})

function authSnapshotReducer(current: AuthSnapshot, patch: Partial<AuthSnapshot>): AuthSnapshot {
  return { ...current, ...patch }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [{ session, role, loading, profileStatus, authError }, patchAuth] = useReducer(authSnapshotReducer, INITIAL_AUTH_SNAPSHOT)
  const setSession = (nextSession: Session | null) => patchAuth({ session: nextSession })
  const setRole = (nextRole: UserRole | null) => patchAuth({ role: nextRole })
  const setLoading = (nextLoading: boolean) => patchAuth({ loading: nextLoading })
  const setProfileStatus = (nextProfileStatus: ProfileStatus) => patchAuth({ profileStatus: nextProfileStatus })
  const setAuthError = (nextAuthError: string | null) => patchAuth({ authError: nextAuthError })

  useEffect(() => {
    if (!supabase) {
      patchAuth({ session: null, role: null, profileStatus: 'config_missing', loading: false })
      return
    }

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

    return () => subscription.unsubscribe()
  }, [])

  async function fetchRole(userId: string): Promise<UserRole | null> {
    if (!supabase) {
      setRole(null)
      setProfileStatus('config_missing')
      setLoading(false)
      return null
    }

    setLoading(true)
    setProfileStatus('loading')
    setAuthError(null)

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle()

      if (error) {
        setRole(null)
        setProfileStatus('profile_error')
        setAuthError('Không thể tải hồ sơ đăng nhập')
        setLoading(false)
        return null
      }

      if (!data?.role) {
        setRole(null)
        setProfileStatus('profile_missing')
        setAuthError('Tài khoản chưa có hồ sơ vai trò')
        setLoading(false)
        return null
      }

      if (!USER_ROLES.includes(data.role as UserRole)) {
        setRole(null)
        setProfileStatus('profile_error')
        setAuthError('Vai trò tài khoản không hợp lệ')
        setLoading(false)
        return null
      }

      const nextRole = data.role as UserRole
      setRole(nextRole)
      setProfileStatus('ready')
      setLoading(false)
      return nextRole
    } catch {
      setRole(null)
      setProfileStatus('profile_error')
      setAuthError('Không thể tải hồ sơ đăng nhập')
      setLoading(false)
      return null
    }
  }

  async function signInWithPassword(email: string, password: string) {
    if (!supabase) {
      const error = 'Supabase chưa được cấu hình'
      setAuthError(error)
      setProfileStatus('config_missing')
      return { success: false, error }
    }

    const normalizedEmail = email.trim().toLowerCase()
    if (!normalizedEmail || !password) {
      const error = 'Nhập email và mật khẩu để tiếp tục'
      setAuthError(error)
      return { success: false, error }
    }
    if (!isValidEmail(normalizedEmail)) {
      const error = 'Email không hợp lệ'
      setAuthError(error)
      return { success: false, error }
    }

    setLoading(true)
    setAuthError(null)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      })

      if (error || !data.session?.user) {
        const message = 'Email hoặc mật khẩu không đúng'
        setSession(null)
        setRole(null)
        setProfileStatus('idle')
        setAuthError(message)
        setLoading(false)
        return { success: false, error: message }
      }

      setSession(data.session)
      const nextRole = await fetchRole(data.session.user.id)
      if (!nextRole) {
        return { success: false, error: 'Không thể tải vai trò tài khoản' }
      }

      return { success: true }
    } catch {
      const message = 'Không thể kết nối Supabase để đăng nhập'
      setSession(null)
      setRole(null)
      setProfileStatus('profile_error')
      setAuthError(message)
      setLoading(false)
      return { success: false, error: message }
    }
  }

  async function signOut() {
    try {
      if (supabase) {
        await supabase.auth.signOut({ scope: 'local' })
      }
    } catch {
      // Local auth state still needs to clear when the remote sign-out request fails.
    }
    setSession(null)
    setRole(null)
    setProfileStatus('idle')
    setAuthError(null)
    setLoading(false)
  }

  async function refreshProfile() {
    if (!session?.user) {
      setRole(null)
      setProfileStatus('idle')
      return null
    }

    return fetchRole(session.user.id)
  }

  return (
    <AuthContext.Provider value={{ session, role, loading, profileStatus, authError, signInWithPassword, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return use(AuthContext)
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}
