import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Before this, no test asserted that anything invokes the learning monitor. Dropping the
// schedule left every other test green while the loop silently stopped being watched.
const ROOT = join(__dirname, '../../../../..')
const read = (relative: string) => readFileSync(join(ROOT, relative), 'utf8')

describe('learning monitor: scheduled invocation', () => {
  const migration = read(
    'supabase/migrations/20260721105000_kael_learning_monitor_cron.sql',
  )
  const edgeFunction = read('supabase/functions/kael-learning-monitor/index.ts')

  it('schedules a named daily job that posts to the monitor function', () => {
    expect(migration).toContain("'kael-learning-monitor',")
    expect(migration).toContain("'0 2 * * *'")
    expect(migration).toContain("'/functions/v1/kael-learning-monitor'")
  })

  it('re-applies without duplicating or erroring on the job', () => {
    expect(migration).toContain("where jobname = 'kael-learning-monitor'")
    expect(migration).toContain("perform cron.unschedule('kael-learning-monitor')")
  })

  it('stays uninstalled until both Vault secrets exist', () => {
    expect(migration).toContain("where name = 'project_url'")
    expect(migration).toContain("where name = 'kael_learning_monitor_secret'")
    expect(migration).toContain('return false;')
  })

  it('keeps the scheduler helper off every public role', () => {
    expect(migration).toContain('revoke all on function private.schedule_kael_learning_monitor()')
    expect(migration).toContain('from public, anon, authenticated;')
  })

  it('authenticates the function by secret header, not by user JWT', () => {
    expect(edgeFunction).toContain('KAEL_LEARNING_MONITOR_SECRET')
    expect(edgeFunction).toContain('x-kael-learning-monitor-secret')
    expect(edgeFunction).toContain('constantTimeEqual')
    expect(edgeFunction).toContain("json({ error: \"UNAUTHORIZED\" }, 401)")
  })

  it('bounds the request body and the rule limit', () => {
    expect(edgeFunction).toContain('MAX_JSON_BODY_BYTES = 4 * 1024')
    expect(edgeFunction).toContain('readJsonRequestBounded')
    expect(edgeFunction).toContain('MAX_LIMIT = 100')
  })

  it('turns platform JWT verification off so pg_cron can reach it', () => {
    // Without this the gateway rejects the cron call before the function's own
    // secret-header auth ever runs — the job fires daily and silently 401s.
    const config = read('supabase/config.toml')
    const section = config.split('[functions.kael-learning-monitor]')[1]?.split('[')[0] ?? ''
    expect(section).toContain('verify_jwt = false')
  })

  it('declares the secret in the env example without a value', () => {
    const env = read('config/env/workspace.env.example')
    expect(env).toMatch(/^KAEL_LEARNING_MONITOR_SECRET=\s*$/m)
  })
})
