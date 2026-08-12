import {
  initialKaelReasoningReceiptState,
  kaelReasoningReceiptReducer,
  parseKaelReasoningSseEvent,
} from '../kael-reasoning-receipt'

const receipt = {
  receiptId: 'kael-reasoning:test-123',
  schemaVersion: 'kael_reasoning.v1' as const,
}

describe('Kael reasoning receipt transport', () => {
  it('opens an honest pending receipt before the server timeline begins', () => {
    const pending = kaelReasoningReceiptReducer(initialKaelReasoningReceiptState, {
      type: 'begin',
    })
    const prematureStep = kaelReasoningReceiptReducer(pending, {
      event: {
        ...receipt,
        elapsedMs: 120,
        step: {
          detail: null,
          id: 'intent',
          label: 'Checked the request',
          sequence: 0,
          stage: 'intent',
          status: 'completed',
        },
        type: 'reasoning.step',
      },
      type: 'event',
    })

    expect(pending).toMatchObject({
      elapsedMs: 0,
      expanded: true,
      receiptId: null,
      status: 'running',
      steps: [],
    })
    expect(prematureStep).toBe(pending)
  })

  it('never marks a locally interrupted request as completed', () => {
    const pending = kaelReasoningReceiptReducer(initialKaelReasoningReceiptState, {
      type: 'begin',
    })
    const failed = kaelReasoningReceiptReducer(pending, {
      message: 'Kael is unavailable. Try again.',
      type: 'fail',
    })

    expect(failed).toMatchObject({
      expanded: false,
      failureMessage: 'Kael is unavailable. Try again.',
      status: 'failed',
    })
  })

  it('accepts only bounded public receipt events', () => {
    expect(parseKaelReasoningSseEvent('reasoning.completed', {
      elapsed_ms: 840,
      fallback_used: false,
      receipt_id: receipt.receiptId,
      schema_version: receipt.schemaVersion,
      summary: ['Kael đã kiểm tra yêu cầu và hoàn tất phản hồi an toàn.'],
    })).toEqual({
      elapsedMs: 840,
      fallbackUsed: false,
      receiptId: receipt.receiptId,
      schemaVersion: receipt.schemaVersion,
      summary: ['Kael đã kiểm tra yêu cầu và hoàn tất phản hồi an toàn.'],
      type: 'reasoning.completed',
    })

    expect(parseKaelReasoningSseEvent('reasoning.completed', {
      elapsed_ms: 840,
      fallback_used: false,
      receipt_id: receipt.receiptId,
      schema_version: receipt.schemaVersion,
      summary: ['Provider model returned sk-123456789012345678901234.'],
    })).toBeNull()

    expect(parseKaelReasoningSseEvent('reasoning.completed', {
      elapsed_ms: 840,
      fallback_used: false,
      receipt_id: receipt.receiptId,
      schema_version: receipt.schemaVersion,
      summary: ['DeepSeek selected a provider response.'],
    })).toBeNull()

    expect(parseKaelReasoningSseEvent('reasoning.completed', {
      elapsed_ms: 840,
      fallback_used: false,
      receipt_id: receipt.receiptId,
      schema_version: receipt.schemaVersion,
      summary: ['Mô hình đã dùng khóa API để trả lời.'],
    })).toBeNull()

    expect(parseKaelReasoningSseEvent('reasoning.completed', {
      elapsed_ms: 840,
      fallback_used: false,
      receipt_id: receipt.receiptId,
      schema_version: receipt.schemaVersion,
      summary: ['Contact details: 0901234567.'],
    })).toBeNull()

    expect(parseKaelReasoningSseEvent('reasoning.step', {
      elapsed_ms: 420,
      receipt_id: receipt.receiptId,
      schema_version: receipt.schemaVersion,
      step: {
        detail: 'Provider model returned sk-123456789012345678901234.',
        id: 'compose',
        label: 'Preparing a reply',
        sequence: 3,
        stage: 'compose',
        status: 'running',
      },
    })).toBeNull()
  })

  it('only renders server-received steps and ignores stale receipts', () => {
    const started = kaelReasoningReceiptReducer(initialKaelReasoningReceiptState, {
      event: {
        ...receipt,
        startedAt: '2026-08-10T00:00:00.000Z',
        type: 'reasoning.started',
      },
      type: 'event',
    })
    const completed = kaelReasoningReceiptReducer(started, {
      event: {
        ...receipt,
        elapsedMs: 420,
        step: {
          detail: null,
          id: 'intent',
          label: 'Đã kiểm tra yêu cầu',
          sequence: 0,
          stage: 'intent',
          status: 'completed',
        },
        type: 'reasoning.step',
      },
      type: 'event',
    })
    const stale = kaelReasoningReceiptReducer(completed, {
      event: {
        ...receipt,
        elapsedMs: 560,
        receiptId: 'kael-reasoning:stale',
        step: {
          detail: null,
          id: 'compose',
          label: 'Đang soạn phản hồi',
          sequence: 2,
          stage: 'compose',
          status: 'running',
        },
        type: 'reasoning.step',
      },
      type: 'event',
    })

    expect(completed.steps).toHaveLength(1)
    expect(completed.steps[0]).toMatchObject({ id: 'intent', status: 'completed' })
    expect(stale).toBe(completed)
  })

  it('collapses a completed receipt until the user explicitly reopens it', () => {
    const started = kaelReasoningReceiptReducer(initialKaelReasoningReceiptState, {
      event: {
        ...receipt,
        startedAt: '2026-08-10T00:00:00.000Z',
        type: 'reasoning.started',
      },
      type: 'event',
    })
    const completed = kaelReasoningReceiptReducer(started, {
      event: {
        ...receipt,
        elapsedMs: 2_300,
        fallbackUsed: false,
        summary: ['Kael da hoan tat phan hoi an toan.'],
        type: 'reasoning.completed',
      },
      type: 'event',
    })

    expect(started).toMatchObject({ expanded: true, status: 'running' })
    expect(completed).toMatchObject({ expanded: false, status: 'complete' })
    expect(kaelReasoningReceiptReducer(completed, { type: 'toggle' }))
      .toMatchObject({ expanded: true, status: 'complete' })
  })

  it('accepts a completed receipt without inventing a public summary', () => {
    const event = parseKaelReasoningSseEvent('reasoning.completed', {
      elapsed_ms: 2_300,
      fallback_used: false,
      receipt_id: receipt.receiptId,
      schema_version: receipt.schemaVersion,
      summary: [],
    })

    expect(event).toMatchObject({
      fallbackUsed: false,
      summary: [],
      type: 'reasoning.completed',
    })
  })

  it('keeps a terminal receipt immutable when delayed stream events arrive', () => {
    const started = kaelReasoningReceiptReducer(initialKaelReasoningReceiptState, {
      event: {
        ...receipt,
        startedAt: '2026-08-10T00:00:00.000Z',
        type: 'reasoning.started',
      },
      type: 'event',
    })
    const completed = kaelReasoningReceiptReducer(started, {
      event: {
        ...receipt,
        elapsedMs: 2_300,
        fallbackUsed: false,
        summary: ['Kael completed the safe reply.'],
        type: 'reasoning.completed',
      },
      type: 'event',
    })
    const completedThenFailed = kaelReasoningReceiptReducer(completed, {
      event: {
        ...receipt,
        elapsedMs: 2_500,
        publicMessage: 'Kael is unavailable. Try again.',
        recoverable: true,
        type: 'reasoning.failed',
      },
      type: 'event',
    })
    const failed = kaelReasoningReceiptReducer(started, {
      event: {
        ...receipt,
        elapsedMs: 2_300,
        publicMessage: 'Kael is unavailable. Try again.',
        recoverable: true,
        type: 'reasoning.failed',
      },
      type: 'event',
    })
    const failedThenCompleted = kaelReasoningReceiptReducer(failed, {
      event: {
        ...receipt,
        elapsedMs: 2_500,
        fallbackUsed: false,
        summary: ['Kael completed the safe reply.'],
        type: 'reasoning.completed',
      },
      type: 'event',
    })

    expect(completedThenFailed).toBe(completed)
    expect(failedThenCompleted).toBe(failed)
  })

  it('replaces the completed receipt when the next normal-chat turn begins', () => {
    const started = kaelReasoningReceiptReducer(initialKaelReasoningReceiptState, {
      event: {
        ...receipt,
        startedAt: '2026-08-10T00:00:00.000Z',
        type: 'reasoning.started',
      },
      type: 'event',
    })
    const completed = kaelReasoningReceiptReducer(started, {
      event: {
        ...receipt,
        elapsedMs: 2_300,
        fallbackUsed: false,
        summary: ['Kael completed the safe reply.'],
        type: 'reasoning.completed',
      },
      type: 'event',
    })
    const nextTurn = kaelReasoningReceiptReducer(completed, { type: 'begin' })

    expect(nextTurn).toMatchObject({
      elapsedMs: 0,
      expanded: true,
      receiptId: null,
      status: 'running',
      steps: [],
      summary: [],
    })
  })
})
