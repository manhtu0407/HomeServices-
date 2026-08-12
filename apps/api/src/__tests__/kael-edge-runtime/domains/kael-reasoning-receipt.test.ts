import { describe, expect, it } from 'vitest'

import {
  createKaelReasoningReporter,
} from '../../../../../../supabase/functions/mobile-api/_shared/kael/reasoning-receipt'

describe('Kael public reasoning receipt', () => {
  it('emits only explicit, ordered public milestones', () => {
    const events: Array<{ data: unknown; event: string }> = []
    const reporter = createKaelReasoningReporter({
      emit: (event, data) => events.push({ data, event }),
      receiptId: 'kael-reasoning:test-123',
      startedAt: new Date('2026-08-10T00:00:00.000Z'),
    })

    reporter.step({
      id: 'intent',
      label: 'Đã kiểm tra yêu cầu',
      sequence: 0,
      stage: 'intent',
      status: 'completed',
    })
    reporter.complete({
      fallbackUsed: false,
      summary: ['Kael đã hoàn tất phản hồi an toàn.'],
    })

    expect(events.map((entry) => entry.event)).toEqual([
      'reasoning.started',
      'reasoning.step',
      'reasoning.completed',
    ])
  })

  it('does not fabricate a terminal summary when no public note is available', () => {
    const events: Array<{ data: unknown; event: string }> = []
    const reporter = createKaelReasoningReporter({
      emit: (event, data) => events.push({ data, event }),
      receiptId: 'kael-reasoning:test-empty-summary',
      startedAt: new Date('2026-08-10T00:00:00.000Z'),
    })

    reporter.complete({ fallbackUsed: false, summary: [] })

    expect(events).toHaveLength(2)
    expect(events[1]).toMatchObject({
      data: { summary: [] },
      event: 'reasoning.completed',
    })
  })

  it('refuses provider and secret-like material before it reaches SSE', () => {
    const reporter = createKaelReasoningReporter({
      emit: () => undefined,
      receiptId: 'kael-reasoning:test-unsafe',
    })

    expect(() => reporter.complete({
      fallbackUsed: false,
      summary: ['Provider model used sk-123456789012345678901234.'],
    })).toThrow('KAEL_REASONING_PUBLIC_TEXT_UNSAFE')

    expect(() => reporter.complete({
      fallbackUsed: false,
      summary: ['Contact the customer at 0901234567.'],
    })).toThrow('KAEL_REASONING_PUBLIC_TEXT_UNSAFE')

    expect(() => reporter.complete({
      fallbackUsed: false,
      summary: ['DeepSeek selected a provider response.'],
    })).toThrow('KAEL_REASONING_PUBLIC_TEXT_UNSAFE')

    expect(() => reporter.complete({
      fallbackUsed: false,
      summary: ['Mô hình đã dùng khóa API để trả lời.'],
    })).toThrow('KAEL_REASONING_PUBLIC_TEXT_UNSAFE')
  })

  it('emits one safe terminal failure and never overwrites it with completion', () => {
    const events: Array<{ data: unknown; event: string }> = []
    const reporter = createKaelReasoningReporter({
      emit: (event, data) => events.push({ data, event }),
      receiptId: 'kael-reasoning:test-failure',
      startedAt: new Date('2026-08-10T00:00:00.000Z'),
    })

    reporter.fail({
      publicMessage: 'Kael could not complete this reply. Please try again.',
      recoverable: true,
    })
    reporter.complete({
      fallbackUsed: false,
      summary: ['This completion must not replace the failure.'],
    })

    expect(events.map((entry) => entry.event)).toEqual([
      'reasoning.started',
      'reasoning.failed',
    ])
    expect(events[1]?.data).toMatchObject({
      public_message: 'Kael could not complete this reply. Please try again.',
      recoverable: true,
    })
  })
})
