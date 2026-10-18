import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareRunnerEnv } from '../run.mjs'
import { assertLocalQaBindings, loopbackQaDockerArgs } from './local-qa-network.mjs'
import { resolveLocalQaHttpTarget } from './local-qa-http-target.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
let stage = 'arguments'
try {
  const args = process.argv.slice(2)
  const selection = args.length === 6 && args[4] === '--only' && args[5] === 'cancellation' ? 'cancellation' : null
  if ((args.length !== 4 && !selection) || args[0] !== '--instance' || args[2] !== '--port-base') throw new Error('invalid arguments')
  const instance = args[1]
  const portBase = Number(args[3])
  loopbackQaDockerArgs(instance, portBase, 'node', [])
  const env = { ...prepareRunnerEnv() }
  const run = (command, dockerArgs, options) => spawnSync(command, dockerArgs, { ...options, env })
  stage = 'actual loopback bindings'
  assertLocalQaBindings(instance, run)
  stage = 'owned Edge environment'
  const project = `nestscout-qa-${instance}`
  const inspected = run('docker', ['inspect', '--type', 'container', `supabase_edge_runtime_${project}`, '--format', '{{json .}}'], { encoding: 'utf8', timeout: 15_000, windowsHide: true })
  if (inspected.status !== 0 || inspected.error) throw new Error('Edge unavailable')
  const container = JSON.parse(inspected.stdout)
  if (container.Config.Labels?.['com.supabase.cli.project'] !== project) throw new Error('Edge identity mismatch')
  const localEnv = Object.fromEntries(container.Config.Env.map(value => {
    const index = value.indexOf('=')
    return [value.slice(0, index), value.slice(index + 1)]
  }))
  if (localEnv.KAEL_AI_KILL_SWITCH !== 'true' || localEnv.SUPABASE_URL !== `http://host.docker.internal:${portBase + 1}` ||
      Object.entries(localEnv).some(([key, value]) => /^(ANTHROPIC|DEEPSEEK|PERPLEXITY|OPENAI)_/u.test(key) && value)) throw new Error('unsafe inference configuration')
  for (const key of Object.keys(env)) {
    if (/^(ANTHROPIC|DEEPSEEK|PERPLEXITY|OPENAI|SEPAY|VIETMAP|SENTRY|TELEGRAM|SUPABASE|NESTSCOUT_QA_HTTP|NESTSCOUT_QA_SCOPE|NESTSCOUT_QA_PAYMENT|NESTSCOUT_QA_CANCELLATION)_/u.test(key) || ['NODE_OPTIONS', 'BUN_OPTIONS', 'BUN_BE_BUN'].includes(key)) delete env[key]
  }
  Object.assign(env, {
    NESTSCOUT_QA_HTTP_INSTANCE: instance,
    NESTSCOUT_QA_HTTP_PORT_BASE: String(portBase),
    NESTSCOUT_ENVIRONMENT: 'local',
    NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${portBase + 1}`,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: localEnv.SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: localEnv.SUPABASE_SERVICE_ROLE_KEY,
  })
  stage = 'local key classification'
  resolveLocalQaHttpTarget(env)
  const fixtureFile = resolve(root, `.scratch/local-migrations-qa-${instance}/qa-scope-fixture.json`)
  if (existsSync(fixtureFile)) {
    stage = 'scope fixture identity'
    const fixture = JSON.parse(readFileSync(fixtureFile, 'utf8'))
    if (fixture.instance !== instance || fixture.mode !== 'provider-fixture' || !/^qa-scope-fixture-[a-f0-9]{12}$/u.test(fixture.functionName)) throw new Error('invalid fixture identity')
    env.NESTSCOUT_QA_SCOPE_FIXTURE_NAME = fixture.functionName
  }
  const paymentFile = resolve(root, `.scratch/local-migrations-qa-${instance}/qa-payment-fixture.json`)
  if (existsSync(paymentFile)) {
    stage = 'payment fixture identity'
    const fixture = JSON.parse(readFileSync(paymentFile, 'utf8'))
    if (fixture.instance !== instance || fixture.mode !== 'payment-fixture' || !/^qa-payment-fixture-[a-f0-9]{12}$/u.test(fixture.functionName)) throw new Error('invalid payment fixture identity')
    env.NESTSCOUT_QA_PAYMENT_FIXTURE_NAME = fixture.functionName
  }
  const cancellationFile = resolve(root, `.scratch/local-migrations-qa-${instance}/qa-cancellation-fixture.json`)
  if (existsSync(cancellationFile)) {
    stage = 'cancellation fixture identity'
    const fixture = JSON.parse(readFileSync(cancellationFile, 'utf8'))
    if (fixture.instance !== instance || fixture.mode !== 'cancellation-fixture' || !/^qa-cancellation-fixture-[a-f0-9]{12}$/u.test(fixture.functionName)) throw new Error('invalid fixture identity')
    env.NESTSCOUT_QA_CANCELLATION_FIXTURE_NAME = fixture.functionName
  }
  stage = 'Vitest integration execution'
  mkdirSync(resolve(root, '.scratch'), { recursive: true })
  const files = [
    'src/__tests__/integration/kael-local-http-intake-pillar.test.ts',
    'src/__tests__/integration/kael-local-http-scope-pillar.test.ts',
    'src/__tests__/integration/kael-local-http-scope-proposal-pillar.test.ts',
    'src/__tests__/integration/kael-local-http-matching-pillar.test.ts',
    'src/__tests__/integration/kael-local-http-confirmation-pillar.test.ts',
    'src/__tests__/integration/kael-local-http-fulfillment-pillar.test.ts',
    'src/__tests__/integration/kael-local-http-payment-pillar.test.ts',
    'src/__tests__/integration/kael-local-http-cancellation-pillar.test.ts',
  ]
  const selectedFiles = selection ? files.filter(file => file.endsWith('kael-local-http-cancellation-pillar.test.ts')) : files
  const reportFile = selection ? '.scratch/kael-local-http-cancellation-results.json' : '.scratch/kael-local-http-results.json'
  console.log(JSON.stringify({ selection: selection ?? 'all', files: selectedFiles.length, reportFile }))
  const result = spawnSync(process.execPath, [
    resolve(root, 'apps/api/node_modules/vitest/vitest.mjs'), 'run', '--no-file-parallelism', ...selectedFiles,
    '--reporter=json', '--reporter=default', '--outputFile', resolve(root, reportFile),
  ], { cwd: resolve(root, 'apps/api'), env, stdio: 'inherit', timeout: 300_000, windowsHide: true })
  process.exitCode = result.status ?? 1
} catch {
  console.error(`QA HTTP runner refused at ${stage}`)
  process.exitCode = 2
}
