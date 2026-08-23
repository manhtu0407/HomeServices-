import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { collectHostedDeploymentState, compareDeploymentState } from './deployment-drift.mjs'

const providerReadiness = Object.freeze({
  anthropic: true,
  deepseek: false,
  durable_guards: true,
  global_ai_enabled: true,
  perplexity: true,
  vietmap: true,
})
const providerReadinessFingerprintSha256 = createHash('sha256')
  .update(JSON.stringify(providerReadiness))
  .digest('hex')
const release = {
  releaseId: 'harness-aaaaaaaaaaaa-bbbbbbbbbbbb',
  environment: 'staging',
  gitSha: 'c'.repeat(40),
  manifestSha256: 'a'.repeat(64),
  bundleSha256: 'b'.repeat(64),
  migrationInventorySha256: 'd'.repeat(64),
  sourceBundleSha256: '1'.repeat(64),
  mobileBuildFingerprintSha256: '2'.repeat(64),
  productionUiSourceSha256: '6'.repeat(64),
  edgeBundleSha256: '3'.repeat(64),
  serviceIntakePolicyBundleSha256: '4'.repeat(64),
  priceEvidenceBundleSha256: '5'.repeat(64),
  providerReadiness,
  providerReadinessFingerprintSha256,
  edgeFunctions: { 'kael-matching-maintainer': 'f'.repeat(64), 'mobile-api': 'e'.repeat(64) },
}
const inventory = {
  migrationEquivalences: { version: '1.0.0', groups: [] },
  entries: [{ version: '20260101000000' }, { version: '20260102000000' }],
}
const mobileFunctionId = '10000000-0000-4000-8000-000000000057'
const maintainerFunctionId = '10000000-0000-4000-8000-000000000058'
const stagingProjectRef = 'xyylanuyflrjzbjzhqfl'

test('accepts one exact release, migration, and function snapshot', () => {
  const report = compareDeploymentState({
    release,
    inventory,
    remote: {
      environment: 'staging',
      projectRef: stagingProjectRef,
      releaseId: release.releaseId,
      gitSha: release.gitSha,
      manifestSha256: release.manifestSha256,
      bundleSha256: release.bundleSha256,
      migrationInventorySha256: release.migrationInventorySha256,
      sourceBundleSha256: release.sourceBundleSha256,
      mobileBuildFingerprintSha256: release.mobileBuildFingerprintSha256,
      productionUiSourceSha256: release.productionUiSourceSha256,
      edgeBundleSha256: release.edgeBundleSha256,
      serviceIntakePolicyBundleSha256: release.serviceIntakePolicyBundleSha256,
      priceEvidenceBundleSha256: release.priceEvidenceBundleSha256,
      providerReadinessFingerprintSha256: release.providerReadinessFingerprintSha256,
      providerReadiness: release.providerReadiness,
      migrations: inventory.entries,
      edgeFunctions: release.edgeFunctions,
    },
  })
  assert.equal(report.ok, true)
})

test('blocks missing, unknown, modified, mixed, and out-of-order state', () => {
  const report = compareDeploymentState({
    release,
    inventory,
    remote: {
      environment: 'production',
      projectRef: 'iwevizmsedyqozxlawwl',
      releaseId: 'other',
      gitSha: '0'.repeat(40),
      migrations: [{ version: '20260102000000' }, { version: 'unknown' }],
      edgeFunctions: { 'mobile-api': '0'.repeat(64), extra: '1'.repeat(64) },
    },
  })
  assert.equal(report.ok, false)
  assert.ok(report.problems.some((problem) => problem.includes('environment mismatch')))
  assert.ok(report.problems.some((problem) => problem.includes('invalid version')))
  assert.ok(report.problems.some((problem) => problem.includes('digest mismatch')))
  assert.ok(report.problems.some((problem) => problem.includes('unknown Edge function')))
})

test('rejects incomplete and ambiguous remote identity evidence', () => {
  const report = compareDeploymentState({
    release,
    inventory,
    remote: {
      environment: release.environment,
      projectRef: stagingProjectRef,
      migrations: [
        { version: '20260101000000' },
        { version: '20260102000000' },
        { version: '20260102000000' },
        null,
      ],
      edgeFunctions: release.edgeFunctions,
    },
  })
  assert.equal(report.ok, false)
  assert.ok(report.problems.some((problem) => problem.includes('remote release ID is missing')))
  assert.ok(report.problems.some((problem) => problem.includes('remote Git SHA is missing')))
  assert.ok(report.problems.some((problem) => problem.includes('remote migration inventory digest is missing')))
  assert.ok(report.problems.some((problem) => problem.includes('remote source bundle digest is missing')))
  assert.ok(report.problems.some((problem) => problem.includes('invalid version')))
})

