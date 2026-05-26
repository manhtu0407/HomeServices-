import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../../../../../')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8').replace(/\r\n/g, '\n')

describe('Plan 26 F7 database performance cleanup', () => {
  it('adds covering indexes for all live unindexed foreign key findings', () => {
    const migration = read('supabase/migrations/20260526203000_f26_fk_performance_indexes.sql')
    const indexes = migration.match(/create index if not exists/g) ?? []

    expect(indexes).toHaveLength(15)
    expect(migration).toContain('customer_cancellation_records_reason_code_f26_idx')
    expect(migration).toContain('disputes_admin_decision_by_f26_idx')
    expect(migration).toContain('disputes_evidence_snapshot_id_f26_idx')
    expect(migration).toContain('kael_admin_queue_actor_id_f26_idx')
    expect(migration).toContain('kael_charter_audit_actor_id_f26_idx')
    expect(migration).toContain('kael_learning_queue_batch_id_f26_idx')
    expect(migration).toContain('kael_rule_application_candidate_id_f26_idx')
    expect(migration).toContain('kael_rule_application_job_id_f26_idx')
    expect(migration).toContain('kael_rule_lifecycle_actor_id_f26_idx')
    expect(migration).toContain('kael_rule_lifecycle_job_id_f26_idx')
    expect(migration).toContain('kael_worker_qa_log_worker_id_f26_idx')
    expect(migration).toContain('source_trust_registry_added_by_f26_idx')
    expect(migration).toContain('source_trust_registry_last_reviewer_f26_idx')
    expect(migration).toContain('worker_cancel_requests_admin_decision_by_f26_idx')
    expect(migration).toContain('worker_cancel_requests_reason_code_f26_idx')
  })

  it('drops at least 30 zero-scan secondary indexes while retaining FK-supporting indexes', () => {
    const migration = read('supabase/migrations/20260526203100_f26_drop_unused_indexes.sql')
    const drops = migration.match(/drop index if exists public\./g) ?? []
    const retainedFkIndexes = [
      'chat_messages_job_id_idx',
      'jobs_service_problem_id_idx',
      'kael_analysis_artifacts_problem_idx',
      'kael_market_artifacts_service_problem_id_idx',
      'kael_rule_application_log_rule_idx',
      'kael_rule_lifecycle_log_rule_idx',
      'kael_rule_lifecycle_log_candidate_idx',
    ]

    expect(drops).toHaveLength(37)
    expect(migration).toContain('source_trust_registry_lookup_idx')
    for (const indexName of retainedFkIndexes) {
      expect(migration).not.toContain(`drop index if exists public.${indexName}`)
    }
  })

  it('records staging and production advisor counts below the F7 lint threshold', () => {
    const report = read('docs/test-logs/2026-05-26_f26-db-performance-cleanup.md')

    expect(report).toContain('before: 15 unindexed_foreign_keys, 44 unused_index')
    expect(report).toContain('after drop/probe: 1 unused_index')
    expect(report).toContain('after drop/probe: 4 unused_index')
    expect(report).toContain('both performance advisor counts are below 10')
    expect(report).toContain('db lint --linked --fail-on error: No schema errors found')
  })

  it('updates the migration chain for F5 and F7 database changes', () => {
    const chain = read('docs/architecture/migration-chain.md')

    expect(chain).toContain('20260526195300_source_trust_registry_f26.sql')
    expect(chain).toContain('20260526203000_f26_fk_performance_indexes.sql')
    expect(chain).toContain('20260526203100_f26_drop_unused_indexes.sql')
  })
})
