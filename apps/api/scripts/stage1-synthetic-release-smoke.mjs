#!/usr/bin/env node
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

import { checkHarnessRelease, resolveReleaseArtifactPath } from '../../../scripts/harness/release-bundle.mjs'
import { assertReleaseTarget } from '../../../scripts/harness/release-safety.mjs'
import { verifyMobileBinaryAttestation } from '../../../scripts/harness/mobile-binary-attestation.mjs'
import {
  assertResponseIdentity,
  assertSafeErrorEvidence,
  assertScenarioReady,
  buildSyntheticSmokeObservation,
  buildSyntheticSmokeReceipt,
  isSyntheticActorPresentationSafe,
  isReleaseConvergenceRetry,
  pollUntil,
  priceEvidenceHasQuorum,
} from './lib/stage1-synthetic-smoke-core.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const PROFILE_BY_SERVICE = Object.freeze({
  electrical: 'electric_diagnose',
  plumbing: 'water_diagnose',
  cleaning: 'clean_scope',
  hvac: 'air_scope',
  upholstery: 'fabric_scope',
  handyman: 'task_scope',
})
const AUTO_QUOTE_SMOKE_PRIORITY = Object.freeze([
  'install_device',
  'pipe_leak',
  'standard_home_cleaning',
  'routine_hvac_cleaning',
  'sofa_cleaning',
  'replace_cabinet_hinges',
  'repair_hinge_or_handle',
])
const CUSTOMER_PRESENTATION_NAME = 'Khách hàng NestScout'
const WORKER_PRESENTATION_NAME = 'Đối tác NestScout'

