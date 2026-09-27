import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { runtimeReleaseBindingsFromHostedState } from './runtime-release-bindings.mjs'
import { RELEASE_EDGE_FUNCTIONS } from './release-bundle.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SHA256 = /^[0-9a-f]{64}$/u

export function verifyRollbackProof(input) {
  const problems = []
  const before = input?.hostedBefore
  const after = input?.hostedAfter
  const controlBefore = input?.controlBefore?.result ?? input?.controlBefore
  const controlAfter = input?.controlAfter?.result ?? input?.controlAfter
  const controlRecovery = input?.controlRecovery

  let expectedBindings
  let restoredBindings
  try {
    expectedBindings = runtimeReleaseBindingsFromHostedState(before)
    restoredBindings = runtimeReleaseBindingsFromHostedState(after)
  } catch (error) {
    problems.push(error instanceof Error ? error.message : String(error))
  }
  if (expectedBindings && restoredBindings &&
      JSON.stringify(expectedBindings) !== JSON.stringify(restoredBindings)) {
    problems.push('restored runtime release identity does not match the hosted baseline')
  }

  const restoredFunctions = {}
  for (const functionName of RELEASE_EDGE_FUNCTIONS) {
    const beforeFunction = before?.managedEdgeFunctions?.[functionName]
    const afterFunction = after?.managedEdgeFunctions?.[functionName]
    if (!validActiveFunction(beforeFunction)) problems.push(`hosted baseline ${functionName} evidence is invalid`)
    if (!validActiveFunction(afterFunction)) problems.push(`restored ${functionName} is not an active managed Edge function`)
    if (validActiveFunction(beforeFunction) && validActiveFunction(afterFunction) &&
        afterFunction.version <= beforeFunction.version) {
      problems.push(`restored ${functionName} version does not prove a post-failure redeploy`)
    }
    if (validActiveFunction(beforeFunction) && validActiveFunction(afterFunction) &&
        !sameRuntimeConfiguration(beforeFunction, afterFunction)) {
      problems.push(`restored ${functionName} runtime configuration does not match the hosted baseline`)
    }
    const rollbackSource = input?.rollbackSourceSha256ByFunction?.[functionName]
    const restoredSource = input?.restoredSourceSha256ByFunction?.[functionName]
    if (!SHA256.test(rollbackSource ?? '') || !SHA256.test(restoredSource ?? '') ||
        rollbackSource !== restoredSource) {
      problems.push(`redownloaded rollback source does not match the bound hosted source for ${functionName}`)
    }
    restoredFunctions[functionName] = {
      edgeVersion: afterFunction?.version ?? null,
      hostedDigest: afterFunction?.ezbr_sha256 ?? null,
      sourceSha256: restoredSource ?? null,
    }
  }

  const baselineVersions = migrationVersions(before?.migrations, problems, 'baseline')
  const restoredVersions = migrationVersions(after?.migrations, problems, 'restored')
  if (baselineVersions && restoredVersions &&
      restoredVersions.slice(0, baselineVersions.length).join('\n') !== baselineVersions.join('\n')) {
    problems.push('rollback rewrote or reordered hosted migration history')
  }

  if (!controlBefore || !controlAfter) problems.push('release control evidence is missing')
  else {
    if (controlBefore.candidate_release_id !== null || controlBefore.candidate_cohort_id !== null) {
      problems.push('pre-canary release control already had a candidate')
    }
    if (controlAfter.active_release_id !== controlBefore.active_release_id) {
      problems.push('canary abort changed the active release')
    }
    if (controlAfter.candidate_release_id !== null || controlAfter.candidate_cohort_id !== null ||
        controlAfter.candidate_packet_sha256 !== null) {
      problems.push('canary candidate remained active after abort')
    }
    const recoveryModes = new Set(['candidate_aborted', 'active_rolled_back', 'already_safe'])
    if (controlRecovery?.action !== 'recover' || !recoveryModes.has(controlRecovery?.mode) ||
        JSON.stringify(controlRecovery?.after) !== JSON.stringify(controlAfter)) {
      problems.push('release control recovery receipt does not match hosted post-failure state')
    } else if (controlRecovery.mode === 'already_safe') {
      if (JSON.stringify(controlRecovery.before) !== JSON.stringify(controlRecovery.after)) {
        problems.push('already-safe release control receipt changed state')
      }
    } else if (!Number.isSafeInteger(controlRecovery.before?.revision) ||
        controlAfter.revision !== controlRecovery.before.revision + 1) {
      problems.push('release control recovery did not advance exactly one atomic revision')
    }
  }

  return Object.freeze({
    schemaVersion: 'stage1-rollback-proof.v2',
    ok: problems.length === 0,
    problems,
    activeReleaseId: controlAfter?.active_release_id ?? null,
    restoredFunctions,
  })
}

