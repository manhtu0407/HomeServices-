import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readGeneratedDatabaseTypes } from '../helpers/generated-database-types'

const ROOT = resolve(__dirname, '../../../../../')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

describe('Kael source-trust tiering migration', () => {
  it('adds evidence fields and remaps legacy tiers without changing the legacy tier contract', () => {
    const migration = read('supabase/migrations/20260710082345_kael_source_trust_tiering.sql')

    expect(migration).toContain('add column if not exists criteria_met jsonb not null default')
    expect(migration).toContain('add column if not exists auto_tier smallint not null default 5')
    expect(migration).toContain('check (auto_tier between 1 and 5)')
    for (const column of [
      'entity_type',
      'region',
      'established_year',
      'first_seen_at',
      'last_price_seen_at',
      'price_unit',
      'integrity_flag',
    ]) {
      expect(migration).toContain(`add column if not exists ${column}`)
    }
    expect(migration).toContain("when 'tier_1' then 1")
    expect(migration).toContain("when 'tier_2' then 2")
    expect(migration).toContain("when 'tier_3' then 3")
    expect(migration).toContain("when 'blocked' then 5")
    expect(migration).toContain('alter table public.source_trust_registry enable row level security')
    expect(migration).not.toContain('grant all on public.source_trust_registry to authenticated')
  })

  it('keeps generated database types aligned with the new nullable evidence and non-null auto tier', () => {
    const types = readGeneratedDatabaseTypes()
    const registry = types.slice(types.indexOf('source_trust_registry: {'), types.indexOf('source_trust_registry: {') + 2_500)

    expect(registry).toContain('auto_tier: number')
    expect(registry).toContain('criteria_met: Json')
    expect(registry).toContain('entity_type: string | null')
    expect(registry).toContain('integrity_flag: boolean')
  })
})
