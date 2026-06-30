// Canonical npm-side parser for Kael LLM JSON output. apps/api imports this; the Edge runtime
// keeps its own copy in supabase/functions/mobile-api/_shared/kael/utils.ts because Deno cannot
// import packages/shared (the boundary-forced mirror is intentional — see code-ownership-map.md).

// Adversarial inputs like {{{{... could exhaust stack/memory during JSON.parse.
// Real AI output for Kael schemas nests <5 levels; 100 gives wide safety margin.
const MAX_JSON_DEPTH = 100

// Cap input length before parsing. 64KB is far larger than expected AI output
// (~500-2000 chars) but limits worst-case scan time to O(input length).
const MAX_INPUT_LENGTH = 64 * 1024

export function safeParseJSON(text: string): unknown {
  if (text.length > MAX_INPUT_LENGTH) return null

  const stripped = stripMarkdownFence(text)

  const startIdx = findJsonStart(stripped)
  if (startIdx === -1) return null

  const opener = stripped[startIdx]
  const closer = opener === '{' ? '}' : ']'

  const candidate = extractBalanced(stripped, startIdx, opener, closer)
  if (!candidate) return null

  try {
    return JSON.parse(candidate)
  } catch {
    return null
  }
}

function stripMarkdownFence(text: string): string {
  const fencePattern = /```(?:json)?\s*\n?([\s\S]*?)```/
  const match = text.match(fencePattern)
  return match ? match[1].trim() : text
}

function findJsonStart(text: string): number {
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{' || text[i] === '[') return i
  }
  return -1
}

function extractBalanced(
  text: string,
  start: number,
  opener: string,
  closer: string,
): string | null {
  let depth = 0
  let maxDepthSeen = 0
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

    if (ch === opener) {
      depth++
      if (depth > maxDepthSeen) maxDepthSeen = depth
      if (maxDepthSeen > MAX_JSON_DEPTH) return null
    }
    if (ch === closer) depth--

    if (depth === 0) {
      return text.slice(start, i + 1)
    }
  }

  return null
}
