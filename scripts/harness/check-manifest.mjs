import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const MANIFEST = 'config/harness/manifest.json'
const EXTENSIONS = new Set(['.js', '.mjs', '.ts', '.tsx'])
const GROUP_ORDER = { everyday: 0, design: 1, runtime: 2 }

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const repoPath = (path) => path.split(sep).join('/')
const unique = (values) => new Set(values).size === values.length
const duplicates = (values) => {
  const counts = new Map()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value).sort()
}
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

function resolveRepo(root, path) {
  const absolute = resolve(root, path)
  const prefix = root.endsWith(sep) ? root : `${root}${sep}`
  if (absolute !== root && !absolute.startsWith(prefix)) throw new Error(`path escapes repository root: ${path}`)
  return absolute
}

function schemaRef(schema, rootSchema) {
  if (!schema?.$ref) return schema
  return schema.$ref.slice(2).split('/').reduce((value, key) => value?.[key], rootSchema)
}

function typeMatches(value, type) {
  if (type === 'object') return isObject(value)
  if (type === 'array') return Array.isArray(value)
  if (type === 'integer') return Number.isInteger(value)
  if (type === 'null') return value === null
  return typeof value === type
}

function validateJson(value, inputSchema, rootSchema, path = 'manifest') {
  const schema = schemaRef(inputSchema, rootSchema)
  const problems = []
  if (!schema) return [`${path} references a missing schema`]
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : []
  if (types.length && !types.some((type) => typeMatches(value, type))) return [`${path} has invalid type`]
  if ('const' in schema && value !== schema.const) problems.push(`${path} must equal ${schema.const}`)
  if (schema.enum && !schema.enum.includes(value)) problems.push(`${path} has invalid value: ${value}`)
  if (typeof value === 'string') {
    if (schema.minLength && value.length < schema.minLength) problems.push(`${path} is too short`)
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) problems.push(`${path} has invalid format`)
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) problems.push(`${path} is below minimum`)
    if (schema.maximum !== undefined && value > schema.maximum) problems.push(`${path} is above maximum`)
  }
  if (Array.isArray(value)) {
    if (schema.minItems && value.length < schema.minItems) problems.push(`${path} must be non-empty`)
    if (schema.uniqueItems && !unique(value.map((item) => JSON.stringify(item)))) problems.push(`${path} contains duplicates`)
    if (schema.items) value.forEach((item, index) => problems.push(...validateJson(item, schema.items, rootSchema, `${path}[${index}]`)))
  }
  if (isObject(value)) {
    for (const field of schema.required ?? []) if (!(field in value)) problems.push(`${path} is missing required field: ${field}`)
    if (schema.additionalProperties === false) {
      for (const field of Object.keys(value)) if (!(field in (schema.properties ?? {}))) problems.push(`${path} has unknown field: ${field}`)
    }
    for (const [field, fieldSchema] of Object.entries(schema.properties ?? {})) {
      if (field in value) problems.push(...validateJson(value[field], fieldSchema, rootSchema, `${path}.${field}`))
    }
  }
  for (const rule of schema.allOf ?? []) {
    if (rule.if && validateJson(value, rule.if, rootSchema, path).length === 0 && rule.then) problems.push(...validateJson(value, rule.then, rootSchema, path))
    else if (!rule.if) problems.push(...validateJson(value, rule, rootSchema, path))
  }
  return problems
}

function gitHash(root, path) {
  const result = spawnSync('git', ['hash-object', '--', path], { cwd: root, encoding: 'utf8', windowsHide: true })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(result.stderr.trim() || `git hash-object failed for ${path}`)
  const hash = result.stdout.trim()
  if (!/^[0-9a-f]{40}$/.test(hash)) throw new Error(`invalid Git blob digest for ${path}`)
  return hash
}

function discover(root, relativeRoot, predicate) {
  const start = resolveRepo(root, relativeRoot)
  if (!existsSync(start) || !statSync(start).isDirectory()) return []
  const files = []
  const visited = new Set()
  const walk = (directory) => {
    const physicalDirectory = realpathSync(directory)
    if (visited.has(physicalDirectory)) return
    visited.add(physicalDirectory)
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = resolve(directory, entry.name)
      const linkedDirectory = entry.isSymbolicLink()
        && existsSync(absolute)
        && statSync(absolute).isDirectory()
      if (entry.isDirectory() || linkedDirectory) walk(absolute)
      else if (entry.isFile() && predicate(entry.name)) files.push(repoPath(relative(root, absolute)))
    }
  }
  walk(start)
  return files.sort()
}

