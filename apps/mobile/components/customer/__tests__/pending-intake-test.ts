import AsyncStorage from '@react-native-async-storage/async-storage'

import {
  clearPendingKaelChatDraft,
  PENDING_KAEL_CHAT_DRAFT_TTL_MS,
  peekPendingKaelChatDraft,
  readPendingKaelChatDraft,
  setPendingKaelChatDraft,
} from '../kael-chat/pending-intake'

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))

const OWNER_A = 'customer_a'
const OWNER_B = 'customer_b'
const STORAGE_KEY_V1 = 'nestscout.customer.pending_kael_chat_draft.v1'
const STORAGE_KEY_V2 = 'nestscout.customer.pending_kael_chat_draft.v2'
const asyncStorageMock = AsyncStorage as typeof AsyncStorage & {
  __INTERNAL_MOCK_STORAGE__: Record<string, string>
}

async function readMockStorageItem(key: string) {
  return asyncStorageMock.__INTERNAL_MOCK_STORAGE__[key] ?? null
}

async function writeMockStorageItem(key: string, value: string) {
  asyncStorageMock.__INTERNAL_MOCK_STORAGE__[key] = value
}

beforeEach(async () => {
  const getItemMock = AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>
  const setItemMock = AsyncStorage.setItem as jest.MockedFunction<typeof AsyncStorage.setItem>
  getItemMock.mockReset()
  getItemMock.mockImplementation(readMockStorageItem)
  setItemMock.mockReset()
  setItemMock.mockImplementation(writeMockStorageItem)
  await AsyncStorage.clear()
  await clearPendingKaelChatDraft(OWNER_A)
  await clearPendingKaelChatDraft(OWNER_B)
  jest.useFakeTimers()
  jest.setSystemTime(new Date('2026-07-14T03:00:00.000Z'))
})

afterEach(() => {
  jest.useRealTimers()
})

