import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createLocalProviderFixtureFetch } from './local-provider-fixture.mjs'

const localOrigin = 'http://host.docker.internal:58321'
const reply = { problem_slug: 'replace_cabinet_hinges', confidence: 0.88 }

test('the provider fixture answers Anthropic without forwarding a network request', async () => {
  let forwarded = 0
  const fixture = createLocalProviderFixtureFetch({ localOrigin, reply, fetch: async () => { forwarded += 1; throw new Error('network must not run') } })
  const response = await fixture.fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', body: JSON.stringify({ model: 'fixture-model', messages: [] }),
  })
  assert.equal(response.status, 200)
  const value = await response.json()
  assert.deepEqual(JSON.parse(value.content[0].text), reply)
  assert.equal(forwarded, 0)
  assert.deepEqual(fixture.counts(), { local: 0, providerFixture: 1, denied: 0 })
})

test('only selected local Supabase paths may reach the captured transport with redirects refused', async () => {
  const calls = []
  const fixture = createLocalProviderFixtureFetch({ localOrigin, reply, fetch: async (input, options) => {
    calls.push({ url: String(input), redirect: options.redirect, token: new Headers(options.headers).get('authorization') })
    return new Response('{}')
  } })
  await fixture.fetch(`${localOrigin}/auth/v1/user`, { headers: { authorization: 'Bearer local-sentinel' } })
  await fixture.fetch(new Request(`${localOrigin}/rest/v1/jobs`, { method: 'POST', body: '{}' }))
  assert.equal(calls.length, 2)
  assert.equal(calls[0].redirect, 'error')
  assert.equal(calls[0].token, 'Bearer local-sentinel')
  assert.equal(calls[1].redirect, 'error')
  assert.deepEqual(fixture.counts(), { local: 2, providerFixture: 0, denied: 0 })
})

test('foreign providers, hosted projects, observer services and business workers are denied before transport', async () => {
  let forwarded = 0
  const fixture = createLocalProviderFixtureFetch({ localOrigin, reply, fetch: async () => { forwarded += 1; return new Response('{}') } })
  const urls = [
    'https://api.deepseek.com/chat/completions', 'https://api.perplexity.ai/chat/completions',
    'https://project.supabase.co/rest/v1/jobs', 'https://sentry.io/api/0/',
    'https://api.telegram.org/bot-sentinel/sendMessage', 'https://fcm.googleapis.com/',
    `${localOrigin}/functions/v1/kael-learning-monitor`, `${localOrigin}/rest/v1/../functions/v1/worker`,
    'https://api.anthropic.com/v1/messages?token=private-sentinel',
    'http://user:private-sentinel@host.docker.internal:58321/rest/v1/jobs',
  ]
  for (const url of urls) await assert.rejects(fixture.fetch(url, { method: 'POST', body: '{}' }), error => {
    assert.equal(error.message, 'QA fixture network target refused')
    return true
  })
  assert.equal(forwarded, 0)
  assert.deepEqual(fixture.counts(), { local: 0, providerFixture: 0, denied: urls.length })
})

test('invalid local origins and malformed provider input fail closed without exposing input', async () => {
  for (const origin of ['https://project.supabase.co', 'http://localhost:58321', 'http://host.docker.internal:58321/other', 'http://user:sentinel@127.0.0.1:58321']) {
    assert.throws(() => createLocalProviderFixtureFetch({ localOrigin: origin, reply, fetch }), /QA fixture local origin refused/u)
  }
  const fixture = createLocalProviderFixtureFetch({ localOrigin, reply, fetch: async () => { throw new Error('must not forward') } })
  await assert.rejects(fixture.fetch('https://api.anthropic.com/v1/messages', { method: 'GET' }), /QA fixture provider request refused/u)
  await assert.rejects(fixture.fetch('https://api.anthropic.com/v1/messages', { method: 'POST', body: 'private-sentinel' }), error => {
    assert.equal(error.message, 'QA fixture provider request refused')
    return true
  })
})

test('oversize provider input is refused once and safe counters cannot be mutated by a caller', async () => {
  const fixture = createLocalProviderFixtureFetch({ localOrigin, reply, fetch })
  await assert.rejects(fixture.fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', body: 'x'.repeat(2 * 1024 * 1024 + 1),
  }), /QA fixture provider request refused/u)
  const observed = fixture.counts()
  assert.equal(observed.denied, 1)
  observed.denied = 0
  assert.equal(fixture.counts().denied, 1)
})

test('captured native fetch preserves a local POST body and refuses an actual redirect', async t => {
  let received = 0
  const server = createServer(async (request, response) => {
    received += 1
    if (request.url === '/auth/v1/redirect') {
      response.writeHead(302, { location: 'https://project.supabase.co/auth/v1/user' }).end()
      return
    }
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    response.writeHead(200, { 'content-type': 'application/json' }).end(Buffer.concat(chunks))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  t.after(() => { server.closeAllConnections(); server.close() })
  const origin = `http://127.0.0.1:${server.address().port}`
  const fixture = createLocalProviderFixtureFetch({ localOrigin: origin, reply, fetch })
  const response = await fixture.fetch(`${origin}/rest/v1/jobs`, { method: 'POST', body: '{"fixture":true}' })
  assert.deepEqual(await response.json(), { fixture: true })
  await assert.rejects(fixture.fetch(`${origin}/auth/v1/redirect`), TypeError)
  assert.equal(received, 2)
})
