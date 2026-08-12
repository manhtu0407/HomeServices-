import { describe, expect, it } from 'vitest'

import {
  createMobileApiHandler,
  type MobileApiServices,
} from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { installEdgeRuntimeTestHooks } from '../harness'

describe('mobile-api CORS', () => {
  installEdgeRuntimeTestHooks()

  it('allows the idempotency key required for a Worker Kael chat creation request', async () => {
    const handler = createMobileApiHandler({
      authenticate: async () => {
        throw new Error('CORS preflight must not authenticate')
      },
      services: {} as MobileApiServices,
    })

    const response = await handler(new Request('https://example.test/functions/v1/mobile-api/workers/me/kael/chat', {
      headers: {
        'access-control-request-headers': 'authorization, content-type, idempotency-key',
        'access-control-request-method': 'POST',
        origin: 'http://localhost:8094',
      },
      method: 'OPTIONS',
    }))

    const allowedHeaders = response.headers.get('access-control-allow-headers')
    expect(response.status).toBe(204)
    expect(allowedHeaders).toContain('idempotency-key')
    expect(allowedHeaders).not.toContain('*')
  })
})
