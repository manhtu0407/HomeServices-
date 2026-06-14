/**
 * S5 (Plan.md §38 security hardening) — PII-log lint guardrail.
 *
 * RULES.md #9: "Logging Must Not Expose PII Or Secrets." The audit confirmed current
 * runtime logs carry only IDs / error codes / safe metadata. This lint keeps it that
 * way: it scans runtime source for `console.*` calls whose arguments reference a
 * high-confidence PII / secret field, and fails loud if any appears. It complements
 * the gitleaks CI job (committed secrets) by catching PII/secret values headed to logs.
 *
 * Conservative by design (high-confidence keys only) so it never false-positives on
 * the allowed safe fields (ids, codes, counts, coarse district — RULES #9).
 */
import { describe, expect, it } from 'vitest'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, resolve } from 'node:path'

const ROOT = resolve(__dirname, '../../../../..')

// Runtime code that can emit server/client logs. Tests + generated types excluded.
const SCAN_ROOTS = [
  'supabase/functions',
  'apps/api/src',
  'apps/mobile',
]

const TEXT_EXT = new Set(['.ts', '.tsx', '.mjs', '.js'])

function isExcluded(path: string): boolean {
  return (
    path.includes('node_modules') ||
    path.includes('__tests__') ||
    path.endsWith('.test.ts') ||
    path.endsWith('.test.tsx') ||
    path.endsWith('database.types.ts')
  )
}

function collect(path: string, out: string[]) {
  if (!existsSync(path) || isExcluded(path)) return
  const stat = statSync(path)
  if (stat.isFile()) {
    if (TEXT_EXT.has(extname(path))) out.push(path)
    return
  }
  for (const entry of readdirSync(path)) collect(resolve(path, entry), out)
}

// Extract the argument text of every console.<level>(...) call with balanced parens
// and basic string-skipping (so a ')' inside a string/nested call is not mistaken
// for the call's end).
function consoleCallArgs(src: string): string[] {
  const calls: string[] = []
  const re = /console\.(?:log|info|warn|error|debug)\s*\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    let i = m.index + m[0].length
    const start = i
    let depth = 1
    while (i < src.length && depth > 0) {
      const c = src[i]
      if (c === '"' || c === "'" || c === '`') {
        const q = c
        i++
        while (i < src.length && src[i] !== q) {
          if (src[i] === '\\') i++
          i++
        }
      } else if (c === '(') depth++
      else if (c === ')') depth--
      i++
    }
    calls.push(src.slice(start, i - 1))
  }
  return calls
}

// High-confidence PII / secret signals that must never be logged (RULES #9 + Security
// Invariants). Coarse fields (district, ids, counts, codes) are intentionally NOT here.
const FORBIDDEN: { id: string; pattern: RegExp }[] = [
  { id: 'phone', pattern: /\bphone(_number)?\b\s*:/i },
  { id: 'cccd', pattern: /\b(cccd|id_card|national_id)\b\s*:/i },
  { id: 'bank_account', pattern: /\bbank_account\b/i },
  { id: 'password', pattern: /\bpassword\b\s*:/i },
  { id: 'api_key', pattern: /\bapi[_]?key\b\s*:/i },
  { id: 'secret_key', pattern: /\bsecret[_]?key\b\s*:/i },
  { id: 'service_role', pattern: /\bservice_role(_key)?\b\s*:/i },
  { id: 'tokens', pattern: /\b(access_token|refresh_token)\b\s*:/i },
  { id: 'address_unit', pattern: /\baddress_(unit|floor|building|full|line)\b\s*:/i },
  { id: 'env_secret', pattern: /process\.env\.\w*(KEY|TOKEN|SECRET)\w*/i },
  { id: 'provider_key', pattern: /\b(ANTHROPIC|PERPLEXITY|DEEPSEEK)_API_KEY\b/ },
]

describe('S5 PII-log lint: no PII/secret fields in console.* calls (RULES #9)', () => {
  const files: string[] = []
  for (const root of SCAN_ROOTS) collect(resolve(ROOT, root), files)

  it('scans a non-trivial number of runtime files (guards against an empty scan)', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it('finds no PII/secret field references inside console.* calls', () => {
    const violations: string[] = []
    for (const file of files) {
      const src = readFileSync(file, 'utf-8')
      if (!src.includes('console.')) continue
      for (const args of consoleCallArgs(src)) {
        for (const rule of FORBIDDEN) {
          if (rule.pattern.test(args)) {
            violations.push(`${file.replace(ROOT, '')} → ${rule.id}: console.*(… ${args.trim().slice(0, 80)} …)`)
          }
        }
      }
    }
    expect(
      violations,
      `PII/secret field(s) logged via console.* (RULES #9). Use ids/codes/safe metadata ` +
        `only, or scrub before logging:\n  ${violations.join('\n  ')}`,
    ).toEqual([])
  })
})
