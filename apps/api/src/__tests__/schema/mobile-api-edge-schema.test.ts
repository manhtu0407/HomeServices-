import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readGeneratedDatabaseTypes } from '../helpers/generated-database-types'

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

describe('mobile-api Edge schema compatibility', () => {
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
    const databaseTypes = readGeneratedDatabaseTypes()
    expect(databaseTypes).toContain('cleanup_orphan_analyzing_jobs')
    expect(databaseTypes).toContain('purpose: string')
    expect(databaseTypes).not.toContain('purpose?: string | null')
  })

  it('adds P4 output-format schema with service-role writes and worker clarify route', () => {
    const edgeServices = readEdgeServiceLayer()
    const edgeRouter = readEdgeRouterLayer()

    expect(edgeServices + read('supabase/functions/mobile-api/_shared/domains/worker/cancellation.ts')).toContain('request_worker_cancellation_atomic')
    expect(edgeServices).not.toContain('client.rpc("decide_worker_cancellation_atomic"')
    expect(edgeRouter).toContain('jobs.workerCancellation')
    // The admin decide endpoint was removed once cancellation became auto-approved:
    // the RPC survives in migration history, the Edge surface must not re-expose it.
    expect(edgeRouter).not.toContain('workerCancellation.decide')
  })

  it('adds service-role Kael chat persistence and confirm RPC for the Kael-first workflow', () => {
    const edgeServices = readEdgeServiceLayer()
    const edgeRouter = readEdgeRouterLayer()
    const mobileApiTypes = read('apps/mobile/lib/api-types.ts')
    const edgeContracts = read('supabase/functions/_shared/contracts.ts')
    const sharedTypes = read('packages/shared/src/types/api-responses.ts')

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
    const edgeServices = readEdgeServiceLayer()
    // JOB_NOT_CANCELLABLE is raised only by decide_worker_cancellation_atomic. That RPC lost its
    // Edge caller when the admin decide endpoint was removed, so no Edge mapper may claim to
    // handle it — a mapper here again would mean the endpoint came back.
    expect(edgeServices + read('supabase/functions/mobile-api/_shared/platform/domain-error-mappers.ts')).not.toContain(
      'JOB_NOT_CANCELLABLE',
    )
  })

  it('auto-approves worker cancellation for immediate replacement without rating penalty', () => {
    const edgeServices = readEdgeServiceLayer()
    expect(edgeServices).toContain('notifyCustomerWorkerReplacementSearch')
    expect(edgeServices + read('supabase/functions/mobile-api/_shared/domains/notification/notifications.ts')).toContain('worker_replacement_search')
    expect(edgeServices + read('supabase/functions/mobile-api/_shared/domains/notification/notifications.ts')).toContain('broadcast_sent: broadcastSent')
  })

  it('adds Phase 3 geo matching schema, Maps proxy, and auto-suspend without rating penalty', () => {
    const edgeServices = readEdgeServiceLayer()
    const edgeRouter = readEdgeRouterLayer()
    const mobileServices = read('apps/mobile/lib/services.ts')
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
    const edgeServices = readEdgeServiceLayer()
    const edgeKaelModules = readEdgeKaelModules()
    const sharedTypes = readGeneratedDatabaseTypes()
    expect(edgeKaelModules).toContain('classifyWorkerCancellationReason')
    expect(edgeKaelModules).toContain('detectWorkerNoShow')
    expect(edgeKaelModules).toContain('recordWorkerCancellationReview')
    expect(edgeServices).toContain('classifyWorkerCancellationReason')
    expect(edgeServices + read('supabase/functions/mobile-api/_shared/domains/worker/cancellation.ts')).toContain('fallback_options')
    expect(edgeServices + read('supabase/functions/mobile-api/_shared/domains/worker/cancellation.ts')).toContain('admin_review_required')
    expect(sharedTypes).toContain('worker_cancellation_reason_taxonomy')
    expect(sharedTypes).toContain('fallback_options: Json')
  })

  it('adds P12 customer cancellation taxonomy, after-accept RPC, and Phase 0 review controls', () => {
    const edgeServices = readEdgeServiceLayer()
    const edgeRouter = readEdgeRouterLayer()
    const edgeContracts = readEdgeContracts()
    const edgeKaelModules = readEdgeKaelModules()
    const sharedTypes = readGeneratedDatabaseTypes()
    const mobileServices = read('apps/mobile/lib/services.ts')
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
    const edgeServices = readEdgeServiceLayer()
    const edgeRouter = readEdgeRouterLayer()
    const edgeContracts = readEdgeContracts()
    const edgeKaelModules = readEdgeKaelModules()
    const sharedTypes = readGeneratedDatabaseTypes()
    const mobileServices = read('apps/mobile/lib/services.ts')
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
    const chatSource = read('supabase/functions/mobile-api/_shared/domains/job/chat.ts')
    const chatSupport = read('supabase/functions/mobile-api/_shared/domains/job/chat-support.ts')
    const guardStart = chatSupport.indexOf('async function recordWorkerDisintermediationRisk')
    const guardEnd = chatSupport.indexOf('export async function maybeHandleDemandingCustomerJobChat')
    const guardBlock = chatSupport.slice(guardStart, guardEnd)
    expect(chatSource).toContain('evaluateJobChatContactGuard')
    expect(chatSource).toContain('maybeHandleJobChatContactGuard')
    expect(chatSupport).toContain('recordWorkerDisintermediationRisk')
    expect(guardBlock).toContain('record_worker_disintermediation_memory_atomic')
  })

  it('adds Section 32 apartment access staged release without worker-side exact unit leakage', () => {
    const edgeServices = readEdgeServiceLayer()
    const edgeRouter = readEdgeRouterLayer()
    const mobileProvider = readMobileFrontendWorkflowLayer()
    const workerSurface = listEdgeServiceFiles('apps/mobile/components/worker')
      .filter((p) => /\.tsx?$/.test(p) && !p.includes('/__tests__/'))
      .sort()
      .map(read)
      .join('\n')
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

  it('locks Section 32 LLM boundary to edge phrasing while decisions stay deterministic', () => {
    const boundaryContract = read('supabase/functions/mobile-api/_shared/kael/contracts/ai-boundary-contract.ts')
    const workerAssist = read('supabase/functions/mobile-api/_shared/kael/agents/worker-assist.ts')
    const workerAssistGuard = read('supabase/functions/mobile-api/_shared/kael/agents/worker-assist-guard.ts')
    const demanding = read('supabase/functions/mobile-api/_shared/kael/agents/agentic/case-2-demanding.ts')
    const workerCancel = read('supabase/functions/mobile-api/_shared/kael/agents/agentic/case-3-worker-cancel.ts')
    const customerCancel = read('supabase/functions/mobile-api/_shared/kael/agents/agentic/case-4-customer-cancel.ts')
    const dispute = read('supabase/functions/mobile-api/_shared/kael/agents/agentic/case-5-dispute.ts')
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
    expect(services).toContain('validateKaelAutonomyTransition')
    expect(services + read('supabase/functions/mobile-api/_shared/domains/dispute/dispute.ts')).toContain('open_dispute_atomic')
    expect(services + read('supabase/functions/mobile-api/_shared/domains/customer/cancellation.ts')).toContain('request_customer_cancellation_atomic')
    expect(services + read('supabase/functions/mobile-api/_shared/domains/worker/cancellation.ts')).toContain('request_worker_cancellation_atomic')
  })

  it('locks scope-change lifecycle rows and returns explicit race errors', () => {
    const edgeServices = readEdgeServiceLayer()
    expect(edgeServices).toContain('current_scope_change')
    expect(edgeServices).toContain('getCurrentScopeChange')
  })

  it('keeps PR#29 scope-change money path atomic and Kael-owned', () => {
    const edgeServices = readEdgeServiceLayer()
    expect(edgeServices).toContain('kael_scope_review_computed')
    expect(edgeServices).toContain('scope_change_notified')
    expect(edgeServices).toContain('scope_change_final_price_locked')
    expect(edgeServices).not.toContain('applyKaelLockedPriceFromScopeChange')
    expect(edgeServices).not.toContain('failed to update jobs.final_price')
    expect(edgeServices).not.toContain('failed to lock Kael price baseline')
  })

  it('resumes the agreed work when a customer rejects a scope-change request', () => {
    const edgeServices = readEdgeServiceLayer()
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

  it('pins the production project identity and mismatch failure path', () => {
    const environmentGuard = read('supabase/functions/_shared/harness/environment.ts')

    expect(environmentGuard).toContain('HARNESS_PRODUCTION_PROJECT_REF = "iwevizmsedyqozxlawwl"')
    expect(environmentGuard).toContain('PRODUCTION_PROJECT_MISMATCH')
  })
})
