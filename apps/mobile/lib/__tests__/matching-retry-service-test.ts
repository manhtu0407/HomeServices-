import { customerMatchingRetryService, validateMatchingRetryResult } from '../services/customer-matching-retry'
import { api } from '../api'

jest.mock('../api', () => ({ api: { getAuthenticated: jest.fn(), postAuthenticated: jest.fn() } }))

const JOB = '11111111-1111-4111-8111-111111111111'
const REQUEST = { client_request_id: '22222222-2222-4222-8222-222222222222', expected_matching_operation_id: '33333333-3333-4333-8333-333333333333' }

describe('durable matching retry public transport', () => {
  beforeEach(() => jest.clearAllMocks())

  it('binds POST and both reads to the initiating token and encodes each path segment', async () => {
    jest.mocked(api.getAuthenticated).mockResolvedValue({ success: false, code: 'NOT_FOUND', status: 404, error: '' })
    const id = 'id/unsafe?value#fragment'
    customerMatchingRetryService.confirmSearch(id, REQUEST, 'actor-token')
    customerMatchingRetryService.getMatchingRetry(id, id, 'actor-token')
    await customerMatchingRetryService.getMatchingOperation(id, 'actor-token')
    expect(api.postAuthenticated).toHaveBeenCalledWith('/jobs/id%2Funsafe%3Fvalue%23fragment/confirm-search', REQUEST, 'actor-token')
    expect(api.getAuthenticated).toHaveBeenCalledWith('/jobs/id%2Funsafe%3Fvalue%23fragment/matching-retries/id%2Funsafe%3Fvalue%23fragment', 'actor-token')
    expect(api.getAuthenticated).toHaveBeenCalledWith('/jobs/id%2Funsafe%3Fvalue%23fragment/matching-operation', 'actor-token')
  })

  it.each([
    { job_id: 'foreign', operation: null },
    { job_id: JOB, operation: { operation_id: REQUEST.expected_matching_operation_id, state: 'fake', updated_at: '2026-09-05T01:00:00.000Z' } },
    { job_id: JOB, operation: {} },
  ])('fails closed on an invalid parent snapshot: %j', async (data) => {
    jest.mocked(api.getAuthenticated).mockResolvedValue({ success: true, status: 200, data })
    expect(await customerMatchingRetryService.getMatchingOperation(JOB, 'actor-token')).toMatchObject({ success: false, code: 'INVALID_RESPONSE' })
  })

  it('does not mistake a legacy confirmSearch response or queued fake delivery for a receipt', () => {
    const legacy = { success: true as const, status: 200, data: { job_id: JOB, broadcast_sent: true } }
    expect(validateMatchingRetryResult(legacy as never, JOB, REQUEST)).toMatchObject({ success: false, code: 'INVALID_RESPONSE' })
    const forged = { operation_id: '44444444-4444-4444-8444-444444444444', parent_operation_id: REQUEST.expected_matching_operation_id,
      job_id: JOB, request_id: REQUEST.client_request_id, confirmation_operation_id: JOB,
      support_code: 'RETRY123', state: 'queued', broadcast_sent: true,
      created_at: '2026-09-05T01:00:00.000Z', updated_at: '2026-09-05T01:00:00.000Z' }
    expect(validateMatchingRetryResult({ success: true, status: 202, data: { operation: forged } } as never, JOB, REQUEST))
      .toMatchObject({ success: false, code: 'INVALID_RESPONSE' })
  })
})
