import { type ReactNode, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated'
import { useGlassAccessibility } from './accessibility-motion'
import { GlassSurface } from './glass-surface'
import { reduceMotionAwarePressStyle } from './reduce-motion-aware-animation'
import { type GlassMode } from './tokens'

export type FloatingGlassTabItem<Key extends string> = {
  accessibilityLabel?: string
  key: Key
  label?: string
  testID?: string
}

type FloatingGlassTabBarProps<Key extends string, Item extends FloatingGlassTabItem<Key> = FloatingGlassTabItem<Key>> = {
  activeKey: Key
  iconForItem: (item: Item, focused: boolean) => ReactNode
  items: Item[]
  mode?: GlassMode
  onItemPress: (item: Item) => void
  previousKey?: Key
  style?: StyleProp<ViewStyle>
  testID?: string
}

const rememberedDockActiveKey = new Map<string, string>()
const pendingDockTransitionById = new Map<string, { from: string; to: string }>()
const pendingDockTransitionTtlMs = 700

export function FloatingGlassTabBar<Key extends string, Item extends FloatingGlassTabItem<Key> = FloatingGlassTabItem<Key>>({
  activeKey,
  iconForItem,
  items,
  mode = 'light',
  onItemPress,
  previousKey,
  style,
  testID,
}: FloatingGlassTabBarProps<Key, Item>) {
  const { reduceMotion, reduceTransparency } = useGlassAccessibility()
  const previousActiveKeyRef = useRef(activeKey)
  const pendingTransition = useMemo(() => {
    if (!testID) return null
    const pending = pendingDockTransitionById.get(testID)
    if (!pending) return null
    if (pending.to !== activeKey) return null
    return { from: pending.from as Key, to: pending.to as Key }
  }, [activeKey, testID])
  const [optimisticTransition, setOptimisticTransition] = useState<{ from: Key; to: Key } | null>(() => pendingTransition)
  const displayActiveKey = optimisticTransition?.to ?? activeKey
  const activeKeyChanged = previousActiveKeyRef.current !== activeKey
  const routePreviousKey = previousActiveKeyRef.current !== displayActiveKey ? previousActiveKeyRef.current : undefined
  const rememberedPreviousKey = testID ? rememberedDockActiveKey.get(testID) as Key | undefined : undefined
  const effectivePreviousKey = optimisticTransition?.from ?? (previousKey && previousKey !== displayActiveKey
    ? previousKey
    : routePreviousKey && routePreviousKey !== displayActiveKey
      ? routePreviousKey
      : rememberedPreviousKey && rememberedPreviousKey !== displayActiveKey
        ? rememberedPreviousKey
        : previousKey)
  const [barWidth, setBarWidth] = useState(0)
  const [transitionVisible, dispatchTransitionVisibility] = useReducer((_: boolean, next: boolean) => next, Boolean(effectivePreviousKey && effectivePreviousKey !== displayActiveKey))
  const activeIndex = Math.max(0, items.findIndex((item) => item.key === displayActiveKey))
  const canUsePreviousKey = Boolean(effectivePreviousKey) && effectivePreviousKey !== displayActiveKey
  const previousIndex = canUsePreviousKey && effectivePreviousKey ? Math.max(0, items.findIndex((item) => item.key === effectivePreviousKey)) : activeIndex
  const effectiveBarWidth = barWidth > 0 ? barWidth : 392
  const bridgeOpacity = useSharedValue(0)
  const bridgeScaleX = useSharedValue(0.72)
  const travelProgress = useSharedValue(1)
  const travelOpacity = useSharedValue(1)
  const pillScaleX = useSharedValue(1)
  const pillScaleY = useSharedValue(1)
  const slotMetrics = useMemo(() => {
    const itemCount = Math.max(items.length, 1)
    const dockPadding = 9
    const pillWidth = 61
    const innerWidth = Math.max(effectiveBarWidth - dockPadding * 2, 0)
    const slotWidth = innerWidth / itemCount
    const slotLeft = (index: number) => dockPadding + (slotWidth * index) + ((slotWidth - pillWidth) / 2)
    return { pillWidth, slotLeft, slotWidth }
  }, [effectiveBarWidth, items.length])
  const bridgeMetrics = useMemo(() => {
    const previousLeft = slotMetrics.slotLeft(previousIndex)
    const activeLeft = slotMetrics.slotLeft(activeIndex)
    return {
      left: Math.min(previousLeft, activeLeft),
      width: Math.abs(previousLeft - activeLeft) + slotMetrics.pillWidth,
    }
  }, [activeIndex, previousIndex, slotMetrics])
  const travelStartLeft = useMemo(() => {
    return slotMetrics.slotLeft(previousIndex)
  }, [previousIndex, slotMetrics])
  const transitionActive = transitionVisible || Boolean(
    (optimisticTransition && optimisticTransition.from !== optimisticTransition.to) ||
    activeKeyChanged,
  )
  useEffect(() => {
    previousActiveKeyRef.current = activeKey
  }, [activeKey])

  useEffect(() => {
    if (reduceMotion || previousIndex === activeIndex) {
      dispatchTransitionVisibility(false)
      if (testID) rememberedDockActiveKey.set(testID, displayActiveKey)
      return
    }

    dispatchTransitionVisibility(true)
    const timer = setTimeout(() => {
      dispatchTransitionVisibility(false)
      if (testID) rememberedDockActiveKey.set(testID, displayActiveKey)
    }, 560)
    return () => clearTimeout(timer)
  }, [activeIndex, displayActiveKey, previousIndex, reduceMotion, testID])

  useEffect(() => {
    if (!optimisticTransition) return
    const timer = setTimeout(() => {
      setOptimisticTransition(null)
      if (testID) {
        const pending = pendingDockTransitionById.get(testID)
        if (pending?.to === optimisticTransition.to) pendingDockTransitionById.delete(testID)
      }
    }, 620)
    return () => clearTimeout(timer)
  }, [optimisticTransition, testID])

  useEffect(() => {
    if (reduceMotion || previousIndex === activeIndex) {
      bridgeOpacity.value = 0
      bridgeScaleX.value = 0.72
      travelOpacity.value = 0
      travelProgress.value = 1
      pillScaleX.value = 1
      pillScaleY.value = 1
      return
    }

    bridgeOpacity.value = 0
    bridgeScaleX.value = 0.42
    travelOpacity.value = 0
    travelProgress.value = 0
    pillScaleX.value = 0.78
    pillScaleY.value = 1.06
    bridgeOpacity.value = withSequence(
      withTiming(reduceTransparency ? 0.34 : 0.58, { duration: 110 }),
      withTiming(reduceTransparency ? 0.12 : 0.24, { duration: 150 }),
      withTiming(0, { duration: 190 }),
    )
    bridgeScaleX.value = withSequence(
      withTiming(1, { duration: 150 }),
      withTiming(0.92, { duration: 150 }),
      withTiming(0.72, { duration: 150 }),
    )
    travelProgress.value = withSequence(
      withTiming(1.08, { duration: 180 }),
      withTiming(1, { duration: 180 }),
    )
    travelOpacity.value = withSequence(
      withTiming(reduceTransparency ? 0.46 : 0.62, { duration: 80 }),
      withTiming(reduceTransparency ? 0.36 : 0.48, { duration: 180 }),
      withTiming(0, { duration: 190 }),
    )
    pillScaleX.value = withSequence(
      withTiming(1.1, { duration: 150 }),
      withTiming(0.985, { duration: 120 }),
      withTiming(1, { duration: 120 }),
    )
    pillScaleY.value = withSequence(
      withTiming(0.94, { duration: 150 }),
      withTiming(1.015, { duration: 120 }),
      withTiming(1, { duration: 120 }),
    )
    return () => {
      cancelAnimation(bridgeOpacity)
      cancelAnimation(bridgeScaleX)
      cancelAnimation(pillScaleX)
      cancelAnimation(pillScaleY)
      cancelAnimation(travelOpacity)
      cancelAnimation(travelProgress)
    }
  }, [activeIndex, bridgeOpacity, bridgeScaleX, pillScaleX, pillScaleY, previousIndex, reduceMotion, reduceTransparency, travelOpacity, travelProgress])

  const bridgeAnimatedStyle = useAnimatedStyle(() => ({
    opacity: bridgeOpacity.value,
    transform: [{ scaleX: bridgeScaleX.value }],
  }), [bridgeOpacity, bridgeScaleX])
  const travelAnimatedStyle = useAnimatedStyle(() => {
    if (reduceMotion) return { opacity: 0 }
    const previousLeft = slotMetrics.slotLeft(previousIndex)
    const activeLeft = slotMetrics.slotLeft(activeIndex)
    return {
      opacity: travelOpacity.value,
      transform: [
        { translateX: (activeLeft - previousLeft) * travelProgress.value },
        { scaleX: pillScaleX.value },
        { scaleY: pillScaleY.value },
      ],
    }
  }, [activeIndex, barWidth, items.length, pillScaleX, pillScaleY, previousIndex, reduceMotion, travelOpacity, travelProgress])

  return (
    <GlassSurface
      mode={mode}
      onLayout={(event) => {
        const nextWidth = event.nativeEvent.layout.width
        setBarWidth((current) => Math.abs(current - nextWidth) > 0.5 ? nextWidth : current)
      }}
      style={[styles.bar, style]}
      testID={testID}
      variant="nav"
    >
      <View pointerEvents="none" style={styles.hiddenMarker} testID="liquid-toolbar-selection" />
      <View pointerEvents="none" style={styles.hiddenMarker} testID="toolbar-active-pill-icon-label" />
      <View pointerEvents="none" style={styles.hiddenMarker} testID="toolbar-inactive-compact-icon-label" />
      {transitionActive ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.liquidBridge,
            {
              backgroundColor: reduceTransparency
                ? mode === 'dark'
                  ? '#14372F'
                  : '#E2F8F1'
                : mode === 'dark'
                  ? 'rgba(105,222,198,0.09)'
                  : 'rgba(128,244,222,0.26)',
              left: bridgeMetrics.left,
              width: bridgeMetrics.width,
            },
            bridgeAnimatedStyle,
          ]}
          testID="liquid-toolbar-bridge"
        >
          <View style={[styles.liquidBridgeGlow, { backgroundColor: reduceTransparency ? (mode === 'dark' ? '#1E4A41' : '#F4FFFB') : mode === 'dark' ? 'rgba(105,222,198,0.11)' : 'rgba(255,255,255,0.34)' }]} />
        </Animated.View>
      ) : null}
      {!reduceMotion && transitionActive ? (
        <Animated.View
          pointerEvents="none"
          style={[
            liquidPillBaseStyle(mode, reduceTransparency),
            styles.travelingLiquidPill,
            { left: travelStartLeft },
            travelAnimatedStyle,
          ]}
          testID="liquid-toolbar-travel-pill"
        >
          {liquidPillFill(mode, reduceTransparency, 'traveling')}
        </Animated.View>
      ) : null}
      {items.map((item) => {
        const focused = item.key === displayActiveKey
        const labelColor = focused
          ? mode === 'dark'
            ? '#CFF7EE'
            : '#034D44'
          : mode === 'dark'
            ? '#8FB0AA'
            : '#66827B'
        const liquidPillStyle = liquidPillBaseStyle(mode, reduceTransparency)
        const liquidPillChildren = liquidPillFill(mode, reduceTransparency)
        return (
          <Pressable
            accessibilityLabel={item.accessibilityLabel ?? item.label}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            key={item.key}
            onPress={() => {
              if (item.key !== displayActiveKey) {
                if (testID) {
                  const pendingTransition = { from: displayActiveKey, to: item.key }
                  pendingDockTransitionById.set(testID, pendingTransition)
                  setTimeout(() => {
                    const current = pendingDockTransitionById.get(testID)
                    if (current?.from === pendingTransition.from && current.to === pendingTransition.to) pendingDockTransitionById.delete(testID)
                  }, pendingDockTransitionTtlMs)
                }
                setOptimisticTransition({ from: displayActiveKey, to: item.key })
              }
              if (testID && item.key !== displayActiveKey) rememberedDockActiveKey.set(testID, displayActiveKey)
              onItemPress(item)
            }}
            style={({ pressed }) => [
              styles.item,
              focused && !reduceMotion ? styles.itemFocused : null,
              reduceMotionAwarePressStyle(pressed, reduceMotion),
            ]}
            testID={item.testID}
          >
            {focused ? (
              <View pointerEvents="none" style={[liquidPillStyle, !reduceMotion ? styles.settledLiquidPill : null, transitionActive && !reduceMotion ? styles.settledLiquidPillHidden : null]} testID={`liquid-toolbar-selection-${item.key}`}>
                {liquidPillChildren}
              </View>
            ) : null}
            <View style={[styles.iconStage, focused && !reduceMotion ? styles.iconStageFocused : null]} testID={focused ? `liquid-toolbar-icon-pop-${item.key}` : undefined}>
              {focused && !reduceTransparency ? (
                <View pointerEvents="none" style={styles.hiddenMarker} testID={`liquid-toolbar-icon-luma-${item.key}`} />
              ) : null}
              {iconForItem(item, focused)}
            </View>
            {item.label ? (
              <Text adjustsFontSizeToFit minimumFontScale={0.82} numberOfLines={1} style={[styles.label, focused ? styles.labelFocused : styles.labelInactive, { color: labelColor }]}>
                {item.label}
              </Text>
            ) : null}
          </Pressable>
        )
      })}
    </GlassSurface>
  )
}