function compareSets(actual, expected, label, problems) {
  const actualSet = new Set(actual)
  const expectedSet = new Set(expected)
  const duplicateActual = duplicates(actual)
  const duplicateExpected = duplicates(expected)
  const missing = [...expectedSet].filter((value) => !actualSet.has(value)).sort()
  const extra = [...actualSet].filter((value) => !expectedSet.has(value)).sort()
  if (duplicateActual.length) problems.push(`${label} contains duplicates: ${duplicateActual.join(', ')}`)
  if (duplicateExpected.length) problems.push(`${label} expected inventory contains duplicates: ${duplicateExpected.join(', ')}`)
  if (missing.length) problems.push(`${label} is missing: ${missing.join(', ')}`)
  if (extra.length) problems.push(`${label} has undeclared entries: ${extra.join(', ')}`)
}

function frontmatterName(text) {
  return /^---\s*\r?\n[\s\S]*?^name:\s*([^\r\n]+)\s*$[\s\S]*?^---\s*$/m.exec(text)?.[1]?.trim().replace(/^['"]|['"]$/g, '') ?? null
}

function checkEntries(root, manifest, problems) {
  const skills = manifest.entries.filter((entry) => entry.kind === 'repository-skill')
  const runtime = manifest.entries.filter((entry) => ['runtime-tool', 'provider-adapter'].includes(entry.kind))
  const ids = new Set()
  const paths = new Set()
  for (const entry of manifest.entries) {
    if (entry.kind === 'repository-skill' && entry.group === 'runtime') problems.push(`repository-skill ${entry.id} cannot use runtime group`)
    if (['runtime-tool', 'provider-adapter'].includes(entry.kind) && entry.group !== 'runtime') problems.push(`${entry.kind} ${entry.id} must use runtime group`)
    if (!['none', 'read-only'].includes(entry.sideEffectClass) && !entry.requiredCapability) problems.push(`side-effecting entry ${entry.id} requires a capability`)
    if (ids.has(entry.id)) problems.push(`duplicate entry id: ${entry.id}`)
    ids.add(entry.id)
    if (paths.has(entry.canonicalPath)) problems.push(`duplicate canonicalPath: ${entry.canonicalPath}`)
    paths.add(entry.canonicalPath)
    let canonical
    try { canonical = resolveRepo(root, entry.canonicalPath) } catch (error) { problems.push(error.message); continue }
    if (!existsSync(canonical) || !statSync(canonical).isFile()) {
      problems.push(`missing canonical path for ${entry.id}: ${entry.canonicalPath}`)
      continue
    }
    let actual
    try { actual = `git-blob-sha1:${gitHash(root, entry.canonicalPath)}` } catch (error) { problems.push(`could not hash ${entry.id}: ${error.message}`); continue }
    if (entry.checksum !== actual) problems.push(`checksum drift for ${entry.id}: expected ${entry.checksum}, actual ${actual} — if the edit was intended, record it with \`pnpm harness:manifest:fix\``)
    if (entry.kind !== 'repository-skill') continue
    const expectedCanonical = `${manifest.inventory.repositorySkillRoot}/${entry.id}/${manifest.inventory.repositorySkillEntryFile}`
    const expectedMirror = `${manifest.inventory.repositorySkillMirrorRoot}/${entry.id}/${manifest.inventory.repositorySkillEntryFile}`
    if (entry.canonicalPath !== expectedCanonical) problems.push(`repository skill ${entry.id} canonicalPath must be ${expectedCanonical}`)
    if (entry.mirroredPath !== expectedMirror) problems.push(`repository skill ${entry.id} mirroredPath must be ${expectedMirror}`)
    const canonicalBytes = readFileSync(canonical)
    const name = frontmatterName(canonicalBytes.toString('utf8'))
    if (name !== entry.id) problems.push(`skill frontmatter name drift for ${entry.id}: ${name ?? 'missing'}`)
    const mirror = resolveRepo(root, entry.mirroredPath)
    if (!existsSync(mirror) || !statSync(mirror).isFile()) problems.push(`missing mirrored path for ${entry.id}: ${entry.mirroredPath}`)
    else if (!canonicalBytes.equals(readFileSync(mirror))) problems.push(`skill mirror drift for ${entry.id}: ${entry.canonicalPath} != ${entry.mirroredPath}`)
  }
  compareSets(
    discover(root, manifest.inventory.repositorySkillRoot, (name) => name === manifest.inventory.repositorySkillEntryFile),
    skills.map((entry) => entry.canonicalPath).sort(),
    'canonical skill inventory',
    problems,
  )
  compareSets(
    discover(root, manifest.inventory.repositorySkillMirrorRoot, (name) => name === manifest.inventory.repositorySkillEntryFile),
    skills.map((entry) => entry.mirroredPath).sort(),
    'mirrored skill inventory',
    problems,
  )
  compareSets(
    manifest.inventory.runtimeToolRoots.flatMap((path) => discover(root, path, (name) => EXTENSIONS.has(extname(name)))).sort(),
    runtime.map((entry) => entry.canonicalPath).sort(),
    'runtime tool inventory',
    problems,
  )
}

function checkRouters(root, manifest, problems) {
  const counts = Object.fromEntries(['everyday', 'design'].map((group) => [group, manifest.entries.filter((entry) => entry.kind === 'repository-skill' && entry.group === group).length]))
  const total = counts.everyday + counts.design
  const paths = manifest.routers.map((router) => router.path)
  if (!unique(paths)) problems.push('router paths must be unique')
  for (const router of manifest.routers) {
    const path = resolveRepo(root, router.path)
    if (!existsSync(path)) {
      problems.push(`missing router: ${router.path}`)
      continue
    }
    const text = readFileSync(path, 'utf8')
    if (router.mode === 'skill-count-pointer') {
      const match = /Two groups,\s*(\d+)\s*total:\s*\*\*Everyday \((\d+)\)\*\*\s*and\s*\*\*Design \((\d+)\)\*\*/.exec(text)
      if (!match) problems.push(`router ${router.path} is missing the skill-count pointer contract`)
      else for (const [index, expected] of [total, counts.everyday, counts.design].entries()) {
        if (Number(match[index + 1]) !== expected) problems.push(`router ${router.path} ${['total', 'everyday', 'design'][index]} drift: declared ${match[index + 1]}, manifest ${expected}`)
      }
      continue
    }
    const totalMatch = /Two groups,\s*(\d+)\s*total\./.exec(text)
    if (!totalMatch) problems.push(`router ${router.path} is missing total skill count`)
    else if (Number(totalMatch[1]) !== total) problems.push(`router ${router.path} total drift: declared ${totalMatch[1]}, manifest ${total}`)
    for (const [label, group] of [['Everyday', 'everyday'], ['Design', 'design']]) {
      const expectedIds = manifest.entries.filter((entry) => entry.kind === 'repository-skill' && entry.group === group).map((entry) => entry.id)
      const heading = new RegExp(`\\*\\*${label} \\((\\d+)\\)\\.\\*\\*`).exec(text)
      if (!heading) {
        problems.push(`router ${router.path} is missing the ${label} skill heading`)
        continue
      }
      const block = /```text\s*\r?\n([\s\S]*?)```/.exec(text.slice(heading.index + heading[0].length))
      if (!block) problems.push(`router ${router.path} is missing the ${label} skill code block`)
      if (Number(heading[1]) !== expectedIds.length) problems.push(`router ${router.path} ${label} count drift: declared ${heading[1]}, manifest ${expectedIds.length}`)
      compareSets([...(block?.[1].match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) ?? [])], expectedIds, `router ${router.path} ${label} list`, problems)
    }
  }
}

function checkOrdering(manifest, problems) {
  const actual = manifest.entries.map((entry) => `${GROUP_ORDER[entry.group] ?? 99}:${entry.id}`)
  const expected = [...actual].sort((left, right) => {
    const [leftGroup, leftId] = left.split(':')
    const [rightGroup, rightId] = right.split(':')
    return Number(leftGroup) === Number(rightGroup) ? leftId.localeCompare(rightId) : Number(leftGroup) - Number(rightGroup)
  })
  if (actual.join('\n') !== expected.join('\n')) problems.push('manifest entries must be ordered by group (everyday, design, runtime) and then id')
}

export function gitBlobSha1(buffer) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
}

