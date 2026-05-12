import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'
import { env } from './env'

export function createClient() {
  return createBrowserClient<Database>(
    env.supabaseUrl,
    env.supabasePublishableKey
  )
}