export class Stage1SyntheticReleaseSmoke {
  constructor(config) {
    this.config = config
    this.admin = createClient(config.projectUrl, config.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    this.traceIds = new Set()
    this.errorResponses = 0
    this.safeErrorResponses = 0
    this.safeErrorEvidence = []
    this.confirmLatencies = []
    this.offerLatencies = []
    this.duplicateJobCount = 0
    this.duplicateBroadcastCount = 0
    this.cleanupCompleted = false
    this.cleanupProofs = []
    this.actorIds = null
    this.results = []
    this.currentStage = 'initialized'
  }

  async run() {
    this.currentStage = 'signing_in_actors'
    const actors = await this.signInActors()
    this.actorIds = { customerId: actors.customer.id, workerId: actors.worker.id }
    this.currentStage = 'normalizing_actor_presentation'
    await this.normalizeSyntheticActorPresentation(actors)
    this.currentStage = 'checking_release_mismatch'
    await this.assertReleaseMismatch(actors.customer)
    this.currentStage = 'checking_role_boundary'
    await this.assertRoleBoundary(actors.worker)
    this.currentStage = 'binding_permanent_cohort'
    await this.preparePermanentCohort()
    this.currentStage = 'loading_worker_and_policies'
    const worker = await this.loadEligibleWorker(actors.worker.id)
    const policies = await this.selectScenarioPolicies(worker.serviceTypes, worker.capabilities)

    this.currentStage = 'running_auto_quote'
    const auto = await this.runScenario({
      actors,
      district: worker.district,
      expectedMode: 'kael_auto_quote',
      policy: policies.autoQuote,
      recoverAfterConfirm: false,
      autonomousAfterConfirm: true,
    })
    this.currentStage = 'verifying_auto_quote_isolation'
    await this.verifyIsolation()
    this.currentStage = 'cleaning_auto_quote_cohort'
    await this.cleanupCohort()

    this.currentStage = 'rebinding_rfq_cohort'
    await this.bindCohort()
    this.currentStage = 'running_rfq_or_inspection'
    const unpriced = await this.runScenario({
      actors,
      district: worker.district,
      expectedMode: policies.unpriced.quote_mode,
      policy: policies.unpriced,
      recoverAfterConfirm: true,
      autonomousAfterConfirm: false,
    })
    this.currentStage = 'verifying_rfq_isolation'
    const isolation = await this.verifyIsolation()
    this.currentStage = 'cleaning_rfq_cohort'
    await this.cleanupCohort()
    this.cleanupCompleted = true
    this.currentStage = 'building_observation'

    const observation = buildSyntheticSmokeObservation({
      releaseId: this.config.release.releaseId,
      environment: this.config.environment,
      cohortId: this.config.cohortId,
      runId: this.config.runId,
      sequence: this.config.sequence,
      scenarios: { autoQuote: true, rfqOrInspection: true, recovery: true },
      releaseIdentityMatch: true,
      terminalReconcilePassed: auto.terminal && unpriced.terminal,
      syntheticLeakCount: isolation.real_surface_leak_count + isolation.analytics_leak_count,
      duplicateJobCount: this.duplicateJobCount,
      duplicateBroadcastCount: this.duplicateBroadcastCount,
      safeErrorCodeRatio: this.errorResponses === 0 ? 0 : this.safeErrorResponses / this.errorResponses,
      confirmAcceptanceMs: Math.max(...this.confirmLatencies),
      workerOfferVisibleMs: Math.max(...this.offerLatencies),
      supportTraceCount: this.traceIds.size,
    })
    const receipt = this.config.environment === 'production'
      ? buildSyntheticSmokeReceipt(observation)
      : null
    return {
      status: 'passed',
      observation,
      receipt,
      evidence: {
        scenarios: this.results,
        isolation: summarizeIsolation(isolation),
        cleanupCompleted: this.cleanupCompleted,
        cleanupProofs: this.cleanupProofs,
        syntheticActorPresentationSafe: true,
        safeErrors: this.safeErrorEvidence,
        traceCount: this.traceIds.size,
      },
    }
  }

  async signInActors() {
    const customer = await this.signIn('customer', this.config.customer)
    const worker = await this.signIn('worker', this.config.worker)
    return { customer, worker }
  }

  async signIn(role, credentials) {
    const client = createClient(this.config.projectUrl, this.config.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await client.auth.signInWithPassword(credentials)
    if (error || !data.user || !data.session?.access_token) {
      throw new Error(`dedicated synthetic ${role} could not authenticate`)
    }
    return { id: data.user.id, email: data.user.email?.toLowerCase() ?? '', accessToken: data.session.access_token }
  }

  async normalizeSyntheticActorPresentation(actors) {
    if (actors.customer.id === actors.worker.id ||
        actors.customer.email !== this.config.customer.email ||
        actors.worker.email !== this.config.worker.email) {
      throw new Error('synthetic actor identities do not match the dedicated credentials')
    }
    const actorSpecs = [
      { actor: actors.customer, expectedRole: 'customer', presentationName: CUSTOMER_PRESENTATION_NAME },
      { actor: actors.worker, expectedRole: 'worker', presentationName: WORKER_PRESENTATION_NAME },
    ]
    const { data: profiles, error: profileReadError } = await this.admin.from('profiles')
      .select('id,role,full_name').in('id', actorSpecs.map(({ actor }) => actor.id))
    if (profileReadError || profiles?.length !== actorSpecs.length) {
      throw new Error('dedicated synthetic profiles could not be verified before presentation normalization')
    }
    const profileById = new Map(profiles.map((profile) => [profile.id, profile]))
    for (const spec of actorSpecs) {
      const profile = profileById.get(spec.actor.id)
      if (profile?.role !== spec.expectedRole) {
        throw new Error(`dedicated synthetic ${spec.expectedRole} has an unexpected role`)
      }
      const { data: authData, error: authReadError } = await this.admin.auth.admin.getUserById(spec.actor.id)
      const authUser = authData?.user
      if (authReadError || authUser?.email?.toLowerCase() !== spec.actor.email ||
          !spec.actor.email.endsWith('@example.test')) {
        throw new Error(`dedicated synthetic ${spec.expectedRole} Auth identity is invalid`)
      }
      const userMetadata = isRecord(authUser.user_metadata) ? authUser.user_metadata : {}
      const { error: authUpdateError } = await this.admin.auth.admin.updateUserById(spec.actor.id, {
        user_metadata: { ...userMetadata, full_name: spec.presentationName, name: spec.presentationName },
      })
      if (authUpdateError) throw new Error(`synthetic ${spec.expectedRole} Auth presentation could not be normalized`)
      const { data: updatedProfiles, error: profileUpdateError } = await this.admin.from('profiles')
        .update({ full_name: spec.presentationName }).eq('id', spec.actor.id).select('id,full_name')
      if (profileUpdateError || updatedProfiles?.length !== 1 ||
          !isSyntheticActorPresentationSafe(updatedProfiles[0].full_name)) {
        throw new Error(`synthetic ${spec.expectedRole} profile presentation is not user-safe`)
      }
    }
    const { data: updatedWorkers, error: workerUpdateError } = await this.admin.from('worker_profiles')
      .update({ legal_name: WORKER_PRESENTATION_NAME }).eq('id', actors.worker.id).select('id,legal_name')
    if (workerUpdateError || updatedWorkers?.length !== 1 ||
        !isSyntheticActorPresentationSafe(updatedWorkers[0].legal_name)) {
      throw new Error('synthetic worker legal presentation is not user-safe')
    }
  }

  async loadEligibleWorker(workerId) {
    const { data, error } = await this.admin.from('worker_profiles')
      .select('id,is_approved,is_available,verification_status,service_types,selected_service_types,active_service_types,districts,problem_specializations')
      .eq('id', workerId).maybeSingle()
    if (error || !data) throw new Error('synthetic worker profile is unavailable')
    const serviceTypes = firstNonEmptyArray(data.active_service_types, data.selected_service_types, data.service_types)
    const districts = stringArray(data.districts)
    if (data.is_approved !== true || data.verification_status !== 'approved' || serviceTypes.length === 0 || districts.length === 0) {
      throw new Error('synthetic worker is not approved for a bounded service area')
    }
    return {
      serviceTypes,
      district: districts[0],
      capabilities: stringArray(data.problem_specializations),
    }
  }

  async selectScenarioPolicies(workerServices, workerCapabilities = []) {
    const { data: policies, error } = await this.admin.from('service_intake_policies')
      .select('id,service_problem_id,service_type,problem_slug,version,quote_mode,tier_a_fields,capability_requirements')
      .eq('status', 'active')
      .in('service_type', workerServices)
      .order('service_type')
      .order('problem_slug')
    if (error) throw new Error('active Stage 1 policies could not be loaded')
    const capabilitySet = new Set(workerCapabilities)
    const active = (policies ?? []).filter((policy) =>
      stringArray(policy.capability_requirements).every((capability) => capabilitySet.has(capability)))
    const autoCandidates = active.filter((policy) => policy.quote_mode === 'kael_auto_quote')
    const baselineProblemIds = autoCandidates.map((policy) => policy.service_problem_id)
    const baselineIds = new Set()
    if (baselineProblemIds.length > 0) {
      const { data: baselines, error: baselineError } = await this.admin.from('price_baseline_versions')
        .select('service_problem_id,price_min,price_max,price_evidence')
        .eq('status', 'active')
        .in('service_problem_id', baselineProblemIds)
      if (baselineError) throw new Error('governed price baselines could not be loaded')
      for (const baseline of baselines ?? []) {
        if (positiveInteger(baseline.price_min) && positiveInteger(baseline.price_max) &&
            baseline.price_max >= baseline.price_min && priceEvidenceHasQuorum(baseline.price_evidence)) {
          baselineIds.add(baseline.service_problem_id)
        }
      }
    }
    const autoQuote = AUTO_QUOTE_SMOKE_PRIORITY
      .map((slug) => autoCandidates.find((policy) =>
        policy.problem_slug === slug && baselineIds.has(policy.service_problem_id)))
      .find(Boolean) ?? autoCandidates.find((policy) => baselineIds.has(policy.service_problem_id))
    const unpriced = active.find((policy) => policy.quote_mode === 'rfq') ??
      active.find((policy) => policy.quote_mode === 'inspection_only')
    if (!autoQuote || !unpriced) {
      throw new Error('synthetic worker has no active governed auto-quote and RFQ/inspection policy pair')
    }
    return { autoQuote, unpriced }
  }

  async bindCohort() {
    const { data, error } = await this.admin.rpc('bind_synthetic_matching_cohort', {
      p_cohort_id: this.config.cohortId,
      p_customer_ids: [this.actorIds.customerId],
      p_worker_ids: [this.actorIds.workerId],
    })
    const row = data?.[0]
    if (error || row?.bound_customers !== 1 || row?.bound_workers !== 1) {
      const reason = error
        ? `${error.code ?? 'UNKNOWN'}:${error.message}`
        : `count-mismatch:${String(row?.bound_customers)}:${String(row?.bound_workers)}`
      throw new Error(`synthetic cohort binding failed closed (${reason})`)
    }
  }

  async preparePermanentCohort() {
    const actorIds = [this.actorIds.customerId, this.actorIds.workerId]
    const { data: memberships, error } = await this.admin.from('synthetic_matching_cohort_members')
      .select('cohort_id,profile_id')
      .in('profile_id', actorIds)
    if (error) throw new Error('existing synthetic actor classification could not be loaded')
    const previousCohorts = [...new Set((memberships ?? []).map((membership) => membership.cohort_id))]
    for (const cohortId of previousCohorts) await this.cleanupCohort(cohortId)
    await this.cleanupCohort(this.config.cohortId)
    await this.bindCohort()
  }

  async cleanupCohort(cohortId = this.config.cohortId) {
    const { error } = await this.admin.rpc('cleanup_synthetic_matching_cohort', {
      p_cohort_id: cohortId,
    })
    if (error) throw new Error('exact synthetic cohort cleanup failed')
    const { data: verification, error: verificationError } = await this.admin.rpc(
      'verify_synthetic_matching_cohort_cleanup',
      { p_cohort_id: cohortId },
    )
    const proof = verification?.[0]
    if (verificationError || !proof || proof.scenario_record_count !== 0 ||
        proof.active_delivery_signal_count !== 0 ||
        proof.worker_marker_count !== proof.worker_member_count) {
      throw new Error('exact synthetic cohort cleanup could not be proven')
    }
    const normalized = {
      cohortId,
      memberCount: proof.member_count,
      workerMemberCount: proof.worker_member_count,
      workerMarkerCount: proof.worker_marker_count,
      activeDeliverySignalCount: proof.active_delivery_signal_count,
      scenarioRecordCount: proof.scenario_record_count,
    }
    this.cleanupProofs.push(normalized)
    return normalized
  }

  async runScenario(input) {
    await this.api(input.actors.worker, 'POST', '/workers/me/matching-heartbeat', undefined, {
      idempotencyKey: randomUUID(),
    })
    await this.assertSafeError(input.actors.customer)
    const ready = await this.createReadySession(input.actors.customer, input.policy, input.district)
    const contract = assertScenarioReady(ready.response, input.expectedMode)
    const sessionId = ready.response.session.id
    await this.assertConfirmationMismatch(
      input.actors.customer,
      sessionId,
      input.expectedMode,
      contract.priceReasoningReceiptId,
    )
    await this.api(input.actors.worker, 'POST', '/workers/me/matching-heartbeat', undefined, {
      idempotencyKey: randomUUID(),
    })
    const acceptedAt = performance.now()
    const confirmation = await this.api(input.actors.customer, 'POST', `/kael/chat/${sessionId}/confirm`, {
      confirmation_kind: contract.confirmationKind,
      ...(contract.priceReasoningReceiptId
        ? { price_reasoning_receipt_id: contract.priceReasoningReceiptId }
        : {}),
    }, {
      discardBody: input.recoverAfterConfirm,
      expectedStatus: 202,
      idempotencyKey: `stage1-confirm-${sessionId}`,
    })
    this.confirmLatencies.push(confirmation.durationMs)

    let customerOperationReadsBeforeOffer = 0
    let recoveredOperation = null
    let jobId = confirmation.json?.job_id ?? null
    if (!input.autonomousAfterConfirm) {
      const operationPoll = await pollUntil(async () => {
        customerOperationReadsBeforeOffer += 1
        const operation = await this.api(input.actors.customer, 'GET', `/kael/chat/${sessionId}/operation`)
        return operation.json?.operation
      }, (operation) => Boolean(operation?.job_id) && [
        'matching_queued', 'broadcasting', 'candidate_ready', 'no_reachable_worker', 'recovery_required', 'official_match',
      ].includes(operation?.state), { attempts: 20, intervalMs: 250 })
      recoveredOperation = operationPoll.value
      jobId = recoveredOperation.job_id
      if (recoveredOperation.state === 'no_reachable_worker' || recoveredOperation.state === 'recovery_required') {
        throw new Error(`confirmation operation did not recover matching: ${recoveredOperation.state}`)
      }
    }
    if (!jobId) throw new Error('accepted confirmation did not expose the durable job receipt')
    if (input.autonomousAfterConfirm && customerOperationReadsBeforeOffer !== 0) {
      throw new Error('autonomous matching incorrectly depended on Customer operation polling')
    }
    if (!input.recoverAfterConfirm && recoveredOperation &&
        confirmation.json?.operation?.operation_id !== recoveredOperation.operation_id) {
      throw new Error('confirmation HTTP receipt and recovered operation do not match')
    }

    let offerPoll
    try {
      offerPoll = await pollUntil(async () => {
        await this.api(input.actors.worker, 'POST', '/workers/me/matching-heartbeat', undefined, {
          idempotencyKey: randomUUID(),
        })
        const inbox = await this.api(input.actors.worker, 'GET', '/workers/me/broadcasts')
        return (inbox.json?.broadcasts ?? []).find((offer) => offer.job_id === jobId) ?? null
      }, Boolean, { attempts: 20, intervalMs: 400 })
    } catch (error) {
      const diagnostic = await this.api(input.actors.customer, 'GET', `/kael/chat/${sessionId}/operation`)
      const state = diagnostic.json?.operation?.state ?? 'missing'
      const retryAfterMs = diagnostic.json?.operation?.retry_after_ms ?? null
      throw new Error(
        `Worker offer did not become visible; operation_state=${state}; retry_after_ms=${retryAfterMs}`,
        { cause: error },
      )
    }
    const workerOfferVisibleMs = Math.round(performance.now() - acceptedAt)
    this.offerLatencies.push(workerOfferVisibleMs)
    const offer = offerPoll.value
    if (offer.quote_mode !== input.expectedMode || !offer.delivery_receipt ||
        !['queued', 'delivered', 'seen'].includes(offer.delivery_receipt.state)) {
      throw new Error('worker inbox did not expose the durable quote mode and delivery receipt')
    }
    await this.api(input.actors.worker, 'POST', `/workers/me/broadcasts/${offer.broadcast_id}/seen`, undefined, {
      idempotencyKey: `stage1-seen-${offer.broadcast_id}`,
    })

    let candidateId
    if (input.expectedMode === 'kael_auto_quote') {
      const quoteId = offer.original_scope_price_quote?.quote_id
      if (!quoteId || offer.proposal_action !== 'accept_priced_offer') {
        throw new Error('auto-quote Worker offer is missing its governed quote receipt')
      }
      const accepted = await this.api(input.actors.worker, 'POST', `/jobs/${jobId}/accept`, {
        quote_id: quoteId,
      }, { idempotencyKey: `stage1-worker-accept-${jobId}` })
      candidateId = accepted.json?.candidate_id
    } else {
      const expectedAction = input.expectedMode === 'rfq' ? 'submit_rfq_proposal' : 'submit_inspection_scope'
      if (offer.original_scope_price_quote !== null || offer.proposal_action !== expectedAction ||
          offer.estimated_price_min !== null || offer.estimated_price_max !== null) {
        throw new Error('unpriced Worker offer leaked price or exposed the wrong proposal action')
      }
      const proposal = await this.api(input.actors.worker, 'POST', `/workers/me/broadcasts/${offer.broadcast_id}/proposal`, {
        scope_summary: 'Phạm vi synthetic đã kiểm tra để xác minh luồng báo giá và ghép thợ bền vững.',
        ...(input.expectedMode === 'rfq' ? { price_min: 180000, price_max: 260000 } : {}),
      }, { expectedStatus: 201, idempotencyKey: `stage1-proposal-${offer.broadcast_id}` })
      candidateId = proposal.json?.candidate_id
    }
    if (!candidateId) throw new Error('Worker action did not create one reviewable candidate')

    const candidate = await this.api(input.actors.customer, 'GET', `/jobs/${jobId}/candidate`)
    if (candidate.json?.candidate?.candidate_id !== candidateId) {
      throw new Error('Customer could not rehydrate the exact Worker candidate')
    }
    let official
    try {
      official = await this.api(
        input.actors.customer,
        'POST',
        `/jobs/${jobId}/candidates/${candidateId}/confirm`,
        undefined,
        { idempotencyKey: `stage1-candidate-confirm-${candidateId}` },
      )
    } catch (error) {
      const [{ data: job }, { data: persistedCandidate }] = await Promise.all([
        this.admin.from('jobs').select('status,worker_id').eq('id', jobId).maybeSingle(),
        this.admin.from('job_worker_candidates').select('status,worker_id').eq('id', candidateId).maybeSingle(),
      ])
      const sameWorker = Boolean(job?.worker_id) && job?.worker_id === persistedCandidate?.worker_id
      throw new Error(
        `${error instanceof Error ? error.message : 'candidate confirmation failed'}; ` +
        `persisted_job_status=${job?.status ?? 'missing'}; ` +
        `persisted_candidate_status=${persistedCandidate?.status ?? 'missing'}; same_worker=${sameWorker}`,
        { cause: error },
      )
    }
    if (official.json?.status !== 'worker_matched') throw new Error('Customer confirmation did not create an official match')

    const terminal = await pollUntil(async () => {
      const operation = await this.api(input.actors.customer, 'GET', `/kael/chat/${sessionId}/operation`)
      return operation.json?.operation
    }, (operation) => operation?.state === 'official_match' && operation?.terminal === true, {
      attempts: 10,
      intervalMs: 250,
    })
    const duplicates = await this.verifyNoScenarioDuplicates(sessionId, jobId, input.actors.worker.id)
    this.duplicateJobCount += duplicates.jobs
    this.duplicateBroadcastCount += duplicates.broadcasts
    const result = {
      quoteMode: input.expectedMode,
      policyVersion: contract.coverage.policy_version,
      recoveredAfterDiscardedConfirm: input.recoverAfterConfirm,
      autonomousAfterConfirm: input.autonomousAfterConfirm,
      customerOperationReadsBeforeOffer,
      confirmAcceptanceMs: confirmation.durationMs,
      workerOfferVisibleMs,
      terminal: terminal.value.state === 'official_match',
    }
    this.results.push(result)
    return result
  }

  async createReadySession(customer, policy, district) {
    const schedule = futureHcmcSchedule()
    const common = {
      service_type: policy.service_type,
      profile_id: PROFILE_BY_SERVICE[policy.service_type],
      intake_source: 'booking',
      intake_description: scenarioDescription(policy),
      message: scenarioDescription(policy),
      problem_chips: [policy.problem_slug],
      photo_urls: [],
      language: 'vi',
      address_label: 'Tòa nhà Synthetic Stage 1, Thành phố Hồ Chí Minh',
      address_district: district,
      scheduled_at: schedule.scheduledAt,
      schedule_window: schedule.window,
      client_request_id: randomUUID(),
    }
    let response = (await this.api(customer, 'POST', '/kael/chat', common, {
      idempotencyKey: common.client_request_id,
    })).json
    for (let turn = 0; turn < 6; turn += 1) {
      if (response?.session?.intake_confirmation?.status === 'pending' || response?.session?.next_action === 'confirm_intake') {
        response = (await this.api(customer, 'POST', `/kael/chat/${response.session.id}/intake-confirmation`, {
          decision: 'confirmed',
        }, { idempotencyKey: `stage1-intake-${response.session.id}` })).json
        continue
      }
      const evidenceRequest = response?.session?.diagnosis_scope?.next_action
      if (response?.session?.next_action === 'request_evidence' && evidenceRequest?.kind === 'request_evidence') {
        if (evidenceRequest.required !== false) {
          throw new Error('synthetic scenario requires real evidence and cannot be completed with fabricated media')
        }
        response = (await this.api(customer, 'POST', `/kael/chat/${response.session.id}/evidence`, {
          decision: 'skipped',
          skip_reason: 'Mô tả synthetic đã cung cấp đủ dữ kiện có cấu trúc; không tạo ảnh hoặc bằng chứng giả.',
          evidence_items: [],
          language: 'vi',
        }, { idempotencyKey: `stage1-evidence-skip-${response.session.id}` })).json
        continue
      }
      try {
        assertScenarioReady(response, policy.quote_mode)
        return { response }
      } catch (error) {
        if (response?.session?.status === 'unsupported' || response?.session?.next_action === 'blocked') throw error
      }
      response = (await this.api(customer, 'POST', `/kael/chat/${response.session.id}`, {
        message: scenarioDescription(policy, true),
        problem_chips: [policy.problem_slug],
        photo_urls: [],
        language: 'vi',
        address_label: common.address_label,
        address_district: district,
        scheduled_at: schedule.scheduledAt,
        schedule_window: schedule.window,
      }, { idempotencyKey: randomUUID() })).json
    }
    assertScenarioReady(response, policy.quote_mode)
    return { response }
  }

  async verifyNoScenarioDuplicates(sessionId, jobId, workerId) {
    const [operations, jobs, matching, broadcasts] = await Promise.all([
      this.count('confirmation_operations', (query) => query.eq('session_id', sessionId)),
      this.count('jobs', (query) => query.eq('id', jobId)),
      this.count('matching_operations', (query) => query.eq('job_id', jobId)),
      this.count('job_broadcasts', (query) => query.eq('job_id', jobId).eq('worker_id', workerId)),
    ])
    return {
      jobs: Math.max(0, operations - 1) + Math.max(0, jobs - 1),
      broadcasts: Math.max(0, matching - 1) + Math.max(0, broadcasts - 1),
    }
  }

  async count(table, scope) {
    const query = scope(this.admin.from(table).select('id', { count: 'exact', head: true }))
    const { count, error } = await query
    if (error || count === null) throw new Error(`synthetic duplicate proof failed for ${table}`)
    return count
  }

  async verifyIsolation() {
    const { data, error } = await this.admin.rpc('verify_synthetic_matching_cohort_isolation', {
      p_cohort_id: this.config.cohortId,
    })
    const row = data?.[0]
    if (error || !row || row.member_count !== 2 || row.customer_member_count !== 1 || row.worker_member_count !== 1 ||
        row.job_count !== 1 || row.session_count !== 1 || row.broadcast_count < 1 ||
        row.favorite_count !== 0 || row.admin_queue_count !== 0 || row.financial_record_count !== 0 ||
        row.real_surface_leak_count !== 0 || row.analytics_leak_count !== 0) {
      throw new Error('synthetic cohort isolation proof failed')
    }
    return row
  }

  async assertSafeError(actor) {
    await this.api(actor, 'GET', '/stage1-synthetic-intentional-not-found', undefined, {
      expectedSafeError: { status: 404, code: 'NOT_FOUND', surface: 'routing' },
    })
  }

  async assertReleaseMismatch(actor) {
    await this.api(actor, 'POST', '/kael/chat', {}, {
      expectedSafeError: { status: 426, code: 'CLIENT_UPDATE_REQUIRED', surface: 'release_mismatch' },
      headerOverrides: { 'x-client-release-id': 'harness-000000000000-000000000000' },
      idempotencyKey: randomUUID(),
    })
  }

  async assertRoleBoundary(worker) {
    await this.api(worker, 'POST', '/kael/chat', {}, {
      expectedSafeError: { status: 403, code: 'AUTH_FORBIDDEN', surface: 'worker_customer_boundary' },
      idempotencyKey: randomUUID(),
    })
  }

  async assertConfirmationMismatch(actor, sessionId, quoteMode, priceReasoningReceiptId) {
    const body = quoteMode === 'kael_auto_quote'
      ? { confirmation_kind: 'rfq_request' }
      : {
          confirmation_kind: 'priced_offer',
          price_reasoning_receipt_id: priceReasoningReceiptId ?? 'synthetic_invalid_price_receipt',
        }
    await this.api(actor, 'POST', `/kael/chat/${sessionId}/confirm`, body, {
      expectedSafeError: { status: 409, code: 'INVALID_STATUS', surface: 'confirmation_contract' },
      idempotencyKey: `stage1-invalid-confirm-${sessionId}`,
    })
    const [operations, sessions] = await Promise.all([
      this.count('confirmation_operations', (query) => query.eq('session_id', sessionId)),
      this.admin.from('kael_chat_sessions').select('job_id').eq('id', sessionId).maybeSingle(),
    ])
    if (operations !== 0 || sessions.error || sessions.data?.job_id) {
      throw new Error('rejected confirmation created durable workflow state')
    }
  }

  async api(actor, method, path, body, options = {}) {
    const started = performance.now()
    const headers = {
      apikey: this.config.anonKey,
      authorization: `Bearer ${actor.accessToken}`,
      'content-type': 'application/json',
      'x-client-platform': 'ios',
      'x-client-application-id': this.config.clientBinary.applicationId,
      'x-client-build-number': String(this.config.clientBinary.buildNumber),
      'x-client-contract-epoch': String(this.config.mobileAttestation.contractEpoch),
      'x-client-eas-build-id': this.config.clientBinary.easBuildId,
      'x-client-runtime-version': this.config.clientBinary.runtimeVersion,
      'x-client-git-sha': this.config.release.gitSha,
      'x-client-release-id': this.config.release.releaseId,
      ...(options.headerOverrides ?? {}),
    }
    if (method !== 'GET') headers['idempotency-key'] = options.idempotencyKey ?? randomUUID()
    let response
    for (let attempt = 0; attempt < 9; attempt += 1) {
      response = await fetch(`${this.config.apiBaseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      })
      if (response.headers.get('x-release-id') === this.config.release.releaseId) break
      const payload = await response.clone().json().catch(() => null)
      if (!isReleaseConvergenceRetry(response, payload, this.config.release.releaseId) || attempt === 8) break
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 1_500))
    }
    const durationMs = Math.round(performance.now() - started)
    const identity = assertResponseIdentity(response.headers, this.config.release.releaseId)
    this.traceIds.add(identity.traceId)
    if (options.expectedStatus !== undefined && response.status !== options.expectedStatus) {
      const text = await boundedResponseText(response, 32 * 1024)
      let code = 'UNKNOWN'
      if (text) {
        try {
          const error = JSON.parse(text)
          if (typeof error?.code === 'string' && /^[A-Z0-9_]{2,80}$/u.test(error.code)) code = error.code
        } catch { code = 'INVALID_JSON' }
      }
      throw new Error(
        `${method} ${path} returned HTTP ${response.status}, expected ${options.expectedStatus}; ` +
        `safeCode=${code}; supportCode=${identity.supportCode}; traceId=${identity.traceId}`,
      )
    }
    if (options.discardBody) {
      await response.body?.cancel().catch(() => undefined)
      if (!response.ok) throw new Error(`${method} ${path} was not accepted before response loss`)
      return { durationMs, identity, json: null, status: response.status }
    }
    const text = await boundedResponseText(response, 256 * 1024)
    let json = {}
    if (text) {
      try { json = JSON.parse(text) } catch { throw new Error(`${method} ${path} returned invalid JSON`) }
    }
    if (options.expectedSafeError !== undefined) {
      const expected = options.expectedSafeError
      this.errorResponses += 1
      const evidence = assertSafeErrorEvidence({
        status: response.status,
        code: json.code,
        supportCode: identity.supportCode,
        traceId: identity.traceId,
      }, expected)
      this.safeErrorResponses += 1
      this.safeErrorEvidence.push(evidence)
    } else if (!response.ok) {
      throw new Error(
        `${method} ${path} failed with safe code ${json.code ?? 'UNKNOWN'} and HTTP ${response.status}; ` +
        `reasonCode=${json.reason_code ?? 'UNKNOWN'}; ` +
        `safeMessage=${typeof json.error === 'string' ? json.error.slice(0, 160) : 'UNKNOWN'}; ` +
        `supportCode=${identity.supportCode}; traceId=${identity.traceId}`,
      )
    }
    return { durationMs, identity, json, status: response.status }
  }
}

function loadConfig(args = process.argv.slice(2)) {
  const options = parseArgs(args)
  const releasePath = options.release ?? 'artifacts/harness/release-manifest.json'
  const release = JSON.parse(readFileSync(resolveReleaseArtifactPath(ROOT, releasePath), 'utf8'))
  const releaseProblems = checkHarnessRelease(release)
  if (releaseProblems.length) throw new Error(`release artifact is invalid: ${releaseProblems.join('; ')}`)
  if (!['staging', 'production'].includes(release.environment)) throw new Error('synthetic smoke requires a hosted release')
  const mobileAttestation = JSON.parse(readFileSync(resolveReleaseArtifactPath(ROOT, options.mobileAttestation), 'utf8'))
  if (verifyMobileBinaryAttestation(mobileAttestation, release).length > 0) {
    throw new Error('synthetic smoke requires exact checksummed mobile binary evidence')
  }
  const target = assertReleaseTarget({
    environment: release.environment,
    projectRef: requireEnv('STAGE1_SUPABASE_PROJECT_REF'),
    projectUrl: requireEnv('STAGE1_SUPABASE_URL'),
  })
  const apiBaseUrl = (process.env.STAGE1_API_BASE_URL?.trim() ?? `${target.projectUrl}/functions/v1/mobile-api`).replace(/\/+$/u, '')
  if (apiBaseUrl !== `${target.projectUrl}/functions/v1/mobile-api`) throw new Error('synthetic smoke API origin does not match the exact release target')
  const runId = requireEnv('STAGE1_RUN_ID')
  if (process.env.STAGE1_SMOKE_MUTATION_APPROVAL?.trim() !== `stage1-synthetic:${runId}`) {
    throw new Error('explicit Stage 1 synthetic mutation approval is missing')
  }
  const sequence = Number(options.sequence)
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > 3) {
    throw new Error('synthetic smoke sequence is invalid')
  }
  const cohortId = options.cohort
  if (!cohortId?.startsWith(`synthetic-stage1-${release.releaseId.slice(8, 20)}-${release.releaseId.slice(21)}-`)) {
    throw new Error('synthetic cohort is not bound to the selected release')
  }
  return {
    environment: release.environment,
    projectRef: target.projectRef,
    projectUrl: target.projectUrl,
    apiBaseUrl,
    anonKey: requireEnv('STAGE1_SUPABASE_ANON_KEY'),
    serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    customer: dedicatedCredentials('STAGE1_SYNTHETIC_CUSTOMER'),
    worker: dedicatedCredentials('STAGE1_SYNTHETIC_WORKER'),
    release,
    cohortId,
    runId,
    sequence,
    mobileAttestation,
    clientBinary: mobileAttestation.platforms.ios,
    output: options.output,
  }
}

function parseArgs(args) {
  const result = {}
  const fields = new Map([
    ['--release', 'release'],
    ['--mobile-attestation', 'mobileAttestation'],
    ['--cohort', 'cohort'],
    ['--sequence', 'sequence'],
    ['--output', 'output'],
  ])
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index]
    const field = fields.get(key)
    if (!field) throw new Error(`unknown argument: ${key}`)
    const value = args[++index]
    if (!value || value.startsWith('--')) throw new Error(`${key} requires a value`)
    result[field] = value
  }
  for (const required of ['mobileAttestation', 'cohort', 'sequence', 'output']) {
    if (!result[required]) throw new Error(`synthetic smoke option is missing: ${required}`)
  }
  return result
}

function dedicatedCredentials(prefix) {
  const email = requireEnv(`${prefix}_EMAIL`).toLowerCase()
  const password = requireEnv(`${prefix}_PASSWORD`)
  if (!email.endsWith('@example.test') || password.length < 12) {
    throw new Error(`${prefix} must be a dedicated @example.test identity with a strong password`)
  }
  return { email, password }
}

function requireEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`missing required environment variable ${name}`)
  return value
}

function firstNonEmptyArray(...values) {
  return values.map(stringArray).find((value) => value.length > 0) ?? []
}

function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.length > 0) : []
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0
}

function scenarioDescription(policy, followUp = false) {
  const prefix = followUp ? 'Bổ sung phạm vi:' : 'Yêu cầu dịch vụ:'
  const grounded = {
    install_device: 'cần lắp một đèn LED ốp trần 20W vào điểm điện trần hiện có trong phòng khách; thiết bị và vít nở đã mua sẵn; dây cùng điểm đấu hiện hữu đi nổi, nhìn thấy rõ và tiếp cận bằng thang thấp; không cần đục tường, kéo dây âm hay tạo mạch mới; nguồn điện khu vực đang ổn định; không có khói, tia lửa, dây trần hoặc nước gần điện',
    pipe_leak: 'một đoạn ống PVC lộ thiên dưới bồn rửa đang rỉ từng giọt; van khóa nước trong căn hộ dùng được; khu vực tiếp cận trực tiếp, chưa ngập và chưa lan sang tủ hoặc sàn; cần kiểm tra rồi thay đúng đoạn nối nếu cần',
    standard_home_cleaning: 'căn hộ 60 m2 có hai phòng ngủ và một phòng tắm, đang có người ở; cần dọn vệ sinh tiêu chuẩn sàn gạch, bếp và phòng tắm; thợ mang dụng cụ cùng dung dịch thông thường; không có rác cồng kềnh, hóa chất lạ, nấm mốc nặng hoặc bề mặt đặc biệt',
    routine_hvac_cleaning: 'cần vệ sinh định kỳ một máy lạnh treo tường 1.5 HP đang hoạt động bình thường; lần vệ sinh gần nhất sáu tháng trước; dàn lạnh và dàn nóng đều tiếp cận an toàn, không cần làm việc trên cao; không có mùi khét, tia lửa, rò gas hoặc nhu cầu sửa chữa',
    sofa_cleaning: 'cần vệ sinh một sofa vải ba chỗ ngồi có nhãn chăm sóc, bám bụi nhẹ và không có vết hóa chất; sofa ở phòng khách dễ di chuyển, có thông gió để làm khô trong ngày; chưa từng xử lý bằng chất tẩy mạnh',
    replace_cabinet_hinges: 'cần thay đúng hai bản lề có sẵn cho một cánh tủ MDF nhỏ ở ngang hông; cánh, khung và lỗ vít còn nguyên, khu vực thao tác dễ tiếp cận; chỉ tháo bản lề cũ, lắp và cân chỉnh bản lề mới, không khoan thêm, vá gỗ hoặc sửa phần khác',
    repair_hinge_or_handle: 'cần kiểm tra, siết và cân chỉnh đúng hai bản lề của một cánh tủ MDF nhỏ ở ngang hông; cánh, khung, lỗ vít và phụ kiện hiện có còn nguyên, khu vực dễ thao tác; phạm vi chỉ gồm kiểm tra, siết và cân chỉnh, loại trừ thay mới, khoan, vá hoặc sửa hạng mục khác',
  }[policy.problem_slug]
  const detail = grounded ?? `vấn đề ${policy.problem_slug} thuộc dịch vụ ${policy.service_type}; phạm vi, điều kiện tiếp cận và tình trạng hiện tại đã được mô tả rõ, không có nguy hiểm tức thời`
  return `${prefix} ${detail}. Địa chỉ, quận và lịch hẹn đã được cung cấp; cần thợ đủ năng lực thực hiện đúng phạm vi.`
}

function futureHcmcSchedule() {
  const instant = new Date(Date.now() + 72 * 60 * 60 * 1_000)
  const localDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(instant)
  return {
    scheduledAt: `${localDate}T03:00:00.000Z`,
    window: { date: localDate, start: '10:00', end: '12:00', time_zone: 'Asia/Ho_Chi_Minh' },
  }
}

async function boundedResponseText(response, maximumBytes) {
  if (!response.body) return ''
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > maximumBytes) throw new Error('response exceeded the bounded smoke payload')
      chunks.push(chunk.value)
    }
  } finally {
    reader.releaseLock()
  }
  const combined = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(combined)
}

function summarizeIsolation(row) {
  return {
    memberCount: row.member_count,
    jobCount: row.job_count,
    sessionCount: row.session_count,
    broadcastCount: row.broadcast_count,
    financialRecordCount: row.financial_record_count,
    realSurfaceLeakCount: row.real_surface_leak_count,
    analyticsLeakCount: row.analytics_leak_count,
  }
}

async function main() {
  const config = loadConfig()
  const output = resolveReleaseArtifactPath(ROOT, config.output)
  let result
  const smoke = new Stage1SyntheticReleaseSmoke(config)
  try {
    result = await smoke.run()
  } catch (error) {
    const cleanup = { attempted: false, verified: false }
    if (smoke.actorIds && !smoke.cleanupCompleted) {
      cleanup.attempted = true
      try {
        cleanup.proof = await smoke.cleanupCohort()
        cleanup.verified = true
      } catch (cleanupError) {
        cleanup.error = cleanupError instanceof Error
          ? cleanupError.message.slice(0, 240)
          : 'UNKNOWN_CLEANUP_FAILURE'
      }
    }
    result = {
      status: 'failed',
      reasonCode: error instanceof Error ? error.message.slice(0, 240) : 'UNKNOWN_SMOKE_FAILURE',
      cleanup,
    }
  }
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`)
  process.stdout.write(`Stage 1 synthetic smoke ${result.status}: ${relative(ROOT, output).replaceAll('\\', '/')}\n`)
  if (result.status !== 'passed') process.exitCode = 1
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main()
}
