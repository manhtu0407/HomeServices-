import { customerDockBottomClearance, customerDockBottomMargin, customerFrameHorizontalPadding } from './constants'
import { customerCopy } from './copy'
import { styles } from './styles'
import { customerDockInactiveTint, customerDockKaelActionAuraSurface, customerDockKaelActionEdgeSurface, customerDockKaelActionSurface, customerDockMainClusterSurface } from './surface-styles'
import { CustomerThemeContext, type CustomerThemeTokens, getCustomerThemeTokens, getReducedTransparencyCustomerTokens, type ThemeMode, useCustomerThemeMode } from '@/components/customer/customer-theme'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { FloatingGlassTabBar, type FloatingGlassTabItem } from '@/components/ui/floating-glass-tab-bar'
import { GlassSurface } from '@/components/ui/glass-surface'
import { motionTokens } from '@/components/ui/motion-tokens'
import { reduceMotionAwarePressStyle } from '@/components/ui/reduce-motion-aware-animation'
import { useAppLanguage } from '@/lib/app-language'
import { useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { type ReactNode, useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { type NativeScrollEvent, type NativeSyntheticEvent, Pressable, ScrollView, useWindowDimensions, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { AmbientGlassField, CUSTOMER_NO_PROTOTYPE_SAMPLE_CLIENT_STATS, MappedIcon, MotionSweep, openBookingPath, openKaelChatPath, useCustomerTokens } from './ui'
import type { IconName } from './ui'

const customerDockHiddenListeners = new Set<() => void>()

let customerDockHiddenSnapshot = false

type CustomerDockActive = 'activity' | 'booking' | 'home' | 'kael' | 'profile'

let lastCustomerDockActive: CustomerDockActive = 'home'

function getCustomerDockHiddenSnapshot() {
  return customerDockHiddenSnapshot
}

function subscribeCustomerDockHidden(listener: () => void) {
  customerDockHiddenListeners.add(listener)
  return () => {
    customerDockHiddenListeners.delete(listener)
  }
}

function setCustomerDockHiddenSnapshot(hidden: boolean) {
  if (customerDockHiddenSnapshot === hidden) return
  customerDockHiddenSnapshot = hidden
  customerDockHiddenListeners.forEach((listener) => listener())
}

function useCustomerDockHidden() {
  return useSyncExternalStore(subscribeCustomerDockHidden, getCustomerDockHiddenSnapshot, getCustomerDockHiddenSnapshot)
}

export function CustomerV4DockOverlay({ active }: { active: CustomerDockActive }) {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const themeMode = useCustomerThemeMode()
  const { reduceTransparency } = useGlassAccessibility()
  const baseTokens = getCustomerThemeTokens(themeMode)
  const tokens = reduceTransparency ? getReducedTransparencyCustomerTokens(baseTokens) : baseTokens
  const frameWidth = Math.min(width, 430)
  const hidden = useCustomerDockHidden()
  useEffect(() => {
    setCustomerDockHiddenSnapshot(false)
  }, [active])

  return (
    <CustomerThemeContext.Provider value={tokens}>
      <V4Dock active={active} bottomInset={insets.bottom} frameWidth={frameWidth} hidden={hidden} screenWidth={width} />
    </CustomerThemeContext.Provider>
  )
}

export function V4Frame({
  active,
  children,
  testID,
}: {
  active: CustomerDockActive
  children: (props: { tokens: CustomerThemeTokens; mode: ThemeMode }) => ReactNode
  testID: string
}) {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const themeMode = useCustomerThemeMode()
  const { reduceMotion, reduceTransparency } = useGlassAccessibility()
  const baseTokens = getCustomerThemeTokens(themeMode)
  const tokens = reduceTransparency ? getReducedTransparencyCustomerTokens(baseTokens) : baseTokens
  const frameWidth = Math.min(width, 430)
  const appleIOS26MainSection = active === 'home' || active === 'booking' || active === 'activity'
  const pulse = useSharedValue(0)
  const settle = useSharedValue(0)
  useEffect(() => {
    pulse.value = 0
    settle.value = 1
    if (reduceMotion) {
      pulse.value = withTiming(1, { duration: 120 })
      settle.value = withTiming(0, { duration: 120 })
      return
    }
    pulse.value = withSpring(1, motionTokens.liquid.entrance)
    settle.value = withDelay(60, withSpring(0, motionTokens.liquid.press))
  }, [active, pulse, reduceMotion, settle])
  const motionFieldStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0 : 0.05 + pulse.value * 0.04,
    transform: [{ translateY: settle.value * 2 }, { scale: 0.98 + pulse.value * 0.025 }],
  }))
  const lastCustomerScrollYRef = useRef(0)
  const setCustomerDockHiddenSafely = useCallback((hidden: boolean) => {
    setCustomerDockHiddenSnapshot(hidden)
  }, [])
  const handleCustomerDockScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextY = Math.max(0, event.nativeEvent.contentOffset.y)
    const deltaY = nextY - lastCustomerScrollYRef.current

    if (nextY <= 12) {
      setCustomerDockHiddenSafely(false)
    } else if (deltaY > 8 && nextY > 34) {
      setCustomerDockHiddenSafely(true)
    } else if (deltaY < -7) {
      setCustomerDockHiddenSafely(false)
    }

    lastCustomerScrollYRef.current = nextY
  }, [setCustomerDockHiddenSafely])
  useEffect(() => {
    lastCustomerScrollYRef.current = 0
    setCustomerDockHiddenSafely(false)
  }, [active, setCustomerDockHiddenSafely])
  const profileCanvasBackgroundImage =
    themeMode === 'dark'
      ? 'radial-gradient(circle at 52% 10%, rgba(230,244,240,0.055), transparent 30%), radial-gradient(circle at 72% 88%, rgba(105,222,198,0.045), transparent 28%), linear-gradient(180deg, #0B0F0E 0%, #111614 100%)'
      : 'radial-gradient(circle at 50% 12%, rgba(142,231,217,0.18), transparent 28%), radial-gradient(circle at 76% 84%, rgba(105,222,198,0.075), transparent 28%), linear-gradient(180deg, #F4FAF7 0%, #F7FBF8 100%)'
  const defaultCanvasBackgroundImage =
    themeMode === 'dark'
      ? 'radial-gradient(circle at 50% 12%, rgba(105,222,198,0.08), transparent 30%), linear-gradient(180deg, #0B0F0E 0%, #111614 100%)'
      : 'radial-gradient(circle at 50% 12%, rgba(23,169,149,0.08), transparent 30%), linear-gradient(180deg, #F8FBF5 0%, #F4F7F6 100%)'
  const appleIOS26CanvasBackgroundImage =
    themeMode === 'dark'
      ? 'radial-gradient(circle at 50% 4%, rgba(190,210,205,0.060), transparent 28%), radial-gradient(circle at 50% 34%, rgba(105,222,198,0.035), transparent 34%), linear-gradient(180deg, #0E1413 0%, #111816 58%, #0B0F0E 100%)'
      : 'radial-gradient(circle at 50% -4%, rgba(255,255,255,0.98), transparent 28%), radial-gradient(circle at 50% 24%, rgba(0,200,179,0.070), transparent 34%), linear-gradient(180deg, #F7F8F8 0%, #F1F3F2 100%)'
  const experimentalBackgroundImage = active === 'profile'
    ? profileCanvasBackgroundImage
    : appleIOS26MainSection
      ? appleIOS26CanvasBackgroundImage
      : defaultCanvasBackgroundImage
  const canvasLayer = {
    backgroundColor: tokens.canvas,
    experimental_backgroundImage: reduceTransparency ? undefined : experimentalBackgroundImage,
  } as any
  const scrollLayer = active === 'profile' || appleIOS26MainSection ? canvasLayer : { backgroundColor: tokens.canvas }

  return (
    <SafeAreaView style={[styles.safeArea, canvasLayer]} testID={testID}>
      <StatusBar style={themeMode === 'dark' ? 'light' : 'dark'} />
      <CustomerThemeContext.Provider value={tokens}>
        {reduceTransparency ? null : <AmbientGlassField frameWidth={frameWidth} screenWidth={width} />}
        {reduceMotion || reduceTransparency ? null : (
          <Animated.View pointerEvents="none" style={[styles.customerMotionField, { backgroundColor: tokens.aqua }, motionFieldStyle]} testID={`customer-motion-field-${active}`} />
        )}
        <ScrollView
          contentContainerStyle={[
            styles.v4Scroll,
            {
              alignSelf: 'center',
              maxWidth: 430,
              minHeight: '100%',
              paddingBottom: Math.max(insets.bottom + customerDockBottomClearance, customerDockBottomClearance),
              paddingTop: Math.max(insets.top + 8, 20),
              width: Math.max(0, frameWidth - customerFrameHorizontalPadding * 2),
            },
          ]}
          automaticallyAdjustKeyboardInsets
          contentInsetAdjustmentBehavior="automatic"
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          onScroll={handleCustomerDockScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          style={[styles.scroll, scrollLayer]}
          testID="customer-v4-scroll"
        >
          <View style={styles.hiddenMarker} testID="customer-dark-layer-ecology" />
          <View style={styles.hiddenMarker} testID="customer-shell-motion-field" />
          <View style={styles.hiddenMarker} testID="customer-theme-layer-switch" />
          <View style={styles.hiddenMarker} testID="customer-client-prototype-parity-source" />
          <View style={styles.hiddenMarker} testID={CUSTOMER_NO_PROTOTYPE_SAMPLE_CLIENT_STATS} />
          <View style={styles.hiddenMarker} testID="customer-client-card-press-feedback" />
          {appleIOS26MainSection ? (
            <>
              <View style={styles.hiddenMarker} testID="customer-apple-ios26-client-main-sections" />
              <View style={styles.hiddenMarker} testID={`customer-${active}-ios26-main-section`} />
              <View style={styles.hiddenMarker} testID="customer-ios26-standard-content-material" />
              <View style={styles.hiddenMarker} testID="customer-ios26-liquid-control-layer" />
            </>
          ) : null}
          {children({ tokens, mode: themeMode })}
        </ScrollView>
        {reduceMotion || reduceTransparency ? null : <MotionSweep frameWidth={frameWidth} screenWidth={width} />}
      </CustomerThemeContext.Provider>
    </SafeAreaView>
  )
}

