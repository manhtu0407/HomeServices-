import { type ReactNode, useEffect, useMemo, useReducer, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { cancelAnimation, useAnimatedStyle, useDerivedValue, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated'
import { color, typography } from '@/design/theme'
import { useGlassAccessibility } from './accessibility-motion'
import { GlassSurface } from './glass-surface'
import { motionTokens } from './motion-tokens'
import { reduceMotionAwarePressStyle } from './reduce-motion-aware-animation'
import { type GlassMaterial, type GlassMode } from './tokens'

export type FloatingGlassTabItem<Key extends string> = {
  accessibilityLabel?: string
  key: Key
  label?: string
  testID?: string
}

type FloatingGlassTabBarProps<Key extends string, Item extends FloatingGlassTabItem<Key> = FloatingGlassTabItem<Key>> = {
  activeKey: Key | null
  appearance?: 'signature' | 'appleLiquid'
  iconForItem: (item: Item, focused: boolean) => ReactNode
  items: Item[]
  material?: GlassMaterial
  mode?: GlassMode
  onItemPress: (item: Item) => void
  previousKey?: Key | null
  style?: StyleProp<ViewStyle>
  testID?: string
}

const rememberedDockActiveKey = new Map<string, string>()
const pendingDockTransitionById = new Map<string, { from: string; to: string }>()
const pendingDockTransitionTtlMs = 700
const LIQUID_PILL_ICON_CENTER_TOP = -1

export function FloatingGlassTabBar<Key extends string, Item extends FloatingGlassTabItem<Key> = FloatingGlassTabItem<Key>>({
  activeKey,
  appearance = 'signature',
  iconForItem,
  items,
  material = 'standard',
  mode = 'light',
  onItemPress,
  previousKey,
  style,
  testID,
}: FloatingGlassTabBarProps<Key, Item>) {
  const { reduceMotion, reduceTransparency } = useGlassAccessibility()
  const liquidMaterial = material === 'liquid'
  const appleLiquidAppearance = appearance === 'appleLiquid'
  const pendingTransition = useMemo(() => {
    if (activeKey === null) return null
    if (!testID) return null
    const pending = pendingDockTransitionById.get(testID)
    if (!pending) return null
    if (pending.to !== activeKey) return null
    return { from: pending.from as Key, to: pending.to as Key }
  }, [activeKey, testID])
  const [optimisticTransition, setOptimisticTransition] = useState<{ from: Key; to: Key } | null>(() => pendingTransition)
  const displayActiveKey = optimisticTransition?.to ?? activeKey
  const hasDisplayActive = displayActiveKey !== null
  const rememberedPreviousKey = testID ? rememberedDockActiveKey.get(testID) as Key | undefined : undefined
  const effectivePreviousKey = hasDisplayActive
    ? optimisticTransition?.from ?? (previousKey && previousKey !== displayActiveKey
      ? previousKey
      : rememberedPreviousKey && rememberedPreviousKey !== displayActiveKey
        ? rememberedPreviousKey
        : previousKey ?? undefined)
    : undefined
  const [barWidth, setBarWidth] = useState(0)
  const [transitionVisible, dispatchTransitionVisibility] = useReducer((_: boolean, next: boolean) => next, Boolean(effectivePreviousKey && effectivePreviousKey !== displayActiveKey))
  const activeIndex = hasDisplayActive ? Math.max(0, items.findIndex((item) => item.key === displayActiveKey)) : 0
  const canUsePreviousKey = Boolean(effectivePreviousKey) && effectivePreviousKey !== displayActiveKey
  const previousIndex = canUsePreviousKey && effectivePreviousKey ? Math.max(0, items.findIndex((item) => item.key === effectivePreviousKey)) : activeIndex
  const effectiveBarWidth = barWidth > 0 ? barWidth : 392
  const bridgeOpacity = useSharedValue(0)
  const bridgeScaleX = useSharedValue(0.72)
  const travelProgress = useSharedValue(1)
  const travelOpacity = useSharedValue(1)
  const pillScaleX = useSharedValue(1)
  const pillScaleY = useSharedValue(1)
  const surfaceSheenAnimatedStyle = useAnimatedStyle(() => {
    if (!liquidMaterial || reduceMotion || reduceTransparency || previousIndex === activeIndex) return { opacity: 0 }
    const progress = travelProgress.value
    return {
      opacity: Math.min(travelOpacity.value * 0.68, 0.48),
      transform: [{ translateX: -84 + progress * 168 }, { rotate: '-12deg' }],
    }
  }, [activeIndex, liquidMaterial, previousIndex, reduceMotion, reduceTransparency, travelOpacity, travelProgress])
  const slotMetrics = useMemo(() => {
    const itemCount = Math.max(items.length, 1)
    const dockPadding = appleLiquidAppearance ? 7 : 9
    const pillWidth = appleLiquidAppearance ? 65 : 61
    const innerWidth = Math.max(effectiveBarWidth - dockPadding * 2, 0)
    const slotWidth = innerWidth / itemCount
    return { dockPadding, pillWidth, slotWidth }
  }, [appleLiquidAppearance, effectiveBarWidth, items.length])
  const { dockPadding, pillWidth, slotWidth } = slotMetrics
  const slotLeftForIndex = (index: number) => dockPadding + (slotWidth * index) + ((slotWidth - pillWidth) / 2)
  const bridgeMetrics = useMemo(() => {
    const previousLeft = slotLeftForIndex(previousIndex)
    const activeLeft = slotLeftForIndex(activeIndex)
    return { left: Math.min(previousLeft, activeLeft), width: Math.abs(previousLeft - activeLeft) + pillWidth }
  }, [activeIndex, pillWidth, previousIndex, slotLeftForIndex])
  const travelStartLeft = useMemo(() => slotLeftForIndex(previousIndex), [previousIndex, slotLeftForIndex])
  const transitionActive = hasDisplayActive && (transitionVisible || Boolean(optimisticTransition && optimisticTransition.from !== optimisticTransition.to))
  const transitionDirection = activeIndex >= previousIndex ? 1 : -1
  const transitionVisibilityMs = appleLiquidAppearance ? 420 : 560
  const optimisticTransitionMs = appleLiquidAppearance ? 470 : 620
  const sliderTranslateX = useDerivedValue(() => {
    const targetX = dockPadding + (slotWidth * activeIndex) + ((slotWidth - pillWidth) / 2)
    return reduceMotion
      ? withTiming(targetX, { duration: 120 })
      : withSpring(targetX, motionTokens.liquid.pill)
  }, [activeIndex, dockPadding, pillWidth, reduceMotion, slotWidth])
  const sliderOpacity = useDerivedValue(() => withTiming(hasDisplayActive ? 1 : 0, { duration: hasDisplayActive && reduceMotion ? 80 : 120 }), [hasDisplayActive, reduceMotion])
  const segmentedSliderAnimatedStyle = useAnimatedStyle(() => ({
    opacity: sliderOpacity.value,
    transform: [{ translateX: sliderTranslateX.value }],
  }), [sliderOpacity, sliderTranslateX])

  useEffect(() => {
    if (reduceMotion || previousIndex === activeIndex) {
      dispatchTransitionVisibility(false)
      if (testID && displayActiveKey) rememberedDockActiveKey.set(testID, displayActiveKey)
      return
    }

    dispatchTransitionVisibility(true)
    const timer = setTimeout(() => {
      dispatchTransitionVisibility(false)
      if (testID && displayActiveKey) rememberedDockActiveKey.set(testID, displayActiveKey)
    }, transitionVisibilityMs)
    return () => clearTimeout(timer)
  }, [activeIndex, displayActiveKey, previousIndex, reduceMotion, testID, transitionVisibilityMs])

  useEffect(() => {
    if (!optimisticTransition) return
    const timer = setTimeout(() => {
      setOptimisticTransition(null)
      if (testID) {
        const pending = pendingDockTransitionById.get(testID)
        if (pending?.to === optimisticTransition.to) pendingDockTransitionById.delete(testID)
      }
    }, optimisticTransitionMs)
    return () => clearTimeout(timer)
  }, [optimisticTransition, optimisticTransitionMs, testID])

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
    bridgeScaleX.value = 0.26
    travelOpacity.value = 0
    travelProgress.value = 0
    pillScaleX.value = 0.68
    pillScaleY.value = 1.08
    if (liquidMaterial) {
      if (appleLiquidAppearance) {
        bridgeOpacity.value = withSequence(
          withTiming(reduceTransparency ? 0.18 : 0.34, { duration: 70 }),
          withTiming(0, { duration: 210 }),
        )
        bridgeScaleX.value = withSequence(
          withTiming(1.01, { duration: 120 }),
          withSpring(1, motionTokens.liquid.press),
        )
        travelProgress.value = withSequence(
          withTiming(0.94, { duration: 170 }),
          withSpring(1, motionTokens.liquid.press),
        )
        travelOpacity.value = withSequence(
          withTiming(reduceTransparency ? 0.70 : 1, { duration: 70 }),
          withTiming(reduceTransparency ? 0.66 : 0.98, { duration: 180 }),
          withTiming(0, { duration: 190 }),
        )
        pillScaleX.value = withSequence(
          withSpring(1.035, motionTokens.liquid.press),
          withSpring(1, motionTokens.liquid.press),
        )
        pillScaleY.value = withSequence(
          withSpring(0.985, motionTokens.liquid.press),
          withSpring(1, motionTokens.liquid.press),
        )
      } else {
        bridgeOpacity.value = withSequence(
          withTiming(reduceTransparency ? 0.48 : 0.90, { duration: 80 }),
          withTiming(reduceTransparency ? 0.30 : 0.62, { duration: 180 }),
          withTiming(0, { duration: 180 }),
        )
        bridgeScaleX.value = withSequence(
          withTiming(1.04, { duration: 155 }),
          withSpring(0.985, motionTokens.liquid.press),
        )
        travelProgress.value = withSequence(
          withTiming(0.92, { duration: 190 }),
          withSpring(1, motionTokens.liquid.press),
        )
        travelOpacity.value = withSequence(
          withTiming(reduceTransparency ? 0.56 : 0.92, { duration: 70 }),
          withTiming(reduceTransparency ? 0.48 : 0.84, { duration: 180 }),
          withTiming(0, { duration: 220 }),
        )
        pillScaleX.value = withSequence(
          withSpring(1.18, motionTokens.liquid.pill),
          withSpring(1, motionTokens.liquid.press),
        )
        pillScaleY.value = withSequence(
          withSpring(0.92, motionTokens.liquid.pill),
          withSpring(1, motionTokens.liquid.press),
        )
      }
    } else {
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
    }
    return () => {
      cancelAnimation(bridgeOpacity)
      cancelAnimation(bridgeScaleX)
      cancelAnimation(pillScaleX)
      cancelAnimation(pillScaleY)
      cancelAnimation(travelOpacity)
      cancelAnimation(travelProgress)
    }
  }, [activeIndex, appleLiquidAppearance, bridgeOpacity, bridgeScaleX, liquidMaterial, pillScaleX, pillScaleY, previousIndex, reduceMotion, reduceTransparency, travelOpacity, travelProgress])

  const bridgeAnimatedStyle = useAnimatedStyle(() => {
    const scaleX = bridgeScaleX.value
    const directionalOffset = ((1 - scaleX) * bridgeMetrics.width) / 2
    return {
      opacity: bridgeOpacity.value,
      transform: [
        { translateX: transitionDirection >= 0 ? -directionalOffset : directionalOffset },
        { scaleX },
      ],
    }
  }, [bridgeMetrics.width, bridgeOpacity, bridgeScaleX, transitionDirection])
  const travelAnimatedStyle = useAnimatedStyle(() => {
    if (reduceMotion) return { opacity: 0 }
    const previousLeft = dockPadding + (slotWidth * previousIndex) + ((slotWidth - pillWidth) / 2)
    const activeLeft = dockPadding + (slotWidth * activeIndex) + ((slotWidth - pillWidth) / 2)
    return {
      opacity: travelOpacity.value,
      transform: [
        { translateX: (activeLeft - previousLeft) * travelProgress.value },
        { scaleX: pillScaleX.value },
        { scaleY: pillScaleY.value },
      ],
    }
  }, [activeIndex, dockPadding, pillScaleX, pillScaleY, pillWidth, previousIndex, reduceMotion, slotWidth, travelOpacity, travelProgress])
  const pressItem = (item: Item) => {
    if (item.key !== displayActiveKey) {
      if (testID) {
        if (displayActiveKey) {
          const pendingTransition = { from: displayActiveKey, to: item.key }
          pendingDockTransitionById.set(testID, pendingTransition)
          setTimeout(() => {
            const current = pendingDockTransitionById.get(testID)
            if (current?.from === pendingTransition.from && current.to === pendingTransition.to) pendingDockTransitionById.delete(testID)
          }, pendingDockTransitionTtlMs)
        }
      }
      if (displayActiveKey) setOptimisticTransition({ from: displayActiveKey, to: item.key })
    }
    if (testID && item.key !== displayActiveKey && displayActiveKey) rememberedDockActiveKey.set(testID, displayActiveKey)
    onItemPress(item)
  }

  return (
    <GlassSurface
      material={material}
      mode={mode}
      onLayout={(event) => {
        const nextWidth = event.nativeEvent.layout.width
        setBarWidth((current) => Math.abs(current - nextWidth) > 0.5 ? nextWidth : current)
      }}
      style={[styles.bar, style]}
      testID={testID}
      variant="nav"
    >
      {liquidMaterial && !reduceTransparency ? (
        <>
          <View pointerEvents="none" style={[styles.liquidDockDepth, liquidDockDepthStyle(mode, appearance)]} testID="liquid-toolbar-depth" />
          <View pointerEvents="none" style={[styles.liquidDockRim, liquidDockRimStyle(mode, appearance)]} testID="liquid-toolbar-rim" />
          <Animated.View pointerEvents="none" style={[styles.liquidDockSpecularSheen, liquidDockSpecularSheenStyle(mode, appearance), surfaceSheenAnimatedStyle]} testID="liquid-toolbar-specular-sheen" />
        </>
      ) : null}
      {appleLiquidAppearance ? (
        <>
          <View pointerEvents="none" style={styles.hiddenMarker} testID="liquid-toolbar-apple-material" />
          <View pointerEvents="none" style={styles.hiddenMarker} testID="liquid-toolbar-segmented-control" />
          <View pointerEvents="none" style={styles.hiddenMarker} testID="liquid-toolbar-service-segment-motion" />
        </>
      ) : null}
      <View pointerEvents="none" style={styles.hiddenMarker} testID="liquid-toolbar-selection" />
      <View pointerEvents="none" style={styles.hiddenMarker} testID="toolbar-active-pill-icon-label" />
      <View pointerEvents="none" style={styles.hiddenMarker} testID="toolbar-inactive-compact-icon-label" />
      {appleLiquidAppearance ? (
        <Animated.View
          pointerEvents="none"
          style={[
            liquidPillBaseStyle(mode, reduceTransparency, appearance),
            styles.segmentedLiquidSliderThumb,
            { width: pillWidth },
            segmentedSliderAnimatedStyle,
          ]}
          testID="liquid-toolbar-slider-thumb"
        >
          {liquidPillFill(mode, reduceTransparency, 'settled', appearance)}
        </Animated.View>
      ) : null}
      {!appleLiquidAppearance && transitionActive ? (
        <Animated.View
          pointerEvents="none"
            style={[
              styles.liquidBridge,
              appleLiquidAppearance ? styles.appleLiquidBridge : null,
              {
                left: bridgeMetrics.left,
                width: bridgeMetrics.width,
            },
            liquidBridgeSurfaceStyle(mode, reduceTransparency, transitionDirection, appearance),
            bridgeAnimatedStyle,
          ]}
          testID="liquid-toolbar-bridge"
        >
          <View style={[styles.liquidBridgeGlow, appleLiquidAppearance ? styles.appleLiquidBridgeGlow : null, { backgroundColor: reduceTransparency ? (mode === 'dark' ? '#1E4A41' : '#F4FFFB') : mode === 'dark' ? 'rgba(105,222,198,0.13)' : 'rgba(255,255,255,0.48)' }]} />
          <View pointerEvents="none" style={[styles.liquidBridgeHead, appleLiquidAppearance ? styles.appleLiquidBridgeHead : null, liquidBridgeHeadStyle(mode, reduceTransparency, transitionDirection)]} testID="liquid-toolbar-directional-head" />
        </Animated.View>
      ) : null}
      {!appleLiquidAppearance && !reduceMotion && transitionActive ? (
        <Animated.View
          pointerEvents="none"
          style={[
            liquidPillBaseStyle(mode, reduceTransparency, appearance),
            styles.travelingLiquidPill,
            { left: travelStartLeft },
            travelAnimatedStyle,
          ]}
          testID="liquid-toolbar-travel-pill"
        >
          {liquidPillFill(mode, reduceTransparency, 'traveling', appearance)}
        </Animated.View>
      ) : null}
      {items.map((item, index) => (
        <FloatingGlassTabItemButton
          focused={displayActiveKey !== null && item.key === displayActiveKey}
          iconForItem={iconForItem}
          item={item}
          key={item.key}
          liquidMaterial={liquidMaterial}
          mode={mode}
          onPress={pressItem}
          appearance={appearance}
          reduceMotion={reduceMotion}
          reduceTransparency={reduceTransparency}
          showLeadingDivider={appleLiquidAppearance && index > 0}
          transitionActive={!appleLiquidAppearance && transitionActive}
          useRailSlider={appleLiquidAppearance}
        />
      ))}
    </GlassSurface>
  )
}

