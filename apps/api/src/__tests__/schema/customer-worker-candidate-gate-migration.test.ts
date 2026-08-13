import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationsDir = resolve(__dirname, '../../../../../supabase/migrations')
const migrationName = readdirSync(migrationsDir).find((name) =>
  name.endsWith('_customer_worker_candidate_gate.sql'),
)

if (!migrationName) {
  throw new Error('customer worker-candidate gate migration is missing')
}

const sql = readFileSync(resolve(migrationsDir, migrationName), 'utf8')
const cancellationMigrationName = readdirSync(migrationsDir).find((name) =>
  name.endsWith('_candidate_cancel_release.sql'),
)

if (!cancellationMigrationName) {
  throw new Error('candidate cancellation release migration is missing')
}

const verificationSql = readFileSync(
  resolve(
    __dirname,
    '../../../../../supabase/tests/customer_worker_candidate_gate_verification.sql',
  ),
  'utf8',
)

describe('customer-confirmed worker candidate gate migration', () => {
  it('turns worker acceptance into a private proposal without assigning the job', () => {
    const acceptBody = sql.match(
      /create function public\.accept_broadcast_atomic[\s\S]*?\$func\$;/i,
    )?.[0] ?? ''

    expect(acceptBody).toContain('insert into public.job_worker_candidates')
    expect(acceptBody).toMatch(
      /set status = 'worker_candidate_pending'::public\.job_status,\s*worker_id = null,\s*matched_at = null/i,
    )
    expect(acceptBody).not.toMatch(/set worker_id = p_worker_id/i)
    expect(acceptBody).not.toMatch(/address_(building|unit|floor)/i)
    expect(acceptBody).toContain("v_now + interval '10 minutes'")
    expect(acceptBody).not.toMatch(/set is_available = false/i)
  })

  it('confirms exactly one proposed worker atomically and idempotently', () => {
    const confirmBody = sql.match(
      /create function public\.confirm_worker_candidate_atomic[\s\S]*?\$func\$;/i,
    )?.[0] ?? ''

    expect(confirmBody).toContain("v_job.customer_id <> p_customer_id")
    expect(confirmBody).toMatch(
      /v_job\.status in \([\s\S]*'worker_matched'::public\.job_status[\s\S]*'reviewed'::public\.job_status/i,
    )
    expect(confirmBody).toContain("v_candidate.status = 'customer_confirmed'")
    expect(confirmBody).toMatch(
      /set worker_id = v_candidate\.worker_id,\s*status = 'worker_matched'::public\.job_status,\s*matched_at = v_now/i,
    )
    expect(confirmBody).toContain('already_applied')
  })

  it('rechecks the reserved worker service, district, and availability before assignment', () => {
    const confirmBody = sql.match(
      /create function public\.confirm_worker_candidate_atomic[\s\S]*?\$func\$;/i,
    )?.[0] ?? ''

    expect(confirmBody).toMatch(
      /select j\.id, j\.status, j\.customer_id, j\.worker_id, j\.matched_at,\s*j\.service_type, j\.address_district/i,
    )
    expect(confirmBody).toMatch(
      /select wp\.id, wp\.is_approved, wp\.is_available, wp\.is_suspended,\s*wp\.service_types, wp\.districts/i,
    )
    expect(confirmBody).toContain('v_worker.is_available is not true')
    expect(confirmBody).toContain('v_worker.service_types is null')
    expect(confirmBody).toContain('cardinality(v_worker.service_types) = 0')
    expect(confirmBody).toContain('v_worker.districts is null')
    expect(confirmBody).toContain('cardinality(v_worker.districts) = 0')
    expect(confirmBody).toContain('v_job.service_type = any(v_worker.service_types)')
    expect(confirmBody).toContain('v_job.address_district = any(v_worker.districts)')
    expect(confirmBody).toContain("'hcmc_all' = any(v_worker.districts)")
    expect(confirmBody).toMatch(
      /set status = 'expired',[\s\S]*where c\.id = v_candidate\.id[\s\S]*set status = 'broadcasting'::public\.job_status/i,
    )
    expect(confirmBody).toMatch(
      /return query select false, 'WORKER_NOT_ELIGIBLE'::text,\s*'broadcasting'::public\.job_status/i,
    )
  })

  it('rejects a proposal, releases only the reserved worker, and resumes matching', () => {
    const rejectBody = sql.match(
      /create function public\.reject_worker_candidate_atomic[\s\S]*?\$func\$;/i,
    )?.[0] ?? ''

    expect(rejectBody).toContain("v_job.customer_id <> p_customer_id")
    expect(rejectBody).toMatch(
      /set status = 'customer_declined',\s*customer_decided_at = v_now/i,
    )
    expect(rejectBody).toMatch(
      /set status = 'broadcasting'::public\.job_status,\s*worker_id = null,\s*matched_at = null/i,
    )
    expect(rejectBody).not.toMatch(/is_available/i)
    expect(rejectBody).toContain("set status = 'expired'")
    expect(rejectBody).toContain('v_candidate.expires_at <= v_now')
    expect(rejectBody).toContain('already_applied')
  })

  it('ships rollback-only ownership, race, and retry verification', () => {
    expect(verificationSql.trimStart().startsWith('-- Rollback-only')).toBe(true)
    expect(verificationSql).toMatch(/\nbegin;[\s\S]*\nrollback;\s*$/)
    for (const marker of [
      'non-owner customer confirmation was denied',
      'second worker accept won the same job',
      'confirm retry was not idempotent',
      'reject retry was not idempotent',
      'candidate lifecycle overwrote worker availability preference',
      'jobs.worker_id leaked before customer confirmation',
    ]) {
      expect(verificationSql).toContain(marker)
    }
  })

})
