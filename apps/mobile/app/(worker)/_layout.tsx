import { Redirect } from 'expo-router'
import { Stack } from 'expo-router/stack'
import { AppLoadingShell } from '@/components/ui/app-loading-shell'
import { useAuth } from '@/lib/auth-provider'
import { isAuthShellBlocking } from '@/lib/auth-loading-gate'
import { useAdminActivation } from '@/lib/admin-activation-provider'

export default function WorkerLayout() {
  const { loading, profileStatus, role, session } = useAuth()
  const activation = useAdminActivation()
  const authShellBlocking = isAuthShellBlocking({ loading, profileStatus, role, session })
  const activationShellBlocking = Boolean(session && activation.loading && !activation.status)

  if (authShellBlocking || activationShellBlocking) {
    return <AppLoadingShell />
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
