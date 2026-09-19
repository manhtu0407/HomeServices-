import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import { RELEASE_EDGE_FUNCTIONS } from './release-bundle.mjs'
import {
  canonicalMigrationEntries,
  resolveHostedMigrationState,
} from './migration-history.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const PROJECT_REFS = Object.freeze({
  staging: 'xyylanuyflrjzbjzhqfl',
  production: 'iwevizmsedyqozxlawwl',
})
const RELEASE_ID = /^harness-[0-9a-f]{12}-[0-9a-f]{12}$/u
const GIT_SHA = /^[0-9a-f]{40}$/u
const DEPLOYMENT_ID = new RegExp(
  `^${PROJECT_REFS.production}_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_[1-9][0-9]*$`,
  'u',
)

export async function collectHostedDeploymentState(input) {
  if (input?.environment !== 'production' || input.projectRef !== PROJECT_REFS.production) {
    throw new Error('Hosted deployment evidence is Production-only; Staging and Preview targets are locked')
  }
  const expectedRef = PROJECT_REFS[input.environment]
  if (!expectedRef || input.projectRef !== expectedRef) {
    throw new Error('hosted deployment environment and project ref do not match the registered target')
  }
  if (!input.accessToken?.trim()) throw new Error('SUPABASE_ACCESS_TOKEN is required for hosted drift evidence')
  const fetchImpl = input.fetchImpl ?? fetch
  const projectOrigin = `https://${input.projectRef}.supabase.co`
  const managementOrigin = `https://api.supabase.com/v1/projects/${input.projectRef}`
  const managementHeaders = {
    authorization: `Bearer ${input.accessToken.trim()}`,
    'content-type': 'application/json',
  }

  const healthResponse = await fetchImpl(`${projectOrigin}/functions/v1/mobile-api/harness/health`)
  let health = null
  let runtimeHealth
  if (healthResponse?.ok) {
    health = await healthResponse.json()
    if (!isRegisteredProductionHealth(health, input.projectRef)) {
      throw new Error('hosted runtime health payload is not release-ready')
    }
    runtimeHealth = { status: 'healthy', httpStatus: healthResponse.status ?? 200 }
  } else if (
    input.allowUnhealthyRuntimeBaseline === true &&
    Number.isInteger(healthResponse?.status) &&
    healthResponse.status >= 500 && healthResponse.status <= 599
  ) {
    runtimeHealth = { status: 'unhealthy', httpStatus: healthResponse.status }
  } else {
    throw new Error(`hosted runtime health request failed with HTTP ${healthResponse?.status ?? 'unknown'}`)
  }
  const functions = await fetchJson(fetchImpl, `${managementOrigin}/functions`, {
    headers: managementHeaders,
  })
  const functionDetails = new Map(await Promise.all(RELEASE_EDGE_FUNCTIONS.map(async (functionName) => [
    functionName,
    await fetchJson(fetchImpl, `${managementOrigin}/functions/${functionName}`, {
      headers: managementHeaders,
    }),
  ])))
  const migrationResult = await fetchJson(fetchImpl, `${managementOrigin}/database/query/read-only`, {
    method: 'POST',
    headers: managementHeaders,
    body: JSON.stringify({
      query: 'select version, name from supabase_migrations.schema_migrations order by version',
      parameters: [],
    }),
  })
  const releaseControlSchemaResult = await fetchJson(fetchImpl, `${managementOrigin}/database/query/read-only`, {
    method: 'POST',
    headers: managementHeaders,
    body: JSON.stringify({
      query: `
select
  to_regclass('public.harness_releases') is not null as harness_release_ledger_table,
  to_regclass('public.stage1_release_controls') is not null as stage1_release_controls_table,
  to_regclass('public.stage1_synthetic_smoke_receipts') is not null as stage1_synthetic_smoke_receipts_table,
  to_regclass('public.stage1_release_control_events') is not null as stage1_release_control_events_table,
  to_regclass('public.stage1_release_control_events_id_seq') is not null as stage1_release_control_events_sequence,
  to_regclass('public.stage1_source_deployment_attestations') is not null as stage1_source_deployment_attestations_table,
  to_regclass('public.stage1_smoke_deployment_attestations') is not null as stage1_smoke_deployment_attestations_table,
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'reject_stage1_release_evidence_mutation')
    as reject_stage1_release_evidence_mutation_function,
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'configure_stage1_release_canary')
    as configure_stage1_release_canary_function,
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'resolve_stage1_release_lane')
    as resolve_stage1_release_lane_function,
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'record_stage1_synthetic_smoke')
    as record_stage1_synthetic_smoke_function,
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'promote_stage1_release_atomic')
    as promote_stage1_release_atomic_function,
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'abort_stage1_release_canary')
    as abort_stage1_release_canary_function,
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'reconcile_stale_stage1_release_canary')
    as reconcile_stale_stage1_release_canary_function,
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'rollback_stage1_active_release_atomic')
    as rollback_stage1_active_release_atomic_function,
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'attest_stage1_source_deployment')
    as attest_stage1_source_deployment_function,
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'record_stage1_attested_synthetic_smoke')
    as record_stage1_attested_synthetic_smoke_function,
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'resolve_stage1_release_lane_attested')
    as resolve_stage1_release_lane_attested_function,
  exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'promote_stage1_release_attested_atomic')
    as promote_stage1_release_attested_atomic_function,
  exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal and t.tgname = 'stage1_synthetic_smoke_receipts_append_only')
    as stage1_synthetic_smoke_receipts_trigger,
  exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal and t.tgname = 'stage1_release_control_events_append_only')
    as stage1_release_control_events_trigger,
  exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal and t.tgname = 'stage1_source_deployment_attestations_append_only')
    as stage1_source_deployment_attestations_trigger,
  exists (select 1 from pg_trigger t join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not t.tgisinternal and t.tgname = 'stage1_smoke_deployment_attestations_append_only')
    as stage1_smoke_deployment_attestations_trigger`,
      parameters: [],
    }),
  })
  const migrationObjectPreconditionResult = await fetchJson(fetchImpl, `${managementOrigin}/database/query/read-only`, {
    method: 'POST',
    headers: managementHeaders,
    body: JSON.stringify({
      query: `
with requested_triggers(object_kind, schema_name, relation_name, object_name) as (
  values
    ('trigger', 'public', 'job_payment_orders', 'job_payment_order_sync_worker_settlement'),
    ('trigger', 'public', 'jobs', 'jobs_project_official_match_operations'),
    ('trigger', 'public', 'profiles', 'profiles_customer_profile_invariant'),
    ('trigger', 'public', 'worker_withdrawal_requests', 'worker_withdrawal_requests_eligibility_at_insert'),
    ('trigger', 'public', 'worker_withdrawal_requests', 'worker_withdrawal_requests_eligibility_guard')
), requested_constraints(object_kind, schema_name, relation_name, object_name) as (
  values
    ('constraint', 'public', 'job_payment_orders', 'job_payment_orders_status_check'),
    ('constraint', 'public', 'job_payment_reconciliation_events', 'job_payment_reconciliation_events_event_type_check'),
    ('constraint', 'public', 'jobs', 'jobs_payment_status_check'),
    ('constraint', 'public', 'worker_payment_ledger', 'worker_payment_ledger_payment_provider_check')
), object_state as (
select requested.object_kind,
  requested.schema_name,
  requested.relation_name,
  requested.object_name,
  exists (
    select 1
    from pg_catalog.pg_trigger as trigger
    join pg_catalog.pg_class as relation on relation.oid = trigger.tgrelid
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where not trigger.tgisinternal
      and namespace.nspname = requested.schema_name
      and relation.relname = requested.relation_name
      and trigger.tgname = requested.object_name
  ) as exists
  , null::text as definition
from requested_triggers as requested
union all
select requested.object_kind,
  requested.schema_name,
  requested.relation_name,
  requested.object_name,
  exists (
    select 1
    from pg_catalog.pg_constraint as constraint_row
    join pg_catalog.pg_class as relation on relation.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = requested.schema_name
      and relation.relname = requested.relation_name
      and constraint_row.conname = requested.object_name
      and constraint_row.contype = 'c'
  ) as exists,
  (
    select pg_catalog.pg_get_constraintdef(constraint_row.oid, true)
    from pg_catalog.pg_constraint as constraint_row
    join pg_catalog.pg_class as relation on relation.oid = constraint_row.conrelid
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = requested.schema_name
      and relation.relname = requested.relation_name
      and constraint_row.conname = requested.object_name
      and constraint_row.contype = 'c'
    limit 1
  ) as definition
from requested_constraints as requested
)
select * from object_state
order by object_kind, schema_name, relation_name, object_name`,
      parameters: [],
    }),
  })

  const release = health?.release ?? {}
  return {
    runtimeHealth,
    environment: health?.environment?.name ?? input.environment,
    projectRef: health?.environment?.project_ref ?? input.projectRef,
    releaseId: release.release_id ?? null,
    deploymentId: release.deployment_id ?? null,
    gitSha: release.git_sha ?? null,
    manifestSha256: release.manifest_sha256 ?? null,
    bundleSha256: release.bundle_sha256 ?? null,
    migrationInventorySha256: release.migration_inventory_sha256 ?? null,
    sourceBundleSha256: release.source_bundle_sha256 ?? null,
    mobileBuildFingerprintSha256: release.mobile_build_fingerprint_sha256 ?? null,
    productionUiSourceSha256: release.production_ui_source_sha256 ?? null,
    edgeBundleSha256: release.edge_bundle_sha256 ?? null,
    serviceIntakePolicyBundleSha256: release.service_intake_policy_bundle_sha256 ?? null,
    priceEvidenceBundleSha256: release.price_evidence_bundle_sha256 ?? null,
    providerReadinessFingerprintSha256: release.provider_readiness_fingerprint_sha256 ?? null,
    providerReadiness: release.provider_readiness ?? null,
    clientCompatibility: release.client_compatibility ?? null,
    migrations: normalizeRows(migrationResult),
    releaseControlSchema: normalizeRows(releaseControlSchemaResult)[0] ?? null,
    migrationObjectPreconditions: normalizeRows(migrationObjectPreconditionResult),
    managedEdgeFunctions: Object.fromEntries(normalizeRows(functions).map((item) => {
      const detail = functionDetails.get(item.slug) ?? item
      return [String(item.slug ?? ''), {
      id: item.id ?? null,
      status: item.status ?? null,
      version: item.version ?? null,
      ezbr_sha256: item.ezbr_sha256 ?? null,
      verify_jwt: detail.verify_jwt ?? null,
      import_map: detail.import_map ?? null,
      entrypoint_path: detail.entrypoint_path ?? null,
      import_map_path: detail.import_map_path ?? null,
    }]
    }).filter(([slug]) => slug)),
    evidenceSource: 'hosted-api-and-readonly-sql',
  }
}

