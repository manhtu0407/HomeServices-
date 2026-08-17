import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import Svg, { Circle, Defs, Path, Rect } from 'react-native-svg'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'

import { SERVICE_TYPES, type ServiceType } from '@nestscout/shared'
import { AlphaStop as Stop, NativeSafeLinearGradient as LinearGradient } from '@/components/ui/svg-alpha-stop'
import { motionTokens } from '@/components/ui/motion-tokens'
import { ReduceMotionAwareEntranceView } from '@/components/ui/reduce-motion-aware-animation'
import { useAppLanguage, type AppLanguage } from '@/lib/app-language'

import { CaseWideMintAura, ZipMintAura } from '../ui/aura-surfaces'
import { customerV21ServiceCopy } from '../ui/copy'
import {
  advanceHistoryRailMomentum,
  clampHistoryRailOffset,
  historyRailMomentumVelocityFromGesture,
  historyRailOffsetFromDrag,
} from './service-history-rail'
import { customerV21ServiceHistoryStyles as styles } from './service-history-styles'
import { useCustomerV21SurfaceTheme } from '../ui/shared-surfaces'

export type HistoryFilter = 'all' | 'saved' | ServiceType

type FilterRailResponderHandlers = {
  begin: () => void
  cancel: () => void
  end: (_event: unknown, gesture: { vx: number }) => void
  move: (_event: unknown, gesture: { dx: number }) => void
  shouldClaim: (_event: unknown, gesture: { dx: number; dy: number }) => boolean
}

const historyFilters: HistoryFilter[] = ['all', 'saved', ...SERVICE_TYPES]

function historyFilterLabel(filter: HistoryFilter, language: AppLanguage) {
  if (filter === 'all') return language === 'vi' ? 'Tất cả' : 'All'
  if (filter === 'saved') return language === 'vi' ? 'Đã lưu' : 'Saved'
  return customerV21ServiceCopy[language][filter].label
}

function HistoryFilterIcon({ color, filter, selected }: { color: string; filter: HistoryFilter; selected: boolean }) {
  const strokeWidth = selected ? 2 : 1.8
  return (
    <Svg height={21} viewBox="0 0 24 24" width={21}>
      {filter === 'all' ? (
        <>
          <Rect height={6} rx={1.8} stroke={color} strokeWidth={strokeWidth} width={6} x={3.5} y={3.5} />
          <Rect height={6} rx={1.8} stroke={color} strokeWidth={strokeWidth} width={6} x={14.5} y={3.5} />
          <Rect height={6} rx={1.8} stroke={color} strokeWidth={strokeWidth} width={6} x={3.5} y={14.5} />
          <Rect height={6} rx={1.8} stroke={color} strokeWidth={strokeWidth} width={6} x={14.5} y={14.5} />
        </>
      ) : filter === 'saved' ? (
        <Path d="m12 3.4 2.55 5.17 5.71.83-4.13 4.02.98 5.68L12 16.42l-5.11 2.68.98-5.68-4.13-4.02 5.71-.83L12 3.4Z" fill={selected ? color : 'none'} stroke={color} strokeLinejoin="round" strokeWidth={strokeWidth} />
      ) : filter === 'electrical' ? (
        <Path d="m13.8 2.8-7.1 10.1h5.1l-.8 8.3 7.3-11.1h-5.1l.6-7.3Z" fill="none" stroke={color} strokeLinejoin="round" strokeWidth={strokeWidth} />
      ) : filter === 'plumbing' ? (
        <Path d="M12 3.4S6.4 9.8 6.4 13.7a5.6 5.6 0 0 0 11.2 0C17.6 9.8 12 3.4 12 3.4Z" fill="none" stroke={color} strokeLinejoin="round" strokeWidth={strokeWidth} />
      ) : filter === 'cleaning' ? (
        <>
          <Path d="M8.2 5.2h7.1l2 2.1v2.3H8.2Z" fill="none" stroke={color} strokeLinejoin="round" strokeWidth={strokeWidth} />
          <Path d="M11 9.6v9.1M8.2 18.7h8.2M14.6 5.2V3.4" fill="none" stroke={color} strokeLinecap="round" strokeWidth={strokeWidth} />
        </>
      ) : filter === 'hvac' ? (
        <>
          <Path d="M4 8.2h10.2c2.5 0 2.5-3.2 0-3.2-1.2 0-2 .7-2.3 1.5M4 12h15M4 15.8h10.2c2.5 0 2.5 3.2 0 3.2-1.2 0-2-.7-2.3-1.5" fill="none" stroke={color} strokeLinecap="round" strokeWidth={strokeWidth} />
        </>
      ) : filter === 'upholstery' ? (
        <Path d="M5 11.5V9.2a2.4 2.4 0 0 1 2.4-2.4h9.2A2.4 2.4 0 0 1 19 9.2v2.3M4 11.5h16v6.2H4Z M7 17.7v2M17 17.7v2" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} />
      ) : (
        <>
          <Path d="m14.5 5.1 4.4 4.4M13.4 6.2l-2.5 2.5a3 3 0 0 0 0 4.2l.2.2a3 3 0 0 0 4.2 0l2.5-2.5M10.6 17.8l-2.5 2.5a3 3 0 0 1-4.2 0l-.2-.2a3 3 0 0 1 0-4.2l2.5-2.5" fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} />
          <Circle cx={8.9} cy={15.1} fill={color} r={1.1} />
        </>
      )}
    </Svg>
  )
}

