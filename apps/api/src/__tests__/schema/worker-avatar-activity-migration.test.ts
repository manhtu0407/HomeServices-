import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../../../../..')
const migrationPath = resolve(
  root,
  'supabase/migrations/20260713143000_worker_avatar_and_app_activity.sql',
)

describe('worker avatar and foreground activity migration', () => {
  it('keeps worker avatars private and bounds accepted image uploads', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain("'worker-avatars', 'worker-avatars', false, 5242880")
    expect(sql).toContain("array['image/jpeg', 'image/png', 'image/webp']")
    expect(sql).not.toMatch(/worker-avatars[\s\S]{0,240}public\s*=\s*true/i)
  })

  it('stores authoritative minutes, caps lifetime at 10,000 hours, and increments once per UTC minute', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('app_active_minutes bigint not null default 0')
    expect(sql).toContain('app_last_active_minute timestamptz')
    expect(sql).toContain('app_active_minutes <= 600000')
    expect(sql).toContain('record_worker_app_active_minute')
    expect(sql).toContain("date_trunc('minute', timezone('utc', now()))")
    expect(sql).toMatch(/least\(600000,\s*wp\.app_active_minutes \+ 1\)/i)
    expect(sql).toContain('revoke execute on function public.record_worker_app_active_minute(uuid) from public, anon, authenticated')
    expect(sql).toContain('grant execute on function public.record_worker_app_active_minute(uuid) to service_role')
  })
})
