import type { ComponentProps } from 'react'
import { render, screen } from '@testing-library/react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import type { KaelChatResponse } from '@/lib/api-types'
import type { AppLanguage } from '@/lib/app-language'

import { getCustomerThemeTokens } from '../customer-theme'
import { buildQuoteBlockerView } from '../kael-chat/quote-blocker-view-model'
import { CustomerKaelAnalysisEvidenceNode } from '../kael-chat/customer-kael-analysis-evidence-node'
import { deriveCustomerKaelPresentation } from '../kael-chat/customer-kael-presentation'

export const PILLAR = {
  id: 'P393-quote-blocker-states',
  invariant:
    'the quote review card names the blocker the server recorded - missing scope, missing validated price evidence, both, a safety hold, an inspection need or a closed policy - in the selected language, says what Kael recorded and what happens next, never asks for details the customer already gave, never invents a price, and shows the quote-request button only when the server offers it',
  authority: [
    'governance/RULES.md #4 (no price without validated evidence; a worker quote needs customer approval)',
    'governance/RULES.md #5 (selected-language copy)',
    'governance/RULES.md #8 (no fake data or silent degradation)',
    'governance/protocols/frontend-test.md G2 (state coverage)',
  ],
  target: 'apps/mobile/components/customer/kael-chat/quote-readiness-review-response.tsx',
  layer: 'ui-visual',
  siblings: ['P375-quote-review-send-request', 'P46-stage1-customer-intake-mode'],
  mutation:
    'send every escalation to one generic sentence - the scope, price-evidence, both, inspection and policy cases turn red; render the card after confirmation - the confirmed case turns red',
} as const satisfies PillarManifest

type Controller = ComponentProps<typeof CustomerKaelAnalysisEvidenceNode>['controller']
type Session = Record<string, unknown>

const UNIT_SLOT = 'unit_type_count_and_capacity'
const SYMPTOM_SLOT = 'symptom_and_operating_condition'
const UNIT_FACT_VI = '2 máy treo tường 1HP.'
const UNIT_FACT_EN = 'Two 1 HP wall units.'

const rfqCoverage = {
  confirmation_kind: 'rfq_request',
  missing_enrichment_slots: [],
  missing_required_fields: [],
  next_action: 'rfq_review',
  order_eligible: true,
  policy_id: '0b6f1c40-6f9c-4d0e-9d0e-1b6f1c406f9c',
  policy_version: 1,
  quote_mode: 'rfq',
  safety_blocker: null,
}

function scope(overrides: Session): Session {
  return {
    evidence: [],
    facts: {},
    missing_facts: [],
    quote_blockers: [],
    quote_ready: false,
    safety_flags: [],
    service_type: 'hvac',
    ...overrides,
  }
}

function renderCard(sessionOverrides: Session, language: AppLanguage = 'vi') {
  const chat = {
    session: {
      case_phase: 'analysis',
      id: 'session-blocker',
      job_id: null,
      next_action: 'wait',
      service_type: 'hvac',
      status: 'active',
      ...sessionOverrides,
    },
    turns: [],
  } as unknown as KaelChatResponse
  const presentation = deriveCustomerKaelPresentation({
    assistantTurns: [],
    caseEditOpen: false,
    catalogTurns: [],
    chat,
    deal: null,
    intakeDisplayMessage: null,
    jobIncidentMessages: [],
    language,
    loading: false,
    mode: 'case',
    pendingDraft: null,
    pendingDraftLocalizedMessage: null,
    processLines: null,
    routeDraftEvidencePending: false,
    submittingAgenticEvidence: false,
    turns: [],
  })
  const controller = {
    chatUi: { confirmingAgenticEstimate: false, submittingAgenticEvidence: false, uploadingMedia: false },
    conversation: { chat, composerMediaDrafts: [], loading: false, streamingReply: null, turns: [] },
    decisionActions: { confirmAgenticEstimate: jest.fn(), confirmationReconciling: false },
    evidenceActions: {},
    language,
    mode: 'case',
    nextActions: { runNextAction: jest.fn(), sendingActionId: null },
    presentation,
    processController: { processLines: null },
    reduceMotion: true,
    tokens: getCustomerThemeTokens('light'),
  } as unknown as Controller
  render(<CustomerKaelAnalysisEvidenceNode controller={controller} />)
}

