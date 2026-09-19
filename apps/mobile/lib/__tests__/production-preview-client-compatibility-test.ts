import { createDevelopmentProductionPreviewCompatibilityHeaders } from '../production-preview-client-compatibility'

const productionApiBaseUrl = 'https://iwevizmsedyqozxlawwl.supabase.co/functions/v1/mobile-api'
const healthUrl = `${productionApiBaseUrl}/harness/health`
const registeredHealth = {
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

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => JSON.stringify(body),
  } as Response
}

function requestOptions(overrides: Record<string, unknown> = {}) {
  return {
    development: true,
    platform: 'web',
    hostname: 'localhost',
    apiBaseUrl: productionApiBaseUrl,
    publishableKey: 'public-preview-key',
    fetchImpl: jest.fn(async () => jsonResponse(200, registeredHealth)),
    ...overrides,
  }
}

describe('local Production Preview compatibility adapter', () => {
  it('uses the live accepted iOS tuple only for local development Preview', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse(200, registeredHealth))
    const headers = await createDevelopmentProductionPreviewCompatibilityHeaders(requestOptions({ fetchImpl }))

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledWith(healthUrl, expect.objectContaining({ method: 'GET' }))
    expect(headers).toEqual({
      'x-client-platform': 'ios',
      'x-client-application-id': 'com.phanmanhtu.homeservices',
      'x-client-build-number': '45',
      'x-client-contract-epoch': '2',
      'x-client-eas-build-id': '11111111-1111-4111-8111-111111111111',
      'x-client-runtime-version': '0.2.0',
      'x-client-git-sha': 'c'.repeat(40),
      'x-client-release-id': 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb',
    })
  })

  it('fails closed when the Production health request fails or reports an unregistered release', async () => {
    const failed = await createDevelopmentProductionPreviewCompatibilityHeaders(requestOptions({
      fetchImpl: jest.fn(async () => jsonResponse(500, { message: 'Worker failed' })),
    }))
    const unregistered = await createDevelopmentProductionPreviewCompatibilityHeaders(requestOptions({
      fetchImpl: jest.fn(async () => jsonResponse(200, {
        ...registeredHealth,
        release: { ...registeredHealth.release, registered: false },
      })),
    }))
    expect(failed).toEqual({})
    expect(unregistered).toEqual({})
  })

  it.each([
    ['production build', { development: false }],
    ['native runtime', { platform: 'ios' }],
    ['remote host', { hostname: 'preview.nestscout.example' }],
    ['Staging API', { apiBaseUrl: 'https://xyylanuyflrjzbjzhqfl.supabase.co/functions/v1/mobile-api' }],
  ])('returns no compatibility headers for %s', async (_name, overrides) => {
    const fetchImpl = jest.fn()
    const headers = await createDevelopmentProductionPreviewCompatibilityHeaders(requestOptions({
      ...overrides,
      fetchImpl,
    }))
    expect(headers).toEqual({})
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects incomplete and mismatched release compatibility data', async () => {
    const invalid = {
      ...registeredHealth,
      release: {
        ...registeredHealth.release,
        git_sha: 'bad',
        client_compatibility: {
          ...registeredHealth.release.client_compatibility,
          contractEpoch: 1,
        },
      },
    }
    const headers = await createDevelopmentProductionPreviewCompatibilityHeaders(requestOptions({
      fetchImpl: jest.fn(async () => jsonResponse(200, invalid)),
    }))
    expect(headers).toEqual({})
  })
})
