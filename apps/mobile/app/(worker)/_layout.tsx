import { Redirect, Tabs, useLocalSearchParams, usePathname } from 'expo-router'
import { ActivityIndicator, View } from 'react-native'
import { WorkerDockLayoutProvider, WorkerRebuildDockOverlay } from '@/components/worker/worker-surfaces'
import { resolveWorkerV5DockActive } from '@/components/worker/dock/routing'
import type { WorkerV5RouteParams } from '@/components/worker/dock/types'
import { getWorkerThemeTokens, useWorkerThemeMode } from '@/components/worker/worker-theme'
import { color } from '@/design/theme'
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
  active: color.brand.primary,
}

export default function WorkerLayout() {
  const { loading, role, session } = useAuth()
  const language = useAppLanguage()
  const workerThemeMode = useWorkerThemeMode()
  const workerThemeTokens = getWorkerThemeTokens(workerThemeMode)
  const pathname = usePathname()
  const params = useLocalSearchParams<WorkerV5RouteParams>()
  const tabCopy = WORKER_TAB_COPY[language]
  const activeDock = resolveWorkerV5DockActive(pathname, params)
  const shouldShowDock = !pathname.includes('chat')

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

  if (role !== 'worker') {
    return <Redirect href="/(auth)/login" />
  }

  return (
    <WorkerDockLayoutProvider>
      <View style={{ backgroundColor: workerThemeTokens.canvas, flex: 1 }}>
        <Tabs tabBar={() => null} screenOptions={{ headerShown: false }}>
          <Tabs.Screen name="home" options={{ title: tabCopy.home }} />
          <Tabs.Screen name="jobs" options={{ title: tabCopy.jobs }} />
          <Tabs.Screen name="chat" options={{ href: null, title: tabCopy.chat }} />
          <Tabs.Screen name="earnings" options={{ title: tabCopy.earnings }} />
          <Tabs.Screen name="profile" options={{ title: tabCopy.profile }} />
        </Tabs>
        {shouldShowDock ? <WorkerRebuildDockOverlay active={activeDock} /> : null}
      </View>
    </WorkerDockLayoutProvider>
  )
}
