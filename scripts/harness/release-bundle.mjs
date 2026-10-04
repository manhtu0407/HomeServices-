import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, extname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { auditProductionUiCopy } from '../check-production-ui-copy.mjs'
import { buildPlan55AppliedMigrationInventory } from './plan55-applied-migration-inventory.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const requireFromMobile = createRequire(resolve(ROOT, 'apps/mobile/package.json'))
let typescriptModule = null

// Loaded on first use, not at import: release-control imports this module, and its hourly reconcile
// action runs in a job with no workspace install, where a module-level require fails before any
// action can run.
function typescriptApi() {
  typescriptModule ??= requireFromMobile('typescript')
  return typescriptModule
}
const OUTPUT = 'artifacts/harness/release-manifest.json'
const PLAN55_POLICY_PATH = 'config/harness/plan55-production-only-policy.json'
const ENVIRONMENTS = new Set(['local', 'preview', 'staging', 'production'])
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.json']
const FUNCTION_CONFIG_NAMES = ['deno.json', 'deno.jsonc', 'deno.lock', 'import_map.json', 'import-map.json']
const GLOBAL_RUNTIME_CONFIGS = ['supabase/config.toml']
export const RELEASE_EDGE_FUNCTIONS = Object.freeze(['kael-matching-maintainer', 'mobile-api'])
export const PROVIDER_READINESS_KEYS = Object.freeze([
  'android_fcm_v1', 'anthropic', 'deepseek', 'durable_guards', 'global_ai_enabled',
  'ios_apns', 'perplexity', 'push_receipt_reconciler', 'vietmap',
])
// The hosted runtime counts a release as registered on these five alone; the three push flags are
// release evidence only. A verification release may record them as false, and nothing else.
const VERIFICATION_REQUIRED_PROVIDERS = Object.freeze([
  'anthropic', 'durable_guards', 'global_ai_enabled', 'perplexity', 'vietmap',
])
export const PRODUCTION_REQUIRED_PROVIDERS = Object.freeze([
  'android_fcm_v1', 'anthropic', 'durable_guards', 'global_ai_enabled',
  'ios_apns', 'perplexity', 'push_receipt_reconciler', 'vietmap',
])
export const RELEASE_LANES = Object.freeze(['verification', 'plan55-production-only'])
const STANDARD_VERIFICATION_REQUIREMENTS = Object.freeze([
  'repository-controls',
  'empty-database-reset',
  'sql-verification',
  'generated-types-match',
  'staging-migration-match',
  'edge-digest-match',
  'live-provider-evaluation-if-affected',
  'readonly-production-drift',
  'production-ui-normality',
  'compatible-rollback-target',
])
const PLAN55_PRODUCTION_ONLY_REQUIREMENTS = Object.freeze([
  'repository-controls',
  'sql-verification',
  'generated-types-match',
  'edge-digest-match',
  'live-provider-evaluation-if-affected',
  'readonly-production-drift',
  'production-ui-normality',
  'compatible-rollback-target',
  'plan55-production-target-attestation',
  'plan55-actor-scoped-guard-tests',
  'plan55-canary-runner-tests',
  'plan55-source-lock',
  'plan55-independent-holdout-freeze',
  'plan55-rollback-preflight',
])
function verificationRequirementsForLane(lane, releaseAuthorityRequirement) {
  const requirements = lane === 'plan55-production-only'
    ? PLAN55_PRODUCTION_ONLY_REQUIREMENTS
    : STANDARD_VERIFICATION_REQUIREMENTS
  const authorityRequirements = lane === 'plan55-production-only'
    ? ['plan55-production-source-merge', 'plan55-exact-production-base-ancestry']
    : [releaseAuthorityRequirement]
  return [...requirements, ...authorityRequirements]
}
const repoPath = (value) => value.split(sep).join('/')

