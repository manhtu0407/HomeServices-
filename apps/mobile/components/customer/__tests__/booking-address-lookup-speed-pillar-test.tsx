import { act, renderHook } from '@testing-library/react-native'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'
import {
  peekBookingAddressSuggestions,
  resetBookingAddressLookupCache,
  useBookingAddressLookup,
} from '../booking/use-booking-address-lookup'

export const PILLAR = {
  id: 'P361-booking-address-lookup-speed',
  invariant:
    'a repeated address query is answered from memory, a superseded request is aborted, every request of one typing session shares one session token, and suggestions that still match what was typed stay visible while the next answer is in flight',
  authority: [
    'governance/RULES.md #8 (a provider miss is shown as a fallback, never as a silent empty list)',
    'governance/protocols/frontend-test.md G2 (state coverage)',
  ],
  target: 'apps/mobile/components/customer/booking/use-booking-address-lookup.ts',
  layer: 'unit',
  siblings: ['P360-places-autocomplete-speed'],
  mutation:
    'remove readLookupCache from the owner-change branch — the memory case turns red; drop controller.abort() — the abort case turns red; mint a new token per request — the session case turns red; return [] from carryOverSuggestions — the carry-over case turns red',
} as const satisfies PillarManifest

const mockAutocomplete = jest.fn()

jest.mock('@/lib/services', () => ({
  placesService: {
    autocomplete: (...args: unknown[]) => mockAutocomplete(...args),
  },
}))

const suggestion = (id: string, main: string, secondary = 'Thành phố Thủ Đức') => ({
  label: `${main}, ${secondary}`,
  main_text: main,
  place_id: id,
  secondary_text: secondary,
})

const answer = (...items: ReturnType<typeof suggestion>[]) => ({
  data: { fallback_used: false, suggestions: items },
  success: true as const,
})

async function settle(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms)
    await Promise.resolve()
  })
}

describe('P361 booking address lookup speed', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    mockAutocomplete.mockReset()
    resetBookingAddressLookupCache()
  })
  afterEach(() => jest.useRealTimers())

  it('answers a repeated query from memory with no second request', async () => {
    mockAutocomplete.mockResolvedValue(answer(suggestion('a', 'S1.07 Vinhomes Grand Park')))
    const { result, rerender } = renderHook(
      ({ address }: { address: string }) => useBookingAddressLookup(address, true),
      { initialProps: { address: 'S1.07 Vinhomes' } },
    )
    await settle(200)
    rerender({ address: 'Tòa khác' })
    rerender({ address: '  s1.07   VINHOMES ' })
    withPillarContext(PILLAR, () => {
      expect(result.current.suggestions.map((item) => item.place_id)).toEqual(['a'])
      expect(result.current.pending).toBe(false)
      expect(mockAutocomplete).toHaveBeenCalledTimes(1)
    }, 'same words with different case and spacing')
    expect(peekBookingAddressSuggestions('s1.07 vinhomes')).toHaveLength(1)
  })

  it('aborts the superseded request and keeps one session token for the typing session', async () => {
    const signals: AbortSignal[] = []
    const tokens: string[] = []
    mockAutocomplete.mockImplementation((input: { session_token: string }, options?: { signal: AbortSignal }) => {
      tokens.push(input.session_token)
      if (options?.signal) signals.push(options.signal)
      return new Promise(() => undefined)
    })
    const { rerender } = renderHook(
      ({ address }: { address: string }) => useBookingAddressLookup(address, true),
      { initialProps: { address: 'Vinhomes' } },
    )
    await settle(200)
    rerender({ address: 'Vinhomes Grand' })
    await settle(200)
    withPillarContext(PILLAR, () => {
      expect(signals).toHaveLength(2)
      expect(signals[0]?.aborted).toBe(true)
      expect(signals[1]?.aborted).toBe(false)
      expect(new Set(tokens).size).toBe(1)
      expect(tokens[0]).toEqual(expect.any(String))
    }, 'two requests in one typing session')
  })

  it('keeps matching suggestions visible while the next answer is pending', async () => {
    mockAutocomplete
      .mockResolvedValueOnce(answer(
        suggestion('a', 'S1.07 Vinhomes Grand Park'),
        suggestion('b', 'Bệnh viện Vinmec', 'Quận 1'),
      ))
      .mockReturnValueOnce(new Promise(() => undefined))
    const { result, rerender } = renderHook(
      ({ address }: { address: string }) => useBookingAddressLookup(address, true),
      { initialProps: { address: 'S1.07' } },
    )
    await settle(200)
    rerender({ address: 'S1.07 Vinhomes' })
    withPillarContext(PILLAR, () => {
      expect(result.current.pending).toBe(true)
      expect(result.current.suggestions.map((item) => item.place_id)).toEqual(['a'])
    }, 'the longer query still matches suggestion a but not b')
  })
})
