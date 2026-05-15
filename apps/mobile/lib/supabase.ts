import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import Constants from 'expo-constants'
import type { Database } from '@home-services/shared'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
  ?? Constants.expoConfig?.extra?.supabaseUrl
  ?? ''
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ?? Constants.expoConfig?.extra?.supabasePublishableKey
  ?? ''

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
