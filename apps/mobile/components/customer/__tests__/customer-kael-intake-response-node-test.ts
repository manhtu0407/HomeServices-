import {
  resolveCaseWorkIntakePhase,
  shouldShowCaseWorkIntakeResponse,
} from '../v21/customer-kael-intake-response-model'

describe('resolveCaseWorkIntakePhase', () => {
  it('moves only from pending intake through server-backed analysis states', () => {
    expect(resolveCaseWorkIntakePhase({ hasSession: false, loading: false, nextAction: null, status: null })).toBe('intake_started')
    expect(resolveCaseWorkIntakePhase({ hasSession: true, loading: false, nextAction: 'ask_question', status: 'active' })).toBe('kael_collecting')
    expect(resolveCaseWorkIntakePhase({ hasSession: true, loading: true, nextAction: 'ask_question', status: 'active' })).toBe('kael_estimating')
    expect(resolveCaseWorkIntakePhase({ hasSession: true, loading: false, nextAction: 'estimate_ready', status: 'estimate_ready' })).toBe('kael_explaining')
  })
})

describe('shouldShowCaseWorkIntakeResponse', () => {
  it('does not duplicate the generic intake response when server review owns the phase', () => {
    expect(shouldShowCaseWorkIntakeResponse({
      dealExists: false,
      evidenceGateActive: false,
      mode: 'case',
      offerReviewActive: false,
      serverPriceReviewBlocked: true,
      workIntakeActive: true,
    })).toBe(false)
  })
})
