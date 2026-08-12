import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readGeneratedDatabaseTypes } from '../helpers/generated-database-types'

const root = resolve(__dirname, '../../../../../')
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
