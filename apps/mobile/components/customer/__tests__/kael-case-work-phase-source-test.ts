import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const mobileRoot = join(process.cwd())
const surfaces = readFileSync(join(mobileRoot, 'components/customer/v21/surfaces.tsx'), 'utf8')
const chatView = readFileSync(join(mobileRoot, 'components/customer/v21/chat-stateful-surfaces.tsx'), 'utf8')
const evidenceView = readFileSync(join(mobileRoot, 'components/customer/v21/agentic-evidence-stateful-surfaces.tsx'), 'utf8')
const candidateCard = readFileSync(join(mobileRoot, 'components/customer/kael-chat/worker-candidate-review-card.tsx'), 'utf8')
const completionCard = readFileSync(join(mobileRoot, 'components/customer/kael-chat/completion-review-card.tsx'), 'utf8')
const caseModel = readFileSync(join(mobileRoot, 'components/customer/v21/case-work-display-model.ts'), 'utf8')

describe('Kael Case Work phase-gated mobile wiring', () => {
  it('starts analysis after Basic Intake and derives evidence UI from the server artifact', () => {
    expect(surfaces).toContain('diagnosis_scope')
    expect(surfaces).toContain("artifactNextAction?.kind === 'request_evidence'")
    expect(surfaces).toContain('evidence_items')
    expect(surfaces).not.toMatch(/pendingDraft[\s\S]{0,1600}defer_analysis:\s*true/)
  })

  it('keeps analysis media and editable on-device voice available without revealing later phases', () => {
    expect(chatView).toContain('analysisEvidenceNode')
    expect(chatView).toContain('composerVoiceNode')
    expect(chatView).not.toContain('debugRevealAllPhases')
  })

  it('renders the exact server evidence request and prevents skipping mandatory visual proof', () => {
    expect(surfaces).toContain("artifactNextAction?.evidence_kind")
    expect(surfaces).toContain('localizedCaseWorkEvidencePrompt({')
    expect(surfaces).toContain('diagnosisScope?.quote_blockers')
    expect(surfaces).toContain('allowSkip={false}')
    expect(evidenceView).toContain('allowSkip')
    expect(evidenceView).toContain('{allowSkip ? (')
  })

  it('shows inspection/source honesty from estimate_card.v3 instead of confidence-only copy', () => {
    expect(chatView).toContain('estimate.needs_inspection === true')
    expect(chatView).toContain('estimate.needs_inspection_reason')
    expect(chatView).toContain('estimate.price_source')
    expect(surfaces).toContain('chatEstimate.needs_inspection !== true')
  })

  it('shows a structured no-fake-price review state when the server blocks quote readiness', () => {
    expect(surfaces).toContain("artifactNextAction?.kind === 'escalate'")
    expect(surfaces).toContain('<QuoteReadinessReviewCard')
    expect(surfaces).toContain('safetyMessages={serverSafetyMessages}')
  })

  it('reveals offers and completion/payment actions only at their server-confirmed phase', () => {
    expect(surfaces).toContain("activeChat?.session.case_phase === 'offer_review'")
    expect(surfaces).toContain('const activeChat = chatModeOwner === mode ? chat : null')
    expect(surfaces).toContain('agenticEstimateNode={offerReviewActive && chatEstimate')
    expect(surfaces).toContain("deal.status === 'completed_by_worker'")
    expect(completionCard).toContain('customer-v21-completion-confirm')
    expect(caseModel).toContain("deal.status !== 'completed_by_worker'")
    expect(caseModel).toContain("['payment_pending', 'paid', 'reviewed'].includes(deal.status)")
    expect(caseModel).not.toContain("['confirmed_by_customer', 'reviewed'].includes(deal.status)")
    expect(caseModel).not.toContain("focus === 'payment'")
  })

  it('does not re-enter a client-invented evidence gate after matching starts', () => {
    expect(surfaces).toContain('const caseEvidenceGateActive = false')
  })

  it('reveals the safe worker card only at the server candidate-review phase', () => {
    expect(surfaces).toContain("deal?.status === 'worker_candidate_pending'")
    expect(surfaces).toContain("if (mode !== 'case' || !candidateJobId) return null")
    expect(surfaces).toContain('workerCandidateNode={workerCandidateNode}')
    expect(surfaces).not.toContain('workerCandidateNode={candidateJobId ?')
    expect(candidateCard).toContain('candidate.rating !== null && candidate.total_jobs > 0')
    expect(candidateCard).toContain('Địa chỉ chi tiết vẫn được khóa')
    expect(candidateCard).not.toMatch(/\b(?:phone|cccd|bank_account|address_unit|eta)\b/i)
  })
})
