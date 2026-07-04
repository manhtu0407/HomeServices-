import { workerDockBottomMargin, workerDockClearance, workerFrameHorizontalPadding } from './constants'
import { workerCopy } from './copy'
import { styles } from './styles'
import { workerKaelChatSurface, workerOpaqueCardSurface } from './surface-styles/glass-earnings'
import { workerDockKaelActionAuraSurface, workerDockKaelActionEdgeSurface, workerDockKaelActionSurface, workerHomeDockGlassSurface, workerHomeHeaderPillSurface } from './surface-styles/home-jobs'
import { getReducedTransparencyWorkerTokens, getWorkerThemeTokens, useWorkerThemeMode, workerLiquidHomeCanvasBackgroundImage } from './theme'
import { type WorkerActiveTab, type WorkerDockIconName, type WorkerHeaderPillTone, type WorkerIconName, type WorkerRoutePath } from './types'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { FloatingGlassTabBar, type FloatingGlassTabItem } from '@/components/ui/floating-glass-tab-bar'
import { GlassSurface } from '@/components/ui/glass-surface'
import { motionTokens } from '@/components/ui/motion-tokens'
import { reduceMotionAwarePressStyle } from '@/components/ui/reduce-motion-aware-animation'
import { useAppLanguage } from '@/lib/app-language'
import { Image } from 'expo-image'
import { usePathname, useRouter } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type NativeScrollEvent, type NativeSyntheticEvent, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'
import { Icon, WORKER_CHATBOX_EMPTY_COMPOSER, WORKER_CLIENT_BASELINE_AUDIT, WORKER_DOCK_GLASS_MOTION, WORKER_FLEXIBLE_MAP_SHELL, WORKER_GLASSMORPHISM_MOTION_LAYER, WORKER_JOBROOM_KAEL_HANDOFF, WORKER_NO_FULL_ADDRESS_BEFORE_ACCEPT, WORKER_PRODUCTION_CONTRACT, WORKER_THEME_LANGUAGE_STORE, WORKER_XANHSM_REFERENCE_AUDIT, WorkerChatExitIcon, WorkerImageIcon, WorkerSectionMotionField, WorkerUiContext, kaelHead, resetWorkerChatWebScrollPosition, useWorkerUi, workerAmbientLineWashStyle, workerAmbientMintWashStyle, workerDockImageIcons } from './ui'

let lastWorkerDockActive: WorkerActiveTab = 'home'

