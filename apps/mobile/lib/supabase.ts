import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'
import type { Database } from '@home-services/shared'
import { mobileRuntimeConfig } from './runtime-config'

const supabaseUrl = mobileRuntimeConfig.supabaseUrl
const supabaseKey = mobileRuntimeConfig.supabasePublishableKey

const isSupabaseConfigured = supabaseUrl.length > 0 && supabaseKey.length > 0

const supabaseAuthStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
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
