import { type ReactNode } from 'react'
import { Pressable, type AccessibilityRole, type AccessibilityState, type StyleProp, type ViewStyle } from 'react-native'
import { useGlassAccessibility } from './accessibility-motion'
import { reduceMotionAwarePressStyle } from './reduce-motion-aware-animation'
import { createGlassSurfaceStyle, type GlassMode, type GlassVariant } from './tokens'

type GlassPressableProps = {
  accessibilityLabel?: string
  accessibilityRole?: AccessibilityRole
  accessibilityState?: AccessibilityState
  active?: boolean
  children: ReactNode
  disabled?: boolean
  mode?: GlassMode
  onPress: () => void
  style?: StyleProp<ViewStyle>
  testID?: string
  variant?: GlassVariant
}

export function GlassPressable({
  accessibilityLabel,
  accessibilityRole = 'button',
  accessibilityState,
  active = false,
  children,
  disabled = false,
  mode = 'light',
  onPress,
  style,
  testID,
  variant = 'control',
}: GlassPressableProps) {
  const { reduceMotion, reduceTransparency } = useGlassAccessibility()

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityState ?? { disabled, selected: active }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        createGlassSurfaceStyle({ mode, reduceTransparency, variant }),
        active ? { borderColor: mode === 'dark' ? 'rgba(105,222,198,0.46)' : 'rgba(8,120,110,0.34)' } : null,
        reduceMotionAwarePressStyle(pressed, reduceMotion),
        disabled ? { opacity: 0.48 } : null,
        style,
      ]}
      testID={testID}
    >
      {children}
    </Pressable>
  )
}