export function buildHarnessRelease(options = {}) {
  const root = resolve(options.root ?? ROOT)
  const environment = options.environment ?? 'preview'
  if (!ENVIRONMENTS.has(environment)) throw new Error(`invalid release environment: ${environment}`)
  const lane = options.lane
  if (lane !== undefined && !RELEASE_LANES.includes(lane)) throw new Error(`invalid release lane: ${lane}`)
  if (lane !== undefined && environment !== 'production') throw new Error('a production-only release lane exists only for production')
  if (environment === 'production' && options.requireCleanWorktree !== false) {
    assertCleanReleaseWorktree(root)
  }
  const gitSha = options.gitSha ?? git(root, ['rev-parse', 'HEAD'])
  if (!/^[0-9a-f]{40}$/u.test(gitSha)) throw new Error('release git SHA is invalid')

  const manifest = readFileSync(resolve(root, 'config/harness/manifest.json'))
  const plan55PolicyBytes = lane === 'plan55-production-only'
    ? readFileSync(resolve(root, PLAN55_POLICY_PATH))
    : null
  const plan55Policy = plan55PolicyBytes ? JSON.parse(plan55PolicyBytes.toString('utf8')) : null
  const hostedBeforeBytes = lane === 'plan55-production-only' ? options.hostedBeforeBytes : undefined
  let hostedState
  if (lane === 'plan55-production-only') {
    if (!Buffer.isBuffer(hostedBeforeBytes) || hostedBeforeBytes.length === 0) {
      throw new Error('Plan 55 production release requires a hosted-before snapshot')
    }
    try {
      hostedState = JSON.parse(hostedBeforeBytes.toString('utf8'))
    } catch {
      throw new Error('Plan 55 hosted-before snapshot is invalid')
    }
    if (hostedState.environment !== 'production' ||
        hostedState.projectRef !== plan55Policy.projectRef ||
        hostedState.releaseId !== plan55Policy.productionSourceBase?.releaseId ||
        hostedState.gitSha !== plan55Policy.productionSourceBase?.sha) {
      throw new Error('Plan 55 hosted-before does not match the pinned Production source')
    }
  }
  if (options.activeClientCompatibility !== undefined) {
    throw new Error('Plan 55 active client identity is derived from hosted-before')
  }
  const activeClientCompatibility = lane === 'plan55-production-only'
    ? validatePlan55ActiveClientCompatibility(hostedState.clientCompatibility, plan55Policy)
    : null
  const sourceMigrationInventoryBytes = readFileSync(resolve(root, 'config/harness/migration-inventory.json'))
  const sourceMigrationInventory = JSON.parse(sourceMigrationInventoryBytes.toString('utf8'))
  let migrationInventoryBytes = sourceMigrationInventoryBytes
  let migrationInventory = sourceMigrationInventory
  let plan55AppliedMigrationSnapshot
  if (lane === 'plan55-production-only') {
    migrationInventory = buildPlan55AppliedMigrationInventory({
      root,
      sourceInventory: sourceMigrationInventory,
      hostedState,
      expectedProjectRef: plan55Policy.projectRef,
      expectedProductionBase: plan55Policy.productionSourceBase,
    })
    migrationInventoryBytes = Buffer.from(`${JSON.stringify(migrationInventory, null, 2)}\n`)
    plan55AppliedMigrationSnapshot = {
      schema: 'plan55-applied-migration-snapshot/v1',
      environment: hostedState.environment,
      projectRef: hostedState.projectRef,
      sourceReleaseId: hostedState.releaseId,
      sourceGitSha: hostedState.gitSha,
      sourceMigrationInventorySha256: sha256(sourceMigrationInventoryBytes),
      hostedStateSha256: sha256(hostedBeforeBytes),
      appliedMigrationCount: migrationInventory.migrationCount,
      appliedMigrationInventorySha256: sha256(migrationInventoryBytes),
    }
  } else if (options.hostedBeforeBytes !== undefined) {
    throw new Error('hosted-before snapshots are reserved for the Plan 55 Production lane')
  }
  const evaluationSuiteBytes = readFileSync(resolve(root, 'config/harness/evaluation.json'))
  const evaluationSuite = JSON.parse(evaluationSuiteBytes.toString('utf8'))
  const capabilityRegistryBytes = readFileSync(resolve(root, 'config/harness/capabilities.json'))
  const accessMatrixBytes = readFileSync(resolve(root, 'config/harness/access-matrix.json'))
  const reliabilityPolicyBytes = readFileSync(resolve(root, 'config/harness/reliability.json'))
  const promotionPolicyBytes = readFileSync(resolve(root, 'config/harness/promotion.json'))
  const edge = edgeFunctionBundles(root, RELEASE_EDGE_FUNCTIONS)
  const environmentBinding = environmentBindingFor(environment)
  const releaseSourcePaths = releaseSourceFilePaths(root)
  const productionUiAudit = auditProductionUiCopy(root)
  if (productionUiAudit.unsafe.length > 0 || productionUiAudit.languageLeakage.length > 0) {
    throw new Error('production release contains unsafe or cross-language visible UI copy')
  }
  const providerReadiness = options.providerReadiness ?? providerReadinessFromEnvironment(process.env)
  const releaseAuthorityRequirement = environment === 'production'
    ? 'main-branch-merge'
    : 'explicit-human-approval'
  const release = {
    schemaVersion: '1.0.0',
    releaseId: '',
    environment,
    ...(lane === undefined ? {} : { releaseLane: lane }),
    environmentBinding,
    gitSha,
    ...(activeClientCompatibility ? { activeClientCompatibility } : {}),
    ...(plan55AppliedMigrationSnapshot ? { plan55AppliedMigrationSnapshot } : {}),
    sourceBundleSha256: digestRepoPaths(root, releaseSourcePaths),
    mobileBuildFingerprintSha256: digestRepoPaths(root, releaseSourcePaths.filter((path) =>
      path === 'package.json' ||
      path === 'pnpm-lock.yaml' ||
      path.startsWith('apps/mobile/') ||
      path.startsWith('packages/shared/')
    )),
    productionUiSourceSha256: productionUiAudit.sourceSha256,
    manifestSha256: sha256(manifest),
    migrationInventorySha256: sha256(migrationInventoryBytes),
    migrationInventory,
    migrationWatermark: migrationInventory.entries.at(-1)?.version ?? '',
    databaseTypesSha256: migrationInventory.databaseTypes.sha256,
    promptBundleSha256: digestPaths(root, [
      'packages/shared/kael/charter',
      'supabase/functions/mobile-api/_shared/kael/prompts',
    ]),
    policyBundleSha256: digestPaths(root, [
      'governance/RULES.md',
      'governance/STRUCTURES.md',
      'config/harness',
      'supabase/functions/_shared/harness',
      'supabase/functions/mobile-api/_shared/platform/authz',
      'supabase/functions/mobile-api/_shared/platform/privileged',
      'supabase/functions/mobile-api/_shared/kael/kael-guardrails',
    ]),
    serviceIntakePolicyBundleSha256: digestRepoPaths(root, releaseSourcePaths.filter((path) =>
      path === 'packages/shared/src/contracts/stage1-reliability.ts' ||
      path.includes('service-intake') ||
      path.includes('intake-policy') ||
      path.includes('service_intake_policy')
    )),
    priceEvidenceBundleSha256: digestRepoPaths(root, releaseSourcePaths.filter((path) =>
      path.includes('price-evidence') ||
      path.includes('price_evidence') ||
      path.includes('price-baseline') ||
      path.includes('price_baseline') ||
      path.includes('quote_ready_baseline')
    )),
    runtimeConfigurationSha256: digestPaths(root, runtimeConfigurationPaths(root)),
    evaluationSuiteVersion: evaluationSuite.suite_version,
    evaluationSuiteSha256: sha256(evaluationSuiteBytes),
    capabilityRegistrySha256: sha256(capabilityRegistryBytes),
    accessMatrixSha256: sha256(accessMatrixBytes),
    reliabilityPolicySha256: sha256(reliabilityPolicyBytes),
    promotionPolicySha256: plan55PolicyBytes
      ? sha256(canonicalJson({
        promotion: JSON.parse(promotionPolicyBytes.toString('utf8')),
        plan55: JSON.parse(plan55PolicyBytes.toString('utf8')),
      }))
      : sha256(promotionPolicyBytes),
    providerReadiness,
    providerReadinessFingerprintSha256: sha256(canonicalJson(providerReadiness)),
    edgeFunctions: edge.digests,
    edgeRuntimeConfigurations: edge.runtimeConfigurations,
    edgeBundleSha256: sha256(canonicalJson({
      sourceClosures: edge.digests,
      runtimeConfigurations: edge.runtimeConfigurations,
    })),
    edgeFunctionInputs: edge.inputs,
    verificationRequirements: lane === undefined
      ? [...STANDARD_VERIFICATION_REQUIREMENTS, releaseAuthorityRequirement]
      : verificationRequirementsForLane(lane, releaseAuthorityRequirement),
    rollbackPolicy: {
      historicalMigrationsImmutable: true,
      schemaCorrectionMode: 'forward-migration',
      compatibilityStrategy: 'expand-contract',
    },
    bundleSha256: '',
  }
  const behaviorHash = sha256(canonicalJson({ ...release, releaseId: undefined, bundleSha256: undefined }))
  release.releaseId = `harness-${gitSha.slice(0, 12)}-${behaviorHash.slice(0, 12)}`
  release.bundleSha256 = sha256(canonicalJson({ ...release, bundleSha256: undefined }))
  return release
}

