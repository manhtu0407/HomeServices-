import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AI_SESSION_LIMIT,
  KAEL_CHAT_PER_HOUR_LIMIT,
  KAEL_CHAT_PER_MINUTE_LIMIT,
  __resetRateLimitStoreForTests,
  checkKaelChatRateLimit,
  checkRateLimit,
} from '../../../../../supabase/functions/mobile-api/_shared/platform/rate-limit'
import {
  jobCreateSchema,
  kaelChatCreateSchema,
} from '../../../../../supabase/functions/_shared/domain'

// Cross-layer safety contracts:
// - F-04 client_request_id idempotency keys on jobs + kael chat sessions
// - F-23 per-user rate limit on /kael/chat POST (5/min, 20/hour)
// - F-11 confirm_kael_chat_atomic safety-net for ALREADY_CONFIRMED w/o job_id

describe('X2 schema: jobCreateSchema accepts client_request_id', () => {
  it('parses a valid UUID', () => {
    const parsed = jobCreateSchema.safeParse({
      service_type: 'electrical',
      description: 'Cầu dao trip liên tục ở phòng ngủ chính',
      problem_chips: ['Cầu dao trip'],
      address_district: 'q1',
      client_request_id: '00000000-0000-4000-8000-000000000000',
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.client_request_id).toBe('00000000-0000-4000-8000-000000000000')
    }
  })

  it('still parses when client_request_id is omitted (backward compat)', () => {
    const parsed = jobCreateSchema.safeParse({
      service_type: 'plumbing',
      description: 'Ống nước rò dưới lavabo, ngấm vào tường nhiều giờ rồi',
      problem_chips: ['Ống rò rỉ'],
      address_district: 'q1',
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.client_request_id).toBeUndefined()
    }
  })

  it('rejects a non-UUID client_request_id', () => {
    const parsed = jobCreateSchema.safeParse({
      service_type: 'cleaning',
      description: 'Tổng vệ sinh căn hộ 60m2 cuối tuần',
      problem_chips: ['Tổng vệ sinh'],
      address_district: 'q1',
      client_request_id: 'not-a-uuid',
    })
    expect(parsed.success).toBe(false)
  })
})

describe('X2 schema: kaelChatCreateSchema accepts client_request_id', () => {
  it('parses a valid UUID', () => {
    const parsed = kaelChatCreateSchema.safeParse({
      service_type: 'electrical',
      message: 'Đèn phòng tắm chập chờn',
      client_request_id: '11111111-1111-4111-8111-111111111111',
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.client_request_id).toBe('11111111-1111-4111-8111-111111111111')
    }
  })

  it('still parses when client_request_id is omitted', () => {
    const parsed = kaelChatCreateSchema.safeParse({
      service_type: 'plumbing',
      message: 'Vòi rò',
    })
    expect(parsed.success).toBe(true)
  })
})

describe('X2 rate-limit: per-minute bucket', () => {
  beforeEach(() => {
    __resetRateLimitStoreForTests()
  })

  afterEach(() => {
    __resetRateLimitStoreForTests()
  })

  it('allows the first 5 requests in a minute and rejects the 6th', () => {
    let allowed = 0
    let rejected = 0
    for (let i = 0; i < 10; i++) {
      const result = checkRateLimit('test-user', KAEL_CHAT_PER_MINUTE_LIMIT)
      if (result.allowed) allowed++
      else rejected++
    }
    expect(allowed).toBe(5)
    expect(rejected).toBe(5)
  })

  it('allows the first 20 requests in an hour and rejects the 21st', () => {
    let allowed = 0
    let rejected = 0
    for (let i = 0; i < 25; i++) {
      const result = checkRateLimit('test-user', KAEL_CHAT_PER_HOUR_LIMIT)
      if (result.allowed) allowed++
      else rejected++
    }
    expect(allowed).toBe(20)
    expect(rejected).toBe(5)
  })

  it('keeps the exhausted hour bucket after the five-minute cleanup threshold', () => {
    vi.useFakeTimers()
    try {
      for (let index = 0; index < 20; index += 1) {
        expect(checkRateLimit('long-window-user', KAEL_CHAT_PER_HOUR_LIMIT).allowed).toBe(true)
      }
      expect(checkRateLimit('long-window-user', KAEL_CHAT_PER_HOUR_LIMIT).allowed).toBe(false)

      vi.advanceTimersByTime(6 * 60_000)
      checkRateLimit('cleanup-trigger', KAEL_CHAT_PER_MINUTE_LIMIT)

      expect(checkRateLimit('long-window-user', KAEL_CHAT_PER_HOUR_LIMIT).allowed).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('X2 rate-limit: checkKaelChatRateLimit combines both buckets', () => {
  beforeEach(() => {
    __resetRateLimitStoreForTests()
  })

  afterEach(() => {
    __resetRateLimitStoreForTests()
  })

  it('returns reason="minute" when the per-minute bucket is exhausted', () => {
    const userId = 'combined-user-1'
    for (let i = 0; i < 5; i++) {
      expect(checkKaelChatRateLimit(userId).allowed).toBe(true)
    }
    const result = checkKaelChatRateLimit(userId)
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('minute')
  })

  it('rejects with reason="hour" if minute bucket was lenient', () => {
    // Simulate hourly exhaustion by directly consuming the hourly bucket
    // (the per-minute bucket would refill every 60s in a real timeline; here
    // we approximate by using a different user per minute window via a long
    // hourly chain.)
    const userId = 'combined-user-2'
    for (let i = 0; i < 20; i++) {
      checkRateLimit(`kael_chat_hour:${userId}`, KAEL_CHAT_PER_HOUR_LIMIT)
    }
    // Hour bucket now empty. Minute bucket still full.
    const result = checkKaelChatRateLimit(userId)
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('hour')
  })

  it('does NOT affect AI_SESSION_LIMIT (createJob keeps its own bucket)', () => {
    const userId = 'isolation-user'
    for (let i = 0; i < 5; i++) {
      expect(checkKaelChatRateLimit(userId).allowed).toBe(true)
    }
    const sessionCheck = checkRateLimit(
      `job_create:${userId}`,
      AI_SESSION_LIMIT,
    )
    expect(sessionCheck.allowed).toBe(true)
  })
})
