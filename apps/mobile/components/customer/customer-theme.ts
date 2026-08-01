import { useEffect, useSyncExternalStore } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { customerTheme } from '@/design/theme'

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

const lightLayer: CustomerThemeTokens = customerTheme.lightLayer
const darkLayer: CustomerThemeTokens = customerTheme.darkLayer

const CUSTOMER_THEME_TOKENS = {
  lightLayer,
  darkLayer,
}

let customerThemeMode: ThemeMode = 'light'
let customerThemeSubscribers: (() => void)[] = []
let customerThemeHydrated = false
let customerThemeSelectionRevision = 0
let pendingThemePersistence: ThemeMode | null = null
let themePersistenceDrain: Promise<void> | null = null

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
  customerThemeSelectionRevision += 1
  const changed = customerThemeMode !== nextMode
  customerThemeMode = nextMode
  const persisted = persistCustomerThemeMode(nextMode)
  if (!changed) return persisted
  for (const listener of customerThemeSubscribers) listener()
  return persisted
}

function persistCustomerThemeMode(nextMode: ThemeMode) {
  pendingThemePersistence = nextMode
  if (themePersistenceDrain) return themePersistenceDrain
  themePersistenceDrain = drainThemePersistence()
  return themePersistenceDrain
}

async function drainThemePersistence() {
  try {
    while (pendingThemePersistence) {
      const nextMode = pendingThemePersistence
      pendingThemePersistence = null
      await AsyncStorage.setItem(CUSTOMER_THEME_STORAGE_KEY, nextMode).catch(() => undefined)
    }
  } finally {
    themePersistenceDrain = null
  }
}

export function useCustomerThemeMode() {
  useEffect(() => {
    if (customerThemeHydrated) return
    customerThemeHydrated = true
    const selectionRevisionAtStart = customerThemeSelectionRevision
    AsyncStorage.getItem(CUSTOMER_THEME_STORAGE_KEY)
      .then((stored) => {
        if (customerThemeSelectionRevision !== selectionRevisionAtStart) return
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
