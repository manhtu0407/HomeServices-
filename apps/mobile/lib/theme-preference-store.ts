import { useEffect, useSyncExternalStore } from 'react'
import { Appearance, useColorScheme } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type ResolvedThemeMode = 'light' | 'dark'
// 'system' follows the iPhone's Light/Dark setting, as Apple's HIG asks apps to by default.
export type ThemePreference = 'system' | ResolvedThemeMode

export function resolveThemePreference(preference: ThemePreference, systemScheme: string | null | undefined): ResolvedThemeMode {
  if (preference !== 'system') return preference
  return systemScheme === 'dark' ? 'dark' : 'light'
}

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark'
}

// One persisted theme preference per role. A selection made while storage is still loading wins
// over the late stored value, and rapid writes are drained in order so the last choice persists last.
export function createThemePreferenceStore(storageKey: string) {
  let preference: ThemePreference = 'system'
  let hydrated = false
  let selectionRevision = 0
  let pendingPersistence: ThemePreference | null = null
  let persistenceDrain: Promise<void> | null = null
  const subscribers = new Set<() => void>()

  const getSnapshot = () => preference
  const subscribe = (listener: () => void) => {
    subscribers.add(listener)
    return () => {
      subscribers.delete(listener)
    }
  }

  async function drainPersistence() {
    try {
      while (pendingPersistence) {
        const next = pendingPersistence
        pendingPersistence = null
        await AsyncStorage.setItem(storageKey, next).catch(() => undefined)
      }
    } finally {
      persistenceDrain = null
    }
  }

  function setPreference(next: ThemePreference) {
    selectionRevision += 1
    const changed = preference !== next
    preference = next
    pendingPersistence = next
    if (!persistenceDrain) persistenceDrain = drainPersistence()
    const persisted = persistenceDrain
    if (changed) subscribers.forEach((listener) => listener())
    return persisted
  }

  function usePreference() {
    useEffect(() => {
      if (hydrated) return
      hydrated = true
      const revisionAtStart = selectionRevision
      AsyncStorage.getItem(storageKey)
        .then((stored) => {
          if (selectionRevision !== revisionAtStart) return
          if (isThemePreference(stored) && stored !== preference) {
            preference = stored
            subscribers.forEach((listener) => listener())
          }
        })
        .catch(() => undefined)
    }, [])

    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  }

  function useResolvedMode(): ResolvedThemeMode {
    const current = usePreference()
    // useColorScheme can be null before the first native event; Appearance has the launch value.
    const systemScheme = useColorScheme() ?? Appearance.getColorScheme()
    return resolveThemePreference(current, systemScheme)
  }

  return { setPreference, usePreference, useResolvedMode }
}
