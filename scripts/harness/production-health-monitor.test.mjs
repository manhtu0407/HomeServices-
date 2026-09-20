import assert from 'node:assert/strict'
import test from 'node:test'
import { checkProductionHealth } from './production-health-monitor.mjs'

const projectRef = 'iwevizmsedyqozxlawwl'
const healthUrl = `https://${projectRef}.supabase.co/functions/v1/mobile-api/harness/health`
const charterUrl = `https://${projectRef}.supabase.co/functions/v1/mobile-api/kael/charter`
const healthyPayload = Object.freeze({
  status: 'ok',
  environment: { name: 'production', project_ref: projectRef },
  release: {
    registered: true,
    release_id: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb',
    git_sha: 'c'.repeat(40),
    deployment_id: `${projectRef}_10000000-0000-4000-8000-000000000057_12`,
  },
})
const charterPayload = Object.freeze({
  charter_version: 'kael-public-charter.v1',
  identity_summary: 'Kael is the NestScout assistant.',
  locked_files: ['governance/RULES.md'],
  tunable_files: ['supabase/functions/mobile-api/_shared/kael/prompts/system-prompt.ts'],
  forbidden_categories: ['unsupported_services'],
  mission_values: ['data_honesty'],
})

function response(status, value) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(value),
  }
}

test('checks exact Production health and Kael charter endpoints with read-only GETs', async () => {
  const calls = []
  const result = await checkProductionHealth({
    fetchImpl: async (url, init = {}) => {
      calls.push({ url: String(url), method: init.method ?? 'GET', headers: init.headers })
      return response(200, String(url) === healthUrl ? healthyPayload : charterPayload)
    },
  })

  assert.deepEqual(result, {
    status: 'healthy',
    projectRef,
    releaseId: healthyPayload.release.release_id,
    gitSha: healthyPayload.release.git_sha,
  })
  assert.deepEqual(calls.map(({ url, method }) => ({ url, method })), [
    { url: healthUrl, method: 'GET' },
    { url: charterUrl, method: 'GET' },
  ])
  assert.ok(calls.every(({ headers }) => !headers?.Authorization && !headers?.apikey))
})

test('fails the monitor when Production health is unavailable', async () => {
  await assert.rejects(checkProductionHealth({
    fetchImpl: async (url) => response(String(url) === healthUrl ? 500 : 200, {}),
  }), /Production harness health failed with HTTP 500/u)
})

test('fails closed when health identity is degraded, unregistered, or targets another project', async (t) => {
  for (const [name, payload] of [
    ['degraded', { ...healthyPayload, status: 'degraded' }],
    ['unregistered', { ...healthyPayload, release: { ...healthyPayload.release, registered: false } }],
    ['wrong project', { ...healthyPayload, environment: { ...healthyPayload.environment, project_ref: 'xyylanuyflrjzbjzhqfl' } }],
  ]) {
    await t.test(name, async () => {
      await assert.rejects(checkProductionHealth({
        fetchImpl: async (url) => response(200, String(url) === healthUrl ? payload : charterPayload),
      }), /Production harness health payload is not release-ready/u)
    })
  }
})

test('fails closed when the registered Production deployment identity is malformed', async () => {
  await assert.rejects(checkProductionHealth({
    fetchImpl: async (url) => response(200, String(url) === healthUrl
      ? { ...healthyPayload, release: { ...healthyPayload.release, deployment_id: `${projectRef}_bad_12` } }
      : charterPayload),
  }), /Production harness health payload is not release-ready/u)
})

test('fails when Kael charter does not return its public contract', async () => {
  await assert.rejects(checkProductionHealth({
    fetchImpl: async (url) => response(200, String(url) === healthUrl ? healthyPayload : { charter_version: '' }),
  }), /Production Kael charter response is invalid/u)
})