test('collects hosted health, migration, and deployed-function evidence from live APIs', async () => {
  const calls = []
  const hosted = await collectHostedDeploymentState({
    environment: 'staging',
    projectRef: 'xyylanuyflrjzbjzhqfl',
    accessToken: 'test-management-token',
    fetchImpl: async (url, init = {}) => {
      calls.push({ url: String(url), method: init.method ?? 'GET' })
      if (String(url).includes('/functions/v1/mobile-api/harness/health')) {
        return jsonResponse({
          environment: { name: 'staging', project_ref: 'xyylanuyflrjzbjzhqfl' },
          release: {
            release_id: release.releaseId,
            deployment_id: `${stagingProjectRef}_${mobileFunctionId}_7`,
            git_sha: release.gitSha,
            manifest_sha256: release.manifestSha256,
            bundle_sha256: release.bundleSha256,
            migration_inventory_sha256: release.migrationInventorySha256,
            source_bundle_sha256: release.sourceBundleSha256,
            mobile_build_fingerprint_sha256: release.mobileBuildFingerprintSha256,
            production_ui_source_sha256: release.productionUiSourceSha256,
            edge_bundle_sha256: release.edgeBundleSha256,
            service_intake_policy_bundle_sha256: release.serviceIntakePolicyBundleSha256,
            price_evidence_bundle_sha256: release.priceEvidenceBundleSha256,
            provider_readiness_fingerprint_sha256: release.providerReadinessFingerprintSha256,
            provider_readiness: release.providerReadiness,
          },
        })
      }
      if (String(url).endsWith('/functions')) {
        return jsonResponse([
          { id: mobileFunctionId, slug: 'mobile-api', status: 'ACTIVE', version: 7, ezbr_sha256: '7'.repeat(64) },
          { id: maintainerFunctionId, slug: 'kael-matching-maintainer', status: 'ACTIVE', version: 3, ezbr_sha256: '8'.repeat(64) },
        ])
      }
      if (String(url).endsWith('/functions/mobile-api')) {
        return jsonResponse({
          id: mobileFunctionId,
          slug: 'mobile-api',
          status: 'ACTIVE',
          version: 7,
          verify_jwt: false,
          import_map: true,
          entrypoint_path: 'index.ts',
          import_map_path: 'deno.json',
          ezbr_sha256: '7'.repeat(64),
        })
      }
      if (String(url).endsWith('/functions/kael-matching-maintainer')) {
        return jsonResponse({
          id: maintainerFunctionId,
          slug: 'kael-matching-maintainer',
          status: 'ACTIVE',
          version: 3,
          verify_jwt: false,
          import_map: true,
          entrypoint_path: 'index.ts',
          import_map_path: 'deno.json',
          ezbr_sha256: '8'.repeat(64),
        })
      }
      if (String(init.body ?? '').includes('pg_catalog.pg_trigger')) {
        return jsonResponse({ result: [{
          object_kind: 'trigger',
          schema_name: 'public',
          relation_name: 'jobs',
          object_name: 'jobs_project_official_match_operations',
          exists: false,
          definition: null,
        }] })
      }
      return jsonResponse({ result: inventory.entries })
    },
  })

  assert.equal(hosted.releaseId, release.releaseId)
  assert.equal(hosted.deploymentId, `${stagingProjectRef}_${mobileFunctionId}_7`)
  assert.equal(hosted.manifestSha256, release.manifestSha256)
  assert.equal(hosted.bundleSha256, release.bundleSha256)
  assert.deepEqual(hosted.providerReadiness, release.providerReadiness)
  assert.deepEqual(hosted.migrations, inventory.entries)
  assert.deepEqual(hosted.migrationObjectPreconditions, [{
    object_kind: 'trigger',
    schema_name: 'public',
    relation_name: 'jobs',
    object_name: 'jobs_project_official_match_operations',
    exists: false,
    definition: null,
  }])
  assert.equal(hosted.managedEdgeFunctions['mobile-api'].status, 'ACTIVE')
  assert.equal(hosted.managedEdgeFunctions['mobile-api'].id, mobileFunctionId)
  assert.equal(hosted.managedEdgeFunctions['mobile-api'].verify_jwt, false)
  assert.equal(hosted.managedEdgeFunctions['mobile-api'].entrypoint_path, 'index.ts')
  assert.deepEqual(calls.map((call) => call.method), ['GET', 'GET', 'GET', 'GET', 'POST', 'POST'])
  assert.ok(calls.every((call) => call.url.startsWith('https://')))
})

