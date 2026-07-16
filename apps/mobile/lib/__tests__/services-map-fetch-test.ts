jest.mock('../api', () => ({
  api: {},
  mobileApiUrl: (path: string) => `https://api.test/functions/v1/mobile-api${path}`,
}))

import { ResponseBodyTooLargeError } from '../response-guard'
import { mobileApiUrl } from '../api'
import { workerRouteService } from '../services'

const mockFetch = jest.fn()

describe('worker route map fetch', () => {
  const routeMapUri = mobileApiUrl('/workers/me/jobs/11111111-1111-4111-8111-111111111111/route-map?origin_lat=10.776900&origin_lng=106.700900')

  beforeAll(() => {
    global.fetch = mockFetch as typeof fetch
  })

  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('attaches a deadline and rejects an oversized map before buffering', async () => {
    const blob = jest.fn(async () => new Blob(['unreachable']))
    mockFetch.mockResolvedValue({
      blob,
      body: null,
      headers: { get: () => '999999999' },
      ok: true,
    })

    await expect(workerRouteService.getMapImage(routeMapUri, {}))
      .rejects.toBeInstanceOf(ResponseBodyTooLargeError)
    expect(blob).not.toHaveBeenCalled()
    expect(mockFetch).toHaveBeenCalledWith(
      routeMapUri,
      expect.objectContaining({ redirect: 'error', signal: expect.any(AbortSignal) }),
    )
  })

  it('cancels a rejected map response body', async () => {
    const cancel = jest.fn(async () => undefined)
    mockFetch.mockResolvedValue({
      body: { cancel },
      headers: { get: () => null },
      ok: false,
      status: 502,
    })

    await expect(workerRouteService.getMapImage(routeMapUri, {}))
      .rejects.toThrow('Route map unavailable')
    expect(cancel).toHaveBeenCalledTimes(1)
  })

  it.each([
    'https://attacker.test/route.png?origin_lat=10&origin_lng=106',
    mobileApiUrl('/workers/me/jobs/job-1/route-preview?origin_lat=10&origin_lng=106'),
    mobileApiUrl('/workers/me/jobs/job-1/route-map?origin_lat=10&origin_lat=11&origin_lng=106'),
    mobileApiUrl('/workers/me/jobs/job-1/route-map?origin_lat=91&origin_lng=106'),
    mobileApiUrl('/workers/me/jobs/job-1/route-map?origin_lat=&origin_lng=106'),
    mobileApiUrl('/workers/me/jobs/job-1/route-map?origin_lat=1e1&origin_lng=106'),
    mobileApiUrl('/workers/me/jobs/ignored/../job-1/route-map?origin_lat=10&origin_lng=106'),
    mobileApiUrl('/workers/me/jobs/%2e%2e/job-1/route-map?origin_lat=10&origin_lng=106'),
    `${mobileApiUrl('/workers/me/jobs/job-1/route-map?origin_lat=10&origin_lng=106')}#fragment`,
    mobileApiUrl(`/workers/me/jobs/job-1/route-map?origin_lat=${'0'.repeat(4_096)}10&origin_lng=106`),
  ])('rejects an untrusted map URI before attaching auth headers', async (uri) => {
    await expect(workerRouteService.getMapImage(uri, { Authorization: 'Bearer secret' }))
      .rejects.toThrow('Untrusted route map URL')
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
