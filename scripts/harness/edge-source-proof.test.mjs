import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import test from 'node:test'

import {
  buildEdgeSourceProof,
  edgeSourceClosure,
  verifyEdgeSourceProof,
  verifyHostedSourceProof,
} from './edge-source-proof.mjs'
import { buildHarnessRelease } from './release-bundle.mjs'
import { sourceDeploymentAttestationInvocation } from './source-deployment-attestation.mjs'

const root = resolve(import.meta.dirname, '../..')
const projectRef = 'xyylanuyflrjzbjzhqfl'
const functionId = '10000000-0000-4000-8000-000000000057'

test('binds the provider deployment to the exact redownloaded mobile-api import closure', () => {
  const release = buildHarnessRelease({
    root,
    environment: 'staging',
    gitSha: 'a'.repeat(40),
    requireCleanWorktree: false,
  })
  const hosted = hostedCandidate(release)
  const proof = buildEdgeSourceProof({ release, hosted, sourceRoot: root, now: 0 })

  assert.equal(verifyEdgeSourceProof(proof), true)
  assert.equal(proof.deploymentId, `${projectRef}_${functionId}_7`)
  assert.equal(proof.sourceSha256, release.edgeFunctions['mobile-api'])
  assert.deepEqual(proof.sourceInputs, release.edgeFunctionInputs['mobile-api'])
  assert.ok(proof.sourceInputs.some((path) => path.startsWith('supabase/functions/_shared/')))
  assert.ok(proof.sourceInputs.some((path) => path.startsWith('supabase/functions/mobile-api/_shared/')))
  assert.deepEqual(sourceDeploymentAttestationInvocation(proof), {
    name: 'attest_stage1_source_deployment',
    args: {
      p_environment: 'staging',
      p_release_id: release.releaseId,
      p_function_name: 'mobile-api',
      p_deployment_id: `${projectRef}_${functionId}_7`,
      p_edge_version: 7,
      p_source_sha256: release.edgeFunctions['mobile-api'],
      p_hosted_bundle_sha256: '7'.repeat(64),
      p_runtime_configuration_sha256: release.edgeRuntimeConfigurations['mobile-api'].sha256,
      p_verify_jwt: false,
      p_import_map: true,
      p_entrypoint_path: 'index.ts',
      p_import_map_path: 'deno.json',
      p_proof_sha256: proof.proofSha256,
    },
  })
})

test('rejects a provider identity that does not match the managed function ID and version', () => {
  const release = buildHarnessRelease({
    root,
    environment: 'staging',
    gitSha: 'b'.repeat(40),
    requireCleanWorktree: false,
  })
  const hosted = { ...hostedCandidate(release), deploymentId: `${projectRef}_${functionId}_8` }
  assert.throws(
    () => buildEdgeSourceProof({ release, hosted, sourceRoot: root }),
    /provider deployment identity mismatch/u,
  )
})

test('binds a second managed function to its own provider deployment identity', () => {
  const release = buildHarnessRelease({
    root,
    environment: 'staging',
    gitSha: 'e'.repeat(40),
    requireCleanWorktree: false,
  })
  const hosted = hostedCandidate(release)
  const maintainerId = '10000000-0000-4000-8000-000000000058'
  hosted.managedEdgeFunctions['kael-matching-maintainer'] = {
    id: maintainerId,
    status: 'ACTIVE',
    version: 11,
    ezbr_sha256: '8'.repeat(64),
    verify_jwt: false,
    import_map: true,
    entrypoint_path: 'index.ts',
    import_map_path: 'deno.json',
  }
  const proof = buildEdgeSourceProof({
    release,
    hosted,
    sourceRoot: root,
    functionName: 'kael-matching-maintainer',
    now: 0,
  })

  assert.equal(proof.deploymentId, `${projectRef}_${maintainerId}_11`)
  assert.equal(verifyHostedSourceProof(proof, hosted), true)
})

test('accepts exact provider file URIs after a configuration-only version and rejects path identity drift', () => {
  const release = buildHarnessRelease({
    root,
    environment: 'staging',
    gitSha: 'f'.repeat(40),
    requireCleanWorktree: false,
  })
  const hosted = hostedCandidate(release)
  const prefix = `file:///tmp/user_fn_${projectRef}_${functionId}_6/source/supabase/functions/mobile-api`
  hosted.managedEdgeFunctions['mobile-api'] = {
    ...hosted.managedEdgeFunctions['mobile-api'],
    entrypoint_path: `${prefix}/index.ts`,
    import_map_path: `${prefix}/deno.json`,
  }
  const proof = buildEdgeSourceProof({ release, hosted, sourceRoot: root, now: 0 })
  assert.equal(verifyEdgeSourceProof(proof), true)
  const invocation = sourceDeploymentAttestationInvocation(proof)
  assert.equal(invocation.args.p_entrypoint_path, 'supabase/functions/mobile-api/index.ts')
  assert.equal(invocation.args.p_import_map_path, 'supabase/functions/mobile-api/deno.json')
  assert.throws(
    () => buildEdgeSourceProof({
      release,
      hosted: {
        ...hosted,
        managedEdgeFunctions: {
          ...hosted.managedEdgeFunctions,
          'mobile-api': {
            ...hosted.managedEdgeFunctions['mobile-api'],
            entrypoint_path: hosted.managedEdgeFunctions['mobile-api'].entrypoint_path.replace(
              functionId,
              '20000000-0000-4000-8000-000000000057',
            ),
          },
        },
      },
      sourceRoot: root,
    }),
    /runtime configuration does not match/u,
  )
  assert.throws(
    () => buildEdgeSourceProof({
      release,
      hosted: {
        ...hosted,
        managedEdgeFunctions: {
          ...hosted.managedEdgeFunctions,
          'mobile-api': {
            ...hosted.managedEdgeFunctions['mobile-api'],
            import_map_path: hosted.managedEdgeFunctions['mobile-api'].import_map_path.replace('_6/source', '_8/source'),
          },
        },
      },
      sourceRoot: root,
    }),
    /runtime configuration does not match/u,
  )
})

