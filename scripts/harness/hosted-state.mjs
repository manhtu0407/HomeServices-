import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { collectHostedDeploymentState } from './deployment-drift.mjs'
import { assertReleaseTarget } from './release-safety.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function parseArgs(args) {
  const options = {}
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index]
    if (['--environment', '--project-ref', '--project-url', '--output'].includes(key)) {
      const value = args[++index]
      if (!value || value.startsWith('--')) throw new Error(`${key} requires a value`)
      options[key.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())] = value
    } else throw new Error(`unknown argument: ${key}`)
  }
  return options
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  for (const required of ['environment', 'projectRef', 'projectUrl', 'output']) {
    if (!options[required]) throw new Error(`missing hosted-state option: ${required}`)
  }
  const target = assertReleaseTarget(options)
  const state = await collectHostedDeploymentState({
    accessToken: process.env.SUPABASE_ACCESS_TOKEN,
    environment: target.environment,
    projectRef: target.projectRef,
  })
  const output = resolve(ROOT, options.output)
  const local = relative(ROOT, output)
  if (!local || local.startsWith('..')) throw new Error('hosted-state output escapes repository root')
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, `${JSON.stringify({ ...state, projectUrl: target.projectUrl }, null, 2)}\n`)
  console.log(`hosted state collected: ${state.environment}/${state.projectRef}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
