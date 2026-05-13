import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'

const HARNESS_SQL = readFileSync(
  resolve(__dirname, '../../../supabase/tests/staging_security_verification.sql'),
  'utf-8'
)

describe('Staging security verification harness', () => {
  it('uses a rollback-only transaction for remote staging fixtures', () => {
    expect(HARNESS_SQL.trimStart()).toMatch(/^--/)
    expect(HARNESS_SQL).toMatch(/\bbegin;\s+/i)
    expect(HARNESS_SQL.trimEnd()).toMatch(/rollback;$/i)
  })

  it('does not persist Supabase management tokens or provider secrets', () => {
    expect(HARNESS_SQL).not.toMatch(/sbp_[A-Za-z0-9]{32,}/)
    expect(HARNESS_SQL).not.toMatch(/sk-[A-Za-z0-9]{20,}/)
    expect(HARNESS_SQL).not.toMatch(/pplx-[A-Za-z0-9]{20,}/)
  })

  it('simulates customer, worker, outsider, and admin authenticated contexts', () => {
    for (const id of [
      '20000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000002',
      '40000000-0000-0000-0000-000000000001',
      '10000000-0000-0000-0000-000000000001',
    ]) {
      expect(HARNESS_SQL).toContain(`set local request.jwt.claim.sub = '${id}'`)
    }
  })

  it('covers participant isolation, pre-match worker privacy, learning protection, and storage boundaries', () => {
    for (const checkName of [
      'customer_reads_own_job',
      'customer_cannot_read_other_job',
      'broadcast_worker_cannot_read_full_job_before_match',
      'normal_user_cannot_insert_learning_candidate',
      'customer_cannot_upload_completion_photo',
      'unmatched_worker_cannot_upload_job_photo',
      'admin_reads_worker_documents',
    ]) {
      expect(HARNESS_SQL).toContain(checkName)
    }
  })

  it('reports a summary row that must show zero failures', () => {
    expect(HARNESS_SQL).toContain('__summary__')
    expect(HARNESS_SQL).toContain('0 failures')
    expect(HARNESS_SQL).toContain('count(*) filter (where pass = false) = 0')
  })
})
