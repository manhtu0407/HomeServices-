import { useEffect, useState, type ReactNode } from 'react'
import { Pressable, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import Animated from 'react-native-reanimated'

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
import { GlassSurface } from '@/components/ui/glass-surface'
import { KaelNavigationAccessory } from '@/components/ui/kael-navigation-accessory'

import { LiquidNavIcon, type LiquidNavIconName } from '@/components/customer/dock/liquid-nav-icons'
import { LiquidSelectionLens } from '@/components/customer/dock/liquid-selection-lens'
import { resolveWorkerV5DockActive, resolveWorkerV5Language, workerV5Routes } from './routing'
import type { WorkerDockActive, WorkerV5RouteParams } from './types'
import {
  getReducedTransparencyWorkerTokens,
  getWorkerThemeTokens,
  type WorkerThemeTokens,
  useWorkerThemeMode,
} from '../worker-theme'

const WORKER_V5_DOCK_ROUTE_ITEMS: readonly {
  icon: LiquidNavIconName
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

function WorkerV5DockTabButton({
  icon,
  label,
  onPress,
  selected,
  testID,
  tokens,
}: {
  icon: LiquidNavIconName
  label: string
  onPress: () => void
  selected: boolean
  testID: string
  tokens: WorkerThemeTokens
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [dockStyles.dockItem, pressed ? dockStyles.dockItemPressed : null]}
      testID={testID}
    >
      <LiquidNavIcon
        color={selected ? tokens.primary : tokens.muted}
        name={icon}
        selected={selected}
        style={[dockStyles.dockIcon, selected ? dockStyles.dockIconActive : null]}
        testID={`${testID}-icon`}
      />
      <Text numberOfLines={1} style={[dockStyles.dockLabel, selected ? dockStyles.dockLabelActive : null, { color: selected ? tokens.primary : tokens.muted }]}>{label}</Text>
    </Pressable>
  )
}

export function WorkerRebuildDockOverlay({ active }: { active: WorkerDockActive }) {
  const router = useRouter()
  const params = useLocalSearchParams<WorkerV5RouteParams>()
  const language = resolveWorkerV5Language(params)
  const { width } = useWindowDimensions()
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
  const [surfaceWidth, setSurfaceWidth] = useState(0)
  const selectedIndex = activeTab === null ? null : Math.max(WORKER_V5_DOCK_ROUTE_ITEMS.findIndex((item) => item.id === activeTab), 0)
  const handleDockLayout = ({ nativeEvent: { layout } }: LayoutChangeEvent) => setSurfaceWidth(layout.width)

  useEffect(() => {
    resetDockScroll()
  }, [active, resetDockScroll])

  const openKael = () => {
    router.replace(workerV5Routes[WORKER_V5_DOCK_KAEL_ITEM.id] as never)
  }

  return (
    <View pointerEvents="box-none" style={dockStyles.dockOverlay} testID="worker-v5-dock-overlay">
      <Animated.View style={[dockStyles.dockRow, { width: liquidNavWidth }, animatedDockScrollStyle]} testID="worker-v5-liquid-navigation">
        <GlassSurface
          backgroundColor={tokens.glass}
          borderColor={tokens.glassBorder}
          material="liquid"
          mode={tokens.mode}
          onLayout={handleDockLayout}
          style={[dockStyles.dockPlane, { width: liquidDockWidth }]}
          testID="worker-v5-primary-dock"
          variant="nav"
        >
          <LiquidSelectionLens
            itemCount={WORKER_V5_DOCK_ROUTE_ITEMS.length}
            reduceMotion={reduceMotion}
            reduceTransparency={reduceTransparency}
            selectedIndex={selectedIndex}
            surfaceWidth={surfaceWidth}
            testID="worker-v5-dock"
          />
          {WORKER_V5_DOCK_ROUTE_ITEMS.map((item) => (
            <WorkerV5DockTabButton
              icon={item.icon}
              key={item.id}
              label={item.label[language]}
              onPress={() => router.replace(workerV5Routes[item.id] as never)}
              selected={activeTab === item.id}
              testID={`worker-v5-dock-${item.id}`}
              tokens={tokens}
            />
          ))}
        </GlassSurface>
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
