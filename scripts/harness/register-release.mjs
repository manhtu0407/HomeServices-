import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkHarnessRelease, resolveReleaseArtifactPath } from './release-bundle.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const DEFAULT_RELEASE_PATH = 'artifacts/harness/release-manifest.json'
const DEFAULT_OUTPUT_PATH = 'artifacts/harness/release-ledger-registration.sql'

export function buildReleaseRegistrationSql(release) {
  const problems = checkHarnessRelease(release)
  if (problems.length) throw new Error(`release artifact is invalid: ${problems.join('; ')}`)

  const encodedArtifact = Buffer.from(JSON.stringify(release), 'utf8').toString('base64')
  return [
    'with release_artifact as (',
    `  select convert_from(decode('${encodedArtifact}', 'base64'), 'utf8')::jsonb as artifact`,
    ')',
    'select (public.register_harness_release(',
    "  artifact->>'releaseId',",
    "  artifact->>'environment',",
    "  artifact->>'gitSha',",
    "  artifact->>'manifestSha256',",
    "  artifact->>'migrationInventorySha256',",
    "  artifact->>'databaseTypesSha256',",
    "  artifact->>'promptBundleSha256',",
    "  artifact->>'policyBundleSha256',",
    "  artifact->>'runtimeConfigurationSha256',",
    "  artifact->>'evaluationSuiteVersion',",
    "  artifact->>'evaluationSuiteSha256',",
    "  artifact->>'capabilityRegistrySha256',",
    "  artifact->>'accessMatrixSha256',",
    "  artifact->>'reliabilityPolicySha256',",
    "  artifact->>'promotionPolicySha256',",
    "  artifact->>'bundleSha256',",
    "  artifact->'edgeFunctions',",
    '  artifact,',
    '  null,',
    "  'operator-release-ledger',",
    "  jsonb_build_object('registration_method', 'operator-release-ledger')",
    ')).release_id as release_id',
    'from release_artifact;',
    '',
  ].join('\n')
}

export function resolveRegistrationOutputPath(rootInput = ROOT, outputPath = DEFAULT_OUTPUT_PATH) {
  return resolveReleaseArtifactPath(rootInput, outputPath)
}

export function parseReleaseRegistrationArgs(args = process.argv.slice(2)) {
  let releasePath = DEFAULT_RELEASE_PATH
  let outputPath = DEFAULT_OUTPUT_PATH

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === '--') continue
    if (argument === '--release') releasePath = requireValue(args, ++index, argument)
    else if (argument === '--output') outputPath = requireValue(args, ++index, argument)
    else throw new Error(`unknown argument: ${argument}`)
  }

  return { releasePath, outputPath }
}

function requireValue(args, index, option) {
  const value = args[index]
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a path`)
  return value
}

function main() {
  const { releasePath, outputPath } = parseReleaseRegistrationArgs()
  const releaseFile = resolveReleaseArtifactPath(ROOT, releasePath)
  const outputFile = resolveRegistrationOutputPath(ROOT, outputPath)
  const release = JSON.parse(readFileSync(releaseFile, 'utf8'))
  const sql = buildReleaseRegistrationSql(release)

  mkdirSync(dirname(outputFile), { recursive: true })
  writeFileSync(outputFile, sql)
  console.log(`release-ledger registration SQL written: ${outputPath}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
