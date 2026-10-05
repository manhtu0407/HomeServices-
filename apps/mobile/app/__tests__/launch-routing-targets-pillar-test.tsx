import fs from 'fs'
import path from 'path'

import { withPillarContext, type PillarManifest } from '@/__tests__/pillar-manifest'

export const PILLAR = {
  id: 'P304-launch-routing-targets',
  invariant:
    'every literal router.replace/push/Redirect target in the app resolves to a route file under apps/mobile/app',
  authority: [
    'governance/protocols/frontend-test.md (gates type-check:mobile, test:mobile)',
    'docs/architecture/code-ownership-map.md (Auth And Role Gate)',
  ],
  target: 'apps/mobile/app',
  layer: 'static-type',
  siblings: ['P305-launch-cold-redirects'],
  mutation:
    'rename app/(worker)/(tabs)/home.tsx — the worker sign-in target goes unresolved and this fails',
} as const satisfies PillarManifest

const MOBILE_ROOT = path.resolve(__dirname, '..', '..')
const APP_DIR = path.join(MOBILE_ROOT, 'app')
const SCAN_DIRS = ['app', 'components', 'lib']
const ROUTE_EXT = /\.(tsx|ts|jsx|js)$/
// Quoted literals, object `pathname` values, and the static part of template literals
// (everything before the first `?` or `${`).
const TARGET_PATTERNS = [
  /(?:router\.(?:replace|push)\(\s*|<Redirect\s+href=)(?:\{?\s*)?['"](\/[^'"`$]*)['"]/g,
  /pathname:\s*['"](\/[^'"`$]*)['"]/g,
  /(?:router\.(?:replace|push)\(\s*|<Redirect\s+href=\{?\s*)`(\/[^`$?]*)/g,
]

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__tests__') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (ROUTE_EXT.test(entry.name)) out.push(full)
  }
  return out
}

function isGroup(segment: string) {
  return segment.startsWith('(') && segment.endsWith(')')
}

function knownRoutes() {
  return walk(APP_DIR)
    .map((file) => path.relative(APP_DIR, file).replace(ROUTE_EXT, '').split(path.sep))
    .filter((segments) => !segments[segments.length - 1].startsWith('_'))
    .map((segments) => (segments[segments.length - 1] === 'index' ? segments.slice(0, -1) : segments))
}

// Groups are omittable in a target (`/(customer)/home` reaches `(customer)/(tabs)/home`),
// but a group the target names must exist, so `/(worker)/home` cannot match the customer tab.
function matches(route: string[], target: string[]) {
  let next = 0
  for (const segment of route) {
    if (target[next] === segment || (/^\[.+\]$/.test(segment) && next < target.length)) next += 1
    else if (!isGroup(segment)) return false
  }
  return next === target.length
}

function collectTargets() {
  const found: { target: string; file: string }[] = []
  for (const dir of SCAN_DIRS) {
    for (const file of walk(path.join(MOBILE_ROOT, dir))) {
      const source = fs.readFileSync(file, 'utf8')
      for (const pattern of TARGET_PATTERNS) {
        for (const match of source.matchAll(pattern)) {
          found.push({ target: match[1], file: path.relative(MOBILE_ROOT, file) })
        }
      }
    }
  }
  return found
}

describe('launch routing targets', () => {
  it('finds the sign-in redirect targets it is meant to guard', () => {
    const targets = new Set(collectTargets().map((entry) => entry.target))
    withPillarContext(PILLAR, () => {
      expect(targets.has('/(worker)/(tabs)/home')).toBe(true)
      expect(targets.has('/(customer)/home')).toBe(true)
      expect(targets.has('/(admin)/sections')).toBe(true)
      expect(targets.has('/(auth)/login')).toBe(true)
    })
  })

  it('resolves every literal redirect target to a route file', () => {
    const routes = knownRoutes()
    const unresolved = collectTargets()
      .filter(({ target }) => {
        const pathname = target.split('?')[0].split('#')[0]
        const segments = pathname.split('/').filter(Boolean)
        return !routes.some((route) => matches(route, segments))
      })
      .map(({ target, file }) => `${target}  (in ${file})`)

    withPillarContext(
      PILLAR,
      () => expect(unresolved).toEqual([]),
      'a redirect points at a path with no file under apps/mobile/app',
    )
  })
})
