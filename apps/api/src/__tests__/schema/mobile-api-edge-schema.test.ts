import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../../../../../')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8').replace(/\r\n/g, '\n')
const listFilesUnder = (relDir: string): string[] => {
  const absDir = resolve(ROOT, relDir)
  return readdirSync(absDir, { withFileTypes: true })
    .flatMap((entry) => {
      const relPath = `${relDir}/${entry.name}`
      return entry.isDirectory() ? listFilesUnder(relPath) : [relPath]
    })
}
const readFilesUnder = (relDir: string): string[] =>
  listFilesUnder(relDir)
    .filter((relPath) => relPath.endsWith('.ts'))
    .sort()
    .map(read)
const readEdgeContracts = () => readFilesUnder('supabase/functions/_shared/contracts').join('\n')
const readEdgeKaelModules = () => readFilesUnder('supabase/functions/mobile-api/_shared/kael').join('\n')
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
  ...readFilesUnder('supabase/functions/mobile-api/_shared/http'),
].join('\n')
const readMobileFrontendWorkflowLayer = () => [
  read('apps/mobile/lib/frontend-workflow-provider.tsx'),
  ...readFilesUnder('apps/mobile/lib/frontend-workflow'),
].join('\n')
const readMigrations = () => {
  const dir = resolve(ROOT, 'supabase/migrations')
  return readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => read(`supabase/migrations/${name}`))
    .join('\n')
}
const readMigrationByName = (needle: string) => {
  const dir = resolve(ROOT, 'supabase/migrations')
  const name = readdirSync(dir)
    .filter((item) => item.endsWith('.sql') && item.includes(needle))
    .sort()
    .at(-1)
  return name ? read(`supabase/migrations/${name}`) : ''
}

