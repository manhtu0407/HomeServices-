import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const MIGRATIONS = 'supabase/migrations'
const MATRIX = 'config/harness/access-matrix.json'
const repoPath = (value) => value.split(sep).join('/')

export function buildAccessMatrix(options = {}) {
  const root = resolve(options.root ?? ROOT)
  const migrationRoot = resolve(root, options.migrationRoot ?? MIGRATIONS)
  const files = readdirSync(migrationRoot)
    .filter((name) => name.endsWith('.sql'))
    .sort()
  const source = files.map((name) => readFileSync(resolve(migrationRoot, name), 'utf8')).join('\n')
  const tables = tableInventory(source)
  const views = viewInventory(source)
  const functions = functionInventory(source)
  const storageBuckets = bucketInventory(source)
  const realtimeTables = Array.from(new Set([
    ...matchAll(source, /alter\s+publication\s+supabase_realtime\s+add\s+table\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)/giu, 1),
  ])).sort()

  return {
    version: '1.0.0',
    source: {
      migrationRoot: repoPath(relative(root, migrationRoot)),
      migrationCount: files.length,
      migrationDigest: digest(files.map((name) => `${name}:${digest(readFileSync(resolve(migrationRoot, name)))}\n`).join('')),
    },
    actors: ['anonymous', 'customer_a', 'customer_b', 'worker_a', 'worker_b', 'admin', 'service_role'],
    tables,
    views,
    functions,
    storageBuckets,
    realtimeTables,
  }
}

export function checkAccessMatrix(options = {}) {
  const root = resolve(options.root ?? ROOT)
  const matrixPath = resolve(root, options.matrixPath ?? MATRIX)
  const expected = buildAccessMatrix({ root })
  const problems = []
  const migrationSource = readMigrationSource(root, options.migrationRoot ?? MIGRATIONS)
  if (!existsSync(matrixPath)) return { ok: false, problems: ['missing access matrix'], expected }
  const actual = JSON.parse(readFileSync(matrixPath, 'utf8'))
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    problems.push('access matrix drift: run node scripts/harness/access-matrix.mjs --write')
  }
  for (const table of expected.tables) {
    if (!table.rlsEnabled) problems.push(`table without RLS classification: ${table.name}`)
    if (table.classification === 'actor-scoped' && !table.actorCommands.authenticated.length && !table.actorCommands.anonymous.length) {
      problems.push(`actor-scoped table has no actor commands: ${table.name}`)
    }
  }
  for (const view of expected.views) {
    if (!view.securityInvoker) problems.push(`public view is not security_invoker: ${view.name}`)
  }
  if (/\bpublic\.is_admin\s*\(\s*\)/iu.test(migrationSource)) {
    problems.push('policy references public.is_admin(); use private.is_admin()')
  }
  for (const fn of expected.functions) {
    if (fn.securityDefiner && !fn.fixedSearchPath) {
      problems.push(`SECURITY DEFINER function lacks fixed search_path: ${fn.signature}`)
    }
    if (fn.securityDefiner && fn.signature !== 'is_admin()' && fn.executeRoles.some((role) => ['public', 'anon', 'authenticated'].includes(role))) {
      problems.push(`SECURITY DEFINER function has broad execute grant: ${fn.signature}`)
    }
  }
  const scenarioPath = resolve(root, 'config/harness/access-scenarios.json')
  if (!existsSync(scenarioPath)) problems.push('missing actor access scenarios')
  else {
    const scenarios = JSON.parse(readFileSync(scenarioPath, 'utf8'))
    const actors = new Set(scenarios.scenarios.map((item) => item.actor))
    for (const actor of expected.actors) if (!actors.has(actor)) problems.push(`missing access scenario actor: ${actor}`)
    const surfaces = new Set(scenarios.scenarios.map((item) => item.surface))
    for (const surface of ['table', 'rpc', 'storage', 'realtime']) if (!surfaces.has(surface)) problems.push(`missing access scenario surface: ${surface}`)
  }
  return { ok: problems.length === 0, problems, expected }
}

