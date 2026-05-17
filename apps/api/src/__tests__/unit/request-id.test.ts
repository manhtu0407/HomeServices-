import { describe, it, expect } from 'vitest'
import { generateRequestId } from '@/lib/kael/log-api-call'

describe('generateRequestId (E13)', () => {
  it('returns RFC4122 UUID v4 format', () => {
    const id = generateRequestId()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('returns unique value across calls (low collision risk)', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 100; i++) ids.add(generateRequestId())
    expect(ids.size).toBe(100)
  })
})
