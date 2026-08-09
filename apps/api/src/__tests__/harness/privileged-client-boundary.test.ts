import { describe, expect, it, vi } from 'vitest'
import {
  bindPrivilegedClientContext,
  privilegedClientContext,
  safePrivilegedClientMetadata,
} from '../../../../../supabase/functions/mobile-api/_shared/platform/privileged/service-client'

describe('privileged Supabase client boundary', () => {
  it('binds only safe actor and release metadata to an opaque client', () => {
    const client = { from: vi.fn(), rpc: vi.fn() }
    bindPrivilegedClientContext(client, {
      reason: 'actor_authentication',
      environment: 'staging',
      projectRef: 'xyylanuyflrjzbjzhqfl',
      releaseId: 'release-1',
      actorId: 'actor-1',
      actorRole: 'customer',
    })

    expect(privilegedClientContext(client)).toMatchObject({
      reason: 'actor_authentication',
      actorId: 'actor-1',
      actorRole: 'customer',
    })
    expect(safePrivilegedClientMetadata(client)).not.toHaveProperty('actorId')
    expect(JSON.stringify(safePrivilegedClientMetadata(client))).not.toContain('actor-1')
  })

  it('fails safe when an unbound object reaches the audit boundary', () => {
    expect(safePrivilegedClientMetadata({})).toEqual({
      privileged_reason: 'unbound',
      environment: 'unknown',
      project_ref: null,
      release_id: 'unreleased',
      actor_role: null,
    })
  })
})
