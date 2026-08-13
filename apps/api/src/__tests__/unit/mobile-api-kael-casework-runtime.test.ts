import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(process.cwd(), '../../supabase/functions/mobile-api/_shared')
const service = [
  'create.ts',
  'turn.ts',
  'evidence.ts',
  'intake.ts',
  'persistence.service.ts',
].map((path) => readFileSync(join(root, 'domains/kael-chat', path), 'utf8')).join('\n')
const mediaService = [
  'media-upload.ts',
  'media-vision.ts',
].map((path) => readFileSync(join(root, 'domains/kael-chat', path), 'utf8')).join('\n')
const core = [
  'advance.ts',
  'branches-pre-pipeline.ts',
  'branches-post-pipeline.ts',
  'estimate-support.ts',
  'clarification.service.ts',
].map((path) => readFileSync(join(root, 'domains/kael-chat', path), 'utf8')).join('\n')
const emitStep = readFileSync(join(root, 'domains/kael-chat/emit-step.ts'), 'utf8')
const boundary = readFileSync(join(root, 'domains/kael-chat/guard.ts'), 'utf8')
const clarificationService = readFileSync(
  join(root, 'domains/kael-chat/clarification.service.ts'),
  'utf8',
)
const caseWork = [
  'case-work-artifact.ts',
  'case-work-context.ts',
].map((path) => readFileSync(join(root, 'domains/kael-chat', path), 'utf8')).join('\n')
const intakeService = readFileSync(join(root, 'domains/kael-chat/intake.ts'), 'utf8')
const services = readFileSync(join(root, 'domains.ts'), 'utf8')
const confirmService = readFileSync(join(root, 'domains/kael-chat/confirm.service.ts'), 'utf8')
const intakeConfirmationService = readFileSync(
  join(root, 'domains/kael-chat/intake-confirmation.service.ts'),
  'utf8',
)
const completionReviewService = readFileSync(join(root, 'domains/payment/completion-review.ts'), 'utf8')
const jobStatusService = readFileSync(join(root, 'domains/job/status.ts'), 'utf8')
const pipeline = [
  'pipeline.ts',
  'stage-intent.ts',
].map((path) => readFileSync(join(root, 'kael/pipeline', path), 'utf8')).join('\n')
const outputPipeline = readFileSync(join(root, 'kael/kael-guardrails/output-pipeline.ts'), 'utf8')
const sharedService = readFileSync(join(root, 'domains/kael-chat/serialize.ts'), 'utf8')
const jobCreateService = [
  'create/create.ts',
  'create/analyze.ts',
  'create/compensation.ts',
].map((path) => readFileSync(join(root, 'domains/job', path), 'utf8')).join('\n')

function exportedAsyncFunctionBody(name: string, nextName?: string) {
  const start = service.indexOf(`export async function ${name}(`)
  if (start < 0) return ''
  const body = service.slice(start)
  if (!nextName) return body
  const next = body.indexOf(`export async function ${nextName}(`)
  return next < 0 ? body : body.slice(0, next)
}

