import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import Animated, {
  cancelAnimation,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated'

import { SERVICE_TYPES, type ServiceType } from '@nestscout/shared'
import { motionTokens } from '@/components/ui/motion-tokens'
import { ReduceMotionAwareEntranceView } from '@/components/ui/reduce-motion-aware-animation'
import { useAppLanguage, type AppLanguage } from '@/lib/app-language'

import { CaseWideMintAura, ZipMintAura } from './aura-surfaces'
import { customerV21ServiceCopy } from './copy'
import {
  advanceHistoryRailMomentum,
  clampHistoryRailOffset,
  historyRailMomentumVelocityFromGesture,
  historyRailOffsetFromDrag,
} from './service-history-rail'
import { customerV21ServiceHistoryStyles as styles } from './service-history-styles'
import { useCustomerV21SurfaceTheme } from './shared-surfaces'

export type HistoryFilter = 'all' | 'saved' | ServiceType

const historyFilters: HistoryFilter[] = ['all', 'saved', ...SERVICE_TYPES]

function historyFilterLabel(filter: HistoryFilter, language: AppLanguage) {
  if (filter === 'all') return language === 'vi' ? 'Tất cả' : 'All'
  if (filter === 'saved') return language === 'vi' ? '★ Đã lưu' : '★ Saved'
  return customerV21ServiceCopy[language][filter].label
}

export function ServiceHistoryFilterRail({
  onSelect,
  selected,
}: {
  onSelect: (filter: HistoryFilter) => void
  selected: HistoryFilter
}) {
  const language = useAppLanguage()
  const { reduceMotion, reduceTransparency, tokens } = useCustomerV21SurfaceTheme()
  const filterScrollRef = useRef<ScrollView>(null)
  const filterScrollOffsetRef = useRef(0)
  const filterDragStartOffsetRef = useRef(0)
  const filterRailMetricsRef = useRef({ contentWidth: 0, viewportWidth: 0 })
  const filterMomentumFrameRef = useRef<number | null>(null)
  const [filterRailMetrics, setFilterRailMetrics] = useState(filterRailMetricsRef.current)
  const filterScrollX = useSharedValue(0)
  const filterIndicatorOpacity = useSharedValue(reduceTransparency ? 0.72 : 0.36)
  const filterIndicatorScaleY = useSharedValue(1)

  const filterIndicatorIdleOpacity = reduceTransparency ? 0.72 : 0.36
  const filterIndicatorActiveOpacity = reduceTransparency ? 1 : 0.92

  const stopFilterRailMomentum = useCallback(() => {
    if (filterMomentumFrameRef.current !== null) {
      cancelAnimationFrame(filterMomentumFrameRef.current)
      filterMomentumFrameRef.current = null
    }
  }, [])

  const activateFilterIndicator = useCallback(() => {
    cancelAnimation(filterIndicatorOpacity)
    cancelAnimation(filterIndicatorScaleY)
    if (reduceMotion) {
      filterIndicatorOpacity.value = filterIndicatorActiveOpacity
      filterIndicatorScaleY.value = 1
      return
    }
    filterIndicatorOpacity.value = withTiming(filterIndicatorActiveOpacity, { duration: 120 })
    filterIndicatorScaleY.value = withSpring(1.3, motionTokens.liquid.press)
  }, [filterIndicatorActiveOpacity, filterIndicatorOpacity, filterIndicatorScaleY, reduceMotion])

  const settleFilterIndicator = useCallback(() => {
    cancelAnimation(filterIndicatorOpacity)
    cancelAnimation(filterIndicatorScaleY)
    if (reduceMotion) {
      filterIndicatorOpacity.value = filterIndicatorIdleOpacity
      filterIndicatorScaleY.value = 1
      return
    }
    filterIndicatorOpacity.value = withDelay(
      360,
      withTiming(filterIndicatorIdleOpacity, { duration: 180 }),
    )
    filterIndicatorScaleY.value = withSpring(1, motionTokens.liquid.press)
  }, [filterIndicatorIdleOpacity, filterIndicatorOpacity, filterIndicatorScaleY, reduceMotion])

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
    if (reduceMotion || Platform.OS !== 'web') {
      settleFilterIndicator()
      return
    }

    let velocity = historyRailMomentumVelocityFromGesture(gestureVelocityX)
    if (velocity === 0) {
      settleFilterIndicator()
      return
    }

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
        settleFilterIndicator()
        return
      }
      filterMomentumFrameRef.current = requestAnimationFrame(tick)
    }

    filterMomentumFrameRef.current = requestAnimationFrame(tick)
  }, [reduceMotion, settleFilterIndicator, stopFilterRailMomentum, writeFilterRailOffset])

  const filterRailPanResponder = useMemo(() => {
    const shouldClaimHorizontalDrag = (_event: unknown, gesture: { dx: number; dy: number }) => {
      const { contentWidth, viewportWidth } = filterRailMetricsRef.current
      return Platform.OS === 'web'
        && contentWidth > viewportWidth
        && Math.abs(gesture.dx) > 5
        && Math.abs(gesture.dx) > Math.abs(gesture.dy)
    }

    return PanResponder.create({
      onMoveShouldSetPanResponder: shouldClaimHorizontalDrag,
      onMoveShouldSetPanResponderCapture: shouldClaimHorizontalDrag,
      onPanResponderGrant: () => {
        stopFilterRailMomentum()
        filterDragStartOffsetRef.current = filterScrollOffsetRef.current
        activateFilterIndicator()
      },
      onPanResponderMove: (_event, gesture) => {
        const { contentWidth, viewportWidth } = filterRailMetricsRef.current
        writeFilterRailOffset(historyRailOffsetFromDrag(
          filterDragStartOffsetRef.current,
          gesture.dx,
          contentWidth,
          viewportWidth,
        ))
      },
      onPanResponderRelease: (_event, gesture) => startFilterRailMomentum(gesture.vx),
      onPanResponderTerminate: () => {
        stopFilterRailMomentum()
        settleFilterIndicator()
      },
      onPanResponderTerminationRequest: () => false,
    })
  }, [activateFilterIndicator, settleFilterIndicator, startFilterRailMomentum, stopFilterRailMomentum, writeFilterRailOffset])

  const filterRailMaxOffset = Math.max(0, filterRailMetrics.contentWidth - filterRailMetrics.viewportWidth)
  const filterIndicatorTrackWidth = Math.max(0, filterRailMetrics.viewportWidth - 16)
  const filterIndicatorThumbWidth = filterRailMetrics.contentWidth > 0
    ? Math.max(
        44,
        filterIndicatorTrackWidth * Math.min(1, filterRailMetrics.viewportWidth / filterRailMetrics.contentWidth),
      )
    : 0
  const filterIndicatorMaxTranslate = Math.max(0, filterIndicatorTrackWidth - filterIndicatorThumbWidth)
  const filterIndicatorAnimatedStyle = useAnimatedStyle(() => ({
    opacity: filterRailMaxOffset > 0 ? filterIndicatorOpacity.value : 0,
    transform: [
      {
        translateX: filterRailMaxOffset > 0
          ? interpolate(
              filterScrollX.value,
              [0, filterRailMaxOffset],
              [0, filterIndicatorMaxTranslate],
              Extrapolation.CLAMP,
            )
          : 0,
      },
      { scaleY: filterIndicatorScaleY.value },
    ],
    width: filterIndicatorThumbWidth,
  }))

  useEffect(() => () => {
    stopFilterRailMomentum()
    cancelAnimation(filterScrollX)
    cancelAnimation(filterIndicatorOpacity)
    cancelAnimation(filterIndicatorScaleY)
  }, [filterIndicatorOpacity, filterIndicatorScaleY, filterScrollX, stopFilterRailMomentum])

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
          onMomentumScrollBegin={activateFilterIndicator}
          onMomentumScrollEnd={settleFilterIndicator}
          onScroll={handleFilterRailScroll}
          onScrollBeginDrag={() => {
            stopFilterRailMomentum()
            activateFilterIndicator()
          }}
          onScrollEndDrag={settleFilterIndicator}
          ref={filterScrollRef}
          scrollEventThrottle={16}
          showsHorizontalScrollIndicator={false}
          style={styles.filterRail}
          testID="customer-v21-history-filter-scroll"
        >
          {historyFilters.map((option) => (
            <HistoryFilterChip
              auraScope={`HistoryFilter${option}`}
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
        <View
          pointerEvents="none"
          style={[
            styles.filterIndicatorTrack,
            { backgroundColor: reduceTransparency ? tokens.borderStrong : tokens.glassBorder, width: filterIndicatorTrackWidth },
          ]}
          testID="customer-v21-history-filter-indicator"
        >
          <Animated.View
            style={[
              styles.filterIndicatorThumb,
              { backgroundColor: tokens.primary },
              filterIndicatorAnimatedStyle,
            ]}
          >
            <View style={[styles.filterIndicatorHighlight, { backgroundColor: tokens.glassHighlight }]} />
          </Animated.View>
        </View>
      </View>
    </ReduceMotionAwareEntranceView>
  )
}

function HistoryFilterChip({
  auraScope,
  label,
  onPress,
  reduceMotion,
  selected,
  testID,
  tokens,
}: {
  auraScope: string
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
            backgroundColor: selected ? tokens.primary : tokens.raised,
            borderColor: selected ? tokens.primary : tokens.border,
          },
        ]}
        testID={testID}
      >
        <View pointerEvents="none" style={styles.filterChipAura}>
          <CaseWideMintAura
            intensity="strong"
            scope={`${auraScope}Wide`}
            testID={`${testID}-wide-mint-aura`}
          />
          <ZipMintAura scope={`${auraScope}Fine`} testID={`${testID}-mint-aura`} />
        </View>
        <Text numberOfLines={1} style={[styles.filterChipText, { color: selected ? tokens.primaryText : tokens.text }]}>{label}</Text>
      </Pressable>
    </Animated.View>
  )
}