it.each([
  ['electrical', 'electric_diagnose'],
  ['plumbing', 'water_diagnose'],
  ['cleaning', 'clean_scope'],
  ['hvac', 'air_scope'],
  ['upholstery', 'fabric_scope'],
  ['handyman', 'task_scope'],
] as const)('keeps the canonical %s profile and structured schedule in the pending handoff', async (serviceType, profileId) => {
  await setPendingKaelChatDraft(OWNER_A, {
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

  expect(peekPendingKaelChatDraft(OWNER_A)).toEqual(expect.objectContaining({
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
  await setPendingKaelChatDraft(OWNER_A, {
    message: 'Customer supplied a short HVAC intake.',
    profileId: 'task_scope',
    scheduleMode: 'now',
    scheduledAt: '2026-07-12T01:00:00.000Z',
    serviceType: 'hvac',
  })

  expect(peekPendingKaelChatDraft(OWNER_A)).toEqual(expect.objectContaining({
    profileId: 'air_scope',
    scheduleMode: 'now',
    serviceType: 'hvac',
  }))
})

it('rejects and clears a schedule-less Basic Intake before Kael Case Work can consume it', async () => {
  await expect(setPendingKaelChatDraft(OWNER_A, {
    message: 'Legacy schedule-less intake.',
    profileId: 'task_scope',
    serviceType: 'handyman',
    source: 'booking',
  } as never)).rejects.toThrow(/explicit desired time or now schedule/i)

  expect(peekPendingKaelChatDraft(OWNER_A)).toBeNull()
  expect(await AsyncStorage.getItem(STORAGE_KEY_V2)).toBeNull()
})

it('rejects a complete window when its schedule mode is not explicit', async () => {
  await expect(setPendingKaelChatDraft(OWNER_A, {
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

  expect(peekPendingKaelChatDraft(OWNER_A)).toBeNull()
})

it.each([
  {
    scheduledAt: '2026-02-30T01:00:00.000Z',
    scheduleWindow: undefined,
    label: 'an impossible ISO calendar date',
    scheduleMode: 'now' as const,
  },
  {
    scheduledAt: '2026-07-12T01:00:00.000Z',
    scheduleWindow: { date: '2026-02-30', start: '08:00', end: '10:00', timeZone: 'Asia/Ho_Chi_Minh' as const },
    label: 'an impossible local calendar date',
    scheduleMode: 'scheduled' as const,
  },
  {
    scheduledAt: '2026-07-12T01:00:00.000Z',
    scheduleWindow: { date: '2026-07-12', start: '25:00', end: '10:00', timeZone: 'Asia/Ho_Chi_Minh' as const },
    label: 'an impossible local clock time',
    scheduleMode: 'scheduled' as const,
  },
  {
    scheduledAt: '2026-07-12T01:00:00.000Z',
    scheduleWindow: { date: '2026-07-12', start: '10:00', end: '08:00', timeZone: 'Asia/Ho_Chi_Minh' as const },
    label: 'a reversed schedule window',
    scheduleMode: 'scheduled' as const,
  },
  {
    scheduledAt: '2026-07-12T02:00:00.000Z',
    scheduleWindow: { date: '2026-07-12', start: '08:00', end: '10:00', timeZone: 'Asia/Ho_Chi_Minh' as const },
    label: 'a timestamp that disagrees with the local window',
    scheduleMode: 'scheduled' as const,
  },
])('rejects $label before persisting a pending intake', async ({ scheduleMode, scheduledAt, scheduleWindow }) => {
  await expect(setPendingKaelChatDraft(OWNER_A, {
    message: 'Invalid persisted schedule.',
    profileId: 'water_diagnose',
    scheduleMode,
    scheduledAt,
    scheduleWindow,
    serviceType: 'plumbing',
  })).rejects.toThrow(/explicit desired time or now schedule/i)

  expect(peekPendingKaelChatDraft(OWNER_A)).toBeNull()
  expect(await AsyncStorage.getItem(STORAGE_KEY_V2)).toBeNull()
})

it('persists the draft with an owner and a bounded save timestamp', async () => {
  await setPendingKaelChatDraft(OWNER_A, {
    message: 'Customer supplied an owner-bound intake.',
    profileId: 'water_diagnose',
    scheduleMode: 'now',
    scheduledAt: '2026-07-14T03:00:00.000Z',
    serviceType: 'plumbing',
  })

  expect(JSON.parse((await AsyncStorage.getItem(STORAGE_KEY_V2)) ?? '{}')).toEqual(expect.objectContaining({
    ownerId: OWNER_A,
    savedAt: Date.now(),
    version: 2,
  }))
})

it('rejects an unowned write before any pending intake is persisted', async () => {
  await expect(setPendingKaelChatDraft('', {
    message: 'Unowned intake.',
    profileId: 'task_scope',
    scheduleMode: 'now',
    scheduledAt: '2026-07-14T03:00:00.000Z',
    serviceType: 'handyman',
  })).rejects.toThrow(/authenticated owner/i)

  expect(await AsyncStorage.getItem(STORAGE_KEY_V2)).toBeNull()
})

it('does not hydrate another account draft and removes the cross-owner payload', async () => {
  await setPendingKaelChatDraft(OWNER_A, {
    addressLabel: 'Private apartment address',
    message: 'Customer A private intake.',
    photoDrafts: [{ type: 'image', uri: 'file:///customer-a/private.jpg' }],
    profileId: 'electric_diagnose',
    scheduleMode: 'now',
    scheduledAt: '2026-07-14T03:00:00.000Z',
    serviceType: 'electrical',
  })
  const persistedDraft = await AsyncStorage.getItem(STORAGE_KEY_V2)

  expect(peekPendingKaelChatDraft(OWNER_B)).toBeNull()
  await AsyncStorage.setItem(STORAGE_KEY_V2, persistedDraft ?? '')
  expect(await readPendingKaelChatDraft(OWNER_B)).toBeNull()
  expect(await AsyncStorage.getItem(STORAGE_KEY_V2)).toBeNull()
})

it('expires and removes a draft at the 30 minute TTL boundary', async () => {
  await setPendingKaelChatDraft(OWNER_A, {
    message: 'Short-lived pending intake.',
    profileId: 'clean_scope',
    scheduleMode: 'now',
    scheduledAt: '2026-07-14T03:00:00.000Z',
    serviceType: 'cleaning',
  })
  const persistedDraft = await AsyncStorage.getItem(STORAGE_KEY_V2)
  await clearPendingKaelChatDraft(OWNER_A)
  await AsyncStorage.setItem(STORAGE_KEY_V2, persistedDraft ?? '')

  jest.advanceTimersByTime(PENDING_KAEL_CHAT_DRAFT_TTL_MS)

  expect(await readPendingKaelChatDraft(OWNER_A)).toBeNull()
  expect(await AsyncStorage.getItem(STORAGE_KEY_V2)).toBeNull()
})

it('rejects and removes the unowned v1 payload instead of migrating it across accounts', async () => {
  await AsyncStorage.setItem(STORAGE_KEY_V1, JSON.stringify({
    message: 'Legacy unowned intake.',
    profileId: 'task_scope',
    scheduleMode: 'now',
    scheduledAt: '2026-07-14T03:00:00.000Z',
    serviceType: 'handyman',
  }))

  expect(await readPendingKaelChatDraft(OWNER_A)).toBeNull()
  expect(await AsyncStorage.getItem(STORAGE_KEY_V1)).toBeNull()
})

it('does not let one owner clear another owner current draft', async () => {
  await setPendingKaelChatDraft(OWNER_B, {
    message: 'Customer B current intake.',
    profileId: 'fabric_scope',
    scheduleMode: 'now',
    scheduledAt: '2026-07-14T03:00:00.000Z',
    serviceType: 'upholstery',
  })

  await clearPendingKaelChatDraft(OWNER_A)

  expect(peekPendingKaelChatDraft(OWNER_B)).toEqual(expect.objectContaining({
    message: 'Customer B current intake.',
  }))
  expect(await AsyncStorage.getItem(STORAGE_KEY_V2)).not.toBeNull()
})

it('does not let delayed old-owner cleanup delete a newer owner draft', async () => {
  await setPendingKaelChatDraft(OWNER_A, {
    message: 'Customer A intake before account switch.',
    profileId: 'electric_diagnose',
    scheduleMode: 'now',
    scheduledAt: '2026-07-14T03:00:00.000Z',
    serviceType: 'electrical',
  })
  let releaseOldOwnerRead!: () => void
  const oldOwnerReadGate = new Promise<void>((resolve) => {
    releaseOldOwnerRead = resolve
  })
  const getItemMock = AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>
  getItemMock.mockImplementationOnce(async (key) => {
    const value = await readMockStorageItem(key)
    await oldOwnerReadGate
    return value
  })
  let oldOwnerCleanup: Promise<void> | null = null
  let newOwnerWrite: Promise<void> | null = null

  try {
    oldOwnerCleanup = clearPendingKaelChatDraft(OWNER_A)
    newOwnerWrite = setPendingKaelChatDraft(OWNER_B, {
      message: 'Customer B intake after account switch.',
      profileId: 'water_diagnose',
      scheduleMode: 'now',
      scheduledAt: '2026-07-14T03:00:00.000Z',
      serviceType: 'plumbing',
    })
    releaseOldOwnerRead()
    await Promise.all([oldOwnerCleanup, newOwnerWrite])

    expect(await readPendingKaelChatDraft(OWNER_B)).toEqual(expect.objectContaining({
      message: 'Customer B intake after account switch.',
    }))
    expect(JSON.parse((await AsyncStorage.getItem(STORAGE_KEY_V2)) ?? '{}')).toEqual(expect.objectContaining({
      ownerId: OWNER_B,
    }))
  } finally {
    releaseOldOwnerRead()
    await Promise.allSettled([oldOwnerCleanup, newOwnerWrite].filter((pending): pending is Promise<void> => pending !== null))
    getItemMock.mockImplementation(readMockStorageItem)
  }
})

it('serializes cross-account writes so a delayed old draft cannot overwrite the new owner', async () => {
  let releaseOldWrite!: () => void
  let markOldWriteStarted!: () => void
  const oldWriteGate = new Promise<void>((resolve) => {
    releaseOldWrite = resolve
  })
  const oldWriteStarted = new Promise<void>((resolve) => {
    markOldWriteStarted = resolve
  })
  const setItemMock = AsyncStorage.setItem as jest.MockedFunction<typeof AsyncStorage.setItem>
  setItemMock.mockImplementation(async (key, value) => {
    const ownerId = key === STORAGE_KEY_V2
      ? (JSON.parse(value) as { ownerId?: string }).ownerId
      : null
    if (ownerId === OWNER_A) {
      markOldWriteStarted()
      await oldWriteGate
    }
    await writeMockStorageItem(key, value)
  })
  let oldOwnerWrite: Promise<void> | null = null
  let newOwnerWrite: Promise<void> | null = null

  try {
    oldOwnerWrite = setPendingKaelChatDraft(OWNER_A, {
      message: 'Customer A intake before account switch.',
      profileId: 'electric_diagnose',
      scheduleMode: 'now',
      scheduledAt: '2026-07-14T03:00:00.000Z',
      serviceType: 'electrical',
    })
    await oldWriteStarted
    newOwnerWrite = setPendingKaelChatDraft(OWNER_B, {
      message: 'Customer B intake after account switch.',
      profileId: 'water_diagnose',
      scheduleMode: 'now',
      scheduledAt: '2026-07-14T03:00:00.000Z',
      serviceType: 'plumbing',
    })

    expect(peekPendingKaelChatDraft(OWNER_B)).toEqual(expect.objectContaining({
      message: 'Customer B intake after account switch.',
    }))
    expect(setItemMock.mock.calls.filter(([key]) => key === STORAGE_KEY_V2)).toHaveLength(1)

    releaseOldWrite()
    await Promise.all([oldOwnerWrite, newOwnerWrite])

    expect(JSON.parse((await AsyncStorage.getItem(STORAGE_KEY_V2)) ?? '{}')).toEqual(expect.objectContaining({
      draft: expect.objectContaining({ message: 'Customer B intake after account switch.' }),
      ownerId: OWNER_B,
    }))
  } finally {
    releaseOldWrite()
    await Promise.allSettled([oldOwnerWrite, newOwnerWrite].filter((pending): pending is Promise<void> => pending !== null))
    setItemMock.mockImplementation(writeMockStorageItem)
  }
})
