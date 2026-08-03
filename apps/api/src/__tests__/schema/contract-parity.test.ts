import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The Deno Edge cannot import packages/shared (code-ownership-map.md C3), so the request
// contracts are hand-written twins: the same schema names declared once for each runtime.
// There is no codegen between them. This comparator is the only thing standing between a
// deliberate contract change and a silent one-sided edit.
const ROOT = join(__dirname, '../../../../..')
const CONTRACT_PAIRS = [
  {
    name: 'common',
    edge: 'supabase/functions/_shared/contracts/common.ts',
    shared: 'packages/shared/src/contracts/common.ts',
    schemas: ['serviceTypeSchema'],
  },
  {
    name: 'job',
    edge: 'supabase/functions/_shared/contracts/job.ts',
    shared: 'packages/shared/src/contracts/job.ts',
    schemas: [
      'apartmentAccessProfileSchema',
      'jobCreateSchema',
      'jobMessageSendSchema',
      'placesAutocompleteSchema',
      'placesResolveSchema',
    ],
  },
  {
    name: 'kael-chat',
    edge: 'supabase/functions/_shared/contracts/kael-chat.ts',
    shared: 'packages/shared/src/contracts/kael-chat.ts',
    schemas: [
      'kaelAssistantSchema',
      'kaelChatCreateSchema',
      'kaelChatEvidenceSchema',
      'kaelChatIntakeConfirmationDecisionSchema',
      'kaelChatProgressSchema',
      'kaelChatTurnSchema',
      'kaelWorkerClarifySchema',
    ],
  },
  {
    name: 'worker',
    edge: 'supabase/functions/_shared/contracts/worker.ts',
    shared: 'packages/shared/src/contracts/worker.ts',
    schemas: [
      'availabilityToggleSchema',
      'WORKER_AVATAR_MAX_BYTES',
      'WORKER_KAEL_MEMORY_PREFERENCE_KEYS',
      'workerApplicationSubmitSchema',
      'workerAvatarUpdateSchema',
      'workerAvatarUploadSchema',
      'workerKaelChatCreateSchema',
      'workerKaelChatModeSchema',
      'workerKaelChatPinSchema',
      'workerKaelChatRenameSchema',
      'workerKaelChatTurnSchema',
      'workerKaelFeedbackSchema',
      'workerKaelMemoryPreferenceUpdateSchema',
      'workerKaelTrainingConsentSchema',
      'workerRegisterSchema',
      'workerScopeChangeSchema',
      'workerServiceAreaUpdateSchema',
      'workerServicePreferencesUpdateSchema',
    ],
  },
  {
    name: 'customer',
    edge: 'supabase/functions/_shared/contracts/customer.ts',
    shared: 'packages/shared/src/contracts/customer.ts',
    schemas: [
      'CUSTOMER_AVATAR_MAX_BYTES',
      'customerAvatarUpdateSchema',
      'customerAvatarUploadSchema',
      'customerScopeDecisionSchema',
      'devicePushTokenSchema',
      'devicePushTokenUnregisterSchema',
    ],
  },
  {
    name: 'payment',
    edge: 'supabase/functions/_shared/contracts/payment.ts',
    shared: 'packages/shared/src/contracts/payment.ts',
    schemas: ['reviewSchema'],
  },
] as const

// P1 measured exactly 38 public schemas shared by the Edge and workspace contracts. A
// pair is intentionally exact rather than a floor so a schema cannot silently move or
// disappear from one twin while a different schema happens to replace the count.
const EXPECTED_COMMON_SCHEMA_COUNT = 38

// These helpers let contract modules share validation primitives, but their names were
// never part of the two public facade surfaces measured in P1. The barrel deliberately
// does not re-export them, so they must not inflate the twin-contract baseline.
const INTERNAL_COMMON_EXPORTS = new Set(['clientRequestIdSchema', 'uuidPathPattern'])

// Differences that exist today. Each entry states why the pair is still considered one
// contract; anything not listed here must be identical after normalization.
const KNOWN_DIVERGENCE: Record<string, string> = {
  devicePushTokenSchema:
    'role enum is written inline on Edge and read from USER_ROLES in shared. Both resolve to customer/worker/admin, so the accepted values match.',
  kaelChatCreateSchema:
    'Edge delegates its three refinement issues to _shared/kael-chat-create-refinement.ts while shared inlines them, and the field order differs. A text comparator cannot follow the module boundary.',
  kaelChatEvidenceSchema:
    'same three refinements in a different order. The skipped-with-evidence issue reports a different message and path (evidence_items on Edge, decision in shared); the accept/reject set is identical.',
  kaelChatTurnSchema:
    'field order only: apartment_access_profile sits before scheduled_at on Edge and after schedule_window in shared.',
  workerScopeChangeSchema:
    'a real divergence, not formatting: the photo_urls ref regex accepts UUID versions 1-8 on Edge but only 1-5 in shared, and only Edge carries the parent-traversal guard. Edge is the runtime gate and is the stricter side, so shared is the one that would need to catch up.',
}