function isRegisteredProductionHealth(value, projectRef) {
  const release = value?.release
  return value?.status === 'ok' &&
    value?.environment?.name === 'production' &&
    value?.environment?.project_ref === projectRef &&
    release?.registered === true &&
    RELEASE_ID.test(release?.release_id ?? '') &&
    GIT_SHA.test(release?.git_sha ?? '') &&
    DEPLOYMENT_ID.test(release?.deployment_id ?? '')
}

export function compareDeploymentState(input) {
  const problems = []
  const release = input.release
  const inventory = input.inventory
  const remote = input.remote
  if (!release || typeof release !== 'object') return { ok: false, problems: ['release artifact is missing'] }
  if (!inventory || !Array.isArray(inventory.entries)) return { ok: false, problems: ['migration inventory is missing'] }
  if (!remote || typeof remote !== 'object') return { ok: false, problems: ['remote deployment snapshot is missing'] }
  const legacyParitySnapshot = isLegacyParitySnapshot(release, remote)
  if (remote.environment !== release.environment) problems.push(`environment mismatch: release ${release.environment}, remote ${remote.environment}`)
  const expectedProjectRef = PROJECT_REFS[release.environment]
  if (!legacyParitySnapshot && (!expectedProjectRef || remote.projectRef !== expectedProjectRef)) {
    problems.push('remote project ref does not match the registered release target')
  }
  if (!remote.releaseId) problems.push('remote release ID is missing')
  else if (remote.releaseId !== release.releaseId) problems.push(`release ID mismatch: expected ${release.releaseId}, remote ${remote.releaseId}`)
  if (!remote.gitSha) problems.push('remote Git SHA is missing')
  else if (remote.gitSha !== release.gitSha) problems.push(`Git SHA mismatch: expected ${release.gitSha}, remote ${remote.gitSha}`)
  if (!legacyParitySnapshot) {
    compareDigest(problems, release, remote, 'manifestSha256', 'manifest')
    compareDigest(problems, release, remote, 'bundleSha256', 'release bundle')
  }
  if (!remote.migrationInventorySha256) problems.push('remote migration inventory digest is missing')
  else if (remote.migrationInventorySha256 !== release.migrationInventorySha256) problems.push('migration inventory digest mismatch')
  if (!legacyParitySnapshot) {
    compareDigest(problems, release, remote, 'sourceBundleSha256', 'source bundle')
    compareDigest(problems, release, remote, 'mobileBuildFingerprintSha256', 'mobile build fingerprint')
    compareDigest(problems, release, remote, 'productionUiSourceSha256', 'Production UI source')
    compareDigest(problems, release, remote, 'edgeBundleSha256', 'Edge bundle')
    compareDigest(problems, release, remote, 'serviceIntakePolicyBundleSha256', 'service intake policy bundle')
    compareDigest(problems, release, remote, 'priceEvidenceBundleSha256', 'price evidence bundle')
    compareDigest(problems, release, remote, 'providerReadinessFingerprintSha256', 'provider readiness fingerprint')
    compareProviderReadiness(problems, release, remote)
  }
  const remoteMigrations = remote.migrations ?? []
  if (!Array.isArray(remoteMigrations)) problems.push('remote migrations snapshot is not an array')
  else if (legacyParitySnapshot) compareLegacyMigrations(problems, inventory.entries, remoteMigrations)
  else {
    try {
      const migrationState = resolveHostedMigrationState(inventory, remoteMigrations)
      const missing = canonicalMigrationEntries(inventory)
        .map((entry) => entry.version)
        .filter((version) => !migrationState.appliedCanonicalVersions.has(version))
      if (missing.length) problems.push(`remote is missing migrations: ${missing.join(', ')}`)
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error))
    }
  }
  const expectedFunctions = release.edgeFunctions ?? {}
  const actualFunctions = remote.edgeFunctions
  const managedFunctions = remote.managedEdgeFunctions
  if (!legacyParitySnapshot && actualFunctions && typeof actualFunctions === 'object') {
    for (const [name, digest] of Object.entries(expectedFunctions)) {
      if (!actualFunctions[name]) problems.push(`remote Edge function is missing: ${name}`)
      else if (actualFunctions[name] !== digest) problems.push(`remote Edge function digest mismatch: ${name}`)
    }
    for (const name of Object.keys(actualFunctions)) {
      if (!(name in expectedFunctions)) problems.push(`remote has unknown Edge function: ${name}`)
    }
  } else if (!legacyParitySnapshot && managedFunctions && typeof managedFunctions === 'object') {
    for (const name of Object.keys(expectedFunctions)) {
      const deployed = managedFunctions[name]
      if (!deployed) problems.push(`remote Edge function is missing: ${name}`)
      else {
        if (deployed.status !== 'ACTIVE') problems.push(`remote Edge function is not active: ${name}`)
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(deployed.id ?? '')) problems.push(`remote Edge function ID is invalid: ${name}`)
        if (!Number.isInteger(deployed.version) || deployed.version < 1) problems.push(`remote Edge function version is invalid: ${name}`)
        if (!/^[0-9a-f]{64}$/u.test(deployed.ezbr_sha256 ?? '')) problems.push(`remote Edge function hosted digest is invalid: ${name}`)
        const expectedRuntime = release.edgeRuntimeConfigurations?.[name]
        if (expectedRuntime) {
          if (deployed.verify_jwt !== expectedRuntime.verifyJwt) problems.push(`remote Edge verify_jwt mismatch: ${name}`)
          if (deployed.import_map !== expectedRuntime.importMap) problems.push(`remote Edge import_map mismatch: ${name}`)
          if (!managedPathMatches(
            deployed.entrypoint_path,
            expectedRuntime.entrypointPath,
            name,
            expectedProjectRef,
          )) {
            problems.push(`remote Edge entrypoint mismatch: ${name}`)
          }
          if (expectedRuntime.importMap
            ? !managedPathMatches(
                deployed.import_map_path,
                expectedRuntime.importMapPath,
                name,
                expectedProjectRef,
              )
            : deployed.import_map_path !== null) {
            problems.push(`remote Edge import map path mismatch: ${name}`)
          }
        }
      }
    }
    const mobileApi = managedFunctions['mobile-api']
    const expectedDeploymentId = mobileApi && expectedProjectRef &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(mobileApi.id ?? '') &&
        Number.isInteger(mobileApi.version) && mobileApi.version > 0
      ? `${expectedProjectRef}_${mobileApi.id}_${mobileApi.version}`
      : null
    if (!expectedDeploymentId || remote.deploymentId !== expectedDeploymentId) {
      problems.push('provider deployment identity does not match the managed mobile-api deployment')
    }
  } else if (!legacyParitySnapshot) {
    problems.push('remote Edge function deployment evidence is missing')
  }
  return {
    ok: problems.length === 0,
    problems,
    expectedReleaseId: release.releaseId,
    remoteReleaseId: remote.releaseId ?? null,
  }
}

