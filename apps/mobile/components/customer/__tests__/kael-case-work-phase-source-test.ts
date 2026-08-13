import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Only banned patterns are read as text here. What the Case Work surface renders
// at each phase is covered by customer-kael-chat-surface-test.tsx, which mounts
// the real components — a substring in a .tsx file cannot prove a phase gate, and
// this app has a layer that can. What a render test cannot prove is that a
// removed rail, a debug escape hatch, or a PII field never comes back, because
// absent code renders nothing.
const mobileRoot = join(process.cwd())
const presentation = readFileSync(join(mobileRoot, 'components/customer/kael-chat/customer-kael-presentation.ts'), 'utf8')
const content = readFileSync(join(mobileRoot, 'components/customer/kael-chat/customer-kael-chat-content.tsx'), 'utf8')
const controller = readFileSync(join(mobileRoot, 'components/customer/kael-chat/use-customer-kael-surface-controller.ts'), 'utf8')
const evidenceActions = readFileSync(join(mobileRoot, 'components/customer/kael-chat/use-customer-kael-evidence-actions.ts'), 'utf8')
const analysisEvidenceNode = readFileSync(join(mobileRoot, 'components/customer/kael-chat/customer-kael-analysis-evidence-node.tsx'), 'utf8')
const caseThreadNode = readFileSync(join(mobileRoot, 'components/customer/kael-chat/customer-kael-case-thread-node.tsx'), 'utf8')
const candidateNode = readFileSync(join(mobileRoot, 'components/customer/kael-chat/customer-worker-candidate-node.tsx'), 'utf8')
const kaelFeature = [presentation, content, controller, evidenceActions, analysisEvidenceNode, caseThreadNode, candidateNode].join('\n')
const chatView = readFileSync(join(mobileRoot, 'components/customer/kael-chat/chat-stateful-surfaces.tsx'), 'utf8')
const caseThread = readFileSync(join(mobileRoot, 'components/customer/kael-chat/chat-case-thread-stateful-surfaces.tsx'), 'utf8')
const paymentSurface = readFileSync(join(mobileRoot, 'components/customer/kael-chat/customer-payment-rail-surface.tsx'), 'utf8')
const candidateResponse = readFileSync(join(mobileRoot, 'components/customer/kael-chat/worker-candidate-review-response.tsx'), 'utf8')

describe('Kael Case Work — patterns that must not reappear', () => {
  it('never defers analysis from a client-held draft', () => {
    expect(kaelFeature).not.toMatch(/pendingDraft[\s\S]{0,1600}defer_analysis:\s*true/)
  })

  it('keeps composer voice and later-phase debug reveals out of the evidence response', () => {
    expect(chatView).not.toContain('composerVoiceNode')
    expect(content).not.toContain('<OnDeviceVoiceTranscript')
    expect(chatView).not.toContain('debugRevealAllPhases')
  })

  it('carries no SePay or staging payment rail in the customer case thread', () => {
    expect(caseThread).not.toContain('SePayVietQrPaymentDetails')
    expect(caseThread).not.toContain('customer-v21-case-sepay-payment-confirm')
    expect(caseThread).not.toContain('customer-v21-case-staging-payment')
    expect(caseThread).not.toContain('staging_simulator')
    expect(paymentSurface).not.toContain('staging_simulator')
    expect(caseThreadNode).not.toContain('stagingPaymentRailEnabled')
    expect(caseThread).not.toContain("focus === 'payment'")
  })

  it('does not invent a legacy payment rail when the server omits one', () => {
    expect(caseThreadNode).not.toContain("deal.paymentRailAvailable === true ? 'sepay_vietqr' : null")
  })

  it('does not gate the worker candidate node on a client-held job id, and leaks no identity field', () => {
    expect(content).not.toContain('workerCandidateNode={candidateJobId ?')
    expect(candidateResponse).not.toMatch(/\b(?:phone|cccd|bank_account|address_unit|eta)\b/i)
  })
})
