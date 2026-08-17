import { Redirect } from 'expo-router'
import { Stack } from 'expo-router/stack'
import { ActivityIndicator, View } from 'react-native'
import { color } from '@/design/theme'
import { useAuth } from '@/lib/auth-provider'
import { useAdminActivation } from '@/lib/admin-activation-provider'

export default function WorkerLayout() {
  const { loading, role, session } = useAuth()
  const activation = useAdminActivation()

  if (loading || (session && activation.loading)) {
    return (
      <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator color={color.brand.primary} size="large" />
      </View>
    )
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />
  }
  if (activation.status?.required) return <Redirect href="/(auth)/admin-activation" />

  if (role === 'customer') {
    return <Redirect href="/(customer)/(tabs)/home" />
  }

  if (role === 'admin') {
    return <Redirect href="/(admin)/sections" />
  }

  if (role === 'admin_operator') {
    return <Redirect href="/(admin)/sections" />
  }

  if (role !== 'worker') {
    return <Redirect href="/(auth)/login" />
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="chat" options={{ headerShown: false }} />
    </Stack>
  )
}
