import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { assertLocalQaBindings, ensureLocalQaNetwork, loopbackQaDockerArgs } from './local-qa-network.mjs'

const qaCreate = ['create', '--name', 'supabase_kong_nestscout-qa-journey56', '--label', 'com.supabase.cli.project=nestscout-qa-journey56', '--network', 'nestscout-qa-fixture-journey56', '-p', '58321:8000', 'supabase/kong:fixture']

test('QA CLI publication adds an explicit loopback address without mutating its input', () => {
  const result = loopbackQaDockerArgs('journey56', 58320, 'docker', qaCreate)
  assert.equal(result[result.indexOf('-p') + 1], '127.0.0.1:58321:8000')
  assert.equal(qaCreate[qaCreate.indexOf('-p') + 1], '58321:8000')
})

test('the dedicated QA Edge runtime uses its verified local gateway with inference disabled', () => {
  const args = qaCreate.map(value => value.replace('supabase_kong_', 'supabase_edge_runtime_')).filter((value, index, all) => value !== '-p' && all[index - 1] !== '-p')
  args.splice(1, 0, '-e', 'SUPABASE_URL=http://kong:8000')
  const result = loopbackQaDockerArgs('journey56', 58320, 'docker', args)
  assert.ok(result.includes('SUPABASE_URL=http://host.docker.internal:58321'))
  assert.ok(result.includes('KAEL_AI_KILL_SWITCH=true'))
  assert.ok(!result.includes('SUPABASE_URL=http://kong:8000'))
  assert.ok(args.includes('SUPABASE_URL=http://kong:8000'))
})

test('the loopback adapter refuses foreign projects, networks, ports and publish-all', () => {
  for (const args of [
    qaCreate.map(value => value.replace('com.supabase.cli.project=nestscout-qa-journey56', 'com.supabase.cli.project=nestscout')),
    qaCreate.map(value => value.replace('nestscout-qa-fixture-journey56', 'bridge')),
    qaCreate.map(value => value.replace('58321:8000', '54321:8000')),
    qaCreate.map(value => value.replace('58321:8000', '0.0.0.0:58321:8000')),
    [...qaCreate.slice(0, -1), '-P', qaCreate.at(-1)],
  ]) assert.throws(() => loopbackQaDockerArgs('journey56', 58320, 'docker', args), /QA Docker publication/u)
})

test('read-only Docker calls and unrelated executable arguments stay unchanged', () => {
  assert.deepEqual(loopbackQaDockerArgs('journey56', 58320, 'docker', ['inspect', 'owned-id']), ['inspect', 'owned-id'])
  assert.deepEqual(loopbackQaDockerArgs('journey56', 58320, 'node', ['-p', '1+1']), ['-p', '1+1'])
})

test('the preload changes only Docker creation inside its own Node process', () => {
  const preload = new URL('./local-qa-loopback-preload.mjs', import.meta.url).href
  const result = spawnSync(process.execPath, ['--import', preload, '-e', "require('node:child_process').spawn(process.execPath,['-p','1+1'],{stdio:'inherit'})"], {
    encoding: 'utf8', timeout: 10_000,
    env: { ...process.env, NESTSCOUT_LOCAL_QA_INSTANCE: 'journey56', NESTSCOUT_LOCAL_QA_PORT_BASE: '58320' },
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout.trim(), '2')
})

test('the QA launcher rejects hosted instances and arbitrary CLI commands before startup', () => {
  const launcher = new URL('./run-local-qa-cli.mjs', import.meta.url)
  for (const args of [
    ['--instance', 'production', '--port-base', '58320', '--', 'start'],
    ['--instance', 'journey56', '--port-base', '58320', '--', 'functions', 'deploy'],
    ['--instance', 'journey56', '--port-base', '58320', '--', 'start', '--workdir', '../other'],
  ]) {
    const result = spawnSync(process.execPath, [fileURLToPath(launcher), ...args], { encoding: 'utf8', timeout: 10_000 })
    assert.equal(result.status, 2, result.stderr)
    assert.doesNotMatch(result.stderr, /Starting database/u)
  }
})

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
