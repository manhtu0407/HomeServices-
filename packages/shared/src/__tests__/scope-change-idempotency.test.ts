import { describe, expect, it } from 'vitest'

import { workerScopeChangeSchema } from '../validation'

describe('worker scope-change idempotency key', () => {
  it('requires a UUID client_request_id', () => {
    const payload = {
      new_description: 'Thay thêm đoạn ống bị nứt phía sau tường.',
      reason: 'Phạm vi ban đầu không bao gồm đoạn ống này.',
      photo_urls: [],
    }

    expect(workerScopeChangeSchema.safeParse(payload).success).toBe(false)
    expect(workerScopeChangeSchema.safeParse({
      ...payload,
      client_request_id: '11111111-1111-4111-8111-111111111111',
    }).success).toBe(true)
  })
})
