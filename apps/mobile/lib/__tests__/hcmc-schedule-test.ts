import { formatHcmcScheduledAt } from '../hcmc-schedule'

describe('HCMC schedule display', () => {
  it('keeps the scheduled date and time on one stable, zero-padded line', () => {
    expect(formatHcmcScheduledAt('2026-08-17T01:00:00.000Z')).toBe('17/08 · 08:00')
  })
})
