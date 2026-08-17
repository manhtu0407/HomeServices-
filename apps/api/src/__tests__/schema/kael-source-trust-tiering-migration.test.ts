import { describe, expect, it } from 'vitest'
import { readGeneratedDatabaseTypes } from '../helpers/generated-database-types'

describe('Kael source-trust tiering', () => {
  it('keeps generated database types aligned with the new nullable evidence and non-null auto tier', () => {
    const types = readGeneratedDatabaseTypes()
    const registry = types.slice(types.indexOf('source_trust_registry: {'), types.indexOf('source_trust_registry: {') + 2_500)

    expect(registry).toContain('auto_tier: number')
    expect(registry).toContain('criteria_met: Json')
    expect(registry).toContain('entity_type: string | null')
    expect(registry).toContain('integrity_flag: boolean')
  })
})
