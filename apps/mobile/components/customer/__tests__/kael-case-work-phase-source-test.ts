import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const mobileRoot = join(process.cwd())
const presentation = readFileSync(join(mobileRoot, 'components/customer/v21/customer-kael-presentation.ts'), 'utf8')
const content = readFileSync(join(mobileRoot, 'components/customer/v21/customer-kael-chat-content.tsx'), 'utf8')
const controller = readFileSync(join(mobileRoot, 'components/customer/v21/use-customer-kael-surface-controller.ts'), 'utf8')
const evidenceActions = readFileSync(join(mobileRoot, 'components/customer/v21/use-customer-kael-evidence-actions.ts'), 'utf8')
const analysisEvidenceNode = readFileSync(join(mobileRoot, 'components/customer/v21/customer-kael-analysis-evidence-node.tsx'), 'utf8')
const caseThreadNode = readFileSync(join(mobileRoot, 'components/customer/v21/customer-kael-case-thread-node.tsx'), 'utf8')
const candidateNode = readFileSync(join(mobileRoot, 'components/customer/v21/customer-worker-candidate-node.tsx'), 'utf8')
const kaelFeature = [presentation, content, controller, evidenceActions, analysisEvidenceNode, caseThreadNode, candidateNode].join('\n')
const chatView = readFileSync(join(mobileRoot, 'components/customer/v21/chat-stateful-surfaces.tsx'), 'utf8')
const evidenceView = readFileSync(join(mobileRoot, 'components/customer/v21/agentic-evidence-stateful-surfaces.tsx'), 'utf8')
const estimateResponse = readFileSync(join(mobileRoot, 'components/customer/v21/agentic-chat-estimate-response.tsx'), 'utf8')
const candidateResponse = readFileSync(join(mobileRoot, 'components/customer/kael-chat/worker-candidate-review-response.tsx'), 'utf8')
const completionResponse = readFileSync(join(mobileRoot, 'components/customer/kael-chat/completion-review-response.tsx'), 'utf8')
const responseModel = readFileSync(join(mobileRoot, 'components/customer/v21/case-work-response-model.ts'), 'utf8')
const caseThread = readFileSync(join(mobileRoot, 'components/customer/v21/chat-case-thread-stateful-surfaces.tsx'), 'utf8')
const paymentSurface = readFileSync(join(mobileRoot, 'components/customer/v21/customer-payment-rail-surface.tsx'), 'utf8')

