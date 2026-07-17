import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../../../../..')
const migrationPath = resolve(
  root,
  'supabase/migrations/20260714105000_atomic_worker_registration.sql',
)
const verificationPath = resolve(
  root,
  'supabase/tests/worker_registration_atomic_verification.sql',
)

function normalized(path: string): string {
  return readFileSync(path, 'utf8').replace(/\s+/g, ' ').trim().toLowerCase()
}

function source(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n').toLowerCase()
}

describe('atomic worker registration migration', () => {
  it('uses COALESCE as SQL syntax instead of a schema-qualified function call', () => {
    expect(source(migrationPath)).not.toMatch(/pg_catalog\.coalesce\s*\(/)
  })

  it('serializes profile ownership, role, and worker finalization checks', () => {
    const migration = normalized(migrationPath)
    const body = migration.match(
      /create or replace function public\.submit_worker_registration_atomic[\s\S]*?\$func\$;/,
    )?.[0] ?? ''
    const profileLock = body.indexOf('from public.profiles as profile')
    const workerLock = body.indexOf('from public.worker_profiles as worker')
    const workerWrite = body.indexOf('insert into public.worker_profiles as worker')

    expect(body).toContain('security invoker')
    expect(body).toContain('set search_path = public, pg_catalog')
    expect(body).toContain('p_actor_id is distinct from p_worker_id')
    expect(body).toContain("v_profile.role <> 'worker'::public.user_role")
    expect(profileLock).toBeGreaterThan(0)
    expect(workerLock).toBeGreaterThan(profileLock)
    expect(workerWrite).toBeGreaterThan(workerLock)
    expect(body.slice(profileLock, workerWrite).match(/for update/g)).toHaveLength(2)
  })

  it('never reopens an approved or suspended worker and preserves safe retries', () => {
    const migration = normalized(migrationPath)

    expect(migration).toMatch(/v_worker\.verification_status in \( 'under_review'::[\s\S]*?'approved'::[\s\S]*?'suspended'::/)
    expect(migration).toContain('worker.is_approved is true')
    expect(migration).toContain('worker.is_suspended is true')
    expect(migration).toContain("worker.verification_status = 'submitted'::public.worker_verification_status")
    expect(migration).toContain('idempotent_out')
    expect(migration).toContain('on conflict (id) do update')
  })

  it('binds each private verification ref to its worker and document folder', () => {
    const migration = normalized(migrationPath)

    expect(migration).toContain(
      "p_cccd_front_url !~ ( '^supabase://worker-verification/' || p_worker_id::text || '/cccd-front/",
    )
    expect(migration).toContain(
      "p_cccd_back_url !~ ( '^supabase://worker-verification/' || p_worker_id::text || '/cccd-back/",
    )
    expect(migration).toContain(
      "p_selfie_url !~ ( '^supabase://worker-verification/' || p_worker_id::text || '/selfie/",
    )
    expect(migration).toContain(
      '[a-za-z0-9][a-za-z0-9._-]{0,119}[.](jpg|jpeg|png|webp)$',
    )
  })

  it('requires the exact owned private Storage objects before any worker write', () => {
    const migration = normalized(migrationPath)
    const body = migration.match(
      /create or replace function public\.submit_worker_registration_atomic[\s\S]*?\$func\$;/,
    )?.[0] ?? ''
    const storageLock = body.indexOf('from storage.objects as object')
    const workerWrite = body.indexOf('insert into public.worker_profiles as worker')

    expect(body).toContain("object.bucket_id = 'worker-verification'")
    expect(body).toContain('object.name = any(v_verification_paths)')
    expect(body).toContain('object.owner is not distinct from p_worker_id')
    expect(body).toContain("object.metadata ->> 'mimetype'")
    expect(body).toContain("object.metadata ->> 'size'")
    expect(body).toContain('between 1 and 10485760')
    expect(body).toContain('for share of object')
    expect(storageLock).toBeGreaterThan(0)
    expect(workerWrite).toBeGreaterThan(storageLock)
  })

  it('keeps the RPC service-role-only', () => {
    const migration = normalized(migrationPath)
    const signature = [
      'submit_worker_registration_atomic(',
      'uuid, uuid, text, date, text, public.service_type[], integer, text[],',
      'numeric, numeric, integer, text[], text, text, text, text, text',
      ')',
    ].join(' ')

    expect(migration).toContain(`revoke execute on function public.${signature} from public`)
    expect(migration).toContain(`revoke execute on function public.${signature} from anon`)
    expect(migration).toContain(`revoke execute on function public.${signature} from authenticated`)
    expect(migration).toContain(`grant execute on function public.${signature} to service_role`)
  })

  it('wires Next and Edge registration to the RPC and generated type', () => {
    const next = source(resolve(root, 'apps/api/src/lib/workers/register.ts'))
    const edge = source(resolve(
      root,
      'supabase/functions/mobile-api/_shared/services/workers/index.ts',
    ))
    const types = normalized(resolve(root, 'packages/shared/src/types/database.types.ts'))
    const nextRegister = next.match(/export async function registerworker[\s\S]*?\nfunction normalizeworkerdistricts/)?.[0] ?? ''
    const edgeRegister = edge.match(/export async function registerworker[\s\S]*?\n}\n\nexport async function submitworkerapplication/)?.[0] ?? ''

    for (const source of [nextRegister, edgeRegister]) {
      expect(source).toContain('submit_worker_registration_atomic')
      expect(source).not.toContain('.upsert(')
      expect(source).not.toContain('from("worker_profiles")')
      expect(source).not.toContain("from('worker_profiles')")
    }
    expect(types).toContain('submit_worker_registration_atomic: {')
  })

  it('ships rollback-only retry, privilege, and serialization verification', () => {
    const verification = normalized(verificationPath)

    expect(verification).toMatch(/^begin;[\s\S]*rollback;$/)
    expect(verification).toContain('submit_worker_registration_atomic')
    expect(verification).toContain('idempotent replay performed a write')
    expect(verification).toContain('approved registration was reopened')
    expect(verification).toContain('suspended registration was reopened')
    expect(verification).toContain('cross-worker verification ref was accepted')
    expect(verification).toContain('wrong verification document folder was accepted')
    expect(verification).toContain('verification ref traversal was accepted')
    expect(verification).toContain('missing verification object was accepted')
    expect(verification).toContain('wrong-bucket verification object was accepted')
    expect(verification).toContain('wrong-owner verification object was accepted')
    expect(verification).toContain('oversize verification object was accepted')
    expect(verification).toContain('disallowed-mime verification object was accepted')
    expect(verification).toContain('service_role_only_rpc')
  })
})
