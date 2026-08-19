import { NativeTabs } from 'expo-router/unstable-native-tabs'
import { Slot, useLocalSearchParams, usePathname } from 'expo-router'
import { Platform, View } from 'react-native'
import { WorkerDockLayoutProvider, WorkerRebuildDockOverlay } from '@/components/worker/worker-surfaces'
import { resolveWorkerV5DockActive } from '@/components/worker/dock/routing'
import type { WorkerV5RouteParams } from '@/components/worker/dock/types'
import { getWorkerThemeTokens, useWorkerThemeMode } from '@/components/worker/worker-theme'
import { color } from '@/design/theme'
import { useAppLanguage } from '@/lib/app-language'
import { NativeKaelBottomAccessory } from '@/components/ui/native-kael-bottom-accessory'

const workerTabCopy = {
  vi: {
    earnings: 'Thu nhập',
    home: 'Trang chủ',
    jobs: 'Công việc',
    profile: 'Hồ sơ',
  },
  en: {
    earnings: 'Earnings',
    home: 'Home',
    jobs: 'Jobs',
    profile: 'Profile',
  },
} as const

function WorkerNativeTabs() {
  const language = useAppLanguage()
  const tabCopy = workerTabCopy[language]

  return (
    <NativeTabs tintColor={color.brand.ios26TabTint} minimizeBehavior="never">
      <NativeTabs.BottomAccessory>
        <NativeKaelBottomAccessory route="/(worker)/chat" visualRole="worker" />
      </NativeTabs.BottomAccessory>
      <NativeTabs.Trigger name="home">
        <NativeTabs.Trigger.Icon sf="house" />
        <NativeTabs.Trigger.Label>{tabCopy.home}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="jobs">
        <NativeTabs.Trigger.Icon sf="square.grid.2x2" />
        <NativeTabs.Trigger.Label>{tabCopy.jobs}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="earnings">
        <NativeTabs.Trigger.Icon sf="clock" />
        <NativeTabs.Trigger.Label>{tabCopy.earnings}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Icon sf="person" />
        <NativeTabs.Trigger.Label>{tabCopy.profile}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  )
}

function WorkerFallbackTabs() {
  const workerThemeMode = useWorkerThemeMode()
  const workerThemeTokens = getWorkerThemeTokens(workerThemeMode)
  const pathname = usePathname()
  const params = useLocalSearchParams<WorkerV5RouteParams>()
  const activeDock = resolveWorkerV5DockActive(pathname, params)

  return (
    <WorkerDockLayoutProvider>
      <View style={{ backgroundColor: workerThemeTokens.canvas, flex: 1 }}>
        <Slot />
        <WorkerRebuildDockOverlay active={activeDock} />
      </View>
    </WorkerDockLayoutProvider>
  )
}

export default function WorkerTabsLayout() {
  return Platform.OS === 'ios' ? <WorkerNativeTabs /> : <WorkerFallbackTabs />
}