function HistoryFilterEdgeFade({ color }: { color: string }) {
  return (
    <Svg height={44} viewBox="0 0 32 44" width={32}>
      <Defs>
        <LinearGradient id="customer-history-filter-edge-fade" x1="0" x2="1" y1="0.5" y2="0.5">
          <Stop offset="0" stopColor={color} stopOpacity={0} />
          <Stop offset="1" stopColor={color} stopOpacity={1} />
        </LinearGradient>
      </Defs>
      <Rect fill="url(#customer-history-filter-edge-fade)" height={44} width={32} />
    </Svg>
  )
}

export function ServiceHistoryFilterRail({
  onSelect,
  selected,
}: {
  onSelect: (filter: HistoryFilter) => void
  selected: HistoryFilter
}) {
  const language = useAppLanguage()
  const { reduceMotion, tokens } = useCustomerV21SurfaceTheme()
  const filterScrollRef = useRef<ScrollView>(null)
  const filterScrollOffsetRef = useRef(0)
  const filterDragStartOffsetRef = useRef(0)
  const filterRailMetricsRef = useRef({ contentWidth: 0, viewportWidth: 0 })
  const filterMomentumFrameRef = useRef<number | null>(null)
  const [filterRailMetrics, setFilterRailMetrics] = useState({ contentWidth: 0, viewportWidth: 0 })
  // PanResponder retains callbacks imperatively. The stable delegate receives
  // post-commit handlers without constructing a responder during render.
  const [filterRailResponderHandlers] = useState<FilterRailResponderHandlers>(() => ({
    begin: () => undefined,
    cancel: () => undefined,
    end: (_event: unknown, _gesture: { vx: number }) => undefined,
    move: (_event: unknown, _gesture: { dx: number }) => undefined,
    shouldClaim: (_event: unknown, _gesture: { dx: number; dy: number }) => false,
  }))
  const [filterRailPanResponder] = useState(() => PanResponder.create({
    onMoveShouldSetPanResponder: (event, gesture) => filterRailResponderHandlers.shouldClaim(event, gesture),
    onMoveShouldSetPanResponderCapture: (event, gesture) => filterRailResponderHandlers.shouldClaim(event, gesture),
    onPanResponderGrant: () => filterRailResponderHandlers.begin(),
    onPanResponderMove: (event, gesture) => filterRailResponderHandlers.move(event, gesture),
    onPanResponderRelease: (event, gesture) => filterRailResponderHandlers.end(event, gesture),
    onPanResponderTerminate: () => filterRailResponderHandlers.cancel(),
    onPanResponderTerminationRequest: () => false,
  }))
  const filterScrollX = useSharedValue(0)

  const stopFilterRailMomentum = useCallback(() => {
    if (filterMomentumFrameRef.current !== null) {
      cancelAnimationFrame(filterMomentumFrameRef.current)
      filterMomentumFrameRef.current = null
    }
  }, [])

  const writeFilterRailOffset = useCallback((offset: number) => {
    filterScrollOffsetRef.current = offset
    filterScrollX.value = offset
    filterScrollRef.current?.scrollTo({ animated: false, x: offset })
  }, [filterScrollX])

  const updateFilterRailMetrics = useCallback((next: Partial<typeof filterRailMetricsRef.current>) => {
    const current = filterRailMetricsRef.current
    const merged = { ...current, ...next }
    if (merged.contentWidth === current.contentWidth && merged.viewportWidth === current.viewportWidth) return

    stopFilterRailMomentum()
    filterRailMetricsRef.current = merged
    setFilterRailMetrics(merged)
    writeFilterRailOffset(clampHistoryRailOffset(
      filterScrollOffsetRef.current,
      merged.contentWidth,
      merged.viewportWidth,
    ))
  }, [stopFilterRailMomentum, writeFilterRailOffset])

  const handleFilterRailScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentWidth, viewportWidth } = filterRailMetricsRef.current
    const nextOffset = clampHistoryRailOffset(event.nativeEvent.contentOffset.x, contentWidth, viewportWidth)
    filterScrollOffsetRef.current = nextOffset
    filterScrollX.value = nextOffset
  }, [filterScrollX])

  const startFilterRailMomentum = useCallback((gestureVelocityX: number) => {
    stopFilterRailMomentum()
    if (reduceMotion || Platform.OS !== 'web') return

    let velocity = historyRailMomentumVelocityFromGesture(gestureVelocityX)
    if (velocity === 0) return

    let lastTimestamp: number | null = null
    const tick = (timestamp: number) => {
      const { contentWidth, viewportWidth } = filterRailMetricsRef.current
      const elapsedMs = lastTimestamp === null ? 16 : timestamp - lastTimestamp
      const frame = advanceHistoryRailMomentum(
        filterScrollOffsetRef.current,
        velocity,
        elapsedMs,
        contentWidth,
        viewportWidth,
      )
      lastTimestamp = timestamp
      velocity = frame.velocity
      writeFilterRailOffset(frame.offset)

      if (frame.done) {
        filterMomentumFrameRef.current = null
        return
      }
      filterMomentumFrameRef.current = requestAnimationFrame(tick)
    }

    filterMomentumFrameRef.current = requestAnimationFrame(tick)
  }, [reduceMotion, stopFilterRailMomentum, writeFilterRailOffset])

  const shouldClaimFilterRailDrag = useCallback((_event: unknown, gesture: { dx: number; dy: number }) => {
    const { contentWidth, viewportWidth } = filterRailMetricsRef.current
    return Platform.OS === 'web'
      && contentWidth > viewportWidth
      && Math.abs(gesture.dx) > 5
      && Math.abs(gesture.dx) > Math.abs(gesture.dy)
  }, [])
  const beginFilterRailDrag = useCallback(() => {
    stopFilterRailMomentum()
    filterDragStartOffsetRef.current = filterScrollOffsetRef.current
  }, [stopFilterRailMomentum])
  const moveFilterRailDrag = useCallback((_event: unknown, gesture: { dx: number }) => {
    const { contentWidth, viewportWidth } = filterRailMetricsRef.current
    writeFilterRailOffset(historyRailOffsetFromDrag(
      filterDragStartOffsetRef.current,
      gesture.dx,
      contentWidth,
      viewportWidth,
    ))
  }, [writeFilterRailOffset])
  const endFilterRailDrag = useCallback((_event: unknown, gesture: { vx: number }) => {
    startFilterRailMomentum(gesture.vx)
  }, [startFilterRailMomentum])
  const cancelFilterRailDrag = useCallback(() => {
    stopFilterRailMomentum()
  }, [stopFilterRailMomentum])
  useLayoutEffect(() => {
    filterRailResponderHandlers.begin = beginFilterRailDrag
    filterRailResponderHandlers.cancel = cancelFilterRailDrag
    filterRailResponderHandlers.end = endFilterRailDrag
    filterRailResponderHandlers.move = moveFilterRailDrag
    filterRailResponderHandlers.shouldClaim = shouldClaimFilterRailDrag
  }, [beginFilterRailDrag, cancelFilterRailDrag, endFilterRailDrag, filterRailResponderHandlers, moveFilterRailDrag, shouldClaimFilterRailDrag])

  const filterRailMaxOffset = Math.max(0, filterRailMetrics.contentWidth - filterRailMetrics.viewportWidth)
  const filterRailFadeAnimatedStyle = useAnimatedStyle(() => ({
    opacity: filterRailMaxOffset > filterScrollX.value + 2 ? 1 : 0,
  }))

  useEffect(() => () => {
    stopFilterRailMomentum()
    cancelAnimation(filterScrollX)
  }, [filterScrollX, stopFilterRailMomentum])

  return (
    <ReduceMotionAwareEntranceView distanceY={6} style={styles.filterRailWrap}>
      <View
        style={styles.filterRailDragSurface}
        testID="customer-v21-history-filter-drag-surface"
        {...(Platform.OS === 'web' ? filterRailPanResponder.panHandlers : {})}
      >
        <ScrollView
          accessibilityHint={language === 'vi' ? 'Vuốt ngang để xem thêm bộ lọc dịch vụ' : 'Swipe horizontally to see more service filters'}
          accessibilityLabel={language === 'vi' ? 'Bộ lọc dịch vụ' : 'Service filters'}
          contentContainerStyle={styles.filterRailContent}
          decelerationRate="normal"
          directionalLockEnabled
          horizontal
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={(width) => updateFilterRailMetrics({ contentWidth: width })}
          onLayout={(event) => updateFilterRailMetrics({ viewportWidth: event.nativeEvent.layout.width })}
          onScroll={handleFilterRailScroll}
          onScrollBeginDrag={stopFilterRailMomentum}
          ref={filterScrollRef}
          scrollEventThrottle={16}
          showsHorizontalScrollIndicator={false}
          style={styles.filterRail}
          testID="customer-v21-history-filter-scroll"
        >
          {historyFilters.map((option) => (
            <HistoryFilterChip
              auraScope={`HistoryFilter${option}`}
              filter={option}
              key={option}
              label={historyFilterLabel(option, language)}
              onPress={() => onSelect(option)}
              reduceMotion={reduceMotion}
              selected={selected === option}
              testID={`customer-v21-history-filter-${option}`}
              tokens={tokens}
            />
          ))}
        </ScrollView>
        <Animated.View
          pointerEvents="none"
          style={[styles.filterRailFade, filterRailFadeAnimatedStyle]}
          testID="customer-v21-history-filter-fade"
        >
          <HistoryFilterEdgeFade color={tokens.canvas} />
        </Animated.View>
      </View>
    </ReduceMotionAwareEntranceView>
  )
}

