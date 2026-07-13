import { describe, expect, it, vi } from 'vitest'

import { runJobIncidentAssistant } from '../../../../../supabase/functions/mobile-api/_shared/kael/job-incident'
import type { StructuredAIInvoker } from '../../../../../supabase/functions/mobile-api/_shared/kael/structured-call'

const incidentInput = {
  job: {
    id: '22222222-2222-4222-8222-222222222222',
    service_type: 'plumbing' as const,
    description: 'Ống dưới lavabo bị rò nước.',
    kael_problem_identified: 'Rò nước tại khu vực lavabo',
  },
  incident: {
    description: 'Có thêm đoạn ống nứt sau khi kiểm tra.',
    reason: 'Không thể xử lý trong phạm vi đã chốt.',
    evidence_count: 1,
  },
  event: {
    actor: 'worker' as const,
    text: 'Tôi đã thấy đoạn ống nứt phía sau lavabo.',
  },
  history: [{
    source_kind: 'incident_opened' as const,
    actor_role: 'worker' as const,
    content: 'Thợ đã gửi mô tả và một ảnh khu vực lavabo.',
    evidence_count: 1,
  }],
  language: 'vi' as const,
  secrets: {},
}

describe('Kael job incident assistant', () => {
  it('returns one sanitized, evidence-gated question without a price or workflow decision', async () => {
    const requests: Parameters<StructuredAIInvoker>[0][] = []
    const callAI = vi.fn<StructuredAIInvoker>(async (request) => {
      requests.push(request)
      return {
      success: true as const,
      content: JSON.stringify({
        summary: 'Kael đã ghi nhận dấu hiệu đường ống nứt sau lavabo.',
        next_actor: 'customer',
        question: 'Bạn có thể xác nhận khu vực này chưa nằm trong phạm vi đã chốt không?',
        evidence_status: 'needs_more',
        evidence_gaps: ['Cần khách xác nhận phạm vi ban đầu.'],
      }),
      usage: { inputTokens: 12, outputTokens: 24, costUsd: 0.0002 },
      latencyMs: 18,
      }
    })

    await expect(runJobIncidentAssistant({ ...incidentInput, callAI })).resolves.toMatchObject({
      fallback_used: false,
      next_actor: 'customer',
      evidence_status: 'needs_more',
      question: expect.stringContaining('xác nhận'),
    })
    expect(callAI).toHaveBeenCalledWith(expect.objectContaining({
      purpose: 'job_incident',
    }), expect.any(Object), undefined, expect.any(Object))
    const request = requests[0]
    const prompt = request?.messages[0]?.content
    expect(typeof prompt).toBe('string')
    if (typeof prompt === 'string') {
      expect(prompt).toContain('recent_allowed_events')
      expect(prompt).toContain('một ảnh khu vực lavabo')
    }
  })

  it('fails safe and does not mark the case ready when structured output is invalid', async () => {
    const callAI = vi.fn(async () => ({
      success: true as const,
      content: '{"summary":"thiếu trường bắt buộc"}',
      usage: { inputTokens: 8, outputTokens: 5, costUsd: 0.0001 },
      latencyMs: 14,
    }))

    await expect(runJobIncidentAssistant({ ...incidentInput, callAI })).resolves.toMatchObject({
      fallback_used: true,
      evidence_status: 'needs_more',
      next_actor: 'worker',
    })
  })
})
