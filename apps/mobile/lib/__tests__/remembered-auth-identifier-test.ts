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
})
