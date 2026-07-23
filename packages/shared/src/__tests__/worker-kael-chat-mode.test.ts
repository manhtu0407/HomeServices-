import { describe, expect, it } from 'vitest'

import { workerKaelChatCreateSchema } from '../validation'

const requestId = '11111111-1111-4111-8111-111111111111'
const jobId = '22222222-2222-4222-8222-222222222222'

describe('worker Kael chat mode contract', () => {
  it('allows an always-on normal conversation without a job', () => {
    expect(workerKaelChatCreateSchema.safeParse({
      client_request_id: requestId,
      language: 'vi',
      mode: 'normal',
    }).success).toBe(true)

    expect(workerKaelChatCreateSchema.safeParse({
      client_request_id: requestId,
      job_id: jobId,
      language: 'vi',
      mode: 'normal',
    }).success).toBe(false)
  })

  it('still requires a job for intake conversations', () => {
    expect(workerKaelChatCreateSchema.safeParse({
      client_request_id: requestId,
      language: 'vi',
      mode: 'intake',
    }).success).toBe(false)

    expect(workerKaelChatCreateSchema.safeParse({
      client_request_id: requestId,
      job_id: jobId,
      language: 'vi',
      mode: 'intake',
    }).success).toBe(true)
  })
})
