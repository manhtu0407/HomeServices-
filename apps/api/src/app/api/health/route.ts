import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { env, ensureClientEnv, ensureServerEnv } from '@/lib/env'
import { createTimedFetch, withTimeout } from '@/lib/supabase/timed-fetch'

const HEALTH_QUERY_TIMEOUT_MS = 5_000

export async function GET() {
  const checks: Record<string, 'ok' | 'fail' | 'skip'> = {
    env_client: 'fail',
    env_server: 'fail',
    supabase: 'skip',
  }

  let clientEnvReady = false
  try {
    ensureClientEnv()
    checks.env_client = 'ok'
    clientEnvReady = true
  } catch {
    checks.env_client = 'fail'
  }

  try {
    ensureServerEnv()
    checks.env_server = 'ok'
  } catch {
    checks.env_server = 'fail'
  }

  if (clientEnvReady) {
    try {
      const supabase = createClient(
        env.supabaseUrl,
        env.supabasePublishableKey,
        { global: { fetch: createTimedFetch(HEALTH_QUERY_TIMEOUT_MS) } },
      )
      const query = supabase.from('price_baselines').select('id').limit(1)
      const { error } = await withTimeout(query, HEALTH_QUERY_TIMEOUT_MS)
      checks.supabase = error ? 'fail' : 'ok'
    } catch {
      checks.supabase = 'fail'
    }
  }

  const allOk = Object.values(checks).every((v) => v === 'ok' || v === 'skip')

  return NextResponse.json(
    { status: allOk ? 'healthy' : 'degraded', checks },
    { status: allOk ? 200 : 503 },
  )
}
