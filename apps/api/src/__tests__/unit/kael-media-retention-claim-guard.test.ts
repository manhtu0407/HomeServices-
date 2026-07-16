import { describe, expect, it } from 'vitest'

import {
  isStorageRemoveSuccess,
  parseCleanupLimit,
  parseCleanupRows,
  parseCompletedCount,
} from '../../../../../supabase/functions/kael-media-retention/retention-guards'

const KAEL_ROW = {
  intent_id: '11111111-1111-4111-8111-111111111111',
  object_path:
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/kael-chat/model_vision/22222222-2222-4222-8222-222222222222-image.jpg',
}

const JOB_ROW = {
  intent_id: '33333333-3333-4333-8333-333333333333',
  object_path:
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/before/44444444-4444-4444-8444-444444444444-image.jpg',
}

describe('Kael media retention claim guards', () => {
  it('accepts complete claim batches that match the selected bucket contract', () => {
    expect(parseCleanupRows([KAEL_ROW], 'kael-chat-media', 1)).toEqual([KAEL_ROW])
    expect(parseCleanupRows([JOB_ROW], 'job-media', 1)).toEqual([JOB_ROW])
  })

  it.each([
    ['non-array payload', { ...KAEL_ROW }],
    ['mixed valid and malformed rows', [KAEL_ROW, { intent_id: 'not-a-uuid' }]],
    ['unsafe Kael object path', [{ ...KAEL_ROW, object_path: `${KAEL_ROW.object_path}/../other.jpg` }]],
    ['wrong bucket path contract', [{ ...KAEL_ROW, object_path: JOB_ROW.object_path }]],
  ])('rejects the entire batch for a %s', (_label, payload) => {
    expect(() => parseCleanupRows(payload, 'kael-chat-media', 10))
      .toThrow('CLAIM_RESPONSE_INVALID')
  })

  it('rejects over-limit and duplicate claim rows before any object deletion', () => {
    expect(() => parseCleanupRows([KAEL_ROW, JOB_ROW], 'kael-chat-media', 1))
      .toThrow('CLAIM_RESPONSE_INVALID')
    expect(() => parseCleanupRows([KAEL_ROW, { ...KAEL_ROW }], 'kael-chat-media', 2))
      .toThrow('CLAIM_RESPONSE_INVALID')
    expect(() => parseCleanupRows([
      KAEL_ROW,
      { ...KAEL_ROW, intent_id: '55555555-5555-4555-8555-555555555555' },
    ], 'kael-chat-media', 2)).toThrow('CLAIM_RESPONSE_INVALID')
  })

  it('requires the documented Storage FileObject[] success shape', () => {
    expect(isStorageRemoveSuccess({ data: [], error: null })).toBe(true)
    expect(isStorageRemoveSuccess({ data: null, error: null })).toBe(false)
    expect(isStorageRemoveSuccess({ data: {}, error: null })).toBe(false)
    expect(isStorageRemoveSuccess({ data: null, error: new Error('delete failed') })).toBe(false)
  })

  it('accepts only bounded integer finalize counts', () => {
    expect(parseCompletedCount(0, 2)).toBe(0)
    expect(parseCompletedCount(2, 2)).toBe(2)
    for (const value of [-1, 1.5, 3, '2', null]) {
      expect(() => parseCompletedCount(value, 2)).toThrow('FINALIZE_RESPONSE_INVALID')
    }
  })

  it('rejects destructive cleanup requests with typoed or ambiguous limits', () => {
    expect(parseCleanupLimit({}, 100, 50)).toBe(50)
    expect(parseCleanupLimit({ limit: 1 }, 100, 50)).toBe(1)
    expect(parseCleanupLimit({ limit: 100 }, 100, 50)).toBe(100)
    for (const body of [
      null,
      [],
      { limt: 1 },
      { limit: '1' },
      { limit: 1.5 },
      { limit: 0 },
      { limit: 101 },
      { limit: 1, dry_run: true },
    ]) {
      expect(() => parseCleanupLimit(body, 100, 50)).toThrow('INVALID_REQUEST')
    }
  })
})