export function assertCleanReleaseWorktree(rootInput = ROOT) {
  const root = resolve(rootInput)
  const status = git(root, ['status', '--porcelain=v1', '--untracked-files=all'])
  if (status) throw new Error('production release requires a clean Git worktree')
}

export function checkHarnessRelease(release, options = {}) {
  if (!release || typeof release !== 'object' || Array.isArray(release)) return ['release artifact is invalid']
  const problems = []
  if (release.releaseLane === 'plan55-production-only') {
    try {
      const expectedClientCompatibility = validatePlan55ActiveClientCompatibility(
        release.activeClientCompatibility,
        JSON.parse(readFileSync(resolve(ROOT, PLAN55_POLICY_PATH), 'utf8')),
      )
      if (JSON.stringify(canonicalize(expectedClientCompatibility)) !==
          JSON.stringify(canonicalize(release.activeClientCompatibility))) {
        problems.push('Plan 55 active Production client identity contains unrecognized or mismatched fields')
      }
    } catch {
      problems.push('Plan 55 release does not preserve the exact active Production client identity')
    }
    problems.push(...checkPlan55AppliedMigrationSnapshot(release, options.hostedBeforeBytes))
  } else if (release.activeClientCompatibility !== undefined) {
    problems.push('active client compatibility is only valid for the Plan 55 release lane')
  } else if (release.plan55AppliedMigrationSnapshot !== undefined) {
    problems.push('Plan 55 applied-migration evidence is only valid for the Plan 55 release lane')
  }
  const shaFields = [
    'manifestSha256',
    'sourceBundleSha256',
    'mobileBuildFingerprintSha256',
    'productionUiSourceSha256',
    'migrationInventorySha256',
    'databaseTypesSha256',
    'promptBundleSha256',
    'policyBundleSha256',
    'serviceIntakePolicyBundleSha256',
    'priceEvidenceBundleSha256',
    'runtimeConfigurationSha256',
    'evaluationSuiteSha256',
    'capabilityRegistrySha256',
    'accessMatrixSha256',
    'reliabilityPolicySha256',
    'promotionPolicySha256',
    'providerReadinessFingerprintSha256',
    'edgeBundleSha256',
    'bundleSha256',
  ]
  if (release.schemaVersion !== '1.0.0') problems.push('release schema version is invalid')
  if (!/^harness-[0-9a-f]{12}-[0-9a-f]{12}$/u.test(release.releaseId ?? '')) problems.push('release ID is invalid')
  if (!ENVIRONMENTS.has(release.environment)) problems.push('release environment is invalid')
  if (release.releaseLane !== undefined &&
      (!RELEASE_LANES.includes(release.releaseLane) || release.environment !== 'production')) {
    problems.push('release lane is invalid')
  }
  if (!/^[0-9a-f]{40}$/u.test(release.gitSha ?? '')) problems.push('release git SHA is invalid')
  if (typeof release.gitSha === 'string' && /^[0-9a-f]{40}$/u.test(release.gitSha)) {
    const behaviorHash = sha256(canonicalJson({ ...release, releaseId: undefined, bundleSha256: undefined }))
    const expectedReleaseId = `harness-${release.gitSha.slice(0, 12)}-${behaviorHash.slice(0, 12)}`
    if (release.releaseId !== expectedReleaseId) problems.push('release ID does not bind release contents')
  }
  for (const field of shaFields) if (!/^[0-9a-f]{64}$/u.test(release[field] ?? '')) problems.push(`${field} is invalid`)
  if (!validProviderReadiness(release.providerReadiness) ||
      release.providerReadinessFingerprintSha256 !== sha256(canonicalJson(release.providerReadiness))) {
    problems.push('provider readiness evidence is invalid')
  } else if (release.environment === 'production' &&
      (release.releaseLane === 'verification' || release.releaseLane === 'plan55-production-only'
        ? VERIFICATION_REQUIRED_PROVIDERS
        : PRODUCTION_REQUIRED_PROVIDERS)
        .some((name) => release.providerReadiness[name] !== true)) {
    problems.push('production provider readiness is incomplete')
  }
  problems.push(...checkEnvironmentBinding(release.environment, release.environmentBinding))
  problems.push(...checkMigrationInventory(release.migrationInventory, release.databaseTypesSha256))
  const expectedWatermark = release.migrationInventory?.entries?.at(-1)?.version ?? ''
  if (release.migrationWatermark !== expectedWatermark) problems.push('release migration watermark is invalid')
  if (!release.edgeFunctions || !Object.keys(release.edgeFunctions).length) problems.push('release has no Edge function digests')
  for (const [name, digest] of Object.entries(release.edgeFunctions ?? {})) {
    if (!/^[0-9a-f]{64}$/u.test(digest)) problems.push(`Edge digest is invalid for ${name}`)
  }
  const inputNames = Object.keys(release.edgeFunctionInputs ?? {}).sort()
  const digestNames = Object.keys(release.edgeFunctions ?? {}).sort()
  if (JSON.stringify(digestNames) !== JSON.stringify([...RELEASE_EDGE_FUNCTIONS])) {
    problems.push('release Edge function inventory is not the Stage 1 managed set')
  }
  if (JSON.stringify(inputNames) !== JSON.stringify(digestNames)) problems.push('Edge function input inventory does not match digest inventory')
  for (const [name, inputs] of Object.entries(release.edgeFunctionInputs ?? {})) {
    if (!Array.isArray(inputs) || !inputs.length) problems.push(`Edge input inventory is empty for ${name}`)
    else if (new Set(inputs).size !== inputs.length || JSON.stringify(inputs) !== JSON.stringify([...inputs].sort())) {
      problems.push(`Edge input inventory is not unique and sorted for ${name}`)
    }
  }
  const runtimeNames = Object.keys(release.edgeRuntimeConfigurations ?? {}).sort()
  if (JSON.stringify(runtimeNames) !== JSON.stringify(digestNames)) {
    problems.push('Edge runtime configuration inventory does not match digest inventory')
  }
  for (const [name, configuration] of Object.entries(release.edgeRuntimeConfigurations ?? {})) {
    if (!/^[0-9a-f]{64}$/u.test(configuration?.sha256 ?? '') ||
        !Array.isArray(configuration?.inputs) || configuration.inputs.length === 0 ||
        new Set(configuration.inputs).size !== configuration.inputs.length ||
        JSON.stringify(configuration.inputs) !== JSON.stringify([...configuration.inputs].sort()) ||
        typeof configuration.verifyJwt !== 'boolean' ||
        typeof configuration.importMap !== 'boolean' ||
        !configuration.entrypointPath?.endsWith(`supabase/functions/${name}/index.ts`) ||
        (configuration.importMap
          ? !configuration.importMapPath?.match(new RegExp(`supabase/functions/${name}/deno\\.jsonc?$`, 'u'))
          : configuration.importMapPath !== null)) {
      problems.push(`Edge runtime configuration is invalid for ${name}`)
    }
  }
  const requirements = release.verificationRequirements
  if (!Array.isArray(requirements) || requirements.length < 10 || new Set(requirements).size !== requirements.length) {
    problems.push('release verification requirements are incomplete')
  } else if (release.environment === 'production') {
    const expectedRequirements = release.releaseLane === undefined
      ? [...STANDARD_VERIFICATION_REQUIREMENTS, 'main-branch-merge']
      : verificationRequirementsForLane(release.releaseLane, 'main-branch-merge')
    if (JSON.stringify(requirements) !== JSON.stringify(expectedRequirements)) {
      problems.push('release verification requirements do not match the selected lane')
    }
  }
  if (release.rollbackPolicy?.historicalMigrationsImmutable !== true || release.rollbackPolicy?.schemaCorrectionMode !== 'forward-migration' || release.rollbackPolicy?.compatibilityStrategy !== 'expand-contract') {
    problems.push('release rollback policy is invalid')
  }
  const expectedBundle = sha256(canonicalJson({ ...release, bundleSha256: undefined }))
  if (release.bundleSha256 !== expectedBundle) problems.push('release bundle checksum mismatch')
  return problems
}