test('rejects mutable health identity when it is not the provider-managed mobile-api deployment', () => {
  const report = compareDeploymentState({
    release,
    inventory,
    remote: {
      environment: 'staging',
      projectRef: stagingProjectRef,
      releaseId: release.releaseId,
      deploymentId: `${stagingProjectRef}_${mobileFunctionId}_6`,
      gitSha: release.gitSha,
      manifestSha256: release.manifestSha256,
      bundleSha256: release.bundleSha256,
      migrationInventorySha256: release.migrationInventorySha256,
      sourceBundleSha256: release.sourceBundleSha256,
      mobileBuildFingerprintSha256: release.mobileBuildFingerprintSha256,
      productionUiSourceSha256: release.productionUiSourceSha256,
      edgeBundleSha256: release.edgeBundleSha256,
      serviceIntakePolicyBundleSha256: release.serviceIntakePolicyBundleSha256,
      priceEvidenceBundleSha256: release.priceEvidenceBundleSha256,
      providerReadinessFingerprintSha256: release.providerReadinessFingerprintSha256,
      providerReadiness: release.providerReadiness,
      migrations: inventory.entries,
      managedEdgeFunctions: {
        'mobile-api': {
          id: mobileFunctionId,
          status: 'ACTIVE',
          version: 7,
          ezbr_sha256: '7'.repeat(64),
        },
        'kael-matching-maintainer': {
          id: maintainerFunctionId,
          status: 'ACTIVE',
          version: 3,
          ezbr_sha256: '8'.repeat(64),
        },
      },
    },
  })
  assert.equal(report.ok, false)
  assert.ok(report.problems.includes(
    'provider deployment identity does not match the managed mobile-api deployment',
  ))
})

test('rejects hosted provider readiness drift even when a supplied fingerprint copies the manifest', () => {
  const report = compareDeploymentState({
    release,
    inventory,
    remote: {
      environment: 'staging',
      projectRef: stagingProjectRef,
      releaseId: release.releaseId,
      gitSha: release.gitSha,
      manifestSha256: release.manifestSha256,
      bundleSha256: release.bundleSha256,
      migrationInventorySha256: release.migrationInventorySha256,
      sourceBundleSha256: release.sourceBundleSha256,
      mobileBuildFingerprintSha256: release.mobileBuildFingerprintSha256,
      productionUiSourceSha256: release.productionUiSourceSha256,
      edgeBundleSha256: release.edgeBundleSha256,
      serviceIntakePolicyBundleSha256: release.serviceIntakePolicyBundleSha256,
      priceEvidenceBundleSha256: release.priceEvidenceBundleSha256,
      providerReadinessFingerprintSha256: release.providerReadinessFingerprintSha256,
      providerReadiness: { ...release.providerReadiness, vietmap: false },
      migrations: inventory.entries,
      edgeFunctions: release.edgeFunctions,
    },
  })
  assert.equal(report.ok, false)
  assert.ok(report.problems.includes(
    'remote provider readiness fingerprint does not bind hosted readiness evidence',
  ))
  assert.ok(report.problems.includes('provider readiness evidence mismatch'))
})

test('accepts exact Supabase provider source paths for managed Edge functions', () => {
  const report = compareDeploymentState({
    release: releaseWithRuntimeConfiguration(),
    inventory,
    remote: managedRemote({
      mobileEntrypoint: providerSourcePath('mobile-api', 'index.ts', mobileFunctionId, 7),
      mobileImportMap: providerSourcePath('mobile-api', 'deno.json', mobileFunctionId, 7),
      maintainerEntrypoint: providerSourcePath(
        'kael-matching-maintainer',
        'index.ts',
        maintainerFunctionId,
        3,
      ),
      maintainerImportMap: providerSourcePath(
        'kael-matching-maintainer',
        'deno.json',
        maintainerFunctionId,
        3,
      ),
    }),
  })

  assert.equal(report.ok, true)
})

test('accepts exact absolute file URLs emitted by local and CI Supabase deploys', () => {
  const report = compareDeploymentState({
    release: releaseWithRuntimeConfiguration(),
    inventory,
    remote: managedRemote({
      mobileEntrypoint: localDeployPath('C:/Users/Tu/My Project', 'mobile-api', 'index.ts'),
      mobileImportMap: localDeployPath('C:/Users/Tu/My Project', 'mobile-api', 'deno.json'),
      maintainerEntrypoint: localDeployPath('/home/runner/work/nestscout', 'kael-matching-maintainer', 'index.ts'),
      maintainerImportMap: localDeployPath('/home/runner/work/nestscout', 'kael-matching-maintainer', 'deno.json'),
    }),
  })

  assert.equal(report.ok, true)
})

