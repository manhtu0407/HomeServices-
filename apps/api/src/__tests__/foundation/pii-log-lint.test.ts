/**
 * PII-log lint guardrail.
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

// Codex PR#68 P2: blank out '...' and "..." string-literal CONTENTS so a static log
// MESSAGE that merely mentions a field word (e.g. console.log('user phone updated'))
// is not a false positive — only real code tokens (object keys, shorthand, variables)
// are matched. Backtick templates are kept intact so an interpolated ${phone} is still
// scanned.
function stripStringLiterals(src: string): string {
  let out = ''
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (c === '"' || c === "'") {
      const q = c
      out += q
      i++
      while (i < src.length && src[i] !== q) {
        if (src[i] === '\\') i++
        i++
      }
      out += q
      i++
      continue
    }
    out += c
    i++
  }
  return out
}

// High-confidence PII / secret signals that must never be logged (RULES #9 + Security
// Invariants). Coarse fields (district, ids, counts, codes) are intentionally NOT here.
// Codex PR#68 P2: each field is matched as an IDENTIFIER — property key (`phone:`),
// object shorthand (`{ phone }` / `{ phone, x }`), or a bare argument
// (`console.error(phoneNumber)`) — via a lookahead for `:`, `,`, `}`, `)`, or end.
// The `\b...\b` guards prevent matching longer identifiers like `phoneVerified`.
const TAIL = String.raw`(?=\s*[:,})]|\s*$)`
const FORBIDDEN: { id: string; pattern: RegExp }[] = [
  { id: 'phone', pattern: new RegExp(String.raw`\bphone(?:_?number)?\b${TAIL}`, 'i') },
  { id: 'cccd', pattern: new RegExp(String.raw`\b(?:cccd|cmnd|id_card|national_id)\b${TAIL}`, 'i') },
  { id: 'bank_account', pattern: new RegExp(String.raw`\bbank_account\b${TAIL}`, 'i') },
  { id: 'password', pattern: new RegExp(String.raw`\bpassword\b${TAIL}`, 'i') },
  { id: 'api_key', pattern: new RegExp(String.raw`\bapi_?key\b${TAIL}`, 'i') },
  { id: 'secret_key', pattern: new RegExp(String.raw`\bsecret_?key\b${TAIL}`, 'i') },
  { id: 'service_role', pattern: new RegExp(String.raw`\bservice_role(?:_key)?\b${TAIL}`, 'i') },
  { id: 'tokens', pattern: new RegExp(String.raw`\b(?:access_token|refresh_token)\b${TAIL}`, 'i') },
  { id: 'address_unit', pattern: new RegExp(String.raw`\baddress_(?:unit|floor|building|full|line)\b${TAIL}`, 'i') },
  { id: 'env_secret', pattern: /process\.env\.\w*(?:KEY|TOKEN|SECRET)\w*/i },
  { id: 'provider_key', pattern: /\b(?:ANTHROPIC|PERPLEXITY|DEEPSEEK)_API_KEY\b/ },
  { id: 'runtime_error_message', pattern: /\b(?:error|err)\.message\b/i },
  { id: 'raw_error_object', pattern: /\{\s*(?:error|err)\s*(?:[,}])/i },
]

// Returns violation labels for every console.* call in `src` that references a
// forbidden PII/secret identifier (after string-literal stripping).
function findPiiLogViolations(src: string, label = ''): string[] {
  const out: string[] = []
  if (!src.includes('console.')) return out
  for (const rawArgs of consoleCallArgs(src)) {
    const args = stripStringLiterals(rawArgs)
    for (const rule of FORBIDDEN) {
      if (rule.pattern.test(args)) {
        out.push(`${label} → ${rule.id}: console.*(… ${rawArgs.trim().slice(0, 80)} …)`)
      }
    }
  }
  return out
}

describe('S5 PII-log lint: no PII/secret fields in console.* calls (RULES #9)', () => {
  const files: string[] = []
  for (const root of SCAN_ROOTS) collect(resolve(ROOT, root), files)

  it('scans a non-trivial number of runtime files (guards against an empty scan)', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  // Bite test (Codex PR#68 P2): prove the guardrail catches the shapes that the
  // colon-only matcher missed, and does NOT false-positive on safe lines.
  it('bites on shorthand + bare-identifier PII shapes, not on safe lines', () => {
    expect(findPiiLogViolations(`console.warn('x', { phone })`, 'f')).not.toEqual([])
    expect(findPiiLogViolations(`console.error(phoneNumber)`, 'f')).not.toEqual([])
    expect(findPiiLogViolations(`console.log('user', { cccd, name })`, 'f')).not.toEqual([])
    expect(findPiiLogViolations('console.log(`addr ${address_unit}`)', 'f')).not.toEqual([])
    expect(findPiiLogViolations(`console.warn('provider failed', { reason: error.message })`, 'f')).not.toEqual([])
    expect(findPiiLogViolations(`console.error('provider failed', { err })`, 'f')).not.toEqual([])
    // Safe: message text mentioning a field word, coarse metadata, and lookalike ids.
    expect(findPiiLogViolations(`console.log('user phone updated')`, 'f')).toEqual([])
    expect(findPiiLogViolations(`console.warn('x', { phoneVerified: true, district })`, 'f')).toEqual([])
    expect(findPiiLogViolations(`console.info('x', { bookingId, serviceType })`, 'f')).toEqual([])
  })

  it('finds no PII/secret field references inside console.* calls', () => {
    const violations: string[] = []
    for (const file of files) {
      violations.push(...findPiiLogViolations(readFileSync(file, 'utf-8'), file.replace(ROOT, '')))
    }
    expect(
      violations,
      `PII/secret field(s) logged via console.* (RULES #9). Use ids/codes/safe metadata ` +
        `only, or scrub before logging:\n  ${violations.join('\n  ')}`,
    ).toEqual([])
  })
})
