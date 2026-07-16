import { act, render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(async () => undefined),
  },
}))

import AsyncStorage from '@react-native-async-storage/async-storage'

import { setCustomerThemeMode, useCustomerThemeMode } from '../customer-theme'

const mockedStorage = AsyncStorage as unknown as {
  getItem: jest.Mock<Promise<string | null>, [string]>
  setItem: jest.Mock<Promise<void>, [string, string]>
}

function ThemeHarness() {
  const mode = useCustomerThemeMode()
  return <Text testID="customer-theme-mode">{mode}</Text>
}

describe('customer theme hydration', () => {
  it('does not let a late stored theme overwrite a newer user selection', async () => {
    let resolveStored!: (value: string | null) => void
    mockedStorage.getItem.mockImplementationOnce(() => new Promise((resolve) => {
      resolveStored = resolve
    }))
    setCustomerThemeMode('light')
    expect(mockedStorage.setItem).toHaveBeenCalledWith('customer.theme.mode.v4', 'light')
    mockedStorage.setItem.mockClear()

    render(<ThemeHarness />)
    act(() => {
      void setCustomerThemeMode('dark')
    })
    expect(screen.getByTestId('customer-theme-mode')).toHaveTextContent('dark')

    await act(async () => {
      resolveStored('light')
      await Promise.resolve()
    })

    expect(screen.getByTestId('customer-theme-mode')).toHaveTextContent('dark')
    expect(mockedStorage.setItem).not.toHaveBeenCalledWith('customer.theme.mode.v4', 'light')
  })

  it('serializes rapid theme writes so the last selection persists last', async () => {
    let resolveFirstWrite!: () => void
    mockedStorage.setItem.mockReset()
    mockedStorage.setItem
      .mockImplementationOnce(() => new Promise<void>((resolve) => {
        resolveFirstWrite = resolve
      }))
      .mockResolvedValue(undefined)

    const first = setCustomerThemeMode('light')
    const second = setCustomerThemeMode('dark')

    expect(mockedStorage.setItem).toHaveBeenCalledTimes(1)
    expect(mockedStorage.setItem).toHaveBeenLastCalledWith('customer.theme.mode.v4', 'light')
    resolveFirstWrite()
    await Promise.all([first, second])

    expect(mockedStorage.setItem.mock.calls).toEqual([
      ['customer.theme.mode.v4', 'light'],
      ['customer.theme.mode.v4', 'dark'],
    ])
  })
})
