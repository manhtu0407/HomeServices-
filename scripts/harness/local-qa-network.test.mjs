import assert from 'node:assert/strict'
import test from 'node:test'
import { assertLocalQaBindings, ensureLocalQaNetwork } from './local-qa-network.mjs'

const identity = { Internal: false, Driver: 'bridge', Scope: 'local', Options: { 'com.docker.network.bridge.host_binding_ipv4': '127.0.0.1' }, Labels: { 'nestscout.qa.instance': 'journey56' } }

function fixture(results) {
  const calls = []
  return { calls, run(command, args, options) {
    calls.push({ command, args, options })
    assert.equal(command, 'docker')
    assert.equal(options.timeout, 15_000)
    const next = results.shift()
    assert.ok(next, 'no extra Docker call is allowed')
    return next
  } }
}

test('a new QA network is loopback-bound, labeled and verified before being returned', () => {
  const fake = fixture([{ status: 0, stdout: '' }, { status: 0, stdout: 'network-id' }, { status: 0, stdout: JSON.stringify(identity) }])
  assert.equal(ensureLocalQaNetwork('journey56', fake.run), 'nestscout-qa-fixture-journey56')
  assert.deepEqual(fake.calls[1].args, ['network', 'create', '--opt', 'com.docker.network.bridge.host_binding_ipv4=127.0.0.1', '--label', 'nestscout.qa.instance=journey56', 'nestscout-qa-fixture-journey56'])
  assert.equal(fake.calls.filter(({ args }) => args[1] === 'create').length, 1)
})

test('a verified existing QA network is reused without mutation', () => {
  const fake = fixture([{ status: 0, stdout: 'nestscout-qa-fixture-journey56\n' }, { status: 0, stdout: JSON.stringify(identity) }])
  assert.equal(ensureLocalQaNetwork('journey56', fake.run), 'nestscout-qa-fixture-journey56')
  assert.equal(fake.calls.length, 2)
  assert.ok(fake.calls.every(({ args }) => args[1] !== 'create'))
})

test('external, unowned, non-local or malformed networks are refused', () => {
  for (const row of [{ ...identity, Internal: true }, { ...identity, Options: {} }, { ...identity, Options: { 'com.docker.network.bridge.host_binding_ipv4': '0.0.0.0' } }, { ...identity, Labels: {} }, { ...identity, Scope: 'swarm' }, { ...identity, Driver: 'host' }, null]) {
    const fake = fixture([{ status: 0, stdout: 'nestscout-qa-fixture-journey56\n' }, { status: 0, stdout: JSON.stringify(row) }])
    assert.throws(() => ensureLocalQaNetwork('journey56', fake.run), /QA network identity/u)
  }
})

test('unsafe names and Docker failures fail closed without broad repair or retry', () => {
  for (const name of ['production', 'staging', '../other', '', 'x;echo']) {
    const fake = fixture([])
    assert.throws(() => ensureLocalQaNetwork(name, fake.run), /instance/u)
    assert.equal(fake.calls.length, 0)
  }
  const fake = fixture([{ status: 1, stdout: '', stderr: 'untrusted upstream detail' }])
  assert.throws(() => ensureLocalQaNetwork('journey56', fake.run), /QA network command failed/u)
  assert.equal(fake.calls.length, 1)
})

test('QA acceptance requires actual loopback bindings, not only a network option', () => {
  const db = 'supabase_db_nestscout-qa-journey56'
  const api = 'supabase_kong_nestscout-qa-journey56'
  const fake = fixture([{ status: 0, stdout: `${db}\n${api}` }, { status: 0, stdout: '{"5432/tcp":[{"HostIp":"127.0.0.1","HostPort":"58322"}]}' }, { status: 0, stdout: '{"8000/tcp":[{"HostIp":"::1","HostPort":"58321"}]}' }])
  assert.equal(assertLocalQaBindings('journey56', fake.run), 2)
})

test('a publicly bound, absent or unexpected QA project is never accepted', () => {
  const fake = fixture([{ status: 0, stdout: 'supabase_db_nestscout-qa-journey56\nsupabase_kong_nestscout-qa-journey56' }, { status: 0, stdout: '{"5432/tcp":[{"HostIp":"0.0.0.0","HostPort":"58322"}]}' }])
  assert.throws(() => assertLocalQaBindings('journey56', fake.run), /QA port binding/u)
  assert.throws(() => assertLocalQaBindings('journey56', fixture([{ status: 0, stdout: '' }]).run), /QA project/u)
  assert.throws(() => assertLocalQaBindings('journey56', fixture([{ status: 0, stdout: 'supabase_db_nestscout' }]).run), /QA project/u)
})
