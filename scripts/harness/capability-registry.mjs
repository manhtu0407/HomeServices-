import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const ROUTES_ROOT = 'supabase/functions/mobile-api/_shared/http/routes'
const JSON_OUTPUT = 'config/harness/capabilities.json'
const TS_OUTPUT = 'supabase/functions/mobile-api/_shared/platform/authz/capability-registry.ts'
const ROLES = ['customer', 'worker', 'admin']
const PUBLIC_ROUTE_KINDS = new Set(['kael.charter', 'harness.health'])
// Authenticated but role-agnostic on purpose: both declare `roles?:` and emit none, so any signed-in
// actor may call them and ownership is enforced downstream. Every other protected route has to say
// who may call it — see rolesForUndeclared.
const ROUTES_WITHOUT_DECLARED_ROLES = new Set(['jobs.get', 'services'])
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
const STREAMING_PROVIDER_ROUTE_KINDS = new Set([
  'customer.kaelConversations.stream',
  'kael.chat.evidenceStream',
  'kael.chat.stream',
  'workers.kaelChat.stream',
])
// These authenticated routes perform a server-owned AI operation. Route handlers
// enforce the actor and resource ownership before the workflow reaches the
// service-only spend, dependency, and conversation-persistence RPCs.
const SERVER_OWNED_KAEL_AI_ROUTE_KINDS = new Set([
  'customer.kaelConversations.stream',
  'customer.kaelConversations.turn',
  'kael.assistant',
  'kael.chat.create',
  'kael.chat.evidence',
  'kael.chat.evidenceStream',
  'kael.chat.confirm',
  'kael.chat.intakeConfirmation',
  'kael.chat.stream',
  'kael.chat.turn',
  'workers.kaelChat.stream',
  'workers.kaelChat.turn',
])
// The Case catalog can reconcile linkage while listing, and its mutations use
// service-only table grants after the customer domain binds every row to ctx.user.id.
const SERVER_OWNED_CUSTOMER_CONVERSATION_CATALOG_ROUTE_KINDS = new Set([
  'customer.kaelConversations.archive',
  'customer.kaelConversations.create',
  'customer.kaelConversations.list',
  'customer.kaelConversations.pin',
  'customer.kaelConversations.rename',
])
// Upload reservations and revocation remain actor-scoped in their RPC inputs,
// while the underlying quota table and Storage signer stay service-only.
const SERVER_OWNED_KAEL_MEDIA_ROUTE_KINDS = new Set([
  'kael.chat.mediaRevoke',
  'kael.chat.mediaUpload',
])
// Recovery receipts use a service-only RPC after the route binds the session
// owner. They remain database reads: hosted GETs must not require a write
// idempotency key merely because their DB client is privileged.
const SERVER_OWNED_DATABASE_READ_ROUTE_KINDS = new Set([
  'kael.chat.operation',
])
const repoPath = (value) => value.split(sep).join('/')
const normalizeSource = (value) => value.replace(/\r\n/gu, '\n')

