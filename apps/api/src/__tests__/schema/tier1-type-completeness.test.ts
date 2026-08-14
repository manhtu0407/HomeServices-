import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Database, Enums } from '@/lib/database.types'
import { Constants } from '@/lib/database.types'
import { readGeneratedDatabaseTypes } from '../helpers/generated-database-types'

type TableNames = keyof Database['public']['Tables']
type EnumNames = keyof Database['public']['Enums']

const ROOT = resolve(__dirname, '../../../../../')
const MIGRATIONS_DIR = resolve(ROOT, 'supabase/migrations')
const DROPPED_PUBLIC_TABLES = new Set(['worker_profiles_districts_backup_x3'])
const DROPPED_PUBLIC_FUNCTIONS = new Set([
  'normalize_district_value',
  'decide_worker_cancellation_atomic',
])
// PostgREST excludes trigger-returning helpers from the generated callable RPC surface.
const TRIGGER_ONLY_PUBLIC_FUNCTIONS = new Set([
  'handle_new_user',
  'notify_worker_account_approved',
  'guard_bilateral_final_price_lock',
  'prevent_evidence_snapshot_mutation',
  'validate_customer_payment_method_customer',
  'capture_learning_review_provenance',
  'capture_learning_rule_dependency',
  'prevent_revoked_learning_rule_activation',
  'reject_harness_append_only_mutation',
  'reject_harness_release_mutation',
  'guard_verified_scope_change_approval',
  'guard_scope_change_worker_quote_binding',
  'enforce_kael_estimate_price_evidence',
])

const readText = (path: string) => readFileSync(path, 'utf-8').replace(/\r\n/g, '\n')
const listMigrationSql = () =>
  readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => readText(resolve(MIGRATIONS_DIR, name)))
    .join('\n')

function uniqueMatches(source: string, pattern: RegExp, groupIndex = 1) {
  return [...source.matchAll(pattern)]
    .map((match) => match[groupIndex])
    .filter(Boolean)
    .toSorted()
}

