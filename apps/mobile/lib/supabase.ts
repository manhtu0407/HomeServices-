import { createClient } from '@supabase/supabase-js'
import Constants from 'expo-constants'
import * as SecureStore from 'expo-secure-store'
import type { Database } from '@home-services/shared'

const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl ?? ''
const supabaseKey = Constants.expoConfig?.extra?.supabasePublishableKey ?? ''

export const isSupabaseConfigured = supabaseUrl.length > 0 && supabaseKey.length > 0

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
