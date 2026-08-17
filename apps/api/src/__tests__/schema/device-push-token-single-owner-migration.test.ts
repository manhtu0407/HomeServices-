import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../../../../../')
const verificationPath = resolve(
  ROOT,
  'supabase/tests/device_push_token_single_owner_verification.sql',
)
const verification = existsSync(verificationPath)
  ? readFileSync(verificationPath, 'utf8').replace(/\r\n/g, '\n').toLowerCase()
  : ''

// The single-owner rule, the advisory lock ordering, and the service-role-only
// grants are enforced by Postgres and exercised by the verification script in
// the database-controls job. Only the script's own rollback discipline needs a
// reader, because a script that commits still passes when it runs.
describe('shared-device push-token ownership migration', () => {
  it('ships a transactional ownership-transfer and unregister verification harness', () => {
    expect(verification).toMatch(/^begin;[\s\S]*rollback;\s*$/)
    expect(verification).toContain('register_device_push_token_atomic')
    expect(verification).toContain('unregister_device_push_token_atomic')
    expect(verification).toContain('unique_violation')
  })
})
