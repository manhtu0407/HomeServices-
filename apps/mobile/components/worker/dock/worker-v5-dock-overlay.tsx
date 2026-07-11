import { useEffect, useRef, type ReactNode } from 'react'
import { Image } from 'expo-image'
import { Pressable, Text, View, useWindowDimensions, type ImageSourcePropType, type ViewStyle } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated'

import { getReducedTransparencyCustomerTokens, type CustomerThemeTokens } from '@/components/customer/customer-theme'
import {
  CUSTOMER_LIQUID_NAV_DOCK_HEIGHT,
  CUSTOMER_LIQUID_NAV_GAP,
  CUSTOMER_LIQUID_NAV_MAX_WIDTH,
  CUSTOMER_LIQUID_NAV_ORB_SIZE,
  CUSTOMER_LIQUID_NAV_RAIL_PADDING,
  CUSTOMER_LIQUID_NAV_SIDE_INSET,
  customerV21DockStyles as dockStyles,
} from '@/components/customer/v21/dock-styles'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { DockScrollStateProvider, useDockScrollState, useDockScrollTransform } from '@/components/ui/dock-scroll-state'
import { GlassSurface } from '@/components/ui/glass-surface'
import { KaelCoreV9 } from '@/components/ui/kael-core-v9'
import type { KaelCoreV9Handle } from '@/components/ui/kael-core-v9-contract'
import { motionTokens } from '@/components/ui/motion-tokens'
import { customerTheme } from '@/design/theme'

import { resolveWorkerV5DockActive, resolveWorkerV5Language, workerV5Routes } from './routing'
import type { WorkerDockActive, WorkerV5IconName, WorkerV5RouteParams } from './types'

const workerV5DockTokens = customerTheme.lightLayer as CustomerThemeTokens

const workerV5DockIcons: Record<Exclude<WorkerV5IconName, 'calendar' | 'camera' | 'chat' | 'clock' | 'document' | 'evidence' | 'map' | 'shield' | 'scope' | 'tools' | 'wallet'>, ImageSourcePropType> = {
  earnings: require('@/assets/worker-image-icons/nav-earnings.png') as ImageSourcePropType,
  home: require('@/assets/worker-image-icons/nav-home.png') as ImageSourcePropType,
  jobs: require('@/assets/worker-image-icons/nav-jobs.png') as ImageSourcePropType,
  profile: require('@/assets/worker-image-icons/nav-profile.png') as ImageSourcePropType,
}

