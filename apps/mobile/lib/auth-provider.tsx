import { createContext, use, useEffect, useRef, useReducer } from 'react'
import { Platform } from 'react-native'
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
  const loadingRef = useRef(INITIAL_AUTH_SNAPSHOT.loading)
  const sessionRef = useRef<Session | null>(INITIAL_AUTH_SNAPSHOT.session)

  useEffect(() => {
    loadingRef.current = loading
    sessionRef.current = session
  }, [loading, session])

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
        authError: 'Auth bootstrap timed out',
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
  }, [])

  async function fetchRole(userId: string): Promise<UserRole | null> {
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
  }

  async function signInWithPassword(email: string, password: string) {
    if (!supabase) {
      const error = 'Supabase chưa được cấu hình'
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
      const message = 'Không thể kết nối Supabase để đăng nhập'
      patchAuth({
        session: null,
        role: null,
        profileStatus: 'profile_error',
        authError: message,
        loading: false,
      })
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
    patchAuth({
      session: null,
      role: null,
      profileStatus: 'idle',
      authError: null,
      loading: false,
    })
  }

  async function refreshProfile() {
    if (!session?.user) {
      patchAuth({ role: null, profileStatus: 'idle' })
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
