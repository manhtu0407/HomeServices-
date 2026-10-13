import type { LocalCompletionNudge } from '@nestscout/shared'

import { customerNudgeNotice } from '../jobs/stage-five/travel-work/customer-nudge-notice'

const sent: LocalCompletionNudge = {
  canNudge: false, reason: 'COOLDOWN', used: 2, maxAllowed: 3,
  lastNudgedAt: '2026-10-13T03:00:00.000Z', nextAvailableAt: '2026-10-13T03:15:00.000Z',
}

describe('customerNudgeNotice', () => {
  it('tells the worker who is waiting, when, and how many reminders have been sent', () => {
    const notice = customerNudgeNotice(sent, 'repairing', '10:00', 'vi')
    expect(notice?.title).toBe('Khách đang chờ bạn báo hoàn tất')
    expect(notice?.detail).toContain('lúc 10:00')
    expect(notice?.detail).toContain('(2/3)')
  })

  it('speaks English only through the English mode', () => {
    expect(customerNudgeNotice(sent, 'repairing', '10:00', 'en')?.detail).toContain('at 10:00')
    expect(customerNudgeNotice(sent, 'repairing', '10:00', 'en')?.title).toMatch(/waiting for your report/)
  })

  it('stays silent when no reminder was sent, none is known, or the job is not in repair', () => {
    expect(customerNudgeNotice(null, 'repairing', null, 'vi')).toBeNull()
    expect(customerNudgeNotice({ ...sent, used: 0 }, 'repairing', null, 'vi')).toBeNull()
    expect(customerNudgeNotice(sent, 'inspecting', '10:00', 'vi')).toBeNull()
    expect(customerNudgeNotice(sent, 'completed_by_worker', '10:00', 'vi')).toBeNull()
  })

  it('still shows the notice without a clock when the time cannot be read', () => {
    expect(customerNudgeNotice(sent, 'repairing', null, 'vi')?.detail).not.toContain('lúc')
  })
})
