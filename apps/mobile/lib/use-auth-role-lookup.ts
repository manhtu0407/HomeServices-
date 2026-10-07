import { useCallback, useRef } from 'react'
import type { Session } from '@supabase/supabase-js'
import { USER_ROLES, type UserRole } from '@nestscout/shared'

import type { AuthSnapshot } from './auth-context'
import { readResource, removeResource, writeResource } from './resource-cache/resource-cache'
import { hydrateResourceOwner } from './resource-cache/resource-cache-persistence'
import { isConnectivityOffline } from './connectivity'
import { supabase } from './supabase'

const ROLE_RESOURCE_KEY = 'auth.role'

function cachedRoleFor(userId: string): UserRole | null {
  const cached = readResource<unknown>(userId, ROLE_RESOURCE_KEY)?.data
  return typeof cached === 'string' && USER_ROLES.includes(cached as UserRole) ? cached as UserRole : null
}

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
      // An unreachable profile read on 3G is not evidence the role changed; keep routing on the last known role.
      const keepCachedRole = (cachedRole: UserRole) => {
        patchAuth({ role: cachedRole, profileStatus: 'ready', loading: false, authError: null })
        return cachedRole
      }
      // With no role to fall back on, an unreachable server still is not a sign-out; the session stays and the shell waits.
      const reportUnreachable = () => {
        patchAuth({ role: null, profileStatus: 'network_unavailable', authError: null, loading: false })
        return null
      }

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
      await hydrateResourceOwner(userId)
      if (!isCurrentLookup()) return null
      // The cached role only routes the shell; every Edge route still enforces its own role guard.
      const cachedRole = cachedRoleFor(userId)
      const softRoleRefresh = sessionRef.current?.user.id === userId && roleRef.current !== null
      if (cachedRole && !softRoleRefresh) {
        patchAuth({ role: cachedRole, profileStatus: 'ready', loading: false, authError: null })
      } else if (softRoleRefresh) {
        patchAuth({ profileStatus: 'loading', authError: null })
      } else {
        patchAuth({ loading: true, profileStatus: 'loading', authError: null })
      }

      try {
        // The post-I/O owner check prevents an older account lookup from committing into a newer session.
        // react-doctor-disable-next-line react-doctor/async-defer-await
        const { data, error, status } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', userId)
          .maybeSingle()

        if (!isCurrentLookup()) return null
        if (error) {
          if (cachedRole) return keepCachedRole(cachedRole)
          if (status === 0) return reportUnreachable()
          patchAuth({
            role: null,
            profileStatus: 'profile_error',
            authError: 'Không thể tải hồ sơ đăng nhập',
            loading: false,
          })
          return null
        }

        if (!data?.role || !USER_ROLES.includes(data.role as UserRole)) removeResource(userId, ROLE_RESOURCE_KEY)
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
        writeResource(userId, ROLE_RESOURCE_KEY, nextRole)
        patchAuth({ role: nextRole, profileStatus: 'ready', loading: false })
        return nextRole
      } catch {
        if (!isCurrentLookup()) return null
        if (cachedRole) return keepCachedRole(cachedRole)
        if (isConnectivityOffline()) return reportUnreachable()
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
