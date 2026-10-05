import { type ReactNode } from 'react'
import { BlurView, type BlurTint } from 'expo-blur'
import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable, type GlassColorScheme, type GlassStyle } from 'expo-glass-effect'
import { Platform, StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native'
import { useGlassAccessibility } from './accessibility-motion'
import { createGlassSurfaceStyle, type GlassMaterial, type GlassMode, type GlassVariant } from './tokens'

type GlassSurfaceProps = {
  backgroundColor?: string
  borderColor?: string
  children: ReactNode
  material?: GlassMaterial
  mode?: GlassMode
  // Keep the native Liquid Glass untinted; backgroundColor then feeds only the fallbacks.
  nativeUntinted?: boolean
  onLayout?: ViewProps['onLayout']
  showEdgeHighlight?: boolean
  style?: StyleProp<ViewStyle>
  testID?: string
  variant: GlassVariant
}

export function GlassSurface({ backgroundColor, borderColor, children, material = 'standard', mode = 'light', nativeUntinted = false, onLayout, showEdgeHighlight = true, style, testID, variant }: GlassSurfaceProps) {
  const { reduceTransparency } = useGlassAccessibility()
  const surfaceStyle = createGlassSurfaceStyle({ backgroundColor, borderColor, material, mode, reduceTransparency, variant })
  const webNavBackingStyle = Platform.OS === 'web' && variant === 'nav' && !reduceTransparency
    ? material === 'liquid'
      ? mode === 'dark'
        ? styles.webLiquidNavBackingDark
        : styles.webLiquidNavBackingLight
      : mode === 'dark'
      ? styles.webNavBackingDark
      : styles.webNavBackingLight
    : null
  const composedStyle = [styles.surface, surfaceStyle, webNavBackingStyle, style]
  const shouldUseBlurFallback = variant !== 'nav' || Platform.OS !== 'web'
  // Manual 1px highlight for the blur / solid fallbacks only. The native GlassView
  // path draws its own edge, so stacking this there double-highlights the surface.
  const edgeHighlightStyle = showEdgeHighlight
    ? [styles.edgeHighlight, material === 'liquid' ? liquidEdgeHighlightStyle(mode) : mode === 'dark' ? styles.edgeHighlightStandardDark : null]
    : null
  const blurIntensity = material === 'liquid' ? liquidBlurIntensityByVariant[variant] : blurIntensityByVariant[variant]

  // Require both APIs: isLiquidGlassAvailable() can be true while the native
  // module is missing on some iOS 26 betas, where using GlassView crashes.
  if (!reduceTransparency && isLiquidGlassAvailable() && isGlassEffectAPIAvailable()) {
    if (__DEV__) warnIfGlassOpacityFlattened(style)
    // Apple "Adopting Liquid Glass": reduce custom backgrounds in tab bars and let the system set
    // the appearance, which also keeps the person's Liquid Glass look setting in charge. The
    // background colour then only feeds the blur and solid fallbacks below.
    const untinted = nativeUntinted || variant === 'nav'
    const nativeStyle = untinted ? [composedStyle, styles.nativeUntintedBackground] : composedStyle
    return (
      <GlassView
        colorScheme={glassColorSchemeByMode[mode]}
        glassEffectStyle={glassStyleByVariant[variant]}
        isInteractive={variant === 'control' || variant === 'nav'}
        onLayout={onLayout}
        style={nativeStyle}
        testID={testID}
        tintColor={untinted ? undefined : backgroundColor}
      >
        {children}
      </GlassView>
    )
  }

  if (!reduceTransparency && shouldUseBlurFallback && Platform.OS !== 'web') {
    return (
      <BlurView
        blurMethod="none"
        intensity={blurIntensity}
        onLayout={onLayout}
        style={composedStyle}
        testID={testID}
        tint={blurTintByMode[mode]}
      >
        {showEdgeHighlight ? <View pointerEvents="none" style={edgeHighlightStyle} /> : null}
        {children}
      </BlurView>
    )
  }

  return (
    <View
      onLayout={onLayout}
      style={composedStyle}
      testID={testID}
    >
      {!reduceTransparency && showEdgeHighlight ? <View pointerEvents="none" style={edgeHighlightStyle} /> : null}
      {children}
    </View>
  )
}

const blurIntensityByVariant: Record<GlassVariant, number> = {
  nav: 28,
  control: 18,
  hero: 24,
  sheet: 30,
}

const liquidBlurIntensityByVariant: Record<GlassVariant, number> = {
  nav: 24,
  control: 18,
  hero: 22,
  sheet: 26,
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
}

function liquidEdgeHighlightStyle(mode: GlassMode): ViewStyle {
  return {
    backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0.46)',
    opacity: mode === 'dark' ? 1 : 0.98,
  }
}

// Opacity < 1 on a GlassView (or an ancestor) flattens the native Liquid Glass
// effect into a plain translucent box. Warn in development so the fade is moved
// to a child view or the surface switched to a standard material.
function warnIfGlassOpacityFlattened(style: StyleProp<ViewStyle>) {
  const flat = StyleSheet.flatten(style)
  if (flat && typeof flat.opacity === 'number' && flat.opacity < 1) {
    console.warn('[GlassSurface] opacity < 1 flattens the native Liquid Glass effect; fade a child view or use a standard material instead.')
  }
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
  // A full-white line glows on dark glass; dark mode keeps a soft gray specular edge.
  edgeHighlightStandardDark: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    opacity: 1,
  },
  nativeUntintedBackground: {
    backgroundColor: 'transparent',
  },
  surface: {
    position: 'relative',
  },
  webNavBackingDark: {
    backgroundColor: '#1C1C1E',
    borderColor: 'rgba(255,255,255,0.12)',
  },
  webNavBackingLight: {
    backgroundColor: 'rgba(255,255,255,0.78)',
    backgroundImage: 'radial-gradient(circle at 52% 0%, rgba(207,255,243,0.52), transparent 38%)',
    borderColor: 'rgba(255,255,255,0.88)',
  } as any,
  webLiquidNavBackingDark: {
    backdropFilter: 'blur(24px) saturate(1.45) contrast(1.04)',
    backgroundColor: 'rgba(118,118,128,0.30)',
    borderColor: 'rgba(255,255,255,0.14)',
    WebkitBackdropFilter: 'blur(24px) saturate(1.45) contrast(1.04)',
  } as any,
  webLiquidNavBackingLight: {
    backdropFilter: 'blur(24px) saturate(1.95) contrast(1.07)',
    backgroundColor: 'rgba(255,255,255,0.10)',
    backgroundImage: 'radial-gradient(circle at 18% 8%, rgba(255,255,255,0.38), transparent 28%), radial-gradient(circle at 52% 106%, rgba(23,169,149,0.040), transparent 44%), linear-gradient(180deg, rgba(255,255,255,0.085), rgba(255,255,255,0.024))',
    borderColor: 'rgba(255,255,255,0.70)',
    WebkitBackdropFilter: 'blur(24px) saturate(1.95) contrast(1.07)',
  } as any,
})
