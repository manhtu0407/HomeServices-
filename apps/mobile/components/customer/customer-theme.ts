import { createContext, useEffect, useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { color } from '@/design/theme'

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
  canvas: color.background,
  base: color.mint.white,
  raised: color.surface.raised,
  service: color.surface.mint,
  water: color.mint.mint50,
  warm: '#FFF8EB',
  depthSurface: color.mint.auraSoft,
  ghost: 'rgba(255,253,248,0.78)',
  glass: 'rgba(255,255,255,0.58)',
  glassStrong: 'rgba(255,255,255,0.74)',
  glassWarm: 'rgba(255,253,246,0.68)',
  glassBorder: 'rgba(255,255,255,0.82)',
  glassHighlight: 'rgba(255,255,255,0.70)',
  glassShadow: '0 12px 30px rgba(13,70,65,0.09)',
  glassFloatShadow: '0 8px 20px rgba(13,70,65,0.07)',
  disabled: color.surface.disabled,
  border: 'rgba(35,96,84,0.13)',
  borderStrong: 'rgba(8,120,110,0.22)',
  text: color.text.primary,
  muted: color.text.secondary,
  subtleText: color.text.muted,
  primary: color.brand.primary,
  primaryText: color.text.inverse,
  aqua: color.accent.aqua,
  copper: '#BB743D',
  danger: color.accent.destructive,
}

const darkLayer: CustomerThemeTokens = {
  mode: 'dark',
  canvas: '#0B0F0E',
  base: '#111614',
  raised: '#171D1B',
  service: '#183832',
  water: '#172F31',
  warm: '#2A241D',
  depthSurface: '#131918',
  ghost: 'rgba(190,210,205,0.10)',
  glass: 'rgba(22,29,27,0.58)',
  glassStrong: 'rgba(30,38,35,0.68)',
  glassWarm: 'rgba(30,37,34,0.66)',
  glassBorder: 'rgba(190,210,205,0.16)',
  glassHighlight: 'rgba(230,244,240,0.13)',
  glassShadow: '0 22px 56px rgba(0,0,0,0.42)',
  glassFloatShadow: '0 12px 34px rgba(0,0,0,0.30)',
  disabled: '#1D2522',
  border: 'rgba(190,210,205,0.12)',
  borderStrong: 'rgba(105,222,198,0.26)',
  text: '#F1F6F4',
  muted: '#A9B7B3',
  subtleText: '#83938F',
  primary: color.mint.mint300,
  primaryText: '#08201D',
  aqua: '#82DDE2',
  copper: '#E2A56E',
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
    ghost: tokens.mode === 'dark' ? '#161D1B' : '#FFFFFF',
    glass: tokens.mode === 'dark' ? '#161D1B' : '#FFFFFF',
    glassBorder: tokens.borderStrong,
    glassFloatShadow: 'none',
    glassHighlight: 'transparent',
    glassShadow: 'none',
    glassStrong: tokens.mode === 'dark' ? '#1D2522' : '#FFFFFF',
    glassWarm: tokens.mode === 'dark' ? '#2A241D' : '#FFF8EB',
  }
}