function readMigrationSource(root, relativeRoot) {
  const migrationRoot = resolve(root, relativeRoot)
  return readdirSync(migrationRoot)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => readFileSync(resolve(migrationRoot, name), 'utf8'))
    .join('\n')
}

function tableInventory(source) {
  const names = publicRelationNames(
    source,
    /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:(public|[a-zA-Z_][a-zA-Z0-9_]*)\.)?([a-zA-Z_][a-zA-Z0-9_]*)/giu,
  )
  return names.map((name) => {
    const escaped = escapeRegex(name)
    const rlsEnabled = new RegExp(`alter\\s+table\\s+(?:if\\s+exists\\s+)?(?:public\\.)?${escaped}\\s+enable\\s+row\\s+level\\s+security`, 'iu').test(source)
    const policySegments = matchSegments(
      source,
      new RegExp(`create\\s+policy\\s+(?:"[^"]+"|[^\\s]+)\\s+on\\s+(?:public\\.)?${escaped}\\b[\\s\\S]*?(?=;)`, 'giu'),
    )
    const actorCommands = { anonymous: [], authenticated: [] }
    for (const segment of policySegments) {
      const command = /\bfor\s+(select|insert|update|delete|all)\b/iu.exec(segment)?.[1]?.toLowerCase() ?? 'all'
      const roles = policyRoles(segment)
      if (roles.some((role) => role === 'public' || role === 'anon')) actorCommands.anonymous.push(command)
      if (roles.some((role) => role === 'public' || role === 'authenticated')) actorCommands.authenticated.push(command)
    }
    actorCommands.anonymous = sortedUnique(actorCommands.anonymous)
    actorCommands.authenticated = sortedUnique(actorCommands.authenticated)
    const classification = actorCommands.anonymous.length || actorCommands.authenticated.length
      ? 'actor-scoped'
      : 'internal'
    return {
      name,
      classification,
      rlsEnabled,
      actorCommands,
      serviceRole: ['select', 'insert', 'update', 'delete'],
      realtime: false,
    }
  }).map((table) => ({ ...table, realtime: realtimeForTable(source, table.name) }))
}

function viewInventory(source) {
  const names = sortedUnique([
    ...publicRelationNames(source, /create\s+(?:or\s+replace\s+)?view\s+(?:(public|[a-zA-Z_][a-zA-Z0-9_]*)\.)?([a-zA-Z_][a-zA-Z0-9_]*)/giu),
    ...publicRelationNames(source, /create\s+materialized\s+view\s+(?:if\s+not\s+exists\s+)?(?:(public|[a-zA-Z_][a-zA-Z0-9_]*)\.)?([a-zA-Z_][a-zA-Z0-9_]*)/giu),
  ])
  return names.map((name) => ({
    name,
    securityInvoker: new RegExp(`alter\\s+view\\s+(?:public\\.)?${escapeRegex(name)}\\s+set\\s*\\(\\s*security_invoker\\s*=\\s*(?:true|on)`, 'iu').test(source) ||
      new RegExp(`create\\s+(?:or\\s+replace\\s+)?view\\s+(?:public\\.)?${escapeRegex(name)}[\\s\\S]{0,500}?security_invoker\\s*=\\s*(?:true|on)`, 'iu').test(source),
  }))
}