const DECLARATION = /^export const ([A-Za-z0-9_]+)\s*(?::[^=]+)?=/gm
// A "/" opens a regex literal rather than division only after one of these.
const REGEX_PREFIX = new Set([
  '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '*', '%', '<', '>',
])

// Reads one initializer by tracking bracket depth, so a schema may span any number of
// lines. Strings, template literals, comments, and regex literals are skipped whole —
// a "/" or a brace inside a storage-ref pattern must not be read as syntax.
function readInitializer(text: string, start: number): string {
  let depth = 0
  let i = start
  let prev = '('
  while (i < text.length) {
    const c = text[i]
    if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1
      continue
    }
    if (c === '/' && text[i + 1] === '*') {
      i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1
      i += 2
      continue
    }
    if (c === '/' && REGEX_PREFIX.has(prev)) {
      i += 1
      let inClass = false
      while (i < text.length) {
        if (text[i] === '\\') {
          i += 2
          continue
        }
        if (text[i] === '[') inClass = true
        else if (text[i] === ']') inClass = false
        else if (text[i] === '/' && !inClass) {
          i += 1
          break
        }
        i += 1
      }
      while (i < text.length && /[a-z]/.test(text[i])) i += 1
      prev = '/'
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c
      i += 1
      while (i < text.length) {
        if (text[i] === '\\') {
          i += 2
          continue
        }
        if (text[i] === quote) {
          i += 1
          break
        }
        i += 1
      }
      prev = quote
      continue
    }
    if (c === '(' || c === '[' || c === '{') {
      depth += 1
      prev = c
      i += 1
      continue
    }
    if (c === ')' || c === ']' || c === '}') {
      depth -= 1
      prev = c
      i += 1
      continue
    }
    // Edge terminates statements with ";", shared does not. At depth zero a newline ends
    // the declaration unless the next line continues the chain (".strict()", ".refine()").
    if (depth === 0 && c === ';') return text.slice(start, i)
    if (depth === 0 && c === '\n') {
      let j = i + 1
      while (j < text.length && /\s/.test(text[j])) j += 1
      if (!/^[.)\]},?:|&+*/=-]/.test(text.slice(j, j + 2))) return text.slice(start, i)
    }
    if (!/\s/.test(c)) prev = c
    i += 1
  }
  return text.slice(start)
}

function declarations(path: string): Map<string, string> {
  const text = readFileSync(join(ROOT, path), 'utf8')
  const found = new Map<string, string>()
  for (const match of text.matchAll(DECLARATION)) {
    found.set(match[1], readInitializer(text, (match.index ?? 0) + match[0].length).trim())
  }
  return found
}

function pairedDeclarations(pair: (typeof CONTRACT_PAIRS)[number]) {
  const edge = declarations(pair.edge)
  const shared = declarations(pair.shared)
  const common = [...edge.keys()]
    .filter((name) => shared.has(name) && !INTERNAL_COMMON_EXPORTS.has(name))
    .sort()

  return { edge, shared, common }
}

// Erases the differences the two runtimes are allowed to have — comment text, formatting,
// semicolons, trailing commas, and single vs double quotes — so only a real contract
// change survives to the comparison.
function normalize(body: string): string {
  return body
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/'((?:[^'\\\n]|\\.)*)'/g, (whole, inner: string) => (inner.includes('"') ? whole : `"${inner}"`))
    .replace(/,(\s*[)\]}])/g, '$1')
    .replace(/;/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{}()[\],:.<>])\s*/g, '$1')
    .trim()
}

describe('request contract parity across the Deno Edge and the npm workspace', () => {
  for (const pair of CONTRACT_PAIRS) {
    it(`${pair.name} keeps its twin schemas in the matching contract file`, () => {
      const { edge, shared, common } = pairedDeclarations(pair)
      const expected = [...pair.schemas].sort()
      const divergent = common.filter(
        (name) => normalize(edge.get(name) as string) !== normalize(shared.get(name) as string),
      )
      const expectedDivergence = expected.filter((name) => name in KNOWN_DIVERGENCE)

      expect(common).toEqual(expected)
      expect(divergent).toEqual(expectedDivergence)
    })
  }

  it('still compares exactly the P1 baseline of 38 public schemas', () => {
    const common = CONTRACT_PAIRS.flatMap((pair) => pairedDeclarations(pair).common)
    const divergent = CONTRACT_PAIRS.flatMap((pair) => {
      const { edge, shared, common: names } = pairedDeclarations(pair)
      return names.filter(
        (name) => normalize(edge.get(name) as string) !== normalize(shared.get(name) as string),
      )
    }).sort()

    expect(new Set(common).size).toBe(EXPECTED_COMMON_SCHEMA_COUNT)
    expect(common).toHaveLength(EXPECTED_COMMON_SCHEMA_COUNT)
    expect(divergent).toEqual(Object.keys(KNOWN_DIVERGENCE).sort())
  })
})
