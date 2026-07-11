import AsyncStorage from '@react-native-async-storage/async-storage'

import {
  clearPendingKaelChatDraft,
  peekPendingKaelChatDraft,
  setPendingKaelChatDraft,
} from '../kael-chat/pending-intake'

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))

beforeEach(async () => {
  clearPendingKaelChatDraft()
  await AsyncStorage.clear()
})

it.each([
  ['electrical', 'electric_diagnose'],
  ['plumbing', 'water_diagnose'],
  ['cleaning', 'clean_scope'],
  ['hvac', 'air_scope'],
  ['upholstery', 'fabric_scope'],
  ['handyman', 'task_scope'],
] as const)('keeps the canonical %s profile and structured schedule in the pending handoff', async (serviceType, profileId) => {
  await setPendingKaelChatDraft({
    message: 'Customer supplied a short basic intake.',
    profileId,
    scheduleMode: 'scheduled',
    scheduledAt: '2026-07-12T01:00:00.000Z',
    scheduleWindow: {
      date: '2026-07-12',
      start: '08:00',
      end: '10:00',
      timeZone: 'Asia/Ho_Chi_Minh',
    },
    serviceType,
    source: 'booking',
  })

  expect(peekPendingKaelChatDraft()).toEqual(expect.objectContaining({
    profileId,
    scheduleMode: 'scheduled',
    scheduledAt: '2026-07-12T01:00:00.000Z',
    scheduleWindow: {
      date: '2026-07-12',
      start: '08:00',
      end: '10:00',
      timeZone: 'Asia/Ho_Chi_Minh',
    },
    serviceType,
  }))
})

it('normalizes a mismatched profile before the pending draft can reach Kael', async () => {
  await setPendingKaelChatDraft({
    message: 'Customer supplied a short HVAC intake.',
    profileId: 'task_scope',
    scheduleMode: 'now',
    scheduledAt: '2026-07-12T01:00:00.000Z',
    serviceType: 'hvac',
  })

  expect(peekPendingKaelChatDraft()).toEqual(expect.objectContaining({
    profileId: 'air_scope',
    scheduleMode: 'now',
    serviceType: 'hvac',
  }))
})

it('rejects and clears a schedule-less Basic Intake before Kael Case Work can consume it', async () => {
  await expect(setPendingKaelChatDraft({
    message: 'Legacy schedule-less intake.',
    profileId: 'task_scope',
    serviceType: 'handyman',
    source: 'booking',
  } as never)).rejects.toThrow(/explicit desired time or now schedule/i)

  expect(peekPendingKaelChatDraft()).toBeNull()
  expect(await AsyncStorage.getItem('nestscout.customer.pending_kael_chat_draft.v1')).toBeNull()
})

it('rejects a complete window when its schedule mode is not explicit', async () => {
  await expect(setPendingKaelChatDraft({
    message: 'Window without an explicit mode.',
    profileId: 'water_diagnose',
    scheduledAt: '2026-07-12T01:00:00.000Z',
    scheduleWindow: {
      date: '2026-07-12',
      start: '08:00',
      end: '10:00',
      timeZone: 'Asia/Ho_Chi_Minh',
    },
    serviceType: 'plumbing',
    source: 'booking',
  } as never)).rejects.toThrow(/explicit desired time or now schedule/i)

  expect(peekPendingKaelChatDraft()).toBeNull()
})
