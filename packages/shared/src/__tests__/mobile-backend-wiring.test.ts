import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const ROOT = resolve(__dirname, '../../../../')
const MOBILE_ROOT = resolve(ROOT, 'apps/mobile')
const read = (rel: string) => readFileSync(resolve(MOBILE_ROOT, rel), 'utf-8')
const readRoot = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8')

describe('React Native backend wiring targets Supabase Edge mobile-api', () => {
  it('keeps mobile service paths on the Edge function contract, not Next /api routes', () => {
    const services = read('lib/services.ts')
    const api = read('lib/api.ts')
    const apiTypes = read('lib/api-types.ts')
    const provider = read('lib/frontend-workflow-provider.tsx')

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
    expect(edgeKaelPipeline).toContain('const learnedPrice = await applyLearnedPriceRule')
    expect(edgeKaelPipeline).toContain('baselineMin: learnedPrice?.priceMin ?? baselineResult.priceMin')
  })

  it('keeps mobile config publishable-only and away from hosted Next fallbacks', () => {
    const appConfig = read('app.config.ts')
    const api = read('lib/api.ts')
    const services = read('lib/services.ts')
    const provider = read('lib/frontend-workflow-provider.tsx')

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
    const provider = read('lib/frontend-workflow-provider.tsx')
    const bookingRoute = read('app/(customer)/booking.tsx')
    const customer = read('components/customer/customer-surfaces.tsx')
    const worker = read('components/worker/worker-surfaces.tsx')

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
      // Phase 2.1 (plan §22.7.C, 2026-05-23): chat surfaces call
      // jobService.listMessages and jobService.sendMessage directly because
      // chat is dispute evidence and the workflow provider doesn't need to
      // own each message. Workflow writes still flow through actions.*.
      expect(ui).not.toMatch(/jobService\.(?!listMessages|sendMessage|attachJobMedia|createJob|requestScopeChange|confirmSearch|updateStatus)/)
      expect(ui).not.toContain('workerService.')
      expect(ui).not.toContain('supabase.')
    }

    expect(bookingRoute).toContain('CustomerBookingEntrySurface')
    expect(bookingRoute).not.toContain('ClientPriceCheckFlow')
    // Phase 1.3 (plan §22.6.D, 2026-05-23): inline customer scope-change
    // decide buttons removed; the hard-stop modal owns the decision callsite.
    expect(customer).not.toContain('customer-scope-change-decision')
    expect(customer).toContain('actions.customerConfirmCompletion')
    expect(customer).toContain('actions.decideScopeChange')
    expect(worker).toContain('actions.workerAcceptBroadcast')
    expect(worker).toContain('actions.workerDeclineBroadcast')
    expect(worker).toContain('actions.workerUpdateStatus')
    expect(worker).toContain('actions.workerUpdateAvailability')
    expect(worker).toContain('actions.workerSubmitRegistration')
    expect(worker).toContain('uploadWorkerVerificationDrafts')
    expect(worker).toContain('actions.requestScopeChange')
    expect(worker).toContain('worker-scope-change-request')
  })

  it('stores worker verification uploads as private Supabase storage refs, not public URLs', () => {
    const mediaUpload = read('lib/media-upload.ts')

    expect(mediaUpload).toContain("from('worker-verification').upload")
    expect(mediaUpload).toContain('supabase://worker-verification/${objectPath}')
    expect(mediaUpload).not.toContain("from('worker-verification').getPublicUrl")
  })

  it('carries active scope-change details from job detail into customer decision UI', () => {
    const apiTypes = read('lib/api-types.ts')
    const provider = read('lib/frontend-workflow-provider.tsx')
    const customer = read('components/customer/customer-surfaces.tsx')
    const worker = read('components/worker/worker-surfaces.tsx')

    expect(apiTypes).toContain('current_scope_change')
    expect(apiTypes).toContain('kael_computed_min')
    expect(apiTypes).toContain('kael_computed_max')
    expect(apiTypes).toContain('evidence_photo_urls')
    expect(provider).toContain('scopeChangeFromJobDetail')
    expect(provider).toContain('data.current_scope_change')
    expect(provider).toContain('evidencePhotoUrls: scope.evidence_photo_urls')
    expect(customer).toContain('scopeChange.requestedDescription ?? copy.history.needsConfirm')
    // Phase 1.3 (plan §22.6.D, 2026-05-23): A11 decision callsite consolidated
    // into the hard-stop modal. Phase 2.0 (plan §22.7.B): worker no longer
    // submits price for scope change — Kael computes it server-side.
    expect(customer).toContain("actions.decideScopeChange(scopeChange.id, { decision: 'approve' })")
    expect(worker).not.toContain('new_price_min')
    expect(worker).not.toContain('new_price_max')
    expect(worker).toContain('scopeReasonDraft')
  })

  it('polls remote workflow state without overwriting explicit no-worker fallback', () => {
    const provider = read('lib/frontend-workflow-provider.tsx')

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

  it('keeps visible mobile copy away from backend and server implementation language', () => {
    const visibleSources = [
      read('app/(customer)/booking.tsx'),
      read('components/customer/customer-surfaces.tsx'),
      read('components/worker/worker-surfaces.tsx'),
      read('lib/api.ts'),
      read('lib/frontend-workflow-provider.tsx'),
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
