import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'
import type { Database } from '@nestscout/shared'
import { mobileRuntimeConfig } from './runtime-config'
import { withSecureStoreDeadline } from './secure-store-deadline'

const supabaseUrl = mobileRuntimeConfig.supabaseUrl
const supabaseKey = mobileRuntimeConfig.supabasePublishableKey

const isSupabaseConfigured = supabaseUrl.length > 0 && supabaseKey.length > 0
const SUPABASE_API_TIMEOUT_MS = 20_000
const SUPABASE_STORAGE_TIMEOUT_MS = 65_000

type BrowserStorage = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>

const memoryAuthStorage = new Map<string, string>()
const authStorageMutations = new Map<string, Promise<void>>()

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

const isNativeRuntime = Platform.OS !== 'web'
const secureStoreAvailable = isNativeRuntime
  && typeof SecureStore.getItemAsync === 'function'
  && typeof SecureStore.setItemAsync === 'function'
  && typeof SecureStore.deleteItemAsync === 'function'

export const supabaseAuthStorage = {
  getItem: async (key: string) => {
    if (!isNativeRuntime) {
      return fallbackAuthStorage.getItem(key)
    }
    if (!secureStoreAvailable) {
      memoryAuthStorage.delete(key)
      return null
    }

    try {
      const pending = authStorageMutations.get(key)
      if (pending) await withSecureStoreDeadline(pending)
      return await withSecureStoreDeadline(SecureStore.getItemAsync(key))
    } catch {
      memoryAuthStorage.delete(key)
      return null
    }
  },
  setItem: async (key: string, value: string) => {
    if (!isNativeRuntime) {
      await fallbackAuthStorage.setItem(key, value)
      return
    }
    memoryAuthStorage.delete(key)
    if (!secureStoreAvailable) return

    await queueAuthStorageMutation(key, () => SecureStore.setItemAsync(key, value))
  },
  removeItem: async (key: string) => {
    if (!isNativeRuntime) {
      await fallbackAuthStorage.removeItem(key)
      return
    }
    memoryAuthStorage.delete(key)
    if (!secureStoreAvailable) return

    await queueAuthStorageMutation(key, () => SecureStore.deleteItemAsync(key))
  },
}

async function queueAuthStorageMutation(key: string, operation: () => Promise<void>) {
  const previous = authStorageMutations.get(key) ?? Promise.resolve()
  const mutation = previous.catch(() => undefined).then(operation)
  const settled = mutation.catch(() => undefined)
  authStorageMutations.set(key, settled)
  void settled.then(() => {
    if (authStorageMutations.get(key) === settled) authStorageMutations.delete(key)
  })
  await withSecureStoreDeadline(mutation).catch(() => undefined)
}

export const supabaseAuthOptions = {
  storage: supabaseAuthStorage,
  autoRefreshToken: true,
  persistSession: true,
  detectSessionInUrl: Platform.OS === 'web',
  flowType: 'pkce' as const,
}

export async function supabaseFetch(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) {
  const upstreamSignal = init?.signal
  if (upstreamSignal?.aborted) throw supabaseAbortError('SUPABASE_REQUEST_ABORTED')

  const controller = new AbortController()
  const relayAbort = () => controller.abort(upstreamSignal?.reason)
  upstreamSignal?.addEventListener('abort', relayAbort, { once: true })
  const timeout = setTimeout(
    () => controller.abort(supabaseAbortError('SUPABASE_REQUEST_TIMEOUT')),
    supabaseRequestTimeout(input),
  )
  let rejectOnAbort: ((error: Error) => void) | undefined
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectOnAbort = reject
  })
  const onAbort = () => {
    const reason = controller.signal.reason
    rejectOnAbort?.(reason instanceof Error ? reason : supabaseAbortError('SUPABASE_REQUEST_ABORTED'))
  }
  controller.signal.addEventListener('abort', onAbort, { once: true })

  try {
    return await Promise.race([
      globalThis.fetch(input, { ...init, redirect: 'error', signal: controller.signal }),
      aborted,
    ])
  } finally {
    clearTimeout(timeout)
    controller.signal.removeEventListener('abort', onAbort)
    upstreamSignal?.removeEventListener('abort', relayAbort)
  }
}

function supabaseRequestTimeout(input: Parameters<typeof fetch>[0]) {
  const url = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : typeof input.url === 'string'
        ? input.url
        : ''
  return /\/storage\/v1\//i.test(url)
    ? SUPABASE_STORAGE_TIMEOUT_MS
    : SUPABASE_API_TIMEOUT_MS
}

function supabaseAbortError(message: string) {
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

export const supabase = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl, supabaseKey, {
      auth: supabaseAuthOptions,
      global: {
        fetch: supabaseFetch,
      },
    })
  : null
