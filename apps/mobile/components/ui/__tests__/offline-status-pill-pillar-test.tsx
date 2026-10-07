import { act, render, screen } from '@testing-library/react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import { getCustomerThemeTokens } from '@/components/customer/customer-theme'
import { reportTransportFailure, reportTransportSuccess } from '@/lib/connectivity'
import { OfflineStatusPill, offlineStatusCopy } from '../offline-status-pill'

export const PILLAR = {
  id: 'P331-offline-status-pill',
  invariant: 'the offline pill stays hidden while the server answers, appears after two transport failures with the time the app last heard from the server, and disappears on the next server answer',
  authority: [
    'docs/foundation/pre-app-build-contract.md §4 (offline or network unavailable state)',
    'governance/RULES.md #5 (Vietnamese-first copy)',
    'governance/RULES.md #8 (cached data is never presented as fresh)',
  ],
  target: 'apps/mobile/components/ui/offline-status-pill.tsx',
  layer: 'ui-visual',
  siblings: ['P326-transport-connectivity', 'P09-native-ios-liquid-tabs'],
  mutation: 'drop the offline guard so the pill always renders — the online and reconnect cases show a pill',
} as const satisfies PillarManifest

let mockLanguage: 'vi' | 'en' = 'vi'
jest.mock('@/lib/app-language', () => {
  const actual = jest.requireActual('@/lib/app-language')
  return { ...actual, useAppLanguage: () => mockLanguage }
})

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0, left: 0, right: 0, top: 0 }),
}))

const tokens = getCustomerThemeTokens('light')

beforeEach(() => {
  mockLanguage = 'vi'
})

describe('offline status pill', () => {
  it('stays hidden while the server is reachable', () => {
    render(<OfflineStatusPill tokens={tokens} />)
    act(() => reportTransportSuccess())

    withPillarContext(PILLAR, () => {
      expect(screen.queryByTestId('offline-status-pill')).toBeNull()
    }, 'an online app must not show an offline pill')
  })

  it('appears after two failures with the last server time, then clears on reconnect', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 7, 9, 5))
    render(<OfflineStatusPill tokens={tokens} />)
    act(() => {
      reportTransportSuccess()
      reportTransportFailure()
    })
    const afterOneFailure = screen.queryByTestId('offline-status-pill')
    act(() => reportTransportFailure())

    withPillarContext(PILLAR, () => {
      expect(afterOneFailure).toBeNull()
      expect(screen.getByText('Đang ngoại tuyến · cập nhật lúc 09:05')).toBeOnTheScreen()
    }, 'two failures must show the pill with the time the app last heard from the server')

    act(() => reportTransportSuccess())
    withPillarContext(PILLAR, () => {
      expect(screen.queryByTestId('offline-status-pill')).toBeNull()
    }, 'a server answer must clear the pill')
    jest.useRealTimers()
  })

  it('never claims an update time it does not have, and follows the language switch', () => {
    withPillarContext(PILLAR, () => {
      expect(offlineStatusCopy('vi', null)).toBe('Đang ngoại tuyến')
      expect(offlineStatusCopy('en', null)).toBe('Offline')
      expect(offlineStatusCopy('en', new Date(2026, 9, 7, 18, 40).getTime())).toBe('Offline · updated at 18:40')
    }, 'no server answer yet means no time in the copy')
  })
})
