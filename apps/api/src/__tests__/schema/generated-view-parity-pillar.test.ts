import { describe, expect, it } from 'vitest'
import type { Database } from '@nestscout/shared'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'

export const PILLAR = {
  id: 'P05-generated-view-parity',
  invariant:
    'every view in the generated schema is named here with a column its consumers rely on, so a new, dropped, or renamed view cannot arrive unguarded',
  authority: [
    'governance/protocols/tdd.md (derived sets are a ratchet doing its job)',
    'supabase/migrations/20260826143000_admin_system_governance.sql (admin model-health view)',
  ],
  target: 'packages/shared/src/types/database/views.database.types.ts',
  layer: 'static-type',
  siblings: ['P01-commission-math', 'P10-per-actor-rls'],
  mutation:
    'delete the worker_overview entry from VIEW_IDENTITY_COLUMN — type-check reports a missing property and the runtime count case turns red',
} as const satisfies PillarManifest

type ViewName = keyof Database['public']['Views']

// The mapped type is the assertion, and it binds in both directions: a view added to the
// schema makes this object incomplete, a view removed makes its key unknown, and a renamed
// column makes the value invalid. tier1-type-completeness only ever walked Tables and
// Functions, so before this pillar the view surface had no gate at all.
const VIEW_IDENTITY_COLUMN: {
  [V in ViewName]: keyof Database['public']['Views'][V]['Row']
} = {
  admin_model_health_daily: 'day',
  customer_overview: 'customer_id',
  harness_run_timeline: 'capability',
  kael_cost_daily_summary: 'day',
  kael_cost_projection_daily: 'day',
  kael_estimate_accuracy: 'month',
  kael_monitoring_ab_price_synthesis: 'comparison_provider',
  kael_monitoring_provider_daily: 'day',
  worker_overview: 'is_approved',
  worker_service_quality_status: 'service_type',
}

// CompositeTypes is currently `[_ in never]: never`, so this empty literal type-checks.
// The moment a composite type is generated, tsc demands a key here and someone has to
// decide what guards it.
const COMPOSITE_TYPE_GUARD: { [C in keyof Database['public']['CompositeTypes']]: true } = {}

describe('generated view parity', () => {
  // The explicit count keeps additions visible during review instead of allowing the mapped
  // type to absorb a new view without updating this behavioral inventory.
  it('covers exactly the ten public views the schema inventory records', () => {
    expect(
      Object.keys(VIEW_IDENTITY_COLUMN),
      pillarWhy(PILLAR, 'a count drift here means a view shipped without anyone guarding it'),
    ).toHaveLength(10)
  })

  it('names a real, non-empty column for every view', () => {
    const unnamed = Object.entries(VIEW_IDENTITY_COLUMN).filter(
      ([, column]) => typeof column !== 'string' || column.length === 0,
    )
    expect(
      unnamed,
      pillarWhy(PILLAR, 'an empty column name would satisfy the mapped type but guard nothing'),
    ).toEqual([])
  })

  it('does not list the same view twice under a different spelling', () => {
    const keys = Object.keys(VIEW_IDENTITY_COLUMN)
    expect(
      new Set(keys).size,
      pillarWhy(PILLAR, 'duplicate keys would hide a missing view behind a matching count'),
    ).toBe(keys.length)
  })

  it('records that no composite type is generated yet', () => {
    expect(
      Object.keys(COMPOSITE_TYPE_GUARD),
      pillarWhy(PILLAR, 'if this fails a composite type appeared and needs its own guard'),
    ).toEqual([])
  })
})
