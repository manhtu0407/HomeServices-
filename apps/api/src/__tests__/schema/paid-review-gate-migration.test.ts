import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationsDir = resolve(__dirname, '../../../../../supabase/migrations')
const migrationName = readdirSync(migrationsDir)
  .find((name) => name.endsWith('_review_requires_paid.sql'))
const migrationPath = migrationName ? resolve(migrationsDir, migrationName) : ''
const sql = migrationPath && existsSync(migrationPath)
  ? readFileSync(migrationPath, 'utf8').toLowerCase()
  : ''

describe('paid review gate migration', () => {
  it('keeps the atomic review write service-role-only and paid-only', () => {
    expect(migrationName).toBeTruthy()
    expect(sql).toContain('create or replace function public.submit_review_atomic')
    expect(sql).toContain("if v_job.status <> 'paid'::public.job_status then")
    expect(sql).not.toContain("'confirmed_by_customer'::public.job_status")
    expect(sql).toContain('revoke execute on function public.submit_review_atomic')
    expect(sql).toContain('grant execute on function public.submit_review_atomic(uuid, uuid, int, text[], text) to service_role')
  })
})