const WORKER_V5_DOCK_ROUTE_ITEMS: ReadonlyArray<{
  icon: keyof typeof workerV5DockIcons
  id: Exclude<WorkerDockActive, 'kael'>
  label: Record<'en' | 'vi', string>
}> = [
  { icon: 'home', id: 'home', label: { en: 'Home', vi: 'Trang chủ' } },
  { icon: 'jobs', id: 'jobs', label: { en: 'Jobs', vi: 'Công việc' } },
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
  image,
  label,
  onPress,
  selected,
  testID,
  tokens,
}: {
  image: ImageSourcePropType
  label: string
  onPress: () => void
  selected: boolean
  testID: string
  tokens: CustomerThemeTokens
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
      <Image contentFit="contain" source={image} style={[dockStyles.dockIcon, selected ? dockStyles.dockIconActive : null]} />
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
  const { collapsed, resetDockScroll } = useDockScrollState()
  const animatedDockScrollStyle = useDockScrollTransform(collapsed, reduceMotion)
  const tokens = reduceTransparency ? getReducedTransparencyCustomerTokens(workerV5DockTokens) : workerV5DockTokens
  const resolvedActive = resolveWorkerV5DockActive(workerV5Routes[active], params)
  const activeTab = resolvedActive === WORKER_V5_DOCK_KAEL_ITEM.id ? null : resolvedActive
  const liquidNavWidth = Math.min(Math.max(width - CUSTOMER_LIQUID_NAV_SIDE_INSET * 2, 0), CUSTOMER_LIQUID_NAV_MAX_WIDTH)
  const liquidDockWidth = Math.max(liquidNavWidth - CUSTOMER_LIQUID_NAV_ORB_SIZE - CUSTOMER_LIQUID_NAV_GAP, CUSTOMER_LIQUID_NAV_DOCK_HEIGHT)
  const selectedIndex = activeTab ? WORKER_V5_DOCK_ROUTE_ITEMS.findIndex((item) => item.id === activeTab) : -1
  const settledIndex = selectedIndex >= 0 ? selectedIndex : 0
  const lensWidth = Math.max((liquidDockWidth - CUSTOMER_LIQUID_NAV_RAIL_PADDING * 2) / WORKER_V5_DOCK_ROUTE_ITEMS.length, 0)
  const previousIndexRef = useRef(settledIndex)
  const lensX = useSharedValue(settledIndex * lensWidth)
  const lensScaleX = useSharedValue(1)
  const lensScaleY = useSharedValue(1)
  const lensRadius = useSharedValue(24)
  const lensSkew = useSharedValue(0)
  const lensSheenX = useSharedValue(-84)
  const lensSheenOpacity = useSharedValue(0)
  const dockShimmerX = useSharedValue((0.18 + settledIndex * 0.22) * liquidDockWidth)
  const dockCausticX = useSharedValue(settledIndex * lensWidth)
  const kaelRef = useRef<KaelCoreV9Handle>(null)
  const kaelActive = resolvedActive === WORKER_V5_DOCK_KAEL_ITEM.id
  const dockCausticWidth = Math.min(118, Math.max(lensWidth + 48, 72))
  const dockCausticLeft = (lensWidth - dockCausticWidth) / 2
  const liquidDockStyles = dockStyles as typeof dockStyles & Record<
    | 'dockCaustic'
    | 'dockCausticGlow'
    | 'dockCausticSweep'
    | 'dockCausticSweepBright'
    | 'dockInnerRefraction'
    | 'dockLens'
    | 'dockLensBloom'
    | 'dockLensInnerShadow'
    | 'dockLensSheen'
    | 'dockLensTopLight'
    | 'dockRow'
    | 'dockShimmer',
    ViewStyle
  >
  const animatedLensStyle = useAnimatedStyle(() => ({
    borderRadius: lensRadius.value,
    transform: [{ translateX: lensX.value }, { scaleX: lensScaleX.value }, { scaleY: lensScaleY.value }, { skewX: `${lensSkew.value}deg` }],
    width: lensWidth,
  }), [lensWidth])
  const animatedLensSheenStyle = useAnimatedStyle(() => ({
    opacity: lensSheenOpacity.value,
    transform: [{ translateX: lensSheenX.value }, { rotate: '-12deg' }],
  }))
  const animatedDockShimmerStyle = useAnimatedStyle(() => ({
    opacity: reduceTransparency ? 0 : 0.73,
    transform: [{ translateX: dockShimmerX.value }],
  }), [reduceTransparency])
  const animatedDockCausticStyle = useAnimatedStyle(() => ({
    opacity: reduceTransparency ? 0 : 1,
    transform: [{ translateX: dockCausticX.value }],
  }), [reduceTransparency])

  useEffect(() => {
    resetDockScroll()
  }, [active, resetDockScroll])

  const animateDockSelection = (nextIndex: number) => {
    if (nextIndex < 0) return

    const targetX = nextIndex * lensWidth
    const shimmerTarget = (0.18 + nextIndex * 0.22) * liquidDockWidth
    const causticTarget = nextIndex * lensWidth
    const delta = nextIndex - previousIndexRef.current

    cancelAnimation(lensX)
    cancelAnimation(lensScaleX)
    cancelAnimation(lensScaleY)
    cancelAnimation(lensRadius)
    cancelAnimation(lensSkew)
    cancelAnimation(lensSheenX)
    cancelAnimation(lensSheenOpacity)
    cancelAnimation(dockShimmerX)
    cancelAnimation(dockCausticX)

    if (reduceMotion || delta === 0) {
      lensX.value = withTiming(targetX, { duration: 120 })
      lensScaleX.value = 1
      lensScaleY.value = 1
      lensRadius.value = 24
      lensSkew.value = 0
      dockShimmerX.value = withTiming(shimmerTarget, { duration: 160 })
      dockCausticX.value = withTiming(causticTarget, { duration: 160 })
      previousIndexRef.current = nextIndex
      return
    }

    const stretch = Math.min(1.21, 1.08 + Math.abs(delta) * 0.045)
    const direction = Math.sign(delta)
    lensX.value = withSpring(targetX, motionTokens.liquid.pill)
    lensScaleX.value = withSequence(withTiming(stretch, { duration: 235 }), withSpring(0.965, motionTokens.liquid.press), withSpring(1, motionTokens.liquid.press))
    lensScaleY.value = withSequence(withTiming(0.91, { duration: 235 }), withSpring(1.035, motionTokens.liquid.press), withSpring(1, motionTokens.liquid.press))
    lensRadius.value = withSequence(withTiming(27, { duration: 235 }), withTiming(22, { duration: 190 }), withSpring(24, motionTokens.liquid.press))
    lensSkew.value = withSequence(withTiming(direction * -2.2, { duration: 235 }), withTiming(0, { duration: 325 }))
    lensSheenX.value = -84
    lensSheenOpacity.value = withSequence(withTiming(0.84, { duration: 90 }), withTiming(0, { duration: 270 }))
    lensSheenX.value = withTiming(84, { duration: 360 })
    dockShimmerX.value = withTiming(shimmerTarget, { duration: 580 })
    dockCausticX.value = withTiming(causticTarget, { duration: 560 })
    previousIndexRef.current = nextIndex
  }

  const openKael = () => {
    router.replace(workerV5Routes[WORKER_V5_DOCK_KAEL_ITEM.id] as never)
  }

  return (
    <View pointerEvents="box-none" style={dockStyles.dockOverlay} testID="worker-v5-dock-overlay">
      <Animated.View style={[liquidDockStyles.dockRow, { width: liquidNavWidth }, animatedDockScrollStyle]} testID="worker-v5-liquid-navigation">
        <GlassSurface
          backgroundColor={tokens.glass}
          borderColor={tokens.glassBorder}
          material="liquid"
          mode={tokens.mode}
          style={[dockStyles.dockPlane, { width: liquidDockWidth }]}
          testID="worker-v5-primary-dock"
          variant="nav"
        >
          <Animated.View pointerEvents="none" style={[liquidDockStyles.dockShimmer, { width: liquidDockWidth * 0.72 }, animatedDockShimmerStyle]} testID="worker-v5-dock-shimmer" />
          <View pointerEvents="none" style={liquidDockStyles.dockCaustic} testID="worker-v5-dock-caustic">
            <Animated.View pointerEvents="none" style={[liquidDockStyles.dockCausticGlow, { left: dockCausticLeft, width: dockCausticWidth }, animatedDockCausticStyle]} testID="worker-v5-dock-caustic-glow" />
            <View pointerEvents="none" style={liquidDockStyles.dockCausticSweep} testID="worker-v5-dock-caustic-sweep" />
            <View pointerEvents="none" style={liquidDockStyles.dockCausticSweepBright} testID="worker-v5-dock-caustic-sweep-bright" />
          </View>
          <View pointerEvents="none" style={liquidDockStyles.dockInnerRefraction} testID="worker-v5-dock-inner-refraction" />
          {selectedIndex >= 0 ? (
            <Animated.View pointerEvents="none" style={[liquidDockStyles.dockLens, animatedLensStyle]} testID="worker-v5-dock-lens">
              <View pointerEvents="none" style={liquidDockStyles.dockLensBloom} testID="worker-v5-dock-lens-bloom" />
              <View pointerEvents="none" style={liquidDockStyles.dockLensTopLight} testID="worker-v5-dock-lens-top-light" />
              <Animated.View pointerEvents="none" style={[liquidDockStyles.dockLensSheen, animatedLensSheenStyle]} testID="worker-v5-dock-lens-sheen" />
              <View pointerEvents="none" style={liquidDockStyles.dockLensInnerShadow} testID="worker-v5-dock-lens-inner-shadow" />
            </Animated.View>
          ) : null}
          {WORKER_V5_DOCK_ROUTE_ITEMS.map((item, index) => (
            <WorkerV5DockTabButton
              image={workerV5DockIcons[item.icon]}
              key={item.id}
              label={item.label[language]}
              onPress={() => {
                animateDockSelection(index)
                router.replace(workerV5Routes[item.id] as never)
              }}
              selected={activeTab === item.id}
              testID={`worker-v5-dock-${item.id}`}
              tokens={tokens}
            />
          ))}
        </GlassSurface>
        <Pressable
          accessibilityLabel={WORKER_V5_DOCK_KAEL_ITEM.label[language]}
          accessibilityRole="button"
          accessibilityState={{ selected: kaelActive }}
          onFocus={() => kaelRef.current?.bow('focus')}
          onHoverIn={() => kaelRef.current?.bow('proximity')}
          onPress={openKael}
          onPressIn={() => kaelRef.current?.bow('pointer-press')}
          style={[dockStyles.kaelAccessory, kaelActive ? dockStyles.kaelAccessoryActive : null]}
          testID="worker-v5-kael-accessory"
        >
          <KaelCoreV9 reduceMotion={reduceMotion} ref={kaelRef} testID="worker-v5-kael-core-v9" />
        </Pressable>
      </Animated.View>
    </View>
  )
}
