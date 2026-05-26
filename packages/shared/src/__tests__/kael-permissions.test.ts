import { describe, expect, it } from 'vitest'
import {
  KAEL_ACTOR_ROLES,
  KAEL_FORBIDDEN_TOPICS,
  KAEL_JOB_RELATIONS,
  KAEL_PERMISSION_MATRIX_VERSION,
  KAEL_PERMISSION_RULES,
  KAEL_PURPOSES,
  resolveKaelPermission,
} from '../../kael/permissions'
import {
  DECLINE_TEMPLATES,
  renderDeclineTemplate,
} from '../../kael/decline-templates'

describe('Kael P5 permission matrix and response policy', () => {
  it('covers every purpose x actor x job relation combination exactly once', () => {
    const expectedCount =
      KAEL_PURPOSES.length * KAEL_ACTOR_ROLES.length * KAEL_JOB_RELATIONS.length
    const keys = new Set(
      KAEL_PERMISSION_RULES.map((rule) =>
        `${rule.purpose}:${rule.actor}:${rule.jobRelation}`
      ),
    )

    expect(KAEL_PERMISSION_MATRIX_VERSION).toBe('2026-05-25.p5')
    expect(KAEL_PURPOSES).toHaveLength(11)
    expect(KAEL_ACTOR_ROLES).toHaveLength(4)
    expect(KAEL_JOB_RELATIONS).toHaveLength(4)
    expect(KAEL_PERMISSION_RULES).toHaveLength(expectedCount)
    expect(keys.size).toBe(expectedCount)
  })

  it('allows educational legal-safety awareness but denies legal advice', () => {
    expect(resolveKaelPermission({
      purpose: 'educational_response',
      actor: 'customer',
      jobRelation: 'none',
      topic: 'legal_safety_awareness',
      action: 'generate_advisory',
    })).toMatchObject({
      decision: 'allow',
      reasonCode: 'ALLOW_EDUCATIONAL_RESPONSE',
    })

    expect(resolveKaelPermission({
      purpose: 'educational_response',
      actor: 'customer',
      jobRelation: 'none',
      topic: 'legal_advice',
      action: 'generate_advisory',
    })).toMatchObject({
      decision: 'deny',
      reasonCode: 'DENY_LEGAL_ADVICE',
      declineTemplateKey: 'legal_advice_redirect',
    })
  })

  it('declines unsupported services and exact guaranteed price claims', () => {
    for (const topic of ['out_of_scope_services_anything', 'exact_guaranteed_price'] as const) {
      expect(KAEL_FORBIDDEN_TOPICS).toContain(topic)
      expect(resolveKaelPermission({
        purpose: 'clarification',
        actor: 'customer',
        jobRelation: 'none',
        topic,
        action: 'ask_clarification',
      })).toMatchObject({
        decision: 'deny',
      })
    }
  })

  it('denies worker pre-accept access to specific job or address details', () => {
    expect(resolveKaelPermission({
      purpose: 'worker_brief',
      actor: 'worker',
      jobRelation: 'none',
      topic: 'other_jobs_specific',
      action: 'generate_worker_brief',
    })).toMatchObject({
      decision: 'deny',
      reasonCode: 'DENY_WORKER_PRE_ACCEPT_PII',
      declineTemplateKey: 'cannot_do_action',
    })
  })

  it('ships exactly eight Vietnamese decline templates without banned English UI words', () => {
    expect(Object.keys(DECLINE_TEMPLATES).sort()).toEqual([
      'cannot_do_action',
      'cost_cap_hit',
      'emergency_redirect',
      'legal_advice_redirect',
      'out_of_domain_question',
      'out_of_scope_service',
      'rate_limit_hit',
      'unsafe_or_sensitive',
    ])

    for (const key of Object.keys(DECLINE_TEMPLATES) as Array<keyof typeof DECLINE_TEMPLATES>) {
      const text = renderDeclineTemplate(key, {
        alternative: 'Bạn có thể tiếp tục trong luồng hỗ trợ phù hợp.',
        seconds: 30,
      })
      expect(text).toContain('Kael')
      expect(text).not.toMatch(/\b(Profile|Customer|Worker|Local|deal)\b/)
    }
  })
})
