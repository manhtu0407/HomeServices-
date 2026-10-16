import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveLocalQaHttpTarget } from './local-qa-http-target.mjs'

function demoKey(role, iss = 'supabase-demo') {
  return `fixture.${Buffer.from(JSON.stringify({ iss, role })).toString('base64url')}.fixture`
}

const fixture = {
  NESTSCOUT_QA_HTTP_INSTANCE: 'journey56',
  NESTSCOUT_QA_HTTP_PORT_BASE: '58320',
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:58321',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: demoKey('anon'),
  SUPABASE_SERVICE_ROLE_KEY: demoKey('service_role'),
}

test('an absent named QA target is unavailable even if hosted variables exist', () => {
  assert.equal(resolveLocalQaHttpTarget({ NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co' }), null)
})

test('a complete named loopback target retains only the selected local runtime values', () => {
  const target = resolveLocalQaHttpTarget({ ...fixture, ANTHROPIC_API_KEY: 'sentinel' })
  assert.equal(target.url, 'http://127.0.0.1:58321')
  assert.equal(target.instance, 'journey56')
  assert.equal(target.portBase, 58320)
  assert.ok(!Object.hasOwn(target, 'ANTHROPIC_API_KEY'))
})

test('present but malformed, hosted or foreign-port targets fail before HTTP', () => {
  for (const patch of [
    { NESTSCOUT_QA_HTTP_INSTANCE: 'production' },
    { NESTSCOUT_QA_HTTP_INSTANCE: '../other' },
    { NESTSCOUT_QA_HTTP_PORT_BASE: 'NaN' },
    { NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co' },
    { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:55321' },
    { NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:58321' },
    { NEXT_PUBLIC_SUPABASE_URL: 'http://user:pass@127.0.0.1:58321' },
    { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:58321/other' },
    { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:58321/?token=sentinel' },
    { SUPABASE_SERVICE_ROLE_KEY: demoKey('service_role', 'hosted-project') },
    { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: demoKey('service_role') },
    { SUPABASE_SERVICE_ROLE_KEY: undefined },
  ]) assert.throws(() => resolveLocalQaHttpTarget({ ...fixture, ...patch }), /QA HTTP target/u)
})

test('target errors never echo credential or URL sentinels', () => {
  try {
    resolveLocalQaHttpTarget({ ...fixture, SUPABASE_SERVICE_ROLE_KEY: 'private-sentinel' })
    assert.fail('invalid key must be rejected')
  } catch (error) {
    assert.match(error.message, /QA HTTP target/u)
    assert.ok(!error.message.includes('private-sentinel'))
  }
})
