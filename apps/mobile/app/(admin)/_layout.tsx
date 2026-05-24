// Phase 5.1 (plan §22.10.B, 2026-05-23): admin shell. Separated from
// customer/worker shells to avoid admin clicking customer or worker CTAs and
// triggering production workflow side effects. Admin uses Edge admin/audit
// routes only — never mutates customer/worker workflow rows directly.
import { Redirect, Stack } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { useAuth } from '@/lib/auth-provider'

export default function AdminLayout() {
  const { loading, role, session } = useAuth()

  if (loading) {
    return (
      <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    )
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />
  }

  if (role !== 'admin') {
    return <Redirect href="/(auth)/login" />
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  )
}