export function buildCapabilityRegistry(options = {}) {
  const root = resolve(options.root ?? ROOT)
  const routeRoot = resolve(root, options.routesRoot ?? ROUTES_ROOT)
  const files = discover(routeRoot)
  const records = new Map()
  for (const file of files) {
    const source = normalizeSource(readFileSync(file, 'utf8'))
    const roleAliases = roleAliasesFor(source)
    for (const { kind, index } of declaredKinds(source)) {
      const window = routeDescriptorWindow(source, index)
      const method = /\bmethod:\s*["'](GET|POST|PUT|PATCH|DELETE)["']/u.exec(window)?.[1] ?? null
      const roleBlock = /\broles:\s*\[([^\]]*)\]/u.exec(window)?.[1] ?? ''
      const literalRoles = [...roleBlock.matchAll(/["'](customer|worker|admin|admin_operator)["']/gu)]
        .map((item) => item[1])
      const roleAlias = /\broles:\s*([A-Za-z_$][\w$]*)/u.exec(window)?.[1] ?? shorthandRoleBinding(window)
      const roles = literalRoles.length ? literalRoles : (roleAlias ? roleAliases.get(roleAlias) ?? [] : [])
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
    roles: record.roles.size ? [...record.roles].sort() : rolesForUndeclared(record.kind),
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
    // A protected route with no roles cannot reach here: rolesForUndeclared throws while building.
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
  const publicRoute = PUBLIC_ROUTE_KINDS.has(input.kind)
  const risk = riskFor(input.kind, input.methods, input.roles)
  const operationClass = operationClassFor(input.kind, risk, input.methods)
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
    privileged: !publicRoute && (
      risk === 'administrative' ||
      risk === 'money' ||
      input.kind.startsWith('jobs.') ||
      input.kind.startsWith('disputes.') ||
      input.kind.startsWith('workers.') ||
      input.kind === 'workerApplications.submit' ||
      SERVER_OWNED_KAEL_AI_ROUTE_KINDS.has(input.kind) ||
      SERVER_OWNED_CUSTOMER_CONVERSATION_CATALOG_ROUTE_KINDS.has(input.kind) ||
      SERVER_OWNED_KAEL_MEDIA_ROUTE_KINDS.has(input.kind) ||
      SERVER_OWNED_DATABASE_READ_ROUTE_KINDS.has(input.kind)
    ),
    resourceType: resourceTypeFor(input.kind),
    // Admin control endpoints are privileged monitoring/operations paths. Their identifiers
    // select records for review, not user-owned resources, so ownership guards do not apply.
    requiresResourceCheck: input.resourceIdFields.length > 0
      && (!input.kind.startsWith('admin.') || resourceTypeFor(input.kind) !== 'system'),
    confirmationGate,
    envelopeTtlMs: risk === 'money' || risk === 'administrative' ? 30_000 : risk === 'sensitive' ? 60_000 : 120_000,
    sources: input.sources,
  }
}

// Reached only when no descriptor for this kind declared roles. Answering with every role there is
// fail-open: it publishes an audit record wider than the route, and it stays green because the CI
// drift check regenerates with this same scraper. That is how a money-gated worker confirmation came
// to be audited as worker-confirmable. A route the scraper cannot read is now a build failure.
function rolesForUndeclared(kind) {
  if (PUBLIC_ROUTE_KINDS.has(kind)) return []
  if (ROUTES_WITHOUT_DECLARED_ROLES.has(kind)) return ROLES
  throw new Error(
    `capability registry: no roles could be read from any descriptor for "${kind}". Declare roles on ` +
    'the route descriptor, or add the kind to ROUTES_WITHOUT_DECLARED_ROLES if every signed-in actor ' +
    'may call it.',
  )
}

function riskFor(kind, methods, roles) {
  if (kind.startsWith('admin.') || (roles.length === 1 && roles[0] === 'admin')) return 'administrative'
  if (confirmationFor(kind) !== 'none' || /paymentIntent|cashPaymentConfirm|stagingPaymentConfirm/iu.test(kind)) return 'money'
  if (/deletion|avatar|media|memory|candidate|accessAuthorize|cancellation|serviceArea|servicePreferences|routeMap|routePreview|voice|refund|commission|dispute|review/iu.test(kind)) return 'sensitive'
  if (methods.length && methods.every((method) => method === 'GET')) return 'read'
  return 'write'
}

function operationClassFor(kind, risk, methods) {
  if (STREAMING_PROVIDER_ROUTE_KINDS.has(kind)) return 'provider_call'
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
  if (kind === 'jobs.rfqPricePropose' || kind === 'jobs.rfqPriceDecide') return 'offer'
  if (kind.startsWith('admin.operations.scopeChanges.')) return 'none'
  if (/^jobs\.paymentOrder(?:Claim)?$/u.test(kind)) return 'payment'
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

// A route kind is not always a string literal: three descriptors pick one of two kinds with a
// ternary. Matching only the literal form dropped those kinds from the scraped record, and the
// entry then inherited a widened default instead — which is how a money-gated route came to be
// audited as worker-confirmable. Read the whole expression, then take the branches it can produce.
function declaredKinds(source) {
  const found = []
  for (const match of source.matchAll(/\bkind:\s*/gu)) {
    const start = match.index + match[0].length
    let expression = expressionSlice(source, start)
    // Everything left of the `?` is the discriminant being tested, not a kind this route emits.
    const branch = topLevelTernaryIndex(expression)
    if (branch >= 0) expression = expression.slice(branch + 1)
    for (const literal of expression.matchAll(/["']([^"']+)["']/gu)) {
      found.push({ kind: literal[1], index: match.index })
    }
  }
  return found
}

// The value expression assigned to a property, up to the separator that ends it. Quote- and
// bracket-aware so a separator inside a string or a call argument does not cut the slice short.
function expressionSlice(source, start) {
  let depth = 0
  let quote = null
  for (let cursor = start; cursor < source.length; cursor += 1) {
    const character = source[cursor]
    if (quote) {
      if (character === '\\') cursor += 1
      else if (character === quote) quote = null
      continue
    }
    if (character === '"' || character === "'" || character === '`') quote = character
    else if (character === '(' || character === '[' || character === '{') depth += 1
    else if (character === ')' || character === ']') depth -= 1
    else if (character === '}') {
      if (depth === 0) return source.slice(start, cursor)
      depth -= 1
    } else if ((character === ',' || character === ';') && depth === 0) return source.slice(start, cursor)
  }
  return source.slice(start)
}

function topLevelTernaryIndex(expression) {
  let depth = 0
  let quote = null
  for (let cursor = 0; cursor < expression.length; cursor += 1) {
    const character = expression[cursor]
    if (quote) {
      if (character === '\\') cursor += 1
      else if (character === quote) quote = null
      continue
    }
    if (character === '"' || character === "'" || character === '`') quote = character
    else if (character === '(' || character === '[' || character === '{') depth += 1
    else if (character === ')' || character === ']' || character === '}') depth -= 1
    // `?.` and `??` are not conditionals.
    else if (character === '?' && depth === 0 && expression[cursor + 1] !== '.' && expression[cursor + 1] !== '?') {
      return cursor
    }
  }
  return -1
}

// `{ kind, method, sessionId, roles }` binds roles by shorthand, which carries no `roles:` for the
// alias regex to find. Eight Kael chat routes declare their roles this way.
function shorthandRoleBinding(descriptor) {
  return /[,{]\s*roles\s*[,}]/u.test(descriptor) ? 'roles' : undefined
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

function roleAliasesFor(source) {
  const aliases = new Map()
  for (const match of source.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)[^=]*=\s*\[([^\]]*)\]/gu)) {
    const roles = [...match[2].matchAll(/["'](customer|worker|admin|admin_operator)["']/gu)]
      .map((item) => item[1])
    if (roles.length) aliases.set(match[1], roles)
  }
  return aliases
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
  try {
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
  } catch (error) {
    // A registry that cannot be derived is not written and not reported as ok.
    console.error(`  - ${error.message}`)
    process.exitCode = 1
  }
}