describe('Kael Case Work phase-gated mobile wiring', () => {
  it('starts analysis after Basic Intake and derives evidence UI from the server artifact', () => {
    expect(presentation).toContain('diagnosis_scope')
    expect(presentation).toContain("artifactNextAction?.kind === 'request_evidence'")
    expect(evidenceActions).toContain('evidence_items')
    expect(kaelFeature).not.toMatch(/pendingDraft[\s\S]{0,1600}defer_analysis:\s*true/)
  })

  it('formats only the pending Basic Intake bubble for readable customer display', () => {
    expect(chatView).toContain('customerVisibleIntakeSummaryText')
    expect(chatView).toContain('text={customerVisibleIntakeSummaryText(pendingDraftMessage, language)}')
    expect(chatView).toContain("text={turn.text_content ?? ''}")
  })

  it('keeps analysis media and editable voice inside the evidence response without revealing later phases', () => {
    expect(chatView).toContain('analysisEvidenceNode')
    expect(chatView).not.toContain('composerVoiceNode')
    expect(content).not.toContain('<OnDeviceVoiceTranscript')
    expect(chatView).not.toContain('debugRevealAllPhases')
  })

  it('renders the exact server evidence request and follows its mandatory or optional policy', () => {
    expect(presentation).toContain("artifactNextAction?.evidence_kind")
    expect(presentation).toContain('artifactNextAction?.required !== false')
    expect(presentation).toContain("typeof artifactNextAction?.prompt === 'string'")
    expect(presentation).toContain('localizedCaseWorkEvidencePrompt({')
    expect(presentation).toContain('diagnosisScope?.quote_blockers')
    expect(analysisEvidenceNode).toContain('allowSkip={!presentation.serverEvidenceRequired}')
    expect(evidenceView).toContain('allowSkip')
    expect(evidenceView).toContain('{allowSkip ? (')
    expect(evidenceView).toContain("'Bổ sung hiện trạng nếu thuận tiện'")
    expect(evidenceView).toContain("'Bỏ qua'")
    expect(evidenceView).toContain('const canSkip = rejectReason.trim().length > 0 && !busy')
    expect(evidenceView).toContain('disabled={!canSkip}')
  })

  it('shows inspection/source honesty from estimate_card.v3 instead of confidence-only copy', () => {
    expect(estimateResponse).toContain('estimate.needs_inspection === true')
    expect(estimateResponse).toContain('estimate.needs_inspection_reason')
    expect(estimateResponse).toContain('estimate.price_source')
    expect(presentation).toContain('chatEstimate.needs_inspection !== true')
  })

  it('shows a structured no-fake-price review state when the server blocks quote readiness', () => {
    expect(presentation).toContain("artifactNextAction?.kind === 'escalate'")
    expect(analysisEvidenceNode).toContain('<QuoteReadinessReviewResponse')
    expect(analysisEvidenceNode).toContain('safetyMessages={presentation.serverSafetyMessages}')
  })

  it('reveals offers and completion/payment actions only at their server-confirmed phase', () => {
    expect(presentation).toContain("chat?.session.case_phase === 'offer_review'")
    expect(content).toContain('agenticEstimateNode={presentation.offerReviewActive &&')
    expect(caseThreadNode).toContain("deal.status === 'completed_by_worker'")
    expect(completionResponse).toContain('customer-v21-completion-confirm')
    expect(responseModel).toContain("customer_confirmed_completion: 'payment'")
    expect(responseModel).toContain("payment_pending: 'payment'")
    expect(responseModel).toContain("paid: 'review'")
    expect(caseThreadNode).toContain("deal.paymentRailAvailable === true")
    expect(caseThread).toContain("from './customer-payment-rail-surface'")
    expect(caseThread).toContain('<CustomerPaymentRailSurface')
    expect(paymentSurface).toContain("phase !== 'customer_confirmed_completion' && phase !== 'payment_pending' && phase !== 'paid'")
    expect(paymentSurface).toContain('customer-v21-case-sepay-payment-start')
    expect(paymentSurface).toContain('customer-v21-case-payment-confirmed')
    expect(paymentSurface).toContain('isDealPaymentProtected(deal)')
    expect(caseThread).not.toContain('SePayVietQrPaymentDetails')
    expect(caseThread).not.toContain('customer-v21-case-sepay-payment-confirm')
    expect(caseThread).not.toContain('staging_simulator')
    expect(paymentSurface).not.toContain('staging_simulator')
    expect(caseThread).not.toContain('customer-v21-case-staging-payment')
    expect(caseThreadNode).not.toContain('stagingPaymentRailEnabled')
    expect(caseThread).not.toContain("focus === 'payment'")
  })

  it('shows scope controls only after the authoritative customer-decision state', () => {
    expect(caseThread).toContain('canCustomerDecideScopeChange(deal.scopeChange)')
  })

  it('does not re-enter a client-invented evidence gate after matching starts', () => {
    expect(presentation).toContain('const caseEvidenceGateActive = false')
  })

  it('reveals the safe worker card only at the server candidate-review phase', () => {
    expect(controller).toContain("deal?.status === 'worker_candidate_pending'")
    expect(candidateNode).toContain("if (mode !== 'case' || !candidateJobId) return null")
    expect(content).toContain('const workerCandidateNode = useMemo(')
    expect(content).toContain('<CustomerWorkerCandidateNode controller={controller} />')
    expect(content).toContain('workerCandidateNode={workerCandidateNode}')
    expect(content).not.toContain('workerCandidateNode={candidateJobId ?')
    expect(candidateResponse).toContain('candidate.rating !== null && candidate.total_jobs > 0')
    expect(candidateResponse).toContain('Địa chỉ chi tiết vẫn được khóa')
    expect(candidateResponse).not.toMatch(/\b(?:phone|cccd|bank_account|address_unit|eta)\b/i)
  })
})
