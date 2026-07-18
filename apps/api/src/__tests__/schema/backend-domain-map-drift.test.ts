/**
 * D3 domain-map drift guard (§44.4 D3).
 *
 * Every public table and view must have exactly one domain in
 * docs/architecture/backend-domain-map.md. This test reads that map and the committed
 * generated types (packages/shared/src/types/database.types.ts) — no database — so it runs
 * in CI. It fails if any object is unclassified, missing from the DB, or listed under two
 * domains. That is the D3 gate: a new object cannot reach production without a human
 * assigning it a domain.
 *
 * Unlike the D4 column-drift test, this one hits no DB and is not env-gated: the committed
 * types are the source of truth, and CI running it green IS the evidence.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const REPO_ROOT = resolve(__dirname, '../../../../../')
const read = (rel: string) => readFileSync(resolve(REPO_ROOT, rel), 'utf-8')

// --- object universe from the committed generated types (public Tables + Views) ---
function committedObjects(): string[] {
  const lines = read('packages/shared/src/types/database.types.ts').split('\n')
  const pub = lines.findIndex((l) => /^ {2}public: \{/.test(l))
  const tIdx = lines.findIndex((l, i) => i > pub && /^ {4}Tables: \{/.test(l))
  const vIdx = lines.findIndex((l, i) => i > tIdx && /^ {4}Views: \{/.test(l))
  const fIdx = lines.findIndex((l, i) => i > vIdx && /^ {4}Functions: \{/.test(l))
  const keysIn = (a: number, b: number) => {
    const out: string[] = []
    for (let i = a; i < b; i++) {
      const m = lines[i].match(/^ {6}([a-z_][a-z0-9_]*): \{/)
      if (m) out.push(m[1])
    }
    return out
  }
  return [...keysIn(tIdx + 1, vIdx), ...keysIn(vIdx + 1, fIdx)]
}

// --- object -> domain(s) from the map's generated block ---
// Anchored on the HTML-comment markers (`<!-- BEGIN`/`<!-- END`), not the bare phrase, which
// also appears in the doc's prose describing how the markers work.
function mappedObjects(): Map<string, string[]> {
  const md = read('docs/architecture/backend-domain-map.md')
  const begin = md.indexOf('<!-- BEGIN generated:table-domain-map')
  const end = md.indexOf('<!-- END generated:table-domain-map')
  if (begin < 0 || end <= begin) {
    throw new Error(`domain map markers not found or out of order (begin=${begin}, end=${end})`)
  }
  const block = md.slice(begin, end).split('\n')
  const homes = new Map<string, string[]>()
  let domain: string | null = null
  for (const line of block) {
    const h = line.match(/^### (.+)$/)
    if (h) { domain = h[1].trim(); continue }
    const b = line.match(/^- `([a-z_][a-z0-9_]*)`$/)
    if (b && domain) {
      const name = b[1]
      homes.set(name, [...(homes.get(name) ?? []), domain])
    }
  }
  return homes
}

describe('D3 — backend domain map covers every public object exactly once', () => {
  const objects = committedObjects()
  const homes = mappedObjects()

  it('the committed types expose a non-trivial object set', () => {
    // guards against a parser that silently returns nothing and makes every check vacuous
    expect(objects.length).toBeGreaterThan(80)
  })

  it('every object in the map has exactly one domain', () => {
    const multi = [...homes.entries()].filter(([, ds]) => ds.length !== 1).map(([n, ds]) => `${n} -> ${ds.join(', ')}`)
    expect(multi).toEqual([])
  })

  it('every committed object is classified (no unclassified object)', () => {
    const missing = objects.filter((o) => !homes.has(o)).sort()
    expect(missing).toEqual([])
  })

  it('every mapped object still exists in the DB types (no stale entry)', () => {
    const set = new Set(objects)
    const stale = [...homes.keys()].filter((o) => !set.has(o)).sort()
    expect(stale).toEqual([])
  })
})
