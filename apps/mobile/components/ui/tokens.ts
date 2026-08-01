import type { ViewStyle } from 'react-native'
import { glassSurfaceTheme } from '@/design/theme'

export type GlassVariant = 'nav' | 'control' | 'hero' | 'sheet'
export type GlassMode = 'dark' | 'light'
export type GlassMaterial = 'liquid' | 'standard'

type GlassSurfaceOptions = {
  backgroundColor?: string
  borderColor?: string
  material?: GlassMaterial
  mode?: GlassMode
  reduceTransparency?: boolean
  variant?: GlassVariant
}

const radiusByVariant: Record<GlassVariant, number> = {
  nav: 30,
  control: 18,
  hero: 28,
  sheet: 30,
}

const shadowByVariant: Record<GlassVariant, { dark: string; light: string }> = glassSurfaceTheme.shadowByVariant
const liquidShadowByVariant: Record<GlassVariant, { dark: string; light: string }> = glassSurfaceTheme.liquidShadowByVariant

const glassDesignTokens = {
  borderWidth: 1,
  highlightOpacity: 0.48,
  maxVisibleLayers: 3,
  pressedScale: 0.985,
  radius: radiusByVariant,
  spacing: {
    controlGap: 8,
    surfacePadding: 14,
  },
  zLayer: {
    dock: 30,
    modal: 40,
  },
}

export function createGlassSurfaceStyle({
  backgroundColor,
  borderColor,
  material = 'standard',
  mode = 'light',
  reduceTransparency = false,
  variant = 'control',
}: GlassSurfaceOptions = {}): ViewStyle {
  const isDark = mode === 'dark'
  const isLiquid = material === 'liquid'
  const fallbackBackground = isLiquid
    ? isDark ? glassSurfaceTheme.liquidFallbackBackground.dark : glassSurfaceTheme.liquidFallbackBackground.light
    : isDark ? glassSurfaceTheme.standardFallbackBackground.dark : glassSurfaceTheme.standardFallbackBackground.light
  const liquidGlassBackground = isDark
    ? glassSurfaceTheme.liquidBackground.dark
    : variant === 'nav'
      ? glassSurfaceTheme.liquidBackground.navLight
      : glassSurfaceTheme.liquidBackground.light
  const standardGlassBackground = isDark ? glassSurfaceTheme.standardBackground.dark : variant === 'nav' ? glassSurfaceTheme.standardBackground.navLight : glassSurfaceTheme.standardBackground.light
  const glassBackground = isLiquid ? liquidGlassBackground : standardGlassBackground
  const liquidBorderColor = isDark ? glassSurfaceTheme.liquidBorder.dark : variant === 'nav' ? glassSurfaceTheme.liquidBorder.navLight : glassSurfaceTheme.liquidBorder.light
  const standardBorderColor = isDark ? glassSurfaceTheme.standardBorder.dark : variant === 'nav' ? glassSurfaceTheme.standardBorder.navLight : glassSurfaceTheme.standardBorder.light

  return {
    backgroundColor: reduceTransparency ? fallbackBackground : (backgroundColor ?? glassBackground),
    borderColor: borderColor ?? (isLiquid ? liquidBorderColor : standardBorderColor),
    borderCurve: 'continuous',
    borderRadius: radiusByVariant[variant],
    borderWidth: glassDesignTokens.borderWidth,
    boxShadow: reduceTransparency ? 'none' : (isLiquid ? liquidShadowByVariant : shadowByVariant)[variant][mode],
    overflow: 'hidden',
  } as ViewStyle
}
