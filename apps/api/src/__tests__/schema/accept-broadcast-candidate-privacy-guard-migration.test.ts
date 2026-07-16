import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationPath = resolve(
  __dirname,
  '../../../../../supabase/migrations/20260714074000_accept_broadcast_candidate_privacy_guard.sql',
)
const sql = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : ''

describe('accept-broadcast candidate privacy guard migration', () => {
  it('checks worker broadcast membership before any job-status-dependent response', () => {
    const body = sql.match(
      /create (?:or replace )?function public\.accept_broadcast_atomic[\s\S]*?\$func\$;/i,
    )?.[0] ?? ''
    const membershipLookup = body.indexOf('from public.job_broadcasts as jb')
    const firstStatusBranch = body.indexOf('if v_job.status')

    expect(membershipLookup).toBeGreaterThan(0)
    expect(firstStatusBranch).toBeGreaterThan(membershipLookup)
    expect(body.slice(membershipLookup, firstStatusBranch)).toContain('jb.worker_id = p_worker_id')
    expect(body.slice(membershipLookup, firstStatusBranch)).toContain("'NOT_FOUND'::text")
  })

  it('preserves a member worker retry without reopening accepted broadcasts', () => {
    expect(sql).toMatch(/jb\.status in \([\s\S]*'sent'::public\.broadcast_status[\s\S]*'accepted'::public\.broadcast_status/i)
    expect(sql).toContain("v_broadcast.status <> 'sent'::public.broadcast_status")
    expect(sql).toContain("c.status = 'proposed'")
    expect(sql).toContain('v_candidate.id, true')
  })

  it('keeps the corrected RPC service-role-only', () => {
    const signature = 'accept_broadcast_atomic(uuid, uuid)'
    expect(sql).toContain(`revoke execute on function public.${signature} from public`)
    expect(sql).toContain(`revoke execute on function public.${signature} from anon`)
    expect(sql).toContain(`revoke execute on function public.${signature} from authenticated`)
    expect(sql).toContain(`grant execute on function public.${signature} to service_role`)
  })
})
