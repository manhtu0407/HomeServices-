import { customerTheme } from '@/design/theme'
import { createThemePreferenceStore, type ResolvedThemeMode, type ThemePreference } from '@/lib/theme-preference-store'

const CUSTOMER_THEME_STORAGE_KEY = 'customer.theme.mode.v4'

export type ThemeMode = ResolvedThemeMode
export type { ThemePreference }

export type CustomerThemeTokens = {
  mode: ThemeMode
  canvas: string
  base: string
  raised: string
  service: string
  water: string
  warm: string
  depthSurface: string
  ghost: string
  glass: string
  glassStrong: string
  glassWarm: string
  glassBorder: string
  glassHighlight: string
  glassShadow: string
  glassFloatShadow: string
  disabled: string
  border: string
  borderStrong: string
  text: string
  muted: string
  subtleText: string
  primary: string
  guidanceAction: string
  progressActive: string
  progressInactiveText: string
  statusSurface: string
  statusText: string
  progressTrack: string
  progressBorder: string
  primaryText: string
  aqua: string
  copper: string
  danger: string
}

const lightLayer: CustomerThemeTokens = customerTheme.lightLayer
const darkLayer: CustomerThemeTokens = customerTheme.darkLayer

const CUSTOMER_THEME_TOKENS = {
  lightLayer,
  darkLayer,
}

const customerThemeStore = createThemePreferenceStore(CUSTOMER_THEME_STORAGE_KEY)

export function setCustomerThemeMode(next: ThemePreference) {
  return customerThemeStore.setPreference(next)
}

export function useCustomerThemePreference() {
  return customerThemeStore.usePreference()
}

export function useCustomerThemeMode(): ThemeMode {
  return customerThemeStore.useResolvedMode()
}

export function getCustomerThemeTokens(mode: ThemeMode) {
  return mode === 'light' ? CUSTOMER_THEME_TOKENS.lightLayer : CUSTOMER_THEME_TOKENS.darkLayer
}

export function getReducedTransparencyCustomerTokens(tokens: CustomerThemeTokens): CustomerThemeTokens {
  const reduced = tokens.mode === 'dark' ? customerTheme.reducedTransparency.dark : customerTheme.reducedTransparency.light
  return {
    ...tokens,
    ghost: reduced.ghost,
    glass: reduced.glass,
    glassBorder: tokens.borderStrong,
    glassFloatShadow: 'none',
    glassHighlight: 'transparent',
    glassShadow: 'none',
    glassStrong: reduced.glassStrong,
    glassWarm: reduced.glassWarm,
  }
}
