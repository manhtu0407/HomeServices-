import { spawnSync } from 'node:child_process'
import { prepareRunnerEnv } from '../run.mjs'
import { installLocalCancellationFixture } from './local-payment-fixture.mjs'

try {
  if (process.argv.length !== 6 || process.argv[2] !== '--instance' || process.argv[4] !== '--port-base') throw new Error('arguments refused')
  const env = prepareRunnerEnv()
  const run = (command, args, options) => spawnSync(command, args, { ...options, env })
  console.log(JSON.stringify(installLocalCancellationFixture({ instance: process.argv[3], portBase: Number(process.argv[5]), run })))
} catch (error) {
  console.error(`QA cancellation fixture target refused at ${error.cause ?? 'arguments'}`)
  process.exitCode = 2
}
