import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../../../../../')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8').replace(/\r\n/g, '\n')
const listEdgeServiceFiles = (relDir: string): string[] =>
  readdirSync(resolve(ROOT, relDir), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listEdgeServiceFiles(`${relDir}/${entry.name}`) : [`${relDir}/${entry.name}`])
const readEdgeServiceLayer = () => [
  read('supabase/functions/mobile-api/_shared/services.ts'),
  ...listEdgeServiceFiles('supabase/functions/mobile-api/_shared/services').filter((p) => p.endsWith('.ts')).sort().map(read),
].join('\n')
const readEdgeRouterLayer = () => [
  read('supabase/functions/mobile-api/_shared/router.ts'),
  ...listEdgeServiceFiles('supabase/functions/mobile-api/_shared/router').filter((p) => p.endsWith('.ts')).sort().map(read),
].join('\n')
const readMigrationByName = (needle: string) => {
  const dir = resolve(ROOT, 'supabase/migrations')
  const name = readdirSync(dir)
    .filter((item) => item.endsWith('.sql') && item.includes(needle))
    .sort()
    .at(-1)
  return name ? read(`supabase/migrations/${name}`) : ''
}

describe('Q1 cost optimization baseline telemetry', () => {
  it('creates cost dashboard, baseline, and optimization metric schema', () => {
    const migration = readMigrationByName('kael_cost_optimization_q1')

    expect(migration).toContain('create table if not exists public.kael_quality_baseline')
    expect(migration).toContain('create table if not exists public.kael_optimization_metrics')
    expect(migration).toContain('create or replace view public.kael_cost_daily_summary')
    expect(migration).toContain('create or replace view public.kael_cost_projection_daily')
    expect(migration).toContain('with (security_invoker = true)')
    expect(migration).toContain('projected_1000_jobs_usd')
    expect(migration).toContain('projected_10000_jobs_usd')
  })

  it('keeps Q1 telemetry admin-readable and service-role writable only', () => {
    const migration = readMigrationByName('kael_cost_optimization_q1')

    for (const table of [
      'public.kael_quality_baseline',
      'public.kael_optimization_metrics',
    ]) {
      expect(migration).toContain(`alter table ${table} enable row level security`)
      expect(migration).toContain(`revoke all on ${table} from authenticated`)
      expect(migration).toContain(`grant select on ${table} to authenticated`)
      expect(migration).toContain(`grant all on ${table} to service_role`)
    }
    expect(migration).toContain('using (private.is_admin())')
  })

  it('hooks Edge api_logs into optimization metrics without enabling optimizations', () => {
    const services = readEdgeServiceLayer()
    const costTracking = read('supabase/functions/mobile-api/_shared/kael/provider/cost-tracking.ts')

    expect(services + read('supabase/functions/mobile-api/_shared/services/_runtime/audit.ts')).toContain('buildKaelOptimizationMetricRows(rows)')
    expect(services + read('supabase/functions/mobile-api/_shared/services/_runtime/audit.ts')).toContain('client.from("kael_optimization_metrics").insert(metricRows)')
    expect(services).toContain('...(stage.cacheStatus ? { cache_status: stage.cacheStatus } : {})')
    expect(services).toContain('...(stage.safeMetadata ?? {})')
    expect(services).not.toContain('safe_metadata: stage.cacheStatus\n          ? { cache_status: stage.cacheStatus }\n          : undefined')
    expect(costTracking).toContain('KAEL_OPT_PROMPT_CACHE_ENABLED')
    expect(costTracking).toContain('KAEL_OPT_CAP_OUTPUT_ENABLED')
    expect(costTracking).toContain('KAEL_OPT_MARKET_CACHE_ENABLED')
    expect(costTracking).toContain('KAEL_OPT_BATCH_LEARNING_ENABLED')
    expect(costTracking).toContain('KAEL_OPT_BATCH_API_ENABLED')
    expect(costTracking).toContain('return false')
  })

  it('keeps Q1.5 baseline evidence separate from provider failure rate', () => {
    const script = read('apps/api/scripts/kael-q1-baseline.mjs')

    expect(script).toContain('KAEL_PURPOSES')
    expect(script).toContain('provider_success_rate')
    expect(script).toContain('purpose_coverage')
    expect(script).toContain('provider_failure_pattern')
    expect(script).toContain('runPurposeProbes')
    expect(script).toContain('q1_5_direct_provider_probe')
    expect(script).toContain('Q1_PURPOSE_PROBES')
    expect(script).toContain('schema_validation_rate: round(estimateValidCount / jobs.length, 4)')
    expect(script).toContain('does not toggle remote Edge feature flags')
  })

  it('creates Q3 market cache schema and admin invalidate hook behind Edge', () => {
    const migration = readMigrationByName('kael_market_cache_q3')
    const router = readEdgeRouterLayer()
    const services = readEdgeServiceLayer()
    const sharedTypes = read('packages/shared/src/types/database.types.ts')

    expect(migration).toContain('create table if not exists public.kael_market_cache')
    expect(migration).toContain('constraint kael_market_cache_lookup_unique')
    expect(migration).toContain('kael_market_cache_lookup_active_idx')
    expect(migration).toContain('create or replace function public.increment_kael_market_cache_hit')
    expect(migration).toContain('grant execute on function public.increment_kael_market_cache_hit(uuid) to service_role')
    expect(migration).toContain('cron.schedule')
    expect(migration).toContain('using (private.is_admin())')
    expect(router).toContain('admin.marketCache.invalidate')
    expect(router).toContain('/admin/market-cache/invalidate')
    expect(services).toContain('invalidateMarketCache')
    expect(services + read('supabase/functions/mobile-api/_shared/services/_runtime/audit.ts')).toContain('client.from("kael_optimization_metrics").insert(metricRows)')
    expect(sharedTypes).toContain('kael_market_cache')
    expect(sharedTypes).toContain('increment_kael_market_cache_hit')
  })

  it('creates Q4 background learning queue and batch processor hooks behind Edge', () => {
    const migration = readMigrationByName('kael_q4_background_optimization')
    const router = readEdgeRouterLayer()
    const services = readEdgeServiceLayer()
    const index = read('supabase/functions/mobile-api/_shared/kael/index.ts')

    expect(migration).toContain('create table if not exists public.kael_learning_queue')
    expect(migration).toContain('create table if not exists public.kael_ai_batches')
    expect(migration).toContain('create table if not exists public.kael_ai_batch_items')
    expect(migration).toContain('kael-learning-queue-stale-fallback')
    expect(migration).toContain('grant all on public.kael_learning_queue to service_role')
    expect(router).toContain('/admin/kael-learning/process-queue')
    expect(router).toContain('/admin/kael-learning/process-batch-results')
    expect(router).toContain('/admin/kael-learning/monitor-rules')
    expect(services + read('supabase/functions/mobile-api/_shared/services/_runtime/audit.ts')).toContain('KAEL_OPT_BATCH_LEARNING_ENABLED')
    expect(services + read('supabase/functions/mobile-api/_shared/services/_runtime/audit.ts')).toContain('queueLearningForBatch')
    expect(services).toContain('monitorLearningRules')
    expect(services).toContain('recordLearningRuleApplication')
    expect(services).toContain('recordLearningReviewOutcome')
    expect(read('supabase/functions/mobile-api/_shared/kael/cron/monitor-learning-rules.ts')).toContain('loop_health')
    expect(read('supabase/functions/mobile-api/_shared/kael/cron/monitor-learning-rules.ts')).toContain('manual_review_overdue_count')
    expect(read('supabase/functions/mobile-api/_shared/kael/routing/pipeline.ts')).toContain('learningApplications')
    expect(index).toContain('./cron/process-learning-queue.ts')
    expect(index).toContain('./cron/process-batch-results.ts')
    expect(index).toContain('./cron/monitor-learning-rules.ts')
  })

  it('adds service-role-only RPC for atomic Kael learning promotion', () => {
    const migration = readMigrationByName('promote_learning_candidate_rpc')
    const lintFix = read('supabase/migrations/20260605004000_fix_plan31_rpc_lint_warnings.sql')
    const atomicEffect = readMigrationByName('atomic_learning_effect_commits')
    const effectStore = read('supabase/functions/mobile-api/_shared/kael/cron/learning-effect-store.ts')
    const sharedTypes = read('packages/shared/src/types/database.types.ts')

    expect(migration).toContain('create or replace function public.promote_learning_candidate')
    expect(migration).toContain('security definer')
    expect(migration).toContain('pg_advisory_xact_lock')
    expect(migration).toContain('insert into public.learning_candidates')
    expect(migration).toContain('insert into public.learning_rules')
    expect(migration).toContain('insert into public.learning_rule_versions')
    expect(migration).toContain('revoke execute on function public.promote_learning_candidate')
    expect(migration).toContain('grant execute on function public.promote_learning_candidate')
    expect(migration).toContain('to service_role')
    expect(migration).toContain('MANUAL_REVIEW_REQUIRED')
    expect(migration).toContain('FORBIDDEN_EFFECT')
    expect(lintFix).toContain('insert into public.kael_rule_lifecycle_log')
    expect(lintFix).toContain("'actor_id', p_actor_id")
    expect(lintFix).toContain("'job_id', p_job_id")
    expect(atomicEffect).toContain('from public.promote_learning_candidate')
    expect(effectStore).toContain('rpc("commit_kael_learning_effect_atomic"')
    expect(sharedTypes).toContain('promote_learning_candidate')
  })

  it('adds service-role-only RPC for atomic Kael learning rollback', () => {
    const migration = readMigrationByName('rollback_learning_rule_rpc')
    const ambiguityFix = read('supabase/migrations/20260605001000_fix_kael_rollback_learning_rule_ambiguity.sql')
    const monitor = read('supabase/functions/mobile-api/_shared/kael/cron/monitor-learning-rules.ts')
    const sharedTypes = read('packages/shared/src/types/database.types.ts')

    expect(migration).toContain('create or replace function public.rollback_learning_rule')
    expect(migration).toContain('security definer')
    expect(migration).toContain("status = 'rolled_back'::public.learning_rule_status")
    expect(migration).toContain('update public.learning_rule_versions as version_row')
    expect(migration).toContain('where version_row.rule_id = p_rule_id')
    expect(ambiguityFix).toContain('create or replace function public.rollback_learning_rule')
    expect(ambiguityFix).toContain('update public.learning_rule_versions as version_row')
    expect(ambiguityFix).toContain('where version_row.rule_id = p_rule_id')
    expect(migration).toContain('insert into public.kael_rule_lifecycle_log')
    expect(migration).toContain('revoke execute on function public.rollback_learning_rule')
    expect(migration).toContain('grant execute on function public.rollback_learning_rule')
    expect(migration).toContain('to service_role')
    expect(monitor).toContain('rpc("rollback_learning_rule"')
    expect(monitor).toContain('insert_notification_atomic')
    expect(monitor).toContain('KAEL_LEARNING_ADMIN_USER_ID')
    expect(sharedTypes).toContain('rollback_learning_rule')
  })

  it('adds A4 manual learning candidate admin review schema and Edge hooks', () => {
    const statusMigration = readMigrationByName('learning_candidate_manual_review_status')
    const rpcMigration = readMigrationByName('learning_candidate_admin_review_rpc')
    const router = readEdgeRouterLayer()
    const services = readEdgeServiceLayer()
    const nextAdmin = read('apps/api/src/app/admin/kael-learning/page.tsx')
    const nextHome = read('apps/api/src/app/page.tsx')
    const mobileServices = read('apps/mobile/lib/services.ts')
    const mobileAdmin = read('apps/mobile/app/(admin)/dashboard.tsx')
    const batchLifecycle = read('supabase/functions/mobile-api/_shared/kael/cron/batch-learning-lifecycle.ts')
    const sharedTypes = read('packages/shared/src/types/database.types.ts')

    expect(statusMigration).toContain("add value if not exists 'manual_review'")
    expect(rpcMigration).toContain('create or replace function public.admin_approve_learning_candidate')
    expect(rpcMigration).toContain('create or replace function public.admin_reject_learning_candidate')
    expect(rpcMigration).toContain('security definer')
    expect(rpcMigration).toContain('insert into public.kael_permission_audit')
    expect(rpcMigration).toContain('insert into public.kael_rule_lifecycle_log')
    expect(rpcMigration).toContain('grant execute on function public.admin_approve_learning_candidate')
    expect(rpcMigration).toContain('grant execute on function public.admin_reject_learning_candidate')
    expect(rpcMigration).toContain('to service_role')
    expect(router).toContain('/admin/kael/learning/candidates')
    expect(router).toContain('admin.kaelLearning.candidates.approve')
    expect(router).toContain('admin.kaelLearning.candidates.reject')
    expect(services).toContain('listKaelLearningCandidates')
    expect(services).toContain('admin_approve_learning_candidate')
    expect(services).toContain('admin_reject_learning_candidate')
    expect(nextAdmin).toContain('/admin/kael/learning/candidates')
    expect(nextAdmin).toContain('MANUAL_REVIEW_SLA_DAYS')
    expect(nextHome).toContain('/admin/kael-learning')
    expect(mobileServices).toContain('adminLearningService')
    expect(mobileAdmin).toContain('adminLearningService.listCandidates')
    expect(mobileAdmin).toContain('isManualReviewSlaOverdue')
    expect(batchLifecycle).toContain('return "manual_review"')
    expect(sharedTypes).toContain('admin_approve_learning_candidate')
    expect(sharedTypes).toContain('admin_reject_learning_candidate')
  })
})
