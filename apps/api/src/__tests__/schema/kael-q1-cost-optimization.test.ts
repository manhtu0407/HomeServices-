import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readGeneratedDatabaseTypes } from '../helpers/generated-database-types'

const ROOT = resolve(__dirname, '../../../../../')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8').replace(/\r\n/g, '\n')
const listEdgeServiceFiles = (relDir: string): string[] =>
  readdirSync(resolve(ROOT, relDir), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listEdgeServiceFiles(`${relDir}/${entry.name}`) : [`${relDir}/${entry.name}`])
// platform/ holds the infrastructure the service layer runs on (db, audit, access, coercions).
// It is part of the same behavior surface, so these assertions must keep seeing it.
const readEdgeServiceLayer = () => [
  read('supabase/functions/mobile-api/_shared/domains.ts'),
  ...listEdgeServiceFiles('supabase/functions/mobile-api/_shared/domains').filter((p) => p.endsWith('.ts')).sort().map(read),
  ...listEdgeServiceFiles('supabase/functions/mobile-api/_shared/platform').filter((p) => p.endsWith('.ts')).sort().map(read),
].join('\n')
const readEdgeRouterLayer = () => [
  read('supabase/functions/mobile-api/_shared/http.ts'),
  ...listEdgeServiceFiles('supabase/functions/mobile-api/_shared/http').filter((p) => p.endsWith('.ts')).sort().map(read),
].join('\n')
describe('Q1 cost optimization baseline telemetry', () => {
  it('hooks Edge api_logs into optimization metrics without enabling optimizations', () => {
    const services = readEdgeServiceLayer()
    const costTracking = read('supabase/functions/mobile-api/_shared/kael/kael-usage/cost-tracking.ts')

    expect(services + read('supabase/functions/mobile-api/_shared/kael/learning/audit.ts')).toContain('buildKaelOptimizationMetricRows(rows)')
    expect(services + read('supabase/functions/mobile-api/_shared/kael/learning/audit.ts')).toContain('client.from("kael_optimization_metrics").insert(metricRows)')
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
    const router = readEdgeRouterLayer()
    const services = readEdgeServiceLayer()
    const sharedTypes = readGeneratedDatabaseTypes()
    expect(router).toContain('admin.marketCache.invalidate')
    expect(router).toContain('/admin/market-cache/invalidate')
    expect(services).toContain('invalidateMarketCache')
    expect(services + read('supabase/functions/mobile-api/_shared/kael/learning/audit.ts')).toContain('client.from("kael_optimization_metrics").insert(metricRows)')
    expect(sharedTypes).toContain('kael_market_cache')
    expect(sharedTypes).toContain('increment_kael_market_cache_hit')
  })

  it('creates Q4 background learning queue and batch processor hooks behind Edge', () => {
    const router = readEdgeRouterLayer()
    const services = readEdgeServiceLayer()
    const index = read('supabase/functions/mobile-api/_shared/kael/index.ts')
    expect(router).toContain('/admin/kael-learning/process-queue')
    expect(router).toContain('/admin/kael-learning/process-batch-results')
    expect(router).toContain('/admin/kael-learning/monitor-rules')
    expect(services + read('supabase/functions/mobile-api/_shared/kael/learning/audit.ts')).toContain('KAEL_OPT_BATCH_LEARNING_ENABLED')
    expect(services + read('supabase/functions/mobile-api/_shared/kael/learning/audit.ts')).toContain('queueLearningForBatch')
    expect(services).toContain('monitorLearningRules')
    expect(services).toContain('recordLearningRuleApplication')
    expect(services).toContain('recordLearningReviewOutcome')
    expect(read('supabase/functions/mobile-api/_shared/kael/learning/cron/monitor-learning-rules.ts')).toContain('loop_health')
    expect(read('supabase/functions/mobile-api/_shared/kael/learning/cron/monitor-learning-rules.ts')).toContain('manual_review_overdue_count')
    const pipelineLearningSources = [
      'stage-parallel.ts',
      'stage-synthesis.ts',
      'assemble.ts',
    ].map((path) => read(`supabase/functions/mobile-api/_shared/kael/pipeline/${path}`)).join('\n')
    expect(pipelineLearningSources).toContain('learningApplications')
    expect(index).toContain('./learning/cron/process-learning-queue.ts')
    expect(index).toContain('./learning/cron/process-batch-results.ts')
    expect(index).toContain('./learning/cron/monitor-learning-rules.ts')
  })

  it('adds service-role-only RPC for atomic Kael learning promotion', () => {
    const effectStore = read('supabase/functions/mobile-api/_shared/kael/learning/cron/learning-effect-store.ts')
    const sharedTypes = readGeneratedDatabaseTypes()
    expect(effectStore).toContain('rpc("commit_kael_learning_effect_atomic"')
    expect(sharedTypes).toContain('promote_learning_candidate')
  })

  it('adds service-role-only RPC for atomic Kael learning rollback', () => {
    const monitor = read('supabase/functions/mobile-api/_shared/kael/learning/cron/monitor-learning-rules.ts')
    const sharedTypes = readGeneratedDatabaseTypes()
    expect(monitor).toContain('rpc("rollback_learning_rule"')
    expect(monitor).toContain('insert_notification_atomic')
    expect(monitor).toContain('KAEL_LEARNING_ADMIN_USER_ID')
    expect(sharedTypes).toContain('rollback_learning_rule')
  })

  it('adds A4 manual learning candidate admin review schema and Edge hooks', () => {
    const router = readEdgeRouterLayer()
    const services = readEdgeServiceLayer()
    const nextAdmin = read('apps/api/src/app/admin/kael-learning/page.tsx')
    const nextHome = read('apps/api/src/app/page.tsx')
    const mobileServices = read('apps/mobile/lib/services.ts')
    const batchLifecycle = read('supabase/functions/mobile-api/_shared/kael/learning/cron/batch-learning-lifecycle.ts')
    const sharedTypes = readGeneratedDatabaseTypes()
    expect(router).toContain('/admin/kael/learning/candidates')
    expect(router).toContain('admin.kaelLearning.candidates.approve')
    expect(router).toContain('admin.kaelLearning.candidates.reject')
    expect(services).toContain('listKaelLearningCandidates')
    expect(services).toContain('admin_review_and_approve_learning_candidate_atomic')
    expect(services).toContain('admin_reject_learning_candidate')
    expect(nextAdmin).toContain('/admin/kael/learning/candidates')
    expect(nextAdmin).toContain('MANUAL_REVIEW_SLA_DAYS')
    expect(nextHome).toContain('/admin/kael-learning')
    expect(mobileServices).toContain('adminLearningService')
    expect(batchLifecycle).toContain('return "manual_review"')
    expect(sharedTypes).toContain('admin_review_and_approve_learning_candidate_atomic')
    expect(sharedTypes).toContain('admin_reject_learning_candidate')
  })
})
