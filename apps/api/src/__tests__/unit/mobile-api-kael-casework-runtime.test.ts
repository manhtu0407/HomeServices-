import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = join(process.cwd(), '../../supabase/functions/mobile-api/_shared')
const service = readFileSync(join(root, 'services/kael-chat/index.ts'), 'utf8')
const mediaService = readFileSync(join(root, 'services/kael-chat/media.ts'), 'utf8')
const core = readFileSync(join(root, 'services/kael-chat/core.ts'), 'utf8')
const boundary = readFileSync(join(root, 'services/kael-chat/boundary.ts'), 'utf8')
const caseWork = readFileSync(join(root, 'services/kael-chat/case-work.ts'), 'utf8')
const services = readFileSync(join(root, 'services.ts'), 'utf8')
const confirmService = readFileSync(join(root, 'services/kael-chat/confirm.ts'), 'utf8')
const completionReviewService = readFileSync(join(root, 'services/completion-review.service.ts'), 'utf8')
const jobStatusService = readFileSync(join(root, 'services/job-status.service.ts'), 'utf8')
const pipeline = readFileSync(join(root, 'kael/pipeline.ts'), 'utf8')
const sharedService = [
  readFileSync(join(root, 'services/_shared.ts'), 'utf8'),
  readFileSync(join(root, 'services/serializers.ts'), 'utf8'),
].join('\n')
const jobCreateService = readFileSync(join(root, 'services/job-create.service.ts'), 'utf8')

describe('Kael Case Work runtime wiring', () => {
  it('respects deferred Basic Intake handoff instead of analyzing during route submit', () => {
    expect(service).toContain('if (!input.defer_analysis)')
    expect(service).toContain('buildInitialDiagnosisScopeArtifact')
    expect(service).toContain('diagnosis_scope: initialDiagnosisScope')
    expect(service).toContain('case_phase: "analysis"')
  })

  it('resumes server analysis after evidence submission', () => {
    expect(service).toMatch(/submitKaelChatEvidence\([\s\S]*secrets:\s*EdgeAiSecrets/)
    expect(service).toMatch(/submitKaelChatEvidence[\s\S]*await advanceKaelChatEstimate\(/)
    expect(services).toContain('submitKaelChatEvidence: (ctx, sessionId, input) =>')
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
    expect(service).toContain('evidence.kind === "photo" || evidence.kind === "video_frame"')
  })

  it('persists one current diagnosis/scope artifact and snapshots it on turns', () => {
    expect(core).toContain('loadDiagnosisScopeArtifact')
    expect(core).toContain('persistDiagnosisScopeArtifact')
    expect(core).toContain('diagnosis_scope: artifact')
    expect(core).toContain('diagnosis_scope: quoteReadyArtifact')
  })

  it('keeps the row and artifact phase aligned when a customer reopens analysis', () => {
    expect(service).toMatch(/currentArtifact\.success[\s\S]*case_phase: "analysis"[\s\S]*quote_ready: false/)
    expect(sharedService).toContain('row.case_phase')
    expect(sharedService).not.toContain('diagnosisScope?.case_phase ?? "analysis"')
  })

  it('scrubs customer PII and control-plane text before persisting diagnosis facts', () => {
    expect(service).toContain('customerGoal: sanitizeUntrustedEvidenceText')
    expect(core).toContain('const safeCustomerEvidence = sanitizeUntrustedEvidenceText(message)')
    expect(core).toContain('const durableCustomerDetail = safeCustomerEvidence')
    expect(core).toContain('latest_customer_detail: durableCustomerDetail')
    expect(core).not.toContain('latest_customer_detail: message')
  })

  it('requires a quote-ready artifact before the offer confirmation handoff', () => {
    expect(confirmService).toContain('kaelDiagnosisScopeArtifactSchema.safeParse')
    expect(confirmService).toContain('diagnosisScope.quote_ready')
    expect(confirmService).toContain('diagnosisScope.confidence')
    expect(confirmService).toContain('diagnosisScope.facts.needs_inspection')
    expect(confirmService).toContain('diagnosisScope.confidence < 0.7')
  })

  it('keeps completion behind an explicit customer confirmation', () => {
    expect(jobStatusService).not.toContain('worker_evidence_confirm_completion')
    expect(jobStatusService).not.toMatch(/input\.status === "completed_by_worker"[\s\S]*status: "confirmed_by_customer"/)
    expect(completionReviewService).toContain('event: "customer_confirmed_completion"')
    expect(completionReviewService).not.toContain('runPolicyAutonomyGate')
  })

  it('never accepts raw audio as Kael upload input', () => {
    expect(service).not.toMatch(/"audio\/(?:aac|mp4|mpeg|wav|webm)"/)
    expect(service).toContain('voice_transcript')
    expect(service).toContain('video_original_private')
    expect(service).toContain('createSignedVisionUrls')
    expect(service).toContain('evidence.kind === "photo" || evidence.kind === "video_frame"')
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
      /export async function submitKaelChatEvidence[\s\S]*?(?=function sanitizeCaseWorkEvidenceItems)/,
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

  it('retains hard-route reason telemetry on the job-create failure event', () => {
    expect(jobCreateService).toContain('policy_reason_code: pipeline.policyReasonCode')
    expect(jobCreateService).toMatch(/reason_code: reasonCode, \.\.\.metadata/)
  })

  it('enforces server-requested visual evidence before a quote-ready artifact', () => {
    expect(core).toContain('requiredCaseWorkEvidenceRequest')
    expect(core).toContain('diagnosisScopeWithEvidenceRequest')
    expect(caseWork).toContain('kind: "request_evidence"')
  })
})
