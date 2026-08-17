import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readGeneratedDatabaseTypes } from '../helpers/generated-database-types'

const root = resolve(__dirname, '../../../../..')
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
  it('wires Next and Edge registration to the RPC and generated type', () => {
    const next = source(resolve(root, 'apps/api/src/lib/workers/register.ts'))
    const edge = source(resolve(
      root,
      'supabase/functions/mobile-api/_shared/domains/worker/registration.ts',
    ))
    const types = readGeneratedDatabaseTypes().replace(/\s+/g, ' ').trim().toLowerCase()
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
