import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { installLocalPaymentFixture } from './local-payment-fixture.mjs'

function workspace() {
  const root = mkdtempSync(join(tmpdir(), 'ns-payment-fixture-'))
  const work = join(root, '.scratch/local-migrations-qa-journey56/supabase')
  mkdirSync(join(work, 'functions/mobile-api'), { recursive: true })
  mkdirSync(join(root, 'supabase/functions/mobile-api'), { recursive: true })
  writeFileSync(join(work, 'config.toml'), 'project_id = "nestscout-qa-journey56"\n')
  for (const base of [join(work, 'functions/mobile-api'), join(root, 'supabase/functions/mobile-api')]) {
    writeFileSync(join(base, 'index.ts'), 'canonical fixture entry\n')
    writeFileSync(join(base, 'deno.json'), '{"imports":{}}\n')
  }
  writeFileSync(join(root, '.scratch/local-migrations-qa-journey56/apply-plan.json'), JSON.stringify({
    mode: 'empty-reset', environment: 'local', projectRef: 'nestscout-qa-journey56',
    localRuntime: { name: 'journey56', portBase: 58320 },
  }))
  return { root, work }
}

function dockerRun(options = {}) {
  return (_command, args) => {
    const project = 'nestscout-qa-journey56'
    let stdout
    if (args[0] === 'ps') stdout = `supabase_db_${project}\nsupabase_kong_${project}\nsupabase_edge_runtime_${project}`
    else if (args.includes('--type')) stdout = JSON.stringify({ Config: {
      Labels: { 'com.supabase.cli.project': project },
      Env: ['KAEL_AI_KILL_SWITCH=true', 'SUPABASE_URL=http://host.docker.internal:58321', ...(options.liveKey ? ['ANTHROPIC_API_KEY=private-sentinel'] : [])],
    } })
    else stdout = JSON.stringify({ '5432/tcp': [{ HostIp: options.foreignBinding ? '0.0.0.0' : '127.0.0.1', HostPort: '58322' }] })
    return { status: 0, stdout }
  }
}

test('installation writes one dedicated function and preserves the canonical Edge entry', () => {
  const { root, work } = workspace()
  const result = installLocalPaymentFixture({ root, instance: 'journey56', portBase: 58320, run: dockerRun() })
  assert.match(result.functionName, /^qa-payment-fixture-[a-f0-9]{12}$/u)
  assert.equal(result.mode, 'payment-fixture')
  assert.equal(readFileSync(join(work, 'functions/mobile-api/index.ts'), 'utf8'), 'canonical fixture entry\n')
  const identity = JSON.parse(readFileSync(join(work, 'functions', result.functionName, 'fixture-identity.json'), 'utf8'))
  assert.equal(identity.instance, 'journey56')
  assert.equal(identity.mode, 'payment-fixture')
  assert.equal(identity.fixtureDigest, result.fixtureDigest)
  const syntax = spawnSync(process.execPath, ['--check', '--input-type=module'], {
    input: readFileSync(join(work, 'functions', result.functionName, 'index.ts'), 'utf8'), encoding: 'utf8', timeout: 10_000,
  })
  assert.equal(syntax.status, 0, syntax.stderr)
  assert.deepEqual(installLocalPaymentFixture({ root, instance: 'journey56', portBase: 58320, run: dockerRun() }), result)
})

test('wrong project, copied source or port identity is refused before installation', () => {
  const { root, work } = workspace()
  for (const patch of [{ instance: 'production' }, { portBase: 55320 }]) {
    assert.throws(() => installLocalPaymentFixture({ root, instance: 'journey56', portBase: 58320, run: dockerRun(), ...patch }))
  }
  writeFileSync(join(work, 'functions/mobile-api/index.ts'), 'foreign source')
  assert.throws(() => installLocalPaymentFixture({ root, instance: 'journey56', portBase: 58320, run: dockerRun() }), /QA payment fixture target refused/u)
})

test('unsafe binding or existing inference credential refuses the fixture safely', () => {
  for (const options of [{ foreignBinding: true }, { liveKey: true }]) {
    const { root } = workspace()
    assert.throws(() => installLocalPaymentFixture({ root, instance: 'journey56', portBase: 58320, run: dockerRun(options) }), error => {
      assert.equal(error.message, 'QA payment fixture target refused')
      return true
    })
  }
})
