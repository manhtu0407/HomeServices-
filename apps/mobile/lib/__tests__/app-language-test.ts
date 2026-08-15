jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
  },
}))

import AsyncStorage from '@react-native-async-storage/async-storage'

import { entryAccessCopy } from '../../components/auth/entry-access/copy'
import {
  APP_LANGUAGE_STORAGE_KEY,
  getAppLanguageSnapshot,
  hydrateAppLanguage,
  localizedStatusLabel,
  setAppLanguage,
} from '../app-language'

const mockedStorage = AsyncStorage as unknown as {
  getItem: jest.Mock<Promise<string | null>, [string]>
  setItem: jest.Mock<Promise<void>, [string, string]>
}

describe('app language storage boundary', () => {
  beforeEach(async () => {
    mockedStorage.getItem.mockReset()
    mockedStorage.setItem.mockReset()
    mockedStorage.getItem.mockResolvedValue(null)
    mockedStorage.setItem.mockResolvedValue(undefined)
    await setAppLanguage('vi')
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
    expect(entryAccessCopy[getAppLanguageSnapshot()].login.submit).toBe('Sign in')
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

  it('does not let a late hydration overwrite a newer language selection', async () => {
    let resolveStored!: (value: string | null) => void
    mockedStorage.getItem.mockImplementationOnce(() => new Promise((resolve) => {
      resolveStored = resolve
    }))

    const hydration = hydrateAppLanguage()
    setAppLanguage('en')
    resolveStored('vi')
    await hydration

    expect(getAppLanguageSnapshot()).toBe('en')
    expect(entryAccessCopy[getAppLanguageSnapshot()].login.submit).toBe('Sign in')
    expect(mockedStorage.setItem).not.toHaveBeenCalledWith(APP_LANGUAGE_STORAGE_KEY, 'vi')
  })

  it('serializes rapid language writes so the last selection persists last', async () => {
    let resolveFirstWrite!: () => void
    mockedStorage.setItem
      .mockImplementationOnce(() => new Promise<void>((resolve) => {
        resolveFirstWrite = resolve
      }))
      .mockResolvedValue(undefined)

    const first = setAppLanguage('en')
    const second = setAppLanguage('vi')

    expect(mockedStorage.setItem).toHaveBeenCalledTimes(1)
    expect(mockedStorage.setItem).toHaveBeenLastCalledWith(APP_LANGUAGE_STORAGE_KEY, 'en')
    resolveFirstWrite()
    await Promise.all([first, second])

    expect(mockedStorage.setItem.mock.calls).toEqual([
      [APP_LANGUAGE_STORAGE_KEY, 'en'],
      [APP_LANGUAGE_STORAGE_KEY, 'vi'],
    ])
    expect(getAppLanguageSnapshot()).toBe('vi')
  })
})

describe('service-aware work status copy', () => {
  it.each([
    ['cleaning', 'Đang vệ sinh', 'Cleaning in progress'],
    ['electrical', 'Đang sửa điện', 'Electrical work in progress'],
    ['handyman', 'Đang thực hiện', 'Work in progress'],
    ['hvac', 'Đang xử lý điều hòa', 'Air care in progress'],
    ['plumbing', 'Đang sửa nước', 'Plumbing work in progress'],
    ['upholstery', 'Đang vệ sinh nội thất', 'Upholstery care in progress'],
  ] as const)('uses %s-specific copy for the shared repairing state', (serviceType, vi, en) => {
    expect(localizedStatusLabel('repairing', 'vi', serviceType)).toBe(vi)
    expect(localizedStatusLabel('repairing', 'en', serviceType)).toBe(en)
  })

  it('keeps the generic status copy when no service is known', () => {
    expect(localizedStatusLabel('repairing', 'vi')).toBe('Đang sửa')
  })
})
