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

  if (role === 'admin') {
    return <Redirect href="/(auth)/login" />
  }

  if (role === 'worker') {
    return <Redirect href="/(worker)/home" />
  }

  if (role === 'customer') {
    return <Redirect href="/(customer)/home" />
  }

  return <Redirect href="/(auth)/login" />
}
