import { Slot, useLocalSearchParams, usePathname } from 'expo-router'
import { View } from 'react-native'
import { WorkerDockLayoutProvider, WorkerRebuildDockOverlay } from '@/components/worker/worker-surfaces'
import { resolveWorkerV5DockActive, resolveWorkerV5DockVisible } from '@/components/worker/dock/routing'
import type { WorkerV5RouteParams } from '@/components/worker/dock/types'
import { getWorkerThemeTokens, useWorkerThemeMode } from '@/components/worker/worker-theme'
import { OfflineStatusPill } from '@/components/ui/offline-status-pill'

function WorkerFallbackTabs() {
  const workerThemeMode = useWorkerThemeMode()
  const workerThemeTokens = getWorkerThemeTokens(workerThemeMode)
  const pathname = usePathname()
  const params = useLocalSearchParams<WorkerV5RouteParams>()
  const activeDock = resolveWorkerV5DockActive(pathname, params)
  const dockVisible = resolveWorkerV5DockVisible(params)

  return (
    <WorkerDockLayoutProvider>
      <View style={{ backgroundColor: workerThemeTokens.canvas, flex: 1 }}>
        <Slot />
        {dockVisible ? <WorkerRebuildDockOverlay active={activeDock} /> : null}
        <OfflineStatusPill tokens={workerThemeTokens} />
      </View>
    </WorkerDockLayoutProvider>
  )
}

export default function WorkerTabsLayout() {
  return <WorkerFallbackTabs />
}
