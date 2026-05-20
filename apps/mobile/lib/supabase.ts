import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import type { Database } from '@home-services/shared'
import { mobileRuntimeConfig } from './runtime-config'

const supabaseUrl = mobileRuntimeConfig.supabaseUrl
const supabaseKey = mobileRuntimeConfig.supabasePublishableKey

const isSupabaseConfigured = supabaseUrl.length > 0 && supabaseKey.length > 0

type BrowserStorage = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>

const memoryAuthStorage = new Map<string, string>()

function getBrowserStorage(): BrowserStorage | null {
  try {
    return typeof globalThis !== 'undefined' && 'localStorage' in globalThis
      ? (globalThis as typeof globalThis & { localStorage?: BrowserStorage }).localStorage ?? null
      : null
  } catch {
    return null
  }
}

const fallbackAuthStorage = {
  getItem: async (key: string) => {
    try {
      return getBrowserStorage()?.getItem(key) ?? memoryAuthStorage.get(key) ?? null
    } catch {
      return memoryAuthStorage.get(key) ?? null
    }
  },
  setItem: async (key: string, value: string) => {
    memoryAuthStorage.set(key, value)
    try {
      getBrowserStorage()?.setItem(key, value)
    } catch {
      // In-memory auth storage keeps Expo web preview usable when browser storage is blocked.
    }
  },
  removeItem: async (key: string) => {
    memoryAuthStorage.delete(key)
    try {
      getBrowserStorage()?.removeItem(key)
    } catch {
      // Browser storage can be unavailable in hardened webviews; removal remains best-effort.
    }
  },
}

const shouldUseSecureStore = Platform.OS !== 'web'
  && typeof SecureStore.getItemAsync === 'function'
  && typeof SecureStore.setItemAsync === 'function'
  && typeof SecureStore.deleteItemAsync === 'function'

const supabaseAuthStorage = {
  getItem: async (key: string) => {
    if (!shouldUseSecureStore) {
      return fallbackAuthStorage.getItem(key)
    }

    try {
      return await SecureStore.getItemAsync(key)
    } catch {
      return fallbackAuthStorage.getItem(key)
    }
  },
  setItem: async (key: string, value: string) => {
    if (!shouldUseSecureStore) {
      await fallbackAuthStorage.setItem(key, value)
      return
    }

    try {
      await SecureStore.setItemAsync(key, value)
    } catch {
      await fallbackAuthStorage.setItem(key, value)
    }
  },
  removeItem: async (key: string) => {
    if (!shouldUseSecureStore) {
      await fallbackAuthStorage.removeItem(key)
      return
    }

    try {
      await SecureStore.deleteItemAsync(key)
    } catch {
      await fallbackAuthStorage.removeItem(key)
    }
  },
}

export const supabase = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl, supabaseKey, {
      auth: {
        storage: supabaseAuthStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null
