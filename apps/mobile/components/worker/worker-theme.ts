import { useEffect, useSyncExternalStore } from 'react'

import AsyncStorage from '@react-native-async-storage/async-storage'

import type { CustomerThemeTokens } from '@/components/customer/customer-theme'
import { customerTheme } from '@/design/theme'

const WORKER_THEME_STORAGE_KEY = 'nestscout.worker.theme.mode.v1'

export type WorkerThemeMode = 'light' | 'dark'
export type WorkerThemeTokens = CustomerThemeTokens

let workerThemeMode: WorkerThemeMode = 'light'
let workerThemeHydrated = false
let workerThemeSelectionRevision = 0
let pendingWorkerThemePersistence: WorkerThemeMode | null = null
let workerThemePersistenceDrain: Promise<void> | null = null
const workerThemeSubscribers = new Set<() => void>()

function getWorkerThemeModeSnapshot() {
  return workerThemeMode
}

function subscribeWorkerThemeMode(listener: () => void) {
  workerThemeSubscribers.add(listener)
  return () => workerThemeSubscribers.delete(listener)
}

export function getWorkerThemeTokens(mode: WorkerThemeMode): WorkerThemeTokens {
  return mode === 'dark' ? customerTheme.darkLayer : customerTheme.lightLayer
}

export function getReducedTransparencyWorkerTokens(tokens: WorkerThemeTokens): WorkerThemeTokens {
  const reduced = tokens.mode === 'dark'
    ? customerTheme.reducedTransparency.dark
    : customerTheme.reducedTransparency.light

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

export function setWorkerThemeMode(nextMode: WorkerThemeMode) {
  workerThemeSelectionRevision += 1
  const changed = workerThemeMode !== nextMode
  workerThemeMode = nextMode
  const persisted = persistWorkerThemeMode(nextMode)
  if (changed) workerThemeSubscribers.forEach((listener) => listener())
  return persisted
}

export function useWorkerThemeMode() {
  useEffect(() => {
    if (workerThemeHydrated) return
    workerThemeHydrated = true
    const revisionAtStart = workerThemeSelectionRevision
    AsyncStorage.getItem(WORKER_THEME_STORAGE_KEY)
      .then((stored) => {
        if (workerThemeSelectionRevision !== revisionAtStart) return
        if (stored === 'light' || stored === 'dark') void setWorkerThemeMode(stored)
      })
      .catch(() => undefined)
  }, [])

  return useSyncExternalStore(subscribeWorkerThemeMode, getWorkerThemeModeSnapshot, getWorkerThemeModeSnapshot)
}

function persistWorkerThemeMode(nextMode: WorkerThemeMode) {
  pendingWorkerThemePersistence = nextMode
  if (workerThemePersistenceDrain) return workerThemePersistenceDrain
  workerThemePersistenceDrain = drainWorkerThemePersistence()
  return workerThemePersistenceDrain
}

async function drainWorkerThemePersistence() {
  try {
    while (pendingWorkerThemePersistence) {
      const nextMode = pendingWorkerThemePersistence
      pendingWorkerThemePersistence = null
      await AsyncStorage.setItem(WORKER_THEME_STORAGE_KEY, nextMode).catch(() => undefined)
    }
  } finally {
    workerThemePersistenceDrain = null
  }
}