function V4Dock({
  active,
  bottomInset,
  frameWidth,
  hidden,
  screenWidth,
}: {
  active: CustomerDockActive
  bottomInset: number
  frameWidth: number
  hidden: boolean
  screenWidth: number
}) {
  const { replace } = useRouter()
  const navigationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearNavigationTimer = useCallback(() => {
    const timer = navigationTimerRef.current
    if (timer) clearTimeout(timer)
    navigationTimerRef.current = null
  }, [])
  const { reduceMotion } = useGlassAccessibility()
  const languageMode = useAppLanguage()
  const copy = customerCopy[languageMode]
  const tokens = useCustomerTokens()
  const dockWidth = Math.max(0, Math.min(frameWidth - 40, 360))
  const dockActionSize = 56
  const dockGap = 10
  const dockMainWidth = Math.max(dockWidth - dockActionSize - dockGap, 0)
  const dockLeft = Math.max((screenWidth - dockWidth) / 2, 16)
  const bottom = Math.max(bottomInset + customerDockBottomMargin, customerDockBottomMargin)
  const dockTranslateY = useSharedValue(hidden ? 80 : 0)
  const dockScale = useSharedValue(hidden ? 0.97 : 1)
  const dockOpacity = useSharedValue(hidden ? 0 : 1)
  const dockMotionStyle = useAnimatedStyle(() => ({
    opacity: dockOpacity.value,
    transform: reduceMotion
      ? []
      : [
        { translateY: dockTranslateY.value },
        { scale: dockScale.value },
      ],
  }), [reduceMotion])
  type CustomerDockItem = FloatingGlassTabItem<CustomerDockActive> & {
    icon: IconName
    path: '/(customer)/home' | '/(customer)/booking' | '/(customer)/history' | '/(customer)/profile'
  }
  const items: CustomerDockItem[] = [
    { accessibilityLabel: copy.navA11y.home, key: 'home', icon: 'apartment', label: copy.nav.home, path: '/(customer)/home', testID: 'customer-v4-dock-home' },
    { accessibilityLabel: copy.navA11y.booking, key: 'booking', icon: 'document', label: copy.nav.booking, path: openBookingPath, testID: 'customer-v4-dock-booking' },
    { accessibilityLabel: copy.navA11y.activity, key: 'activity', icon: 'history', label: copy.nav.activity, path: '/(customer)/history', testID: 'customer-v4-dock-activity' },
    { accessibilityLabel: copy.navA11y.profile, key: 'profile', icon: 'person', label: copy.nav.profile, path: '/(customer)/profile', testID: 'customer-v4-dock-profile' },
  ]
  const navigateWithLiquidDelay = useCallback((path: CustomerDockItem['path'] | typeof openKaelChatPath) => {
    clearNavigationTimer()
    navigationTimerRef.current = setTimeout(() => {
      replace(path)
      navigationTimerRef.current = null
    }, 90)
  }, [clearNavigationTimer, replace])

  useEffect(() => clearNavigationTimer, [clearNavigationTimer])

  useEffect(() => {
    if (reduceMotion) {
      dockOpacity.value = withTiming(hidden ? 0 : 1, { duration: 120 })
      dockTranslateY.value = 0
      dockScale.value = 1
      return
    }

    dockOpacity.value = withTiming(hidden ? 0 : 1, { duration: hidden ? 95 : 145 })
    dockTranslateY.value = withSpring(hidden ? 80 : 0, hidden ? motionTokens.liquid.press : motionTokens.liquid.entrance)
    dockScale.value = withSpring(hidden ? 0.97 : 1, hidden ? motionTokens.liquid.press : motionTokens.liquid.entrance)
  }, [dockOpacity, dockScale, dockTranslateY, hidden, reduceMotion])

  return (
    <Animated.View pointerEvents={hidden ? 'none' : 'box-none'} style={[styles.dockWrap, { bottom, left: dockLeft, width: dockWidth }, dockMotionStyle]} testID="customer-dock-motion-shell">
      <View pointerEvents="none" style={styles.hiddenMarker} testID="customer-dock-glass-aura" />
      <View style={styles.customerDockSplitRow} testID="customer-dock-split-toolbar">
        <FloatingGlassTabBar<CustomerDockActive, CustomerDockItem>
          activeKey={active === 'kael' ? null : active}
          appearance="appleLiquid"
          items={items}
          material="liquid"
          mode={tokens.mode}
          onItemPress={(item) => {
            if (item.key === active) return
            lastCustomerDockActive = active
            navigateWithLiquidDelay(item.path)
          }}
          previousKey={active === 'kael' || lastCustomerDockActive === 'kael' ? null : lastCustomerDockActive}
          iconForItem={(item, focused) => (
            <MappedIcon
              name={item.icon}
              color={focused ? tokens.primary : customerDockInactiveTint(tokens)}
              accent={focused ? tokens.primary : customerDockInactiveTint(tokens)}
              size={24}
            />
          )}
          style={[styles.glassDock, styles.customerDockMainCluster, { width: dockMainWidth }, customerDockMainClusterSurface(tokens)]}
          testID="customer-liquid-glass-dock"
        />
        <Pressable
          accessibilityLabel={copy.navA11y.kael}
          accessibilityRole="tab"
          accessibilityState={{ selected: active === 'kael' }}
          onPress={() => {
            if (active === 'kael') return
            lastCustomerDockActive = active
            navigateWithLiquidDelay(openKaelChatPath)
          }}
          style={({ pressed }) => [styles.customerDockKaelActionPressable, reduceMotionAwarePressStyle(pressed, reduceMotion)]}
          testID="customer-v4-dock-kael"
        >
          <GlassSurface
            material="liquid"
            mode={tokens.mode}
            style={[styles.customerDockKaelActionGlass, customerDockKaelActionSurface(tokens, active === 'kael')]}
            testID="customer-dock-kael-action-glass"
            variant="nav"
          >
            <View pointerEvents="none" style={[styles.customerDockKaelActionEdge, customerDockKaelActionEdgeSurface(tokens)]} testID="customer-dock-kael-action-edge" />
            <View pointerEvents="none" style={[styles.customerDockKaelActionAura, customerDockKaelActionAuraSurface(tokens, active === 'kael')]} testID="customer-dock-kael-action-aura" />
            <MappedIcon name="kael" color={active === 'kael' ? tokens.primary : customerDockInactiveTint(tokens)} accent={tokens.primary} size={29} />
          </GlassSurface>
        </Pressable>
      </View>
    </Animated.View>
  )
}
