// Canonical npm-side parser for Kael LLM JSON output. apps/api imports this; the Edge runtime
// keeps its own copy in supabase/functions/mobile-api/_shared/kael/_runtime/utils.ts because Deno cannot
// import packages/shared (the boundary-forced mirror is intentional — see code-ownership-map.md).

// Adversarial inputs like {{{{... could exhaust stack/memory during JSON.parse.
// Real AI output for Kael schemas nests <5 levels; 100 gives wide safety margin.
const MAX_JSON_DEPTH = 100

// Cap input length before parsing. 64KB is far larger than expected AI output
// (~500-2000 chars) but limits worst-case scan time to O(input length).
const MAX_INPUT_LENGTH = 64 * 1024

// Bound recovery attempts so prose containing many stray brackets cannot turn
// fallback extraction into quadratic work.
const MAX_JSON_CANDIDATES = 32

export function safeParseJSON(text: string): unknown {
  if (text.length > MAX_INPUT_LENGTH) return null

  const stripped = text.trim()

  let searchFrom = 0
  for (let attempt = 0; attempt < MAX_JSON_CANDIDATES; attempt += 1) {
    const startIdx = findJsonStart(stripped, searchFrom)
    if (startIdx === -1) return null

    const extracted = extractBalanced(stripped, startIdx)
    if (extracted.tooDeep) return null
    if (extracted.candidate) {
      try {
        return JSON.parse(extracted.candidate)
      } catch {
        // Bracketed prose is common around model JSON; keep scanning within
        // the bounded attempt budget for the next real payload.
      }
    }
    searchFrom = startIdx + 1
  }

  return null
}

function findJsonStart(text: string, from: number): number {
  for (let i = from; i < text.length; i++) {
    if (text[i] === '{' || text[i] === '[') return i
  }
  return -1
}

function extractBalanced(
  text: string,
  start: number,
): { candidate: string | null; tooDeep: boolean } {
  const expectedClosers: string[] = []
  let inString = false
  let escape = false

  for (let i = start; i < text.length; i++) {
    const ch = text[i]

    if (escape) {
      escape = false
      continue
    }

    if (ch === '\\' && inString) {
      escape = true
      continue
    }

    if (ch === '"') {
      inString = !inString
      continue
    }

    if (inString) continue

    if (ch === '{' || ch === '[') {
      expectedClosers.push(ch === '{' ? '}' : ']')
      if (expectedClosers.length > MAX_JSON_DEPTH) return { candidate: null, tooDeep: true }
      continue
    }
    if (ch === '}' || ch === ']') {
      if (expectedClosers.pop() !== ch) return { candidate: null, tooDeep: false }
    }
    if (expectedClosers.length === 0) {
      return { candidate: text.slice(start, i + 1), tooDeep: false }
    }
  }

  return { candidate: null, tooDeep: false }
}