function functionInventory(source) {
  const functions = new Map()
  for (const statement of splitSqlStatements(source)) {
    const normalized = stripLeadingSqlComments(statement).trim()
    if (!normalized) continue

    if (/^create\s+(?:or\s+replace\s+)?function\b/iu.test(normalized)) {
      const parsed = parseFunctionReference(normalized, /function\s+/iu)
      if (!parsed || parsed.schema !== 'public') continue
      const current = functions.get(parsed.signature)
      functions.set(parsed.signature, {
        signature: parsed.signature,
        securityDefiner: /\bsecurity\s+definer\b/iu.test(normalized),
        fixedSearchPath: /\bset\s+search_path\s*=\s*[^;]+/iu.test(normalized),
        executeRoles: current?.executeRoles ?? ['public'],
      })
      continue
    }

    if (/^drop\s+function\b/iu.test(normalized)) {
      const parsed = parseFunctionReference(normalized, /function\s+(?:if\s+exists\s+)?/iu)
      if (parsed?.schema === 'public') functions.delete(parsed.signature)
      continue
    }

    if (/^alter\s+function\b/iu.test(normalized) && /\bset\s+search_path\s*=/iu.test(normalized)) {
      const parsed = parseFunctionReference(normalized, /function\s+/iu)
      const current = parsed ? functions.get(parsed.signature) : null
      if (current) current.fixedSearchPath = true
      continue
    }

    const allFunctions = /^(grant|revoke)\s+(?:all|execute)\s+on\s+all\s+functions\s+in\s+schema\s+public\s+(?:to|from)\s+([^;]+)$/iu.exec(normalized)
    if (allFunctions) {
      const roles = parseRoles(allFunctions[2])
      for (const current of functions.values()) {
        current.executeRoles = mutateRoles(current.executeRoles, allFunctions[1], roles)
      }
      continue
    }

    const acl = /^(grant|revoke)\s+(?:all|execute)\s+on\s+function\s+/iu.exec(normalized)
    if (acl) {
      const parsed = parseFunctionReference(normalized, /function\s+/iu)
      const current = parsed ? functions.get(parsed.signature) : null
      const roleMatch = /\s+(?:to|from)\s+([^;]+)$/iu.exec(normalized)
      if (current && roleMatch) {
        current.executeRoles = mutateRoles(current.executeRoles, acl[1], parseRoles(roleMatch[1]))
      }
      continue
    }

    if (normalized.includes('$harness_security_definer_search_path_hardening$')) {
      for (const current of functions.values()) {
        if (current.securityDefiner) current.fixedSearchPath = true
      }
    }
  }
  return [...functions.values()]
    .map((item) => ({ ...item, executeRoles: sortedUnique(item.executeRoles) }))
    .sort((a, b) => a.signature.localeCompare(b.signature))
}

function stripLeadingSqlComments(value) {
  let result = value
  while (true) {
    const next = result.replace(/^\s+/u, '')
    if (next.startsWith('--')) {
      const newline = next.indexOf('\n')
      result = newline >= 0 ? next.slice(newline + 1) : ''
      continue
    }
    if (next.startsWith('/*')) {
      const end = next.indexOf('*/')
      result = end >= 0 ? next.slice(end + 2) : ''
      continue
    }
    return next
  }
}

function splitSqlStatements(source) {
  const statements = []
  let start = 0
  let index = 0
  let single = false
  let double = false
  let lineComment = false
  let blockComment = false
  let dollarTag = null
  while (index < source.length) {
    const next = source[index + 1]
    if (lineComment) {
      if (source[index] === '\n') lineComment = false
      index += 1
      continue
    }
    if (blockComment) {
      if (source[index] === '*' && next === '/') {
        blockComment = false
        index += 2
      } else index += 1
      continue
    }
    if (dollarTag) {
      if (source.startsWith(dollarTag, index)) {
        index += dollarTag.length
        dollarTag = null
      } else index += 1
      continue
    }
    if (!single && !double && source[index] === '-' && next === '-') {
      lineComment = true
      index += 2
      continue
    }
    if (!single && !double && source[index] === '/' && next === '*') {
      blockComment = true
      index += 2
      continue
    }
    if (!single && !double && source[index] === '$') {
      const tag = /^\$[A-Za-z0-9_]*\$/u.exec(source.slice(index))?.[0]
      if (tag) {
        dollarTag = tag
        index += tag.length
        continue
      }
    }
    if (!double && source[index] === "'") {
      if (single && next === "'") index += 2
      else {
        single = !single
        index += 1
      }
      continue
    }
    if (!single && source[index] === '"') {
      if (double && next === '"') index += 2
      else {
        double = !double
        index += 1
      }
      continue
    }
    if (!single && !double && source[index] === ';') {
      statements.push(source.slice(start, index))
      start = index + 1
    }
    index += 1
  }
  if (source.slice(start).trim()) statements.push(source.slice(start))
  return statements
}