function shown() {
  const text = (testID: string) => {
    const nodes = screen.queryAllByTestId(testID)
    return nodes.length > 0 ? String(nodes[0].props.children) : ''
  }
  return {
    note: text('customer-v21-case-work-response-note-copy'),
    status: text('customer-v21-case-work-response-status'),
    title: text('customer-v21-case-work-response-title'),
  }
}

const scopeMissingScope = scope({
  facts: { price_readiness: undefined },
  missing_facts: [UNIT_SLOT],
  next_action: { kind: 'escalate', reason: `missing_profile_fact:${UNIT_SLOT}` },
  quote_blockers: [`missing_profile_fact:${UNIT_SLOT}`],
})

const priceUnavailableScope = (fact: string) => scope({
  facts: { [UNIT_SLOT]: fact, price_readiness: 'validated_price_evidence_unavailable' },
  next_action: { kind: 'escalate', reason: 'validated_price_evidence_unavailable' },
  quote_blockers: ['validated_price_evidence'],
  scope_summary: 'Vệ sinh máy lạnh treo tường',
})

const bothMissingScope = scope({
  facts: { price_readiness: 'validated_price_evidence_unavailable' },
  missing_facts: [SYMPTOM_SLOT],
  next_action: { kind: 'escalate', reason: 'validated_price_evidence_unavailable' },
  quote_blockers: [SYMPTOM_SLOT, 'validated_price_evidence'],
})

