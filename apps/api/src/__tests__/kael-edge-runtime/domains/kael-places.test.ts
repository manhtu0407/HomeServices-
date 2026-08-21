import { describe, expect, it, vi } from 'vitest'
import { type MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import { installEdgeRuntimeTestHooks, makeSequenceClient } from '../harness'

describe('places', () => {
  installEdgeRuntimeTestHooks()

  it('returns a safe Places autocomplete fallback when no Maps provider key is configured', async () => {
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: makeSequenceClient([]),
    }

    await expect(createEdgeServices({}).placesAutocomplete(ctx, {
      input: 'Bình Thạnh',
    })).resolves.toEqual({
      suggestions: [],
      fallback_used: true,
    })
  })

  // The route case moved to P36-worker-route-unit-protection. This one used toEqual against a
  // two-field shape, so it broke the moment the response gained destination, provider,
  // encoded_polyline and fetched_at — it pinned the shape, not the protection.

  it('rejects malformed UTF-8 route JSON instead of using corrupted coordinates', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      new Uint8Array([0x7b, 0x22, 0x63, 0x6f, 0x64, 0x65, 0x22, 0x3a, 0xc3, 0x28, 0x7d]),
    )))
    const client = makeSequenceClient([{
      data: {
        id: 'job-route-invalid-utf8',
        status: 'worker_matched',
        worker_id: 'worker-invalid-utf8',
        address_lat: 10.7767,
        address_lng: 106.7009,
        address_building: 'Tòa A',
        address_unit: 'A1201',
        address_floor: '12',
        address_district: 'Bình Thạnh',
        apartment_access_profile: {},
        apartment_access_state: { exact_unit_released: false },
      },
      error: null,
    }])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-invalid-utf8' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({ vietmapApiKey: 'vietmap-test-key' }).getWorkerRoutePreview(
      ctx,
      'job-route-invalid-utf8',
      { latitude: 10.7692, longitude: 106.6819 },
    )).rejects.toMatchObject({ code: 'ROUTE_UNAVAILABLE', status: 502 })
  })

  it('does not retry a deterministic oversized route response', async () => {
    const fetchMock = vi.fn(async () => new Response(null, {
      headers: { 'content-length': String(4 * 1024 * 1024 + 1) },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const client = makeSequenceClient([{
      data: {
        id: 'job-route-oversized',
        status: 'worker_matched',
        worker_id: 'worker-oversized',
        address_lat: 10.7767,
        address_lng: 106.7009,
        address_building: 'Tòa A',
        address_unit: 'A1201',
        address_floor: '12',
        address_district: 'Bình Thạnh',
        apartment_access_profile: {},
        apartment_access_state: { exact_unit_released: false },
      },
      error: null,
    }])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-oversized' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({ vietmapApiKey: 'vietmap-test-key' }).getWorkerRoutePreview(
      ctx,
      'job-route-oversized',
      { latitude: 10.7692, longitude: 106.6819 },
    )).rejects.toMatchObject({ code: 'MAP_UNAVAILABLE', status: 502 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('refuses a worker route before the building destination is released', async () => {
    const client = makeSequenceClient([{
      data: {
        id: 'job-route-locked',
        status: 'broadcasting',
        worker_id: 'worker-1',
        address_lat: 10.7767,
        address_lng: 106.7009,
        address_building: 'Tòa A',
        address_unit: 'A1201',
        address_floor: '12',
        address_district: 'Bình Thạnh',
        apartment_access_profile: {},
        apartment_access_state: { exact_unit_released: false },
      },
      error: null,
    }])
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'worker-1' },
      role: 'worker',
      supabase: client,
    }

    await expect(createEdgeServices({ vietmapApiKey: 'vietmap-test-key' }).getWorkerRoutePreview(
      ctx,
      'job-route-locked',
      { latitude: 10.7692, longitude: 106.6819 },
    )).rejects.toMatchObject({ code: 'ADDRESS_PROTECTED', status: 403 })
  })

  it('uses VietMap autocomplete before falling back to Google Maps', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify([{
        ref_id: 'vietmap-place-1',
        display: 'Landmark 81, Binh Thanh, Ho Chi Minh City',
        name: 'Landmark 81',
        address: 'Binh Thanh, Ho Chi Minh City',
      }]))
    )
    vi.stubGlobal('fetch', fetchMock)
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: makeSequenceClient([]),
    }

    await expect(createEdgeServices({
      vietmapApiKey: 'vietmap-test-key',
      googleMapsApiKey: 'maps-test-key',
    }).placesAutocomplete(ctx, {
      input: 'Landmark 81',
      session_token: 'session-1',
    })).resolves.toEqual({
      suggestions: [{
        place_id: 'vietmap-place-1',
        label: 'Landmark 81, Binh Thanh, Ho Chi Minh City',
        main_text: 'Landmark 81',
        secondary_text: 'Binh Thanh, Ho Chi Minh City',
      }],
      fallback_used: false,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const firstCall = fetchMock.mock.calls[0]
    expect(firstCall).toBeDefined()
    const calledUrl = new URL(String(firstCall?.[0]))
    expect(`${calledUrl.origin}${calledUrl.pathname}`).toBe('https://maps.vietmap.vn/api/autocomplete/v4')
    expect(calledUrl.searchParams.get('text')).toBe('Landmark 81')
    expect(calledUrl.searchParams.get('display_type')).toBe('6')
    expect(calledUrl.searchParams.get('cityId')).toBe('12')
    expect(firstCall?.[1]).toEqual(expect.objectContaining({ redirect: 'error' }))
  })

  it('sanitizes provider place copy and rejects a tainted opaque place id', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([
      {
        ref_id: 'vietmap\u202e-tainted',
        display: 'Must be dropped',
        name: 'Must be dropped',
        address: 'Must be dropped',
      },
      {
        ref_id: 'vietmap-place-safe',
        display: 'Ch\u1ee3\u202e B\u1ebfn\u0000 Th\u00e0nh',
        name: 'Ch\u1ee3\u202e B\u1ebfn',
        address: 'Qu\u1eadn\u0007 1',
      },
    ])))
    vi.stubGlobal('fetch', fetchMock)
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: makeSequenceClient([]),
    }

    await expect(createEdgeServices({ vietmapApiKey: 'vietmap-test-key' }).placesAutocomplete(ctx, {
      input: 'Ch\u1ee3 B\u1ebfn Th\u00e0nh',
      session_token: 'session-1',
    })).resolves.toEqual({
      suggestions: [{
        place_id: 'vietmap-place-safe',
        label: 'Ch\u1ee3 B\u1ebfn Th\u00e0nh',
        main_text: 'Ch\u1ee3 B\u1ebfn',
        secondary_text: 'Qu\u1eadn 1',
      }],
      fallback_used: false,
    })
  })

  it('falls through to Google when VietMap returns a malformed successful response', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{not-json', { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        suggestions: [{
          placePrediction: {
            placeId: 'google-place-1',
            text: { text: 'Landmark 81, Bình Thạnh' },
            structuredFormat: {
              mainText: { text: 'Landmark 81' },
              secondaryText: { text: 'Bình Thạnh' },
            },
          },
        }],
      }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: makeSequenceClient([]),
    }

    await expect(createEdgeServices({
      vietmapApiKey: 'vietmap-test-key',
      googleMapsApiKey: 'maps-test-key',
    }).placesAutocomplete(ctx, {
      input: 'Landmark 81',
      session_token: 'session-1',
    })).resolves.toEqual({
      suggestions: [{
        place_id: 'google-place-1',
        label: 'Landmark 81, Bình Thạnh',
        main_text: 'Landmark 81',
        secondary_text: 'Bình Thạnh',
      }],
      fallback_used: false,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('marks malformed Google autocomplete JSON as a provider fallback', async () => {
    const fetchMock = vi.fn(async () => new Response('{not-json', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: makeSequenceClient([]),
    }

    await expect(createEdgeServices({ googleMapsApiKey: 'maps-test-key' }).placesAutocomplete(ctx, {
      input: 'Bình Thạnh',
      session_token: 'session-1',
    })).resolves.toEqual({ suggestions: [], fallback_used: true })
  })

  it('marks malformed UTF-8 Google autocomplete JSON as a provider fallback', async () => {
    const fetchMock = vi.fn(async () => new Response(
      new Uint8Array([0x7b, 0x22, 0x73, 0x75, 0x67, 0x67, 0x65, 0x73, 0x74, 0x69, 0x6f, 0x6e, 0x73, 0x22, 0x3a, 0xc3, 0x28, 0x7d]),
      { status: 200 },
    ))
    vi.stubGlobal('fetch', fetchMock)
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-invalid-utf8' },
      role: 'customer',
      supabase: makeSequenceClient([]),
    }

    await expect(createEdgeServices({ googleMapsApiKey: 'maps-test-key' }).placesAutocomplete(ctx, {
      input: 'Bình Thạnh',
      session_token: 'session-invalid-utf8',
    })).resolves.toEqual({ suggestions: [], fallback_used: true })
  })

  it.each([null, [], { suggestions: {} }])(
    'marks malformed successful Google autocomplete payloads as a provider fallback: %j',
    async (payload) => {
      const fetchMock = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }))
      vi.stubGlobal('fetch', fetchMock)
      const ctx: MobileApiContext = {
        success: true,
        user: { id: 'customer-1' },
        role: 'customer',
        supabase: makeSequenceClient([]),
      }

      await expect(createEdgeServices({ googleMapsApiKey: 'maps-test-key' }).placesAutocomplete(ctx, {
        input: 'Bình Thạnh',
        session_token: 'session-1',
      })).resolves.toEqual({ suggestions: [], fallback_used: true })
    },
  )

  it('rejects out-of-range provider coordinates instead of returning an unsafe place pin', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      status: 'OK',
      results: [{
        formatted_address: 'Invalid provider pin',
        geometry: { location: { lat: 999, lng: 106.7 } },
      }],
    }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: makeSequenceClient([]),
    }

    await expect(createEdgeServices({ googleMapsApiKey: 'maps-test-key' }).placesResolve(ctx, {
      label: 'Bình Thạnh',
      place_id: 'google-place-1',
    })).resolves.toEqual({
      fallback_used: true,
      label: 'Bình Thạnh',
      location: null,
      place_id: 'google-place-1',
      provider: 'fallback',
    })
  })

  it('returns a safe Places autocomplete fallback when quota is exhausted', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 429 }))
    vi.stubGlobal('fetch', fetchMock)
    const ctx: MobileApiContext = {
      success: true,
      user: { id: 'customer-1' },
      role: 'customer',
      supabase: makeSequenceClient([]),
    }

    await expect(createEdgeServices({ googleMapsApiKey: 'maps-test-key' }).placesAutocomplete(ctx, {
      input: 'Bình Thạnh',
      session_token: 'session-1',
    })).resolves.toEqual({
      suggestions: [],
      fallback_used: true,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://places.googleapis.com/v1/places:autocomplete',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('Bình Thạnh'),
      }),
    )
  })
})