function parseFunctionReference(statement, prefixPattern) {
  const prefix = prefixPattern.exec(statement)
  if (!prefix) return null
  let index = prefix.index + prefix[0].length
  while (/\s/u.test(statement[index] ?? '')) index += 1
  const nameMatch = /^(?:("?[A-Za-z_][A-Za-z0-9_]*"?)\.)?("?[A-Za-z_][A-Za-z0-9_]*"?)/u.exec(statement.slice(index))
  if (!nameMatch) return null
  const schema = (nameMatch[1] ?? 'public').replaceAll('"', '').toLowerCase()
  const name = nameMatch[2].replaceAll('"', '')
  index += nameMatch[0].length
  while (/\s/u.test(statement[index] ?? '')) index += 1
  if (statement[index] !== '(') return null
  const end = matchingParenthesis(statement, index)
  if (end < 0) return null
  const args = normalizeSignatureArgs(statement.slice(index + 1, end))
  return { schema, name, args, signature: `${name}(${args})` }
}

function matchingParenthesis(value, openIndex) {
  let depth = 0
  let single = false
  let double = false
  let lineComment = false
  let blockComment = false
  for (let index = openIndex; index < value.length; index += 1) {
    const next = value[index + 1]
    if (lineComment) {
      if (value[index] === '\n') lineComment = false
      continue
    }
    if (blockComment) {
      if (value[index] === '*' && next === '/') {
        blockComment = false
        index += 1
      }
      continue
    }
    if (!single && !double && value[index] === '-' && next === '-') {
      lineComment = true
      index += 1
      continue
    }
    if (!single && !double && value[index] === '/' && next === '*') {
      blockComment = true
      index += 1
      continue
    }
    if (!double && value[index] === "'") {
      if (single && next === "'") index += 1
      else single = !single
      continue
    }
    if (!single && value[index] === '"') {
      if (double && next === '"') index += 1
      else double = !double
      continue
    }
    if (single || double) continue
    if (value[index] === '(') depth += 1
    else if (value[index] === ')' && --depth === 0) return index
  }
  return -1
}

function splitTopLevel(value) {
  const parts = []
  let start = 0
  let depth = 0
  let single = false
  let double = false
  for (let index = 0; index < value.length; index += 1) {
    const next = value[index + 1]
    if (!double && value[index] === "'") {
      if (single && next === "'") index += 1
      else single = !single
      continue
    }
    if (!single && value[index] === '"') {
      if (double && next === '"') index += 1
      else double = !double
      continue
    }
    if (single || double) continue
    if (value[index] === '(' || value[index] === '[') depth += 1
    else if (value[index] === ')' || value[index] === ']') depth -= 1
    else if (value[index] === ',' && depth === 0) {
      parts.push(value.slice(start, index))
      start = index + 1
    }
  }
  parts.push(value.slice(start))
  return parts
}


