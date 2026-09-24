import { describe, expect, it, vi } from 'vitest'

import { pillarWhy, type PillarManifest } from '../../pillar-manifest'
import { type MobileApiContext } from '../../../../../../supabase/functions/mobile-api/_shared/http'
import { createEdgeServices } from '../../../../../../supabase/functions/mobile-api/_shared/domains'
import {
  attachDefaultJobMediaStorage,
  installEdgeRuntimeTestHooks,
  makeSequenceClient,
  type QueryResult,
} from '../harness'

export const PILLAR = {
  id: 'P205-job-media-insert-outcome',
  invariant:
    'a failed job_media_assets insert releases intents and deletes uploaded objects only when a re-read proves no row was committed',
  authority: ['governance/RULES.md #4', 'Production run 35999103816: insert committed in 53ms, Edge timed out and deleted the object'],
  target: 'supabase/functions/mobile-api/_shared/domains/job/media-attach.ts',
  layer: 'integration',
  siblings: ['P190-customer-media-upload'],
  mutation: 'clean up on every insert error without re-reading — the committed-row case deletes a referenced object and turns red',
} as const satisfies PillarManifest

installEdgeRuntimeTestHooks()

const JOB_ID = '11111111-1111-4111-8111-111111111111'
const OBJECT_PATH = `${JOB_ID}/before/photo.jpg`
const TIMEOUT: QueryResult = { data: null, error: { code: 'DB_TIMEOUT', message: 'AbortError' } }

function attachWithInsertTimeout(reread: QueryResult) {
  const client = makeSequenceClient([
    {
      data: {
        id: JOB_ID,
        status: 'awaiting_customer_confirm',
        service_type: 'plumbing',
        customer_id: 'customer-1',
        worker_id: null,
        photo_urls: [],
        completion_photo_urls: [],
      },
      error: null,
    },
    { data: [], error: null },
    TIMEOUT,
    reread,
    { data: { id: JOB_ID }, error: null },
    { data: null, error: null },
  ], {
    fail_job_media_uploads: [{ data: [{ revoked_paths: [OBJECT_PATH] }], error: null }],
  })
  attachDefaultJobMediaStorage(client)
  const remove = vi.fn(async (paths: string[]) => ({ data: paths.map((name) => ({ name })), error: null }))
  const storage = (client as unknown as { storage: { from(bucket: string): Record<string, unknown> } }).storage
  const bucket = { ...storage.from('job-media'), remove }
  Object.assign(client, { storage: { from: () => bucket } })
  const ctx: MobileApiContext = {
    success: true,
    user: { id: 'customer-1' },
    role: 'customer',
    supabase: client,
  }
  const attach = createEdgeServices({}).attachJobMedia(ctx, JOB_ID, {
    assets: [{ object_path: OBJECT_PATH, stage: 'before', mime_type: 'image/jpeg', file_size_bytes: 1234 }],
  })
  const failCalled = () => client.calls.some((call) => call.table === 'rpc:fail_job_media_uploads')
  return { attach, remove, failCalled }
}

describe('job media insert outcome after a client-side failure', () => {
  it('keeps a committed insert and its stored object when the insert response timed out', async () => {
    const { attach, remove, failCalled } = attachWithInsertTimeout({ data: [{ object_path: OBJECT_PATH }], error: null })

    await expect(attach, pillarWhy(PILLAR, 'a committed row must not be reported as a failed attach'))
      .resolves.toMatchObject({ job_id: JOB_ID, media: [expect.objectContaining({ object_path: OBJECT_PATH })] })
    expect(failCalled()).toBe(false)
    expect(remove, pillarWhy(PILLAR, 'deleting the object orphans the committed job_media_assets row')).not.toHaveBeenCalled()
  })

  it('releases intents and deletes the object only when the re-read proves nothing was committed', async () => {
    const { attach, remove, failCalled } = attachWithInsertTimeout({ data: [], error: null })

    await expect(attach).rejects.toMatchObject({ code: 'DB_ERROR', status: 500 })
    expect(failCalled()).toBe(true)
    expect(remove).toHaveBeenCalledWith([OBJECT_PATH])
  })

  it('fails without cleanup when the outcome cannot be read back', async () => {
    const { attach, remove, failCalled } = attachWithInsertTimeout(TIMEOUT)

    await expect(attach).rejects.toMatchObject({ code: 'DB_ERROR', status: 500 })
    expect(failCalled(), pillarWhy(PILLAR, 'an unknown outcome may be a committed row')).toBe(false)
    expect(remove).not.toHaveBeenCalled()
  })
})
