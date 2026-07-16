import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { UserRole } from '@nestscout/shared'
import { setupPushNotifications, unregisterPushNotifications } from './push-notifications'

type SessionReference = {
  current: Session | null
}

type DesiredPushRegistration = {
  accessToken: string
  key: string
  role: UserRole
  userId: string
}

export function useSessionPushRegistration(input: {
  disabled: boolean
  profileReady: boolean
  role: UserRole | null
  session: Session | null
  sessionRef: SessionReference
}) {
  const [registrationRevision, retryRegistration] = useReducer((revision: number) => revision + 1, 0)
  const desiredRegistrationRef = useRef<DesiredPushRegistration | null>(null)
  const mountedRef = useRef(true)
  const registrationAttemptRef = useRef(0)
  const registrationKeyRef = useRef<string | null>(null)
  const registeredTokenRef = useRef<{ token: string; userId: string } | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      registrationAttemptRef.current += 1
      registrationKeyRef.current = null
      desiredRegistrationRef.current = null
    }
  }, [])

  const unregisterForSession = useCallback((previousSession: Session | null) => {
    registrationAttemptRef.current += 1
    registrationKeyRef.current = null
    desiredRegistrationRef.current = null
    const registration = registeredTokenRef.current
    if (!previousSession?.access_token || registration?.userId !== previousSession.user.id) return

    registeredTokenRef.current = null
    void unregisterPushNotifications({
      accessToken: previousSession.access_token,
      token: registration.token,
    }).catch(() => undefined)
  }, [])

  useEffect(() => {
    const registrationSession = input.session
    const userId = registrationSession?.user.id ?? null
    if (input.disabled || !registrationSession || !userId || !input.role || !input.profileReady) {
      desiredRegistrationRef.current = null
      if (registrationKeyRef.current !== null) registrationAttemptRef.current += 1
      registrationKeyRef.current = null
      return
    }

    const registrationKey = `${userId}:${input.role}`
    const desiredRegistration: DesiredPushRegistration = {
      accessToken: registrationSession.access_token,
      key: registrationKey,
      role: input.role,
      userId,
    }
    desiredRegistrationRef.current = desiredRegistration
    if (registrationKeyRef.current === registrationKey) return
    registrationKeyRef.current = registrationKey
    const registrationAttempt = ++registrationAttemptRef.current
    const isCurrentAttempt = () => (
      registrationAttemptRef.current === registrationAttempt
      && registrationKeyRef.current === registrationKey
      && desiredRegistrationRef.current?.key === registrationKey
      && input.sessionRef.current?.user.id === userId
    )

    void setupPushNotifications({
      accessToken: desiredRegistration.accessToken,
      role: desiredRegistration.role,
    }).then((result) => {
      if (result.status === 'registered' && isCurrentAttempt()) {
        const previousRegistration = registeredTokenRef.current
        registeredTokenRef.current = { token: result.token, userId }
        if (previousRegistration?.userId === userId && previousRegistration.token !== result.token) {
          void unregisterPushNotifications({
            accessToken: desiredRegistration.accessToken,
            token: previousRegistration.token,
          }).catch(() => undefined)
        }
        return
      }

      if (result.status === 'registered') {
        const latestDesired = desiredRegistrationRef.current
        const currentRegistration = registeredTokenRef.current
        const sameCurrentToken = latestDesired?.userId === userId
          && currentRegistration?.userId === userId
          && currentRegistration.token === result.token
        if (!sameCurrentToken) {
          void unregisterPushNotifications({
            accessToken: desiredRegistration.accessToken,
            token: result.token,
          }).catch(() => undefined)
        }

        if (!mountedRef.current || !latestDesired) return
        if (latestDesired.key !== registrationKey) {
          registrationAttemptRef.current += 1
          registrationKeyRef.current = null
          retryRegistration()
        } else if (registrationKeyRef.current === null) {
          retryRegistration()
        }
        return
      }

      if (result.status === 'error' && isCurrentAttempt()) registrationKeyRef.current = null
    }).catch(() => {
      if (isCurrentAttempt()) registrationKeyRef.current = null
    })
  }, [input.disabled, input.profileReady, input.role, input.session, input.sessionRef, registrationRevision])

  return unregisterForSession
}