function normalizeSignatureArgs(args) {
  if (!args.trim()) return ''
  return splitTopLevel(args).map((argument) => {
    let cleaned = argument
      .replace(/--[^\n]*/gu, ' ')
      .replace(/\/\*[\s\S]*?\*\//gu, ' ')
      .replace(/\s+/gu, ' ')
      .trim()
    cleaned = cleaned.replace(/\s+(?:default|=)\s+[\s\S]*$/iu, '').trim()
    cleaned = cleaned.replace(/^(?:inout|in|out|variadic)\s+/iu, '')
    const parts = cleaned.split(/\s+/u)
    if (parts.length > 1 && !looksLikeTypeStart(parts[0])) cleaned = parts.slice(1).join(' ')
    return canonicalType(cleaned)
  }).filter(Boolean).join(', ')
}

function looksLikeTypeStart(value) {
  return /^(?:public\.|pg_catalog\.)/iu.test(value) || new Set([
    'bigint', 'bigserial', 'bit', 'boolean', 'bytea', 'character', 'date', 'decimal',
    'double', 'inet', 'int', 'int2', 'int4', 'int8', 'integer', 'interval', 'json',
    'jsonb', 'numeric', 'real', 'record', 'smallint', 'text', 'time', 'timestamp',
    'timestamptz', 'uuid', 'varchar', 'void', 'anyarray', 'anyelement', 'trigger',
  ]).has(value.toLowerCase().replace(/\[\]$/u, ''))
}

function canonicalType(value) {
  return value
    .replace(/^public\./iu, '')
    .replace(/\bint\b/giu, 'integer')
    .replace(/\bint4\b/giu, 'integer')
    .replace(/\bint8\b/giu, 'bigint')
    .replace(/\btimestamptz\b/giu, 'timestamp with time zone')
    .replace(/\btimestamp\s+with\s+time\s+zone\b/giu, 'timestamp with time zone')
    .replace(/\s+/gu, ' ')
    .trim()
}

function parseRoles(value) {
  return sortedUnique(value.split(',').map((role) => role.trim().replaceAll('"', '').toLowerCase()).filter(Boolean))
}

function mutateRoles(current, action, roles) {
  const result = new Set(current)
  for (const role of roles) {
    if (action.toLowerCase() === 'grant') result.add(role)
    else result.delete(role)
  }
  return [...result]
}

function policyRoles(segment) {
  const value = /\bto\s+([\s\S]*?)(?=\busing\b|\bwith\s+check\b|$)/iu.exec(segment)?.[1]
  if (!value) return ['public']
  return value.split(',').map((role) => role.trim().replace(/"/g, '').toLowerCase()).filter(Boolean)
}

function bucketInventory(source) {
  const ids = new Set()
  for (const match of source.matchAll(/insert\s+into\s+storage\.buckets[\s\S]{0,500}?values\s*\(\s*'([^']+)'/giu)) ids.add(match[1])
  for (const match of source.matchAll(/bucket_id\s*=\s*'([^']+)'/giu)) ids.add(match[1])
  return [...ids].sort().map((id) => ({
    id,
    storageObjectPolicyCount: matchSegments(source, /create\s+policy\s+(?:"[^"]+"|[^\s]+)\s+on\s+storage\.objects\b[\s\S]*?(?=;)/giu)
      .filter((segment) => segment.includes(`'${id}'`)).length,
  }))
}

function realtimeForTable(source, name) {
  return new RegExp(`alter\\s+publication\\s+supabase_realtime\\s+add\\s+table\\s+(?:public\\.)?${escapeRegex(name)}\\b`, 'iu').test(source)
}

function publicRelationNames(source, regex) {
  const names = []
  for (const match of source.matchAll(regex)) {
    const schema = match[1]?.toLowerCase()
    if (!schema || schema === 'public') names.push(match[2])
  }
  return sortedUnique(names)
}

function matchAll(source, regex, index) {
  return Array.from(source.matchAll(regex), (match) => match[index])
}

function matchSegments(source, regex) {
  return Array.from(source.matchAll(regex), (match) => match[0])
}

function sortedUnique(values) {
  return Array.from(new Set(values)).sort()
}

function dedupeBy(values, key) {
  const map = new Map()
  for (const value of values) map.set(key(value), value)
  return [...map.values()]
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex')
}

function parseArgs(values) {
  return { write: values.includes('--write'), json: values.includes('--json') }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2))
  if (args.write) {
    const matrix = buildAccessMatrix()
    writeFileSync(resolve(ROOT, MATRIX), `${JSON.stringify(matrix, null, 2)}\n`)
    console.log(`wrote ${MATRIX}`)
  } else {
    const report = checkAccessMatrix()
    if (args.json) console.log(JSON.stringify({ ok: report.ok, problems: report.problems }, null, 2))
    else if (report.ok) console.log(`access matrix ok: ${report.expected.tables.length} tables, ${report.expected.functions.length} functions`)
    else {
      console.error('access matrix verification failed:')
      for (const problem of report.problems) console.error(`  - ${problem}`)
      process.exitCode = 1
    }
  }
}
