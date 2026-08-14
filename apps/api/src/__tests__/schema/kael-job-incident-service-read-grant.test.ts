import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../../../../../')
const migrationPath = resolve(
  root,
  'supabase/migrations/20260813104751_allow_edge_incident_projection.sql',
)

describe('Kael job incident Edge projection grant', () => {
  it('lets only the Edge service read incident state while retaining participant RLS', () => {
    expect(existsSync(migrationPath)).toBe(true)
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('grant select on table public.kael_job_incidents to service_role')
    expect(sql).not.toContain('disable row level security')
    expect(sql).not.toContain('grant insert')
    expect(sql).not.toContain('grant update')
    expect(sql).not.toContain('grant delete')
  })
})
