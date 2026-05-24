import { Redirect } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { useAuth } from '@/lib/auth-provider'

export default function Index() {
  const { session, role, loading } = useAuth()

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    )
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />
  }

  // Phase 5.1 (plan §22.10.B, 2026-05-23): admin gets its own (admin) shell so
  // admin actions are visually + structurally separated from customer/worker.
  if (role === 'admin') {
    return <Redirect href="/(admin)/dashboard" />
  }

  if (role === 'worker') {
    return <Redirect href="/(worker)/home" />
  }

  if (role === 'customer') {
    return <Redirect href="/(customer)/home" />
  }

  return <Redirect href="/(auth)/login" />
}
