// Worker theme tokens + mode store, extracted from worker-surfaces.tsx (C4 stage 2).
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useEffect, useSyncExternalStore } from 'react'
import type { WorkerThemeMode } from './types'

export type WorkerThemeTokens = {
  mode: WorkerThemeMode
  canvas: string
  base: string
  raised: string
  strong: string
  depth: string
  mint: string
  cyan: string
  cream: string
  warm: string
  glass: string
  glassStrong: string
  glassBorder: string
  glassHighlight: string
  border: string
  borderStrong: string
  ink: string
  muted: string
  subtle: string
  primary: string
  primaryText: string
  aqua: string
  copper: string
  danger: string
  line: string
  mapLine: string
  mapBlock: string
  sheen: string
  shadow: string
  softShadow: string
}

const WORKER_THEME_STORAGE_KEY = 'home-services.worker.theme.production'

export const lightLayer: WorkerThemeTokens = {
  mode: 'light',
  canvas: '#F6F7F7',
  base: '#FFFFFF',
  raised: '#FFFFFF',
  strong: '#FBFCFC',
  depth: '#E9EFED',
  mint: '#E6F7F3',
  cyan: '#ECF9F8',
  cream: '#FFF8EB',
  warm: '#FFF8EB',
  glass: 'rgba(255,255,255,0.58)',
  glassStrong: 'rgba(255,255,255,0.74)',
  glassBorder: 'rgba(255,255,255,0.82)',
  glassHighlight: 'rgba(255,255,255,0.70)',
  border: 'rgba(35,96,84,0.13)',
  borderStrong: 'rgba(8,120,110,0.22)',
  ink: '#12231F',
  muted: '#647672',
  subtle: '#7D958F',
  primary: '#08786E',
  primaryText: '#FFFFFF',
  aqua: '#51BBC0',
  copper: '#BB743D',
  danger: '#B43F3F',
  line: 'rgba(35,96,84,0.13)',
  mapLine: 'rgba(39,108,96,0.13)',
  mapBlock: 'rgba(255,255,255,0.56)',
  sheen: 'rgba(255,255,255,0.64)',
  shadow: '0 14px 36px rgba(13,70,65,0.11)',
  softShadow: '0 9px 24px rgba(13,70,65,0.08)',
}

export const darkLayer: WorkerThemeTokens = {
  mode: 'dark',
  canvas: '#0B0F0E',
  base: '#111614',
  raised: '#171D1B',
  strong: '#1D2522',
  depth: '#131918',
  mint: '#183832',
  cyan: '#172F31',
  cream: '#30271E',
  warm: '#2A241D',
  glass: 'rgba(22,29,27,0.58)',
  glassStrong: 'rgba(30,38,35,0.68)',
  glassBorder: 'rgba(190,210,205,0.16)',
  glassHighlight: 'rgba(230,244,240,0.13)',
  border: 'rgba(190,210,205,0.12)',
  borderStrong: 'rgba(105,222,198,0.26)',
  ink: '#F1F6F4',
  muted: '#A9B7B3',
  subtle: '#83938F',
  primary: '#63E6D0',
  primaryText: '#08201D',
  aqua: '#82DDE2',
  copper: '#E2A56E',
  danger: '#FF9A8C',
  line: 'rgba(190,210,205,0.09)',
  mapLine: 'rgba(190,210,205,0.15)',
  mapBlock: 'rgba(255,255,255,0.055)',
  sheen: 'rgba(255,255,255,0.12)',
  shadow: '0 22px 56px rgba(0,0,0,0.42)',
  softShadow: '0 12px 34px rgba(0,0,0,0.30)',
}

let workerThemeMode: WorkerThemeMode = 'light'
const themeListeners = new Set<() => void>()

export function getWorkerThemeModeSnapshot() {
  return workerThemeMode
}

export function subscribeWorkerThemeMode(listener: () => void) {
  themeListeners.add(listener)
  const removeListener = themeListeners.delete.bind(themeListeners)
  return () => removeListener(listener)
}

export function setWorkerThemeMode(nextMode: WorkerThemeMode) {
  workerThemeMode = nextMode
  void AsyncStorage.setItem(WORKER_THEME_STORAGE_KEY, nextMode)
  themeListeners.forEach((listener) => listener())
}

export function useWorkerThemeMode() {
  useEffect(() => {
    void AsyncStorage.getItem(WORKER_THEME_STORAGE_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark') setWorkerThemeMode(stored)
    })
  }, [])

  return useSyncExternalStore(subscribeWorkerThemeMode, getWorkerThemeModeSnapshot, getWorkerThemeModeSnapshot)
}

export function getWorkerThemeTokens(mode: WorkerThemeMode) {
  return mode === 'dark' ? darkLayer : lightLayer
}

export function workerLiquidHomeCanvasBackgroundImage(mode: WorkerThemeMode) {
  return mode === 'dark'
    ? 'radial-gradient(circle at 50% 94%, rgba(105,222,198,0.045), transparent 28%), radial-gradient(circle at 58% 10%, rgba(230,244,240,0.060), transparent 30%), linear-gradient(180deg, #0B0F0E 0%, #101513 100%)'
    : 'radial-gradient(circle at 50% 94%, rgba(23,169,149,0.075), transparent 28%), radial-gradient(circle at 54% 12%, rgba(23,169,149,0.10), transparent 30%), linear-gradient(180deg, #F4F6F5 0%, #FBFCFB 100%)'
}

export function getReducedTransparencyWorkerTokens(tokens: WorkerThemeTokens): WorkerThemeTokens {
  return {
    ...tokens,
    glass: tokens.mode === 'dark' ? '#161D1B' : '#FFFDF8',
    glassBorder: tokens.borderStrong,
    glassHighlight: 'transparent',
    glassStrong: tokens.mode === 'dark' ? '#1A2220' : '#FFFFFF',
    shadow: 'none',
    sheen: 'transparent',
    softShadow: 'none',
  }
}

export function workerHasReducedGlass(tokens: WorkerThemeTokens) {
  return tokens.glassHighlight === 'transparent' && tokens.shadow === 'none'
}
