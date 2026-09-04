import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkHarnessRelease } from './release-bundle.mjs'
import { createReleaseControlClient } from './release-control-client.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

export async function readHostedReleaseArtifact(input, fetchImpl = fetch) {
  if (input.releaseId === null) return null
  const client = createReleaseControlClient({ ...input, fetchImpl })
  const release = await client.selectRelease(input.releaseId)
  const problems = checkHarnessRelease(release)
  if (problems.length > 0 || release.releaseId !== input.releaseId || release.environment !== input.environment) {
    throw new Error(`hosted release artifact is invalid: ${problems.join('; ')}`)
  }
  return release
}

function parseArgs(args) {
  const options = {}
  const supported = new Set(['--environment', '--project-ref', '--release-id', '--output'])
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index]
    if (!supported.has(key)) throw new Error(`unknown argument: ${key}`)
    const value = args[++index]
    if (!value || value.startsWith('--')) throw new Error(`${key} requires a value`)
    options[key.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())] = value
  }
  return options
}

function insideRoot(path) {
  const absolute = resolve(ROOT, path)
  const local = relative(ROOT, absolute)
  if (!local || local.startsWith('..')) throw new Error('hosted release artifact path escapes repository root')
  return absolute
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  for (const name of ['environment', 'projectRef', 'releaseId', 'output']) {
    if (!options[name]) throw new Error(`hosted release artifact option is missing: ${name}`)
  }
  const releaseId = options.releaseId === 'none' ? null : options.releaseId
  const release = await readHostedReleaseArtifact({
    environment: options.environment,
    projectRef: options.projectRef,
    projectUrl: options.environment === 'production'
      ? 'https://iwevizmsedyqozxlawwl.supabase.co'
      : 'https://xyylanuyflrjzbjzhqfl.supabase.co',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    releaseId,
  })
  const output = insideRoot(options.output)
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, `${JSON.stringify(release, null, 2)}\n`)
  process.stdout.write(release ? `hosted release artifact verified: ${release.releaseId}\n` : 'legacy hosted release has no artifact\n')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
