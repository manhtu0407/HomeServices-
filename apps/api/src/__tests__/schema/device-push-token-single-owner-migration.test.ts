import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../../../../../')
const migrationsDir = resolve(ROOT, 'supabase/migrations')
const migrationName = readdirSync(migrationsDir).find((name) =>
  name.endsWith('_device_push_token_single_owner.sql'))
const migration = migrationName
  ? readFileSync(resolve(migrationsDir, migrationName), 'utf8').replace(/\r\n/g, '\n').toLowerCase()
  : ''
const verificationPath = resolve(
  ROOT,
  'supabase/tests/device_push_token_single_owner_verification.sql',
)
const verification = existsSync(verificationPath)
  ? readFileSync(verificationPath, 'utf8').replace(/\r\n/g, '\n').toLowerCase()
  : ''

describe('shared-device push-token ownership migration', () => {
  it('backfills a strong token hash and enforces one enabled owner at the database boundary', () => {
    expect(migration).toContain("create extension if not exists pgcrypto with schema extensions")
    expect(migration).toContain("extensions.digest(push_token, 'sha256')")
    expect(migration).toMatch(/row_number\(\) over \([\s\S]*partition by token_hash[\s\S]*last_seen_at desc/)
    expect(migration).toMatch(
      /create unique index device_push_tokens_enabled_token_hash_uidx[\s\S]*on public\.device_push_tokens \(token_hash\)[\s\S]*where enabled/,
    )
  })

  it('runs its table lock and ownership cleanup inside one explicit transaction', () => {
    expect(migration).toMatch(
      /begin;\s*lock table public\.device_push_tokens in share row exclusive mode;[\s\S]*commit;\s*$/,
    )
  })

  it('serializes registration by token and disables the previous owner before enabling the actor', () => {
    const body = migration.match(
      /create or replace function public\.register_device_push_token_atomic[\s\S]*?\$func\$;/,
    )?.[0] ?? ''
    const lock = body.indexOf('pg_advisory_xact_lock')
    const disablePreviousOwner = body.indexOf('update public.device_push_tokens')
    const upsertActor = body.indexOf('insert into public.device_push_tokens')

    expect(lock).toBeGreaterThan(0)
    expect(disablePreviousOwner).toBeGreaterThan(lock)
    expect(upsertActor).toBeGreaterThan(disablePreviousOwner)
    expect(body).toContain('user_id <> p_user_id')
    expect(body).toContain('token_hash = v_hash')
    expect(body).toContain("p_permission_status = 'granted'")
  })

  it('unregisters only the authenticated actor token and keeps the RPC service-role-only', () => {
    const body = migration.match(
      /create or replace function public\.unregister_device_push_token_atomic[\s\S]*?\$func\$;/,
    )?.[0] ?? ''
    const signature = 'unregister_device_push_token_atomic(uuid, text)'

    expect(body).toContain('security invoker')
    expect(body).toContain('user_id = p_user_id')
    expect(body).toContain('token_hash = v_hash')
    expect(body).toContain('enabled is true')
    expect(migration).toContain(`revoke execute on function public.${signature} from public`)
    expect(migration).toContain(`revoke execute on function public.${signature} from anon`)
    expect(migration).toContain(`revoke execute on function public.${signature} from authenticated`)
    expect(migration).toContain(`grant execute on function public.${signature} to service_role`)
  })

  it('ships a transactional ownership-transfer and unregister verification harness', () => {
    expect(verification).toMatch(/^begin;[\s\S]*rollback;\s*$/)
    expect(verification).toContain('register_device_push_token_atomic')
    expect(verification).toContain('unregister_device_push_token_atomic')
    expect(verification).toContain('unique_violation')
  })
})