function validActiveFunction(value) {
  return value?.status === 'ACTIVE' && Number.isSafeInteger(value?.version) && value.version > 0 &&
    SHA256.test(value?.ezbr_sha256 ?? '')
}

function sameRuntimeConfiguration(before, after) {
  return before.verify_jwt === after.verify_jwt && before.import_map === after.import_map &&
    deployPath(before.entrypoint_path) === deployPath(after.entrypoint_path) &&
    deployPath(before.import_map_path) === deployPath(after.import_map_path)
}

// Hosted paths live under /tmp/user_fn_<ref>_<function id>_<version>/, and a rollback must raise the
// version, so only that deploy-version segment is ignored; project, function, and file must still match.
function deployPath(path) {
  return typeof path === 'string'
    ? path.replace(/\/user_fn_([a-z0-9]+)_([0-9a-f-]{36})_\d+\//u, '/user_fn_$1_$2_version/')
    : path
}

function migrationVersions(rows, problems, label) {
  if (!Array.isArray(rows)) {
    problems.push(`${label} migration evidence is missing`)
    return null
  }
  const versions = rows.map((row) => String(row?.version ?? ''))
  if (versions.some((version) => !/^\d{14}$/u.test(version)) ||
      new Set(versions).size !== versions.length ||
      versions.join('\n') !== [...versions].sort().join('\n')) {
    problems.push(`${label} migration evidence is invalid`)
    return null
  }
  return versions
}

function insideRoot(path) {
  const absolute = resolve(ROOT, path)
  const local = relative(ROOT, absolute)
  if (!local || local.startsWith('..')) throw new Error('rollback proof path escapes repository root')
  return absolute
}

function parseArgs(args) {
  const options = {}
  const supported = new Set([
    '--hosted-before', '--hosted-after', '--control-before', '--control-after', '--control-recovery',
    '--rollback-mobile-source-sha256', '--restored-mobile-source-sha256',
    '--rollback-maintainer-source-sha256', '--restored-maintainer-source-sha256', '--output',
  ])
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index]
    if (!supported.has(key)) throw new Error(`unknown argument: ${key}`)
    const value = args[++index]
    if (!value || value.startsWith('--')) throw new Error(`${key} requires a value`)
    options[key.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())] = value
  }
  return options
}

function readJson(path) {
  return JSON.parse(readFileSync(insideRoot(path), 'utf8'))
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  for (const required of [
    'hostedBefore', 'hostedAfter', 'controlBefore', 'controlAfter', 'controlRecovery',
    'rollbackMobileSourceSha256', 'restoredMobileSourceSha256',
    'rollbackMaintainerSourceSha256', 'restoredMaintainerSourceSha256', 'output',
  ]) if (!options[required]) throw new Error(`rollback proof option is missing: ${required}`)
  const report = verifyRollbackProof({
    hostedBefore: readJson(options.hostedBefore),
    hostedAfter: readJson(options.hostedAfter),
    controlBefore: readJson(options.controlBefore),
    controlAfter: readJson(options.controlAfter),
    controlRecovery: readJson(options.controlRecovery),
    rollbackSourceSha256ByFunction: {
      'mobile-api': options.rollbackMobileSourceSha256,
      'kael-matching-maintainer': options.rollbackMaintainerSourceSha256,
    },
    restoredSourceSha256ByFunction: {
      'mobile-api': options.restoredMobileSourceSha256,
      'kael-matching-maintainer': options.restoredMaintainerSourceSha256,
    },
  })
  const output = insideRoot(options.output)
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
  if (!report.ok) throw new Error(`rollback proof failed: ${report.problems.join('; ')}`)
  console.log('rollback proof passed: all managed Edge functions were restored')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