function FloatingGlassTabItemButton<Key extends string, Item extends FloatingGlassTabItem<Key>>({
  appearance,
  focused,
  iconForItem,
  item,
  liquidMaterial,
  mode,
  onPress,
  reduceMotion,
  reduceTransparency,
  showLeadingDivider,
  transitionActive,
  useRailSlider,
}: {
  appearance: 'signature' | 'appleLiquid'
  focused: boolean
  iconForItem: (item: Item, focused: boolean) => ReactNode
  item: Item
  liquidMaterial: boolean
  mode: GlassMode
  onPress: (item: Item) => void
  reduceMotion: boolean
  reduceTransparency: boolean
  showLeadingDivider: boolean
  transitionActive: boolean
  useRailSlider: boolean
}) {
  const appleLiquidAppearance = appearance === 'appleLiquid'
  const labelColor = appleLiquidAppearance
    ? focused
      ? mode === 'dark'
        ? '#DFF8F3'
        : color.brand.primaryDark
      : mode === 'dark'
        ? '#9DB0AB'
        : '#74847F'
    : focused
    ? mode === 'dark'
      ? '#CFF7EE'
      : color.brand.primaryDeep
    : mode === 'dark'
      ? '#8FB0AA'
      : '#66827B'
  const liquidPillStyle = liquidPillBaseStyle(mode, reduceTransparency, appearance)
  const liquidPillChildren = liquidPillFill(mode, reduceTransparency, 'settled', appearance)

  return (
    <Pressable
      accessibilityLabel={item.accessibilityLabel ?? item.label}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      onPress={() => onPress(item)}
      style={({ pressed }) => [
        styles.item,
        appleLiquidAppearance ? styles.itemApple : null,
        focused && !reduceMotion ? appleLiquidAppearance ? styles.itemFocusedApple : styles.itemFocused : null,
        reduceMotionAwarePressStyle(pressed, reduceMotion),
      ]}
      testID={item.testID}
    >
      {showLeadingDivider ? (
        <View pointerEvents="none" style={[styles.appleSegmentDivider, appleSegmentDividerStyle(mode)]} />
      ) : null}
      {focused && useRailSlider ? (
        <View pointerEvents="none" style={styles.hiddenMarker} testID={`liquid-toolbar-selection-${item.key}`} />
      ) : null}
      {focused && !useRailSlider ? (
        <View pointerEvents="none" style={[liquidPillStyle, !reduceMotion ? styles.settledLiquidPill : null, transitionActive && !reduceMotion ? styles.settledLiquidPillHidden : null]} testID={`liquid-toolbar-selection-${item.key}`}>
          {liquidPillChildren}
        </View>
      ) : null}
      <View style={[styles.iconStage, focused && !reduceMotion ? appleLiquidAppearance ? styles.iconStageFocusedApple : styles.iconStageFocused : null]} testID={focused ? `liquid-toolbar-icon-pop-${item.key}` : undefined}>
        {focused && !reduceTransparency ? (
          <View pointerEvents="none" style={styles.hiddenMarker} testID={`liquid-toolbar-icon-luma-${item.key}`} />
        ) : null}
        {iconForItem(item, focused)}
      </View>
      {item.label ? (
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.82}
          numberOfLines={1}
          style={[
            styles.label,
            appleLiquidAppearance
              ? focused ? styles.labelFocusedApple : styles.labelInactiveLiquidApple
              : focused ? styles.labelFocused : liquidMaterial ? styles.labelInactiveLiquid : styles.labelInactive,
            { color: labelColor },
          ]}
        >
          {item.label}
        </Text>
      ) : null}
    </Pressable>
  )
}