describe(`${PILLAR.id}`, () => {
  it('names the missing scope detail when scope is the only gap', () => {
    renderCard({ diagnosis_scope: scopeMissingScope })
    const { note, title } = shown()
    withPillarContext(PILLAR, () => {
      expect(title).toBe('Cần thêm thông tin phạm vi')
      expect(note).toMatch(/Loại máy lạnh/)
      expect(note).not.toMatch(/nguồn giá/)
    }, 'a scope gap names the detail Kael still needs and does not blame price evidence')
  })

  it('does not ask the customer to repeat unit details when only price evidence is missing', () => {
    renderCard({ diagnosis_scope: priceUnavailableScope(UNIT_FACT_VI) })
    const { note, title } = shown()
    withPillarContext(PILLAR, () => {
      expect(title).toBe('Chưa có nguồn giá đã kiểm chứng')
      expect(note).toContain(UNIT_FACT_VI)
      expect(note).toMatch(/không cần nhập lại/)
      expect(note).toMatch(/nguồn giá đã kiểm chứng/)
      expect(note).not.toMatch(/còn thiếu/)
    }, 'complete scope with no validated price shows what Kael recorded and never re-asks for it')
  })

  it('reports both gaps when scope and price evidence are both missing', () => {
    renderCard({ diagnosis_scope: bothMissingScope })
    const { note, title } = shown()
    withPillarContext(PILLAR, () => {
      expect(title).toBe('Thiếu thông tin và nguồn giá')
      expect(note).toMatch(/Hiện tượng máy/)
      expect(note).toMatch(/nguồn giá đã kiểm chứng/)
    }, 'both blockers appear in one truthful message')
  })

  it('exposes the blocker to assistive technology as one labelled note with a live status', () => {
    renderCard({ diagnosis_scope: priceUnavailableScope(UNIT_FACT_VI) })
    const { note, status } = shown()
    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('customer-v21-case-work-response-note').props.accessibilityLabel)
        .toBe(`Vì sao chưa có giá. ${note}`)
      expect(screen.getByTestId('customer-v21-case-work-response-status').props.accessibilityLiveRegion).toBe('polite')
      expect(screen.getByTestId('customer-v21-case-work-response-status').props.accessibilityLabel).toBe(status)
    }, 'screen readers hear the specific reason, not a generic review notice')
  })

  it('keeps the safety hold first and offers no send button under it', () => {
    renderCard({
      diagnosis_scope: scope({
        next_action: { kind: 'escalate', reason: 'Cần ngắt nguồn điện.' },
        quote_blockers: ['safety_gate:hvac_electrical_refrigerant_or_burning_hazard'],
        safety_flags: [{ code: 'hvac_electrical_refrigerant_or_burning_hazard', severity: 'stop' }],
      }),
      intake_coverage: rfqCoverage,
      next_action: 'rfq_review',
    })
    const { title } = shown()
    withPillarContext(PILLAR, () => {
      expect(title).toBe('Cần xử lý an toàn trước')
      expect(screen.queryByTestId('customer-v21-quote-review-send-request')).toBeNull()
    }, 'a safety hold stays visible and is never sent to workers from the card')
  })

  it('states that the policy has closed quoting when the coverage says blocked', () => {
    renderCard({
      diagnosis_scope: scope({ next_action: { kind: 'escalate', reason: 'manual_review_required' } }),
      intake_coverage: {
        ...rfqCoverage,
        confirmation_kind: 'none',
        next_action: 'blocked',
        order_eligible: false,
        quote_mode: 'blocked',
      },
    })
    const { note, title } = shown()
    withPillarContext(PILLAR, () => {
      expect(title).toBe('Chưa mở báo giá cho yêu cầu này')
      expect(note).toMatch(/chính sách/i)
    }, 'a closed policy is reported as a policy stop, not as missing data')
  })

  it('renders no review card and no worker-search claim once the request is confirmed', () => {
    renderCard({
      diagnosis_scope: priceUnavailableScope(UNIT_FACT_VI),
      job_id: 'job-1',
      next_action: 'confirmed',
      status: 'confirmed',
    })
    withPillarContext(PILLAR, () => {
      expect(screen.queryByTestId('customer-v21-quote-readiness-review')).toBeNull()
      expect(screen.queryByText(/chưa tìm thợ/)).toBeNull()
    }, 'a confirmed request must not claim that no worker search has started')
  })

  it('degrades an unknown reason code to a neutral review without inventing a cause', () => {
    renderCard({ diagnosis_scope: scope({ next_action: { kind: 'escalate', reason: 'brand_new_server_code' } }) })
    const { note, title } = shown()
    withPillarContext(PILLAR, () => {
      expect(title).toBe('Báo giá cần rà soát')
      expect(note).not.toMatch(/brand_new_server_code/)
      expect(note).not.toMatch(/còn thiếu|nguồn giá/)
      expect(note).toMatch(/không tự đoán giá/)
    }, 'an unrecognised reason never fabricates a cause, a price or an action')
  })

  it('reads a legacy artifact that carries only the escalation reason code', () => {
    renderCard({
      diagnosis_scope: { next_action: { kind: 'escalate', reason: 'validated_price_evidence_unavailable' } },
    })
    const { note, title } = shown()
    withPillarContext(PILLAR, () => {
      expect(title).toBe('Chưa có nguồn giá đã kiểm chứng')
      expect(note).toMatch(/nguồn giá đã kiểm chứng/)
      expect(note).not.toMatch(/còn thiếu/)
    }, 'a response from before blockers were structured still resolves to the price-evidence message')
  })

  it('shows the quote-request button with the price gap only when the server offers one', () => {
    renderCard({
      diagnosis_scope: priceUnavailableScope(UNIT_FACT_VI),
      intake_coverage: rfqCoverage,
      next_action: 'rfq_review',
    })
    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('customer-v21-quote-review-send-request')).toBeOnTheScreen()
    }, 'the server-offered RFQ keeps its explicit send button')
  })

  it('shows no send button when the server offers no request', () => {
    renderCard({ diagnosis_scope: priceUnavailableScope(UNIT_FACT_VI) })
    withPillarContext(PILLAR, () => {
      expect(screen.queryByTestId('customer-v21-quote-review-send-request')).toBeNull()
    }, 'no request is routed from the price gap unless the active policy allows it')
  })

  it.each([
    ['scope', scopeMissingScope, 'More scope details needed', /Unit type/],
    ['price', priceUnavailableScope(UNIT_FACT_EN), 'No verified price source yet', /validated price/],
    ['both', bothMissingScope, 'Details and price source missing', /What happens/],
  ])('keeps the %s message in English with no Vietnamese', (_name, diagnosisScope, expectedTitle, expected) => {
    renderCard({ diagnosis_scope: diagnosisScope }, 'en')
    const { note, status, title } = shown()
    withPillarContext(PILLAR, () => {
      expect(title).toBe(expectedTitle)
      expect(note).toMatch(expected)
      expect(`${title} ${status} ${note}`.replace(UNIT_FACT_EN, '')).not.toMatch(/[ạảãàáâấầẩẫậăắằẳẵặẹẻẽèéêếềểễệỉĩịọỏõòóôốồổỗộơớờởỡợụủũùúưứừửữựỳỷỹỵđ]/i)
    }, 'English mode shows no mixed-language copy')
  })
})

