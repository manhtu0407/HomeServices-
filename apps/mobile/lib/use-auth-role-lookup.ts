import { useCallback, useRef } from 'react'
import type { Session } from '@supabase/supabase-js'
import { USER_ROLES, type UserRole } from '@nestscout/shared'

import type { AuthSnapshot } from './auth-context'
import { supabase } from './supabase'

type AuthRoleLookupOptions = {
  localVisualAuditRole: UserRole | null
  patchAuth: (patch: Partial<AuthSnapshot>) => void
  roleRef: { current: UserRole | null }
  roleLookupSequenceRef: { current: number }
  sessionRef: { current: Session | null }
}

export function useAuthRoleLookup({
  localVisualAuditRole,
  patchAuth,
  roleRef,
  roleLookupSequenceRef,
  sessionRef,
}: AuthRoleLookupOptions) {
  const roleLookupInFlightRef = useRef<{
    lookupSequence: number
    userId: string
    promise: Promise<UserRole | null>
  } | null>(null)

  return useCallback((userId: string): Promise<UserRole | null> => {
    const existingLookup = roleLookupInFlightRef.current
    if (
      existingLookup?.userId === userId &&
      existingLookup.lookupSequence === roleLookupSequenceRef.current &&
      sessionRef.current?.user.id === userId
    ) {
      return existingLookup.promise
    }

    const lookupSequence = ++roleLookupSequenceRef.current
    const lookup = (async (): Promise<UserRole | null> => {
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
      const softRoleRefresh = sessionRef.current?.user.id === userId && roleRef.current !== null
      if (softRoleRefresh) {
        patchAuth({ profileStatus: 'loading', authError: null })
      } else {
        patchAuth({ loading: true, profileStatus: 'loading', authError: null })
      }

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
    })()

    roleLookupInFlightRef.current = { lookupSequence, promise: lookup, userId }
    void lookup.then(
      () => {
        if (roleLookupInFlightRef.current?.promise === lookup) roleLookupInFlightRef.current = null
      },
      () => {
        if (roleLookupInFlightRef.current?.promise === lookup) roleLookupInFlightRef.current = null
      },
    )
    return lookup
  }, [localVisualAuditRole, patchAuth, roleLookupSequenceRef, roleRef, sessionRef])
}