test('accepts exact absolute deploy file URLs and canonicalizes them for hosted attestation', () => {
  const release = buildHarnessRelease({
    root,
    environment: 'staging',
    gitSha: 'e'.repeat(40),
    requireCleanWorktree: false,
  })
  const hosted = hostedCandidate(release)
  const prefix = 'file:///C:/Users/Tu/My%20Project/supabase/functions/mobile-api'
  hosted.managedEdgeFunctions['mobile-api'] = {
    ...hosted.managedEdgeFunctions['mobile-api'],
    entrypoint_path: `${prefix}/index.ts`,
    import_map_path: `${prefix}/deno.json`,
  }

  const proof = buildEdgeSourceProof({ release, hosted, sourceRoot: root, now: 0 })
  const invocation = sourceDeploymentAttestationInvocation(proof)

  assert.equal(verifyEdgeSourceProof(proof), true)
  assert.equal(invocation.args.p_entrypoint_path, 'supabase/functions/mobile-api/index.ts')
  assert.equal(invocation.args.p_import_map_path, 'supabase/functions/mobile-api/deno.json')
  assert.throws(
    () => buildEdgeSourceProof({
      release,
      hosted: {
        ...hosted,
        managedEdgeFunctions: {
          ...hosted.managedEdgeFunctions,
          'mobile-api': {
            ...hosted.managedEdgeFunctions['mobile-api'],
            entrypoint_path: 'file:///workspace/%2e%2e/supabase/functions/mobile-api/index.ts',
          },
        },
      },
      sourceRoot: root,
    }),
    /runtime configuration does not match/u,
  )
})

test('rejects a redownload whose global shared dependency bytes differ from the reviewed candidate', () => {
  const release = buildHarnessRelease({
    root,
    environment: 'staging',
    gitSha: 'c'.repeat(40),
    requireCleanWorktree: false,
  })
  const sourceRoot = join(tmpdir(), `nestscout-edge-source-proof-${process.pid}-${Date.now()}`)
  for (const path of release.edgeFunctionInputs['mobile-api']) {
    const source = resolve(root, path)
    const target = resolve(sourceRoot, path)
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(source, target)
  }
  const sharedPath = release.edgeFunctionInputs['mobile-api'].find((path) =>
    path.startsWith('supabase/functions/_shared/') && path.endsWith('.ts'))
  assert.ok(sharedPath, 'the real mobile-api closure must contain a global shared TypeScript dependency')
  const sharedTarget = resolve(sourceRoot, sharedPath)
  writeFileSync(sharedTarget, `${readFileSync(sharedTarget, 'utf8')}\n// hosted-byte-mutation\n`)

  const closure = edgeSourceClosure({ sourceRoot, functionName: 'mobile-api' })
  assert.notEqual(closure.digest, release.edgeFunctions['mobile-api'])
  assert.throws(
    () => buildEdgeSourceProof({ release, hosted: hostedCandidate(release), sourceRoot }),
    /redownloaded hosted source does not match/u,
  )
})

test('rejects a checksummed proof after any attested field is changed', () => {
  const release = buildHarnessRelease({
    root,
    environment: 'staging',
    gitSha: 'd'.repeat(40),
    requireCleanWorktree: false,
  })
  const proof = buildEdgeSourceProof({ release, hosted: hostedCandidate(release), sourceRoot: root })
  assert.throws(
    () => sourceDeploymentAttestationInvocation({ ...proof, hostedBundleSha256: '8'.repeat(64) }),
    /checksum mismatch/u,
  )
})

function hostedCandidate(release) {
  return {
    environment: 'staging',
    projectRef,
    releaseId: release.releaseId,
    deploymentId: `${projectRef}_${functionId}_7`,
    managedEdgeFunctions: {
      'mobile-api': {
        id: functionId,
        status: 'ACTIVE',
        version: 7,
        ezbr_sha256: '7'.repeat(64),
        verify_jwt: false,
        import_map: true,
        entrypoint_path: 'index.ts',
        import_map_path: 'deno.json',
      },
    },
  }
}
