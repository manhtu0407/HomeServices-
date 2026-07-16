import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../../../../..')
const migrationPath = resolve(
  root,
  'supabase/migrations/20260716121927_worker_verification_draft_cleanup.sql',
)
const verificationPath = resolve(
  root,
  'supabase/tests/worker_verification_draft_cleanup_verification.sql',
)

function normalized(path: string): string {
  return readFileSync(path, 'utf8').replace(/\s+/g, ' ').trim().toLowerCase()
}

describe('worker verification draft cleanup', () => {
  it('serializes cleanup against registration before checking submitted refs', () => {
    const migration = normalized(migrationPath)
    const helper = migration.match(
      /create or replace function private\.can_delete_worker_verification_draft[\s\S]*?\$function\$;/,
    )?.[0] ?? ''
    const profileLock = helper.indexOf('from public.profiles as profile')
    const referenceCheck = helper.indexOf('from public.worker_profiles as worker')

    expect(helper).toContain('security definer')
    expect(helper).toContain("set search_path = ''")
    expect(helper).toContain('for key share')
    expect(profileLock).toBeGreaterThan(0)
    expect(referenceCheck).toBeGreaterThan(profileLock)
  })

  it('binds deletion to the exact owner and safe draft path', () => {
    const migration = normalized(migrationPath)

    expect(migration).toContain('p_object_owner is distinct from v_actor_id')
    expect(migration).toContain("pg_catalog.strpos(p_object_name, '..') > 0")
    expect(migration).toContain("pg_catalog.strpos(p_object_name, '//') > 0")
    expect(migration).toContain('pg_catalog.strpos(p_object_name, pg_catalog.chr(92)) > 0')
    expect(migration).toContain('/(cccd-front|cccd-back|selfie)/')
    expect(migration).toContain('[a-za-z0-9][a-za-z0-9._-]{0,119}[.](jpg|jpeg|png|webp)$')
  })

  it('protects submitted refs and grants only authenticated policy execution', () => {
    const migration = normalized(migrationPath)

    expect(migration).toContain("'supabase://worker-verification/' || p_object_name")
    expect(migration).toContain('worker.cccd_front_url = v_storage_ref')
    expect(migration).toContain('worker.cccd_back_url = v_storage_ref')
    expect(migration).toContain('worker.selfie_url = v_storage_ref')
    expect(migration).toContain('on storage.objects for delete to authenticated')
    expect(migration).toContain("bucket_id = 'worker-verification'")
    expect(migration).toContain('owner is not distinct from (select auth.uid())')
    expect(migration).toContain('revoke execute on function private.can_delete_worker_verification_draft(text, uuid) from public, anon, authenticated')
    expect(migration).toContain('grant execute on function private.can_delete_worker_verification_draft(text, uuid) to authenticated')
  })

  it('ships rollback-only owner and negative RLS verification', () => {
    const verification = normalized(verificationPath)

    expect(verification).toMatch(/^begin;[\s\S]*rollback;$/)
    expect(verification).toContain('owner draft was not deletable')
    expect(verification).toContain('submitted verification ref was deletable')
    expect(verification).toContain('cross-owner verification draft was deletable')
    expect(verification).toContain('verification traversal path was deletable')
    expect(verification).toContain('wrong verification folder was deletable')
  })
})