function liquidPillBaseStyle(mode: GlassMode, reduceTransparency: boolean) {
  const lightLiquidGradient = 'radial-gradient(circle at 34% 22%, rgba(255,255,255,0.94), transparent 31%), linear-gradient(145deg, rgba(215,255,247,0.98), rgba(74,224,197,0.80))'
  return [
    styles.liquidPill,
    {
      backgroundColor: reduceTransparency
        ? mode === 'dark'
          ? '#163F36'
          : '#DDF6EF'
        : mode === 'dark'
          ? 'rgba(105,222,198,0.16)'
          : 'rgba(0,0,0,0)',
      backgroundImage: !reduceTransparency && mode === 'light' ? lightLiquidGradient : undefined,
      borderColor: reduceTransparency
        ? mode === 'dark'
          ? 'rgba(105,222,198,0.22)'
          : 'rgba(8,120,110,0.12)'
        : 'rgba(255,255,255,0)',
      borderWidth: reduceTransparency ? 1 : 0,
      experimental_backgroundImage: !reduceTransparency && mode === 'light' ? lightLiquidGradient : undefined,
    } as any,
  ]
}

function liquidPillFill(mode: GlassMode, reduceTransparency: boolean, phase: 'settled' | 'traveling' = 'settled') {
  if (reduceTransparency) {
    return (
      <>
        <View style={[styles.liquidTrail, { backgroundColor: mode === 'dark' ? '#1E4A41' : '#F4FFFB' }]} />
        <View style={[styles.liquidCore, { backgroundColor: mode === 'dark' ? '#24584D' : '#C6F2E8' }]} />
      </>
    )
  }

  if (phase === 'settled') {
    return (
      <View style={[styles.liquidSheen, { backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.52)' }]} />
    )
  }

  return (
    <>
      <View style={[styles.liquidTrail, { backgroundColor: mode === 'dark' ? 'rgba(105,222,198,0.10)' : 'rgba(163,255,235,0.22)' }]} />
      <View style={[styles.liquidCore, { backgroundColor: mode === 'dark' ? 'rgba(105,222,198,0.18)' : 'rgba(68,232,204,0.30)' }]} />
      <View style={[styles.liquidSheen, { backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.52)' }]} />
    </>
  )
}

const styles = StyleSheet.create({
  bar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'space-between',
    minHeight: 66,
    paddingHorizontal: 9,
    paddingVertical: 7,
    position: 'relative',
  },
  hiddenMarker: { height: 0, opacity: 0, position: 'absolute', width: 0 },
  item: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 24,
    flex: 1,
    gap: 3,
    justifyContent: 'center',
    minHeight: 50,
    position: 'relative',
    zIndex: 2,
  },
  itemFocused: {
    transform: [{ translateY: -2 }],
  },
  iconStage: {
    alignItems: 'center',
    height: 24,
    justifyContent: 'center',
    position: 'relative',
    transform: [{ scale: 1 }],
    width: 26,
  },
  iconStageFocused: {
    filter: Platform.OS === 'web' ? 'drop-shadow(0 6px 9px rgba(7,109,96,0.20))' : undefined,
    transform: [{ translateY: -1 }, { scale: 1.08 }],
  } as any,
  label: {
    fontWeight: '800',
    lineHeight: 13,
  },
  labelFocused: {
    fontSize: 8.8,
    opacity: 1,
  },
  labelInactive: {
    fontSize: 8.8,
    opacity: 0.5,
  },
  liquidCore: {
    borderRadius: 999,
    height: 36,
    opacity: 0.76,
    position: 'absolute',
    right: 6,
    top: 6,
    width: 36,
  },
  liquidBridge: {
    borderCurve: 'continuous',
    borderRadius: 999,
    height: 49,
    overflow: 'hidden',
    position: 'absolute',
    top: 8,
    zIndex: 1,
  },
  liquidBridgeGlow: {
    borderRadius: 999,
    bottom: 8,
    left: 12,
    opacity: 0.56,
    position: 'absolute',
    right: 12,
    top: 8,
  },
  liquidPill: {
    borderCurve: 'continuous',
    borderRadius: 25,
    borderWidth: 0,
    boxShadow: '0 14px 24px rgba(41,173,151,0.24), inset 0 1px 0 rgba(255,255,255,0.96)',
    height: 51,
    left: '50%',
    marginLeft: -30.5,
    overflow: 'hidden',
    position: 'absolute',
    top: 7,
    width: 61,
    zIndex: 0,
  },
  travelingLiquidPill: {
    left: 0,
    marginLeft: 0,
    zIndex: 1,
  },
  travelingLiquidPillVisible: {
    opacity: 1,
  },
  settledLiquidPill: {
    opacity: 0.92,
    zIndex: 0,
  },
  settledLiquidPillHidden: {
    opacity: 0,
  },
  liquidSheen: {
    borderRadius: 999,
    height: 11,
    left: 12,
    opacity: 0.52,
    position: 'absolute',
    right: 12,
    top: 6,
  },
  liquidTrail: {
    borderRadius: 999,
    height: 30,
    left: 7,
    opacity: 0.72,
    position: 'absolute',
    top: 11,
    width: 44,
  },
})
