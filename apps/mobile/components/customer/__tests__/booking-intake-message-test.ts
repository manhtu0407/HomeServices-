import type { PendingKaelChatDraft } from '@/lib/pending-kael-chat-draft'

import { localizedPendingBookingDraftMessage } from '../v21/booking-intake-display-model'

const structuredDraft: PendingKaelChatDraft = {
  addressLabel: 'Building A, District 1',
  description: 'The valve leaks under the sink.',
  locale: 'en',
  message: [
    'Service: Plumbing repair',
    'Issue: Leaking pipe or faucet',
    'Area: Building A, District 1',
    'Time: Today at 14:00',
    'Description: The valve leaks under the sink.',
  ].join('\n'),
  problemChips: ['leaking_pipe_or_faucet'],
  profileId: 'water_diagnose',
  scheduleMode: 'now',
  scheduledAt: '2026-07-18T07:00:00.000Z',
  serviceType: 'plumbing',
}

describe('Booking to Kael intake summary', () => {
  it('preserves the structured Booking summary instead of collapsing to the description', () => {
    expect(localizedPendingBookingDraftMessage(structuredDraft, 'en')).toBe(structuredDraft.message)
  })

  it('keeps the incident description when rebuilding the summary for another language', () => {
    const relocalized = localizedPendingBookingDraftMessage({ ...structuredDraft, locale: 'vi' }, 'en')

    expect(relocalized).toContain('Description: The valve leaks under the sink.')
  })
})
