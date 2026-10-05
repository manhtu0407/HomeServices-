import { act, render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
  },
}))

let mockColorScheme: 'light' | 'dark' | null = 'dark'
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockColorScheme,
}))

import AsyncStorage from '@react-native-async-storage/async-storage'

import { createThemePreferenceStore, resolveThemePreference } from '../theme-preference-store'

export const PILLAR = {
  id: 'P317-theme-follows-system',
  invariant:
    'Customer and Worker appearance defaults to "Theo hệ thống": with nothing saved the app follows the phone\'s Light/Dark setting, a saved Light or Dark choice keeps overriding it, choosing System returns to the phone setting, and a late storage read never overwrites a newer choice',
  authority: [
    'Apple HIG Dark Mode ("people expect apps to respect their systemwide appearance choice")',
    'governance/design/runtime.md (theme: light + dark verification axis)',
  ],
  target: 'apps/mobile/lib/theme-preference-store.ts',
  layer: 'unit',
  siblings: ['P27-theme-token-resolution'],
  mutation: 'start the store at \'light\' instead of \'system\', or ignore useColorScheme when the preference is system — the follows-system case turns red',
} as const satisfies PillarManifest

const storage = AsyncStorage as unknown as { getItem: jest.Mock; setItem: jest.Mock }

function harness(store: ReturnType<typeof createThemePreferenceStore>) {
  function Harness() {
    return <Text testID="mode">{`${store.usePreference()}:${store.useResolvedMode()}`}</Text>
  }
  return Harness
}

describe('P317 appearance follows the system by default', () => {
  beforeEach(() => {
    mockColorScheme = 'dark'
    storage.getItem.mockReset().mockResolvedValue(null)
    storage.setItem.mockClear()
  })

  it('follows the phone setting when nothing is saved, and tracks it when it changes', async () => {
    const Harness = harness(createThemePreferenceStore('test.theme.follow'))
    const view = render(<Harness />)
    await act(async () => { await Promise.resolve() })
    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('mode')).toHaveTextContent('system:dark')
    }, 'phone dark')
    mockColorScheme = 'light'
    view.rerender(<Harness />)
    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('mode')).toHaveTextContent('system:light')
    }, 'phone light')
  })

  it('keeps a saved Light choice over a dark phone, and returns to the phone setting on System', async () => {
    storage.getItem.mockResolvedValue('light')
    const store = createThemePreferenceStore('test.theme.saved')
    const Harness = harness(store)
    render(<Harness />)
    await act(async () => { await Promise.resolve() })
    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('mode')).toHaveTextContent('light:light')
    }, 'saved light')
    await act(async () => { await store.setPreference('system') })
    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('mode')).toHaveTextContent('system:dark')
      expect(storage.setItem).toHaveBeenLastCalledWith('test.theme.saved', 'system')
    }, 'back to system')
  })

  it('does not let a late stored value overwrite a newer choice', async () => {
    let resolveStored!: (value: string | null) => void
    storage.getItem.mockImplementationOnce(() => new Promise((resolve) => { resolveStored = resolve }))
    const store = createThemePreferenceStore('test.theme.race')
    const Harness = harness(store)
    render(<Harness />)
    act(() => { void store.setPreference('dark') })
    await act(async () => {
      resolveStored('light')
      await Promise.resolve()
    })
    withPillarContext(PILLAR, () => {
      expect(screen.getByTestId('mode')).toHaveTextContent('dark:dark')
    })
  })

  it('resolves only valid preferences', () => {
    withPillarContext(PILLAR, () => {
      expect(resolveThemePreference('system', null)).toBe('light')
      expect(resolveThemePreference('system', 'dark')).toBe('dark')
      expect(resolveThemePreference('dark', 'light')).toBe('dark')
    })
  })
})
