import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(__dirname, '../../../../../')
const sql = readFileSync(
  resolve(root, 'supabase/migrations/20260712124241_kael_job_incident_case.sql'),
  'utf8',
)

describe('kael job incident migration', () => {
  it('creates an auditable case and event ledger scoped to one job', () => {
    expect(sql).toContain('create table public.kael_job_incidents')
    expect(sql).toContain('create table public.kael_job_incident_events')
    expect(sql).toContain('job_id uuid not null references public.jobs(id) on delete cascade')
    expect(sql).toContain('unique index')
    expect(sql).toContain('ready_for_scope_proposal')
    expect(sql).toContain("'incident_updated'")
  })

  it('keeps direct mutation behind Edge while allowing participants to read their own incident trail', () => {
    expect(sql).toContain('enable row level security')
    expect(sql).toContain('Job participants read Kael incidents')
    expect(sql).toContain('Job participants read Kael incident events')
    expect(sql).toContain('revoke insert, update, delete on public.kael_job_incidents from authenticated')
    expect(sql).toContain('revoke insert, update, delete on public.kael_job_incident_events from authenticated')
  })
})
