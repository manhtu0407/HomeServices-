import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(
  __dirname,
  '../../../../../supabase/migrations/20260722054500_reactivate_accepted_broadcast_after_candidate_expiry.sql',
)
const sql = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : ''

describe('accepted broadcast reactivation migration', () => {
  it('reactivates an accepted row only after its worker proposal is no longer active', () => {
    expect(sql).toContain("existing.status = 'expired'::public.broadcast_status")
    expect(sql).toContain("existing.status = 'accepted'::public.broadcast_status")
    expect(sql).toMatch(/not exists\s*\([\s\S]*from public\.job_worker_candidates as candidate_guard/i)
    expect(sql).toContain("candidate_guard.status = 'proposed'")
    expect(sql).toContain('candidate_guard.expires_at > p_sent_at')
  })

  it('keeps the atomic activation RPC service-role-only', () => {
    const signature = 'activate_job_broadcast_batch_atomic(uuid, uuid[], uuid, timestamptz, timestamptz)'
    expect(sql).toContain(`revoke execute on function public.${signature} from public, anon, authenticated`)
    expect(sql).toContain(`grant execute on function public.${signature} to service_role`)
  })
})
