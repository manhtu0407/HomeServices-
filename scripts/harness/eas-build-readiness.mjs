import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkHarnessRelease, resolveReleaseArtifactPath } from './release-bundle.mjs'
import { selectExactEasBuilds } from './mobile-binary-attestation.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function parseArgs(args) {
  const options = {}
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index]
    if (!['--release', '--builds', '--mode', '--platform'].includes(key)) throw new Error(`unknown EAS readiness argument: ${key}`)
    const value = args[++index]
    if (!value || value.startsWith('--')) throw new Error(`${key} requires a value`)
    options[key.slice(2)] = value
  }
  if (!options.release || !options.builds || !['missing', 'artifact-url', 'build-id'].includes(options.mode)) {
    throw new Error('EAS readiness requires release, builds, and a supported mode')
  }
  if (options.mode !== 'missing' && !['ios', 'android'].includes(options.platform)) {
    throw new Error('EAS readiness artifact/build lookup requires ios or android')
  }
  return options
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const release = JSON.parse(readFileSync(resolveReleaseArtifactPath(ROOT, options.release), 'utf8'))
  const problems = checkHarnessRelease(release)
  if (problems.length > 0 || release.environment !== 'production') throw new Error('EAS readiness release is invalid')
  const builds = JSON.parse(readFileSync(resolveReleaseArtifactPath(ROOT, options.builds), 'utf8'))
  const selected = selectExactEasBuilds(release, builds)
  if (options.mode === 'missing') {
    process.stdout.write(`${['ios', 'android'].filter((platform) => !selected[platform]).join(',')}\n`)
    return
  }
  const build = selected[options.platform]
  if (!build) throw new Error(`exact ${options.platform} EAS build is missing`)
  if (options.mode === 'build-id') {
    process.stdout.write(`${build.id}\n`)
    return
  }
  const url = build?.artifacts?.buildUrl
  if (typeof url !== 'string' || !/^https:\/\//u.test(url)) throw new Error(`exact ${options.platform} EAS artifact URL is missing`)
  process.stdout.write(`${url}\n`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { main() } catch (error) {
    process.stderr.write(`eas-build-readiness failed: ${error.message}\n`)
    process.exitCode = 1
  }
}
