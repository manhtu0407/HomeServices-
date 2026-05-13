import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import Constants from 'expo-constants'
import type { Database } from '@home-services/shared'

const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl ?? ''
const supabaseKey = Constants.expoConfig?.extra?.supabasePublishableKey ?? ''

export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
