import { useEffect, type ReactNode } from 'react'
import { Platform, View, useWindowDimensions } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import Animated from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import {
  CUSTOMER_LIQUID_NAV_DOCK_HEIGHT,
  CUSTOMER_LIQUID_NAV_GAP,
  CUSTOMER_LIQUID_NAV_MAX_WIDTH,
  CUSTOMER_LIQUID_NAV_ORB_SIZE,
  CUSTOMER_LIQUID_NAV_SIDE_INSET,
  customerV21DockStyles as dockStyles,
} from '@/components/customer/dock/dock-styles'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { DockScrollStateProvider, useDockScrollState, useDockScrollTransform } from '@/components/ui/dock-scroll-state'
import { KaelNavigationAccessory } from '@/components/ui/kael-navigation-accessory'

import type { LiquidNavFilledIconName } from '@/components/customer/dock/liquid-nav-filled-icons'
import { LiquidTabPlane } from '@/components/customer/dock/liquid-tab-plane'
import { resolveWorkerV5DockActive, resolveWorkerV5Language, workerV5Routes } from './routing'
import type { WorkerDockActive, WorkerV5RouteParams } from './types'
import {
  getReducedTransparencyWorkerTokens,
  getWorkerThemeTokens,
  useWorkerThemeMode,
} from '../worker-theme'

const WORKER_V5_DOCK_ROUTE_ITEMS: readonly {
  icon: LiquidNavFilledIconName
  id: Exclude<WorkerDockActive, 'kael'>
  label: Record<'en' | 'vi', string>
}[] = [
  { icon: 'home', id: 'home', label: { en: 'Home', vi: 'Trang chủ' } },
  { icon: 'services', id: 'jobs', label: { en: 'Jobs', vi: 'Công việc' } },
  { icon: 'earnings', id: 'earnings', label: { en: 'Earnings', vi: 'Thu nhập' } },
  { icon: 'profile', id: 'profile', label: { en: 'Profile', vi: 'Hồ sơ' } },
]

const WORKER_V5_DOCK_KAEL_ITEM: {
  id: Extract<WorkerDockActive, 'kael'>
  label: Record<'en' | 'vi', string>
} = {
  id: 'kael',
  label: { en: 'Kael', vi: 'Kael' },
}

export function WorkerDockLayoutProvider({ children }: { children: ReactNode }) {
  return <DockScrollStateProvider>{children}</DockScrollStateProvider>
}

export function WorkerRebuildDockOverlay({ active }: { active: WorkerDockActive }) {
  const router = useRouter()
  const params = useLocalSearchParams<WorkerV5RouteParams>()
  const language = resolveWorkerV5Language(params)
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const { reduceMotion, reduceTransparency } = useGlassAccessibility()
  const workerThemeMode = useWorkerThemeMode()
  const { collapsed, resetDockScroll } = useDockScrollState()
  const animatedDockScrollStyle = useDockScrollTransform(collapsed, reduceMotion)
  const workerThemeTokens = getWorkerThemeTokens(workerThemeMode)
  const tokens = reduceTransparency ? getReducedTransparencyWorkerTokens(workerThemeTokens) : workerThemeTokens
  const resolvedActive = resolveWorkerV5DockActive(workerV5Routes[active], params)
  const activeTab = resolvedActive === WORKER_V5_DOCK_KAEL_ITEM.id ? null : resolvedActive
  const liquidNavWidth = Math.min(Math.max(width - CUSTOMER_LIQUID_NAV_SIDE_INSET * 2, 0), CUSTOMER_LIQUID_NAV_MAX_WIDTH)
  const liquidDockWidth = Math.max(liquidNavWidth - CUSTOMER_LIQUID_NAV_ORB_SIZE - CUSTOMER_LIQUID_NAV_GAP, CUSTOMER_LIQUID_NAV_DOCK_HEIGHT)
  const kaelActive = resolvedActive === WORKER_V5_DOCK_KAEL_ITEM.id

  useEffect(() => {
    resetDockScroll()
  }, [active, resetDockScroll])

  const openKael = () => {
    router.replace(workerV5Routes[WORKER_V5_DOCK_KAEL_ITEM.id] as never)
  }

  return (
    <View pointerEvents="box-none" style={[dockStyles.dockOverlay, { bottom: Platform.OS === 'ios' ? insets.bottom + 12 : 12 }]} testID="worker-v5-dock-overlay">
      <Animated.View style={[dockStyles.dockRow, { width: liquidNavWidth }, animatedDockScrollStyle]} testID="worker-v5-liquid-navigation">
        <LiquidTabPlane
          items={WORKER_V5_DOCK_ROUTE_ITEMS.map((item) => ({
            icon: item.icon,
            key: item.id,
            label: item.label[language],
            testID: `worker-v5-dock-${item.id}`,
          }))}
          onSelect={(id) => router.replace(workerV5Routes[id] as never)}
          reduceMotion={reduceMotion}
          reduceTransparency={reduceTransparency}
          selectedKey={activeTab}
          testID="worker-v5-primary-dock"
          tokens={tokens}
          width={liquidDockWidth}
        />
        <KaelNavigationAccessory
          accessibilityLabel={WORKER_V5_DOCK_KAEL_ITEM.label[language]}
          active={kaelActive}
          onPress={openKael}
          reduceMotion={reduceMotion}
          style={[dockStyles.kaelAccessory, kaelActive ? dockStyles.kaelAccessoryActive : null]}
          testID="worker-v5-kael-accessory"
          visualRole="worker"
        />
      </Animated.View>
    </View>
  )
}