function generatedPublicKeys(sectionName: 'Tables' | 'Functions') {
  const keys: string[] = []
  let section: string | null = null
  for (const line of readGeneratedDatabaseTypes().split('\n')) {
    if (/^\s{4}Tables: \{/.test(line)) {
      section = 'Tables'
      continue
    }
    if (/^\s{4}Views: \{/.test(line)) {
      section = 'Views'
      continue
    }
    if (/^\s{4}Functions: \{/.test(line)) {
      section = 'Functions'
      continue
    }
    if (/^\s{4}Enums: \{/.test(line)) {
      section = 'Enums'
      continue
    }
    if (section === sectionName) {
      const key = line.match(/^\s{6}([a-zA-Z0-9_]+):(?: \{|$)/)
      if (key) keys.push(key[1])
    }
  }
  return keys.toSorted()
}

const EXPECTED_TABLES = [
  'profiles',
  'customer_profiles',
  'worker_profiles',
  'service_categories',
  'service_problems',
  'price_baselines',
  'jobs',
  'job_broadcasts',
  'job_events',
  'chat_messages',
  'scope_change_requests',
  'notifications',
  'reviews',
  'api_logs',
  'learning_candidates',
  'learning_rules',
  'learning_rule_versions',
  'service_knowledge_boxes',
  'kael_market_artifacts',
  'job_media_assets',
  'kael_ai_batches',
  'kael_ai_batch_items',
  'kael_analysis_artifacts',
  'kael_autonomy_decision_audit',
  'kael_chat_sessions',
  'kael_chat_turns',
  'kael_chat_pre_intake_memory',
  'kael_chat_rate_limit_log',
  'kael_guardrail_trip_audit',
  'kael_knowledge_usage_log',
  'kael_learning_queue',
  'kael_worker_chat_rate_limit_log',
  'kael_worker_chat_sessions',
  'kael_worker_chat_turns',
  'device_push_tokens',
  'worker_cancellation_requests',
  'ai_provider_routing',
  'customer_kael_memory',
  'worker_kael_feedback',
  'worker_kael_memory',
  'worker_kael_training_consent',
  'kael_admin_queue',
  'kael_permission_audit',
  'kael_advisory_audit',
  'kael_memory_audit',
  'kael_worker_qa_log',
  'worker_scope_change_stats',
  'worker_safety_patterns',
  'legal_awareness_patterns',
  'kael_memory_archive',
  'kael_rule_application_log',
  'kael_rule_lifecycle_log',
  'kael_charter_audit',
  'kael_interaction_log',
  'worker_cancellation_reason_taxonomy',
  'customer_cancellation_reason_taxonomy',
  'customer_cancellation_records',
  'evidence_snapshots',
  'disputes',
  'kael_quality_baseline',
  'kael_market_cache',
  'kael_optimization_metrics',
  'source_trust_registry',
  'admin_operator_accounts',
  'admin_manager_nominations',
  'admin_worker_application_reviews',
] as const satisfies readonly TableNames[]

const EXPECTED_ENUMS = [
  'user_role',
  'service_type',
  'job_status',
  'complexity_level',
  'broadcast_status',
  'scope_change_status',
  'worker_verification_status',
  'notification_status',
  'learning_candidate_status',
  'learning_rule_status',
  'message_sender',
  'api_provider',
] as const satisfies readonly EnumNames[]

describe('Database.public.Tables completeness', () => {
  it('has all aligned workflow tables', () => {
    expect(EXPECTED_TABLES).toHaveLength(66)
  })

  // Each of these 66 names being a real generated table key is enforced by the
  // `satisfies readonly TableNames[]` clause on the EXPECTED_TABLES declaration
  // above; tsc rejects an unknown key there before any test runs. The 66 runtime
  // cases that re-checked it only proved the strings were non-empty.

  it('keeps generated public table keys aligned with migration-created tables', () => {
    const migrations = listMigrationSql()
    const migrationTables = uniqueMatches(
      migrations,
      /create\s+table\s+if\s+not\s+exists\s+public\.([a-zA-Z0-9_]+)/gi,
    ).filter((name) => !DROPPED_PUBLIC_TABLES.has(name))
    const generatedTables = new Set(generatedPublicKeys('Tables'))
    const missing = migrationTables.filter((table) => !generatedTables.has(table))

    expect(missing).toEqual([])
  })

  it('keeps generated public RPC keys aligned with live migration-created functions', () => {
    const migrations = listMigrationSql()
    const migrationFunctions = uniqueMatches(
      migrations,
      /create\s+(?:or\s+replace\s+)?function\s+public\.([a-zA-Z0-9_]+)/gi,
    ).filter(
      (name) => !DROPPED_PUBLIC_FUNCTIONS.has(name) && !TRIGGER_ONLY_PUBLIC_FUNCTIONS.has(name),
    )
    const generatedFunctions = new Set(generatedPublicKeys('Functions'))
    const missing = migrationFunctions.filter((fn) => !generatedFunctions.has(fn))

    expect(missing).toEqual([])
  })
})

describe('Database.public.Enums completeness', () => {
  it('has all workflow and learning enums', () => {
    expect(Object.keys(Constants.public.Enums).toSorted()).toEqual(EXPECTED_ENUMS.toSorted())
  })

  it.each(EXPECTED_ENUMS)('enum "%s" exists in Constants', (name) => {
    expect(Constants.public.Enums).toHaveProperty(name)
  })
})

describe('Core enum values', () => {
  it('service_type remains scoped to the six launched services', () => {
    expect(Constants.public.Enums.service_type).toEqual([
      'electrical',
      'plumbing',
      'cleaning',
      'hvac',
      'upholstery',
      'handyman',
    ])
  })

  it('job_status matches STRUCTURES.md workflow', () => {
    expect(Constants.public.Enums.job_status).toEqual([
      'draft',
      'analyzing',
      'estimate_ready',
      'awaiting_customer_confirm',
      'broadcasting',
      'worker_candidate_pending',
      'worker_matched',
      'worker_on_way',
      'arrived',
      'inspecting',
      'repairing',
      'scope_change_pending',
      'completed_by_worker',
      'confirmed_by_customer',
      'payment_pending',
      'paid',
      'reviewed',
      'cancelled',
    ])
  })

  it('broadcast_status includes reassignment and cancellation paths', () => {
    expect(Constants.public.Enums.broadcast_status).toEqual([
      'pending',
      'sent',
      'accepted',
      'declined',
      'expired',
      'reassigned',
      'cancelled',
    ])
  })
})

describe('Insert type requirements', () => {
  it('does not expose dropped migration backup tables as runtime contract types', () => {
    type DroppedBackupTable = Extract<TableNames, 'worker_profiles_districts_backup_x3'>
    const backupTableDropped: DroppedBackupTable extends never ? true : never = true
    expect(listMigrationSql()).toContain('drop table if exists public.worker_profiles_districts_backup_x3')
    expect(backupTableDropped).toBe(true)
  })

})

describe('Type helper smoke tests', () => {
  it('Enums<"service_type"> resolves to service_type enum', () => {
    type ServiceType = Enums<'service_type'>
    const _check: ServiceType = 'electrical'
    expect(_check).toBe('electrical')
  })
})
