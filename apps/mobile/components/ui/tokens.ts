import type { ViewStyle } from 'react-native'
import { color } from '@/design/theme'

export type GlassVariant = 'nav' | 'control' | 'hero' | 'sheet' | 'subtle'
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
  subtle: 20,
}

const shadowByVariant: Record<GlassVariant, { dark: string; light: string }> = {
  nav: {
    dark: '0 18px 36px rgba(0,0,0,0.28)',
    light: '0 18px 36px rgba(21,89,78,0.18), inset 0 1px 0 rgba(255,255,255,0.94)',
  },
  control: {
    dark: '0 6px 14px rgba(0,0,0,0.16)',
    light: '0 6px 14px rgba(13,70,65,0.07)',
  },
  hero: {
    dark: '0 12px 30px rgba(0,0,0,0.20)',
    light: '0 12px 30px rgba(13,70,65,0.09)',
  },
  sheet: {
    dark: '0 14px 34px rgba(0,0,0,0.22)',
    light: '0 14px 34px rgba(13,70,65,0.09)',
  },
  subtle: {
    dark: '0 4px 10px rgba(0,0,0,0.12)',
    light: '0 4px 10px rgba(13,70,65,0.05)',
  },
}

const liquidShadowByVariant: Record<GlassVariant, { dark: string; light: string }> = {
  nav: {
    dark: '0 18px 34px rgba(0,0,0,0.24), inset 0 1px 0 rgba(190,210,205,0.10)',
    light: '0 18px 34px rgba(20,73,66,0.12), inset 0 1px 0 rgba(255,255,255,0.30)',
  },
  control: {
    dark: '0 8px 18px rgba(0,0,0,0.18), inset 0 1px 0 rgba(190,210,205,0.09)',
    light: '0 8px 18px rgba(20,73,66,0.07), inset 0 1px 0 rgba(255,255,255,0.28)',
  },
  hero: {
    dark: '0 16px 34px rgba(0,0,0,0.22), inset 0 1px 0 rgba(190,210,205,0.10)',
    light: '0 16px 34px rgba(20,73,66,0.09), inset 0 1px 0 rgba(255,255,255,0.30)',
  },
  sheet: {
    dark: '0 18px 38px rgba(0,0,0,0.26), inset 0 1px 0 rgba(190,210,205,0.10)',
    light: '0 18px 38px rgba(20,73,66,0.10), inset 0 1px 0 rgba(255,255,255,0.30)',
  },
  subtle: {
    dark: '0 6px 14px rgba(0,0,0,0.14), inset 0 1px 0 rgba(190,210,205,0.08)',
    light: '0 6px 14px rgba(20,73,66,0.05), inset 0 1px 0 rgba(255,255,255,0.24)',
  },
}

export const glassDesignTokens = {
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
  variant = 'subtle',
}: GlassSurfaceOptions = {}): ViewStyle {
  const isDark = mode === 'dark'
  const isLiquid = material === 'liquid'
  const fallbackBackground = isLiquid
    ? isDark ? '#161D1B' : color.surface.base
    : isDark ? '#112522' : color.mint.white
  const liquidGlassBackground = isDark
    ? 'rgba(22,29,27,0.38)'
    : variant === 'nav'
      ? 'rgba(255,255,255,0.10)'
      : 'rgba(255,255,255,0.46)'
  const standardGlassBackground = isDark ? 'rgba(16,36,32,0.72)' : variant === 'nav' ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.70)'
  const glassBackground = isLiquid ? liquidGlassBackground : standardGlassBackground
  const liquidBorderColor = isDark ? 'rgba(190,210,205,0.16)' : variant === 'nav' ? 'rgba(255,255,255,0.70)' : 'rgba(255,255,255,0.34)'
  const standardBorderColor = isDark ? 'rgba(255,255,255,0.14)' : variant === 'nav' ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.78)'

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

export function createOpaqueRowStyle({ mode = 'light' }: { mode?: GlassMode } = {}): ViewStyle {
  return {
    backgroundColor: mode === 'dark' ? '#122724' : color.mint.white,
    borderColor: mode === 'dark' ? 'rgba(255,255,255,0.09)' : 'rgba(210,232,225,0.82)',
    borderCurve: 'continuous',
    borderWidth: 1,
    boxShadow: 'none',
  } as ViewStyle
}
