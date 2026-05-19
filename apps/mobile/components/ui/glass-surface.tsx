import { type ReactNode } from 'react'
import { BlurView, type BlurTint } from 'expo-blur'
import { GlassView, isLiquidGlassAvailable, type GlassColorScheme, type GlassStyle } from 'expo-glass-effect'
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { useGlassAccessibility } from './accessibility-motion'
import { createGlassSurfaceStyle, type GlassMode, type GlassVariant } from './tokens'

type GlassSurfaceProps = {
  backgroundColor?: string
  borderColor?: string
  children: ReactNode
  mode?: GlassMode
  style?: StyleProp<ViewStyle>
  testID?: string
  variant?: GlassVariant
}

export function GlassSurface({ backgroundColor, borderColor, children, mode = 'light', style, testID, variant = 'subtle' }: GlassSurfaceProps) {
  const { reduceTransparency } = useGlassAccessibility()
  const surfaceStyle = createGlassSurfaceStyle({ backgroundColor, borderColor, mode, reduceTransparency, variant })
  const composedStyle = [styles.surface, surfaceStyle, style]

  if (!reduceTransparency && isLiquidGlassAvailable()) {
    return (
      <GlassView
        colorScheme={glassColorSchemeByMode[mode]}
        glassEffectStyle={glassStyleByVariant[variant]}
        isInteractive={variant === 'control' || variant === 'nav'}
        style={composedStyle}
        testID={testID}
        tintColor={backgroundColor}
      >
        <View pointerEvents="none" style={styles.edgeHighlight} />
        {children}
      </GlassView>
    )
  }

  if (!reduceTransparency) {
    return (
      <BlurView
        experimentalBlurMethod="none"
        intensity={blurIntensityByVariant[variant]}
        style={composedStyle}
        testID={testID}
        tint={blurTintByMode[mode]}
      >
        <View pointerEvents="none" style={styles.edgeHighlight} />
        {children}
      </BlurView>
    )
  }

  return (
    <View
      style={composedStyle}
      testID={testID}
    >
      {children}
    </View>
  )
}

const blurIntensityByVariant: Record<GlassVariant, number> = {
  nav: 28,
  control: 18,
  hero: 24,
  sheet: 30,
  subtle: 14,
}

const blurTintByMode: Record<GlassMode, BlurTint> = {
  dark: 'systemThinMaterialDark',
  light: 'systemThinMaterialLight',
}

const glassColorSchemeByMode: Record<GlassMode, GlassColorScheme> = {
  dark: 'dark',
  light: 'light',
}

const glassStyleByVariant: Record<GlassVariant, GlassStyle> = {
  nav: 'regular',
  control: 'regular',
  hero: 'regular',
  sheet: 'regular',
  subtle: 'clear',
}

const styles = StyleSheet.create({
  edgeHighlight: {
    backgroundColor: 'rgba(255,255,255,0.42)',
    height: 1,
    left: 14,
    opacity: 0.62,
    position: 'absolute',
    right: 14,
    top: 1,
    zIndex: 1,
  },
  surface: {
    position: 'relative',
  },
})