function validatePlan55ActiveClientCompatibility(value, policy) {
  const baseSha = String(policy?.productionSourceBase?.sha ?? '').toLowerCase()
  const baseReleaseId = policy?.productionSourceBase?.releaseId
  const fail = () => { throw new Error('Plan 55 active Production client identity is invalid') }
  if (!/^[0-9a-f]{40}$/u.test(baseSha) ||
      !new RegExp(`^harness-${baseSha.slice(0, 12)}-[0-9a-f]{12}$`, 'u').test(baseReleaseId ?? '') ||
      !value || typeof value !== 'object' || Array.isArray(value) ||
      String(value.gitSha ?? '').toLowerCase() !== baseSha ||
      value.releaseId !== baseReleaseId ||
      !Number.isSafeInteger(value.contractEpoch) || value.contractEpoch < 1) fail()
  const platforms = {}
  for (const platform of ['ios', 'android']) {
    const client = value[platform]
    if (!client || typeof client !== 'object' || Array.isArray(client) ||
        typeof client.applicationId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{1,159}$/u.test(client.applicationId) ||
        !Number.isSafeInteger(client.minimumBuildNumber) || client.minimumBuildNumber < 1 ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(client.easBuildId ?? '') ||
        typeof client.runtimeVersion !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/u.test(client.runtimeVersion)) fail()
    platforms[platform] = Object.freeze({
      applicationId: client.applicationId,
      minimumBuildNumber: client.minimumBuildNumber,
      easBuildId: client.easBuildId.toLowerCase(),
      runtimeVersion: client.runtimeVersion,
    })
  }
  return Object.freeze({ gitSha: baseSha, releaseId: baseReleaseId, contractEpoch: value.contractEpoch, ...platforms })
}