describe('mobile-api Edge schema compatibility', () => {
  it('allows rejected scope-change decisions written by the atomic RPC', () => {
    const migration = read('supabase/migrations/20260517225000_scope_change_decision_check.sql')
    const rpc = read('supabase/migrations/20260516144400_atomic_rpc_functions.sql')

    expect(rpc).toContain("v_decision_text := 'rejected'")
    expect(migration).toContain('jobs_scope_change_customer_decision_check')
    expect(migration).toContain("'approved', 'rejected', 'cancelled'")
  })

  it('lets the mobile-api function own auth and CORS handling', () => {
    const config = read('supabase/config.toml')

    expect(config).toContain('[functions.mobile-api]')
    expect(config).toContain('verify_jwt = false')
  })

  it('keeps Edge runtime imports deployable without workspace package dependencies', () => {
    const functionFiles = [
      'supabase/functions/mobile-api/index.ts',
      'supabase/functions/mobile-api/_shared/platform/auth.ts',
      'supabase/functions/mobile-api/_shared/kael.ts',
      'supabase/functions/mobile-api/_shared/platform/lifecycle.ts',
      'supabase/functions/mobile-api/_shared/http.ts',
      'supabase/functions/mobile-api/_shared/domains.ts',
      'supabase/functions/_shared/domain.ts',
    ].map(read).concat(
      readEdgeContracts(),
      readEdgeKaelModules(),
      readFilesUnder('supabase/functions/mobile-api/_shared/http'),
    ).join('\n')

    expect(functionFiles).not.toContain('packages/shared')
    expect(functionFiles).toContain('jobCreateSchema')
    expect(functionFiles).toContain('normalizeDistrict')
  })

  it('does not ship mojibake Vietnamese error messages from mobile-api Edge runtime', () => {
    const functionFiles = [
      'supabase/functions/mobile-api/_shared/http.ts',
      ...listFilesUnder('supabase/functions/mobile-api/_shared/http').filter((f) => f.endsWith('.ts')),
      'supabase/functions/mobile-api/_shared/domains.ts',
      ...listFilesUnder('supabase/functions/mobile-api/_shared/domains').filter((f) => f.endsWith('.ts')),
    ].map(read).join('\n')

    expect(functionFiles).not.toMatch(new RegExp([
      '\\u00c3',
      '\\u00c2',
      '\\u00e1\\u00ba',
      '\\u00e1\\u00bb',
      '\\u00c4\\u0090',
      '\\u00c4\\u2018',
      '\\u00c6',
    ].join('|')))
    expect(functionFiles).toContain('Dữ liệu không hợp lệ')
    expect(functionFiles).toContain('Không thể gửi yêu cầu hủy việc')
    expect(functionFiles).toContain('Không thể lưu thiết bị nhận thông báo')
  })

  it('keeps customer-visible mobile-api validation copy as accented Vietnamese', () => {
    const functionFiles = [
      'supabase/functions/mobile-api/_shared/http.ts',
      'supabase/functions/mobile-api/_shared/http/dispatch/admin.ts',
      'supabase/functions/mobile-api/_shared/platform/domain-error-mappers.ts',
      'supabase/functions/mobile-api/_shared/domains/admin/learning.ts',
    ].map(read).join('\n')

    expect(functionFiles).toContain('Dữ liệu A/B không hợp lệ')
    expect(functionFiles).toContain('Kael chưa tính được giá phát sinh hợp lệ')
    expect(functionFiles).toContain('Kael chưa chốt giá phát sinh nên chưa thể duyệt')
    expect(functionFiles).toContain('Chỉ admin mới được chạy A/B price_synthesis')
    expect(functionFiles).not.toMatch(/Du lieu A\/B khong hop le|Kael chua (?:tinh|chot)|Chi admin moi duoc/)
  })

  it('requires a concrete HCMC district before customer job creation', () => {
    const edgeContracts = readEdgeContracts()
    const edgeServices = readEdgeServiceLayer()
    const nextCreateJob = read('apps/api/src/lib/jobs/create-job.ts')
    const mobileProvider = readMobileFrontendWorkflowLayer()

    expect(edgeContracts).toContain('normalizeServiceAreaDistrict')
    expect(edgeServices).toContain('normalizeServiceAreaDistrict')
    expect(edgeServices).toContain('input.address_district')
    expect(nextCreateJob).toContain('normalizeServiceAreaDistrict(input.address_district)')
    expect(nextCreateJob).toContain("code: 'VALIDATION'")
    expect(mobileProvider).toContain('extractKnownDistrictLabel')
    expect(mobileProvider).toContain('address_district: districtLabel')
  })

  it('requires a concrete HCMC district again before broadcasting a job', () => {
    const edgeServices = readEdgeServiceLayer()
    const nextConfirmSearch = read('apps/api/src/app/api/jobs/[id]/confirm-search/route.ts')

    expect(edgeServices).toContain('normalizeServiceAreaDistrict')
    expect(edgeServices).toContain('nullableString(job.address_district)')
    expect(edgeServices).toContain('Địa chỉ cần có quận TP.HCM rõ ràng')
    expect(edgeServices).not.toContain('job.address_district || "hcmc_all"')
    expect(nextConfirmSearch).toContain('normalizeServiceAreaDistrict(job.address_district')
    expect(nextConfirmSearch).not.toContain("job.address_district ?? 'hcmc_all'")
  })

  it('skips learning candidate writes when reviewed legacy jobs lack a concrete district', () => {
    const learningHook = read('apps/api/src/lib/learning/hook.ts')

    expect(learningHook).toContain('normalizeServiceAreaDistrict(job.address_district)')
    expect(learningHook).toContain('if (!districtCode) return null')
    expect(learningHook).not.toContain("districtCode: job.address_district ?? 'hcmc_all'")
  })

  it('does not fake a service catalog when price baselines fail to load', () => {
    const edgeServices = readEdgeServiceLayer()
    const nextServices = read('apps/api/src/app/api/services/route.ts')

    expect(edgeServices + read('supabase/functions/mobile-api/_shared/domains/catalog/catalog.ts')).toContain('apiFailure("DB_ERROR", "Không thể tải bảng giá nền", 500)')
    expect(nextServices).toContain("return apiError('DB_ERROR', 'Không thể tải bảng giá nền', 500)")
    expect(edgeServices + read('supabase/functions/mobile-api/_shared/domains/catalog/catalog.ts')).toContain('filter(uniqueCatalogBaseline)')
    expect(nextServices).toContain('baselineKeysByService')
    expect(nextServices).toContain('serviceKeys.has(baselineKey)')
    expect(edgeServices + read('supabase/functions/mobile-api/_shared/domains/catalog/catalog.ts')).not.toContain('baselines fetch failed')
    expect(nextServices).not.toContain('Failed to fetch baselines')
  })

  it('uses the classified problem slug when fetching Kael price baselines', () => {
    const edgeKael = readEdgeKaelModules()
    const nextBaseline = read('apps/api/src/lib/kael/baseline.ts')

    expect(edgeKael).toContain('intent.problem_slug')
    expect(edgeKael).toContain('.from("service_problems")')
    expect(edgeKael).toContain('.eq("slug", problemSlug)')
    expect(edgeKael).toContain('.eq("service_problem_id", problemId)')
    expect(nextBaseline).toContain(".from('service_problems')")
    expect(nextBaseline).toContain(".eq('slug', problemSlug)")
    expect(nextBaseline).toContain(".eq('service_problem_id', problemId)")
  })

  it('persists the resolved service problem id on created jobs', () => {
    const edgeAssembly = read('supabase/functions/mobile-api/_shared/kael/pipeline/assemble.ts')
    const edgeServices = readEdgeServiceLayer()
    const nextPipeline = read('apps/api/src/lib/kael/pipeline.ts')
    const nextCreateJob = read('apps/api/src/lib/jobs/create-job.ts')

    expect(edgeAssembly).toContain('serviceProblemId: input.baselineResult.serviceProblemId')
    expect(edgeServices).toContain('service_problem_id: pipeline.serviceProblemId')
    expect(nextPipeline).toContain('serviceProblemId: baselineResult.serviceProblemId')
    expect(nextCreateJob).toContain('service_problem_id: pipelineResult.serviceProblemId')
  })

  it('keeps AI provider model ids away from known deprecation paths', () => {
    const source = [
      readEdgeKaelModules(),
      'apps/api/src/lib/jobs/create-job.ts',
      'apps/api/src/lib/kael/intent.ts',
    ].map((source) => source.includes('\n') ? source : read(source)).join('\n')

    expect(source).toContain('deepseek-v4-flash')
    expect(source).not.toContain('deepseek-chat')
    expect(source).toMatch(/const deepseekThinkingEnabled = request\.model === "deepseek-v4-pro" &&\s*request\.purpose === "post_job_learning"/)
    expect(source).toMatch(/thinking:\s*\{\s*type:\s*deepseekThinkingEnabled \? "enabled" : "disabled"\s*\}/)
    expect(source).toMatch(/deepseekThinkingEnabled \? \{ reasoning_effort: "high" \} : \{\}/)
    expect(source).toMatch(/response_format:\s*\{\s*type:\s*["']json_object["']\s*\}/)
  })

  it('uses the current canonical Perplexity Sonar endpoint in Edge and Next reference code', () => {
    const sources = [
      readEdgeKaelModules(),
      read('apps/api/src/lib/ai/providers/perplexity.ts'),
    ]

    for (const source of sources) {
      expect(source).toContain('https://api.perplexity.ai/v1/sonar')
      expect(source).not.toContain('https://api.perplexity.ai/chat/completions')
    }
  })

  it('does not carry raw provider error messages out of the Edge AI client', () => {
    const edgeKael = readEdgeKaelModules()

    expect(edgeKael).not.toContain('lastError.message')
    expect(edgeKael).toContain('error: code')
  })

  it('scrubs all customer-controlled text before Edge LLM prompts', () => {
    const edgeKael = readEdgeKaelModules()

    expect(edgeKael).toContain('const problemChips = input.problemChips.map(scrubSensitiveForLLM)')
    expect(edgeKael).toContain('const description = scrubCustomerCaseContextForLLM(input.description)')
    expect(edgeKael).toContain('let scrubbed = scrubSensitiveForLLM(protectedInput)')
    expect(edgeKael).toContain('(?:\\+?84|0)')
    expect(edgeKael).toContain('[\\s().-]*')
    expect(edgeKael).toContain('{8,10}(?!\\d)')
    expect(edgeKael).toContain('.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/gi, "[email]")')
    expect(edgeKael).toContain('.replace(/\\b\\d{9,12}\\b/g, "[id-number]")')
    expect(edgeKael).toContain('"[bank-account]"')
    expect(edgeKael).toContain('"[building]"')
    expect(edgeKael).toContain('"[floor]"')
    expect(edgeKael).toContain('"[unit]"')
    expect(edgeKael).toContain('"[house-no]"')
    expect(edgeKael).toContain('Vinhomes')
    expect(edgeKael).toContain('tầng|tang|lầu|lau')
  })

  it('keeps the deployed Edge Kael prompt aligned with the product guardrails', () => {
    const edgeKael = readEdgeKaelModules()

    expect(edgeKael).toContain('KAEL_BUSINESS_GUARDRAILS')
    expect(edgeKael).toContain('Kael is the main AI assistant')
    expect(edgeKael).toContain('six HCMC apartment service boxes')
    expect(edgeKael).toContain('Service-adjacent guidance does not add a seventh service')
    expect(edgeKael).toContain('adult or explicit sexual content')
    expect(edgeKael).toContain('Return the required JSON only')
  })

  it('keeps review submission atomic for Edge mobile-api runtime', () => {
    const migrations = readMigrations()

    expect(migrations).toContain('create function public.submit_review_atomic')
    expect(migrations).toContain('language plpgsql security invoker')
    expect(read('supabase/migrations/20260517154846_submit_review_atomic_rpc.sql')).not.toContain('security definer')
    expect(migrations).toContain("grant execute on function public.submit_review_atomic(uuid, uuid, int, text[], text) to service_role")
    expect(migrations).toContain('ALREADY_REVIEWED')
    expect(migrations).toContain('drop policy if exists "Customers create reviews after confirmation" on public.reviews')
    expect(migrations).toContain('revoke insert on public.reviews from authenticated')
  })

  it('keeps locked chat placeholder from accepting direct client inserts', () => {
    const migration = read('supabase/migrations/20260518001200_lock_direct_client_writes_for_edge_runtime.sql')

    expect(migration).toContain('drop policy if exists "Participants send messages" on public.chat_messages')
    expect(migration).toContain('revoke insert on public.chat_messages from authenticated')
  })

  it('keeps authenticated mobile clients read-only for workflow tables', () => {
    const migration = read('supabase/migrations/20260518032000_revoke_authenticated_workflow_dml.sql')

    expect(migration).toContain('revoke insert, update, delete on')
    for (const table of [
      'public.profiles',
      'public.worker_profiles',
      'public.jobs',
      'public.job_broadcasts',
      'public.chat_messages',
      'public.reviews',
      'public.scope_change_requests',
      'public.api_logs',
      'public.learning_candidates',
    ]) {
      expect(migration).toContain(table)
    }
    expect(migration).toContain('from authenticated')
    expect(migration).toContain('to service_role')
  })

  it('adds Kael Harness P1 memory tables with RLS and service-role writes only', () => {
    const customer = read('supabase/migrations/20260525091142_customer_kael_memory.sql')
    const worker = read('supabase/migrations/20260525091145_worker_kael_memory.sql')

    expect(customer).toContain('create table if not exists public.customer_kael_memory')
    expect(customer).toContain('customer_id uuid primary key references public.profiles(id) on delete cascade')
    expect(customer).toContain('alter table public.customer_kael_memory enable row level security')
    expect(customer).toContain('create policy "Customers view own kael memory"')
    expect(customer).toContain('using ((select auth.uid()) = customer_id)')
    expect(customer).toContain('create policy "Admins view customer kael memory"')
    expect(customer).toContain('using (private.is_admin())')
    expect(customer).toContain('revoke all on public.customer_kael_memory from authenticated')
    expect(customer).toContain('grant select on public.customer_kael_memory to authenticated')
    expect(customer).toContain('grant all on public.customer_kael_memory to service_role')

    expect(worker).toContain('create table if not exists public.worker_kael_memory')
    expect(worker).toContain('worker_id uuid primary key references public.profiles(id) on delete cascade')
    expect(worker).toContain('alter table public.worker_kael_memory enable row level security')
    expect(worker).toContain('create policy "Workers view own kael memory"')
    expect(worker).toContain('using ((select auth.uid()) = worker_id)')
    expect(worker).toContain('create policy "Admins view worker kael memory"')
    expect(worker).toContain('using (private.is_admin())')
    expect(worker).toContain('revoke all on public.worker_kael_memory from authenticated')
    expect(worker).toContain('grant select on public.worker_kael_memory to authenticated')
    expect(worker).toContain('grant all on public.worker_kael_memory to service_role')
  })

  it('adds Kael Harness P1 audit tables without user-writable DML grants', () => {
    const migration = read('supabase/migrations/20260525091146_kael_audit_tables.sql')

    for (const table of [
      'kael_permission_audit',
      'kael_advisory_audit',
      'kael_memory_audit',
    ]) {
      expect(migration).toContain(`create table if not exists public.${table}`)
      expect(migration).toContain(`alter table public.${table} enable row level security`)
      expect(migration).toContain(`revoke all on public.${table} from authenticated`)
      expect(migration).toContain(`grant select on public.${table} to authenticated`)
      expect(migration).toContain(`grant all on public.${table} to service_role`)
    }

    expect(migration).toContain('create policy "Admins view kael permission audit"')
    expect(migration).toContain('create policy "Admins view kael advisory audit"')
    expect(migration).toContain('create policy "Admins view kael memory audit"')
    expect(migration).toContain('using (private.is_admin())')
  })

  it('populates api_logs.purpose for current Edge Kael provider calls', () => {
    const services = readEdgeServiceLayer()
    const logApiCall = read('apps/api/src/lib/kael/log-api-call.ts')
    const createJob = read('apps/api/src/lib/jobs/create-job.ts')

    expect(services).toContain('purpose: apiLogPurposeForPipelineStage(stage.stage)')
    expect(services).toContain('purpose: "scope_change"')
    expect(services).toContain('surface: "kael_chat"')
    expect(services + read('supabase/functions/mobile-api/_shared/kael/learning/audit.ts')).toContain('return "intent_classification"')
    expect(services + read('supabase/functions/mobile-api/_shared/kael/learning/audit.ts')).toContain('return "vision_analysis"')
    expect(services + read('supabase/functions/mobile-api/_shared/kael/learning/audit.ts')).toContain('return "market_lookup"')
    expect(logApiCall).toContain('purpose: string')
    expect(logApiCall).toContain('purpose: log.purpose')
    expect(createJob).toContain('purpose: apiLogPurposeForPipelineStage(stage.stage)')
  })

  it('adds P14 backend cleanup invariants for telemetry, worker districts, and orphan analyzing jobs', () => {
    const migration = readMigrationByName('backend_gaps_cleanup_p14')
    const databaseTypes = read('packages/shared/src/types/database.types.ts')
    const migrationChain = read('docs/architecture/migration-chain.md')

    expect(migration).toContain('alter table public.api_logs alter column purpose set not null')
    expect(migration).toContain('add constraint api_logs_purpose_non_empty')
    expect(migration).toContain('create or replace function public.cleanup_orphan_analyzing_jobs')
    expect(migration).toContain("status = 'analyzing'")
    expect(migration).toContain("status = 'cancelled'")
    expect(migration).toContain('create extension if not exists pg_cron')
    expect(migration).toContain('cron.schedule')
    expect(migration).toContain('kael-cleanup-orphan-analyzing-jobs')
    expect(migration).toContain("array_remove(districts, 'hcmc_all')")
    expect(databaseTypes).toContain('cleanup_orphan_analyzing_jobs')
    expect(databaseTypes).toContain('purpose: string')
    expect(databaseTypes).not.toContain('purpose?: string | null')
    expect(migrationChain).toContain('20260526002253_backend_gaps_cleanup_p14.sql')
    expect(migrationChain).toContain('Direct writes to `cron.job` are intentionally avoided')
  })

  it('adds P3 routing and streaming schema without exposing user DML', () => {
    const migrations = readMigrations()

    expect(migrations).toContain('create table if not exists public.ai_provider_routing')
    expect(migrations).toContain('alter table public.ai_provider_routing enable row level security')
    expect(migrations).toContain('revoke insert, update, delete on public.ai_provider_routing from authenticated')
    expect(migrations).toContain('grant select on public.ai_provider_routing to authenticated')
    expect(migrations).toContain('grant all on public.ai_provider_routing to service_role')
    expect(migrations).toContain('alter table public.jobs add column if not exists kael_progress jsonb')
    expect(migrations).toContain('kael_progress_is_object')
  })

  it('adds P4 output-format schema with service-role writes and worker clarify route', () => {
    const migrations = readMigrations()
    const edgeKael = readEdgeKaelModules()
    const edgeServices = readEdgeServiceLayer()
    const edgeRouter = readEdgeRouterLayer()

    expect(migrations).toMatch(/alter table public\.jobs[\s\S]*add column if not exists kael_estimate_card_v3 jsonb/)
    expect(migrations).toMatch(/alter table public\.jobs[\s\S]*add column if not exists kael_worker_brief_core jsonb/)
    expect(migrations).toMatch(/alter table public\.jobs[\s\S]*add column if not exists kael_worker_brief_guidance jsonb/)
    expect(migrations).toContain('create table if not exists public.kael_worker_qa_log')
    expect(migrations).toContain('create table if not exists public.worker_scope_change_stats')

    for (const table of [
      'public.kael_worker_qa_log',
      'public.worker_scope_change_stats',
    ]) {
      expect(migrations).toContain(`alter table ${table} enable row level security`)
      expect(migrations).toContain(`revoke insert, update, delete on ${table} from authenticated`)
      expect(migrations).toContain(`grant all on ${table} to service_role`)
    }

    expect(edgeKael).toContain('runKaelOutputPipeline')
    expect(edgeKael).toContain('estimate_card.v3')
    expect(edgeKael).toContain('scope_change_worker_challenge.v1')
    expect(edgeServices).toContain('askKaelForWorker')
    expect(edgeServices + read('supabase/functions/mobile-api/_shared/domains/worker/kael-chat.ts')).toContain('record_worker_kael_qa_atomic')
    expect(edgeRouter).toContain('jobs.kaelClarify')
    expect(edgeRouter).toContain('kael-clarify')
  })

  it('adds P5 permission policy migrations and keeps audits service-role append-only', () => {
    const migrations = readMigrations()
    const edgeKael = readEdgeKaelModules()

    expect(migrations).toContain('create table if not exists public.kael_advisory_audit')
    expect(migrations).toContain('create table if not exists public.worker_safety_patterns')
    expect(migrations).toContain('create table if not exists public.legal_awareness_patterns')
    expect(migrations).toContain('alter table public.worker_safety_patterns enable row level security')
    expect(migrations).toContain('alter table public.legal_awareness_patterns enable row level security')
    expect(migrations).toContain('grant all on public.kael_advisory_audit to service_role')
    expect(migrations).toContain('grant all on public.worker_safety_patterns to service_role')
    expect(migrations).toContain('grant all on public.legal_awareness_patterns to service_role')
    expect(migrations).toContain('electrical_lockout_before_repair')
    expect(migrations).toContain('deposit_and_payment_dispute_awareness')
    expect(edgeKael).toContain('evaluateKaelPermissionGate')
    expect(edgeKael).not.toContain('checkKaelActorRateLimit')
    expect(edgeKael).toContain('reserve_kael_ai_spend')
    expect(edgeKael).toContain('educational_response')
  })

  it('keeps self-memory CRUD live while wiring only sanitized L2+L3 prompt memory', () => {
    const migrations = readMigrations()
    const edgeKaelIndex = read('supabase/functions/mobile-api/_shared/kael/index.ts')
    const quarantinedMemory = read('supabase/functions/mobile-api/_shared/kael/kael-memory/memory.ts')
    const edgeServices = readEdgeServiceLayer()
    const edgeRouter = readEdgeRouterLayer()

    expect(migrations).toContain('create table if not exists public.kael_memory_archive')
    expect(migrations).toContain('create or replace function public.archive_stale_kael_memory')
    expect(migrations).toContain('customer_id uuid primary key references public.profiles(id) on delete cascade')
    expect(migrations).toContain('worker_id uuid primary key references public.profiles(id) on delete cascade')
    expect(migrations).toContain('grant all on public.kael_memory_archive to service_role')
    expect(edgeKaelIndex).toContain('export * from "./kael-memory/memory-sanitizer.ts"')
    expect(edgeKaelIndex).toContain('export * from "./kael-memory/memory.ts"')
    expect(quarantinedMemory).toContain('buildKaelL2L3MemorySummary')
    expect(quarantinedMemory).toContain('L4-L6 are not fetched')
    expect(edgeRouter).toContain('/me/kael-memory')
    expect(edgeRouter).toContain('/workers/me/kael-memory')
    expect(edgeServices).toContain('getMyKaelMemory')
    expect(edgeServices).toContain('deleteMyKaelMemory')
    expect(edgeServices).toContain('updateWorkerKaelMemoryPreference')
    expect(migrations).toContain('create or replace function public.update_worker_kael_memory_preference')
    expect(migrations).toContain('grant execute on function public.update_worker_kael_memory_preference')
  })

  it('adds P7 learning skill registry, logs, scope limits, and trigger wiring', () => {
    const migrations = readMigrations()
    const edgeKael = readEdgeKaelModules()
    const edgeServices = readEdgeServiceLayer()

    expect(migrations).toContain('create table if not exists public.kael_rule_application_log')
    expect(migrations).toContain('create table if not exists public.kael_rule_lifecycle_log')
    for (const table of [
      'public.kael_rule_application_log',
      'public.kael_rule_lifecycle_log',
    ]) {
      expect(migrations).toContain(`alter table ${table} enable row level security`)
      expect(migrations).toContain(`revoke insert, update, delete on ${table} from authenticated`)
      expect(migrations).toContain(`grant select on ${table} to authenticated`)
      expect(migrations).toContain(`grant all on ${table} to service_role`)
    }

    for (const file of [
      'LS1-market-memory',
      'LS2-case-review',
      'LS3-worker-pattern',
      'LS4-customer-preference',
      'LS5-service-knowledge',
      'LS6-safety-pattern',
      'LS7-decline-reason',
    ]) {
      expect(edgeKael).toContain(file)
    }
    for (const effect of [
      'auto_charge_payment',
      'auto_confirm_booking',
      'auto_cancel_job',
      'auto_approve_worker',
      'auto_suspend_worker',
      'auto_change_final_price',
      'auto_expand_service_scope',
      'hide_learning_changes_from_admin',
    ]) {
      expect(edgeKael).toContain(effect)
    }
    for (const flag of [
      'KAEL_LEARNING_KILL_SWITCH',
      'KAEL_LEARNING_AB_PERCENTAGE',
      'KAEL_LEARNING_AUTO_ROLLBACK',
      'KAEL_LEARNING_READ_ENABLED',
      'KAEL_LEARNING_WRITE_ENABLED',
    ]) {
      expect(edgeKael).toContain(flag)
    }
    expect(edgeKael).toContain('KAEL_LEARNING_SKILLS')
    expect(edgeKael).toContain('transitionLearningLifecycle')
    expect(edgeKael).toContain('shouldAutoRollbackLearningRule')
    expect(edgeKael).toContain('queueLearningSkillTriggers')
    expect(edgeServices + read('supabase/functions/mobile-api/_shared/domains/payment/completion-review.ts')).toContain("'post-A14'")
    expect(edgeServices).toContain("'post-B6'")
    expect(edgeServices).toContain("'post-B7'")
    expect(edgeServices).toContain("'post-decline'")
  })

  it('consolidates Kael memory read policies after P6 to avoid multiple permissive RLS', () => {
    const migrations = readMigrations()

    expect(migrations).toContain('create policy "Customer or admin reads customer kael memory"')
    expect(migrations).toContain('create policy "Worker or admin reads worker kael memory"')
    expect(migrations).toContain('drop policy if exists "Customers view own kael memory"')
    expect(migrations).toContain('drop policy if exists "Admins view customer kael memory"')
    expect(migrations).toContain('drop policy if exists "Workers view own kael memory"')
    expect(migrations).toContain('drop policy if exists "Admins view worker kael memory"')
    expect(migrations).toContain('using (((select auth.uid()) = customer_id) or private.is_admin())')
    expect(migrations).toContain('using (((select auth.uid()) = worker_id) or private.is_admin())')
  })

  it('adds P8 charter audit, prompt builder, self-check, and public charter route', () => {
    const migrations = readMigrations()
    const edgeKael = readEdgeKaelModules()
    const edgeRouter = readEdgeRouterLayer()
    const edgeServices = readEdgeServiceLayer()

    expect(migrations).toContain('create table if not exists public.kael_charter_audit')
    expect(migrations).toContain('alter table public.kael_charter_audit enable row level security')
    expect(migrations).toContain('grant select on public.kael_charter_audit to authenticated')
    expect(migrations).toContain('grant all on public.kael_charter_audit to service_role')
    expect(edgeKael).toContain('buildKaelSystemPrompt')
    expect(edgeKael).toContain('checkKaelResponse')
    expect(edgeKael).toContain('runKaelSelfCheckPipeline')
    expect(edgeKael).toContain('2026-08-06.p11')
    expect(edgeRouter).toContain('kael.charter')
    expect(edgeRouter).toContain('/kael/charter')
    expect(edgeRouter).toContain('public: true')
    expect(edgeServices).toContain('getKaelCharter')
  })

  it('adds P10 demanding-customer admin queue and interaction log with service-role writes only', () => {
    const migrations = readMigrations()
    const edgeKael = readEdgeKaelModules()
    const edgeServices = readEdgeServiceLayer()

    for (const table of [
      'public.kael_admin_queue',
      'public.kael_interaction_log',
    ]) {
      expect(migrations).toContain(`create table if not exists ${table}`)
      expect(migrations).toContain(`alter table ${table} enable row level security`)
      expect(migrations).toContain(`revoke all on ${table} from authenticated`)
      expect(migrations).toContain(`grant select on ${table} to authenticated`)
      expect(migrations).toContain(`grant all on ${table} to service_role`)
    }

    expect(migrations).toContain('create policy "Admins view kael admin queue"')
    expect(migrations).toContain('create policy "Admins view kael interaction log"')
    expect(migrations).toContain('using (private.is_admin())')
    expect(edgeKael).toContain('detectDemandingCustomerPatterns')
    expect(edgeKael).toContain('buildDemandingCustomerResponse')
    expect(edgeKael).toContain('recordDemandingCustomerInteraction')
    expect(edgeServices).toContain('recordDemandingCustomerInteraction')
    expect(edgeServices).toContain('maybeHandleDemandingCustomerKaelChatTurn')
    expect(edgeServices + read('supabase/functions/mobile-api/_shared/domains/job/chat.ts')).toContain('maybeHandleDemandingCustomerJobChat')
  })

  it('consolidates admin RLS reads without reopening authenticated workflow DML grants', () => {
    const migration = read('supabase/migrations/20260518044500_consolidate_admin_rls_select_policies.sql')

    expect(migration).not.toMatch(/create policy "Admins manage .*"[\s\S]*for all/i)
    expect(migration).toContain('drop policy if exists "Admins manage jobs" on public.jobs')
    expect(migration).toContain('create policy "Admins update jobs" on public.jobs for update to authenticated')
    expect(migration).toContain('using (private.is_job_participant(id) or private.is_admin())')
    expect(migration).toContain('using (((select auth.uid()) = id) or private.is_admin())')
    expect(migration).toContain('using (private.is_job_participant(job_id) or private.is_admin())')
    expect(migration).not.toMatch(/grant\s+(insert|update|delete|all)[\s\S]+to authenticated/i)
  })

  it('keeps non-admin lifecycle writes behind Edge services and RPCs', () => {
    const alignment = read('supabase/migrations/20260513114845_align_structures_workflow.sql')

    expect(alignment).toContain('drop policy if exists "Customers create jobs" on jobs')
    expect(alignment).toContain('drop policy if exists "Customers update own jobs" on jobs')
    expect(alignment).toContain('drop policy if exists "Workers update assigned jobs" on jobs')
    expect(alignment).toContain('drop policy if exists "Workers respond to own broadcasts" on job_broadcasts')
    expect(alignment).not.toMatch(/create policy "Customers create jobs"/i)
    expect(alignment).not.toMatch(/create policy "Customers update own jobs"/i)
    expect(alignment).not.toMatch(/create policy "Workers update assigned jobs"/i)
    expect(alignment).not.toMatch(/create policy "Workers respond to own broadcasts"/i)
    expect(alignment).toContain('create policy "Admins manage jobs"')
    expect(alignment).toContain('create policy "Admins manage broadcasts"')
  })

  it('keeps the auth signup trigger private and search-path pinned', () => {
    const migration = read('supabase/migrations/20260517192455_harden_auth_signup_trigger.sql')

    expect(migration).toContain('create or replace function private.handle_new_user()')
    expect(migration).toContain('security definer')
    expect(migration).toContain('set search_path = public, pg_catalog')
    expect(migration).toContain("values (\n    new.id,\n    'customer',")
    expect(migration).not.toContain('raw_user_meta_data')
    expect(migration).not.toContain('user_metadata')
    expect(migration).toContain('for each row execute function private.handle_new_user()')
    expect(migration).toContain('drop function if exists public.handle_new_user()')
    expect(migration).toContain('revoke execute on function private.handle_new_user() from public')
    expect(migration).toContain('revoke execute on function private.handle_new_user() from anon')
    expect(migration).toContain('revoke execute on function private.handle_new_user() from authenticated')
  })

  it('keeps cancel-before-accept atomic so stale broadcasts cannot survive success', () => {
    const migrations = readMigrations()

    expect(migrations).toContain('create function public.cancel_job_before_accept_atomic')
    expect(migrations).toContain('for update')
    expect(migrations).toContain('grant execute on function public.cancel_job_before_accept_atomic(uuid, uuid) to service_role')
  })

  it('re-checks worker eligibility inside atomic accept', () => {
    const migrations = readMigrations()

    expect(migrations).toContain('WORKER_NOT_ELIGIBLE')
    expect(migrations).toContain('from public.worker_profiles')
    expect(migrations).toContain('v_worker.is_suspended is true')
    expect(migrations).toContain("and status = 'sent'::public.broadcast_status")
    expect(migrations).toContain('for update')
    expect(migrations).toContain('id <> p_job_id')
    expect(migrations).toContain("'completed_by_worker'::public.job_status")
  })

  it('marks the winning worker unavailable inside atomic accept', () => {
    const migration = read('supabase/migrations/20260518002000_accept_broadcast_lock_worker_profile.sql')

    expect(migration).toContain('update public.worker_profiles')
    expect(migration).toContain('set is_available = false')
    expect(migration).toContain('where id = p_worker_id')
  })

  it('locks the worker profile row during atomic accept to prevent double-accept races', () => {
    const migration = read('supabase/migrations/20260518005000_accept_broadcast_lock_job_first.sql')

    expect(migration).toMatch(/from public\.worker_profiles[\s\S]*where id = p_worker_id[\s\S]*for update/)
    expect(migration).toContain('v_worker.is_available is not true')
    expect(migration).toContain('WORKER_NOT_ELIGIBLE')
  })

  it('locks job before broadcast in atomic accept to avoid accept-cancel deadlocks', () => {
    const migration = read('supabase/migrations/20260518005000_accept_broadcast_lock_job_first.sql')
    const jobLockIndex = migration.indexOf('from public.jobs')
    const broadcastLockIndex = migration.indexOf('from public.job_broadcasts')

    expect(jobLockIndex).toBeGreaterThan(-1)
    expect(broadcastLockIndex).toBeGreaterThan(jobLockIndex)
    expect(migration).toMatch(/from public\.jobs[\s\S]*where id = p_job_id[\s\S]*for update/)
    expect(migration).toContain("v_job_state.status <> 'broadcasting'::public.job_status")
  })

  it('checks broadcast membership before leaking accept job state', () => {
    const migration = read('supabase/migrations/20260518071000_accept_broadcast_privacy_guard_v2.sql')
    const jobLockIndex = migration.indexOf('from public.jobs as j')
    const broadcastLockIndex = migration.indexOf('from public.job_broadcasts as jb')
    const broadcastNotFoundIndex = migration.indexOf("return query select false, 'NOT_FOUND'::text", broadcastLockIndex)
    const statusLeakIndex = migration.indexOf("v_job_state.status <> 'broadcasting'::public.job_status")

    expect(jobLockIndex).toBeGreaterThan(-1)
    expect(broadcastLockIndex).toBeGreaterThan(jobLockIndex)
    expect(broadcastNotFoundIndex).toBeGreaterThan(broadcastLockIndex)
    expect(statusLeakIndex).toBeGreaterThan(broadcastNotFoundIndex)
    expect(migration).toContain('select j.id, j.status, j.service_type, j.address_district')
    expect(migration).toContain('select jb.id, jb.status, jb.expires_at')
    expect(migration).toContain('order by jb.sent_at desc nulls last, jb.broadcast_at desc nulls last, jb.id desc')
    expect(migration).not.toContain('created_at desc')
    expect(migration).not.toContain('returning id, address_building, address_unit, address_floor, address_district')
  })

  it('cleans all still-sent broadcasts for the accepted job, not just one batch', () => {
    const migration = read('supabase/migrations/20260518011500_reassign_all_sent_broadcasts_on_accept.sql')

    expect(migration).toContain('create or replace function public.accept_broadcast_atomic')
    expect(migration).toMatch(/where job_id = p_job_id[\s\S]*and id <> v_broadcast\.id[\s\S]*and status = 'sent'::public\.broadcast_status/)
    expect(migration).not.toContain('where batch_id = v_broadcast.batch_id')
    expect(migration).toContain('job-wide sent-broadcast cleanup')
  })

  it('keeps atomic accept aligned with service and city-wide district eligibility', () => {
    const migration = read('supabase/migrations/20260518013000_accept_broadcast_service_district_guard.sql')
    const edgeServices = readEdgeServiceLayer()
    const nextBroadcast = read('apps/api/src/lib/jobs/broadcast.ts')

    expect(migration).toContain('service_types, districts')
    expect(migration).toContain('v_worker.service_types is null')
    expect(migration).toContain('cardinality(v_worker.service_types) = 0')
    expect(migration).toContain('v_worker.districts is null')
    expect(migration).toContain('cardinality(v_worker.districts) = 0')
    expect(migration).toContain('not (v_job_state.service_type = any(v_worker.service_types))')
    expect(migration).toContain('v_job_state.address_district is null')
    expect(migration).toContain("v_job_state.address_district = 'hcmc_all'")
    expect(migration).toContain('v_job_district := v_job_state.address_district')
    expect(migration).not.toContain("v_job_district := coalesce(v_job_state.address_district, 'hcmc_all')")
    expect(migration).toContain("'hcmc_all' = any(v_worker.districts)")
    expect(migration).toContain("set status = 'reassigned'::public.broadcast_status,\n        responded_at = v_now")
    expect(edgeServices + read('supabase/functions/mobile-api/_shared/domains/matching/broadcasts.ts')).toContain('const districtCode = normalizeDistrict(district)')
    expect(edgeServices + read('supabase/functions/mobile-api/_shared/domains/matching/broadcasts.ts')).toContain('districts.cs.{${districtCode}},districts.cs.{hcmc_all}')
    expect(nextBroadcast).toContain('const districtCode = normalizeDistrict(district)')
    expect(nextBroadcast).toContain('districts.cs.{${districtCode}},districts.cs.{hcmc_all}')
  })

  it('qualifies atomic accept columns that collide with PL/pgSQL output variables', () => {
    const migration = read('supabase/migrations/20260518041500_remove_accept_broadcast_created_at_order.sql')

    expect(migration).toContain('from public.jobs as j')
    expect(migration).toContain('j.address_district')
    expect(migration).toContain(
      'returning j.id, j.address_building, j.address_unit, j.address_floor, j.address_district'
    )
    expect(migration).toContain('from public.job_broadcasts as jb')
    expect(migration).toContain('from public.worker_profiles as wp')
    expect(migration).toContain('from public.jobs as active_job')
    expect(migration).not.toContain('select id, status, service_type, address_district')
    expect(migration).not.toContain(
      'returning id, address_building, address_unit, address_floor, address_district'
    )
    expect(migration).not.toContain('jb.created_at')
  })

  it('keeps Next reference confirm-search retry semantics aligned with Edge mobile-api', () => {
    const edgeServices = readEdgeServiceLayer()
    const nextConfirmSearch = read('apps/api/src/app/api/jobs/[id]/confirm-search/route.ts')
    const edgeMatching = [
      'supabase/functions/mobile-api/_shared/domains/matching/broadcasts.ts',
      'supabase/functions/mobile-api/_shared/domains/matching/flow.ts',
      'supabase/functions/mobile-api/_shared/domains/matching/flow-rollback.ts',
    ].map(read).join('\n')

    for (const source of [edgeServices + edgeMatching, nextConfirmSearch]) {
      expect(source).toContain('BROADCAST_ACTIVE')
      expect(source).toContain('customer_retried_search')
      expect(source).toContain('job_broadcasts')
      expect(source).toContain('no_worker_found')
      expect(source).toContain('broadcast_sent: false')
      expect(source).toContain('rollbackFailedBroadcastStart')
      expect(source).toContain('broadcast_start_failed')
      expect(source).toContain('confirmed_search_at: null')
      expect(source).toContain('customer_id')
    }
    expect(edgeServices).toContain('expireStaleBroadcasts')
    expect(nextConfirmSearch).toContain('broadcast_at.lte.')
  })

  it('does not normalize unknown worker registration districts into city-wide coverage', () => {
    const edgeServices = readEdgeServiceLayer()
    const edgeDb = read('supabase/functions/mobile-api/_shared/platform/db.ts')
    const nextRegister = read('apps/api/src/lib/workers/register.ts')

    expect(edgeServices).toContain('normalizeWorkerDistricts')
    expect(edgeServices).toContain('apiFailure("VALIDATION"')
    expect(edgeServices + edgeDb).toContain('trimmed === "hcmc_all"')
    expect(nextRegister).toContain('normalizeWorkerDistricts')
    expect(nextRegister).toContain("code: 'VALIDATION'")
    expect(nextRegister).toContain("trimmed === 'hcmc_all'")
  })

  it('keeps worker availability atomic with the same worker-row lock used by accept', () => {
    const migration = read('supabase/migrations/20260518010500_availability_offline_expires_sent_broadcasts.sql')
    const edgeServices = readEdgeServiceLayer()
    const nextRoute = read('apps/api/src/app/api/workers/me/availability/route.ts')
    const nextBroadcasts = read('apps/api/src/app/api/workers/me/broadcasts/route.ts')

    expect(migration).toContain('create or replace function public.set_worker_availability_atomic')
    expect(migration).toContain('language plpgsql security invoker')
    expect(migration).toMatch(/from public\.worker_profiles[\s\S]*where id = p_worker_id[\s\S]*for update/)
    expect(migration).toContain('WORKER_BUSY')
    expect(migration).toContain('if p_is_available is false then')
    expect(migration).toContain('update public.job_broadcasts')
    expect(migration).toContain("and status = 'sent'::public.broadcast_status")
    expect(migration.indexOf('update public.job_broadcasts')).toBeLessThan(
      migration.indexOf('from public.worker_profiles')
    )
    expect(migration).toContain('grant execute on function public.set_worker_availability_atomic(uuid, boolean) to service_role')
    expect(edgeServices + read('supabase/functions/mobile-api/_shared/domains/worker/workers.ts')).toContain('set_worker_availability_atomic')
    expect(nextRoute).toContain('set_worker_availability_atomic')
    expect(nextBroadcasts).not.toContain(".update(")
    expect(nextBroadcasts).toContain(".gt('expires_at', nowIso)")
  })

  it('keeps worker inbox defensive against sent broadcasts attached to non-broadcasting jobs', () => {
    const edgeServices = readEdgeServiceLayer()
    const nextBroadcasts = read('apps/api/src/app/api/workers/me/broadcasts/route.ts')

    expect(edgeServices + read('supabase/functions/mobile-api/_shared/domains/worker/workers.ts')).toContain(
      'jobs(status, service_type, address_district, scheduled_at, kael_problem_identified, kael_price_min, kael_price_max, kael_worker_brief_core, photo_urls)'
    )
    expect(nextBroadcasts).toContain(
      'jobs(status, service_type, address_district, kael_problem_identified, kael_price_min, kael_price_max)'
    )

    for (const source of [edgeServices + read('supabase/functions/mobile-api/_shared/domains/worker/workers.ts'), nextBroadcasts]) {
      expect(source).toMatch(/job\.status !== ["']broadcasting["']/)
    }
  })

  it('keeps worker decline defensive against sent broadcasts attached to non-broadcasting jobs', () => {
    const edgeServices = readEdgeServiceLayer()
    const nextAcceptBroadcast = read('apps/api/src/lib/jobs/accept-broadcast.ts')

    for (const source of [edgeServices + read('supabase/functions/mobile-api/_shared/domains/matching/decline.ts'), nextAcceptBroadcast]) {
      expect(source).toContain('jobs(status)')
      expect(source).toMatch(/parentJob\.status !== ["']broadcasting["']/)
      expect(source).toContain('BROADCAST_NOT_ACTIVE')
    }
  })

  it('hardens private RLS helper execution and search path', () => {
    const migration = read('supabase/migrations/20260518043000_harden_private_rls_helper_execution.sql')

    for (const signature of [
      'private.is_admin()',
      'private.is_job_participant(uuid)',
      'private.is_job_customer(uuid)',
      'private.is_job_worker(uuid)',
    ]) {
      expect(migration).toContain(`alter function ${signature}`)
      expect(migration).toContain('set search_path = public, pg_catalog')
      expect(migration).toContain(`revoke execute on function ${signature} from public`)
      expect(migration).toContain(`revoke execute on function ${signature} from anon`)
      expect(migration).toContain(`grant execute on function ${signature} to authenticated`)
    }
  })

  it('keeps service-role-only mobile RPCs as invoker security, not definer', () => {
    const migrations = readMigrations()

    expect(migrations).toContain('alter function public.accept_broadcast_atomic(uuid, uuid) security invoker')
    expect(migrations).toContain('alter function public.request_scope_change_atomic(uuid, uuid, text, text, text[], int, int, jsonb) security invoker')
    expect(migrations).toContain('alter function public.decide_scope_change_atomic(uuid, uuid, text) security invoker')
    expect(migrations).toContain('alter function public.submit_review_atomic(uuid, uuid, int, text[], text) security invoker')
    expect(migrations).toContain('language plpgsql security invoker')
    expect(migrations).toContain('create or replace function public.request_worker_cancellation_atomic')
    expect(migrations).toContain('create or replace function public.decide_worker_cancellation_atomic')
    expect(migrations).toContain('create function public.set_worker_availability_atomic')
  })

  it('adds Supabase boxes for media, Kael artifacts, notifications, and worker cancellation', () => {
    const migration = read('supabase/migrations/20260519090200_supabase_boxes_notifications_media_cancellation.sql')
    const edgeServices = readEdgeServiceLayer()
    const edgeRouter = readEdgeRouterLayer()

    for (const table of [
      'public.job_media_assets',
      'public.kael_analysis_artifacts',
      'public.device_push_tokens',
      'public.worker_cancellation_requests',
    ]) {
      expect(migration).toContain(`alter table ${table} enable row level security`)
      expect(migration).toContain(`revoke insert, update, delete on ${table} from authenticated`)
      expect(migration).toContain(`grant all on ${table} to service_role`)
    }

    expect(migration).toContain("insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)")
    expect(migration).toContain("'worker-verification', 'worker-verification', false")
    expect(migration).toContain("'job-media', 'job-media', false")
    expect(migration).toContain('create or replace function public.insert_notification_atomic')
    expect(migration).toContain('create or replace function public.register_device_push_token_atomic')
    expect(migration).toContain('create or replace function public.request_worker_cancellation_atomic')
    expect(migration).toContain('create or replace function public.decide_worker_cancellation_atomic')
    expect(migration).toContain('grant execute on function public.request_worker_cancellation_atomic(uuid, uuid, text, text[]) to service_role')
    expect(migration).toContain('grant execute on function public.decide_worker_cancellation_atomic(uuid, uuid, text, text) to service_role')
    expect(migration).toContain("status = 'broadcasting'::public.job_status")
    expect(edgeServices + read('supabase/functions/mobile-api/_shared/domains/worker/cancellation.ts')).toContain('request_worker_cancellation_atomic')
    expect(edgeServices).not.toContain('client.rpc("decide_worker_cancellation_atomic"')
    expect(edgeRouter).toContain('jobs.workerCancellation')
    // The admin decide endpoint was removed once cancellation became auto-approved:
    // the RPC survives in migration history, the Edge surface must not re-expose it.
    expect(edgeRouter).not.toContain('workerCancellation.decide')
  })

  it('adds service-role Kael chat persistence and confirm RPC for the Kael-first workflow', () => {
    const migration = read('supabase/migrations/20260520130514_kael_chat_sessions.sql')
    const edgeServices = readEdgeServiceLayer()
    const edgeRouter = readEdgeRouterLayer()
    const mobileApiTypes = read('apps/mobile/lib/api-types.ts')
    const edgeContracts = read('supabase/functions/_shared/contracts.ts')
    const sharedTypes = read('packages/shared/src/types/api-responses.ts')

    for (const table of [
      'public.kael_chat_sessions',
      'public.kael_chat_turns',
    ]) {
      expect(migration).toContain(`alter table ${table} enable row level security`)
      expect(migration).toContain(`revoke insert, update, delete on ${table} from authenticated`)
      expect(migration).toContain(`grant all on ${table} to service_role`)
    }

    expect(migration).toContain('create table if not exists public.kael_chat_sessions')
    expect(migration).toContain('create table if not exists public.kael_chat_turns')
    expect(migration).toContain('create or replace function public.confirm_kael_chat_atomic')
    expect(migration).toContain('grant execute on function public.confirm_kael_chat_atomic(uuid, uuid) to service_role')
    expect(edgeServices).toContain('confirm_kael_chat_atomic')
    expect(edgeServices).toContain('KAEL_CHAT_HARD_COST_CAP_USD')
    expect(edgeServices).toContain('getKaelChatCostUsd')
    expect(edgeServices).toContain('"budget_exceeded"')
    expect(edgeRouter).toContain('kael.chat.create')
    expect(edgeRouter).toContain('kael.chat.confirm')
    expect(edgeContracts).toContain('"budget_exceeded"')
    expect(sharedTypes).toContain("'budget_exceeded'")
    expect(mobileApiTypes).toContain('KaelChatNextAction')
  })

  it('hardens worker cancellation approval and job-media upload stages after PR review', () => {
    const migration = read('supabase/migrations/20260519120720_fix_worker_cancellation_race_and_media_stage_rls.sql')
    const edgeServices = readEdgeServiceLayer()

    expect(migration).toContain('JOB_NOT_CANCELLABLE')
    expect(migration).toContain("'worker_matched'::public.job_status")
    expect(migration).toContain("'scope_change_pending'::public.job_status")
    expect(migration).not.toContain("'confirmed_by_customer'::public.job_status")
    expect(migration).toContain('drop policy if exists "Participants upload job media files"')
    expect(migration).toContain('and case')
    expect(migration).toContain('else false')
    expect(migration).toContain("(storage.foldername(name))[2] in ('before', 'kael_reference')")
    expect(migration).toContain('private.is_job_customer')
    expect(migration).toContain("(storage.foldername(name))[2] in ('after', 'cancellation_evidence')")
    expect(migration).toContain('private.is_job_worker')
    // JOB_NOT_CANCELLABLE is raised only by decide_worker_cancellation_atomic. That RPC lost its
    // Edge caller when the admin decide endpoint was removed, so no Edge mapper may claim to
    // handle it — a mapper here again would mean the endpoint came back.
    expect(edgeServices + read('supabase/functions/mobile-api/_shared/platform/domain-error-mappers.ts')).not.toContain(
      'JOB_NOT_CANCELLABLE',
    )
  })

  it('auto-approves worker cancellation for immediate replacement without rating penalty', () => {
    const migration = read('supabase/migrations/20260520141200_worker_cancellation_auto_reassign.sql')
    const edgeServices = readEdgeServiceLayer()

    expect(migration).toContain('drop function if exists public.request_worker_cancellation_atomic')
    expect(migration).toContain("status = 'broadcasting'::public.job_status")
    expect(migration).toContain("'approved'")
    expect(migration).toContain("'RATE_LIMITED'")
    expect(migration).not.toMatch(/rating\s*=/i)
    expect(migration).not.toContain('is_suspended')
    expect(edgeServices).toContain('notifyCustomerWorkerReplacementSearch')
    expect(edgeServices + read('supabase/functions/mobile-api/_shared/domains/notification/notifications.ts')).toContain('worker_replacement_search')
    expect(edgeServices + read('supabase/functions/mobile-api/_shared/domains/notification/notifications.ts')).toContain('broadcast_sent: broadcastSent')
  })

  it('adds Phase 3 geo matching schema, Maps proxy, and auto-suspend without rating penalty', () => {
    const migration = read('supabase/migrations/20260521120000_geo_matching_and_worker_auto_suspend.sql')
    const vietmapMigration = read('supabase/migrations/20260527090118_allow_vietmap_geo_source.sql')
    const edgeServices = readEdgeServiceLayer()
    const edgeRouter = readEdgeRouterLayer()
    const mobileServices = read('apps/mobile/lib/services.ts')

    expect(migration).toContain('address_lat numeric(9,6)')
    expect(migration).toContain('address_lng numeric(9,6)')
    expect(migration).toContain('home_lat numeric(9,6)')
    expect(migration).toContain('service_radius_km int not null default 8')
    expect(migration).toContain('problem_specializations text[]')
    expect(migration).toContain('create or replace function public.distance_km')
    expect(migration).toContain('is_suspended = true')
    expect(migration).not.toMatch(/rating\s*=/i)
    expect(vietmapMigration).toContain("'vietmap'")
    expect(edgeServices + read('supabase/functions/mobile-api/_shared/platform/edge-env.ts')).toContain('VIETMAP_API_KEY')
    expect(edgeServices + read('supabase/functions/mobile-api/_shared/domains/places/geo.ts')).toContain('https://maps.vietmap.vn/api/autocomplete/v4')
    expect(edgeServices + read('supabase/functions/mobile-api/_shared/domains/places/geo.ts')).toContain('https://maps.vietmap.vn/api/search/v4')
    expect(edgeServices + read('supabase/functions/mobile-api/_shared/domains/places/geo.ts')).toContain('https://maps.vietmap.vn/api/place/v4')
    expect(edgeServices + read('supabase/functions/mobile-api/_shared/platform/edge-env.ts')).toContain('GOOGLE_MAPS_API_KEY')
    expect(edgeServices + read('supabase/functions/mobile-api/_shared/domains/places/geo.ts')).toContain('https://places.googleapis.com/v1/places:autocomplete')
    expect(edgeServices + read('supabase/functions/mobile-api/_shared/domains/places/geo.ts')).toContain('https://maps.googleapis.com/maps/api/geocode/json')
    expect(edgeServices).toContain('placesAutocomplete')
    expect(edgeServices + read('supabase/functions/mobile-api/_shared/domains/places/geo.ts')).toContain('geo_source: "fallback"')
    expect(edgeRouter).toContain('places.autocomplete')
    expect(edgeRouter).toContain('/places/autocomplete')
    expect(mobileServices).toContain("api.post<PlacesAutocompleteResponse>('/places/autocomplete', input)")
  })

  it('adds P11 worker cancellation taxonomy, no-show handling, and review-only abuse controls', () => {
    const migration = readMigrationByName('kael_worker_cancel_case_p11')
    const noShowFixMigration = readMigrationByName('fix_worker_no_show_reason_code_ambiguity')
    const edgeServices = readEdgeServiceLayer()
    const edgeKaelModules = readEdgeKaelModules()
    const sharedTypes = read('packages/shared/src/types/database.types.ts')

    expect(migration).toContain('create table if not exists public.worker_cancellation_reason_taxonomy')
    expect(migration).toContain('grant select on public.worker_cancellation_reason_taxonomy to authenticated')
    expect(migration).toContain('grant all on public.worker_cancellation_reason_taxonomy to service_role')
    expect(migration).toContain("queue_type in ('demanding_customer', 'worker_cancellation_review', 'worker_no_show')")
    expect(migration).toContain('drop function if exists public.request_worker_cancellation_atomic(uuid, uuid, text, text[])')
    expect(migration).toContain('create function public.request_worker_cancellation_atomic')
    expect(migration).toContain('reason_code text')
    expect(migration).toContain('reason_category text')
    expect(migration).toContain('admin_review_required boolean')
    expect(migration).toContain('fallback_options jsonb')
    expect(migration).toContain('abuse_signals text[]')
    expect(migration).toContain('enqueue_worker_no_show_reviews')
    expect(noShowFixMigration).toContain('q.reason_code as inserted_reason_code')
    expect(noShowFixMigration).toContain('inserted.inserted_reason_code')
    expect(migration).not.toContain('is_suspended = true')
    expect(migration).not.toContain("verification_status = 'suspended'")
    expect(edgeKaelModules).toContain('classifyWorkerCancellationReason')
    expect(edgeKaelModules).toContain('detectWorkerNoShow')
    expect(edgeKaelModules).toContain('recordWorkerCancellationReview')
    expect(edgeServices).toContain('classifyWorkerCancellationReason')
    expect(edgeServices + read('supabase/functions/mobile-api/_shared/domains/worker/cancellation.ts')).toContain('fallback_options')
    expect(edgeServices + read('supabase/functions/mobile-api/_shared/domains/worker/cancellation.ts')).toContain('admin_review_required')
    expect(sharedTypes).toContain('worker_cancellation_reason_taxonomy')
    expect(sharedTypes).toContain('fallback_options: Json')
  })

  it('qualifies P11 worker cancellation reason category counts for Postgres lint', () => {
    const migration = readMigrationByName('fix_worker_cancellation_reason_category_ambiguity_p14')

    expect(migration).toContain('create or replace function public.request_worker_cancellation_atomic')
    expect(migration).toContain('from public.worker_cancellation_requests as wcr')
    expect(migration).toContain("wcr.reason_category = 'no_reason'")
  })

  it('adds P12 customer cancellation taxonomy, after-accept RPC, and Phase 0 review controls', () => {
    const migration = readMigrationByName('kael_customer_cancel_case_p12')
    const edgeServices = readEdgeServiceLayer()
    const edgeRouter = readEdgeRouterLayer()
    const edgeContracts = readEdgeContracts()
    const edgeKaelModules = readEdgeKaelModules()
    const sharedTypes = read('packages/shared/src/types/database.types.ts')
    const mobileServices = read('apps/mobile/lib/services.ts')

    expect(migration).toContain('create table if not exists public.customer_cancellation_reason_taxonomy')
    expect(migration).toContain('create table if not exists public.customer_cancellation_records')
    expect(migration).toContain('grant select on public.customer_cancellation_reason_taxonomy to authenticated')
    expect(migration).toContain('grant all on public.customer_cancellation_records to service_role')
    expect(migration).toContain("queue_type in ('demanding_customer', 'worker_cancellation_review', 'worker_no_show', 'customer_cancellation_review')")
    expect(migration).toContain('create function public.cancel_job_after_accept_atomic')
    expect(migration).toContain('create function public.request_customer_cancellation_atomic')
    expect(migration).toContain('phase0_no_monetary_penalty boolean')
    expect(migration).toContain('worker_goodwill jsonb')
    expect(migration).not.toContain('late_cancel_fee')
    expect(migration).not.toContain('temp_block')
    expect(edgeKaelModules).toContain('classifyCustomerCancellationReason')
    expect(edgeKaelModules).toContain('determineCustomerCancellationSubCase')
    expect(edgeServices + read('supabase/functions/mobile-api/_shared/domains/customer/cancellation.ts')).toContain('request_customer_cancellation_atomic')
    expect(edgeServices).toContain('recordCustomerCancellationReview')
    expect(edgeRouter).toContain('jobs.customerCancellation')
    expect(edgeRouter).toContain('/customer-cancellation')
    expect(edgeContracts).toContain('customerCancellationRequestSchema')
    expect(mobileServices).toContain('/customer-cancellation')
    expect(sharedTypes).toContain('customer_cancellation_reason_taxonomy')
    expect(sharedTypes).toContain('customer_cancellation_records')
    expect(sharedTypes).toContain('request_customer_cancellation_atomic')
    expect(sharedTypes).toContain('cancel_job_after_accept_atomic')
  })

  it('adds P13 dispute tables, immutable evidence snapshots, neutral helpers, and admin RPCs', () => {
    const migration = readMigrationByName('kael_dispute_case_p13')
    const edgeServices = readEdgeServiceLayer()
    const edgeRouter = readEdgeRouterLayer()
    const edgeContracts = readEdgeContracts()
    const edgeKaelModules = readEdgeKaelModules()
    const sharedTypes = read('packages/shared/src/types/database.types.ts')
    const mobileServices = read('apps/mobile/lib/services.ts')

    expect(migration).toContain('create table if not exists public.evidence_snapshots')
    expect(migration).toContain('create table if not exists public.disputes')
    expect(migration).toContain('create function public.open_dispute_atomic')
    expect(migration).toContain('create function public.submit_counter_statement_atomic')
    expect(migration).toContain('create function public.admin_decide_dispute_atomic')
    expect(migration).toContain('raise exception')
    expect(migration).toContain('dispute_review')
    expect(migration).toContain('refund_amount')
    expect(migration).toContain('worker_credit_amount')
    expect(migration).not.toContain('auto_suspend')
    expect(edgeKaelModules).toContain('buildNeutralDisputeSummary')
    expect(edgeKaelModules).toContain('assertNeutralDisputeLanguage')
    expect(edgeServices + read('supabase/functions/mobile-api/_shared/domains/dispute/dispute.ts')).toContain('open_dispute_atomic')
    expect(edgeServices + read('supabase/functions/mobile-api/_shared/domains/dispute/dispute.ts')).toContain('buildNeutralDisputeSummary')
    expect(edgeRouter).toContain('jobs.openDispute')
    expect(edgeRouter).toContain('/disputes')
    expect(edgeRouter).toContain('disputes.counterStatement')
    expect(edgeRouter).toContain('disputes.adminDecision')
    expect(edgeContracts).toContain('disputeOpenRequestSchema')
    expect(edgeContracts).toContain('disputeCounterStatementSchema')
    expect(edgeContracts).toContain('disputeAdminDecisionSchema')
    expect(mobileServices).toContain('/disputes')
    expect(sharedTypes).toContain('evidence_snapshots')
    expect(sharedTypes).toContain('disputes')
    expect(sharedTypes).toContain('open_dispute_atomic')
    expect(sharedTypes).toContain('submit_counter_statement_atomic')
    expect(sharedTypes).toContain('admin_decide_dispute_atomic')
  })

  it('adds Section 32 disintermediation risk queue without hard worker punishment', () => {
    const migration = readMigrationByName('disintermediation_admin_queue')
    const atomicMemoryMigration = read(
      'supabase/migrations/20260714106000_atomic_kael_memory_updates.sql',
    )
    const chatSource = read('supabase/functions/mobile-api/_shared/domains/job/chat.ts')
    const chatSupport = read('supabase/functions/mobile-api/_shared/domains/job/chat-support.ts')
    const guardStart = chatSupport.indexOf('async function recordWorkerDisintermediationRisk')
    const guardEnd = chatSupport.indexOf('export async function maybeHandleDemandingCustomerJobChat')
    const guardBlock = chatSupport.slice(guardStart, guardEnd)

    expect(migration).toContain('disintermediation_risk')
    expect(chatSource).toContain('evaluateJobChatContactGuard')
    expect(chatSource).toContain('maybeHandleJobChatContactGuard')
    expect(chatSupport).toContain('recordWorkerDisintermediationRisk')
    expect(guardBlock).toContain('record_worker_disintermediation_memory_atomic')
    expect(atomicMemoryMigration).toContain("'disintermediation_risk'")
    expect(atomicMemoryMigration).toContain("'disintermediation_contact_leak', true")
    expect(atomicMemoryMigration).not.toContain('is_suspended')
    expect(atomicMemoryMigration).not.toContain('verification_status')
  })

  it('adds Section 32 apartment access staged release without worker-side exact unit leakage', () => {
    const migration = readMigrationByName('apartment_access_release')
    const edgeServices = readEdgeServiceLayer()
    const edgeRouter = readEdgeRouterLayer()
    const mobileProvider = readMobileFrontendWorkflowLayer()
    const workerSurface = listEdgeServiceFiles('apps/mobile/components/worker')
      .filter((p) => /\.tsx?$/.test(p) && !p.includes('/__tests__/'))
      .sort()
      .map(read)
      .join('\n')

    expect(migration).toContain('create table if not exists public.kael_chat_pre_intake_memory')
    expect(migration).toContain('access_profile jsonb not null')
    expect(migration).toContain('apartment_access_profile jsonb not null')
    expect(migration).toContain('apartment_access_state jsonb not null')
    expect(migration).toContain('for each row execute function update_updated_at()')
    expect(migration).not.toContain('private.set_updated_at()')
    expect(migration).toContain('Exact unit unlocks only after valid lobby/last-50m check-in')
    expect(edgeServices + read('supabase/functions/mobile-api/_shared/domains/worker/workers.ts')).toContain('projectAddressAccess(row, "worker")')
    expect(edgeServices).toContain('forcedStage: "building_released"')
    expect(edgeServices).toContain('buildCheckInAccessState')
    expect(edgeServices + read('supabase/functions/mobile-api/_shared/domains/worker/apartment-access.ts')).toContain('buildAuthorizedReleaseAccessState')
    expect(edgeServices).toContain('authorizeApartmentAccess')
    expect(edgeServices + read('supabase/functions/mobile-api/_shared/domains/worker/apartment-access.ts')).toContain('apartment_access_release: true')
    expect(edgeRouter).toContain('parseWorkerAccessCheckIn')
    expect(edgeRouter).toContain('mode === "manual_photo" && (!photoUrls || photoUrls.length === 0)')
    expect(mobileProvider).toContain('job.address_access.exact_unit_released && hasSpecificWorkerRouteAddress')
    // The worker surface consumes the release flag; it does not yet render an unlock label.
    // The previous assertion looked for 'Đã mở căn hộ', which only ever existed inside
    // workerV5ArrivalDestinationMeta — a helper no surface called. Asserting the consumer
    // keeps §32 covered without a dead-code string standing in for shipped UI.
    expect(workerSurface).toContain('exact_unit_released === true')
  })

  it('keeps Plan31 production advisor fixes for helper search paths and RLS initplan', () => {
    const migration = read('supabase/migrations/20260605003000_fix_plan31_post_advisor_warnings.sql')

    expect(migration).toContain('create or replace function private.kael_b4_service_label_vi')
    expect(migration).toContain('create or replace function private.kael_b4_json_int')
    expect(migration).toContain('set search_path = pg_catalog')
    expect(migration).toContain('using (customer_id = (select auth.uid()) or (select private.is_admin()))')
  })

  it('locks Section 32 LLM boundary to edge phrasing while decisions stay deterministic', () => {
    const boundaryContract = read('supabase/functions/mobile-api/_shared/kael/contracts/ai-boundary-contract.ts')
    const workerAssist = read('supabase/functions/mobile-api/_shared/kael/agents/worker-assist.ts')
    const workerAssistGuard = read('supabase/functions/mobile-api/_shared/kael/agents/worker-assist-guard.ts')
    const demanding = read('supabase/functions/mobile-api/_shared/kael/agents/agentic/case-2-demanding.ts')
    const workerCancel = read('supabase/functions/mobile-api/_shared/kael/agents/agentic/case-3-worker-cancel.ts')
    const customerCancel = read('supabase/functions/mobile-api/_shared/kael/agents/agentic/case-4-customer-cancel.ts')
    const dispute = read('supabase/functions/mobile-api/_shared/kael/agents/agentic/case-5-dispute.ts')
    const atomicMemoryMigration = read(
      'supabase/migrations/20260714106000_atomic_kael_memory_updates.sql',
    )
    const services = readEdgeServiceLayer()

    expect(boundaryContract).toContain('KAEL_DETERMINISTIC_DECISION_SURFACES')
    expect(boundaryContract).toContain('"scope_change_decision"')
    expect(boundaryContract).toContain('"dispute_outcome"')
    expect(boundaryContract).toContain('"penalty_or_compensation"')
    expect(workerAssist).toContain('workerAssistResponseSchema')
    expect(workerAssistGuard).toContain('detectForbiddenAiDecisionText')
    expect(workerAssist).toContain('guardOutput')
    expect(workerAssist).toContain('fallbackAnswer')
    expect(demanding).toContain('safeDemandingResponseText')
    expect(dispute).toContain('assertNeutralDisputeLanguage')
    expect(dispute).toContain('detectForbiddenAiDecisionText')
    for (const source of [demanding, workerCancel, customerCancel, dispute]) {
      expect(source).not.toContain('callAI(')
      expect(source).not.toContain('chooseProvider(')
    }
    expect(customerCancel).toContain('customerPenaltyAmount: null')
    expect(customerCancel).toContain('workerCompensationAmount: null')
    expect(atomicMemoryMigration).toContain("'autonomous_suspension', false")
    expect(services).toContain('validateKaelAutonomyTransition')
    expect(services + read('supabase/functions/mobile-api/_shared/domains/dispute/dispute.ts')).toContain('open_dispute_atomic')
    expect(services + read('supabase/functions/mobile-api/_shared/domains/customer/cancellation.ts')).toContain('request_customer_cancellation_atomic')
    expect(services + read('supabase/functions/mobile-api/_shared/domains/worker/cancellation.ts')).toContain('request_worker_cancellation_atomic')
  })

  it('splits Supabase box admin RLS policies so SELECT has one permissive path', () => {
    const migration = read('supabase/migrations/20260519122000_consolidate_box_admin_rls_policies.sql')

    for (const policy of [
      'Admins manage service knowledge boxes',
      'Admins manage Kael market artifacts',
      'Admins manage job media assets',
      'Admins manage Kael analysis artifacts',
      'Admins manage device push tokens',
      'Admins manage worker cancellation requests',
    ]) {
      expect(migration).toContain(`drop policy if exists "${policy}"`)
    }

    expect(migration).toContain('for insert')
    expect(migration).toContain('for update')
    expect(migration).toContain('for delete')
    expect(migration).not.toMatch(/for all/i)
  })

  it('locks scope-change lifecycle rows and returns explicit race errors', () => {
    const migration = read('supabase/migrations/20260517163541_harden_scope_change_rpc_races.sql')
    const edgeServices = readEdgeServiceLayer()
    const updateJobIndex = migration.indexOf("update public.jobs\n    set status = 'scope_change_pending'")
    const insertScopeIndex = migration.indexOf('insert into public.scope_change_requests')

    expect(migration).toContain('where id = p_job_id\n    for update')
    expect(migration).toContain('where id = p_scope_change_id\n    for update')
    expect(migration).toContain("return query select false, 'STATUS_CHANGED'::text")
    expect(migration).toContain('security invoker')
    expect(updateJobIndex).toBeGreaterThan(-1)
    expect(insertScopeIndex).toBeGreaterThan(updateJobIndex)
    expect(edgeServices).toContain('current_scope_change')
    expect(edgeServices).toContain('getCurrentScopeChange')
  })

  it('keeps PR#29 scope-change money path atomic and Kael-owned', () => {
    const migrations = readMigrations()
    const edgeServices = readEdgeServiceLayer()

    expect(migrations).toContain('p_kael_computed_max int')
    expect(migrations).toContain('p_kael_review jsonb')
    expect(migrations).toContain('evidence_photo_urls')
    expect(migrations).toContain("return query select false, 'KAEL_PRICE_MISSING'::text")
    expect(migrations).toContain("when p_decision = 'approve' then v_sc.kael_computed_max")
    expect(edgeServices).toContain('kael_scope_review_computed')
    expect(edgeServices).toContain('scope_change_notified')
    expect(edgeServices).toContain('scope_change_final_price_locked')
    expect(edgeServices).not.toContain('applyKaelLockedPriceFromScopeChange')
    expect(edgeServices).not.toContain('failed to update jobs.final_price')
    expect(edgeServices).not.toContain('failed to lock Kael price baseline')
  })

  it('prevents scope-change decision split-brain when one lifecycle update cannot persist', () => {
    const migration = read('supabase/migrations/20260517163541_harden_scope_change_rpc_races.sql')
    const jobUpdateIndex = migration.indexOf("updated_job as (\n    update public.jobs")
    const scopeUpdateIndex = migration.indexOf('updated_scope as (\n    update public.scope_change_requests')

    expect(migration).toContain('with updated_job as')
    expect(migration).toContain('exists (select 1 from updated_job)')
    expect(migration).toContain('raise exception')
    expect(jobUpdateIndex).toBeGreaterThan(-1)
    expect(scopeUpdateIndex).toBeGreaterThan(jobUpdateIndex)
  })

  it('resumes the agreed work when a customer rejects a scope-change request', () => {
    const migration = read('supabase/migrations/20260711062000_unified_scope_change_timing.sql')
    const edgeServices = readEdgeServiceLayer()

    expect(migration).toContain('v_job_status := v_sc.resume_job_status')
    expect(migration).toContain('scope change resume status invariant violated')
    expect(migration).not.toContain("v_job_status := 'cancelled'::public.job_status")
    expect(migration).toContain("v_decision_text := 'rejected'")
    expect(migration).toContain('scope_change_customer_decision = v_decision_text')
    expect(edgeServices).toContain('scopeDecisionToJobStatus(')
  })

  it('keeps real Supabase integration suites blocked from production project ref', () => {
    // The guard moved into one shared resolver so a suite cannot forget it. The
    // assertion follows: prove the guard exists once, then prove every suite
    // routes through it. A suite that resolves its own URL bypasses the guard.
    const guard = read('apps/api/src/__tests__/integration/integration-target.ts')
    const environmentGuard = read('supabase/functions/_shared/harness/environment.ts')
    expect(guard).toContain("from '../../../../../supabase/functions/_shared/harness/environment'")
    expect(guard).toContain('resolveHarnessEnvironment(')
    expect(guard).toContain('assertHarnessMutationAllowed(descriptor)')
    expect(guard).toContain("mutationIntent: 'mutate'")
    expect(environmentGuard).toContain('PRODUCTION_MUTATION_REQUIRES_OPERATOR')
    expect(environmentGuard).toContain('throw new HarnessEnvironmentError(')

    for (const file of [
      'apps/api/src/__tests__/integration/real-supabase.test.ts',
      'apps/api/src/__tests__/integration/learning-real-supabase.test.ts',
      'apps/api/src/__tests__/integration/worker-flow.test.ts',
      'apps/api/src/__tests__/integration/rls-per-actor.test.ts',
    ]) {
      const source = read(file)
      expect(source).toContain("from './integration-target'")
      expect(source).toContain('resolveOrAnnounceSkip(')
      expect(source).not.toContain('process.env.NEXT_PUBLIC_SUPABASE_URL')
    }
  })
})
