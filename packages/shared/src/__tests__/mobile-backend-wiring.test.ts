import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '../../../../')
const MOBILE_ROOT = resolve(ROOT, 'apps/mobile')
const EDGE_SHARED_ROOT = resolve(ROOT, 'supabase/functions/mobile-api/_shared')
const read = (rel: string) => readFileSync(resolve(MOBILE_ROOT, rel), 'utf-8').replace(/\r\n/g, '\n')
const readRoot = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8').replace(/\r\n/g, '\n')
const readEdgeShared = (rel: string) => readFileSync(resolve(EDGE_SHARED_ROOT, rel), 'utf-8').replace(/\r\n/g, '\n')

// The Edge service layer is the services.ts factory plus the per-domain modules under
// services/, so source-string assertions read the whole concatenated layer — otherwise a grep
// silently misses code that moved into a module.
const listEdgeServiceFiles = (relDir: string): string[] =>
  readdirSync(resolve(EDGE_SHARED_ROOT, relDir), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listEdgeServiceFiles(`${relDir}/${entry.name}`) : [`${relDir}/${entry.name}`],
  )
const readEdgeServiceLayer = () =>
  [
    readEdgeShared('services.ts'),
    ...listEdgeServiceFiles('services')
      .filter((p) => p.endsWith('.ts'))
      .sort()
      .map(readEdgeShared),
  ].join('\n')

// The worker surface layer is worker-surfaces.tsx plus the modules split out of it (constants,
// styles, ...), so source-string assertions read the whole concatenated layer (C4 staged split).
const listMobileFiles = (relDir: string): string[] =>
  readdirSync(resolve(MOBILE_ROOT, relDir), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listMobileFiles(`${relDir}/${entry.name}`) : [`${relDir}/${entry.name}`],
  )
const readApiTypesLayer = () =>
  [
    read('lib/api-types.ts'),
    ...listMobileFiles('lib/api-types')
      .filter((p) => p.endsWith('.ts'))
      .sort()
      .map(read),
  ].join('\n')
const readFrontendWorkflowLayer = () =>
  [
    read('lib/frontend-workflow-provider.tsx'),
    ...listMobileFiles('lib/frontend-workflow')
      .filter((p) => /\.tsx?$/.test(p))
      .sort()
      .map(read),
  ].join('\n')
const readWorkerSurfaceLayer = () =>
  listMobileFiles('components/worker')
    .filter((p) => /\.tsx?$/.test(p) && !p.replace(/\\/g, '/').includes('/__tests__/'))
    .sort()
    .map(read)
    .join('\n')

// The customer surface layer is customer-surfaces.tsx plus the active PR72/V21 modules.
const readCustomerSurfaceLayer = () =>
  [
    read('components/customer/customer-surfaces.tsx'),
    ...listMobileFiles('components/customer/v21')
      .filter((p) => /\.tsx?$/.test(p))
      .sort()
      .map(read),
  ].join('\n')