export function edgeSourceClosures(rootInput = ROOT, functionNames = RELEASE_EDGE_FUNCTIONS) {
  const root = resolve(rootInput)
  const functionsRoot = resolve(root, 'supabase/functions')
  const digests = {}
  const inputs = {}
  const selected = new Set(functionNames)
  if (!selected.size) throw new Error('at least one managed Edge function is required')
  for (const entry of readdirSync(functionsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('_') || !selected.has(entry.name)) continue
    const functionRoot = resolve(functionsRoot, entry.name)
    const indexPath = resolve(functionRoot, 'index.ts')
    if (!existsSync(indexPath)) throw new Error(`Edge function has no index.ts: ${entry.name}`)
    const files = collectImportClosure(root, indexPath)
    const sorted = [...files].sort()
    digests[entry.name] = digestFileSet(root, sorted)
    inputs[entry.name] = sorted.map((file) => repoPath(relative(root, file)))
  }
  const missing = [...selected].filter((name) => !(name in digests))
  if (missing.length) throw new Error(`managed Edge function source is missing: ${missing.join(', ')}`)
  return {
    digests: Object.fromEntries(Object.entries(digests).sort(([left], [right]) => left.localeCompare(right))),
    inputs: Object.fromEntries(Object.entries(inputs).sort(([left], [right]) => left.localeCompare(right))),
  }
}

export function edgeFunctionBundles(rootInput = ROOT, functionNames = RELEASE_EDGE_FUNCTIONS) {
  const root = resolve(rootInput)
  const source = edgeSourceClosures(root, functionNames)
  const runtimeConfigurations = {}
  for (const functionName of Object.keys(source.digests)) {
    const functionRoot = resolve(root, 'supabase/functions', functionName)
    const configurationFiles = new Set()
    for (const configPath of runtimeConfigurationPaths(root, functionRoot)) {
      const absolute = resolve(root, configPath)
      if (existsSync(absolute) && statSync(absolute).isFile()) configurationFiles.add(absolute)
    }
    const sortedConfiguration = [...configurationFiles].sort()
    runtimeConfigurations[functionName] = {
      sha256: digestFileSet(root, sortedConfiguration),
      inputs: sortedConfiguration.map((file) => repoPath(relative(root, file))),
      ...edgeDeploymentConfiguration(root, functionName, functionRoot),
    }
  }
  return {
    ...source,
    runtimeConfigurations: Object.fromEntries(
      Object.entries(runtimeConfigurations).sort(([left], [right]) => left.localeCompare(right)),
    ),
  }
}

function edgeDeploymentConfiguration(root, functionName, functionRoot) {
  const config = readFileSync(resolve(root, 'supabase/config.toml'), 'utf8')
  const lines = config.split(/\r?\n/u)
  const heading = `[functions.${functionName}]`
  const start = lines.findIndex((line) => line.trim() === heading)
  const nextSection = start < 0
    ? -1
    : lines.findIndex((line, index) => index > start && line.trim().startsWith('['))
  const section = start < 0
    ? ''
    : lines.slice(start + 1, nextSection < 0 ? lines.length : nextSection)
      .join('\n')
  const verifyJwt = !/^\s*verify_jwt\s*=\s*false\s*$/mu.test(section)
  const entrypointPath = repoPath(relative(root, resolve(functionRoot, 'index.ts')))
  const denoConfig = ['deno.json', 'deno.jsonc']
    .map((name) => resolve(functionRoot, name))
    .find((path) => existsSync(path) && statSync(path).isFile())
  return {
    verifyJwt,
    entrypointPath,
    importMap: Boolean(denoConfig),
    importMapPath: denoConfig ? repoPath(relative(root, denoConfig)) : null,
  }
}

function collectImportClosure(root, entryPath) {
  const pending = [entryPath]
  const graph = new Map()
  while (pending.length) {
    const file = pending.pop()
    if (graph.has(file)) continue
    assertInsideRoot(root, file)
    if (!existsSync(file) || !statSync(file).isFile()) throw new Error(`missing local Edge dependency: ${repoPath(relative(root, file))}`)
    if (!SOURCE_EXTENSIONS.includes(extname(file)) || extname(file) === '.json') {
      graph.set(file, { dependencies: [], localRuntime: true })
      continue
    }
    const source = readFileSync(file, 'utf8')
    const analysis = runtimeModuleAnalysis(file, source)
    const dependencies = []
    for (const specifier of analysis.specifiers) {
      const dependency = resolveLocalImport(file, specifier)
      if (!dependency) throw new Error(`unresolved local Edge import ${specifier} from ${repoPath(relative(root, file))}`)
      dependencies.push(dependency)
      pending.push(dependency)
    }
    graph.set(file, { dependencies, localRuntime: analysis.localRuntime })
  }
  const runtimeFiles = new Set(
    [...graph.entries()].filter(([, value]) => value.localRuntime).map(([file]) => file),
  )
  let changed = true
  while (changed) {
    changed = false
    for (const [file, value] of graph) {
      if (!runtimeFiles.has(file) && value.dependencies.some((dependency) => runtimeFiles.has(dependency))) {
        runtimeFiles.add(file)
        changed = true
      }
    }
  }
  runtimeFiles.add(entryPath)
  return runtimeFiles
}

