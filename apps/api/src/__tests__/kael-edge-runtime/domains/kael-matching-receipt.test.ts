import { describe, expect, it } from 'vitest'

import { buildMatchingReceipt } from '../../../../../../supabase/functions/mobile-api/_shared/domains/matching/matching-receipt.ts'

describe('matching receipt', () => {
  it('reports a saved-worker timeout and one transparent general expansion without worker identifiers', () => {
    const receipt = buildMatchingReceipt({
      broadcasts: [
        {
          batch_id: 'batch-saved',
          broadcast_at: '2026-08-11T10:00:00.000Z',
          expires_at: '2026-08-11T10:01:00.000Z',
          status: 'expired',
        },
        {
          batch_id: 'batch-general',
          broadcast_at: '2026-08-11T10:01:05.000Z',
          expires_at: '2026-08-11T10:02:05.000Z',
          status: 'sent',
        },
        {
          batch_id: 'batch-general',
          broadcast_at: '2026-08-11T10:01:05.000Z',
          expires_at: '2026-08-11T10:02:05.000Z',
          status: 'sent',
        },
      ],
      events: [
        { created_at: '2026-08-11T10:00:00.000Z', event_type: 'matching_saved_worker_selected', safe_metadata: {} },
        { created_at: '2026-08-11T10:01:02.000Z', event_type: 'matching_expanded', safe_metadata: { worker_count: 2 } },
      ],
      now: new Date('2026-08-11T10:01:15.000Z'),
      preference: {
        auto_general: true,
        fallback_at: '2026-08-11T10:01:02.000Z',
        strategy: 'saved_worker_first',
      },
      status: 'broadcasting',
    })

    expect(receipt).toMatchObject({
      batch: {
        attempt: 2,
        recipient_count: 2,
        seconds_remaining: 50,
        strategy: 'general',
      },
      checks: [
        { kind: 'service_capability', state: 'verified' },
        { kind: 'service_area', state: 'verified' },
        { kind: 'availability', state: 'verified' },
      ],
      stage: 'general_search',
      strategy: 'saved_worker_first',
    })
    expect(JSON.stringify(receipt)).not.toContain('batch-saved')
    expect(JSON.stringify(receipt)).not.toContain('batch-general')
  })

  it('does not invent a direct request when the saved worker is unavailable before any broadcast', () => {
    const receipt = buildMatchingReceipt({
      broadcasts: [
        {
          batch_id: 'batch-general',
          broadcast_at: '2026-08-11T10:01:05.000Z',
          expires_at: '2026-08-11T10:02:05.000Z',
          status: 'sent',
        },
        {
          batch_id: 'batch-general',
          broadcast_at: '2026-08-11T10:01:05.000Z',
          expires_at: '2026-08-11T10:02:05.000Z',
          status: 'sent',
        },
      ],
      events: [
        { created_at: '2026-08-11T10:01:00.000Z', event_type: 'matching_saved_worker_unavailable', safe_metadata: {} },
        { created_at: '2026-08-11T10:01:01.000Z', event_type: 'matching_search_expanded', safe_metadata: {} },
        { created_at: '2026-08-11T10:01:05.000Z', event_type: 'matching_general_batch_sent', safe_metadata: { worker_count: 2 } },
      ],
      now: new Date('2026-08-11T10:01:15.000Z'),
      preference: {
        auto_general: true,
        fallback_at: '2026-08-11T10:01:00.000Z',
        strategy: 'saved_worker_first',
      },
      status: 'broadcasting',
    })

    expect(receipt.event_history.map((event) => event.kind)).toEqual([
      'saved_worker_unavailable',
      'search_expanded',
      'general_batch_sent',
    ])
    expect(receipt.event_history.some((event) => event.kind === 'saved_worker_requested')).toBe(false)
    expect(receipt.batch).toMatchObject({ recipient_count: 2, strategy: 'general' })
  })

  it('keeps the original saved-worker batch distinct after a later general fallback', () => {
    const receipt = buildMatchingReceipt({
      broadcasts: [
        {
          batch_id: 'batch-saved',
          broadcast_at: '2026-08-11T10:00:00.000Z',
          expires_at: '2026-08-11T10:01:00.000Z',
          status: 'expired',
        },
        {
          batch_id: 'batch-general',
          broadcast_at: '2026-08-11T10:01:05.000Z',
          expires_at: '2026-08-11T10:02:05.000Z',
          status: 'sent',
        },
        {
          batch_id: 'batch-general',
          broadcast_at: '2026-08-11T10:01:05.000Z',
          expires_at: '2026-08-11T10:02:05.000Z',
          status: 'sent',
        },
      ],
      events: [],
      now: new Date('2026-08-11T10:01:15.000Z'),
      preference: {
        auto_general: true,
        fallback_at: '2026-08-11T10:01:02.000Z',
        strategy: 'saved_worker_first',
      },
      status: 'broadcasting',
    })

    expect(receipt.event_history).toMatchObject([
      { kind: 'saved_worker_requested', recipient_count: 1 },
      { kind: 'general_batch_sent', recipient_count: 2 },
    ])
  })

  it('uses the server event to classify a fallback batch when timestamps are close', () => {
    const receipt = buildMatchingReceipt({
      broadcasts: [
        {
          batch_id: 'batch-general',
          broadcast_at: '2026-08-11T10:01:00.000Z',
          expires_at: '2026-08-11T10:02:00.000Z',
          status: 'sent',
        },
        {
          batch_id: 'batch-general',
          broadcast_at: '2026-08-11T10:01:00.000Z',
          expires_at: '2026-08-11T10:02:00.000Z',
          status: 'sent',
        },
      ],
      events: [
        {
          created_at: '2026-08-11T10:01:01.000Z',
          event_type: 'matching_general_batch_sent',
          safe_metadata: { batch_id: 'batch-general', worker_count: 2 },
        },
      ],
      now: new Date('2026-08-11T10:01:15.000Z'),
      preference: {
        auto_general: true,
        fallback_at: '2026-08-11T10:01:01.000Z',
        strategy: 'saved_worker_first',
      },
      status: 'broadcasting',
    })

    expect(receipt).toMatchObject({
      batch: { strategy: 'general' },
      stage: 'general_search',
    })
  })

  it('does not report an unconfirmed worker request as an active search', () => {
    const receipt = buildMatchingReceipt({
      broadcasts: [],
      events: [
        { created_at: '2026-08-11T10:01:00.000Z', event_type: 'matching_saved_worker_unavailable', safe_metadata: {} },
        { created_at: '2026-08-11T10:01:02.000Z', event_type: 'matching_recovery_required', safe_metadata: {} },
      ],
      preference: {
        auto_general: true,
        fallback_at: '2026-08-11T10:01:00.000Z',
        strategy: 'saved_worker_first',
      },
      status: 'broadcasting',
    })

    expect(receipt.stage).toBe('recovery_required')
    expect(receipt.batch).toBeNull()
    expect(receipt.event_history.map((event) => event.kind)).toEqual([
      'saved_worker_unavailable',
      'matching_recovery_required',
    ])
  })

  it('makes a persisted general choice recoverable when no broadcast was created', () => {
    const receipt = buildMatchingReceipt({
      broadcasts: [],
      events: [
        { created_at: '2026-08-11T10:01:00.000Z', event_type: 'matching_preference_pending', safe_metadata: {} },
      ],
      preference: {
        auto_general: true,
        fallback_at: null,
        strategy: 'general',
      },
      status: 'broadcasting',
    })

    expect(receipt.stage).toBe('recovery_required')
    expect(receipt.batch).toBeNull()
  })
})