function liquidPillBaseStyle(mode: GlassMode, reduceTransparency: boolean, appearance: 'signature' | 'appleLiquid' = 'signature') {
  if (appearance === 'appleLiquid') {
    const lightLiquidGradient = 'radial-gradient(circle at 30% 14%, rgba(255,255,255,0.98), transparent 34%), radial-gradient(circle at 78% 82%, rgba(255,255,255,0.26), transparent 42%), linear-gradient(180deg, rgba(255,255,255,0.54), rgba(255,255,255,0.16))'
    const darkLiquidGradient = 'radial-gradient(circle at 30% 14%, rgba(190,210,205,0.24), transparent 34%), radial-gradient(circle at 78% 82%, rgba(255,255,255,0.08), transparent 42%), linear-gradient(180deg, rgba(190,210,205,0.13), rgba(190,210,205,0.040))'
    return [
      styles.liquidPill,
      {
        backgroundColor: reduceTransparency
          ? mode === 'dark'
            ? '#202927'
            : '#FFFFFF'
          : mode === 'dark'
            ? 'rgba(190,210,205,0.13)'
            : 'rgba(255,255,255,0.34)',
        backgroundImage: !reduceTransparency ? (mode === 'light' ? lightLiquidGradient : darkLiquidGradient) : undefined,
        borderColor: reduceTransparency
          ? mode === 'dark'
            ? 'rgba(190,210,205,0.22)'
            : 'rgba(12,56,50,0.12)'
          : mode === 'dark'
            ? 'rgba(190,210,205,0.28)'
            : 'rgba(255,255,255,0.96)',
        borderWidth: 1,
        boxShadow: mode === 'dark'
          ? '0 0 0 1px rgba(190,210,205,0.055), inset 0 1px 0 rgba(190,210,205,0.22), inset 0 -9px 16px rgba(0,0,0,0.10)'
          : '0 0 0 1px rgba(255,255,255,0.62), 0 7px 15px rgba(30,77,70,0.035), inset 0 1px 0 rgba(255,255,255,0.98), inset 0 -10px 18px rgba(20,73,66,0.040)',
        experimental_backgroundImage: !reduceTransparency ? (mode === 'light' ? lightLiquidGradient : darkLiquidGradient) : undefined,
        height: 44,
        marginLeft: -32.5,
        top: 4,
        width: 65,
      } as any,
    ]
  }

  const lightLiquidGradient = 'radial-gradient(circle at 34% 16%, rgba(255,255,255,0.94), transparent 30%), radial-gradient(circle at 68% 78%, rgba(23,169,149,0.24), transparent 38%), linear-gradient(145deg, rgba(255,255,255,0.38), rgba(104,232,209,0.29))'
  const darkLiquidGradient = 'radial-gradient(circle at 34% 16%, rgba(190,210,205,0.18), transparent 30%), radial-gradient(circle at 68% 78%, rgba(105,222,198,0.18), transparent 38%), linear-gradient(145deg, rgba(105,222,198,0.20), rgba(0,117,106,0.18))'
  return [
    styles.liquidPill,
    {
      backgroundColor: reduceTransparency
        ? mode === 'dark'
          ? '#163F36'
          : '#DDF6EF'
        : mode === 'dark'
          ? 'rgba(105,222,198,0.22)'
          : 'rgba(122,238,219,0.19)',
      backgroundImage: !reduceTransparency ? (mode === 'light' ? lightLiquidGradient : darkLiquidGradient) : undefined,
      borderColor: reduceTransparency
        ? mode === 'dark'
          ? 'rgba(105,222,198,0.22)'
          : 'rgba(8,120,110,0.12)'
        : mode === 'dark'
          ? 'rgba(190,210,205,0.24)'
          : 'rgba(255,255,255,0.98)',
      borderWidth: 1,
      boxShadow: mode === 'dark'
        ? 'inset 0 1px 0 rgba(190,210,205,0.22), inset 0 -10px 18px rgba(0,117,106,0.16)'
        : '0 0 0 2px rgba(255,255,255,0.56), 0 16px 28px rgba(41,173,151,0.17), inset 0 1px 0 rgba(255,255,255,0.98), inset 0 -10px 18px rgba(7,120,106,0.12)',
      experimental_backgroundImage: !reduceTransparency ? (mode === 'light' ? lightLiquidGradient : darkLiquidGradient) : undefined,
    } as any,
  ]
}