function HistoryFilterChip({
  auraScope,
  filter,
  label,
  onPress,
  reduceMotion,
  selected,
  testID,
  tokens,
}: {
  auraScope: string
  filter: HistoryFilter
  label: string
  onPress: () => void
  reduceMotion: boolean
  selected: boolean
  testID: string
  tokens: ReturnType<typeof useCustomerV21SurfaceTheme>['tokens']
}) {
  const scale = useSharedValue(1)
  useEffect(() => () => cancelAnimation(scale), [scale])
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  const setPressed = (pressed: boolean) => {
    if (reduceMotion) return
    scale.value = withSpring(pressed ? 0.96 : 1, motionTokens.liquid.press)
  }

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={onPress}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        style={[
          styles.filterChip,
          {
            backgroundColor: selected ? tokens.service : tokens.raised,
            borderColor: selected ? tokens.borderStrong : tokens.border,
          },
        ]}
        testID={testID}
      >
        {selected ? (
          <View pointerEvents="none" style={styles.filterChipAura}>
            <CaseWideMintAura
              intensity="strong"
              scope={`${auraScope}Wide`}
              testID={`${testID}-wide-mint-aura`}
            />
            <ZipMintAura scope={`${auraScope}Fine`} testID={`${testID}-mint-aura`} />
          </View>
        ) : null}
        <View style={styles.filterIcon}>
          <HistoryFilterIcon color={tokens.primary} filter={filter} selected={selected} />
        </View>
        <Text numberOfLines={1} style={[styles.filterChipText, { color: selected ? tokens.primary : tokens.text }]}>{label}</Text>
      </Pressable>
    </Animated.View>
  )
}
