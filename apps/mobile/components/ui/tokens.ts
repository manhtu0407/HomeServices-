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
    dark: '0 18px 44px rgba(0,0,0,0.28)',
    light: '0 18px 44px rgba(13,70,65,0.13)',
  },
  control: {
    dark: '0 8px 20px rgba(0,0,0,0.22)',
    light: '0 8px 20px rgba(13,70,65,0.10)',
  },
  hero: {
    dark: '0 22px 58px rgba(0,0,0,0.30)',
    light: '0 22px 58px rgba(13,70,65,0.14)',
  },
  sheet: {
    dark: '0 24px 64px rgba(0,0,0,0.34)',
    light: '0 24px 64px rgba(13,70,65,0.15)',
  },
  subtle: {
    dark: '0 6px 16px rgba(0,0,0,0.18)',
    light: '0 6px 16px rgba(13,70,65,0.07)',
  },
}

export const glassDesignTokens = {
  borderWidth: 1,
  highlightOpacity: 0.48,
  maxVisibleLayers: 3,
  pressedScale: 0.98,
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
  const fallbackBackground = isDark ? 'rgba(17,37,34,0.88)' : 'rgba(255,255,255,0.88)'
  const glassBackground = isDark ? 'rgba(16,36,32,0.72)' : 'rgba(255,255,255,0.70)'

  return {
    backgroundColor: reduceTransparency ? fallbackBackground : (backgroundColor ?? glassBackground),
    borderColor: borderColor ?? (isDark ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.78)'),
    borderCurve: 'continuous',
    borderRadius: radiusByVariant[variant],
    borderWidth: glassDesignTokens.borderWidth,
    boxShadow: reduceTransparency ? 'none' : shadowByVariant[variant][mode],
    overflow: 'hidden',
  } as ViewStyle
}

export function createOpaqueRowStyle({ mode = 'light' }: { mode?: GlassMode } = {}): ViewStyle {
  return {
    backgroundColor: mode === 'dark' ? 'rgba(18,39,36,0.96)' : 'rgba(255,253,248,0.96)',
    borderColor: mode === 'dark' ? 'rgba(255,255,255,0.09)' : 'rgba(210,232,225,0.82)',
    borderCurve: 'continuous',
    borderWidth: 1,
    boxShadow: 'none',
  } as ViewStyle
}
