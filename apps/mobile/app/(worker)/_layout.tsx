import { Redirect, Tabs } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { useAuth } from '@/lib/auth-provider'
import { useAppLanguage } from '@/lib/app-language'

const WORKER_DOCK_MAIN = 'WORKER_DOCK_MAIN: worker liquid glass dock'
const WORKER_DOCK_XANHSM_LAYER_MATCH = 'WORKER_DOCK_XANHSM_LAYER_MATCH: mint/cyan service-app dock'
void WORKER_DOCK_MAIN
void WORKER_DOCK_XANHSM_LAYER_MATCH

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

const dockTokens = {
  active: '#08786E',
}

export default function WorkerLayout() {
  const { loading, role, session } = useAuth()
  const language = useAppLanguage()
  const tabCopy = WORKER_TAB_COPY[language]

  if (loading) {
    return (
      <View style={{ alignItems: 'center', flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator color={dockTokens.active} size="large" />
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

  // Phase 5.1 (plan §22.10.B, 2026-05-23): admin no longer auto-bypass worker
  // shell. Admin gets its own (admin) shell. Worker shell strictly requires
  // role='worker' to prevent accidental admin actions in worker surfaces.
  if (role !== 'worker') {
    return <Redirect href="/(auth)/login" />
  }

  return (
    <Tabs tabBar={() => null} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="home" options={{ title: tabCopy.home }} />
      <Tabs.Screen name="jobs" options={{ title: tabCopy.jobs }} />
      <Tabs.Screen name="chat" options={{ title: tabCopy.chat }} />
      <Tabs.Screen name="earnings" options={{ title: tabCopy.earnings }} />
      <Tabs.Screen name="profile" options={{ title: tabCopy.profile }} />
    </Tabs>
  )
}
