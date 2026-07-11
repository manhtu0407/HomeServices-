import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migrationsDir = resolve(__dirname, '../../../../../supabase/migrations')
const migrationName = readdirSync(migrationsDir)
  .find((name) => name.endsWith('_kael_case_work_artifact.sql'))
const migrationPath = migrationName ? resolve(migrationsDir, migrationName) : ''
const sql = migrationPath && existsSync(migrationPath)
  ? readFileSync(migrationPath, 'utf8').toLowerCase()
  : ''

describe('Kael durable case-work artifact migration', () => {
  it('adds server-owned phase, diagnosis/scope artifact, and structured schedule', () => {
    expect(migrationName).toBeTruthy()
    expect(sql).toContain('add column if not exists case_phase text')
    expect(sql).toContain('add column if not exists diagnosis_scope jsonb')
    expect(sql).toContain('add column if not exists scheduled_at timestamptz')
    expect(sql).toContain('add column if not exists diagnosis_scope jsonb')
    expect(sql).toContain('insert into public.jobs')
    expect(sql).toContain('v_session.diagnosis_scope')
    expect(sql).toContain('v_session.scheduled_at')
  })

  it('constrains the phase vocabulary and artifact shape without granting client writes', () => {
    expect(sql).toContain('kael_chat_sessions_case_phase_check')
    expect(sql).toContain("'worker_candidate_review'")
    expect(sql).toContain("diagnosis_scope is null")
    expect(sql).toContain("diagnosis_scope ->> 'version' = '1'")
    expect(sql).not.toMatch(/grant\s+(?:insert|update|delete)[\s\S]*kael_chat_sessions[\s\S]*authenticated/)
    expect(sql).toContain("v_session.diagnosis_scope ->> 'quote_ready' <> 'true'")
  })

  it('carries the validated problem and estimate-card honesty fields into the real job', () => {
    expect(sql).toContain("v_estimate_turn.safe_metadata -> 'estimate_card_v3'")
    expect(sql).toContain("v_estimate_turn.safe_metadata ->> 'service_problem_id'")
    expect(sql).toMatch(/service_problem_id,[\s\S]*kael_estimate_card_v3,[\s\S]*estimate_ready_at/i)
    expect(sql).toMatch(/v_service_problem_id,[\s\S]*v_estimate_card,[\s\S]*now\(\)/i)
  })
})
