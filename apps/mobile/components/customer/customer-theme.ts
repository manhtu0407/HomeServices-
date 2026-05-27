import { createContext, useEffect, useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

const CUSTOMER_THEME_STORAGE_KEY = 'customer.theme.mode.v4'

export type ThemeMode = 'light' | 'dark'

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
  primaryText: string
  aqua: string
  copper: string
  danger: string
}

const lightLayer: CustomerThemeTokens = {
  mode: 'light',
  canvas: '#FAFCF4',
  base: '#FFFDF6',
  raised: '#FFFFFF',
  service: '#DDFBF2',
  water: '#E8FCFA',
  warm: '#FFF7EA',
  depthSurface: '#E5F1EB',
  ghost: 'rgba(255,253,248,0.78)',
  glass: 'rgba(255,255,255,0.58)',
  glassStrong: 'rgba(255,255,255,0.74)',
  glassWarm: 'rgba(255,253,246,0.68)',
  glassBorder: 'rgba(255,255,255,0.82)',
  glassHighlight: 'rgba(255,255,255,0.70)',
  glassShadow: '0 12px 30px rgba(13,70,65,0.09)',
  glassFloatShadow: '0 8px 20px rgba(13,70,65,0.07)',
  disabled: '#E5EEEA',
  border: 'rgba(35,96,84,0.13)',
  borderStrong: 'rgba(8,120,110,0.22)',
  text: '#12231F',
  muted: '#647672',
  subtleText: '#7D958F',
  primary: '#08786E',
  primaryText: '#FFFFFF',
  aqua: '#7BE5D7',
  copper: '#BB743D',
  danger: '#C94F45',
}

const darkLayer: CustomerThemeTokens = {
  mode: 'dark',
  canvas: '#071312',
  base: '#10201F',
  raised: '#162B28',
  service: '#173B35',
  water: '#15363A',
  warm: '#3B291B',
  depthSurface: '#0D1B1A',
  ghost: 'rgba(237,248,244,0.12)',
  glass: 'rgba(14,32,32,0.62)',
  glassStrong: 'rgba(19,43,42,0.74)',
  glassWarm: 'rgba(24,34,31,0.72)',
  glassBorder: 'rgba(255,255,255,0.14)',
  glassHighlight: 'rgba(255,255,255,0.16)',
  glassShadow: '0 12px 32px rgba(0,0,0,0.20)',
  glassFloatShadow: '0 8px 22px rgba(0,0,0,0.16)',
  disabled: '#172927',
  border: '#294A45',
  borderStrong: '#3B6A62',
  text: '#F0FBF7',
  muted: '#9AB6B0',
  subtleText: '#85A59E',
  primary: '#69DEC6',
  primaryText: '#071312',
  aqua: '#76DCE3',
  copper: '#E0A06B',
  danger: '#F29A8D',
}

const CUSTOMER_THEME_TOKENS = {
  lightLayer,
  darkLayer,
}

export const CustomerThemeContext = createContext<CustomerThemeTokens>(lightLayer)

let customerThemeMode: ThemeMode = 'light'
let customerThemeSubscribers: Array<() => void> = []
let customerThemeHydrated = false

function getCustomerThemeModeSnapshot() {
  return customerThemeMode
}

function subscribeCustomerThemeMode(listener: () => void) {
  customerThemeSubscribers = [...customerThemeSubscribers, listener]
  return () => {
    customerThemeSubscribers = customerThemeSubscribers.filter((item) => item !== listener)
  }
}

export function setCustomerThemeMode(nextMode: ThemeMode) {
  if (customerThemeMode === nextMode) return
  customerThemeMode = nextMode
  AsyncStorage.setItem(CUSTOMER_THEME_STORAGE_KEY, nextMode).catch(() => undefined)
  for (const listener of customerThemeSubscribers) listener()
}

export function useCustomerThemeMode() {
  useEffect(() => {
    if (customerThemeHydrated) return
    customerThemeHydrated = true
    AsyncStorage.getItem(CUSTOMER_THEME_STORAGE_KEY)
      .then((stored) => {
        if (stored === 'light' || stored === 'dark') setCustomerThemeMode(stored)
      })
      .catch(() => undefined)
  }, [])

  return useSyncExternalStore(subscribeCustomerThemeMode, getCustomerThemeModeSnapshot, getCustomerThemeModeSnapshot)
}

export function getCustomerThemeTokens(mode: ThemeMode) {
  return mode === 'light' ? CUSTOMER_THEME_TOKENS.lightLayer : CUSTOMER_THEME_TOKENS.darkLayer
}

export function getReducedTransparencyCustomerTokens(tokens: CustomerThemeTokens): CustomerThemeTokens {
  return {
    ...tokens,
    ghost: tokens.mode === 'dark' ? 'rgba(18,39,36,0.96)' : 'rgba(255,253,248,0.96)',
    glass: tokens.mode === 'dark' ? 'rgba(18,39,36,0.96)' : 'rgba(255,253,248,0.96)',
    glassBorder: tokens.borderStrong,
    glassFloatShadow: 'none',
    glassHighlight: 'transparent',
    glassShadow: 'none',
    glassStrong: tokens.mode === 'dark' ? 'rgba(22,43,40,0.98)' : 'rgba(255,255,255,0.98)',
    glassWarm: tokens.mode === 'dark' ? 'rgba(59,41,27,0.96)' : 'rgba(255,247,235,0.98)',
  }
}
