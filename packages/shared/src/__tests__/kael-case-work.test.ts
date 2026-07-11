import { describe, expect, it } from 'vitest'

import {
  CASE_WORK_PHASES,
  diagnosisScopeArtifactSchema,
  type DiagnosisScopeArtifact,
} from '../index'

const baseArtifact: DiagnosisScopeArtifact = {
  version: 1,
  service_type: 'hvac',
  profile_id: 'air_scope',
  case_phase: 'analysis',
  facts: {
    customer_goal: 'Máy lạnh yếu và chảy nước',
    unit_count: 1,
  },
  missing_facts: ['error_code'],
  evidence: [
    {
      kind: 'video_frame',
      ref: 'supabase://kael-chat-media/customer-id/kael-chat/model_vision/frame-1.jpg',
      model_eligible: true,
    },
  ],
  safety_flags: [],
  scope_summary: null,
  quote_ready: false,
  quote_blockers: ['error_code'],
  worker_requirements: ['hvac_diagnosis'],
  confidence: 0.62,
  next_action: {
    kind: 'ask_question',
    question: 'Máy có hiện mã lỗi nào không?',
  },
  updated_at: '2026-07-11T02:00:00.000Z',
}

describe('Kael Case Work shared contract', () => {
  it('keeps phase order explicit so UI reveal can stay server-driven', () => {
    expect(CASE_WORK_PHASES).toEqual([
      'analysis',
      'offer_review',
      'matching',
      'worker_candidate_review',
      'worker_en_route',
      'service_execution',
      'scope_change_review',
      'completion_review',
      'payment',
      'review',
      'closed',
    ])
  })

  it('accepts a versioned quote-blocked artifact with exactly one next action', () => {
    expect(diagnosisScopeArtifactSchema.parse(baseArtifact)).toEqual(baseArtifact)
  })

  it('rejects an estimate-ready artifact while blockers remain', () => {
    expect(() => diagnosisScopeArtifactSchema.parse({
      ...baseArtifact,
      quote_ready: true,
      case_phase: 'offer_review',
    })).toThrow()
  })

  it('rejects raw audio and raw video as model evidence', () => {
    for (const kind of ['raw_audio', 'raw_video']) {
      expect(() => diagnosisScopeArtifactSchema.parse({
        ...baseArtifact,
        evidence: [{ kind, model_eligible: true }],
      })).toThrow()
    }
  })

  it('accepts a reviewed voice transcript without a raw audio reference', () => {
    const parsed = diagnosisScopeArtifactSchema.parse({
      ...baseArtifact,
      evidence: [{
        kind: 'voice_transcript',
        transcript: 'Máy kêu to hơn bình thường.',
        model_eligible: true,
      }],
    })

    expect(parsed.evidence[0]).not.toHaveProperty('ref')
  })
})
