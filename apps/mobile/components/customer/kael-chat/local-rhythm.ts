const greetingPhrases = new Set([
  'hi',
  'hello',
  'hey',
  'alo',
  'chao',
  'xin chao',
  'hi kael',
  'hello kael',
  'chao kael',
  'kael oi',
  'co ai khong',
  'ban co o day khong',
])

const greetingTokens = new Set(['hi', 'hello', 'hey', 'alo', 'chao', 'xin', 'kael', 'oi', 'ban', 'co', 'ai', 'khong', 'day'])

export function isLocalGreetingOnly(value: string) {
  const normalized = normalizeLocalRhythmText(value)
  if (!normalized) return false
  if (greetingPhrases.has(normalized)) return true
  const tokens = normalized.split(' ').filter(Boolean)
  return tokens.length > 0
    && tokens.length <= 5
    && tokens.every((token) => greetingTokens.has(token))
    && tokens.some((token) => token === 'hi' || token === 'hello' || token === 'hey' || token === 'alo' || token === 'chao')
}

function normalizeLocalRhythmText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u0111/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
