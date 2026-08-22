// Keep admin navigation separate so privileged actions cannot trigger
// customer or worker workflow side effects.
import { Redirect, Stack } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { useAuth } from '@/lib/auth-provider'
import { isAuthShellBlocking } from '@/lib/auth-loading-gate'
import { useAdminActivation } from '@/lib/admin-activation-provider'

export default function AdminLayout() {
  const { loading, profileStatus, role, session } = useAuth()
  const activation = useAdminActivation()
  const authShellBlocking = isAuthShellBlocking({ loading, profileStatus, role, session })
  const activationShellBlocking = Boolean(session && activation.loading && !activation.status)

  if (authShellBlocking || activationShellBlocking) {
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