test('rejects local file URLs with traversal, a remote host, or the wrong function', () => {
  const traversal = compareDeploymentState({
    release: releaseWithRuntimeConfiguration(),
    inventory,
    remote: managedRemote({
      mobileEntrypoint: 'file:///workspace/%2e%2e/supabase/functions/mobile-api/index.ts',
    }),
  })
  const remoteHost = compareDeploymentState({
    release: releaseWithRuntimeConfiguration(),
    inventory,
    remote: managedRemote({
      mobileEntrypoint: 'file://attacker.example/supabase/functions/mobile-api/index.ts',
    }),
  })
  const wrongFunction = compareDeploymentState({
    release: releaseWithRuntimeConfiguration(),
    inventory,
    remote: managedRemote({
      mobileEntrypoint: localDeployPath('/workspace', 'kael-matching-maintainer', 'index.ts'),
    }),
  })

  assert.equal(traversal.ok, false)
  assert.equal(remoteHost.ok, false)
  assert.equal(wrongFunction.ok, false)
})

test('rejects near-miss provider paths with the wrong source root or function', () => {
  const wrongSource = compareDeploymentState({
    release: releaseWithRuntimeConfiguration(),
    inventory,
    remote: managedRemote({
      mobileEntrypoint: providerSourcePath('mobile-api', 'index.ts', mobileFunctionId, 7)
        .replace('/source/', '/compiled/'),
    }),
  })
  const wrongFunction = compareDeploymentState({
    release: releaseWithRuntimeConfiguration(),
    inventory,
    remote: managedRemote({
      maintainerImportMap: providerSourcePath(
        'mobile-api',
        'deno.json',
        maintainerFunctionId,
        3,
      ),
    }),
  })

  assert.equal(wrongSource.ok, false)
  assert.ok(wrongSource.problems.includes('remote Edge entrypoint mismatch: mobile-api'))
  assert.equal(wrongFunction.ok, false)
  assert.ok(wrongFunction.problems.includes(
    'remote Edge import map path mismatch: kael-matching-maintainer',
  ))
})

function releaseWithRuntimeConfiguration() {
  return {
    ...release,
    edgeRuntimeConfigurations: {
      'kael-matching-maintainer': {
        verifyJwt: false,
        importMap: true,
        entrypointPath: 'supabase/functions/kael-matching-maintainer/index.ts',
        importMapPath: 'supabase/functions/kael-matching-maintainer/deno.json',
      },
      'mobile-api': {
        verifyJwt: false,
        importMap: true,
        entrypointPath: 'supabase/functions/mobile-api/index.ts',
        importMapPath: 'supabase/functions/mobile-api/deno.json',
      },
    },
  }
}

function managedRemote(overrides = {}) {
  return {
    environment: 'staging',
    projectRef: stagingProjectRef,
    releaseId: release.releaseId,
    deploymentId: `${stagingProjectRef}_${mobileFunctionId}_7`,
    gitSha: release.gitSha,
    manifestSha256: release.manifestSha256,
    bundleSha256: release.bundleSha256,
    migrationInventorySha256: release.migrationInventorySha256,
    sourceBundleSha256: release.sourceBundleSha256,
    mobileBuildFingerprintSha256: release.mobileBuildFingerprintSha256,
    productionUiSourceSha256: release.productionUiSourceSha256,
    edgeBundleSha256: release.edgeBundleSha256,
    serviceIntakePolicyBundleSha256: release.serviceIntakePolicyBundleSha256,
    priceEvidenceBundleSha256: release.priceEvidenceBundleSha256,
    providerReadinessFingerprintSha256: release.providerReadinessFingerprintSha256,
    providerReadiness: release.providerReadiness,
    migrations: inventory.entries,
    managedEdgeFunctions: {
      'mobile-api': {
        id: mobileFunctionId,
        status: 'ACTIVE',
        version: 7,
        ezbr_sha256: '7'.repeat(64),
        verify_jwt: false,
        import_map: true,
        entrypoint_path: overrides.mobileEntrypoint ?? 'index.ts',
        import_map_path: overrides.mobileImportMap ?? 'deno.json',
      },
      'kael-matching-maintainer': {
        id: maintainerFunctionId,
        status: 'ACTIVE',
        version: 3,
        ezbr_sha256: '8'.repeat(64),
        verify_jwt: false,
        import_map: true,
        entrypoint_path: overrides.maintainerEntrypoint ?? 'index.ts',
        import_map_path: overrides.maintainerImportMap ?? 'deno.json',
      },
    },
  }
}

function providerSourcePath(functionName, fileName, functionId, version) {
  return `file:///tmp/user_fn_${stagingProjectRef}_${functionId}_${version}` +
    `/source/supabase/functions/${functionName}/${fileName}`
}

function localDeployPath(root, functionName, fileName) {
  const normalizedRoot = root.startsWith('/') ? root : `/${root}`
  return `file://${encodeURI(normalizedRoot)}/supabase/functions/${functionName}/${fileName}`
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
