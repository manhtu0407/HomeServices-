import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../../../../../')
const migration = readFileSync(
  resolve(ROOT, 'supabase/migrations/20260712042000_worker_availability_preference.sql'),
  'utf-8',
).replace(/\r\n/g, '\n')

describe('worker availability preference migration', () => {
  it('persists availability independently from an operational job while retaining approval and offline broadcast guards', () => {
    expect(migration).toContain('create or replace function public.set_worker_availability_atomic')
    expect(migration).toContain("if p_is_available is false then")
    expect(migration).toContain("'NOT_APPROVED'::text")
    expect(migration).not.toContain("'WORKER_BUSY'::text")
    expect(migration).not.toContain('from public.jobs')
    expect(migration).toContain('set is_available = p_is_available')
  })
})
