import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// C2 (one contract source): the Edge runtime cannot import packages/shared directly (Deno/npm +
// Supabase deploy-root boundary), so supabase/functions/_shared/contracts.ts mirrors the canonical
// packages/shared/src/types response modules. This is a VALUE-LEVEL parity test (it compares the
// normalized type bodies, not a brittle string slice) so any field/type drift between the two fails
// CI. Mobile imports the canonical from shared directly, so it is checked for re-export, not re-decl.

const readSource = (p: string) => readFileSync(p, 'utf-8').replace(/\r\n/g, '\n')
const ROOT = resolve(__dirname, '../../../..')
const sharedApiResponses = readSource(resolve(ROOT, 'packages/shared/src/types/api-responses.ts'))
const sharedFavoriteWorkerResponses = readSource(resolve(ROOT, 'packages/shared/src/types/favorite-worker-responses.ts'))
const sharedPriceEvidenceResponses = readSource(resolve(ROOT, 'packages/shared/src/types/price-evidence-responses.ts'))
const edge = readSource(resolve(ROOT, 'supabase/functions/_shared/contracts.ts'))
const mobile = readSource(resolve(ROOT, 'apps/mobile/lib/api-types.ts'))

const CONTRACTS = [
  'KaelEstimateAnalysisReceipt',
  'BaselinePriceEvidenceReceiptResponse',
  'BaselinePriceEvidenceSourceResponse',
  'BaselinePriceEvidenceUnitResponse',
  'KaelPriceReasoningReceipt',
  'MatchingState',
  'FavoriteWorkerForMatching',
  'FavoriteWorkersForMatchingResponse',
  'KaelEstimate',
  'CreateJobResponse',
  'KaelChatStatus',
  'KaelChatNextAction',
  'KaelChatTurn',
  'KaelChatSession',
  'KaelChatResponse',
]

const FAVORITE_WORKER_CONTRACTS = new Set([
  'FavoriteWorkerForMatching',
  'FavoriteWorkersForMatchingResponse',
])
const PRICE_EVIDENCE_CONTRACTS = new Set([
  'KaelEstimateAnalysisReceipt',
  'BaselinePriceEvidenceReceiptResponse',
  'BaselinePriceEvidenceSourceResponse',
  'BaselinePriceEvidenceUnitResponse',
])

function sharedSourceFor(name: string): string {
  if (FAVORITE_WORKER_CONTRACTS.has(name)) return sharedFavoriteWorkerResponses
  if (PRICE_EVIDENCE_CONTRACTS.has(name)) return sharedPriceEvidenceResponses
  return sharedApiResponses
}

function bodyOf(src: string, name: string): string {
  const m = new RegExp(`(?:export )?type ${name}\\b\\s*=\\s*`).exec(src)
  if (!m) throw new Error(`type ${name} not found`)
  const rest = src.slice(m.index + m[0].length).replace(/^\s*/, '')
  if (rest[0] === '{') {
    let depth = 0
    let k = 0
    for (; k < rest.length; k++) {
      const c = rest[k]
      if (c === '{') depth++
      else if (c === '}') {
        depth--
        if (depth === 0) {
          k++
          break
        }
      }
    }
    return rest.slice(0, k)
  }
  const lines: string[] = []
  for (const ln of rest.split('\n')) {
    const t = ln.replace(/\/\/.*/, '').trim()
    if (t === '') continue
    if (t.startsWith('|') || /^['"]/.test(t)) lines.push(t)
    else break
  }
  return lines.join('\n')
}

function normalize(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/['"]/g, '"')
    .replace(/[;,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

describe('C2 contract parity — Edge mirror matches the shared canonical (value-level)', () => {
  for (const name of CONTRACTS) {
    it(`${name}: Edge mirror matches its packages/shared canonical`, () => {
      expect(normalize(bodyOf(edge, name)), `${name} drifted between Edge and shared`).toBe(
        normalize(bodyOf(sharedSourceFor(name), name)),
      )
    })
  }

  it('mobile re-exports the contracts from shared (no local re-declaration)', () => {
    expect(mobile).toContain("} from '@nestscout/shared'")
    expect(mobile).not.toContain('type KaelEstimate = {')
    expect(mobile).not.toContain('export type CreateJobResponse = {')
    expect(mobile).not.toContain('export type KaelChatResponse = {')
  })
})
