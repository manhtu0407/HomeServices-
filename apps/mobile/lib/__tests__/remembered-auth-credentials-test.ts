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
  clearRememberedAuthCredentials,
  getRememberedAuthCredentials,
  rememberAuthCredentials,
} from '../remembered-auth-credentials'

beforeEach(() => {
  jest.clearAllMocks()
  mockedSecureStore.getItemAsync.mockResolvedValue(null)
})

describe('remembered auth credentials', () => {
  it('stores normalized native login credentials without using a browser fallback', async () => {
    await rememberAuthCredentials('090 123 4567', 'secret123', 'customer')

    expect(mockedSecureStore.setItemAsync).toHaveBeenCalledWith(
      'nestscout.auth.remembered_credentials.v1',
      JSON.stringify({ identifier: '0901234567', password: 'secret123', role: 'customer' }),
    )
  })

  it('restores valid credentials and rejects malformed stored values', async () => {
    mockedSecureStore.getItemAsync.mockResolvedValueOnce(JSON.stringify({
      identifier: 'TU@example.com',
      password: 'secret123',
      role: 'worker',
    }))
    await expect(getRememberedAuthCredentials()).resolves.toEqual({
      identifier: 'tu@example.com',
      password: 'secret123',
      role: 'worker',
    })

    mockedSecureStore.getItemAsync.mockResolvedValueOnce('{"password":"secret123"}')
    await expect(getRememberedAuthCredentials()).resolves.toBeNull()
    expect(mockedSecureStore.deleteItemAsync).toHaveBeenCalledWith('nestscout.auth.remembered_credentials.v1')
  })

  it('clears the saved credential pair when remembering is disabled', async () => {
    await clearRememberedAuthCredentials()

    expect(mockedSecureStore.deleteItemAsync).toHaveBeenCalledWith('nestscout.auth.remembered_credentials.v1')
  })
})
