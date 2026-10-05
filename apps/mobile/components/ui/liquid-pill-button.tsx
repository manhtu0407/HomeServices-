import { useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, type LayoutChangeEvent, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'

import { useGlassAccessibility } from './accessibility-motion'
import { GlassSurface } from './glass-surface'
import { LiquidSurfaceOverlay } from './liquid-back-button'
import { motionTokens } from './motion-tokens'
import type { GlassMode } from './tokens'

// The pill material of the Kael chat header ("+ Chat"): near-clear liquid glass with a white rim,
// a top-left frost highlight and a faint mint shadow. Any pill-shaped control in the chat reuses it
// so the screen reads as one material instead of one colour per button.
export const liquidPillPalette = {
  dark: { background: 'rgba(22,29,27,0.42)', border: 'rgba(190,210,205,0.16)' },
  light: { background: 'rgba(255,255,255,0.16)', border: 'rgba(255,255,255,0.72)' },
} as const

const DEFAULT_DESIGN_WIDTH = 158

export function LiquidPillButton({
  accessibilityLabel,
  accessibilityState,
  children,
  disabled = false,
  height = 44,
  mode = 'light',
  onPress,
  opaqueBackgroundColor,
  opaqueBorderColor,
  style,
  testID,
}: {
  accessibilityLabel: string
  accessibilityState?: PressableProps['accessibilityState']
  children: ReactNode
  disabled?: boolean
  height?: number
  mode?: GlassMode
  onPress: () => void
  // Used when the person turns on Reduce Transparency and the glass becomes a solid surface.
  opaqueBackgroundColor: string
  opaqueBorderColor: string
  style?: StyleProp<ViewStyle>
  testID?: string
}) {
  const { reduceMotion, reduceTransparency } = useGlassAccessibility()
  const [designWidth, setDesignWidth] = useState(DEFAULT_DESIGN_WIDTH)
  const scale = useSharedValue(1)
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))
  const radius = height / 2
  const palette = liquidPillPalette[mode]

  const setPressed = (pressed: boolean) => {
    if (disabled || reduceMotion) {
      scale.value = 1
      return
    }
    scale.value = withSpring(pressed ? motionTokens.feedback.scale : 1, motionTokens.liquid.press)
  }
  const onLayout = (event: LayoutChangeEvent) => {
    const width = Math.round(event.nativeEvent.layout.width)
    if (width > 0 && width !== designWidth) setDesignWidth(width)
  }

  return (
    <Animated.View style={[animatedStyle, style]}>
      <Pressable
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={{ ...accessibilityState, disabled }}
        disabled={disabled}
        onPress={onPress}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        testID={testID}
      >
        <GlassSurface
          backgroundColor={palette.background}
          borderColor={palette.border}
          material="liquid"
          mode={mode}
          onLayout={onLayout}
          showEdgeHighlight={false}
          style={[
            styles.surface,
            { borderRadius: radius, minHeight: height },
            // GlassSurface keeps its own fallback fill under Reduce Transparency; the themed colour wins here.
            reduceTransparency ? { backgroundColor: opaqueBackgroundColor, borderColor: opaqueBorderColor } : styles.surfaceLiquid,
          ]}
          testID={testID ? `${testID}-surface` : undefined}
          variant="control"
        >
          {reduceTransparency ? null : (
            <LiquidSurfaceOverlay
              designHeight={height}
              designWidth={designWidth}
              mode={mode}
              radius={radius}
              testID={testID ? `${testID}-liquid` : undefined}
            />
          )}
          {children}
        </GlassSurface>
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  surface: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderWidth: 1,
    boxShadow: '0 7px 16px rgba(8,125,114,0.08)',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  surfaceLiquid: { borderWidth: 0 },
})
