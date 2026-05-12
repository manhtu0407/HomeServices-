import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { env, ensureServerEnv } from '@/lib/env'

export async function GET() {
  const checks: Record<string, 'ok' | 'fail' | 'skip'> = {
    env_client: 'fail',
    env_server: 'fail',
    supabase: 'fail',
  }

  try {
    checks.env_client = 'ok'
  } catch {
    return NextResponse.json({ status: 'unhealthy', checks }, { status: 503 })
  }

  try {
    ensureServerEnv()
    checks.env_server = 'ok'
  } catch {
    checks.env_server = 'fail'
  }

  try {
    const supabase = createClient(env.supabaseUrl, env.supabasePublishableKey)
    const { error } = await supabase.from('price_baselines').select('id').limit(1)
    checks.supabase = error ? 'fail' : 'ok'
  } catch {
    checks.supabase = 'fail'
  }

  const allOk = Object.values(checks).every((v) => v === 'ok' || v === 'skip')

  return NextResponse.json(
    { status: allOk ? 'healthy' : 'degraded', checks },
    { status: allOk ? 200 : 503 }
  )
}