export function canonicalizeJson(value) {
  if (Array.isArray(value)) return value.map(canonicalizeJson)
  if (!isObject(value)) return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalizeJson(value[key])]))
}

export function manifestSha256(manifest) {
  return createHash('sha256').update(`${JSON.stringify(canonicalizeJson(manifest))}\n`).digest('hex')
}

export function validateManifestShape(manifest, schema) {
  const problems = []
  if (!isObject(schema)) return ['manifest schema is not an object']
  if (schema.$schema !== 'https://json-schema.org/draft/2020-12/schema') problems.push('manifest schema must use draft 2020-12')
  problems.push(...validateJson(manifest, schema, schema, 'manifest'))
  return problems
}

export function checkHarnessManifest(options = {}) {
  const root = resolve(options.root ?? ROOT)
  const manifestPath = resolveRepo(root, options.manifestPath ?? MANIFEST)
  if (!existsSync(manifestPath)) return { ok: false, root, manifestPath, manifest: null, hash: null, problems: [`missing harness manifest: ${options.manifestPath ?? MANIFEST}`] }
  let manifest
  try { manifest = readJson(manifestPath) } catch (error) { return { ok: false, root, manifestPath, manifest: null, hash: null, problems: [`invalid manifest JSON: ${error.message}`] } }
  let schema
  try { schema = readJson(resolveRepo(dirname(manifestPath), manifest.$schema ?? './manifest.schema.json')) } catch (error) {
    return { ok: false, root, manifestPath, manifest, hash: manifestSha256(manifest), problems: [`invalid manifest schema: ${error.message}`] }
  }
  const problems = validateManifestShape(manifest, schema)
  if (!problems.length) {
    checkOrdering(manifest, problems)
    checkEntries(root, manifest, problems)
    checkRouters(root, manifest, problems)
  }
  return {
    ok: !problems.length,
    root,
    manifestPath,
    manifest,
    hash: manifestSha256(manifest),
    skillCount: manifest.entries.filter((entry) => entry.kind === 'repository-skill').length,
    runtimeToolCount: manifest.entries.filter((entry) => entry.kind === 'runtime-tool').length,
    providerAdapterCount: manifest.entries.filter((entry) => entry.kind === 'provider-adapter').length,
    runtimeEntryCount: manifest.entries.filter((entry) => ['runtime-tool', 'provider-adapter'].includes(entry.kind)).length,
    routerCount: manifest.routers.length,
    problems,
  }
}

