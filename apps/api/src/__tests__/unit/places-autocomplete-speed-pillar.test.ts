import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import {
  AutocompleteResultCache,
  firstUsefulAutocomplete,
  normalizeAutocompleteQuery,
  rankSuggestionsForQuery,
} from '../../../../../supabase/functions/mobile-api/_shared/domains/places/autocomplete-support.ts'
import {
  placesAutocomplete,
  resetAutocompleteStateForTests,
} from '../../../../../supabase/functions/mobile-api/_shared/domains/places/geo-public.ts'

export const PILLAR = {
  id: 'P360-places-autocomplete-speed',
  invariant:
    'address suggestions never wait on the database per keystroke, repeat queries are served from memory, a slow VietMap is hedged by Google, and typed shorthand is expanded and ranked so the building the resident typed comes first',
  authority: [
    'governance/RULES.md #8 (provider failures are logged, never silently swallowed)',
    'governance/STRUCTURES.md §4.5 (domains own provider orchestration)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/places/geo-public.ts',
  layer: 'unit',
  siblings: ['P359-harness-event-console-echo'],
  mutation:
    'remove the autocompleteCache lookup — the repeat-query case turns red; remove the permit TTL — the permit-reuse case turns red; start Google only after VietMap settles — the hedge case turns red; drop rankSuggestionsForQuery — the ranking case turns red',
} as const satisfies PillarManifest

const vietmapRow = (id: string, name: string, address: string) => ({
  ref_id: id,
  display: `${name}, ${address}`,
  name,
  address,
})

const googleBody = (placeId: string, main: string, secondary: string) => ({
  suggestions: [{
    placePrediction: {
      placeId,
      text: { text: `${main}, ${secondary}` },
      structuredFormat: { mainText: { text: main }, secondaryText: { text: secondary } },
    },
  }],
})

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })

const secrets = { vietmapApiKey: 'vietmap-test-key', googleMapsApiKey: 'maps-test-key' } as never

const localCtx = () => ({
  success: true,
  user: { id: 'customer-1' },
  role: 'customer',
  environment: 'local',
  supabase: { rpc: vi.fn() },
}) as never

describe('P360 places autocomplete speed', () => {
  beforeEach(() => resetAutocompleteStateForTests())
  afterEach(() => vi.unstubAllGlobals())

  it('expands the shorthand residents type', () => {
    const expanded = normalizeAutocompleteQuery('cc vinhome q7 p.3')
    expect(expanded, pillarWhy(PILLAR, 'shorthand reaches the provider expanded')).toBe(
      'Chung cư Vinhomes Quận 7 Phường 3',
    )
    expect(normalizeAutocompleteQuery('Landmark 81')).toBe('Landmark 81')
  })

  it('ranks the building the resident typed first', () => {
    const ranked = rankSuggestionsForQuery('S1.07 Vinhomes Grand Park', [
      { place_id: 'a', label: 'Vinhomes Grand Park, Thủ Đức', main_text: 'Vinhomes Grand Park', secondary_text: 'Thủ Đức' },
      { place_id: 'b', label: 'S1.07 Vinhomes Grand Park, Thủ Đức', main_text: 'S1.07 Vinhomes Grand Park', secondary_text: 'Thủ Đức' },
    ])
    expect(ranked.map((item) => item.place_id), pillarWhy(PILLAR, 'building code in the query')).toEqual(['b', 'a'])
    const untouched = rankSuggestionsForQuery('zzzz', [
      { place_id: 'a', label: 'A', main_text: 'A', secondary_text: null },
      { place_id: 'b', label: 'B', main_text: 'B', secondary_text: null },
    ])
    expect(untouched.map((item) => item.place_id)).toEqual(['a', 'b'])
  })

  it('caches successful answers only and expires them', () => {
    const cache = new AutocompleteResultCache(1_000, 2)
    const value = { suggestions: [{ place_id: 'a', label: 'A', main_text: 'A', secondary_text: null }], fallback_used: false }
    cache.set('fail', { suggestions: [], fallback_used: true }, 0)
    cache.set('empty', { suggestions: [], fallback_used: false }, 0)
    expect(cache.get('fail', 1)).toBeNull()
    expect(cache.get('empty', 1)).toBeNull()
    cache.set('a', value, 0)
    expect(cache.get('a', 500)).toEqual(value)
    expect(cache.get('a', 1_500)).toBeNull()
    cache.set('x', value, 0)
    cache.set('y', value, 0)
    cache.set('z', value, 0)
    expect(cache.get('x', 1), pillarWhy(PILLAR, 'oldest entry evicted past the cap')).toBeNull()
  })

  it('takes the first provider that has suggestions and survives a rejection', async () => {
    const slow = new Promise<{ suggestions: never[]; fallback_used: boolean }>((resolve) =>
      setTimeout(() => resolve({ suggestions: [], fallback_used: true }), 50))
    const good = Promise.resolve({
      suggestions: [{ place_id: 'g', label: 'G', main_text: 'G', secondary_text: null }],
      fallback_used: false,
    })
    expect((await firstUsefulAutocomplete([slow, good]))?.suggestions[0]?.place_id).toBe('g')
    expect(await firstUsefulAutocomplete([Promise.reject(new Error('down'))])).toBeNull()
  })

  it('serves a repeated query from memory without calling a provider again', async () => {
    const fetchMock = vi.fn(async () => json([vietmapRow('v1', 'Landmark 81', 'Bình Thạnh')]))
    vi.stubGlobal('fetch', fetchMock)
    const first = await placesAutocomplete(localCtx(), { input: 'Landmark 81' }, secrets)
    const second = await placesAutocomplete(localCtx(), { input: '  landmark   81 ' }, secrets)
    expect(second, pillarWhy(PILLAR, 'same words, different spacing and case')).toEqual(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('hedges a slow VietMap with Google instead of waiting for it', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('vietmap')) {
        await new Promise((resolve) => setTimeout(resolve, 1_500))
        return json([vietmapRow('slow', 'Slow Tower', 'Quận 1')])
      }
      return json(googleBody('google-1', 'Fast Tower', 'Quận 1'))
    }))
    const started = Date.now()
    const result = await placesAutocomplete(localCtx(), { input: 'Tower' }, secrets)
    expect(result.suggestions[0]?.place_id, pillarWhy(PILLAR, 'VietMap still pending after the hedge delay')).toBe('google-1')
    expect(Date.now() - started).toBeLessThan(1_300)
  })

  it('reuses the breaker permit instead of one database round trip per keystroke', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json([vietmapRow('v1', 'Alpha', 'Quận 1')])))
    const rpc = vi.fn(async (name: string) => (
      name === 'acquire_harness_dependency_permit'
        ? { data: [{ allowed: true, state: 'closed', retry_after_ms: 0, probe_token: null }], error: null }
        : { data: null, error: null }
    ))
    const ctx = { ...(localCtx() as object), environment: 'staging', supabase: { rpc } } as never
    await placesAutocomplete(ctx, { input: 'Alpha one' }, secrets)
    await placesAutocomplete(ctx, { input: 'Alpha two' }, secrets)
    await placesAutocomplete(ctx, { input: 'Alpha three' }, secrets)
    const permitCalls = rpc.mock.calls.filter(([name]) => name === 'acquire_harness_dependency_permit').length
    expect(permitCalls, pillarWhy(PILLAR, 'three distinct queries inside the permit window')).toBe(1)
  })
})
