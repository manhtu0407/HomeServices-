import assert from 'node:assert/strict'
import test from 'node:test'

import { configureSystemHealthMonitorSecret } from './system-monitor/configure-vault-secret.mjs'
import { disableSystemHealthMonitorSchedule } from './system-monitor/disable-schedule.mjs'

const supabaseUrl = 'https://abcdefgh.supabase.co'
const serviceRoleKey = 'service-role-test-key-that-is-long-enough'
const monitorSecret = 'a'.repeat(64)

test('configures the monitor Vault secret through the service-only RPC without returning secret data', async () => {
  let request
  const result = await configureSystemHealthMonitorSecret({
    supabaseUrl,
    serviceRoleKey,
    monitorSecret,
    fetcher: async (input, init) => {
      request = { url: String(input), init }
      return Response.json(true)
    },
  })

  assert.deepEqual(result, { configured: true })
  assert.equal(request.url, `${supabaseUrl}/rest/v1/rpc/configure_system_health_monitor_secret`)
  assert.equal(request.init.method, 'POST')
  assert.equal(request.init.headers.apikey, serviceRoleKey)
  assert.equal(request.init.headers.authorization, `Bearer ${serviceRoleKey}`)
  assert.deepEqual(JSON.parse(request.init.body), { p_secret: monitorSecret })
  assert.doesNotMatch(JSON.stringify(result), new RegExp(monitorSecret))
})

test('rejects invalid targets and credentials before making a request', async () => {
  let calls = 0
  const fetcher = async () => { calls += 1; return Response.json(true) }
  await assert.rejects(
    configureSystemHealthMonitorSecret({ supabaseUrl: 'https://abcdefgh.supabase.co.attacker.test', serviceRoleKey, monitorSecret, fetcher }),
    /SYSTEM_HEALTH_SECRET_TARGET_INVALID|SYSTEM_HEALTH_SECRET_CONFIGURATION_INVALID/u,
  )
  await assert.rejects(
    configureSystemHealthMonitorSecret({ supabaseUrl, serviceRoleKey: 'short', monitorSecret, fetcher }),
    /SYSTEM_HEALTH_SECRET_CONFIGURATION_INVALID/u,
  )
  await assert.rejects(
    configureSystemHealthMonitorSecret({ supabaseUrl, serviceRoleKey, monitorSecret: 'not-a-secret', fetcher }),
    /SYSTEM_HEALTH_SECRET_CONFIGURATION_INVALID/u,
  )
  assert.equal(calls, 0)
})

test('does not include upstream response content in safe errors', async () => {
  await assert.rejects(
    configureSystemHealthMonitorSecret({
      supabaseUrl,
      serviceRoleKey,
      monitorSecret,
      fetcher: async () => new Response('sentinel-private-response', { status: 503 }),
    }),
    (error) => error.message === 'SYSTEM_HEALTH_SECRET_CONFIGURATION_FAILED_503' &&
      !error.message.includes('sentinel-private-response'),
  )
})

test('disables only the minute collector schedule through the service-only RPC', async () => {
  let request
  const result = await disableSystemHealthMonitorSchedule({
    supabaseUrl,
    serviceRoleKey,
    fetcher: async (input, init) => {
      request = { url: String(input), init }
      return Response.json(true)
    },
  })

  assert.deepEqual(result, { disabled: true })
  assert.equal(request.url, `${supabaseUrl}/rest/v1/rpc/disable_system_health_monitor`)
  assert.equal(request.init.method, 'POST')
  assert.deepEqual(JSON.parse(request.init.body), {})
})

test('rejects an invalid schedule target before making a request', async () => {
  let calls = 0
  await assert.rejects(
    disableSystemHealthMonitorSchedule({
      supabaseUrl: 'https://abcdefgh.supabase.co.attacker.test',
      serviceRoleKey,
      fetcher: async () => { calls += 1; return Response.json(true) },
    }),
    /SYSTEM_HEALTH_SCHEDULE_TARGET_INVALID|SYSTEM_HEALTH_SCHEDULE_CONFIGURATION_INVALID/u,
  )
  assert.equal(calls, 0)
})

test('does not include upstream response content in schedule errors', async () => {
  await assert.rejects(
    disableSystemHealthMonitorSchedule({
      supabaseUrl,
      serviceRoleKey,
      fetcher: async () => new Response('sentinel-private-response', { status: 503 }),
    }),
    (error) => error.message === 'SYSTEM_HEALTH_SCHEDULE_FAILED_503' &&
      !error.message.includes('sentinel-private-response'),
  )
})
