import { Redirect, Tabs } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { color } from '@/design/theme'
import { useAuth } from '@/lib/auth-provider'
import { useAppLanguage } from '@/lib/app-language'

const WORKER_TAB_COPY = {
  vi: {
    chat: 'Tin nhắn',
    earnings: 'Thu nhập',
    home: 'Trang chủ',
    jobs: 'Công việc',
    profile: 'Hồ sơ',
  },
  en: {
    chat: 'Messages',
    earnings: 'Earnings',
    home: 'Home',
    jobs: 'Jobs',
    profile: 'Profile',
  },
} as const

export default function WorkerLayout() {
  const { loading, role, session } = useAuth()
  const language = useAppLanguage()
  const tabCopy = WORKER_TAB_COPY[language]

  if (loading) {
    return (
      <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator color={color.brand.primary} size="large" />
      </View>
    )
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />
  }

  if (role === 'customer') {
    return <Redirect href="/(customer)/home" />
  }

  if (role === 'admin') {
    return <Redirect href="/(admin)/dashboard" />
  }

  if (role !== 'worker') {
    return <Redirect href="/(auth)/login" />
  }

  return (
    <View style={{ flex: 1 }}>
      <Tabs tabBar={() => null} screenOptions={{ headerShown: false }}>
        <Tabs.Screen name="home" options={{ title: tabCopy.home }} />
        <Tabs.Screen name="jobs" options={{ title: tabCopy.jobs }} />
        <Tabs.Screen name="chat" options={{ href: null, title: tabCopy.chat }} />
        <Tabs.Screen name="earnings" options={{ title: tabCopy.earnings }} />
        <Tabs.Screen name="profile" options={{ title: tabCopy.profile }} />
      </Tabs>
    </View>
  )
}
