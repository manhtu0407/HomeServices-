import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import Constants from 'expo-constants'
import type { Database } from '@home-services/shared'

const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl ?? ''
const supabaseKey = Constants.expoConfig?.extra?.supabasePublishableKey ?? ''

export const isSupabaseConfigured = supabaseUrl.length > 0 && supabaseKey.length > 0

export const supabase = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl, supabaseKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null