function liquidDockDepthStyle(mode: GlassMode, appearance: 'signature' | 'appleLiquid' = 'signature') {
  if (appearance === 'appleLiquid') {
    return {
      backdropFilter: mode === 'dark' ? 'blur(18px) saturate(1.24)' : 'blur(22px) saturate(1.74) contrast(1.04)',
      backgroundColor: mode === 'dark' ? 'rgba(22,29,27,0.18)' : 'rgba(255,255,255,0.035)',
      backgroundImage: mode === 'dark'
        ? 'radial-gradient(circle at 18% 18%, rgba(190,210,205,0.055), transparent 28%), linear-gradient(180deg, rgba(190,210,205,0.040), rgba(190,210,205,0.010))'
        : 'radial-gradient(circle at 18% 16%, rgba(255,255,255,0.42), transparent 30%), radial-gradient(circle at 82% 102%, rgba(255,255,255,0.12), transparent 40%), linear-gradient(180deg, rgba(255,255,255,0.070), rgba(255,255,255,0.016))',
      experimental_backgroundImage: mode === 'dark'
        ? 'radial-gradient(circle at 18% 18%, rgba(190,210,205,0.055), transparent 28%), linear-gradient(180deg, rgba(190,210,205,0.040), rgba(190,210,205,0.010))'
        : 'radial-gradient(circle at 18% 16%, rgba(255,255,255,0.42), transparent 30%), radial-gradient(circle at 82% 102%, rgba(255,255,255,0.12), transparent 40%), linear-gradient(180deg, rgba(255,255,255,0.070), rgba(255,255,255,0.016))',
      WebkitBackdropFilter: mode === 'dark' ? 'blur(18px) saturate(1.24)' : 'blur(22px) saturate(1.74) contrast(1.04)',
    } as any
  }

  return {
    backdropFilter: mode === 'dark' ? 'blur(18px) saturate(1.28)' : 'blur(20px) saturate(1.85) contrast(1.06)',
    backgroundColor: mode === 'dark' ? 'rgba(22,29,27,0.30)' : 'rgba(255,255,255,0.055)',
    backgroundImage: mode === 'dark'
      ? 'radial-gradient(circle at 20% 22%, rgba(190,210,205,0.065), transparent 26%), radial-gradient(circle at 48% 8%, rgba(105,222,198,0.075), transparent 31%), linear-gradient(180deg, rgba(22,29,27,0.24), rgba(22,29,27,0.07))'
      : 'radial-gradient(circle at 22% 18%, rgba(255,255,255,0.36), transparent 26%), radial-gradient(circle at 50% 4%, rgba(23,169,149,0.028), transparent 32%), linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.020))',
    experimental_backgroundImage: mode === 'dark'
      ? 'radial-gradient(circle at 20% 22%, rgba(190,210,205,0.065), transparent 26%), radial-gradient(circle at 48% 8%, rgba(105,222,198,0.075), transparent 31%), linear-gradient(180deg, rgba(22,29,27,0.24), rgba(22,29,27,0.07))'
      : 'radial-gradient(circle at 22% 18%, rgba(255,255,255,0.36), transparent 26%), radial-gradient(circle at 50% 4%, rgba(23,169,149,0.028), transparent 32%), linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.020))',
    WebkitBackdropFilter: mode === 'dark' ? 'blur(18px) saturate(1.28)' : 'blur(20px) saturate(1.85) contrast(1.06)',
  } as any
}

