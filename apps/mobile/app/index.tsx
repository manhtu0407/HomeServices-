import { Redirect } from 'expo-router'
import { ActivityIndicator, Platform, View } from 'react-native'
import { useAuth } from '@/lib/auth-provider'

export default function Index() {
  const { guestMode, session, role, loading } = useAuth()

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    )
  }

  if (guestMode) {
    return <Redirect href="/(customer)/home" />
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />
  }

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
    return <Redirect href="/(customer)/home" />
  }

  return <Redirect href="/(auth)/login" />
}

function workerAuditRedirectHref() {
  const query = localWebQuery()
  if (!query) return '/(worker)/home'

  const params = new URLSearchParams(query)
  if (params.get('ns_audit_role') !== 'worker') return '/(worker)/home'

  const screen = params.get('ns_worker_screen') ?? ''
  const path = screen.startsWith('2.')
    ? '/(worker)/jobs'
    : screen.startsWith('3.')
      ? '/(worker)/chat'
      : screen.startsWith('4.')
        ? '/(worker)/earnings'
        : screen.startsWith('5.')
          ? '/(worker)/profile'
          : '/(worker)/home'

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
