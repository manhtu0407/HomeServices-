import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'

import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { GlassSurface } from '@/components/ui/glass-surface'
import { motionTokens } from '@/components/ui/motion-tokens'
import { color } from '@/design/theme'

import { AdminText } from './admin-text'

type Option<T extends string> = { value: T; label: string; count?: number | null }

// One row of equal segments for switching between a workspace's main lists. The selected segment
// sits under a liquid-glass pill that springs to the next choice; with Reduce Motion it moves
// without animating, and GlassSurface turns solid under Reduce Transparency.
export function AdminSegmentedControl<T extends string>({ onChange, options, testID, value }: {
  onChange: (value: T) => void
  options: readonly Option<T>[]
  testID?: string
  value: T
}) {
  const { reduceMotion } = useGlassAccessibility()
  const [frames, setFrames] = useState<Record<string, { x: number; width: number }>>({})
  const x = useSharedValue(0)
  const width = useSharedValue(0)
  const frame = frames[value]

  useEffect(() => {
    if (!frame) return
    if (reduceMotion || width.value === 0) {
      x.value = frame.x
      width.value = frame.width
      return
    }
    x.value = withSpring(frame.x, motionTokens.liquid.press)
    width.value = withSpring(frame.width, motionTokens.liquid.press)
  }, [frame, reduceMotion, width, x])

  const pillStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }], width: width.value }))

  return (
    <View accessibilityRole="tablist" style={styles.segments} testID={testID}>
      {frame ? (
        <Animated.View pointerEvents="none" style={[styles.pill, pillStyle]}>
          <GlassSurface material="liquid" style={styles.pillGlass} variant="control">
            <View />
          </GlassSurface>
        </Animated.View>
      ) : null}
      {options.map((option) => {
        const selected = option.value === value
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={option.value}
            onLayout={(event) => {
              const { width: segmentWidth, x: segmentX } = event.nativeEvent.layout
              setFrames((current) => ({ ...current, [option.value]: { x: segmentX, width: segmentWidth } }))
            }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected && !frame && styles.segmentSelected]}
            testID={testID ? `${testID}-${option.value}` : undefined}
          >
            <AdminText textRole="footnote" style={[styles.segmentLabel, selected && styles.segmentLabelSelected]}>{option.label}</AdminText>
          </Pressable>
        )
      })}
    </View>
  )
}

// Compact filter chips on one scrolling line, each with the number of items it holds.
export function AdminFilterChips<T extends string>({ onChange, options, testID, value }: {
  onChange: (value: T) => void
  options: readonly Option<T>[]
  testID?: string
  value: T
}) {
  return (
    <ScrollView contentContainerStyle={styles.chips} horizontal showsHorizontalScrollIndicator={false} testID={testID}>
      {options.map((option) => {
        const selected = option.value === value
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.chip, selected && styles.chipSelected]}
            testID={testID ? `${testID}-${option.value}` : undefined}
          >
            <AdminText textRole="footnote" style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{option.label}</AdminText>
            {typeof option.count === 'number' ? (
              <AdminText numeric textRole="caption1" style={[styles.chipCount, selected && styles.chipLabelSelected]}>{option.count}</AdminText>
            ) : null}
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  segments: {
    backgroundColor: color.surface.soft,
    borderColor: color.surface.stroke,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 2,
    overflow: 'hidden',
    padding: 3,
  },
  segment: {
    alignItems: 'center',
    borderRadius: 9,
    flex: 1,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  pill: {
    bottom: 3,
    left: 0,
    position: 'absolute',
    top: 3,
  },
  pillGlass: {
    borderRadius: 9,
    flex: 1,
  },
  segmentSelected: {
    backgroundColor: color.surface.raised,
    borderColor: color.surface.stroke,
    borderWidth: 1,
  },
  segmentLabel: {
    color: color.text.secondary,
    fontWeight: '600',
  },
  segmentLabelSelected: {
    color: color.text.strong,
  },
  chips: {
    gap: 6,
    paddingVertical: 2,
  },
  chip: {
    alignItems: 'center',
    borderColor: color.surface.stroke,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 12,
  },
  chipSelected: {
    backgroundColor: color.mint.mint50,
    borderColor: color.mint.mint300,
  },
  chipLabel: {
    color: color.text.secondary,
  },
  chipLabelSelected: {
    color: color.mint.mint700,
    fontWeight: '600',
  },
  chipCount: {
    color: color.text.muted,
  },
})