function liquidDockRimStyle(mode: GlassMode, appearance: 'signature' | 'appleLiquid' = 'signature') {
  return {
    backgroundColor: appearance === 'appleLiquid'
      ? mode === 'dark' ? 'rgba(190,210,205,0.10)' : 'rgba(255,255,255,0.58)'
      : mode === 'dark' ? 'rgba(190,210,205,0.13)' : 'rgba(255,255,255,0.76)',
    boxShadow: mode === 'dark'
      ? '0 10px 24px rgba(0,0,0,0.18)'
      : appearance === 'appleLiquid' ? '0 8px 18px rgba(255,255,255,0.24)' : '0 8px 18px rgba(255,255,255,0.36)',
  } as any
}

function liquidDockSpecularSheenStyle(mode: GlassMode, appearance: 'signature' | 'appleLiquid' = 'signature') {
  const gradient = appearance === 'appleLiquid'
    ? mode === 'dark'
      ? 'linear-gradient(90deg, transparent 0%, rgba(190,210,205,0.070) 42%, rgba(255,255,255,0.13) 50%, rgba(190,210,205,0.035) 58%, transparent 100%)'
      : 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.26) 42%, rgba(255,255,255,0.70) 50%, rgba(255,255,255,0.18) 58%, transparent 100%)'
    : mode === 'dark'
    ? 'linear-gradient(90deg, transparent 0%, rgba(190,210,205,0.10) 42%, rgba(255,255,255,0.15) 50%, rgba(105,222,198,0.06) 58%, transparent 100%)'
    : 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.38) 42%, rgba(255,255,255,0.86) 50%, rgba(147,255,232,0.18) 58%, transparent 100%)'

  return {
    backgroundColor: 'transparent',
    backgroundImage: gradient,
    experimental_backgroundImage: gradient,
  } as any
}

