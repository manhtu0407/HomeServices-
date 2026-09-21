#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const CATEGORY_KEYS = [
  'frontend',
  'backend',
  'shared',
  'database',
  'harness',
  'sandbox',
  'security',
  'integration',
  'kael',
  'workspace',
  'workspace_full',
  'runtime',
]

const ROOT_MANIFESTS = new Set([
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'turbo.json',
  'config/turbo/turbo.json',
])

function normalizePath(value) {
  return String(value).replaceAll('\\', '/').replace(/^\.\//u, '')
}

function startsWithAny(path, prefixes) {
  return prefixes.some((prefix) => path.startsWith(prefix))
}

function matchesAny(path, patterns) {
  return patterns.some((pattern) => pattern.test(path))
}

function isDocumentationPath(path) {
  return path.startsWith('docs/') || /^[^/]+\.md$/u.test(path)
}

const AUTHORING_PREFIXES = ['governance/', '.claude/skills/', '.claude/commands/', '.agents/skills/']

// Rules, skills, commands, and session memory are proven by the ratchets that always run
// (skills sync, protocol routes, pillar registry, manifest) and are compiled or tested by
// nothing. Hooks, settings, and launch config stay outside this set because tests read them.
function isAuthoringPath(path) {
  return path === '.claude/MEMORY.md' || startsWithAny(path, AUTHORING_PREFIXES)
}

function classifyClaimedPaths(paths) {
  const frontend = paths.some((path) => path.startsWith('apps/mobile/'))
  const backend = paths.some((path) => startsWithAny(path, ['apps/api/', 'supabase/functions/']))
  const shared = paths.some((path) => path.startsWith('packages/shared/'))
  const database = paths.some((path) =>
    startsWithAny(path, [
      'supabase/migrations/',
      'supabase/tests/',
      'packages/shared/src/types/database/',
      'docker/',
    ]) || [
      'supabase/config.toml',
      'supabase/seed.sql',
      'config/harness/migration-inventory.json',
      'config/harness/migration-baseline.json',
      'scripts/split-database-types.mjs',
    ].includes(path),
  )
  const harness = paths.some((path) =>
    startsWithAny(path, [
      '.github/workflows/',
      '.claude/',
      '.agents/',
      'config/harness/',
      'scripts/harness/',
      'docker/',
    ]) || ROOT_MANIFESTS.has(path) || /^scripts\/(?:check|lint)-[^/]+\.mjs$/u.test(path),
  )
  const sandbox = paths.some((path) => path.startsWith('sandbox/'))
  const securitySensitive = paths.some((path) =>
    startsWithAny(path, [
      'config/security/',
      'apps/mobile/components/auth/',
      'apps/mobile/lib/auth/',
      'apps/api/src/__tests__/security/',
    ]) || matchesAny(path, [
      /(?:^|\/)auth(?:entication|orization)?(?:\/|\.|-)/iu,
      /(?:^|\/)(?:security|secrets?)(?:\/|\.|-)/iu,
    ]),
  )

  const security = securitySensitive || backend || shared || database || harness
  const integration = backend || shared || database || harness
  const kael = harness || paths.some((path) =>
    /kael/iu.test(path) || startsWithAny(path, [
      'apps/mobile/components/kael/',
      'apps/mobile/lib/kael/',
      'apps/api/scripts/kael-',
      'packages/shared/kael/',
      'supabase/functions/kael-',
      'supabase/functions/mobile-api/_shared/kael/',
    ]),
  )
  const workspace = frontend || backend || shared || database || harness || sandbox
  const primaryWorkspaceKinds = [frontend, backend, sandbox].filter(Boolean).length
  const workspaceFull = shared || database || harness || primaryWorkspaceKinds > 1

  return {
    frontend,
    backend,
    shared,
    database,
    harness,
    sandbox,
    security,
    integration,
    kael,
    workspace,
    workspace_full: workspaceFull,
    runtime: backend || shared || database || harness,
  }
}

export function classifyChangedPaths(inputPaths) {
  const paths = [...new Set((inputPaths ?? []).map(normalizePath).filter(Boolean))]
  const laned = paths.filter((path) => !isDocumentationPath(path) && !isAuthoringPath(path))
  // A gate may be skipped only for paths some lane explicitly owns; anything else runs every lane.
  const unclaimed = laned.some((path) => !Object.values(classifyClaimedPaths([path])).some(Boolean))
  return unclaimed ? allCategories() : classifyClaimedPaths(laned)
}

export function allCategories(value = true) {
  return Object.fromEntries(CATEGORY_KEYS.map((key) => [key, value]))
}

export function changedPathsArgs({ base, head }) {
  if (!head) throw new Error('CI change classification requires a head SHA')
  // Without --no-renames a move out of a lane lists only its destination, hiding the source lane.
  // diff-tree prints nothing for a merge commit unless told which parent to compare against, and
  // an empty list would read as "nothing changed" and skip every lane.
  return base && !/^0+$/u.test(base)
    ? ['diff', '--name-only', '--no-renames', base, head]
    : ['diff-tree', '--root', '--no-commit-id', '--name-only', '--no-renames', '-m', '--first-parent', '-r', head]
}

function gitChangedPaths({ base, head }) {
  return execFileSync('git', changedPathsArgs({ base, head }), { encoding: 'utf8' })
    .split(/\r?\n/u)
    .filter(Boolean)
}

export function classifyEvent({ event, base, head, paths } = {}) {
  if (event !== 'pull_request' && event !== 'push') return allCategories()
  return classifyChangedPaths(paths ?? gitChangedPaths({ base, head }))
}

function main() {
  const output = process.env.GITHUB_OUTPUT
  if (!output) throw new Error('GITHUB_OUTPUT is required for CI change classification')

  const result = classifyEvent({
    event: process.env.CI_EVENT,
    base: process.env.CI_BASE_SHA,
    head: process.env.CI_HEAD_SHA,
  })
  for (const key of CATEGORY_KEYS) appendFileSync(output, `${key}=${result[key] ? 'true' : 'false'}\n`)
  console.log(JSON.stringify(result))
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main()