export function WorkerFrame({
  active,
  children,
  eyebrow,
  headerIcon,
  headerPill,
  headerPillTone = 'cream',
  hideHeader = false,
  testID,
  subtitle,
  title,
  hideDock = false,
}: {
  active: WorkerActiveTab
  children: ReactNode
  eyebrow: string
  headerIcon?: WorkerIconName
  headerPill?: string
  headerPillTone?: WorkerHeaderPillTone
  hideHeader?: boolean
  hideDock?: boolean
  subtitle?: string
  testID: string
  title: string
}) {
  const insets = useSafeAreaInsets()
  const { height, width } = useWindowDimensions()
  const pathname = usePathname()
  const mode = useWorkerThemeMode()
  const language = useAppLanguage()
  const copy = workerCopy[language]
  const { reduceMotion, reduceTransparency } = useGlassAccessibility()
  const baseTokens = getWorkerThemeTokens(mode)
  const tokens = reduceTransparency ? getReducedTransparencyWorkerTokens(baseTokens) : baseTokens
  const frameWidth = hideDock ? width : Math.min(width, 430)
  const liquidHome = active === 'home'
  const canUseCanvasBackgroundImage = Platform.OS === 'web' && !reduceTransparency
  const canvasBackgroundImage = liquidHome
    ? workerLiquidHomeCanvasBackgroundImage(mode)
    : mode === 'dark'
      ? 'radial-gradient(circle at 52% 10%, rgba(230,244,240,0.055), transparent 30%), radial-gradient(circle at 72% 88%, rgba(105,222,198,0.045), transparent 28%), linear-gradient(180deg, #0B0F0E 0%, #111614 100%)'
      : 'radial-gradient(circle at 50% 12%, rgba(142,231,217,0.18), transparent 28%), linear-gradient(180deg, #F4FAF7 0%, #F7FBF8 100%)'
  const canvasLayer = {
    backgroundColor: tokens.canvas,
    experimental_backgroundImage: canUseCanvasBackgroundImage ? canvasBackgroundImage : undefined,
  } as any
  const frameHeight = Math.max(0, height - insets.top - insets.bottom)
  const routeIsFocused =
    (active === 'home' && pathname.endsWith('/home')) ||
    (active === 'jobs' && pathname.endsWith('/jobs')) ||
    (active === 'chat' && pathname.endsWith('/chat')) ||
    (active === 'earnings' && pathname.endsWith('/earnings')) ||
    (active === 'profile' && pathname.endsWith('/profile'))
  const workerUiValue = useMemo(() => ({ copy, language, mode, reduceTransparency, tokens }), [copy, language, mode, reduceTransparency, tokens])
  const routeScrollRef = useRef<ScrollView | null>(null)
  const lastScrollYRef = useRef(0)
  const dockRouteResetKey = `${active}:${pathname}`
  const [dockState, setDockState] = useState({ hidden: false, routeKey: dockRouteResetKey })
  const dockHidden = dockState.routeKey === dockRouteResetKey ? dockState.hidden : false
  useEffect(() => {
    lastScrollYRef.current = 0
  }, [dockRouteResetKey])
  const setDockHiddenSafely = useCallback((nextHidden: boolean) => {
    setDockState((current) => {
      if (current.routeKey === dockRouteResetKey && current.hidden === nextHidden) return current
      return { hidden: nextHidden, routeKey: dockRouteResetKey }
    })
  }, [dockRouteResetKey])
  const handleWorkerDockScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (hideDock || !routeIsFocused) return

    const nextY = Math.max(0, event.nativeEvent.contentOffset.y)
    const deltaY = nextY - lastScrollYRef.current

    if (nextY <= 12) {
      setDockHiddenSafely(false)
    } else if (deltaY > 8 && nextY > 34) {
      setDockHiddenSafely(true)
    } else if (deltaY < -7) {
      setDockHiddenSafely(false)
    }

    lastScrollYRef.current = nextY
  }, [hideDock, routeIsFocused, setDockHiddenSafely])

  useEffect(() => {
    if (!hideDock || !routeIsFocused) return
    const resetScroll = () => {
      routeScrollRef.current?.scrollTo({ animated: false, y: 0 })
      resetWorkerChatWebScrollPosition()
    }
    resetScroll()
    const frame = requestAnimationFrame(resetScroll)
    return () => {
      cancelAnimationFrame(frame)
    }
  }, [frameHeight, hideDock, routeIsFocused])

  return (
    <WorkerUiContext.Provider value={workerUiValue}>
      <SafeAreaView style={[styles.safe, canvasLayer, routeIsFocused ? null : styles.inactiveRouteSurface]} testID={testID}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <View style={[styles.canvas, canvasLayer, { minHeight: frameHeight }]}>
          {!canUseCanvasBackgroundImage || hideDock || liquidHome ? null : <AmbientBackdrop />}
          {routeIsFocused && !hideDock && !liquidHome && !reduceMotion && canUseCanvasBackgroundImage ? <WorkerSectionMotionField active={active} frameWidth={frameWidth} screenWidth={width} /> : null}
          <ScrollView
            ref={routeScrollRef}
            contentContainerStyle={[
              styles.scrollContent,
              hideDock ? styles.standaloneScrollContent : null,
              {
                alignSelf: 'center',
                minHeight: frameHeight,
                paddingBottom: Math.max(insets.bottom + workerDockClearance, workerDockClearance),
                ...(hideDock ? { height: frameHeight, minHeight: frameHeight, paddingBottom: 0, paddingHorizontal: 4 } : null),
                width: Math.max(0, hideDock ? frameWidth : frameWidth - workerFrameHorizontalPadding * 2),
              },
            ]}
            automaticallyAdjustKeyboardInsets={!hideDock}
            contentInsetAdjustmentBehavior="automatic"
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            onScroll={hideDock ? undefined : handleWorkerDockScroll}
            scrollEventThrottle={16}
            scrollEnabled={!hideDock}
            showsVerticalScrollIndicator={false}
            style={[styles.workerScroll, hideDock ? styles.workerStandaloneScroll : null]}
            testID={`worker-${active}-scroll`}
          >
            <View
              style={styles.hiddenMarker}
              testID={
                WORKER_XANHSM_REFERENCE_AUDIT +
                WORKER_PRODUCTION_CONTRACT +
                WORKER_CLIENT_BASELINE_AUDIT +
                WORKER_THEME_LANGUAGE_STORE +
                WORKER_FLEXIBLE_MAP_SHELL +
                WORKER_DOCK_GLASS_MOTION +
                WORKER_GLASSMORPHISM_MOTION_LAYER +
                WORKER_CHATBOX_EMPTY_COMPOSER +
                WORKER_NO_FULL_ADDRESS_BEFORE_ACCEPT +
                WORKER_JOBROOM_KAEL_HANDOFF
              }
            />
            {hideDock ? <WorkerStandaloneHeader /> : hideHeader ? null : <WorkerScreenHeader active={active} eyebrow={eyebrow} headerIcon={headerIcon} headerPill={headerPill} headerPillTone={headerPillTone} subtitle={subtitle} title={title} />}
            {children}
          </ScrollView>
          {!hideDock && routeIsFocused ? <WorkerDockOverlay active={active} hidden={dockHidden} /> : null}
        </View>
      </SafeAreaView>
    </WorkerUiContext.Provider>
  )
}