describe('Kael Case Work runtime wiring', () => {
  it('holds booking intake at the confirmation Pre-Step before analysis', () => {
    expect(service).toContain('if (input.input.defer_analysis || input.prepared.intakeConfirmation) return;')
    expect(service).toContain('intake_confirmation: intakeConfirmation ?? undefined')
    expect(service).toContain('buildInitialDiagnosisScopeArtifact')
    expect(service).toContain('diagnosis_scope: initialDiagnosisScope')
    expect(service).toContain('case_phase: "analysis"')
  })

  it('resumes server analysis after evidence submission', () => {
    expect(service).toMatch(/submitKaelChatEvidence\([\s\S]*secrets:\s*EdgeAiSecrets/)
    expect(service).toMatch(/submitKaelChatEvidence[\s\S]*await advanceKaelChatEstimate\(/)
    expect(services).toContain('submitKaelChatEvidence: (ctx, sessionId, input) =>')
  })

  it('keeps confirmation and correction decisions server-authoritative', () => {
    expect(intakeConfirmationService).toContain('kaelIntakeConfirmationSchema.safeParse')
    expect(intakeConfirmationService).toContain('buildKaelIntakeConfirmation')
    expect(intakeConfirmationService).toContain('status: "abandoned"')
    expect(intakeConfirmationService).toContain('intake_decision: "correction_requested"')
    expect(intakeConfirmationService).toContain('await advanceKaelChatEstimate')
    expect(services).toContain('decideKaelIntakeConfirmation: (ctx, sessionId, input) =>')
    expect(service).toContain('assertIntakeConfirmationCompleted(previousMetadata)')
    expect(service).toContain('assertIntakeConfirmationCompleted(asRecord(session.safe_metadata))')
  })

  it('accepts a concrete district from a clarification reply without guessing an address', () => {
    expect(service).toContain('resolveKaelChatAddressDistrict')
    expect(intakeService).toContain('function resolveKaelChatAddressDistrict(')
    expect(intakeService).toContain('normalizeServiceAreaDistrict(candidate)')
    expect(intakeService).toContain('(?:quận|quan|q|district|dist)')
    expect(intakeService).toContain('(?:1[0-2]|[1-9])')
    expect(intakeService).toContain('bình\\s*thạnh|binh\\s*thanh|thủ\\s*đức|thu\\s*duc')
    expect(intakeService).toContain('const extractedInlineDistrict = normalizeServiceAreaDistrict(inlineDistrict)')
    expect(intakeService).toContain("candidate?.split(/[,;\\u2013\\u2014\\u00b7|/]")
    expect(service).toMatch(
      /const resolvedAddressDistrict = resolveKaelChatAddressDistrict\([\s\S]*input\.input\.address_district,[\s\S]*message,[\s\S]*previousMetadata\.address_district/,
    )
    expect(service).toContain('address_district: addressDistrict ?? undefined')
  })

  it('rejects a skipped mandatory gate before writes and records accepted evidence decisions', () => {
    const submitEvidence = exportedAsyncFunctionBody('submitKaelChatEvidence')

    expect(submitEvidence).toContain('requestedEvidence.data.next_action.required')
    expect(submitEvidence).toContain('Không thể bỏ qua bằng chứng bắt buộc')
    expect(submitEvidence.indexOf('requestedEvidence.data.next_action.required')).toBeLessThan(
      submitEvidence.indexOf('insertKaelTurn('),
    )
    expect(submitEvidence).toContain('const safeSkipReason = input.skip_reason')
    expect(submitEvidence).toContain('sanitizeUntrustedEvidenceText(input.skip_reason)')
    expect(submitEvidence).toContain('skip_reason: safeSkipReason')
    expect(submitEvidence).toContain('evidence_gate_decision: input.input.decision')
  })

  it('settles progress when either real chat boundary call declines early', () => {
    const boundaryCalls = service.match(/maybeApplyKaelBoundaryGuard\(/g) ?? []
    const progressTargets = service.match(
      /progressTarget: \{ table: "kael_chat_sessions", id: input\.sessionId \}/g,
    ) ?? []

    expect(boundaryCalls).toHaveLength(2)
    expect(progressTargets).toHaveLength(2)
    expect(boundary).toMatch(/if \(auditContext\.progressTarget\)[\s\S]*updateKaelProgress\([\s\S]*status: "failed"[\s\S]*failureReason: boundary\.reason/)
  })

  it('hydrates Basic Intake evidence into the first artifact without signing private video', () => {
    expect(service).toMatch(/createKaelChat[\s\S]*sanitizeCaseWorkEvidenceItems\(input\.evidence_items \?\? \[\]\)/)
    expect(service).toMatch(/initialDiagnosisScope[\s\S]*mergeCaseWorkEvidence/)
    expect(service).toMatch(/createSignedVisionUrls[\s\S]*initialEvidenceItems/)
    expect(caseWork).toContain('evidence.kind === "photo" || evidence.kind === "video_frame"')
  })

  it('persists one current diagnosis/scope artifact and snapshots it on turns', () => {
    expect(core).toContain('loadKaelChatAnalysisState')
    expect(core).not.toContain('getKaelChatTurnCount')
    expect(core).not.toContain('getKaelChatCostUsd')
    expect(caseWork).toMatch(/select\("id, diagnosis_scope, total_turns, total_cost_usd"\)/)
    expect(core).toContain('persistDiagnosisScopeArtifact')
    expect(core).toContain('diagnosis_scope: artifact')
    expect(core).toContain('diagnosis_scope: quoteReadyArtifact')
  })

  it('settles a clarification artifact, turn, and progress concurrently after model analysis', () => {
    const clarificationBranch = clarificationService.match(
      /export async function handleKaelPipelineClarification\([\s\S]*/,
    )?.[0] ?? ''

    expect(clarificationBranch).toMatch(
      /await emitKaelChatStep\([\s\S]*artifact,[\s\S]*parallel: true,[\s\S]*turn:[\s\S]*progress:/,
    )
    expect(emitStep).toMatch(
      /const steps = \[[\s\S]*persistDiagnosisScopeArtifact[\s\S]*appendKaelSystemTurn[\s\S]*updateKaelProgress[\s\S]*if \(input\.parallel\)[\s\S]*await Promise\.all\(steps\.map/,
    )
  })

  it('keeps the row and artifact phase aligned when a customer reopens analysis', () => {
    expect(service).toMatch(/currentArtifact\.success[\s\S]*case_phase: "analysis"[\s\S]*quote_ready: false/)
    expect(sharedService).toContain('row.case_phase')
    expect(sharedService).not.toContain('diagnosisScope?.case_phase ?? "analysis"')
  })

  it('scrubs customer PII and control-plane text before persisting diagnosis facts', () => {
    expect(service).toContain('const intakeDescription = sanitizeCustomerCaseEvidenceText')
    expect(service).toContain('customerGoal: intakeDescription')
    expect(core).toContain('const safeCustomerEvidence = sanitizeCustomerCaseEvidenceText(message)')
    expect(core).toContain('durableCustomerDetail: safeCustomerEvidence')
    expect(core).toContain('latest_customer_detail: customerAnalysisDetail')
    expect(core).not.toContain('latest_customer_detail: message')
  })

  it('requires a quote-ready artifact before the offer confirmation handoff', () => {
    expect(confirmService).toContain('kaelDiagnosisScopeArtifactSchema.safeParse')
    expect(confirmService).toContain('diagnosisScope.quote_ready')
    expect(confirmService).toContain('diagnosisScope.quote_blockers.length > 0')
    expect(confirmService).toContain('diagnosisScope.confidence')
    expect(confirmService).toContain('diagnosisScope.facts.needs_inspection')
    expect(confirmService).not.toContain('diagnosisScope.confidence < 0.7')
  })

  it('keeps completion behind an explicit customer confirmation', () => {
    expect(jobStatusService).not.toContain('worker_evidence_confirm_completion')
    expect(jobStatusService).not.toMatch(/input\.status === "completed_by_worker"[\s\S]*status: "confirmed_by_customer"/)
    expect(completionReviewService).toContain('event: "customer_confirmed_completion"')
    expect(completionReviewService).not.toContain('runPolicyAutonomyGate')
  })

  it('never accepts raw audio as Kael upload input', () => {
    expect(service).not.toMatch(/"audio\/(?:aac|mp4|mpeg|wav|webm)"/)
    expect(caseWork).toContain('voice_transcript')
    expect(caseWork).toContain('video_original_private')
    expect(service).toContain('createSignedVisionUrls')
    expect(caseWork).toContain('evidence.kind === "photo" || evidence.kind === "video_frame"')
  })

  it('keeps signed model URLs ephemeral and persists only owner-bound media refs', () => {
    expect(mediaService).toContain('.createSignedUrl(objectPath, 5 * 60, {')
    expect(mediaService).toContain('transform: {')
    expect(mediaService).toContain('(model_vision|private_video_original)')
    expect(mediaService).toContain('inspectTrustedKaelVisionTransform')
    expect(mediaService).toContain('INVALID_MEDIA_CONTENT')
    expect(mediaService).toContain('validateAndConsumeKaelChatEvidenceMediaRefs')
    expect(mediaService).toContain('p_purpose: input.purpose')
    expect(mediaService).not.toContain('continue;')
    expect(service).toContain('withoutEphemeralKaelMediaUrls')
    expect(service).not.toContain('photo_urls: input.photo_urls')
    expect(service).toContain('media_refs: evidenceRefs')
    expect(service).toContain('input.decision === "skipped"')
    expect(service).toContain('Không thể gửi bằng chứng khi đã chọn bỏ qua')
  })

  it('validates this turn media before any durable case-work write', () => {
    const sendTurn = exportedAsyncFunctionBody('sendKaelChatTurn', 'submitKaelChatEvidence')
    const submitEvidence = exportedAsyncFunctionBody('submitKaelChatEvidence')

    for (const body of [sendTurn, submitEvidence]) {
      expect(body.indexOf('createSignedVisionUrls(')).toBeGreaterThan(-1)
      expect(body.indexOf('createSignedVisionUrls(')).toBeLessThan(body.indexOf('insertKaelTurn('))
    }
    expect(sendTurn).toMatch(/createSignedVisionUrls\([\s\S]*?sanitizedEvidenceItems/)
    expect(submitEvidence).toMatch(
      /buildKaelVisionValidationEvidence\(\s*sanitizedEvidenceItems,\s*input\.media_refs,?\s*\)/,
    )
    expect(submitEvidence).toMatch(/createSignedVisionUrls\([\s\S]*?visionValidationEvidence/)
    expect(sendTurn).not.toMatch(/createSignedVisionUrls\([\s\S]*?diagnosisScope\?\.evidence/)
  })

  it('keeps prior scope and analyzed evidence available to text-only estimate adjustments', () => {
    expect(caseWork).toContain('mergeKaelCustomerDetailForReanalysis')
    expect(caseWork).toContain('previousAnalysisReceipt')
    expect(caseWork).toContain('safe_metadata')
    expect(caseWork).toContain('evidence.analysis_status === "analyzed"')
    expect(core).toContain('customerAnalysisDetail')
    expect(core).toContain('previousAnalysisReceipt')
    expect(outputPipeline).toContain('reusePreviousAnalyzedEvidence')
  })

  it('does not force a best-effort estimate after a fixed clarification count', () => {
    expect(pipeline).not.toContain('CLARIFICATION_CAP')
    expect(pipeline).not.toMatch(/clarificationCount[^\n]+</)
    // The branch condition is the coverage policy signal itself — no intermediate binding can
    // sit between the policy decision and the clarification branch.
    expect(pipeline).toContain('if (coverage.needsClarification)')
    expect(core).not.toContain('KAEL_CASE_WORK_TURN_SAFETY_LIMIT')
    expect(core).toContain('artifact.next_action.kind === "escalate"')
    expect(core).toContain('KAEL_CHAT_HARD_COST_CAP_USD')
    expect(pipeline).toContain('missingSlots: [firstMissing]')
    expect(pipeline).toContain('isSingleFocusedClarificationQuestion')
    expect(core).toContain('fallbackText: focusedFallback')
    expect(core).not.toContain('its location, signs, and impact')
  })

  it('does not turn missing verified price evidence into an endless description/photo loop', () => {
    expect(core).toContain('pipeline.code === "NO_BASELINE"')
    expect(core).toContain('buildPriceEvidenceUnavailableArtifact')
    expect(core).toContain('validated_price_evidence_unavailable')
  })

  it('uses the validated baseline fallback without turning low market confidence into a permanent blocker', () => {
    expect(core).toContain('resolveIntakeFactCoverage')
    expect(core).not.toContain('confidence_below_offer_threshold')
    expect(core).toContain('onsite_inspection_required')
    expect(core).toContain('prepare_offer')
  })

  it('retains hard-route reason telemetry on the job-create failure event', () => {
    expect(jobCreateService).toContain('policy_reason_code: pipeline.policyReasonCode')
    expect(jobCreateService).toMatch(/reason_code: reasonCode, \.\.\.metadata/)
  })

  it('resolves profile evidence after clarification and records the server-owned requirement level', () => {
    expect(core).toContain('resolveCaseWorkEvidenceRequest')
    expect(core).toContain('evidence_gate_decision')
    expect(core).toContain('diagnosisScopeWithEvidenceRequest')
    expect(caseWork).toContain('kind: "request_evidence"')
    expect(caseWork).toContain('required: request.required')
  })
})
