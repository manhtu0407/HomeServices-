import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareRunnerEnv } from '../run.mjs'
import { loopbackQaDockerArgs } from './local-qa-network.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
try {
  const args = process.argv.slice(2)
  if (args[0] !== '--instance' || args[2] !== '--port-base' || args[4] !== '--') throw new Error('expected explicit QA instance and ports')
  const instance = args[1]
  const portBase = Number(args[3])
  loopbackQaDockerArgs(instance, portBase, 'node', [])
  const cliArgs = args.slice(5)
  const workdir = `.scratch/local-migrations-qa-${instance}`
  const expected = ['start', '--workdir', workdir, '--network-id', `nestscout-qa-fixture-${instance}`]
  if (expected.some((value, index) => cliArgs[index] !== value) ||
      (cliArgs.length !== 5 && (cliArgs.length !== 7 || cliArgs[5] !== '-x' || !/^[a-z,-]+$/u.test(cliArgs[6])))) {
    throw new Error('QA CLI invocation refused')
  }
  const config = readFileSync(resolve(root, workdir, 'supabase/config.toml'), 'utf8')
  if (!new RegExp(`^project_id = "nestscout-qa-${instance}"$`, 'mu').test(config)) throw new Error('QA project identity mismatch')
  const require = createRequire(resolve(root, 'apps/api/package.json'))
  const packageFile = require.resolve('supabase/package.json')
  const pkg = JSON.parse(readFileSync(packageFile, 'utf8'))
  if (pkg.version !== '2.121.0' || pkg.bin?.supabase !== 'dist/supabase.js') throw new Error('QA CLI adapter requires the pinned official Node CLI')
  const env = { ...prepareRunnerEnv(), NESTSCOUT_LOCAL_QA_INSTANCE: instance, NESTSCOUT_LOCAL_QA_PORT_BASE: String(portBase) }
  for (const key of Object.keys(env)) {
    if (/^(ANTHROPIC|DEEPSEEK|PERPLEXITY|OPENAI|SEPAY|VIETMAP|SENTRY|TELEGRAM|SUPABASE)_/u.test(key) || ['NODE_OPTIONS', 'BUN_BE_BUN'].includes(key)) delete env[key]
  }
  env.BUN_OPTIONS = '--preload=./scripts/harness/local-qa-loopback-preload.mjs --no-env-file'
  const child = spawn(process.execPath, [resolve(dirname(packageFile), pkg.bin.supabase), ...cliArgs], { cwd: root, env, stdio: 'inherit', windowsHide: true })
  child.on('error', () => { console.error('QA CLI child could not start'); process.exitCode = 1 })
  child.on('exit', (code) => { process.exitCode = code ?? 1 })
} catch (error) {
  console.error(error.message)
  process.exitCode = 2
}
