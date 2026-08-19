import { Slot, useLocalSearchParams, usePathname } from 'expo-router'
import { View } from 'react-native'
import { WorkerDockLayoutProvider, WorkerRebuildDockOverlay } from '@/components/worker/worker-surfaces'
import { resolveWorkerV5DockActive } from '@/components/worker/dock/routing'
import type { WorkerV5RouteParams } from '@/components/worker/dock/types'
import { getWorkerThemeTokens, useWorkerThemeMode } from '@/components/worker/worker-theme'

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
  return <WorkerFallbackTabs />
}
