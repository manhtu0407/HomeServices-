import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = () => readFileSync(
  new URL('../../../../../supabase/migrations/20260714111000_atomic_scope_change_idempotency.sql', import.meta.url),
  'utf8',
)

const service = () => readFileSync(
  new URL('../../../../../supabase/functions/mobile-api/_shared/services/scope-change/index.ts', import.meta.url),
  'utf8',
)

const effectService = () => readFileSync(
  new URL('../../../../../supabase/functions/mobile-api/_shared/services/scope-change/effects.ts', import.meta.url),
  'utf8',
)

describe('scope-change request idempotency', () => {
  it('uses COALESCE as SQL syntax instead of a schema-qualified function call', () => {
    expect(migration()).not.toMatch(/pg_catalog\.coalesce\s*\(/i)
  })

  it('persists a service-only payload-bound claim before provider work', () => {
    const sql = migration()

    expect(sql).toContain('create table if not exists public.scope_change_request_commands')
    expect(sql).toContain('primary key (worker_id, client_request_id)')
    expect(sql).toContain('function public.claim_scope_change_request_atomic')
    expect(sql).toContain("claimed_at >= v_now - interval '5 minutes'")
    expect(sql).toContain('for update')
    expect(sql).toContain("set search_path = ''")
    expect(sql).toContain('to service_role')
    expect(sql).toContain('from public, anon, authenticated')
  })

  it('atomically binds final scope rows and command completion to the claim', () => {
    const sql = migration()

    expect(sql).toContain('add column if not exists client_request_id uuid')
    expect(sql).toMatch(/unique[\s\S]*worker_id[\s\S]*client_request_id/i)
    expect(sql).toContain('p_client_request_id uuid')
    expect(sql).toContain('p_claim_id uuid')
    expect(sql).toContain("request_state = 'completed'")
    expect(sql).toContain('function public.release_scope_change_request_claim_atomic')
  })

  it('rejects incomplete or inconsistent replay payloads before committing scope state', () => {
    const sql = migration()

    expect(sql).toContain("jsonb_typeof(p_kael_review -> 'anti_fraud') is distinct from 'object'")
    expect(sql).toContain("jsonb_typeof(p_kael_review -> 'fallback_used') is distinct from 'boolean'")
    expect(sql).toContain("(p_kael_review ->> 'price_min')::numeric is distinct from p_kael_computed_min::numeric")
    expect(sql).toContain("p_kael_review ->> 'fallback_used' is distinct from 'false'")
    expect(sql).toContain("'KAEL_REVIEW_MISMATCH'::text")
  })

  it('claims or replays before computing a new Kael estimate', () => {
    const source = service()
    const handler = source.match(
      /export async function requestScopeChange[\s\S]*?export async function decideScopeChange/,
    )?.[0] ?? ''
    const claim = handler.indexOf('claim_scope_change_request_atomic')
    const provider = handler.indexOf('computeScopeChangeEstimate')

    expect(claim).toBeGreaterThan(-1)
    expect(provider).toBeGreaterThan(claim)
    expect(handler).toContain('release_scope_change_request_claim_atomic')
    expect(handler).toContain('p_client_request_id: input.client_request_id')
    expect(handler).toContain('p_claim_id: directClaimId')
  })

  it('persists and replays post-commit effects without repeating provider work', () => {
    const sql = migration()
    const source = service()
    const effects = effectService()

    expect(sql).toContain('create table if not exists public.scope_change_request_effects')
    expect(sql).toContain("effect_name in ('database', 'learning', 'push')")
    expect(sql).toContain('function public.apply_scope_change_database_effect_atomic')
    expect(sql).toContain('function public.apply_scope_change_learning_effect_atomic')
    expect(sql).toContain('function public.claim_scope_change_push_effect_atomic')
    expect(sql).toContain("claimed_at >= v_now - interval '5 minutes'")
    expect(sql).toContain('side_effects_state jsonb')
    expect(source).toContain('drainDirectScopeChangeEffects')
    expect(effects).toContain('scope_effect_id: effectId')
    expect(effects).toContain('at-least-once rather than fake exactly-once')
  })

  it('locks push-effect job ownership without unused result holders', () => {
    const sql = migration()

    expect(sql).not.toMatch(/\bv_job_id\b/)
    for (const functionName of [
      'complete_scope_change_push_effect_atomic',
      'release_scope_change_push_effect_atomic',
    ]) {
      const body = sql.match(
        new RegExp(`function public\\.${functionName}[\\s\\S]*?\\$function\\$;`),
      )?.[0] ?? ''
      expect(body).toContain('perform 1')
      expect(body).toContain('from public.jobs as job')
      expect(body).toContain('for update')
      expect(body).toContain('if not found then return query select false')
    }
  })

  it('verifies command, job, scope ownership and payload binding before database writes', () => {
    const sql = migration()
    const databaseEffect = sql.match(
      /function public\.apply_scope_change_database_effect_atomic[\s\S]*?\$function\$;/,
    )?.[0] ?? ''

    expect(databaseEffect).toContain('from public.jobs as job')
    expect(databaseEffect).toContain('from public.scope_change_request_commands as command')
    expect(databaseEffect).toContain('from public.scope_change_requests as scope')
    expect(databaseEffect).toContain('v_scope.requested_description is distinct from v_command.new_description')
    expect(databaseEffect).toContain('v_scope.evidence_photo_urls is distinct from v_command.evidence_photo_urls')
    expect(databaseEffect.indexOf('insert into public.job_events')).toBeGreaterThan(
      databaseEffect.indexOf('v_scope.evidence_photo_urls is distinct from v_command.evidence_photo_urls'),
    )
  })
})