function parseArgs(values) {
  const options = { json: false, write: false }
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === '--json') options.json = true
    else if (values[index] === '--write') options.write = true
    else if (values[index] === '--root') options.root = values[++index]
    else if (values[index] === '--manifest') options.manifestPath = values[++index]
    else throw new Error(`unknown argument: ${values[index]}`)
  }
  return options
}

// Editing a SKILL.md changes its blob hash, so the recorded checksum goes stale and the gate
// goes red on a change that was entirely intended. Hand-editing 40 hex characters inside a
// one-line-per-entry JSON file is the kind of chore that gets done wrong or skipped, so the
// bump gets a command.
//
// `--write` is deliberately narrow: it rewrites checksum fields and nothing else, and it
// REFUSES to write while any other problem is outstanding. A flag that could silence the rest
// of the gate would be a way to make drift disappear rather than a way to record an edit.
const CHECKSUM_DRIFT = /^checksum drift for (\S+): expected \S+, actual (git-blob-sha1:[0-9a-f]{40})/

export function recordChecksums(text, drifts) {
  const lines = text.split(/\r?\n/)
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  const applied = []
  for (const { id, actual } of drifts) {
    const index = lines.findIndex((line) => line.includes(`"id":"${id}"`))
    if (index === -1) throw new Error(`cannot record ${id}: no manifest line declares that id`)
    const current = /git-blob-sha1:[0-9a-f]{40}/.exec(lines[index])
    if (!current) throw new Error(`cannot record ${id}: its manifest line carries no git-blob-sha1 checksum`)
    lines[index] = lines[index].replace(current[0], actual)
    applied.push(`${id}: ${current[0]} -> ${actual}`)
  }
  return { text: lines.join(eol), applied }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  try {
    const options = parseArgs(process.argv.slice(2))
    let report = checkHarnessManifest(options)

    if (options.write && !report.ok) {
      const drifts = []
      const others = []
      for (const problem of report.problems) {
        const match = CHECKSUM_DRIFT.exec(problem)
        if (match) drifts.push({ id: match[1], actual: match[2] })
        else others.push(problem)
      }
      if (others.length) {
        console.error('refusing to write: --write records checksums only, and these are unresolved:')
        for (const problem of others) console.error(`  - ${problem}`)
        process.exitCode = 1
      } else if (!drifts.length) {
        console.error('nothing to record')
        process.exitCode = 1
      } else {
        const { text, applied } = recordChecksums(readFileSync(report.manifestPath, 'utf8'), drifts)
        writeFileSync(report.manifestPath, text)
        for (const line of applied) console.log(`recorded ${line}`)
        report = checkHarnessManifest(options)
      }
    }

    if (options.json) console.log(JSON.stringify({ ok: report.ok, manifest: repoPath(relative(report.root, report.manifestPath)), hash: report.hash ? `sha256:${report.hash}` : null, skillCount: report.skillCount ?? 0, runtimeToolCount: report.runtimeToolCount ?? 0, providerAdapterCount: report.providerAdapterCount ?? 0, runtimeEntryCount: report.runtimeEntryCount ?? 0, routerCount: report.routerCount ?? 0, problems: report.problems }, null, 2))
    else if (report.ok) console.log(`harness manifest ok: ${report.skillCount} repository skills, ${report.runtimeToolCount} runtime tools, ${report.providerAdapterCount} provider adapters, ${report.routerCount} routers; sha256:${report.hash}`)
    else {
      console.error('harness manifest semantic drift detected:')
      for (const problem of report.problems) console.error(`  - ${problem}`)
    }
    if (!report.ok) process.exitCode = 1
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
