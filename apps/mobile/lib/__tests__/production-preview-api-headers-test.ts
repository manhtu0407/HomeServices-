jest.mock('expo-constants', () => ({ default: { expoConfig: { ios: {}, android: {} } } }))
jest.mock('react-native', () => ({ Platform: { OS: 'web' } }))
jest.mock('../runtime-config', () => ({
  mobileRuntimeConfig: {
    apiBaseUrl: 'https://iwevizmsedyqozxlawwl.supabase.co/functions/v1/mobile-api',
    supabasePublishableKey: 'public-preview-key',
    runtimeBuildInfo: {},
  },
}))
jest.mock('../supabase', () => ({ supabase: null }))

import { api, getMobileApiAuthHeaders } from '../api'

const productionApiBaseUrl = 'https://iwevizmsedyqozxlawwl.supabase.co/functions/v1/mobile-api'
const healthUrl = `${productionApiBaseUrl}/harness/health`
const healthPayload = {
  status: 'ok',
  environment: { name: 'production', project_ref: 'iwevizmsedyqozxlawwl' },
  release: {
    registered: true,
    release_id: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb',
    git_sha: 'c'.repeat(40),
    client_compatibility: {
      contractEpoch: 2,
      ios: {
        applicationId: 'com.phanmanhtu.homeservices',
        minimumBuildNumber: 45,
        easBuildId: '11111111-1111-4111-8111-111111111111',
        runtimeVersion: '0.2.0',
      },
    },
  },
}

describe('mobile API release headers in local Production Preview', () => {
  const priorLocation = globalThis.location

  beforeAll(() => {
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: { hostname: 'localhost' },
    })
  })

  afterAll(() => {
    if (priorLocation === undefined) Reflect.deleteProperty(globalThis, 'location')
    else Object.defineProperty(globalThis, 'location', { configurable: true, value: priorLocation })
  })

  it('attaches the live Production accepted tuple to web Preview API requests', async () => {
    const apiRequests: Array<{ url: string; init: RequestInit }> = []
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === healthUrl) {
        return new Response(JSON.stringify(healthPayload), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      apiRequests.push({ url: String(input), init: init ?? {} })
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    global.fetch = fetchMock as typeof fetch

    const headers = await getMobileApiAuthHeaders()

    expect(headers).toMatchObject({
      'x-client-platform': 'ios',
      'x-client-application-id': 'com.phanmanhtu.homeservices',
      'x-client-build-number': '45',
      'x-client-contract-epoch': '2',
      'x-client-eas-build-id': '11111111-1111-4111-8111-111111111111',
      'x-client-runtime-version': '0.2.0',
      'x-client-git-sha': 'c'.repeat(40),
      'x-client-release-id': 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb',
      apikey: 'public-preview-key',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      healthUrl,
    )
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ method: 'GET' }))

    await api.get('/me/kael/conversations?mode=normal')
    await api.post('/me/kael/conversations', { client_request_id: 'create-test-session', mode: 'normal' })
    await api.post('/me/kael/conversations/session-test/turn', { client_request_id: 'send-hi', message: 'Hi' })
    await api.delete('/me/kael/conversations/session-test')

    expect(apiRequests).toHaveLength(4)
    expect(apiRequests.map(({ init }) => init.method)).toEqual(['GET', 'POST', 'POST', 'DELETE'])
    for (const { init } of apiRequests) {
      expect(Object.fromEntries(new Headers(init.headers).entries())).toMatchObject({
        'x-client-platform': 'ios',
        'x-client-application-id': 'com.phanmanhtu.homeservices',
        'x-client-build-number': '45',
        'x-client-contract-epoch': '2',
        'x-client-eas-build-id': '11111111-1111-4111-8111-111111111111',
        'x-client-runtime-version': '0.2.0',
        'x-client-git-sha': 'c'.repeat(40),
        'x-client-release-id': 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb',
      })
    }
    expect(apiRequests.map(({ url }) => new URL(url).pathname)).toEqual([
      '/functions/v1/mobile-api/me/kael/conversations',
      '/functions/v1/mobile-api/me/kael/conversations',
      '/functions/v1/mobile-api/me/kael/conversations/session-test/turn',
      '/functions/v1/mobile-api/me/kael/conversations/session-test',
    ])
  })
})