function WorkerScreenHeader({ active, eyebrow, headerIcon, headerPill, headerPillTone = 'cream', subtitle, title }: { active: WorkerActiveTab; eyebrow: string; headerIcon?: WorkerIconName; headerPill?: string; headerPillTone?: WorkerHeaderPillTone; subtitle?: string; title: string }) {
  const { reduceTransparency, tokens } = useWorkerUi()
  const showKicker = eyebrow.trim().toLocaleLowerCase() !== title.trim().toLocaleLowerCase()
  const headerPillSurface = active === 'home'
    ? workerHomeHeaderPillSurface(tokens)
    : headerPillTone === 'mint'
      ? { backgroundColor: tokens.mint, borderColor: tokens.mode === 'dark' ? tokens.borderStrong : 'rgba(13,134,119,0.12)', color: tokens.mode === 'dark' ? tokens.aqua : '#0B5C50' }
      : { backgroundColor: tokens.cream, borderColor: tokens.border, color: tokens.primary }

  return (
    <View style={styles.workerTopRow} testID={`worker-${active}-title-row`}>
      <View style={styles.titleStack}>
        {subtitle ? null : showKicker ? (
          <Text style={[styles.kicker, { color: tokens.primary }]} numberOfLines={1}>
            {eyebrow}
          </Text>
        ) : null}
        <Text adjustsFontSizeToFit minimumFontScale={0.78} numberOfLines={2} style={[styles.screenTitle, { color: tokens.ink }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.screenSubtitle, { color: tokens.muted }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {headerPill ? (
        <Text style={[styles.screenHeaderPill, headerPillSurface]} numberOfLines={1}>
          {headerPill}
        </Text>
      ) : headerIcon ? (
        <View style={[styles.screenHeaderAction, workerOpaqueCardSurface(tokens, 'mint', reduceTransparency)]}>
          <Icon name={headerIcon} active small />
        </View>
      ) : null}
    </View>
  )
}

function WorkerStandaloneHeader() {
  const { copy, language, tokens } = useWorkerUi()
  const { reduceMotion } = useGlassAccessibility()
  const { replace } = useRouter()
  const exitLabel = language === 'en' ? 'Exit chat' : 'Thoát chat'

  return (
    <View style={styles.jobRoomTopChrome} testID="worker-jobroom-fullscreen-header">
      <View style={styles.jobRoomTopUtilityRow} testID="worker-chat-reference-top-controls">
        <Pressable accessibilityLabel={exitLabel} accessibilityRole="button" onPress={() => replace('/(worker)/jobs?tab=active')} style={({ pressed }) => [styles.jobRoomRoundButton, { borderColor: tokens.border }, workerKaelChatSurface(tokens, 'icon'), reduceMotionAwarePressStyle(pressed, reduceMotion)]} testID="worker-jobroom-back">
          <WorkerChatExitIcon color={tokens.primary} />
        </Pressable>
        <View accessibilityLabel={copy.chat.kael} accessible style={[styles.jobRoomKaelBubble, { borderColor: tokens.border }, workerKaelChatSurface(tokens, 'icon')]} testID="worker-chat-reference-kael-bubble">
          <Image contentFit="contain" source={kaelHead} style={styles.jobRoomKaelBubbleImage} />
        </View>
      </View>
    </View>
  )
}

function WorkerDockOverlay({ active, hidden }: { active: WorkerActiveTab; hidden: boolean }) {
  const { replace } = useRouter()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const { copy, tokens } = useWorkerUi()
  const { reduceMotion } = useGlassAccessibility()
  const frameWidth = Math.min(width, 430)
  const dockWidth = Math.max(Math.min(frameWidth - 48, 356), 0)
  const dockActionSize = 64
  const dockGap = 14
  const dockMainWidth = Math.max(dockWidth - dockActionSize - dockGap, 0)
  const bottom = Math.max(insets.bottom + workerDockBottomMargin, workerDockBottomMargin)
  const dockTranslateY = useSharedValue(hidden ? 90 : 0)
  const dockScaleX = useSharedValue(hidden ? 0.955 : 1)
  const dockScaleY = useSharedValue(hidden ? 0.84 : 1)
  const dockOpacity = useSharedValue(hidden ? 0 : 1)
  const dockMotionStyle = useAnimatedStyle(() => ({
    opacity: dockOpacity.value,
    transform: reduceMotion
      ? []
      : [
        { translateY: dockTranslateY.value },
        { scaleX: dockScaleX.value },
        { scaleY: dockScaleY.value },
      ],
  }), [reduceMotion])
  type WorkerDockItem = FloatingGlassTabItem<WorkerActiveTab> & {
    icon: Exclude<WorkerDockIconName, 'kael'>
    path: WorkerRoutePath
  }
  const items: WorkerDockItem[] = [
    { key: 'home', accessibilityLabel: copy.nav.home, icon: 'apartment', path: '/(worker)/home', testID: 'worker-dock-home' },
    { key: 'jobs', accessibilityLabel: copy.nav.jobs, icon: 'document', path: '/(worker)/jobs?tab=waiting', testID: 'worker-dock-jobs' },
    { key: 'earnings', accessibilityLabel: copy.nav.earnings, icon: 'payment', path: '/(worker)/earnings', testID: 'worker-dock-earnings' },
    { key: 'profile', accessibilityLabel: copy.nav.profile, icon: 'person', path: '/(worker)/profile', testID: 'worker-dock-profile' },
  ]
  const chatPath = '/(worker)/chat' as const

  useEffect(() => {
    const timeout = setTimeout(() => {
      lastWorkerDockActive = active
    }, 560)
    return () => clearTimeout(timeout)
  }, [active])

  useEffect(() => {
    if (reduceMotion) {
      dockOpacity.value = withTiming(hidden ? 0 : 1, { duration: 120 })
      dockTranslateY.value = hidden ? 0 : 0
      dockScaleX.value = 1
      dockScaleY.value = 1
      return
    }

    dockOpacity.value = withTiming(hidden ? 0 : 1, { duration: hidden ? 105 : 145 })
    dockTranslateY.value = withSpring(hidden ? 90 : 0, hidden ? motionTokens.liquid.press : motionTokens.liquid.entrance)
    dockScaleX.value = hidden
      ? withSpring(0.955, motionTokens.liquid.press)
      : withSequence(
        withSpring(1.026, motionTokens.liquid.pill),
        withSpring(1, motionTokens.liquid.press),
      )
    dockScaleY.value = hidden
      ? withSpring(0.84, motionTokens.liquid.press)
      : withSequence(
        withSpring(1.045, motionTokens.liquid.pill),
        withSpring(1, motionTokens.liquid.press),
      )
  }, [dockOpacity, dockScaleX, dockScaleY, dockTranslateY, hidden, reduceMotion])

  return (
    <Animated.View pointerEvents={hidden ? 'none' : 'box-none'} style={[styles.dockWrap, { bottom, width: dockWidth }, dockMotionStyle]} testID="worker-dock-motion-shell">
      <View pointerEvents="none" style={styles.hiddenMarker} testID="worker-dock-glass-aura" />
      <View style={styles.workerDockSplitRow} testID="worker-dock-split-toolbar">
        <FloatingGlassTabBar<WorkerActiveTab, WorkerDockItem>
          activeKey={active === 'chat' ? null : active}
          items={items}
          material="liquid"
          mode={tokens.mode}
          onItemPress={(item) => {
            if (item.key === active) return
            lastWorkerDockActive = active
            replace(item.path)
          }}
          previousKey={active === 'chat' || lastWorkerDockActive === 'chat' ? null : lastWorkerDockActive}
          iconForItem={(item, focused) => <WorkerDockIcon focused={focused} name={item.icon} />}
          style={[styles.workerDock, styles.workerDockMainCluster, { width: dockMainWidth }, workerHomeDockGlassSurface(tokens)]}
          testID="worker-liquid-glass-dock"
        />
        <Pressable
          accessibilityLabel={copy.nav.chat}
          accessibilityRole="tab"
          accessibilityState={{ selected: active === 'chat' }}
          onPress={() => {
            if (active === 'chat') return
            lastWorkerDockActive = active
            replace(chatPath)
          }}
          style={({ pressed }) => [styles.workerDockKaelActionPressable, reduceMotionAwarePressStyle(pressed, reduceMotion)]}
          testID="worker-dock-chat"
        >
          <GlassSurface
            material="liquid"
            mode={tokens.mode}
            style={[styles.workerDockKaelActionGlass, workerDockKaelActionSurface(tokens, active === 'chat')]}
            testID="worker-dock-kael-action-glass"
            variant="nav"
          >
            <View pointerEvents="none" style={[styles.workerDockKaelActionEdge, workerDockKaelActionEdgeSurface(tokens)]} testID="worker-dock-kael-action-edge" />
            <View pointerEvents="none" style={[styles.workerDockKaelActionAura, workerDockKaelActionAuraSurface(tokens, active === 'chat')]} testID="worker-dock-kael-action-aura" />
            <WorkerDockIcon focused={active === 'chat'} name="kael" />
          </GlassSurface>
        </Pressable>
      </View>
    </Animated.View>
  )
}

function WorkerDockIcon({ focused, name }: { focused: boolean; name: WorkerDockIconName }) {
  if (name === 'kael') {
    return <Image contentFit="contain" source={kaelHead} style={[styles.workerDockKaelImage, focused ? styles.workerDockKaelImageFocused : null]} testID="worker-dock-kael-mascot-icon" />
  }

  return (
    <WorkerImageIcon
      frameSize={focused ? 32 : 28}
      name={workerDockImageIcons[name]}
      size={focused ? 32 : 24}
      style={[styles.workerDockAssetImage, focused ? styles.workerDockAssetImageFocused : null]}
    />
  )
}

function AmbientBackdrop() {
  const { tokens } = useWorkerUi()

  return (
    <>
      <View style={[styles.backdropWarm, { backgroundColor: tokens.cream }]} />
      <View style={[styles.backdropMint, { backgroundColor: tokens.aqua }, workerAmbientMintWashStyle]} />
      <View style={[styles.backdropCyan, { backgroundColor: tokens.cyan }]} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, workerAmbientLineWashStyle]}>
        <Svg style={StyleSheet.absoluteFill} viewBox="0 0 390 844" preserveAspectRatio="none">
          <Path d="M-10 210 C74 178 128 230 198 190 S332 132 420 164" stroke={tokens.line} strokeWidth={2.2} opacity={0.42} fill="none" />
          <Path d="M42 78 C118 124 126 174 88 238 S92 366 176 394 S302 378 410 424" stroke={tokens.line} strokeWidth={1.8} opacity={0.28} fill="none" />
          <Path d="M-20 604 C72 570 112 620 182 584 S316 512 420 550" stroke={tokens.line} strokeWidth={2} opacity={0.26} fill="none" />
        </Svg>
      </View>
    </>
  )
}
