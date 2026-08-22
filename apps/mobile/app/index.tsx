import { Redirect } from 'expo-router'
import { ActivityIndicator, Platform, View } from 'react-native'
import { useAuth } from '@/lib/auth-provider'
import { isAuthShellBlocking } from '@/lib/auth-loading-gate'
import { useAdminActivation } from '@/lib/admin-activation-provider'

export default function Index() {
  const { guestMode, session, role, loading, profileStatus } = useAuth()
  const activation = useAdminActivation()
  const authShellBlocking = isAuthShellBlocking({ guestMode, loading, profileStatus, role, session })
  const activationShellBlocking = Boolean(session && activation.loading && !activation.status)

  if (authShellBlocking || activationShellBlocking) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    )
  }

  if (guestMode) {
    return <Redirect href="/(customer)/(tabs)/home" />
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />
  }
  if (activation.status?.required) return <Redirect href="/(auth)/admin-activation" />

  // Admin actions stay visually and structurally separate from customer and worker flows.
  if (role === 'admin') {
    return <Redirect href="/(admin)/sections" />
  }

  if (role === 'admin_operator') {
    return <Redirect href="/(admin)/sections" />
  }

  if (role === 'worker') {
    return <Redirect href={workerAuditRedirectHref()} />
  }

  if (role === 'customer') {
    return <Redirect href="/(customer)/(tabs)/home" />
  }

  return <Redirect href="/(auth)/login" />
}

function workerAuditRedirectHref() {
  const query = localWebQuery()
  if (!query) return '/(worker)/(tabs)/home'

  const params = new URLSearchParams(query)
  if (params.get('ns_audit_role') !== 'worker') return '/(worker)/(tabs)/home'

  const screen = params.get('ns_worker_screen') ?? ''
  const path = screen.startsWith('2.')
    ? '/(worker)/(tabs)/jobs'
    : screen.startsWith('3.')
      ? '/(worker)/chat'
      : screen.startsWith('4.')
        ? '/(worker)/(tabs)/earnings'
        : screen.startsWith('5.')
          ? '/(worker)/(tabs)/profile'
          : '/(worker)/(tabs)/home'

  return `${path}?${params.toString()}`
}

function localWebQuery() {
  if (!__DEV__ || Platform.OS !== 'web') return ''

  const runtime = globalThis as typeof globalThis & {
    location?: {
      hostname?: string
      search?: string
    }
  }
  const hostname = runtime.location?.hostname ?? ''
  if (!['localhost', '127.0.0.1', '::1'].includes(hostname)) return ''

  return runtime.location?.search?.replace(/^\?/, '') ?? ''
}
