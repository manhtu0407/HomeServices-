import type { ViewStyle } from 'react-native'

export type GlassVariant = 'nav' | 'control' | 'hero' | 'sheet' | 'subtle'
export type GlassMode = 'dark' | 'light'

type GlassSurfaceOptions = {
  backgroundColor?: string
  borderColor?: string
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
  mode = 'light',
  reduceTransparency = false,
  variant = 'subtle',
}: GlassSurfaceOptions = {}): ViewStyle {
  const isDark = mode === 'dark'
  const fallbackBackground = isDark ? '#112522' : '#FFFDF8'
  const glassBackground = isDark ? 'rgba(16,36,32,0.72)' : variant === 'nav' ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.70)'

  return {
    backgroundColor: reduceTransparency ? fallbackBackground : (backgroundColor ?? glassBackground),
    borderColor: borderColor ?? (isDark ? 'rgba(255,255,255,0.14)' : variant === 'nav' ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.78)'),
    borderCurve: 'continuous',
    borderRadius: radiusByVariant[variant],
    borderWidth: glassDesignTokens.borderWidth,
    boxShadow: reduceTransparency ? 'none' : shadowByVariant[variant][mode],
    overflow: 'hidden',
  } as ViewStyle
}

export function createOpaqueRowStyle({ mode = 'light' }: { mode?: GlassMode } = {}): ViewStyle {
  return {
    backgroundColor: mode === 'dark' ? '#122724' : '#FFFDF8',
    borderColor: mode === 'dark' ? 'rgba(255,255,255,0.09)' : 'rgba(210,232,225,0.82)',
    borderCurve: 'continuous',
    borderWidth: 1,
    boxShadow: 'none',
  } as ViewStyle
}
