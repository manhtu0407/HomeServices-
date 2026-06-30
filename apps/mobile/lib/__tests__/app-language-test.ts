jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
  },
}))

import AsyncStorage from '@react-native-async-storage/async-storage'

import { APP_LANGUAGE_STORAGE_KEY, getAppLanguageSnapshot, hydrateAppLanguage, setAppLanguage } from '../app-language'

const mockedStorage = AsyncStorage as unknown as {
  getItem: jest.Mock<Promise<string | null>, [string]>
  setItem: jest.Mock<Promise<void>, [string, string]>
}

describe('app language storage boundary', () => {
  beforeEach(() => {
    mockedStorage.getItem.mockReset()
    mockedStorage.setItem.mockReset()
    mockedStorage.getItem.mockResolvedValue(null)
    mockedStorage.setItem.mockResolvedValue(undefined)
    setAppLanguage('vi')
    mockedStorage.setItem.mockClear()
  })

  it('persists language changes to the NestScout production key', () => {
    setAppLanguage('en')

    expect(APP_LANGUAGE_STORAGE_KEY).toBe('nestscout.app.language.production')
    expect(mockedStorage.setItem).toHaveBeenCalledWith('nestscout.app.language.production', 'en')
    expect(mockedStorage.setItem).not.toHaveBeenCalledWith('home-services.app.language.production', 'en')
  })

  it('hydrates from the NestScout production key before checking legacy keys', async () => {
    mockedStorage.getItem.mockImplementation(async (key) => (key === 'nestscout.app.language.production' ? 'en' : null))

    await hydrateAppLanguage()

    expect(getAppLanguageSnapshot()).toBe('en')
    expect(mockedStorage.getItem.mock.calls.map(([key]) => key)).toEqual(['nestscout.app.language.production'])
    expect(mockedStorage.setItem).toHaveBeenCalledWith('nestscout.app.language.production', 'en')
  })

  it('migrates legacy Home Services language values into the NestScout key', async () => {
    mockedStorage.getItem.mockImplementation(async (key) => (key === 'home-services.worker.language.production' ? 'en' : null))

    await hydrateAppLanguage()

    expect(getAppLanguageSnapshot()).toBe('en')
    expect(mockedStorage.getItem.mock.calls.map(([key]) => key)).toEqual([
      'nestscout.app.language.production',
      'home-services.app.language.production',
      'customer.language.mode.v4',
      'home-services.worker.language.production',
    ])
    expect(mockedStorage.setItem).toHaveBeenCalledWith('nestscout.app.language.production', 'en')
  })
})
