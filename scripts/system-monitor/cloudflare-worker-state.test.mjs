import assert from 'node:assert/strict'
import test from 'node:test'

import { readCloudflareWorkerState, restoreCloudflareWorkerSchedules } from './cloudflare-worker-state.mjs'

const input = {
  accountId: '45dec251ed1c9627256f9b6ba24bcdff',
  workerName: 'nestscout-system-health-observer',
  apiToken: 'nonsensitive-placeholder-value-for-tests',
}

test('rollback restores the captured schedule set including an empty dormant baseline', async () => {
  for (const cronSchedules of [[], ['* * * * *']]) {
    const requests = []
    await restoreCloudflareWorkerSchedules({ ...input, cronSchedules,
      fetcher: async (url, init) => {
        requests.push({ url: String(url), init })
        return Response.json({ success: true, result: { schedules: cronSchedules.map((cron) => ({ cron })) } })
      },
    })
    assert.equal(requests.length, 1)
    assert.equal(requests[0].url, `https://api.cloudflare.com/client/v4/accounts/${input.accountId}/workers/scripts/${input.workerName}/schedules`)
    assert.equal(requests[0].init.method, 'PUT')
    assert.deepEqual(JSON.parse(requests[0].init.body), cronSchedules.map((cron) => ({ cron })))
    assert.ok(requests[0].init.signal instanceof AbortSignal)
  }
})

test('rollback rejects an unverified schedule target and a failed write', async () => {
  let calls = 0
  await assert.rejects(restoreCloudflareWorkerSchedules({ ...input, accountId: 'f'.repeat(32), cronSchedules: [],
    fetcher: async () => { calls += 1; return Response.json({ success: true }) },
  }), /CLOUDFLARE_SCHEDULE_RESTORE_CONFIGURATION_INVALID/u)
  assert.equal(calls, 0)
  await assert.rejects(restoreCloudflareWorkerSchedules({ ...input, cronSchedules: [],
    fetcher: async () => Response.json({ success: false, errors: [{ message: input.apiToken }] }, { status: 500 }),
  }), (error) => error.message === 'CLOUDFLARE_SCHEDULE_RESTORE_FAILED')
})

test('rollback does not report success when Cloudflare retains a different schedule set', async () => {
  await assert.rejects(restoreCloudflareWorkerSchedules({ ...input, cronSchedules: [],
    fetcher: async () => Response.json({ success: true, result: { schedules: [{ cron: '* * * * *' }] } }),
  }), /CLOUDFLARE_SCHEDULE_RESTORE_FAILED/u)
})

test('captures active Worker Version metadata and Cron state for rollback without retaining credentials', async () => {
  const requests = []
  let versionReads = 0
  const state = await readCloudflareWorkerState({
    ...input,
    versionListProvider: async () => {
      versionReads += 1
      return [{
        id: 'version-id', annotations: { 'workers/tag': 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb', 'workers/message': 'a'.repeat(40) },
      }]
    },
    fetcher: async (url, init) => {
      requests.push({ url: String(url), init })
      if (String(url).endsWith('/deployments')) return Response.json({ success: true, result: [{
        id: 'deployment-id', created_on: '2026-10-13T12:00:00.000Z',
        versions: [{ version_id: 'version-id', percentage: 100 }],
      }] })
      return Response.json({ success: true, result: { schedules: [] } })
    },
  })

  assert.deepEqual(state, {
    exists: true,
    deploymentId: 'deployment-id',
    versionId: 'version-id',
    createdAt: '2026-10-13T12:00:00.000Z',
    releaseTag: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb',
    releaseMessage: 'a'.repeat(40),
    cronSchedules: [],
  })
  assert.deepEqual(requests.map(({ url }) => url), [
    'https://api.cloudflare.com/client/v4/accounts/45dec251ed1c9627256f9b6ba24bcdff/workers/scripts/nestscout-system-health-observer/deployments',
    'https://api.cloudflare.com/client/v4/accounts/45dec251ed1c9627256f9b6ba24bcdff/workers/scripts/nestscout-system-health-observer/schedules',
  ])
  assert.equal(versionReads, 1)
  assert.ok(requests.every(({ init }) => init.headers.authorization === `Bearer ${input.apiToken}`))
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

test('rejects an active deployment whose version metadata is missing', async () => {
  await assert.rejects(readCloudflareWorkerState({
    ...input,
    versionListProvider: async () => [],
    fetcher: async (url) => String(url).endsWith('/deployments')
      ? Response.json({ success: true, result: [{ id: 'deployment-id', versions: [{ version_id: 'version-id', percentage: 100 }] }] })
      : Response.json({ success: true, result: { schedules: [] } }),
  }), /CLOUDFLARE_WORKER_STATE_VERSION_MISSING/u)
})

test('fails closed when Wrangler version identity cannot be read', async () => {
  await assert.rejects(readCloudflareWorkerState({
    ...input,
    versionListProvider: async () => { throw new Error('private Wrangler output') },
    fetcher: async (url) => String(url).endsWith('/deployments')
      ? Response.json({ success: true, result: [{ id: 'deployment-id', versions: [{ version_id: 'version-id', percentage: 100 }] }] })
      : Response.json({ success: true, result: { schedules: [] } }),
  }), (error) => error.message === 'CLOUDFLARE_WORKER_STATE_VERSION_LIST_UNAVAILABLE' &&
    !error.message.includes('private Wrangler output'))
})

test('does not treat an unavailable schedule inventory as a dormant Worker', async () => {
  await assert.rejects(readCloudflareWorkerState({
    ...input,
    versionListProvider: async () => [{
      id: 'version-id', annotations: { 'workers/tag': `rollback-${'a'.repeat(40)}` },
    }],
    fetcher: async (url) => {
      if (String(url).endsWith('/deployments')) return Response.json({ success: true, result: [{
        id: 'deployment-id', versions: [{ version_id: 'version-id', percentage: 100 }],
      }] })
      return new Response('', { status: 503 })
    },
  }), /CLOUDFLARE_WORKER_STATE_FAILED_503/u)
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
