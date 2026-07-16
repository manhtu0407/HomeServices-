jest.mock('expo-secure-store', () => ({
  deleteItemAsync: jest.fn(async () => undefined),
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
}))

const mockedSecureStore = jest.requireMock('expo-secure-store') as {
  deleteItemAsync: jest.Mock
  getItemAsync: jest.Mock
  setItemAsync: jest.Mock
}

import {
  clearRememberedAuthIdentifier,
  getRememberedAuthIdentifier,
  rememberAuthIdentifier,
} from '../remembered-auth-identifier'

beforeEach(() => {
  jest.clearAllMocks()
  mockedSecureStore.getItemAsync.mockResolvedValue(null)
})

describe('remembered auth identifier', () => {
  it('stores only the latest normalized email or Vietnamese phone identifier', async () => {
    await rememberAuthIdentifier('  ABC@Gmail.com ')
    await rememberAuthIdentifier('+84 912 345 678')

    expect(mockedSecureStore.setItemAsync).toHaveBeenNthCalledWith(1, 'nestscout.auth.remembered_identifier.v1', 'abc@gmail.com')
    expect(mockedSecureStore.setItemAsync).toHaveBeenNthCalledWith(2, 'nestscout.auth.remembered_identifier.v1', '0912345678')
  })

  it('does not persist malformed values', async () => {
    await rememberAuthIdentifier('not-an-identifier')

    expect(mockedSecureStore.setItemAsync).not.toHaveBeenCalled()
  })

  it('returns a valid saved identifier and clears a stale malformed value', async () => {
    mockedSecureStore.getItemAsync.mockResolvedValueOnce('  ABC@Gmail.com ')
    await expect(getRememberedAuthIdentifier()).resolves.toBe('abc@gmail.com')

    mockedSecureStore.getItemAsync.mockResolvedValueOnce('not-an-identifier')
    await expect(getRememberedAuthIdentifier()).resolves.toBeNull()
    expect(mockedSecureStore.deleteItemAsync).toHaveBeenCalledWith('nestscout.auth.remembered_identifier.v1')
  })

  it('removes the remembered identifier when the user turns off remembering', async () => {
    await clearRememberedAuthIdentifier()

    expect(mockedSecureStore.deleteItemAsync).toHaveBeenCalledWith('nestscout.auth.remembered_identifier.v1')
  })

  it('serializes remember and clear so a late write cannot resurrect the identifier', async () => {
    let resolveWrite!: () => void
    mockedSecureStore.setItemAsync.mockImplementationOnce(() => new Promise<void>((resolve) => {
      resolveWrite = resolve
    }))

    const remember = rememberAuthIdentifier('owner@example.com')
    const clear = clearRememberedAuthIdentifier()
    await Promise.resolve()
    await Promise.resolve()

    try {
      expect(mockedSecureStore.setItemAsync).toHaveBeenCalledTimes(1)
      expect(mockedSecureStore.deleteItemAsync).not.toHaveBeenCalled()
    } finally {
      resolveWrite?.()
    }
    await Promise.all([remember, clear])

    expect(mockedSecureStore.deleteItemAsync).toHaveBeenCalledTimes(1)
    expect(mockedSecureStore.setItemAsync.mock.invocationCallOrder[0])
      .toBeLessThan(mockedSecureStore.deleteItemAsync.mock.invocationCallOrder[0])
  })

  it('settles when SecureStore never returns a remembered identifier', async () => {
    await clearRememberedAuthIdentifier()
    jest.clearAllMocks()
    jest.useFakeTimers()
    mockedSecureStore.getItemAsync.mockReturnValueOnce(new Promise(() => undefined))
    const pending = getRememberedAuthIdentifier()

    await jest.advanceTimersByTimeAsync(5_000)

    await expect(pending).resolves.toBeNull()
    jest.useRealTimers()
  })
})
