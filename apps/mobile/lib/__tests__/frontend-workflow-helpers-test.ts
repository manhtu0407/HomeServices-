import { currentWorkerYearRange } from '../frontend-workflow/helpers'

describe('currentWorkerYearRange', () => {
  it('requests the complete calendar year needed by the earnings dashboard', () => {
    const range = currentWorkerYearRange(new Date('2026-07-29T05:00:00.000Z'))

    expect(range).toEqual({
      from: '2025-12-31T17:00:00.000Z',
      to: '2026-12-31T16:59:59.999Z',
    })
  })
})
