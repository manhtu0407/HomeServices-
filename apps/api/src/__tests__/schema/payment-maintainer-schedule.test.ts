import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '../../../../..')
const read = (relative: string) => readFileSync(join(ROOT, relative), 'utf8')

describe('payment maintainer: scheduled invocation', () => {
  const migration = read(
    'supabase/migrations/20260811213100_schedule_payment_maintainer.sql',
  )
  const edgeFunction = read('supabase/functions/payment-maintainer/index.ts')

  it('schedules one named five-minute job for the maintainer function', () => {
    expect(migration).toContain("'payment-maintainer',")
    expect(migration).toContain("'*/5 * * * *'")
    expect(migration).toContain("'/functions/v1/payment-maintainer'")
  })

  it('does not install the job until both Vault values are configured', () => {
    expect(migration).toContain("where name = 'project_url'")
    expect(migration).toContain("where name = 'payment_maintainer_secret'")
    expect(migration).toContain('return false;')
  })

  it('keeps the scheduler helper off public roles', () => {
    expect(migration).toContain('revoke all on function private.schedule_payment_maintainer()')
    expect(migration).toContain('from public, anon, authenticated;')
  })

  it('uses dedicated secret-header authentication instead of a user JWT', () => {
    expect(edgeFunction).toContain('PAYMENT_MAINTAINER_SECRET')
    expect(edgeFunction).toContain('x-payment-maintainer-secret')
    expect(edgeFunction).toContain('constantTimeEqual')
    expect(edgeFunction).toContain('MAINTAINER_NOT_CONFIGURED')
  })

  it('keeps gateway JWT verification disabled only for the scheduled function', () => {
    const config = read('supabase/config.toml')
    const section = config.split('[functions.payment-maintainer]')[1]?.split('[')[0] ?? ''
    expect(section).toContain('verify_jwt = false')
  })

  it('declares only an empty maintainer secret placeholder in the workspace env example', () => {
    const env = read('config/env/workspace.env.example')
    expect(env).toMatch(/^PAYMENT_MAINTAINER_SECRET=\s*$/m)
  })
})
