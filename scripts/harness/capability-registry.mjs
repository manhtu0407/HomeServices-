import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const ROUTES_ROOT = 'supabase/functions/mobile-api/_shared/http/routes'
const JSON_OUTPUT = 'config/harness/capabilities.json'
const TS_OUTPUT = 'supabase/functions/mobile-api/_shared/platform/authz/capability-registry.ts'
const ROLES = ['customer', 'worker', 'admin']
const RESOURCE_IDENTIFIER_FIELDS = [
  'jobId',
  'sessionId',
  'conversationId',
  'scopeChangeId',
  'cancellationId',
  'disputeId',
  'candidateId',
  'notificationId',
]
const repoPath = (value) => value.split(sep).join('/')
const normalizeSource = (value) => value.replace(/\r\n/gu, '\n')

export function buildCapabilityRegistry(options = {}) {
  const root = resolve(options.root ?? ROOT)
  const routeRoot = resolve(root, options.routesRoot ?? ROUTES_ROOT)
  const files = discover(routeRoot)
  const records = new Map()
  for (const file of files) {
    const source = normalizeSource(readFileSync(file, 'utf8'))
    for (const match of source.matchAll(/\bkind:\s*["']([^"']+)["']/gu)) {
      const kind = match[1]
      const window = routeDescriptorWindow(source, match.index)
      const method = /\bmethod:\s*["'](GET|POST|PATCH|DELETE)["']/u.exec(window)?.[1] ?? null
      const roleBlock = /\broles:\s*\[([^\]]*)\]/u.exec(window)?.[1] ?? ''
      const roles = [...roleBlock.matchAll(/["'](customer|worker|admin)["']/gu)].map((item) => item[1])
      const current = records.get(kind) ?? {
        kind,
        methods: new Set(),
        roles: new Set(),
        resourceIdFields: new Set(),
        sources: new Set(),
      }
      if (method) current.methods.add(method)
      for (const role of roles) current.roles.add(role)
      for (const field of resourceIdentifierFields(window)) current.resourceIdFields.add(field)
      current.sources.add(repoPath(relative(root, file)))
      records.set(kind, current)
    }
  }

  const entries = [...records.values()].map((record) => policyFor({
    kind: record.kind,
    methods: [...record.methods].sort(),
    roles: record.roles.size ? [...record.roles].sort() : defaultRoles(record.kind),
    resourceIdFields: [...record.resourceIdFields].sort(),
    sources: [...record.sources].sort(),
  })).sort((left, right) => left.kind.localeCompare(right.kind))
  const sourceDigest = sha256(files.map((file) => `${repoPath(relative(root, file))}:${sha256(normalizeSource(readFileSync(file, 'utf8')))}\n`).join(''))
  return {
    version: '1.0.0',
    source: { routeRoot: repoPath(relative(root, routeRoot)), fileCount: files.length, sha256: sourceDigest },
    entries,
  }
}

export function checkCapabilityRegistry(options = {}) {
  const root = resolve(options.root ?? ROOT)
  const expected = buildCapabilityRegistry({ root })
  const problems = []
  const jsonPath = resolve(root, options.jsonOutput ?? JSON_OUTPUT)
  const tsPath = resolve(root, options.tsOutput ?? TS_OUTPUT)
  if (!existsSync(jsonPath)) problems.push('missing capability registry JSON')
  else if (normalizeSource(readFileSync(jsonPath, 'utf8')) !== `${JSON.stringify(expected, null, 2)}\n`) {
    problems.push('capability registry JSON drift')
  }
  const expectedTs = renderTypeScript(expected)
  if (!existsSync(tsPath)) problems.push('missing capability registry TypeScript')
  else if (normalizeSource(readFileSync(tsPath, 'utf8')) !== expectedTs) problems.push('capability registry TypeScript drift')
  const kinds = expected.entries.map((entry) => entry.kind)
  if (new Set(kinds).size !== kinds.length) problems.push('duplicate route kind in capability registry')
  for (const entry of expected.entries) {
    if (!entry.roles.length && !entry.public) problems.push(`protected route without roles: ${entry.kind}`)
    if (!entry.public && entry.sideEffectClass !== 'none' && !entry.capability) problems.push(`side-effecting route without capability: ${entry.kind}`)
    if (entry.confirmationGate !== 'none' && entry.operationClass !== 'money_impacting') {
      problems.push(`confirmation route is not money-impacting: ${entry.kind}`)
    }
  }
  return { ok: problems.length === 0, problems, expected }
}

export function writeCapabilityRegistry(options = {}) {
  const root = resolve(options.root ?? ROOT)
  const registry = buildCapabilityRegistry({ root })
  const jsonPath = resolve(root, options.jsonOutput ?? JSON_OUTPUT)
  const tsPath = resolve(root, options.tsOutput ?? TS_OUTPUT)
  mkdirSync(dirname(jsonPath), { recursive: true })
  mkdirSync(dirname(tsPath), { recursive: true })
  writeFileSync(jsonPath, `${JSON.stringify(registry, null, 2)}\n`)
  writeFileSync(tsPath, renderTypeScript(registry))
  return registry
}

function policyFor(input) {
  const publicRoute = input.kind === 'kael.charter' || input.kind === 'harness.health'
  const risk = riskFor(input.kind, input.methods, input.roles)
  const operationClass = operationClassFor(risk, input.methods)
  const confirmationGate = confirmationFor(input.kind)
  const sideEffectClass = sideEffectFor(operationClass)
  return {
    kind: input.kind,
    capability: publicRoute ? null : `mobile.route.${input.kind}`,
    public: publicRoute,
    methods: input.methods.length ? input.methods : ['GET'],
    roles: publicRoute ? [] : [...new Set([...input.roles, 'admin'])].sort(),
    risk,
    operationClass,
    sideEffectClass,
    privileged: !publicRoute && (risk === 'administrative' || risk === 'money' || input.kind.startsWith('jobs.') || input.kind.startsWith('disputes.')),
    resourceType: resourceTypeFor(input.kind),
    requiresResourceCheck: input.resourceIdFields.length > 0,
    confirmationGate,
    envelopeTtlMs: risk === 'money' || risk === 'administrative' ? 30_000 : risk === 'sensitive' ? 60_000 : 120_000,
    sources: input.sources,
  }
}

function defaultRoles(kind) {
  if (kind === 'kael.charter' || kind === 'harness.health') return []
  if (kind.startsWith('admin.')) return ['admin']
  if (kind.startsWith('workers.')) return ['worker', 'admin']
  return ROLES
}

function riskFor(kind, methods, roles) {
  if (kind.startsWith('admin.') || (roles.length === 1 && roles[0] === 'admin')) return 'administrative'
  if (confirmationFor(kind) !== 'none' || /paymentIntent|cashPaymentConfirm|stagingPaymentConfirm/iu.test(kind)) return 'money'
  if (/deletion|avatar|media|memory|candidate|accessAuthorize|cancellation|serviceArea|servicePreferences|routeMap|routePreview|voice|refund|commission|dispute|review/iu.test(kind)) return 'sensitive'
  if (methods.length && methods.every((method) => method === 'GET')) return 'read'
  return 'write'
}

function operationClassFor(risk, methods) {
  if (risk === 'money') return 'money_impacting'
  if (methods.length && methods.every((method) => method === 'GET')) return 'database_read'
  if (risk === 'read') return 'database_read'
  if (risk === 'administrative' || risk === 'sensitive') return 'idempotent_write'
  return 'idempotent_write'
}

function sideEffectFor(operationClass) {
  if (operationClass === 'pure_read' || operationClass === 'database_read') return 'read-only'
  if (operationClass === 'idempotent_write') return 'idempotent-write'
  if (operationClass === 'money_impacting') return 'conditional-write'
  return 'conditional-write'
}

function confirmationFor(kind) {
  if (/paymentIntent|cashPaymentConfirm|stagingPaymentConfirm/iu.test(kind)) return 'payment'
  if (/scope\.decide|scopeChange/iu.test(kind)) return 'scope_change'
  if (/confirmCompletion/iu.test(kind)) return 'completion'
  if (/confirmCandidate|rejectCandidate|workerCandidateConfirm|workerCandidateReject/iu.test(kind)) return 'proposed_worker'
  if (/confirmSearch/iu.test(kind)) return 'offer'
  return 'none'
}

function resourceTypeFor(kind) {
  const normalized = kind.toLowerCase()
  if (normalized.startsWith('jobs.')) return 'job'
  if (normalized.startsWith('disputes.')) return 'dispute'
  if (normalized.startsWith('scope.')) return 'scope_change'
  if (normalized.includes('candidate')) return 'candidate'
  if (normalized.includes('conversation')) return 'conversation'
  if (normalized.includes('chat')) return 'session'
  if (normalized.startsWith('notifications')) return 'notification'
  if (normalized.startsWith('me.') || normalized.startsWith('workers.me')) return 'self'
  if (normalized === 'services' || normalized.startsWith('places.')) return 'catalog'
  return 'system'
}

function routeDescriptorWindow(source, index) {
  const start = source.lastIndexOf('{', index)
  if (start < 0) return ''
  let depth = 0
  for (let cursor = start; cursor < source.length; cursor += 1) {
    const character = source[cursor]
    if (character === '{') depth += 1
    if (character === '}') {
      depth -= 1
      if (depth === 0) return source.slice(start, cursor + 1)
    }
  }
  return source.slice(start)
}

function resourceIdentifierFields(descriptor) {
  return RESOURCE_IDENTIFIER_FIELDS.filter((field) =>
    new RegExp(`\\b${field}\\s*(?::|,|\\})`, 'u').test(descriptor)
  )
}

function renderTypeScript(registry) {
  const entries = registry.entries.map((entry) => `  ${JSON.stringify(entry.kind)}: ${JSON.stringify(entry)},`).join('\n')
  return `// Generated by scripts/harness/capability-registry.mjs.\nexport const CAPABILITY_REGISTRY_VERSION = ${JSON.stringify(registry.version)} as const;\nexport const CAPABILITY_REGISTRY_SOURCE_SHA256 = ${JSON.stringify(registry.source.sha256)} as const;\n\nexport const CAPABILITY_POLICIES = {\n${entries}\n} as const;\n\nexport type RegisteredRouteKind = keyof typeof CAPABILITY_POLICIES;\nexport type RegisteredCapabilityPolicy = (typeof CAPABILITY_POLICIES)[RegisteredRouteKind];\n`
}

function discover(start) {
  const files = []
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(path)
    }
  }
  walk(start)
  return files.sort()
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--write')) {
    const registry = writeCapabilityRegistry()
    console.log(`wrote ${registry.entries.length} capability policies`)
  } else {
    const report = checkCapabilityRegistry()
    if (report.ok) console.log(`capability registry ok: ${report.expected.entries.length} routes`)
    else {
      for (const problem of report.problems) console.error(`  - ${problem}`)
      process.exitCode = 1
    }
  }
}
