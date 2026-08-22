// Collection ratchet for CI test steps. A workflow step may name a test path or filter
// only if the owning package's runner actually collects it.
//
// The defect this catches is a step that reports success having run nothing. Every package
// narrows collection to its pillar suite and sets `passWithNoTests`, so a positional filter
// naming a non-pillar file intersects to the empty set and vitest exits 0 with
// "No test files found". Three steps were measured in that state — two collecting nothing at
// all, one collecting a single file of the seventeen paths it named. The measurement is in
// docs/test-logs/2026-08-20_uncollected-sweep.md and the per-invariant decisions in
// docs/audit/test-collection-analysis-20260820.md.
//
// Deleting those lists once does not stop the next one being added, which is why this is a
// gate. Narrowing collection stays a legitimate decision — governance/protocols/test-pillars.md
// owns it. Claiming to run what collection excludes does not.
//
//   node scripts/check-test-collection.mjs
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WORKFLOWS = resolve(root, '.github/workflows')
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.expo', '.turbo', 'ios', 'android'])

// Package name → where its sources live and which config declares collection.
const PACKAGES = {
  '@nestscout/api': { dir: 'apps/api', runner: 'vitest', config: 'apps/api/vitest.config.mts' },
  '@nestscout/shared': { dir: 'packages/shared', runner: 'vitest', config: 'packages/shared/vitest.config.mts' },
  '@nestscout/mobile': { dir: 'apps/mobile', runner: 'jest', config: 'apps/mobile/jest.config.js' },
}

// A temporary gap is honest only when the step also passes `--passWithNoTests=false`, so the
// run fails instead of reporting success. Adding an entry requires a named exit condition.
const DECLARED_GAPS = []

const problems = []
const declaredGaps = []

function walk(dir, acc = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return acc
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, acc)
    else acc.push(full)
  }
  return acc
}

/** A vitest `include` glob as a regex. Only the subset those configs use: `**` , `*`, and literals. */
function globToRegExp(glob) {
  let out = ''
  for (let i = 0; i < glob.length; i++) {
    const char = glob[i]
    if (char === '*' && glob[i + 1] === '*' && glob[i + 2] === '/') {
      out += '(?:[^/]+/)*'
      i += 2
      continue
    }
    if (char === '*') {
      out += '[^/]*'
      continue
    }
    out += /[.+?^${}()|[\]\\]/.test(char) ? `\\${char}` : char
  }
  return new RegExp(`^${out}$`)
}

/** The test files one package's runner would collect, as paths relative to that package. */
function collectedFiles(pkg) {
  const configPath = resolve(root, pkg.config)
  if (!existsSync(configPath)) {
    problems.push(`missing runner config: ${pkg.config}`)
    return []
  }
  const config = readFileSync(configPath, 'utf8')
  const files = walk(resolve(root, pkg.dir)).map((file) => relative(resolve(root, pkg.dir), file).split('\\').join('/'))

  if (pkg.runner === 'jest') {
    const match = config.match(/testRegex:\s*'([^']+)'/)
    if (!match) {
      problems.push(`${pkg.config}: no testRegex to read; collection cannot be proven`)
      return []
    }
    const regex = new RegExp(match[1].replace(/\\\\/g, '\\'))
    return files.filter((file) => regex.test(file))
  }

  const block = config.match(/include:\s*\[([\s\S]*?)\]/)
  if (!block) {
    problems.push(`${pkg.config}: no include list to read; collection cannot be proven`)
    return []
  }
  const globs = [...block[1].matchAll(/'([^']+)'/g)].map((match) => globToRegExp(match[1]))
  return files.filter((file) => globs.some((glob) => glob.test(file)))
}

/**
 * Every `vitest run` / `jest` invocation in a workflow, one entry per shell command.
 *
 * YAML folds a `>` block into a single command and keeps the newlines in a `|` block, where
 * each line is its own command unless the previous one ends in a backslash. Getting that
 * wrong reads two commands as one and checks the second command's filters against the first
 * command's package.
 */