function liquidBridgeSurfaceStyle(mode: GlassMode, reduceTransparency: boolean, direction: number, appearance: 'signature' | 'appleLiquid' = 'signature') {
  if (reduceTransparency) {
    return {
      backgroundColor: mode === 'dark' ? '#14372F' : '#E2F8F1',
    } as any
  }

  if (appearance === 'appleLiquid') {
    const forwardGradient = mode === 'dark'
      ? 'linear-gradient(90deg, rgba(190,210,205,0.030), rgba(190,210,205,0.16) 50%, rgba(255,255,255,0.18) 100%)'
      : 'linear-gradient(90deg, rgba(255,255,255,0.18), rgba(255,255,255,0.70) 50%, rgba(255,255,255,0.86) 100%)'
    const backwardGradient = mode === 'dark'
      ? 'linear-gradient(90deg, rgba(255,255,255,0.18), rgba(190,210,205,0.16) 50%, rgba(190,210,205,0.030) 100%)'
      : 'linear-gradient(90deg, rgba(255,255,255,0.86), rgba(255,255,255,0.70) 50%, rgba(255,255,255,0.18) 100%)'
    const gradient = direction >= 0 ? forwardGradient : backwardGradient

    return {
      backgroundColor: mode === 'dark' ? 'rgba(190,210,205,0.12)' : 'rgba(255,255,255,0.46)',
      backgroundImage: gradient,
      boxShadow: mode === 'dark'
        ? '0 8px 18px rgba(0,0,0,0.12), inset 0 1px 0 rgba(190,210,205,0.13)'
        : '0 7px 14px rgba(30,77,70,0.035), inset 0 1px 0 rgba(255,255,255,0.80)',
      experimental_backgroundImage: gradient,
    } as any
  }

  const forwardGradient = mode === 'dark'
    ? 'linear-gradient(90deg, rgba(105,222,198,0.040), rgba(105,222,198,0.18) 48%, rgba(190,210,205,0.22) 100%)'
    : 'linear-gradient(90deg, rgba(122,238,219,0.18), rgba(255,255,255,0.78) 48%, rgba(128,244,222,0.86) 100%)'
  const backwardGradient = mode === 'dark'
    ? 'linear-gradient(90deg, rgba(190,210,205,0.22), rgba(105,222,198,0.18) 52%, rgba(105,222,198,0.040) 100%)'
    : 'linear-gradient(90deg, rgba(128,244,222,0.86), rgba(255,255,255,0.78) 52%, rgba(122,238,219,0.18) 100%)'
  const gradient = direction >= 0 ? forwardGradient : backwardGradient

  return {
    backgroundColor: mode === 'dark' ? 'rgba(105,222,198,0.15)' : 'rgba(128,244,222,0.46)',
    backgroundImage: gradient,
    boxShadow: mode === 'dark'
      ? '0 8px 18px rgba(0,0,0,0.12), inset 0 1px 0 rgba(190,210,205,0.12)'
      : '0 8px 18px rgba(41,173,151,0.14), inset 0 1px 0 rgba(255,255,255,0.78)',
    experimental_backgroundImage: gradient,
  } as any
}

function liquidBridgeHeadStyle(mode: GlassMode, reduceTransparency: boolean, direction: number) {
  return {
    backgroundColor: reduceTransparency
      ? mode === 'dark' ? '#CFF7EE' : '#FFFFFF'
      : mode === 'dark' ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.96)',
    [direction >= 0 ? 'right' : 'left']: 6,
  } as any
}