describe(`${PILLAR.id} view model`, () => {
  it('lets the closed policy win over every other recorded blocker', () => {
    const view = buildQuoteBlockerView({
      diagnosisScope: bothMissingScope,
      intakeCoverage: { quote_mode: 'blocked' },
    })
    withPillarContext(PILLAR, () => {
      expect(view.kind).toBe('policy_blocked')
    }, 'a closed policy is never reported as missing data')
  })

  it('reports an inspection need ahead of the missing detail that caused it', () => {
    const view = buildQuoteBlockerView({
      diagnosisScope: scope({
        next_action: { kind: 'escalate', reason: 'Cần xác minh tại chỗ.' },
        quote_blockers: [`missing_profile_fact:${UNIT_SLOT}`, 'onsite_inspection_required'],
      }),
    })
    expect(view.kind).toBe('inspection_required')
    expect(view.missingSlots).toEqual([UNIT_SLOT])
  })

  it('does not infer a price gap from a stale readiness fact', () => {
    const view = buildQuoteBlockerView({
      diagnosisScope: scope({
        facts: { price_readiness: 'validated_price_evidence_unavailable' },
        missing_facts: [UNIT_SLOT],
        next_action: { kind: 'escalate', reason: `missing_profile_fact:${UNIT_SLOT}` },
        quote_blockers: [`missing_profile_fact:${UNIT_SLOT}`],
      }),
    })
    expect(view.kind).toBe('scope_missing')
  })

  it('keeps a free-text reason out of the cause and falls back to the unspecified review', () => {
    const view = buildQuoteBlockerView({
      diagnosisScope: scope({ next_action: { kind: 'escalate', reason: 'Cần ngắt nguồn điện trước khi tiếp tục.' } }),
    })
    expect(view.kind).toBe('review_unspecified')
    expect(view.missingSlots).toEqual([])
  })

  it.each([null, undefined, 'text', 7, [], { quote_blockers: 'oops', missing_facts: [1, null], facts: [] }])(
    'survives a malformed artifact %#',
    (diagnosisScope) => {
      expect(buildQuoteBlockerView({ diagnosisScope }).kind).toBe('review_unspecified')
    },
  )

  it('records only confirmed facts that are not still missing, capped and truncated', () => {
    const long = 'x'.repeat(200)
    const view = buildQuoteBlockerView({
      diagnosisScope: scope({
        facts: {
          [UNIT_SLOT]: long,
          [SYMPTOM_SLOT]: 'Không mát',
          requested_work_mode: 'Sửa',
          maintenance_history: 'Một năm trước',
          problem_summary: 'not a quote slot',
        },
        missing_facts: ['maintenance_history'],
        next_action: { kind: 'escalate', reason: 'validated_price_evidence_unavailable' },
        quote_blockers: ['validated_price_evidence', 'maintenance_history'],
      }),
    })
    expect(view.recorded.map((item) => item.slot)).toEqual(['requested_work_mode', UNIT_SLOT, SYMPTOM_SLOT])
    expect(view.recorded.find((item) => item.slot === UNIT_SLOT)?.value.length).toBe(80)
  })
})
