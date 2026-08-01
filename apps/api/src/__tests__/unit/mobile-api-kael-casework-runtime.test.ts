import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(process.cwd(), '../../supabase/functions/mobile-api/_shared')
const service = readFileSync(join(root, 'services/kael-chat.service.ts'), 'utf8')
const mediaService = readFileSync(join(root, 'services/kael-chat-media.service.ts'), 'utf8')
const core = readFileSync(join(root, 'services/kael-chat-core.ts'), 'utf8')
const boundary = readFileSync(join(root, 'services/kael-chat-boundary.ts'), 'utf8')
const caseWork = readFileSync(join(root, 'services/kael-chat-case-work.ts'), 'utf8')
const sessionStore = readFileSync(join(root, 'services/kael-chat-session-store.ts'), 'utf8')
const intakeService = readFileSync(join(root, 'services/kael-chat-intake.ts'), 'utf8')
const services = readFileSync(join(root, 'services.ts'), 'utf8')
const confirmService = readFileSync(join(root, 'services/kael-chat-confirm.service.ts'), 'utf8')
const intakeConfirmationService = readFileSync(
  join(root, 'services/kael-chat-intake-confirmation.service.ts'),
  'utf8',
)
const completionReviewService = readFileSync(join(root, 'services/completion-review.service.ts'), 'utf8')
const jobStatusService = readFileSync(join(root, 'services/job-status.service.ts'), 'utf8')
const pipeline = readFileSync(join(root, 'kael/pipeline.ts'), 'utf8')
const sharedService = [
  readFileSync(join(root, 'services/_shared.ts'), 'utf8'),
  readFileSync(join(root, 'services/serializers.ts'), 'utf8'),
].join('\n')
const jobCreateService = readFileSync(join(root, 'services/job-create.service.ts'), 'utf8')

describe('Kael Case Work runtime wiring', () => {
  it('normalizes Kael response branding before an Agentic turn is persisted', () => {
    expect(sessionStore).toContain('normalizeKaelResponseBrand(input.text)')
  })

  it('holds booking intake at the confirmation Pre-Step before analysis', () => {
    expect(service).toContain('if (!input.defer_analysis && !intakeConfirmation)')
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
    expect(service).toContain('resolveKaelChatAddressDistrict,')
    expect(intakeService).toContain('function resolveKaelChatAddressDistrict(')
    expect(intakeService).toContain('normalizeServiceAreaDistrict(candidate)')
    expect(intakeService).toContain('(?:quận|quan|q|district|dist)')
    expect(intakeService).toContain('(?:1[0-2]|[1-9])')
    expect(intakeService).toContain('bình\\s*thạnh|binh\\s*thanh|thủ\\s*đức|thu\\s*duc')
    expect(intakeService).toContain('const extractedInlineDistrict = normalizeServiceAreaDistrict(inlineDistrict)')
    expect(intakeService).toContain("candidate?.split(/[,;\\u2013\\u2014\\u00b7|/]")
    expect(service).toMatch(
      /const resolvedAddressDistrict = resolveKaelChatAddressDistrict\([\s\S]*input\.address_district,[\s\S]*message,[\s\S]*previousMetadata\.address_district/,
    )
    expect(service).toContain('address_district: resolvedAddressDistrict ?? undefined')
  })

  it('rejects a skipped mandatory gate before writes and records accepted evidence decisions', () => {
    const submitEvidence = service.match(
      /export async function submitKaelChatEvidence[\s\S]*?(?=function withoutEphemeralKaelMediaUrls)/,
    )?.[0] ?? ''

    expect(submitEvidence).toContain('requestedEvidence.data.next_action.required')
    expect(submitEvidence).toContain('Không thể bỏ qua bằng chứng bắt buộc')
    expect(submitEvidence.indexOf('requestedEvidence.data.next_action.required')).toBeLessThan(
      submitEvidence.indexOf('insertKaelTurn('),
    )
    expect(submitEvidence).toContain('const safeSkipReason = input.skip_reason')
    expect(submitEvidence).toContain('sanitizeUntrustedEvidenceText(input.skip_reason)')
    expect(submitEvidence).toContain('skip_reason: safeSkipReason')
    expect(submitEvidence).toContain('evidence_gate_decision: input.decision')
  })

  it('settles progress when either real chat boundary call declines early', () => {
    const boundaryCalls = service.match(/maybeApplyKaelBoundaryGuard\([\s\S]*?progressTarget: \{ table: "kael_chat_sessions", id: sessionId \}[\s\S]*?\);/g) ?? []

    expect(boundaryCalls).toHaveLength(2)
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
    const clarificationBranch = core.match(
      /if \(pipeline\.code === "NEEDS_CLARIFICATION"\)[\s\S]*?(?=if \(pipeline\.code === "SERVICE_MISMATCH"\))/,
    )?.[0] ?? ''

    expect(clarificationBranch).toMatch(
      /await Promise\.all\(\[[\s\S]*persistDiagnosisScopeArtifact[\s\S]*appendKaelSystemTurn[\s\S]*updateKaelProgress/,
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
    expect(core).toContain('const durableCustomerDetail = safeCustomerEvidence')
    expect(core).toContain('latest_customer_detail: durableCustomerDetail')
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

  it('keeps the database confirmation gate aligned with the quote-ready artifact', () => {
    const migration = readFileSync(
      join(process.cwd(), '../../supabase/migrations/20260722033000_align_kael_confirm_quote_ready_gate.sql'),
      'utf8',
    )

    expect(migration).toContain('create or replace function public.confirm_kael_chat_atomic')
    expect(migration).toContain("v_session.diagnosis_scope ->> 'quote_ready' <> 'true'")
    expect(migration).toContain("v_session.diagnosis_scope -> 'facts' ->> 'needs_inspection'")
    expect(migration).toContain("v_session.diagnosis_scope -> 'next_action' ->> 'kind' <> 'prepare_offer'")
    expect(migration).not.toMatch(/diagnosis_scope[^\n]+confidence[^\n]+0\.7/)
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
    const sendTurn = service.match(
      /export async function sendKaelChatTurn[\s\S]*?(?=export async function submitKaelChatEvidence)/,
    )?.[0] ?? ''
    const submitEvidence = service.match(
      /export async function submitKaelChatEvidence[\s\S]*?(?=function withoutEphemeralKaelMediaUrls)/,
    )?.[0] ?? ''

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

  it('does not force a best-effort estimate after a fixed clarification count', () => {
    expect(pipeline).not.toContain('CLARIFICATION_CAP')
    expect(pipeline).not.toMatch(/clarificationCount[^\n]+</)
    expect(pipeline).toContain('const needsClarification = coverage.needsClarification')
    expect(pipeline).toContain('if (needsClarification)')
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
