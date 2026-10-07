import { Asset } from 'expo-asset'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect, useState } from 'react'

import { ASSETS as LOGIN_GATE_ASSETS } from '@/components/auth/entry-access/nestscout-login-gate/design'
import { useAdminActivation } from '@/lib/admin-activation-provider'
import { isAuthShellBlocking } from '@/lib/auth-loading-gate'
import { useAuth } from '@/lib/auth-provider'

// The native splash covers the route decision so a cold start never paints an empty canvas.
// The cap keeps a slow first-ever profile read on 3G from freezing the launch screen.
export const LAUNCH_SPLASH_MAX_MS = 3_000

let splashHidden = false

export function preventLaunchSplashAutoHide() {
  void SplashScreen.preventAutoHideAsync().catch(() => undefined)
}

function hideLaunchSplash() {
  if (splashHidden) return
  splashHidden = true
  void SplashScreen.hideAsync().catch(() => undefined)
}

export function LaunchSplashGate() {
  const { guestMode, loading, profileStatus, role, session } = useAuth()
  const activation = useAdminActivation()
  const routeBlocking = isAuthShellBlocking({ guestMode, loading, profileStatus, role, session })
    || Boolean(session && activation.loading && !activation.status)
  const showsLoginGate = !session && !guestMode
  const [loginArtReady, setLoginArtReady] = useState(false)

  useEffect(() => {
    if (!showsLoginGate) return
    let cancelled = false
    void Asset.loadAsync(Object.values(LOGIN_GATE_ASSETS))
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setLoginArtReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [showsLoginGate])

  const ready = !routeBlocking && (!showsLoginGate || loginArtReady)
  useEffect(() => {
    if (ready) hideLaunchSplash()
  }, [ready])

  useEffect(() => {
    const cap = setTimeout(hideLaunchSplash, LAUNCH_SPLASH_MAX_MS)
    return () => clearTimeout(cap)
  }, [])

  return null
}
