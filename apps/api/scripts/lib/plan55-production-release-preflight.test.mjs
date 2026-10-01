import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PRODUCTION_MOBILE_API_URL,
  PRODUCTION_PROJECT_REF,
} from './kael-playbook-production-attestation.mjs'
import {
  inspectPlan55ProductionReleasePreflight,
} from './plan55-production-release-preflight.mjs'

const BASE_SHA = '891b1e26dd9a785f05671002c5e74cb270678be4'
const BASE_RELEASE_ID = 'harness-891b1e26dd9a-8c7eb92a4783'

function health(overrides = {}) {
  return {
    service: 'mobile-api',
    status: 'ok',
    environment: {
      project_ref: PRODUCTION_PROJECT_REF,
      provider_configuration_class: 'production-locked',
      webhook_configuration_class: 'production-signed',
    },
    release: {
      registered: true,
      git_sha: BASE_SHA,
      release_id: BASE_RELEASE_ID,
      deployment_id: `${PRODUCTION_PROJECT_REF}_mobile-api_273`,
      manifest_sha256: 'a'.repeat(64),
      bundle_sha256: 'b'.repeat(64),
      source_bundle_sha256: 'c'.repeat(64),
      edge_bundle_sha256: 'd'.repeat(64),
      provider_readiness: {
        anthropic: true,
        durable_guards: true,
        global_ai_enabled: true,
      },
      ...overrides,
    },
  }
}

function fetchFor({ healthPayload = health(), secrets = [] } = {}) {
  const requests = []
  const fetchImpl = async (url, init) => {
    requests.push({ url, init })
    const body = url === `${PRODUCTION_MOBILE_API_URL}/harness/health`
      ? healthPayload
      : secrets
    return { ok: true, json: async () => body }
  }
  return { fetchImpl, requests }
}

test('Production release preflight pins current base, absent flags, providers and read-only semantics', async () => {
  const { fetchImpl, requests } = fetchFor()
  const result = await inspectPlan55ProductionReleasePreflight({
    env: { SUPABASE_ACCESS_TOKEN: 'opaque-test-token' },
    fetchImpl,
  })
  assert.equal(result.status, 'PASS')
  assert.equal(result.project_ref, PRODUCTION_PROJECT_REF)
  assert.equal(result.source_sha, BASE_SHA)
  assert.equal(result.release_id, BASE_RELEASE_ID)
  assert.equal(result.plan55_flags_absent, true)
  assert.equal(result.mutations, 0)
  assert.equal(requests.length, 2)
  assert.equal(requests.every(({ init }) => init.method === 'GET'), true)
  assert.equal(requests[1].init.headers.authorization, 'Bearer opaque-test-token')
})

test('Production release preflight fails closed on credentials, target, source, flags or provider readiness', async () => {
  await assert.rejects(
    inspectPlan55ProductionReleasePreflight({ env: {}, fetchImpl: fetchFor().fetchImpl }),
    { message: 'plan55_release_preflight_access_token_missing' },
  )
  await assert.rejects(
    inspectPlan55ProductionReleasePreflight({
      env: { SUPABASE_ACCESS_TOKEN: 'opaque', SUPABASE_URL: 'https://staging.supabase.co' },
      fetchImpl: fetchFor().fetchImpl,
    }),
    { message: 'plan55_release_preflight_wrong_supabase_url' },
  )
  const wrongSourceSha = '9'.repeat(40)
  const wrongSource = fetchFor({
    healthPayload: health({
      git_sha: wrongSourceSha,
      release_id: `harness-${wrongSourceSha.slice(0, 12)}-f426155f83de`,
    }),
  })
  await assert.rejects(
    inspectPlan55ProductionReleasePreflight({ env: { SUPABASE_ACCESS_TOKEN: 'opaque' }, fetchImpl: wrongSource.fetchImpl }),
    { message: 'plan55_release_preflight_production_base_changed' },
  )
  const withFlag = fetchFor({ secrets: [{ name: 'KAEL_PLAYBOOK_HVAC_ENABLED' }] })
  await assert.rejects(
    inspectPlan55ProductionReleasePreflight({ env: { SUPABASE_ACCESS_TOKEN: 'opaque' }, fetchImpl: withFlag.fetchImpl }),
    { message: 'plan55_release_preflight_plan55_flags_not_absent' },
  )
  const providerDown = fetchFor({ healthPayload: health({ provider_readiness: { anthropic: false } }) })
  await assert.rejects(
    inspectPlan55ProductionReleasePreflight({ env: { SUPABASE_ACCESS_TOKEN: 'opaque' }, fetchImpl: providerDown.fetchImpl }),
    { message: 'plan55_release_preflight_provider_not_ready' },
  )
})
