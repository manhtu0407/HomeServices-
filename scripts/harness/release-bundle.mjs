import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUTPUT = 'artifacts/harness/release-manifest.json'
const ENVIRONMENTS = new Set(['local', 'preview', 'staging', 'production'])
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.mjs', '.json']
const FUNCTION_CONFIG_NAMES = ['deno.json', 'deno.jsonc', 'deno.lock', 'import_map.json', 'import-map.json']
const GLOBAL_RUNTIME_CONFIGS = ['supabase/config.toml']
const repoPath = (value) => value.split(sep).join('/')

export function buildHarnessRelease(options = {}) {
  const root = resolve(options.root ?? ROOT)
  const environment = options.environment ?? 'preview'
  if (!ENVIRONMENTS.has(environment)) throw new Error(`invalid release environment: ${environment}`)
  const gitSha = options.gitSha ?? git(root, ['rev-parse', 'HEAD'])
  if (!/^[0-9a-f]{40}$/u.test(gitSha)) throw new Error('release git SHA is invalid')

  const manifest = readFileSync(resolve(root, 'config/harness/manifest.json'))
  const migrationInventoryBytes = readFileSync(resolve(root, 'config/harness/migration-inventory.json'))
  const migrationInventory = JSON.parse(migrationInventoryBytes.toString('utf8'))
  const evaluationSuiteBytes = readFileSync(resolve(root, 'config/harness/evaluation.json'))
  const evaluationSuite = JSON.parse(evaluationSuiteBytes.toString('utf8'))
  const capabilityRegistryBytes = readFileSync(resolve(root, 'config/harness/capabilities.json'))
  const accessMatrixBytes = readFileSync(resolve(root, 'config/harness/access-matrix.json'))
  const reliabilityPolicyBytes = readFileSync(resolve(root, 'config/harness/reliability.json'))
  const promotionPolicyBytes = readFileSync(resolve(root, 'config/harness/promotion.json'))
  const edge = edgeFunctionBundles(root)
  const environmentBinding = environmentBindingFor(environment)
  const release = {
    schemaVersion: '1.0.0',
    releaseId: '',
    environment,
    environmentBinding,
    gitSha,
    manifestSha256: sha256(manifest),
    migrationInventorySha256: sha256(migrationInventoryBytes),
    migrationInventory,
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
    runtimeConfigurationSha256: digestPaths(root, runtimeConfigurationPaths(root)),
    evaluationSuiteVersion: evaluationSuite.suite_version,
    evaluationSuiteSha256: sha256(evaluationSuiteBytes),
    capabilityRegistrySha256: sha256(capabilityRegistryBytes),
    accessMatrixSha256: sha256(accessMatrixBytes),
    reliabilityPolicySha256: sha256(reliabilityPolicyBytes),
    promotionPolicySha256: sha256(promotionPolicyBytes),
    edgeFunctions: edge.digests,
    edgeFunctionInputs: edge.inputs,
    verificationRequirements: [
      'repository-controls',
      'empty-database-reset',
      'sql-verification',
      'generated-types-match',
      'staging-migration-match',
      'edge-digest-match',
      'live-provider-evaluation-if-affected',
      'readonly-production-drift',
      'compatible-rollback-target',
      'explicit-human-approval',
    ],
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

export function checkHarnessRelease(release) {
  const problems = []
  const shaFields = [
    'manifestSha256',
    'migrationInventorySha256',
    'databaseTypesSha256',
    'promptBundleSha256',
    'policyBundleSha256',
    'runtimeConfigurationSha256',
    'evaluationSuiteSha256',
    'capabilityRegistrySha256',
    'accessMatrixSha256',
    'reliabilityPolicySha256',
    'promotionPolicySha256',
    'bundleSha256',
  ]
  if (release.schemaVersion !== '1.0.0') problems.push('release schema version is invalid')
  if (!/^harness-[0-9a-f]{12}-[0-9a-f]{12}$/u.test(release.releaseId ?? '')) problems.push('release ID is invalid')
  if (!ENVIRONMENTS.has(release.environment)) problems.push('release environment is invalid')
  if (!/^[0-9a-f]{40}$/u.test(release.gitSha ?? '')) problems.push('release git SHA is invalid')
  for (const field of shaFields) if (!/^[0-9a-f]{64}$/u.test(release[field] ?? '')) problems.push(`${field} is invalid`)
  problems.push(...checkEnvironmentBinding(release.environment, release.environmentBinding))
  problems.push(...checkMigrationInventory(release.migrationInventory, release.databaseTypesSha256))
  if (!release.edgeFunctions || !Object.keys(release.edgeFunctions).length) problems.push('release has no Edge function digests')
  for (const [name, digest] of Object.entries(release.edgeFunctions ?? {})) {
    if (!/^[0-9a-f]{64}$/u.test(digest)) problems.push(`Edge digest is invalid for ${name}`)
  }
  const inputNames = Object.keys(release.edgeFunctionInputs ?? {}).sort()
  const digestNames = Object.keys(release.edgeFunctions ?? {}).sort()
  if (JSON.stringify(inputNames) !== JSON.stringify(digestNames)) problems.push('Edge function input inventory does not match digest inventory')
  for (const [name, inputs] of Object.entries(release.edgeFunctionInputs ?? {})) {
    if (!Array.isArray(inputs) || !inputs.length) problems.push(`Edge input inventory is empty for ${name}`)
    else if (new Set(inputs).size !== inputs.length || JSON.stringify(inputs) !== JSON.stringify([...inputs].sort())) {
      problems.push(`Edge input inventory is not unique and sorted for ${name}`)
    }
  }
  const requirements = release.verificationRequirements
  if (!Array.isArray(requirements) || requirements.length < 10 || new Set(requirements).size !== requirements.length) {
    problems.push('release verification requirements are incomplete')
  }
  if (release.rollbackPolicy?.historicalMigrationsImmutable !== true || release.rollbackPolicy?.schemaCorrectionMode !== 'forward-migration' || release.rollbackPolicy?.compatibilityStrategy !== 'expand-contract') {
    problems.push('release rollback policy is invalid')
  }
  const expectedBundle = sha256(canonicalJson({ ...release, bundleSha256: undefined }))
  if (release.bundleSha256 !== expectedBundle) problems.push('release bundle checksum mismatch')
  return problems
}

export function edgeFunctionBundles(rootInput = ROOT) {
  const root = resolve(rootInput)
  const functionsRoot = resolve(root, 'supabase/functions')
  const digests = {}
  const inputs = {}
  for (const entry of readdirSync(functionsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) continue
    const functionRoot = resolve(functionsRoot, entry.name)
    const indexPath = resolve(functionRoot, 'index.ts')
    if (!existsSync(indexPath)) throw new Error(`Edge function has no index.ts: ${entry.name}`)
    const files = collectImportClosure(root, indexPath)
    for (const configPath of runtimeConfigurationPaths(root, functionRoot)) {
      const absolute = resolve(root, configPath)
      if (existsSync(absolute) && statSync(absolute).isFile()) files.add(absolute)
    }
    const sorted = [...files].sort()
    digests[entry.name] = digestFileSet(root, sorted)
    inputs[entry.name] = sorted.map((file) => repoPath(relative(root, file)))
  }
  return {
    digests: Object.fromEntries(Object.entries(digests).sort(([left], [right]) => left.localeCompare(right))),
    inputs: Object.fromEntries(Object.entries(inputs).sort(([left], [right]) => left.localeCompare(right))),
  }
}

function collectImportClosure(root, entryPath) {
  const pending = [entryPath]
  const visited = new Set()
  while (pending.length) {
    const file = pending.pop()
    if (visited.has(file)) continue
    assertInsideRoot(root, file)
    if (!existsSync(file) || !statSync(file).isFile()) throw new Error(`missing local Edge dependency: ${repoPath(relative(root, file))}`)
    visited.add(file)
    if (!SOURCE_EXTENSIONS.includes(extname(file))) continue
    const source = readFileSync(file, 'utf8')
    for (const specifier of localImportSpecifiers(source)) {
      const dependency = resolveLocalImport(file, specifier)
      if (!dependency) throw new Error(`unresolved local Edge import ${specifier} from ${repoPath(relative(root, file))}`)
      pending.push(dependency)
    }
  }
  return visited
}

function localImportSpecifiers(source) {
  const values = []
  const patterns = [
    /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/gu,
    /import\s*\(\s*["']([^"']+)["']\s*\)/gu,
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) if (match[1].startsWith('.')) values.push(match[1])
  }
  return [...new Set(values)].sort()
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
  if (!inventory || inventory.version !== '1.0.0' || !Array.isArray(inventory.entries)) return ['release migration inventory is invalid']
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

function digestPaths(root, paths) {
  const files = paths.flatMap((path) => {
    const absolute = resolve(root, path)
    if (!existsSync(absolute)) return []
    return statSync(absolute).isDirectory() ? collectFiles(absolute) : [absolute]
  })
  return digestFileSet(root, files)
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
  if (verifyIndex >= 0) {
    const path = resolve(ROOT, process.argv[verifyIndex + 1] ?? OUTPUT)
    const release = JSON.parse(readFileSync(path, 'utf8'))
    const problems = checkHarnessRelease(release)
    if (problems.length) {
      for (const problem of problems) console.error(`  - ${problem}`)
      process.exitCode = 1
    } else console.log(`release bundle ok: ${release.releaseId}`)
  } else {
    const release = buildHarnessRelease({
      environment: environmentIndex >= 0 ? process.argv[environmentIndex + 1] : 'preview',
    })
    const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : OUTPUT
    const path = resolve(ROOT, output)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, `${JSON.stringify(release, null, 2)}\n`)
    console.log(`${release.releaseId} ${repoPath(relative(ROOT, path))}`)
  }
}