function liquidPillFill(mode: GlassMode, reduceTransparency: boolean, phase: 'settled' | 'traveling' = 'settled', appearance: 'signature' | 'appleLiquid' = 'signature') {
  if (appearance === 'appleLiquid') {
    return (
      <>
        {!reduceTransparency ? <View style={[styles.appleLiquidPillAura, appleLiquidPillAuraStyle(mode, phase)]} testID="liquid-toolbar-mint-aura" /> : null}
        <View style={[styles.liquidPillKeyline, appleLiquidPillKeylineStyle(mode)]} />
        <View style={[styles.appleLiquidPillLens, appleLiquidPillLensStyle(mode, phase)]} />
        <View style={[styles.appleLiquidPillFloor, appleLiquidPillFloorStyle(mode, phase)]} />
        {!reduceTransparency ? <View style={[styles.liquidSheen, { backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.56)' }]} /> : null}
      </>
    )
  }

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
      <>
        <View style={[styles.liquidPillKeyline, liquidPillKeylineStyle(mode)]} />
        <View style={[styles.liquidSettledMintWash, liquidSettledMintWashStyle(mode)]} />
        <View style={[styles.liquidPillFloor, liquidPillFloorStyle(mode)]} />
        <View style={[styles.liquidSheen, { backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.78)' }]} />
      </>
    )
  }

  return (
    <>
      <View style={[styles.liquidPillKeyline, liquidPillKeylineStyle(mode)]} />
      <View style={[styles.liquidTrail, { backgroundColor: mode === 'dark' ? 'rgba(105,222,198,0.18)' : 'rgba(163,255,235,0.34)' }]} />
      <View style={[styles.liquidCore, { backgroundColor: mode === 'dark' ? 'rgba(105,222,198,0.28)' : 'rgba(68,232,204,0.38)' }]} />
      <View style={[styles.liquidSheen, { backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.13)' : 'rgba(255,255,255,0.66)' }]} />
    </>
  )
}

function liquidPillKeylineStyle(mode: GlassMode) {
  return {
    borderColor: mode === 'dark' ? 'rgba(190,210,205,0.28)' : 'rgba(255,255,255,0.98)',
    boxShadow: mode === 'dark'
      ? 'inset 0 1px 0 rgba(190,210,205,0.22), inset 0 -1px 0 rgba(0,117,106,0.26)'
      : '0 0 0 1px rgba(255,255,255,0.46), inset 0 1px 0 rgba(255,255,255,0.98), inset 0 -1px 0 rgba(8,120,110,0.18)',
  } as any
}

function appleLiquidPillKeylineStyle(mode: GlassMode) {
  return {
    borderColor: mode === 'dark' ? 'rgba(190,210,205,0.28)' : 'rgba(255,255,255,0.96)',
    boxShadow: mode === 'dark'
      ? 'inset 0 1px 0 rgba(190,210,205,0.20), inset 0 -1px 0 rgba(0,0,0,0.08)'
      : '0 0 0 1px rgba(255,255,255,0.56), inset 0 1px 0 rgba(255,255,255,0.98), inset 0 -1px 0 rgba(20,73,66,0.040)',
  } as any
}

function appleLiquidPillLensStyle(mode: GlassMode, phase: 'settled' | 'traveling') {
  return {
    backgroundColor: mode === 'dark'
      ? phase === 'traveling' ? 'rgba(190,210,205,0.16)' : 'rgba(190,210,205,0.10)'
      : phase === 'traveling' ? 'rgba(255,255,255,0.58)' : 'rgba(255,255,255,0.42)',
  } as any
}

function appleLiquidPillFloorStyle(mode: GlassMode, phase: 'settled' | 'traveling') {
  return {
    backgroundColor: mode === 'dark'
      ? phase === 'traveling' ? 'rgba(190,210,205,0.10)' : 'rgba(190,210,205,0.060)'
      : phase === 'traveling' ? 'rgba(255,255,255,0.30)' : 'rgba(255,255,255,0.20)',
  } as any
}

function appleLiquidPillAuraStyle(mode: GlassMode, phase: 'settled' | 'traveling') {
  const gradient = mode === 'dark'
    ? 'radial-gradient(circle, rgba(104,232,209,0.26), rgba(104,232,209,0.12) 42%, transparent 72%)'
    : 'radial-gradient(circle, rgba(124,245,224,0.50), rgba(104,232,209,0.22) 42%, transparent 72%)'

  return {
    backgroundColor: mode === 'dark'
      ? phase === 'traveling' ? 'rgba(104,232,209,0.13)' : 'rgba(104,232,209,0.16)'
      : phase === 'traveling' ? 'rgba(124,245,224,0.22)' : 'rgba(124,245,224,0.28)',
    backgroundImage: gradient,
    boxShadow: mode === 'dark'
      ? '0 0 18px rgba(104,232,209,0.10)'
      : '0 0 18px rgba(104,232,209,0.18)',
    experimental_backgroundImage: gradient,
    opacity: phase === 'traveling' ? 0.44 : 0.58,
  } as any
}

function appleSegmentDividerStyle(mode: GlassMode) {
  return {
    backgroundColor: mode === 'dark' ? 'rgba(190,210,205,0.12)' : 'rgba(20,73,66,0.10)',
  } as any
}

function liquidPillFloorStyle(mode: GlassMode) {
  return {
    backgroundColor: mode === 'dark' ? 'rgba(0,117,106,0.26)' : 'rgba(0,117,106,0.24)',
  } as any
}

function liquidSettledMintWashStyle(mode: GlassMode) {
  return {
    backgroundColor: mode === 'dark' ? 'rgba(105,222,198,0.16)' : 'rgba(58,230,202,0.22)',
  } as any
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
    zIndex: 4,
  },
  itemFocused: {
    transform: [{ translateY: -2 }],
  },
  itemApple: {
    minHeight: 48,
  },
  itemFocusedApple: {
    transform: [{ translateY: -1 }],
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
    filter: Platform.OS === 'web' ? 'drop-shadow(0 6px 9px rgba(7,109,96,0.26))' : undefined,
    transform: [{ translateY: -1 }, { scale: 1.08 }],
  } as any,
  iconStageFocusedApple: {
    filter: Platform.OS === 'web' ? 'drop-shadow(0 5px 8px rgba(7,109,96,0.16))' : undefined,
    transform: [{ translateY: -1 }, { scale: 1.035 }],
  } as any,
  label: {
    fontFamily: typography.fontFamily,
    fontSize: typography.caption.fontSize,
    fontWeight: typography.caption.fontWeight,
    lineHeight: typography.caption.lineHeight,
  },
  labelFocused: {
    opacity: 1,
  },
  labelInactive: {
    opacity: 0.5,
  },
  labelFocusedApple: {
    opacity: 1,
  },
  labelInactiveLiquid: {
    opacity: 0.68,
  },
  labelInactiveLiquidApple: {
    fontFamily: typography.fontFamily,
    fontSize: typography.caption.fontSize,
    fontWeight: typography.caption.fontWeight,
    lineHeight: typography.caption.lineHeight,
    opacity: 0.72,
  },
  liquidCore: {
    borderRadius: 999,
    height: 36,
    opacity: 0.34,
    position: 'absolute',
    right: 6,
    top: 6,
    width: 36,
  },
  liquidBridge: {
    borderCurve: 'continuous',
    borderRadius: 999,
    height: 51,
    overflow: 'hidden',
    position: 'absolute',
    top: LIQUID_PILL_ICON_CENTER_TOP,
    zIndex: 2,
  },
  liquidBridgeGlow: {
    borderRadius: 999,
    bottom: 8,
    left: 12,
    opacity: 0.68,
    position: 'absolute',
    right: 12,
    top: 8,
  },
  appleLiquidBridge: {
    height: 44,
    top: 4,
  },
  appleLiquidBridgeGlow: {
    bottom: 6,
    top: 6,
  },
  liquidBridgeHead: {
    borderRadius: 999,
    bottom: 6,
    position: 'absolute',
    top: 6,
    width: 36,
    zIndex: 4,
  },
  appleLiquidBridgeHead: {
    bottom: 5,
    top: 5,
    width: 28,
  },
  liquidPill: {
    borderCurve: 'continuous',
    borderRadius: 25,
    borderWidth: 0,
    boxShadow: '0 16px 28px rgba(41,173,151,0.16), inset 0 1px 0 rgba(255,255,255,0.98), inset 0 -10px 18px rgba(7,120,106,0.10)',
    height: 51,
    left: '50%',
    marginLeft: -30.5,
    overflow: 'hidden',
    position: 'absolute',
    top: LIQUID_PILL_ICON_CENTER_TOP,
    width: 61,
    zIndex: 0,
  },
  liquidDockDepth: {
    borderRadius: 30,
    bottom: 2,
    left: 2,
    opacity: 0.84,
    position: 'absolute',
    right: 2,
    top: 2,
    zIndex: 0,
  },
  liquidDockRim: {
    borderRadius: 999,
    height: 15,
    left: 22,
    opacity: 0.76,
    position: 'absolute',
    right: 22,
    top: 5,
    zIndex: 0,
  },
  liquidDockSpecularSheen: {
    borderRadius: 999,
    height: 86,
    left: 0,
    position: 'absolute',
    top: -12,
    width: 78,
    zIndex: 1,
  },
  liquidPillFloor: {
    borderRadius: 999,
    bottom: 1,
    height: 14,
    left: 8,
    opacity: 0.58,
    position: 'absolute',
    right: 8,
  },
  liquidSettledMintWash: {
    borderRadius: 999,
    height: 44,
    opacity: 0.52,
    position: 'absolute',
    right: -6,
    top: 6,
    width: 50,
  },
  appleLiquidPillFloor: {
    borderRadius: 999,
    bottom: 2,
    height: 12,
    left: 9,
    opacity: 0.44,
    position: 'absolute',
    right: 9,
  },
  appleLiquidPillLens: {
    borderRadius: 999,
    bottom: 4,
    left: 6,
    opacity: 0.66,
    position: 'absolute',
    right: 6,
    top: 4,
  },
  appleLiquidPillAura: {
    borderRadius: 999,
    height: 34,
    left: 15,
    position: 'absolute',
    top: 5,
    width: 34,
    zIndex: 0,
  },
  appleSegmentDivider: {
    borderRadius: 999,
    height: 18,
    left: 0,
    opacity: 0.36,
    position: 'absolute',
    top: 14,
    width: 1,
    zIndex: 1,
  },
  liquidPillKeyline: {
    borderRadius: 25,
    borderWidth: 1,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  travelingLiquidPill: {
    left: 0,
    marginLeft: 0,
    zIndex: 3,
  },
  segmentedLiquidSliderThumb: {
    left: 0,
    marginLeft: 0,
    zIndex: 2,
  },
  travelingLiquidPillVisible: {
    opacity: 1,
  },
  settledLiquidPill: {
    opacity: 0.96,
    zIndex: 0,
  },
  settledLiquidPillHidden: {
    opacity: 0,
  },
  liquidSheen: {
    borderRadius: 999,
    height: 11,
    left: 12,
    opacity: 0.58,
    position: 'absolute',
    right: 12,
    top: 6,
  },
  liquidTrail: {
    borderRadius: 999,
    height: 30,
    left: 7,
    opacity: 0.68,
    position: 'absolute',
    top: 11,
    width: 44,
  },
})