function runtimeModuleAnalysis(file, source) {
  const ts = typescriptApi()
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    extname(file) === '.tsx' ? ts.ScriptKind.TSX : extname(file) === '.js' || extname(file) === '.mjs'
      ? ts.ScriptKind.JS
      : ts.ScriptKind.TS,
  )
  const values = []
  let localRuntime = false
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      if (isRuntimeImport(statement.importClause)) addLocalModule(values, statement.moduleSpecifier)
      continue
    }
    if (ts.isExportDeclaration(statement)) {
      if (isRuntimeExport(statement)) addLocalModule(values, statement.moduleSpecifier)
      continue
    }
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement) ||
        ts.isEmptyStatement(statement) || hasDeclareModifier(statement)) continue
    localRuntime = true
  }
  const visitDynamicImports = (node) => {
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length === 1) {
      addLocalModule(values, node.arguments[0])
    }
    ts.forEachChild(node, visitDynamicImports)
  }
  ts.forEachChild(sourceFile, visitDynamicImports)
  return { localRuntime, specifiers: [...new Set(values)].sort() }
}

function isRuntimeImport(clause) {
  const ts = typescriptApi()
  if (!clause) return true
  if (clause.isTypeOnly) return false
  if (clause.name) return true
  if (ts.isNamespaceImport(clause.namedBindings)) return true
  if (ts.isNamedImports(clause.namedBindings)) {
    return clause.namedBindings.elements.some((element) => !element.isTypeOnly)
  }
  return false
}

function isRuntimeExport(statement) {
  const ts = typescriptApi()
  if (!statement.moduleSpecifier || statement.isTypeOnly) return false
  if (!statement.exportClause || ts.isNamespaceExport(statement.exportClause)) return true
  return statement.exportClause.elements.some((element) => !element.isTypeOnly)
}

function addLocalModule(values, expression) {
  const ts = typescriptApi()
  if (expression && ts.isStringLiteralLike(expression) && expression.text.startsWith('.')) {
    values.push(expression.text)
  }
}

function hasDeclareModifier(statement) {
  const ts = typescriptApi()
  return statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword) === true
}

function resolveLocalImport(importer, specifier) {
  const base = resolve(dirname(importer), specifier)
  const candidates = [base]
  if (!extname(base)) {
    for (const extension of SOURCE_EXTENSIONS) candidates.push(`${base}${extension}`)
    for (const extension of SOURCE_EXTENSIONS) candidates.push(resolve(base, `index${extension}`))
  }
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? null
}

function runtimeConfigurationPaths(root, functionRoot) {
  const paths = [...GLOBAL_RUNTIME_CONFIGS]
  const roots = [resolve(root, 'supabase/functions')]
  if (functionRoot) roots.push(functionRoot)
  for (const directory of roots) {
    for (const name of FUNCTION_CONFIG_NAMES) {
      const absolute = resolve(directory, name)
      if (existsSync(absolute)) paths.push(repoPath(relative(root, absolute)))
    }
  }
  return [...new Set(paths)].sort()
}

function environmentBindingFor(environment) {
  const provider = {
    local: 'local-development',
    preview: 'preview-isolated',
    staging: 'staging-isolated',
    production: 'production-locked',
  }[environment]
  const webhook = {
    local: 'local-loopback',
    preview: 'preview-disabled',
    staging: 'staging-sandbox',
    production: 'production-signed',
  }[environment]
  return { providerConfigurationClass: provider, webhookConfigurationClass: webhook }
}

function checkEnvironmentBinding(environment, binding) {
  const expected = environmentBindingFor(environment)
  if (!binding || binding.providerConfigurationClass !== expected.providerConfigurationClass || binding.webhookConfigurationClass !== expected.webhookConfigurationClass) {
    return ['release environment binding is invalid']
  }
  return []
}

function checkMigrationInventory(inventory, databaseTypesSha256) {
  const problems = []
  if (!inventory || inventory.version !== '1.1.0' || !Array.isArray(inventory.entries) ||
      inventory.migrationEquivalences?.version !== '1.0.0' ||
      !Array.isArray(inventory.migrationEquivalences?.groups)) {
    return ['release migration inventory is invalid']
  }
  if (inventory.entries.length !== inventory.migrationCount) problems.push('release migration inventory count is invalid')
  const versions = inventory.entries.map((entry) => entry.version)
  if (new Set(versions).size !== versions.length) problems.push('release migration inventory has duplicate versions')
  if (versions.join('\n') !== [...versions].sort().join('\n')) problems.push('release migration inventory is out of order')
  const aggregate = sha256(inventory.entries.map((entry) => `${entry.version}:${entry.name}:${entry.sha256}\n`).join(''))
  if (aggregate !== inventory.migrationsSha256) problems.push('release migration aggregate checksum is invalid')
  if (inventory.databaseTypes?.sha256 !== databaseTypesSha256) problems.push('release database type identity does not match migration inventory')
  for (const entry of inventory.entries) {
    if (!/^\d{14}$/u.test(entry.version ?? '') || !/^[0-9a-f]{64}$/u.test(entry.sha256 ?? '') || !entry.file) {
      problems.push(`release migration entry is invalid: ${entry.file ?? 'unknown'}`)
    }
  }
  return problems
}