describe('React Native backend wiring targets Supabase Edge mobile-api', () => {
  it('keeps mobile service paths on the Edge function contract, not Next /api routes', () => {
    const services = read('lib/services.ts')
    const api = read('lib/api.ts')
    const apiTypes = readApiTypesLayer()
    const provider = readFrontendWorkflowLayer()

    expect(services).not.toContain("'/api/")
    expect(services).not.toContain('`/api/')
    expect(api).toContain("replace(/\\/+$/, '')")
    expect(api).toContain('MOBILE_API_BASE_PATH')
    expect(api).toContain('CONFIG_INVALID')
    expect(api).toContain('Đường kết nối chưa đúng')
    expect(api).toContain('headers.apikey = SUPABASE_PUBLISHABLE_KEY')
    expect(apiTypes).toContain('broadcast_sent: boolean')
    expect(apiTypes).toContain('broadcast_state')
    expect(provider).toContain('confirmed.data.broadcast_sent')
    expect(provider).toContain('data.broadcast_state')

    for (const path of [
      "'/services'",
      "'/places/autocomplete'",
      "'/jobs'",
      '`/jobs/${jobId}`',
      '`/jobs/${jobId}/confirm-search`',
      '`/jobs/${jobId}/cancel`',
      '`/jobs/${jobId}/accept`',
      '`/jobs/${jobId}/decline`',
      '`/jobs/${jobId}/status`',
      '`/jobs/${jobId}/scope-change`',
      '`/scope-changes/${scopeChangeId}/decide`',
      '`/jobs/${jobId}/confirm-completion`',
      '`/jobs/${jobId}/review`',
      "'/workers/register'",
      "'/workers/me'",
      "'/workers/me/availability'",
      "'/workers/me/broadcasts'",
      "'/workers/me/jobs'",
      '`/workers/me/earnings?${params.toString()}`',
    ]) {
      expect(services).toContain(path)
    }

    expect(services).toContain('export const workerService')
  })

  it('preserves HTTP error status when Edge responses are not JSON', () => {
    const api = read('lib/api.ts')

    expect(api).toContain('const responseText = await response.text()')
    expect(api).toContain('safeParseJsonObject(responseText)')
    expect(api).toContain('`HTTP_${response.status}`')
    expect(api).toContain('function isAbortError')
    expect(api).not.toContain('instanceof DOMException')
    expect(api).not.toContain('await response.json()')
  })

  it('uses bounded retries for transient mobile-api failures only', () => {
    const api = read('lib/api.ts')

    expect(api).toContain('const MAX_RETRIES = 2')
    expect(api).toContain('const BASE_RETRY_DELAY_MS = 500')
    expect(api).toContain('for (let attempt = 0; attempt <= MAX_RETRIES; attempt++)')
    expect(api).toContain('const retryBudget = isRetrySafeRequest(method, path) ? MAX_RETRIES : 0')
    expect(api).toContain('shouldRetryResponse(response.status)')
    expect(api).toContain('shouldRetryError(err)')
    expect(api).toContain('await waitForRetry(method, path, attempt,')
    expect(api).toContain('function isRetrySafeRequest(method: string, path: string)')
    expect(api).toContain('function shouldRetryResponse(status: number)')
    expect(api).toContain('return status === 408 || status === 425 || status === 429 || status >= 500')
    expect(api).toContain('function shouldRetryError(err: unknown)')
    expect(api).not.toContain('status >= 400')
  })

  it('applies learned Kael price and complexity rules inside the deployed Edge runtime', () => {
    const edgeKael = readRoot('supabase/functions/mobile-api/_shared/kael.ts')
    const edgeKaelTypes = readRoot('supabase/functions/mobile-api/_shared/kael/types.ts')
    const edgeKaelLearning = readRoot('supabase/functions/mobile-api/_shared/kael/learning.ts')
    const edgeKaelPipeline = readRoot('supabase/functions/mobile-api/_shared/kael/pipeline.ts')
    const edgeEnv = readRoot('supabase/functions/mobile-api/_shared/env.ts')

    expect(edgeEnv).toContain('learningEnabled')
    expect(edgeEnv).toContain('LEARNING_ENABLED')
    expect(edgeEnv).toContain('VIETMAP_API_KEY')
    expect(edgeEnv).toContain('getEnv("GOOGLE_MAPS_API_KEY") ?? getEnv("GOOGLE_MAP_KEY")')

    expect(edgeKael).toContain('export * from "./kael/index.ts"')
    expect(edgeKaelTypes).toContain('vietmapApiKey?: string')
    expect(edgeKaelTypes).toContain('learningEnabled?: boolean')
    expect(edgeKaelLearning).toContain('function applyLearnedComplexityRule')
    expect(edgeKaelLearning).toContain('function applyLearnedPriceRule')
    expect(edgeKaelLearning).toContain('.from("learning_rules")')
    expect(edgeKaelLearning).toContain('.eq("rule_type", "analysis_rule")')
    expect(edgeKaelLearning).toContain('.eq("rule_type", "price_prior_update")')
    expect(edgeKaelPipeline).toContain('const learnedComplexity = await applyLearnedComplexityRule')
    expect(edgeKaelPipeline).toContain('const effectiveComplexity = learnedComplexity?.newComplexity ??')
    // Learned price is clamped against the baseline band before it feeds price synthesis.
    expect(edgeKaelLearning).toContain('export function clampLearnedPriceToBaseline')
    expect(edgeKaelPipeline).toContain('clampLearnedPriceToBaseline(')
    expect(edgeKaelPipeline).toContain('await applyLearnedPriceRule(')
    expect(edgeKaelPipeline).toContain('baselineMin: learnedPrice?.priceMin ?? baselineResult.priceMin')
  })

  it('keeps mobile config publishable-only and away from hosted Next fallbacks', () => {
    const appConfig = read('app.config.ts')
    const api = read('lib/api.ts')
    const services = read('lib/services.ts')
    const provider = readFrontendWorkflowLayer()

    expect(appConfig).toContain("fromEnv('EXPO_PUBLIC_SUPABASE_URL')")
    expect(appConfig).toContain("fromEnv('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY')")
    expect(appConfig).toContain("fromEnv('EXPO_PUBLIC_API_BASE_URL')")
    expect(appConfig).not.toContain('NEXT_PUBLIC')
    expect(appConfig).not.toContain('SERVICE_ROLE')
    expect(appConfig).not.toContain('SECRET_KEY')
    expect(appConfig).not.toContain('ANTHROPIC_API_KEY')
    expect(appConfig).not.toContain('PERPLEXITY_API_KEY')
    expect(appConfig).not.toContain('DEEPSEEK_API_KEY')

    expect(api).toContain('headers.apikey = SUPABASE_PUBLISHABLE_KEY')
    expect(api).toContain("headers['Authorization'] = `Bearer ${token}`")
    expect(api).not.toContain('SERVICE_ROLE')
    expect(api).not.toContain('SECRET_KEY')

    for (const source of [services, provider]) {
      expect(source).not.toContain('SERVICE_ROLE')
      expect(source).not.toContain('ANTHROPIC_API_KEY')
      expect(source).not.toContain('PERPLEXITY_API_KEY')
      expect(source).not.toContain('DEEPSEEK_API_KEY')
    }
  })

  it('keeps UI components behind the workflow provider instead of direct backend calls', () => {
    const provider = readFrontendWorkflowLayer()
    const bookingRoute = read('app/(customer)/booking.tsx')
    const customer = readCustomerSurfaceLayer()
    const worker = readWorkerSurfaceLayer()

    expect(provider).toContain('createRemoteJobFromDraft')
    expect(provider).toContain('confirmRemoteSearch')
    expect(provider).toContain('cancelRemoteJob')
    expect(provider).toContain('workerAcceptBroadcast')
    expect(provider).toContain('workerUpdateStatus')
    expect(provider).toContain('workerUpdateAvailability')
    expect(provider).toContain('customerConfirmCompletion')
    expect(provider).toContain('submitReview')
    expect(provider).toContain('requestScopeChange')
    expect(provider).toContain('decideScopeChange')
    expect(provider).toContain('jobService.createJob')
    expect(provider).toContain('extractKnownDistrictLabel')
    expect(provider).toContain('address_district: districtLabel')
    expect(provider).toContain('workerService.getBroadcasts')
    expect(provider).toContain('workerService.register')
    expect(provider).toContain('workerService.updateAvailability')
    expect(provider).toContain("role !== 'worker' && role !== 'admin'")
    expect(provider).toContain("role !== 'customer' && role !== 'admin'")
    expect(provider).toContain('await workerRefresh()')

    for (const ui of [bookingRoute, customer, worker]) {
      expect(ui).not.toContain('fetch(')
      // Chat surfaces can call jobService list/send directly because chat is dispute
      // evidence; workflow writes still flow through actions.*.
      expect(ui).not.toMatch(/jobService\.(?!listMessages|sendMessage|attachJobMedia|createJob|requestScopeChange|confirmSearch|updateStatus)/)
      expect(ui).not.toContain('workerService.')
      expect(ui).not.toContain('supabase.')
    }

    expect(bookingRoute).toContain('CustomerBookingEntrySurface')
    expect(bookingRoute).not.toContain('ClientPriceCheckFlow')
    // Inline customer scope-change decide buttons stay removed; the hard-stop modal
    // owns the decision callsite.
    expect(customer).not.toContain('customer-scope-change-decision')
    expect(customer).toContain('actions.customerConfirmCompletion')
    expect(customer).toContain('CompletionReviewCard')
    expect(customer).toContain('actions.decideScopeChange')
    expect(worker).toContain('actions.workerAcceptBroadcast')
    expect(worker).toContain('actions.workerDeclineBroadcast')
    expect(worker).toContain('actions.workerUpdateStatus')
    expect(worker).toContain('actions.workerUpdateAvailability')
    expect(provider).toContain('workerSubmitRegistration')
    expect(worker).toContain('worker-v5-verification-hero')
    expect(worker).toContain('worker-v5-verification-checklist')
    expect(worker).toContain('actions.requestScopeChange')
    expect(worker).toContain('worker-scope-change-evidence-form')
    expect(worker).toContain('worker-v5-scope-change-send-action')
  })

  it('stores worker verification uploads as private Supabase storage refs, not public URLs', () => {
    const mediaUpload = read('lib/media-upload.ts')

    expect(mediaUpload).toContain("from('worker-verification').upload")
    expect(mediaUpload).toContain('supabase://worker-verification/${objectPath}')
    expect(mediaUpload).not.toContain("from('worker-verification').getPublicUrl")
  })

  it('carries active scope-change details from job detail into Kael decision UI', () => {
    const apiTypes = readApiTypesLayer()
    const provider = readFrontendWorkflowLayer()
    const customer = readCustomerSurfaceLayer()
    const worker = readWorkerSurfaceLayer()

    expect(apiTypes).toContain('current_scope_change')
    expect(apiTypes).toContain('kael_computed_min')
    expect(apiTypes).toContain('kael_computed_max')
    expect(apiTypes).toContain('evidence_photo_urls')
    expect(provider).toContain('scopeChangeFromJobDetail')
    expect(provider).toContain('data.current_scope_change')
    expect(provider).toContain('evidencePhotoUrls: scope.evidence_photo_urls')
    expect(customer).toContain('scopeChange?.requestedDescription ?? copy.dataPending')
    // The hard-stop modal owns the decision callsite, and workers no longer submit
    // scope-change prices because Kael computes them server-side.
    expect(customer).toContain("workflow.actions.decideScopeChange(scopeChange.id, { decision })")
    expect(worker).not.toContain('new_price_min')
    expect(worker).not.toContain('new_price_max')
    expect(worker).toContain('scopeReason')
    expect(worker).toContain("uploadJobMediaDrafts(jobId, scopeMediaDrafts, 'scope_change_evidence')")
    expect(worker).toContain('worker-v5-scope-change-send-action')
  })

  it('polls remote workflow state without overwriting explicit no-worker fallback', () => {
    const provider = readFrontendWorkflowLayer()

    expect(provider).toContain('if (isAppForeground()) void workerRefresh()')
    expect(provider).toContain('if (isAppForeground()) void refreshCurrentJob()')
    expect(provider).toContain('AppState.currentState')
    expect(provider).toContain("customerBroadcast?.status === 'expired'")
    expect(provider).toContain("broadcastState?.active_count === 0")
    expect(provider).toContain('const currentJobId = getRemoteJobId(stateRef.current)')
    expect(provider).toContain('jobs.data.jobs.find((job) => job.id === currentJobId)')
    expect(provider).toContain('isWorkerOperationalJobStatus(job.status)')
    expect(provider).toContain('hasStaleRemoteBroadcast(stateRef.current)')
    expect(provider).toContain("dispatch({ type: 'mark_remote_broadcast_expired' })")
    expect(provider).toContain('isStaleBroadcastError')
    expect(provider).not.toContain("job.status !== 'cancelled' && job.status !== 'reviewed'")

    const operationalStatusSet = provider.match(/WORKER_OPERATIONAL_JOB_STATUSES = new Set<JobStatus>\(\[([\s\S]*?)\]\)/)?.[1] ?? ''
    expect(operationalStatusSet).toContain("'completed_by_worker'")
    expect(operationalStatusSet).not.toContain("'confirmed_by_customer'")
    expect(operationalStatusSet).not.toContain("'payment_pending'")
    expect(operationalStatusSet).not.toContain("'paid'")
  })

  it('keeps customer active hydration alive through completion and payment gates without treating paid jobs as active', () => {
    const services = readEdgeServiceLayer()
    const customerActiveStatusSet = services.match(/CUSTOMER_ACTIVE_JOB_STATUSES: JobStatus\[] = \[([\s\S]*?)\]/)?.[1] ?? ''
    expect(customerActiveStatusSet).toContain('worker_candidate_pending')

    expect(customerActiveStatusSet).toContain('"completed_by_worker"')
    expect(customerActiveStatusSet).toContain('"confirmed_by_customer"')
    expect(customerActiveStatusSet).toContain('"payment_pending"')
    expect(customerActiveStatusSet).not.toContain('"paid"')
    expect(customerActiveStatusSet).not.toContain('"reviewed"')
    expect(customerActiveStatusSet).not.toContain('"cancelled"')
  })

  it('nudges the customer to authorize unit access when the worker checks in (X-2)', () => {
    const services = readEdgeServiceLayer()

    // Helper exists and carries the actionable "Cho thợ lên" copy + its own event type.
    expect(services).toContain('async function notifyCustomerWorkerCheckedIn(')
    expect(services).toContain('worker_checked_in_awaiting_authorization')
    expect(services).toContain('Cho thợ lên')

    // Invoked from the worker status-update path, gated on the lobby check-in release
    // stage (not on every status change), so the customer is prompted only when an
    // authorize action is actually pending.
    expect(services).toContain('notifyCustomerWorkerCheckedIn(\n      client')
    expect(services).toContain('checked_in_awaiting_customer_authorization')
  })

  it('keeps visible mobile copy away from backend and server implementation language', () => {
    const visibleSources = [
      read('app/(customer)/booking.tsx'),
      read('components/customer/customer-surfaces.tsx'),
      readWorkerSurfaceLayer(),
      read('lib/api.ts'),
      readFrontendWorkflowLayer(),
    ].join('\n')

    for (const forbidden of [
      'Cần backend',
      'job backend',
      'Broadcast backend',
      'Worker audit',
      'Backend pending',
      'backend đang',
      'Dia chi can',
      'Job đã',
      'server',
      'Server',
    ]) {
      expect(visibleSources).not.toContain(forbidden)
    }
  })
})
