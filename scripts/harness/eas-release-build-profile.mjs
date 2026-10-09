import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { resolveReleaseArtifactPath } from './release-bundle.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const RELEASE_ID = /^harness-[0-9a-f]{12}-[0-9a-f]{12}$/u
const GIT_SHA = /^[0-9a-f]{40}$/u

export function addReleaseBuildEnvironment(easConfig, release) {
  if (!RELEASE_ID.test(release?.releaseId ?? '')) throw new Error('release id is invalid')
  if (!GIT_SHA.test(release?.gitSha ?? '')) throw new Error('release git sha is invalid')
  if (!easConfig || typeof easConfig !== 'object' || !easConfig.build?.production) {
    throw new Error('production EAS build profile is missing')
  }
  const prepared = structuredClone(easConfig)
  const profile = prepared.build.production
  if (profile.env !== undefined && (!profile.env || typeof profile.env !== 'object' || Array.isArray(profile.env))) {
    throw new Error('production EAS build profile environment is invalid')
  }
  profile.env = {
    ...profile.env,
    NESTSCOUT_RELEASE_ID: release.releaseId,
    NESTSCOUT_BUILD_GIT_SHA: release.gitSha,
  }
  return prepared
}

function parseArguments(args) {
  const options = {}
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index]
    if (!['--action', '--release', '--backup'].includes(flag)) throw new Error(`unknown EAS build profile argument: ${flag}`)
    const value = args[++index]
    if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
    options[flag.slice(2)] = value
  }
  if (!['prepare', 'restore'].includes(options.action) || !options.backup) {
    throw new Error('EAS build profile requires an action and backup path')
  }
  if (options.action === 'prepare' && !options.release) throw new Error('EAS build profile prepare requires a release path')
  return options
}

function resolveBackupPath(path) {
  const artifactsRoot = resolve(ROOT, 'artifacts')
  const resolved = resolve(ROOT, path)
  if (!resolved.startsWith(`${artifactsRoot}${sep}`)) throw new Error('EAS build profile backup must stay under artifacts/')
  return resolved
}

function main() {
  const options = parseArguments(process.argv.slice(2))
  const profilePath = resolve(ROOT, 'apps/mobile/eas.json')
  const backupPath = resolveBackupPath(options.backup)
  if (options.action === 'prepare') {
    if (existsSync(backupPath)) throw new Error('EAS build profile backup already exists')
    const release = JSON.parse(readFileSync(resolveReleaseArtifactPath(ROOT, options.release), 'utf8'))
    const original = readFileSync(profilePath)
    const prepared = addReleaseBuildEnvironment(JSON.parse(original.toString('utf8')), release)
    mkdirSync(dirname(backupPath), { recursive: true })
    writeFileSync(backupPath, original)
    writeFileSync(profilePath, `${JSON.stringify(prepared, null, 2)}\n`)
    process.stdout.write('Production EAS build profile is bound to the current release\n')
    return
  }
  if (!existsSync(backupPath)) throw new Error('EAS build profile backup is missing')
  writeFileSync(profilePath, readFileSync(backupPath))
  unlinkSync(backupPath)
  process.stdout.write('Production EAS build profile restored\n')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main() } catch (error) {
    process.stderr.write(`eas-release-build-profile failed: ${error.message}\n`)
    process.exitCode = 1
  }
}
