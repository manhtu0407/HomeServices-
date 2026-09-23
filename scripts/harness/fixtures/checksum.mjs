// Recomputes a self-describing artifact's checksum after a test edits it, so the edit is judged by the
// semantic rule under test rather than by the checksum mismatch it would otherwise always trigger.
import { createHash } from 'node:crypto'

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
}

export function rehash(value, field = 'receiptSha256') {
  const digest = createHash('sha256').update(JSON.stringify(canonical({ ...value, [field]: undefined }))).digest('hex')
  return { ...value, [field]: digest }
}
