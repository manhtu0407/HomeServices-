// Keep admin navigation separate so privileged actions cannot trigger
// customer or worker workflow side effects.
import { Redirect, Stack } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { useAuth } from '@/lib/auth-provider'
import { useAdminActivation } from '@/lib/admin-activation-provider'

export default function AdminLayout() {
  const { loading, role, session } = useAuth()
  const activation = useAdminActivation()

  if (loading || (session && activation.loading)) {
    return (
      <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    )
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />
  }
  if (activation.status?.required) return <Redirect href="/(auth)/admin-activation" />

  if (role !== 'admin' && role !== 'admin_operator') {
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