function invocations(workflowPath) {
  const lines = readFileSync(workflowPath, 'utf8').split(/\r?\n/)
  const found = []
  let stepName = '(unnamed step)'

  for (let i = 0; i < lines.length; i++) {
    const nameMatch = lines[i].match(/^\s*-?\s*name:\s*(.+?)\s*$/)
    if (nameMatch) stepName = nameMatch[1]

    const runMatch = lines[i].match(/^(\s*)-?\s*run:\s*(.*)$/)
    if (!runMatch) continue

    const indent = runMatch[1].length
    const value = runMatch[2].trim()
    const indicator = /^[>|][-+]?$/.test(value) ? value[0] : ''
    const body = indicator ? [] : [value]
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j]
      if (line.trim() === '') continue
      if (line.length - line.trimStart().length <= indent) break
      body.push(line.trim())
    }

    const commands = []
    if (indicator === '|') {
      let current = ''
      for (const line of body) {
        const continued = line.endsWith('\\')
        current += `${continued ? line.slice(0, -1).trim() : line} `
        if (!continued) {
          commands.push(current.trim())
          current = ''
        }
      }
      if (current.trim()) commands.push(current.trim())
    } else {
      commands.push(body.join(' ').trim())
    }

    for (const command of commands) {
      if (/\b(vitest run|exec jest|pnpm jest)\b/.test(command)) found.push({ stepName, command })
    }
  }
  return found
}

/** Positional test filters in one command: everything after the runner that is not a flag or a flag value. */
function positionalFilters(command) {
  const tokens = command.split(/\s+/).filter(Boolean)
  const start = tokens.findIndex((token, index) =>
    (token === 'vitest' && tokens[index + 1] === 'run') || token === 'jest')
  if (start === -1) return []
  const after = tokens[start] === 'jest' ? tokens.slice(start + 1) : tokens.slice(start + 2)
  const filters = []
  for (let i = 0; i < after.length; i++) {
    const token = after[i]
    if (token.startsWith('-')) {
      // --config <path> and friends consume the next token.
      if (!token.includes('=') && after[i + 1] && !after[i + 1].startsWith('-')) i++
      continue
    }
    if (token.includes('$') || token.includes('&&') || token === '|') continue
    filters.push(token)
  }
  return filters
}

const collectedByPackage = new Map()
for (const [name, pkg] of Object.entries(PACKAGES)) collectedByPackage.set(name, collectedFiles(pkg))

const workflows = existsSync(WORKFLOWS)
  ? readdirSync(WORKFLOWS).filter((file) => file.endsWith('.yml') || file.endsWith('.yaml'))
  : []
if (workflows.length === 0) problems.push('no workflows found under .github/workflows')

let checked = 0
for (const workflow of workflows) {
  for (const { stepName, command } of invocations(resolve(WORKFLOWS, workflow))) {
    const packageMatch = command.match(/--filter\s+(@nestscout\/[a-z]+)/)
    if (!packageMatch || !PACKAGES[packageMatch[1]]) continue
    const collected = collectedByPackage.get(packageMatch[1]) ?? []
    const failsOnEmpty = /--passWithNoTests[= ]false/.test(command)

    for (const filter of positionalFilters(command)) {
      checked++
      if (collected.some((file) => file.includes(filter))) continue

      const declared = DECLARED_GAPS.find((gap) => gap.step === stepName && gap.filter === filter)
      if (declared && failsOnEmpty) {
        declaredGaps.push(`${workflow} → ${stepName}: \`${filter}\` collects nothing; cleared by ${declared.clearedBy}`)
        continue
      }
      if (declared) {
        problems.push(
          `${workflow} → ${stepName}: \`${filter}\` is a declared gap but the step omits ` +
          '`--passWithNoTests=false`, so it would report success having run nothing',
        )
        continue
      }
      problems.push(
        `${workflow} → ${stepName}: names \`${filter}\`, which ${packageMatch[1]} collects no file for — ` +
        `the step passes having run nothing (see ${PACKAGES[packageMatch[1]].config})`,
      )
    }
  }
}

if (problems.length) {
  console.error('test collection problems:')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

for (const gap of declaredGaps) console.log(`declared gap: ${gap}`)
console.log(
  `test collection ok: ${checked} CI-named test filter(s) checked, ` +
  `${checked - declaredGaps.length} resolve to collected files, ${declaredGaps.length} declared`,
)