function parseArgs(values) {
  const options = {}
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === '--release') options.release = values[++index]
    else if (values[index] === '--inventory') options.inventory = values[++index]
    else if (values[index] === '--remote') options.remote = values[++index]
    else if (values[index] === '--hosted') options.hosted = true
    else if (values[index] === '--project-ref') options.projectRef = values[++index]
    else if (values[index] === '--environment') options.environment = values[++index]
    else throw new Error(`unknown argument: ${values[index]}`)
  }
  return options
}

function managedPathMatches(actual, expected, functionName, projectRef) {
  if (
    typeof actual !== 'string' ||
    typeof expected !== 'string' ||
    typeof projectRef !== 'string'
  ) return false
  const normalized = actual.replaceAll('\\', '/').replace(/^\.\//u, '')
  const normalizedExpected = expected.replaceAll('\\', '/').replace(/^\.\//u, '')
  const fileName = normalizedExpected.split('/').at(-1)
  const repositoryPaths = new Set([
    fileName,
    `functions/${functionName}/${fileName}`,
    `supabase/functions/${functionName}/${fileName}`,
  ])
  if (repositoryPaths.has(normalized)) return true

  const providerPrefix = new RegExp(
    `^file:///tmp/user_fn_${escapeRegExp(projectRef)}_` +
      '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}_' +
      '[1-9][0-9]*/source/$',
    'iu',
  )
  const expectedProviderPath = normalizedExpected.startsWith('supabase/functions/')
    ? normalizedExpected
    : `supabase/functions/${functionName}/${fileName}`
  const localFilePath = managedLocalFilePath(actual, projectRef)
  if (localFilePath?.endsWith(`/${expectedProviderPath}`)) return true
  const providerSourcePrefix = normalized.slice(0, normalized.length - expectedProviderPath.length)
  return normalized.endsWith(expectedProviderPath) && providerPrefix.test(providerSourcePrefix)
}

function managedLocalFilePath(value, projectRef) {
  try {
    const decodedValue = decodeURIComponent(value).replaceAll('\\', '/')
    if (decodedValue.split('/').includes('..')) return null
    const parsed = new URL(value)
    if (parsed.protocol !== 'file:' || parsed.host || parsed.search || parsed.hash) return null
    const pathname = decodeURIComponent(parsed.pathname).replaceAll('\\', '/')
    if (pathname.startsWith(`/tmp/user_fn_${projectRef}_`)) return null
    return pathname
  } catch {
    return null
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function compareDigest(problems, release, remote, field, label) {
  if (!remote[field]) problems.push(`remote ${label} digest is missing`)
  else if (remote[field] !== release[field]) problems.push(`${label} digest mismatch`)
}

function isLegacyParitySnapshot(release, remote) {
  const releaseFields = ['environment', 'gitSha', 'migrationInventorySha256', 'releaseId']
  const remoteFields = new Set([
    'environment', 'gitSha', 'manifestSha256', 'migrationInventorySha256', 'migrations',
    'projectRef', 'registered', 'releaseId',
  ])
  return Object.keys(release).sort().join('\n') === releaseFields.sort().join('\n') &&
    Object.keys(remote).every((field) => remoteFields.has(field)) &&
    typeof remote.registered === 'boolean'
}

function compareLegacyMigrations(problems, inventoryEntries, remoteMigrations) {
  const expected = inventoryEntries.map((entry) => String(entry?.version ?? '')).filter(Boolean)
  const observed = remoteMigrations.map((entry) => String(entry?.version ?? '')).filter(Boolean)
  if (observed.length !== remoteMigrations.length || observed.some((version) => !/^\d{14}$/u.test(version)) ||
      new Set(observed).size !== observed.length) {
    problems.push('remote migration history contains an invalid version')
    return
  }
  const observedVersions = new Set(observed)
  const missing = expected.filter((version) => !observedVersions.has(version))
  if (missing.length) problems.push(`remote is missing migrations: ${missing.join(', ')}`)
}

function compareProviderReadiness(problems, release, remote) {
  const expectedKeys = [
    'android_fcm_v1', 'anthropic', 'deepseek', 'durable_guards', 'global_ai_enabled',
    'ios_apns', 'perplexity', 'push_receipt_reconciler', 'vietmap',
  ]
  const expected = release.providerReadiness
  const actual = remote.providerReadiness
  if (!isExactBooleanMap(expected, expectedKeys)) {
    problems.push('release provider readiness evidence is invalid')
    return
  }
  if (!isExactBooleanMap(actual, expectedKeys)) {
    problems.push('remote provider readiness evidence is missing or invalid')
    return
  }
  const expectedFingerprint = sha256(canonicalJson(expected))
  const actualFingerprint = sha256(canonicalJson(actual))
  if (release.providerReadinessFingerprintSha256 !== expectedFingerprint) {
    problems.push('release provider readiness fingerprint does not bind readiness evidence')
  }
  if (remote.providerReadinessFingerprintSha256 !== actualFingerprint) {
    problems.push('remote provider readiness fingerprint does not bind hosted readiness evidence')
  }
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    problems.push('provider readiness evidence mismatch')
  }
}

function isExactBooleanMap(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()) &&
    keys.every((key) => typeof value[key] === 'boolean')
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

async function fetchJson(fetchImpl, url, init) {
  const response = await fetchImpl(url, init)
  if (!response?.ok) throw new Error(`hosted deployment evidence request failed: ${response?.status ?? 'unknown'} ${url}`)
  return response.json()
}

function normalizeRows(value) {
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.result)) return value.result
  if (Array.isArray(value?.data)) return value.data
  throw new Error('hosted deployment evidence response is not a row array')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2))
    if (!options.release || (!options.remote && !options.hosted)) throw new Error('--release and either --remote or --hosted are required')
    if (options.remote && options.hosted) throw new Error('--remote and --hosted are mutually exclusive')
    const release = JSON.parse(readFileSync(resolve(ROOT, options.release), 'utf8'))
    if (release.environment === 'production' && !options.hosted) {
      throw new Error('production drift verification requires hosted API and read-only SQL evidence')
    }
    const remote = options.hosted
      ? await collectHostedDeploymentState({
        environment: options.environment ?? release.environment,
        projectRef: options.projectRef,
        accessToken: process.env.SUPABASE_ACCESS_TOKEN,
      })
      : JSON.parse(readFileSync(resolve(ROOT, options.remote), 'utf8'))
    const report = compareDeploymentState({
      release,
      inventory: JSON.parse(readFileSync(resolve(ROOT, options.inventory ?? 'config/harness/migration-inventory.json'), 'utf8')),
      remote,
    })
    if (!report.ok) {
      for (const problem of report.problems) console.error(`  - ${problem}`)
      process.exitCode = 1
    } else console.log(`deployment state matches ${report.expectedReleaseId}`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
