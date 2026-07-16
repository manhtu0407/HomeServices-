import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const mobileRoot = join(process.cwd())
const presentation = readFileSync(join(mobileRoot, 'components/customer/v21/customer-kael-presentation.ts'), 'utf8')
const content = readFileSync(join(mobileRoot, 'components/customer/v21/customer-kael-chat-content.tsx'), 'utf8')
const controller = readFileSync(join(mobileRoot, 'components/customer/v21/use-customer-kael-surface-controller.ts'), 'utf8')
const evidenceActions = readFileSync(join(mobileRoot, 'components/customer/v21/use-customer-kael-evidence-actions.ts'), 'utf8')
const caseThreadNode = readFileSync(join(mobileRoot, 'components/customer/v21/customer-kael-case-thread-node.tsx'), 'utf8')
const candidateNode = readFileSync(join(mobileRoot, 'components/customer/v21/customer-worker-candidate-node.tsx'), 'utf8')
const kaelFeature = [presentation, content, controller, evidenceActions, caseThreadNode, candidateNode].join('\n')
const chatView = readFileSync(join(mobileRoot, 'components/customer/v21/chat-stateful-surfaces.tsx'), 'utf8')
const evidenceView = readFileSync(join(mobileRoot, 'components/customer/v21/agentic-evidence-stateful-surfaces.tsx'), 'utf8')
const candidateCard = readFileSync(join(mobileRoot, 'components/customer/kael-chat/worker-candidate-review-card.tsx'), 'utf8')
const completionCard = readFileSync(join(mobileRoot, 'components/customer/kael-chat/completion-review-card.tsx'), 'utf8')
const caseModel = readFileSync(join(mobileRoot, 'components/customer/v21/case-work-display-model.ts'), 'utf8')

describe('Kael Case Work phase-gated mobile wiring', () => {
  it('starts analysis after Basic Intake and derives evidence UI from the server artifact', () => {
    expect(presentation).toContain('diagnosis_scope')
    expect(presentation).toContain("artifactNextAction?.kind === 'request_evidence'")
    expect(evidenceActions).toContain('evidence_items')
    expect(kaelFeature).not.toMatch(/pendingDraft[\s\S]{0,1600}defer_analysis:\s*true/)
  })

  it('keeps analysis media and editable on-device voice available without revealing later phases', () => {
    expect(chatView).toContain('analysisEvidenceNode')
    expect(chatView).toContain('composerVoiceNode')
    expect(chatView).not.toContain('debugRevealAllPhases')
  })

  it('renders the exact server evidence request and prevents skipping mandatory visual proof', () => {
    expect(presentation).toContain("artifactNextAction?.evidence_kind")
    expect(presentation).toContain('localizedCaseWorkEvidencePrompt({')
    expect(presentation).toContain('diagnosisScope?.quote_blockers')
    expect(content).toContain('allowSkip={false}')
    expect(evidenceView).toContain('allowSkip')
    expect(evidenceView).toContain('{allowSkip ? (')
  })

  it('shows inspection/source honesty from estimate_card.v3 instead of confidence-only copy', () => {
    expect(chatView).toContain('estimate.needs_inspection === true')
    expect(chatView).toContain('estimate.needs_inspection_reason')
    expect(chatView).toContain('estimate.price_source')
    expect(presentation).toContain('chatEstimate.needs_inspection !== true')
  })

  it('shows a structured no-fake-price review state when the server blocks quote readiness', () => {
    expect(presentation).toContain("artifactNextAction?.kind === 'escalate'")
    expect(content).toContain('<QuoteReadinessReviewCard')
    expect(content).toContain('safetyMessages={presentation.serverSafetyMessages}')
  })

  it('reveals offers and completion/payment actions only at their server-confirmed phase', () => {
    expect(presentation).toContain("chat?.session.case_phase === 'offer_review'")
    expect(content).toContain('agenticEstimateNode={presentation.offerReviewActive &&')
    expect(caseThreadNode).toContain("deal.status === 'completed_by_worker'")
    expect(completionCard).toContain('customer-v21-completion-confirm')
    expect(caseModel).toContain("deal.status !== 'completed_by_worker'")
    expect(caseModel).toContain("['payment_pending', 'paid', 'reviewed'].includes(deal.status)")
    expect(caseModel).not.toContain("['confirmed_by_customer', 'reviewed'].includes(deal.status)")
    expect(caseModel).not.toContain("focus === 'payment'")
  })

  it('does not re-enter a client-invented evidence gate after matching starts', () => {
    expect(presentation).toContain('const caseEvidenceGateActive = false')
  })

  it('reveals the safe worker card only at the server candidate-review phase', () => {
    expect(controller).toContain("deal?.status === 'worker_candidate_pending'")
    expect(candidateNode).toContain("if (mode !== 'case' || !candidateJobId) return null")
    expect(content).toContain('workerCandidateNode={<CustomerWorkerCandidateNode controller={controller} />}')
    expect(content).not.toContain('workerCandidateNode={candidateJobId ?')
    expect(candidateCard).toContain('candidate.rating !== null && candidate.total_jobs > 0')
    expect(candidateCard).toContain('Địa chỉ chi tiết vẫn được khóa')
    expect(candidateCard).not.toMatch(/\b(?:phone|cccd|bank_account|address_unit|eta)\b/i)
  })
})