function checkPlan55AppliedMigrationSnapshot(release, hostedBeforeBytes) {
  const snapshot = release.plan55AppliedMigrationSnapshot
  const problems = []
  if (!snapshot || snapshot.schema !== 'plan55-applied-migration-snapshot/v1' ||
      snapshot.environment !== 'production' || snapshot.projectRef !== 'iwevizmsedyqozxlawwl' ||
      !/^harness-[0-9a-f]{12}-[0-9a-f]{12}$/u.test(snapshot.sourceReleaseId ?? '') ||
      !/^[0-9a-f]{40}$/u.test(snapshot.sourceGitSha ?? '') ||
      !/^[0-9a-f]{64}$/u.test(snapshot.sourceMigrationInventorySha256 ?? '') ||
      !/^[0-9a-f]{64}$/u.test(snapshot.hostedStateSha256 ?? '') ||
      !Number.isSafeInteger(snapshot.appliedMigrationCount) ||
      !/^[0-9a-f]{64}$/u.test(snapshot.appliedMigrationInventorySha256 ?? '')) {
    return ['Plan 55 applied migration snapshot is invalid']
  }
  let policy
  let sourceInventoryBytes
  try {
    policy = JSON.parse(readFileSync(resolve(ROOT, PLAN55_POLICY_PATH), 'utf8'))
    sourceInventoryBytes = readFileSync(resolve(ROOT, 'config/harness/migration-inventory.json'))
  } catch {
    return ['Plan 55 applied migration source evidence is unavailable']
  }
  if (snapshot.projectRef !== policy.projectRef ||
      snapshot.sourceReleaseId !== policy.productionSourceBase?.releaseId ||
      snapshot.sourceGitSha !== policy.productionSourceBase?.sha) {
    problems.push('Plan 55 applied migration snapshot is not tied to the policy Production base')
  }
  if (hostedBeforeBytes !== undefined) {
    if (!Buffer.isBuffer(hostedBeforeBytes) || sha256(hostedBeforeBytes) !== snapshot.hostedStateSha256) {
      problems.push('Plan 55 hosted-before bytes do not match the release snapshot')
    } else {
      try {
        const hostedState = JSON.parse(hostedBeforeBytes.toString('utf8'))
        const hostedClient = validatePlan55ActiveClientCompatibility(hostedState.clientCompatibility, policy)
        if (hostedState.environment !== 'production' || hostedState.projectRef !== policy.projectRef ||
            hostedState.releaseId !== snapshot.sourceReleaseId || hostedState.gitSha !== snapshot.sourceGitSha ||
            JSON.stringify(canonicalize(hostedClient)) !== JSON.stringify(canonicalize(release.activeClientCompatibility))) {
          problems.push('Plan 55 release does not match the exact hosted-before snapshot')
        }
      } catch {
        problems.push('Plan 55 hosted-before client compatibility is invalid')
      }
    }
  }
  if (snapshot.appliedMigrationCount !== release.migrationInventory?.migrationCount ||
      snapshot.appliedMigrationInventorySha256 !== release.migrationInventorySha256) {
    problems.push('Plan 55 applied migration snapshot does not match the release inventory')
  }
  if (snapshot.sourceMigrationInventorySha256 !== sha256(sourceInventoryBytes)) {
    problems.push('Plan 55 source migration inventory identity does not match the release source')
  }
  const serializedAppliedInventory = Buffer.from(`${JSON.stringify(release.migrationInventory, null, 2)}\n`)
  if (sha256(serializedAppliedInventory) !== release.migrationInventorySha256) {
    problems.push('Plan 55 applied migration inventory digest is invalid')
  }
  let sourceInventory
  try {
    sourceInventory = JSON.parse(sourceInventoryBytes.toString('utf8'))
  } catch {
    return [...problems, 'Plan 55 source migration inventory is invalid']
  }
  const sourceEntries = new Map((sourceInventory.entries ?? []).map((entry) => [entry.version, entry]))
  const appliedEntries = release.migrationInventory?.entries
  if (!Array.isArray(appliedEntries) || !Array.isArray(sourceInventory.entries)) {
    problems.push('Plan 55 applied migration entries are invalid')
  } else {
    for (const entry of appliedEntries) {
      const source = sourceEntries.get(entry.version)
      if (!source || JSON.stringify(canonicalize(source)) !== JSON.stringify(canonicalize(entry))) {
        problems.push(`Plan 55 applied migration is not source-attested: ${entry.version ?? 'unknown'}`)
      }
    }
  }
  return problems
}

function digestPaths(root, paths) {
  const files = paths.flatMap((path) => {
    const absolute = resolve(root, path)
    if (!existsSync(absolute)) return []
    return statSync(absolute).isDirectory() ? collectFiles(absolute) : [absolute]
  })
  return digestFileSet(root, files)
}

export function releaseSourceFilePaths(root) {
  const output = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: root, encoding: 'utf8' },
  )
  const deletedWorktreePaths = new Set(execFileSync(
    'git',
    ['diff', '--name-only', '--diff-filter=D', '--no-renames', '-z'],
    { cwd: root, encoding: 'utf8' },
  ).split('\0').map(repoPath).filter(Boolean))
  return output
    .split('\0')
    .map(repoPath)
    .filter(Boolean)
    .filter((path) => !path.startsWith('artifacts/') && !path.startsWith('.scratch/'))
    .filter((path) => !deletedWorktreePaths.has(path))
    .sort()
}

function digestRepoPaths(root, paths) {
  if (!paths.length) return sha256('')
  return digestFileSet(root, paths.map((path) => resolve(root, path)))
}

