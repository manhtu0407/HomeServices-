import { customerMatchingSelectionService, validateMatchingSelectionResult } from '../services/customer-matching-selection'
import { api } from '../api'

jest.mock('../api', () => ({ api: { getAuthenticated: jest.fn(), postAuthenticated: jest.fn() } }))
const JOB = '11111111-1111-4111-8111-111111111111'
const REQUEST = { mode: 'general' as const, auto_general: false, client_request_id: '22222222-2222-4222-8222-222222222222' }

describe('durable matching selection public transport', () => {
  beforeEach(() => jest.clearAllMocks())

  it('binds POST and receipt GET to the initiating token and encodes every path segment', () => {
    const id = 'id/unsafe?value#fragment'
    customerMatchingSelectionService.setMatchingPreference(id, REQUEST, 'actor-token')
    customerMatchingSelectionService.getMatchingPreferenceReceipt(id, id, 'actor-token')
    expect(api.postAuthenticated).toHaveBeenCalledWith('/jobs/id%2Funsafe%3Fvalue%23fragment/matching-preference', REQUEST, 'actor-token')
    expect(api.getAuthenticated).toHaveBeenCalledWith('/jobs/id%2Funsafe%3Fvalue%23fragment/matching-preference/id%2Funsafe%3Fvalue%23fragment', 'actor-token')
  })

  it('keeps a legacy response without a durable receipt unknown, even if it claims delivery', () => {
    const legacy = { success: true as const, status: 200, data: { job_id: JOB, broadcast_sent: true } }
    expect(validateMatchingSelectionResult(legacy as never, JOB, REQUEST)).toMatchObject({ success: false, code: 'INVALID_RESPONSE' })
  })
})
