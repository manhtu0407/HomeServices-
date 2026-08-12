import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readGeneratedDatabaseTypes } from '../helpers/generated-database-types'

const root = resolve(__dirname, '../../../../../')
const migrationPath = resolve(
  root,
  'supabase/migrations/20260714107000_atomic_job_incident_transitions.sql',
)
const verificationPath = resolve(
  root,
  'supabase/tests/job_incident_atomic_verification.sql',
)
const servicePaths = [
  'supabase/functions/mobile-api/_shared/domains/job/incident.ts',
  'supabase/functions/mobile-api/_shared/domains/job/incident-mutations.ts',
  'supabase/functions/mobile-api/_shared/domains/job/incident-assistant.ts',
  'supabase/functions/mobile-api/_shared/domains/job/incident-data.ts',
].map((path) => resolve(root, path))

describe('atomic Kael job incident transitions', () => {
  it('serializes incident sources and applies assistant output through optimistic revision checks', () => {
    expect(existsSync(migrationPath)).toBe(true)
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('add column if not exists revision bigint not null default 0')
    expect(sql).toContain('add column if not exists request_id uuid')
    expect(sql).toContain('add column if not exists source_revision bigint')
    expect(sql).toContain('add column if not exists source_job_status public.job_status')
    expect(sql).toContain('add column if not exists assistant_claim_id uuid')
    expect(sql).toContain('add column if not exists caused_by_event_id uuid')
    expect(sql).toContain('kael_job_incident_events_request_once_idx')
    expect(sql).toContain('kael_job_incident_events_message_global_once_idx')
    expect(sql).toContain('kael_job_incident_events_cause_once_idx')
    expect(sql).toContain('kael_job_incident_events_assistant_claim_once_idx')
    expect(sql).toContain('pg_advisory_xact_lock')
    expect(sql).toContain('for update')
    expect(sql).toContain('upsert_job_incident_signal_atomic')
    expect(sql).toContain('claim_job_incident_chat_turn_atomic')
    expect(sql).toContain('apply_job_incident_assistant_turn_atomic')
    expect(sql).toMatch(/revision\s*=\s*v_incident\.revision \+ 1/i)
    expect(sql).toMatch(/v_incident\.revision\s*<>\s*p_expected_revision/i)
    expect(sql).toMatch(/v_job\.status\s+is distinct from\s+v_source_event\.source_job_status/i)
    expect(sql).toContain('insert into public.chat_messages')
  })

  it('claims and finalizes a scope proposal in the same transaction as the existing scope RPC', () => {
    const sql = readFileSync(migrationPath, 'utf8')

    expect(sql).toContain('claim_job_incident_scope_proposal_atomic')
    expect(sql).toContain('release_job_incident_scope_proposal_atomic')
    expect(sql).toContain('request_job_incident_scope_change_atomic')
    expect(sql).toContain('public.request_scope_change_atomic(')
    expect(sql).toContain("status = 'scope_proposed'")
    expect(sql).toContain("'scope_proposed',")
    expect(sql).toContain('scope_proposal_claim_id')
    expect(sql).toContain('scope_proposal_claimed_at')
  })

  it('normalizes legacy duplicate message links before enforcing global idempotency', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    const normalization = sql.indexOf('legacy_duplicate_message_link')
    const globalUniqueIndex = sql.indexOf(
      'create unique index if not exists kael_job_incident_events_message_global_once_idx',
    )

    expect(normalization).toBeGreaterThan(-1)
    expect(globalUniqueIndex).toBeGreaterThan(normalization)
    expect(sql).toMatch(/row_number\(\) over\s*\(\s*partition by message_id/i)
  })

  it('keeps every transition RPC service-role-only with a fixed search path', () => {
    const sql = readFileSync(migrationPath, 'utf8')
    const functionNames = [
      'upsert_job_incident_signal_atomic',
      'claim_job_incident_chat_turn_atomic',
      'apply_job_incident_assistant_turn_atomic',
      'release_job_incident_assistant_claim_atomic',
      'claim_job_incident_scope_proposal_atomic',
      'release_job_incident_scope_proposal_atomic',
      'request_job_incident_scope_change_atomic',
    ]

    for (const name of functionNames) {
      expect(sql).toMatch(new RegExp(`create (?:or replace )?function public\\.${name}\\(`, 'i'))
      expect(sql).toMatch(new RegExp(`revoke execute on function public\\.${name}\\([\\s\\S]*?from public, anon, authenticated`, 'i'))
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]*?to service_role`, 'i'))
    }
    expect(sql.match(/security definer/g)?.length).toBeGreaterThanOrEqual(functionNames.length)
    expect(sql.match(/set search_path = ''/g)?.length).toBeGreaterThanOrEqual(functionNames.length)
  })

  it('wires the service to the atomic RPC boundary instead of separate incident writes', () => {
    const service = servicePaths.map((path) => readFileSync(path, 'utf8')).join('\n')

    expect(service).toContain('upsert_job_incident_signal_atomic')
    expect(service).toContain('claim_job_incident_chat_turn_atomic')
    expect(service).toContain('apply_job_incident_assistant_turn_atomic')
    expect(service).toContain('claim_job_incident_scope_proposal_atomic')
    expect(service).toContain('release_job_incident_scope_proposal_atomic')
    expect(service).toContain('release_job_incident_assistant_claim_atomic')
    expect(service).not.toContain('async function createIncident(')
    expect(service).not.toContain('async function updateIncidentSignal(')
    expect(service).not.toContain('async function insertIncidentEvent(')
    expect(service).not.toContain('insertKaelJobMessage')
  })

  it('wires every new RPC into the shared generated database contract', () => {
    const databaseTypes = readGeneratedDatabaseTypes()
    for (const name of [
      'upsert_job_incident_signal_atomic',
      'claim_job_incident_chat_turn_atomic',
      'apply_job_incident_assistant_turn_atomic',
      'release_job_incident_assistant_claim_atomic',
      'claim_job_incident_scope_proposal_atomic',
      'release_job_incident_scope_proposal_atomic',
      'request_job_incident_scope_change_atomic',
    ]) {
      expect(databaseTypes).toContain(`${name}: {`)
    }
  })

  it('ships rollback-only database verification for idempotency, staleness, and privileges', () => {
    expect(existsSync(verificationPath)).toBe(true)
    const verification = readFileSync(verificationPath, 'utf8')

    expect(verification.trimStart()).toMatch(/^begin;/i)
    expect(verification.trimEnd()).toMatch(/rollback;$/i)
    expect(verification).toContain('duplicate chat source must be idempotent')
    expect(verification).toContain('stale assistant result must not apply')
    expect(verification).toContain('assistant result applied after the job phase changed')
    expect(verification).toContain('assistant result applied after the customer scope decision')
    expect(verification).toContain('scope proposal work started after the job left the incident phase')
    expect(verification).toContain('new incident evidence did not invalidate the in-flight proposal')
    expect(verification).toContain('lost-response proposal retry did not converge')
    expect(verification).toContain('service_role must retain execute')
    expect(verification).toContain('authenticated must not execute')
  })
})
