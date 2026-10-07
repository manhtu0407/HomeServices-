import { createContext } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { UserRole, WorkerApplicationStatus, WorkerReadiness } from '@nestscout/shared'

export type ProfileStatus = 'idle' | 'loading' | 'ready' | 'profile_missing' | 'profile_error' | 'network_unavailable' | 'config_missing'

export type CustomerProfileDraft = {
  birthDate?: string; defaultAddress?: string; displayName?: string
  email?: string; fullName?: string; gender?: string; nickname?: string
  phone?: string; salutation?: string
  savedAddresses?: string[]
}

export type CustomerIdentifierSignupDraft = { displayName: string; identifier: string; password: string }
export type WorkerApplicationDraft = { contact: string; language: 'vi' | 'en' }
export type CustomerPasswordUpdateDraft = { currentPassword: string; newPassword: string }

export type AuthState = {
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
  getWorkerReadiness: () => Promise<{ success: boolean; error?: string; readiness?: WorkerReadiness }>
  submitWorkerApplication: (draft: WorkerApplicationDraft & { revisionOfApplicationId?: string }) => Promise<{ success: boolean; error?: string; applicationId?: string; status?: WorkerApplicationStatus }>
  updateCustomerProfile: (profile: CustomerProfileDraft) => Promise<{ success: boolean; error?: string }>
  updatePassword: (passwords: CustomerPasswordUpdateDraft) => Promise<{ success: boolean; error?: string }>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<UserRole | null>
}

export type AuthSnapshot = Pick<AuthState, 'session' | 'role' | 'loading' | 'profileStatus' | 'authError'>

export const INITIAL_AUTH_SNAPSHOT: AuthSnapshot = {
  session: null,
  role: null,
  loading: true,
  profileStatus: 'idle',
  authError: null,
}

export function authSnapshotReducer(current: AuthSnapshot, patch: Partial<AuthSnapshot>): AuthSnapshot {
  return { ...current, ...patch }
}

export const AuthContext = createContext<AuthState>({
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
  getWorkerReadiness: async () => ({ success: false, error: 'Trạng thái hồ sơ thợ chưa sẵn sàng' }),
  submitWorkerApplication: async () => ({ success: false, error: 'Gửi xét duyệt thợ chưa sẵn sàng' }),
  updateCustomerProfile: async () => ({ success: false, error: 'Lưu hồ sơ khách chưa sẵn sàng' }),
  updatePassword: async () => ({ success: false, error: 'Đổi mật khẩu chưa sẵn sàng' }),
  signOut: async () => undefined,
  refreshProfile: async () => null,
})
