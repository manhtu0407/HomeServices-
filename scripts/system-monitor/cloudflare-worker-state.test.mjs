import assert from 'node:assert/strict'
import test from 'node:test'

import { readCloudflareWorkerState } from './cloudflare-worker-state.mjs'

const input = {
  accountId: '45dec251ed1c9627256f9b6ba24bcdff',
  workerName: 'nestscout-system-health-observer',
  apiToken: 'cloudflare-test-token-that-is-not-real',
}

test('captures a single active deployment for rollback without retaining credentials', async () => {
  let request
  const state = await readCloudflareWorkerState({
    ...input,
    fetcher: async (url, init) => {
      request = { url: String(url), init }
      return Response.json({ success: true, result: [{
        id: 'deployment-id',
        created_on: '2026-10-13T12:00:00.000Z',
        annotations: { 'workers/tag': 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb' },
        versions: [{ version_id: 'version-id', percentage: 100 }],
      }] })
    },
  })

  assert.deepEqual(state, {
    exists: true,
    deploymentId: 'deployment-id',
    versionId: 'version-id',
    createdAt: '2026-10-13T12:00:00.000Z',
    releaseTag: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb',
  })
  assert.equal(request.url, 'https://api.cloudflare.com/client/v4/accounts/45dec251ed1c9627256f9b6ba24bcdff/workers/scripts/nestscout-system-health-observer/deployments')
  assert.equal(request.init.headers.authorization, `Bearer ${input.apiToken}`)
  assert.doesNotMatch(JSON.stringify(state), new RegExp(input.apiToken))
})

test('treats a missing Worker as a first deployment', async () => {
  const state = await readCloudflareWorkerState({ ...input, fetcher: async () => new Response('{}', { status: 404 }) })
  assert.deepEqual(state, { exists: false })
})

test('rejects ambiguous split traffic instead of guessing a rollback version', async () => {
  await assert.rejects(
    readCloudflareWorkerState({
      ...input,
      fetcher: async () => Response.json({ success: true, result: [{
        id: 'deployment-id',
        versions: [
          { version_id: 'version-a', percentage: 50 },
          { version_id: 'version-b', percentage: 50 },
        ],
      }] }),
    }),
    /CLOUDFLARE_WORKER_STATE_AMBIGUOUS/u,
  )
})

test('does not include provider response content in errors', async () => {
  await assert.rejects(
    readCloudflareWorkerState({
      ...input,
      fetcher: async () => new Response('private-provider-response', { status: 503 }),
    }),
    (error) => error.message === 'CLOUDFLARE_WORKER_STATE_FAILED_503' && !error.message.includes('private-provider-response'),
  )
})