function providerReadinessFromEnvironment(environment) {
  const enabled = (name) => Boolean(environment[name]?.trim())
  const trueFlag = (name) => ['1', 'true', 'yes', 'on'].includes(environment[name]?.trim().toLowerCase())
  return {
    android_fcm_v1: trueFlag('NESTSCOUT_ANDROID_FCM_V1_READY'),
    anthropic: enabled('ANTHROPIC_API_KEY'),
    deepseek: enabled('DEEPSEEK_API_KEY'),
    durable_guards: trueFlag('KAEL_DURABLE_GUARDS_ENABLED'),
    global_ai_enabled: !trueFlag('KAEL_AI_KILL_SWITCH'),
    ios_apns: trueFlag('NESTSCOUT_IOS_APNS_READY'),
    perplexity: enabled('PERPLEXITY_API_KEY'),
    push_receipt_reconciler: trueFlag('NESTSCOUT_PUSH_RECEIPT_RECONCILER_READY'),
    vietmap: enabled('VIETMAP_API_KEY') || enabled('VIETMAP_MAPS_API_KEY'),
  }
}

function validProviderReadiness(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join('\n') === [...PROVIDER_READINESS_KEYS].sort().join('\n') &&
    PROVIDER_READINESS_KEYS.every((name) => typeof value[name] === 'boolean')
}

function collectFiles(directory) {
  if (!existsSync(directory)) return []
  const files = []
  const walk = (path) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const absolute = resolve(path, entry.name)
      if (entry.isDirectory()) walk(absolute)
      else if (entry.isFile()) files.push(absolute)
    }
  }
  walk(directory)
  return files.sort()
}

function digestFileSet(root, files) {
  const hash = createHash('sha256')
  for (const file of Array.from(new Set(files)).sort()) {
    assertInsideRoot(root, file)
    hash.update(`${repoPath(relative(root, file))}\0`)
    hash.update(readFileSync(file))
    hash.update('\0')
  }
  return hash.digest('hex')
}

function assertInsideRoot(root, file) {
  const relativePath = relative(root, file)
  if (relativePath.startsWith('..') || relativePath === '') throw new Error(`release input escapes repository root: ${file}`)
}

export function resolveReleaseArtifactPath(rootInput = ROOT, artifactPath = OUTPUT) {
  const root = resolve(rootInput)
  const path = resolve(root, artifactPath)
  assertInsideRoot(root, path)
  return path
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value))
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
}

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const environmentIndex = process.argv.indexOf('--environment')
  const outputIndex = process.argv.indexOf('--output')
  const verifyIndex = process.argv.indexOf('--verify')
  const hostedBeforeIndex = process.argv.indexOf('--hosted-before')
  if (verifyIndex >= 0) {
    const artifact = process.argv[verifyIndex + 1]
    if (!artifact) throw new Error('--verify requires a release artifact path')
    const path = resolveReleaseArtifactPath(ROOT, artifact)
    const release = JSON.parse(readFileSync(path, 'utf8'))
    const hostedBeforePath = hostedBeforeIndex >= 0 ? process.argv[hostedBeforeIndex + 1] : undefined
    if (hostedBeforeIndex >= 0 && (!hostedBeforePath || hostedBeforePath.startsWith('--'))) {
      throw new Error('--hosted-before requires a path')
    }
    if (release.releaseLane === 'plan55-production-only' && !hostedBeforePath) {
      throw new Error('Plan 55 verification requires --hosted-before')
    }
    if (release.releaseLane !== 'plan55-production-only' && hostedBeforePath) {
      throw new Error('--hosted-before is only valid for the Plan 55 Production lane')
    }
    const hostedBefore = hostedBeforePath
      ? readFileSync(resolveReleaseArtifactPath(ROOT, hostedBeforePath))
      : undefined
    const problems = checkHarnessRelease(release, { hostedBeforeBytes: hostedBefore })
    if (problems.length) {
      for (const problem of problems) console.error(`  - ${problem}`)
      process.exitCode = 1
    } else console.log(`release bundle ok: ${release.releaseId}`)
  } else {
    const environment = process.argv[environmentIndex + 1]
    const output = process.argv[outputIndex + 1]
    const laneIndex = process.argv.indexOf('--lane')
    const lane = laneIndex >= 0 ? process.argv[laneIndex + 1] : undefined
    const hostedBeforePath = hostedBeforeIndex >= 0 ? process.argv[hostedBeforeIndex + 1] : undefined
    if (environmentIndex >= 0 && !environment) throw new Error('--environment requires a value')
    if (outputIndex >= 0 && !output) throw new Error('--output requires a release artifact path')
    if (laneIndex >= 0 && (!lane || lane.startsWith('--'))) throw new Error('--lane requires a value')
    if (hostedBeforeIndex >= 0 && (!hostedBeforePath || hostedBeforePath.startsWith('--'))) {
      throw new Error('--hosted-before requires a path')
    }
    if (lane === 'plan55-production-only' && !hostedBeforePath) {
      throw new Error('Plan 55 production release requires --hosted-before')
    }
    if (lane !== 'plan55-production-only' && hostedBeforePath) {
      throw new Error('--hosted-before is only valid for the Plan 55 Production lane')
    }
    const hostedBeforeBytes = hostedBeforePath
      ? readFileSync(resolveReleaseArtifactPath(ROOT, hostedBeforePath))
      : undefined
    const release = buildHarnessRelease({
      environment: environmentIndex >= 0 ? environment : 'preview',
      lane,
      hostedBeforeBytes,
    })
    const path = resolveReleaseArtifactPath(ROOT, outputIndex >= 0 ? output : OUTPUT)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${JSON.stringify(release, null, 2)}\n`)
    console.log(`${release.releaseId} ${repoPath(relative(ROOT, path))}`)
  }
}
