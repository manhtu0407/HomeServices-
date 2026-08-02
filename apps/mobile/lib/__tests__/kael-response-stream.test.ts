import {
  appendLegacyKaelResponseDelta,
  createCompletedKaelResponseState,
  initialKaelResponseStreamState,
  kaelResponseStreamReducer,
  segmentKaelResponseText,
} from '../kael-response-stream'

describe('Kael response stream state', () => {
  it('segments a verified answer into stable supported reading blocks', () => {
    const blocks = segmentKaelResponseText([
      '## Cach xu ly',
      '',
      'Kael da doi chieu mo ta va khu vuc.',
      '',
      '1. Kiem tra nguon dien',
      '2. Xac nhan pham vi',
      '',
      '> Khong thao tac khi tay uot.',
    ].join('\n'), 'turn-1')

    expect(blocks.map((block) => ({ id: block.id, kind: block.kind }))).toEqual([
      { id: 'turn-1:block:0', kind: 'heading' },
      { id: 'turn-1:block:1', kind: 'paragraph' },
      { id: 'turn-1:block:2', kind: 'list' },
      { id: 'turn-1:block:3', kind: 'callout' },
    ])
    expect(blocks.map((block) => block.text)).toEqual([
      '## Cach xu ly',
      'Kael da doi chieu mo ta va khu vuc.',
      '1. Kiem tra nguon dien\n2. Xac nhan pham vi',
      '> Khong thao tac khi tay uot.',
    ])
  })

  it('applies append-only lifecycle events and ignores deltas for unknown blocks', () => {
    const started = kaelResponseStreamReducer(initialKaelResponseStreamState, {
      mode: 'fast',
      responseId: 'turn-1',
      type: 'response.started',
    })
    const withBlock = kaelResponseStreamReducer(started, {
      blockId: 'turn-1:block:0',
      kind: 'paragraph',
      type: 'block.started',
    })
    const malformed = kaelResponseStreamReducer(withBlock, {
      blockId: 'missing',
      delta: 'Khong duoc chen',
      type: 'block.text.delta',
    })
    const withText = kaelResponseStreamReducer(malformed, {
      blockId: 'turn-1:block:0',
      delta: 'Kael dang tra loi.',
      type: 'block.text.delta',
    })
    const completed = kaelResponseStreamReducer(withText, {
      blockId: 'turn-1:block:0',
      type: 'block.completed',
    })

    expect(malformed).toBe(withBlock)
    expect(completed.blocks['turn-1:block:0']).toMatchObject({
      status: 'completed',
      text: 'Kael dang tra loi.',
    })
    expect(kaelResponseStreamReducer(completed, {
      elapsedMs: 840,
      responseId: 'turn-1',
      type: 'response.completed',
    })).toMatchObject({ elapsedMs: 840, status: 'completed' })
  })

  it('rejects foreign blocks, caps block count, and keeps terminal state stable', () => {
    let state = kaelResponseStreamReducer(initialKaelResponseStreamState, {
      mode: 'fast',
      responseId: 'turn-guarded',
      type: 'response.started',
    })
    expect(kaelResponseStreamReducer(state, {
      blockId: 'foreign:block:0',
      kind: 'paragraph',
      type: 'block.started',
    })).toBe(state)

    for (let index = 0; index < 60; index += 1) {
      state = kaelResponseStreamReducer(state, {
        blockId: `turn-guarded:block:${index}`,
        kind: 'paragraph',
        type: 'block.started',
      })
    }
    expect(state.blockOrder).toHaveLength(32)

    const completed = kaelResponseStreamReducer(state, {
      elapsedMs: 1_200,
      responseId: 'turn-guarded',
      type: 'response.completed',
    })
    expect(kaelResponseStreamReducer(completed, {
      message: 'late failure',
      recoverable: false,
      responseId: 'turn-guarded',
      type: 'response.failed',
    })).toBe(completed)
  })

  it('marks active blocks failed when the response fails before completion', () => {
    const started = kaelResponseStreamReducer(initialKaelResponseStreamState, {
      mode: 'fast',
      responseId: 'turn-failed',
      type: 'response.started',
    })
    const withBlock = kaelResponseStreamReducer(started, {
      blockId: 'turn-failed:block:0',
      kind: 'paragraph',
      type: 'block.started',
    })
    const failed = kaelResponseStreamReducer(withBlock, {
      message: 'Khong the tiep tuc.',
      recoverable: true,
      responseId: 'turn-failed',
      type: 'response.failed',
    })

    expect(failed.status).toBe('failed')
    expect(failed.blocks['turn-failed:block:0'].status).toBe('failed')
  })

  it('keeps legacy response_delta compatible without overriding a universal stream', () => {
    const legacy = appendLegacyKaelResponseDelta(null, {
      delta: 'Kael ',
      turnId: 'turn-legacy',
      type: 'response_delta',
    })
    const legacyComplete = appendLegacyKaelResponseDelta(legacy, {
      delta: 'tra loi.',
      turnId: 'turn-legacy',
      type: 'response_delta',
    })
    const universal = kaelResponseStreamReducer(initialKaelResponseStreamState, {
      mode: 'fast',
      responseId: 'turn-v2',
      type: 'response.started',
    })

    expect(legacyComplete.blocks['turn-legacy:block:0'].text).toBe('Kael tra loi.')
    expect(legacyComplete.transport).toBe('legacy')
    expect(appendLegacyKaelResponseDelta(universal, {
      delta: 'duplicate',
      turnId: 'turn-v2',
      type: 'response_delta',
    })).toBe(universal)
  })

  it('builds a completed snapshot from authoritative text with no active block', () => {
    const state = createCompletedKaelResponseState('Dong mot.\n\nDong hai.', 'turn-final')

    expect(state.status).toBe('completed')
    expect(state.blockOrder).toHaveLength(2)
    expect(state.blockOrder.every((blockId) => state.blocks[blockId]?.status === 'completed')).toBe(true)
  })

  it('caps completed snapshots while preserving all response text', () => {
    const text = Array.from({ length: 60 }, (_, index) => `Doan ${index + 1}.`).join('\n\n')
    const state = createCompletedKaelResponseState(text, 'turn-many-blocks')

    expect(state.blockOrder).toHaveLength(32)
    expect(state.blockOrder.map((blockId) => state.blocks[blockId].text).join('\n\n')).toBe(text)
  })
})
