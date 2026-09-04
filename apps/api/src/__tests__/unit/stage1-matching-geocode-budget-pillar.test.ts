import { describe, expect, it, vi } from 'vitest'

import { installEdgeRuntimeTestHooks } from '../kael-edge-runtime/harness'
import { type PillarManifest } from '../pillar-manifest'
import {
  CONFIRMED_MATCHING_GEOCODE_BUDGET_MS,
  firstProviderResultWithinBudget,
} from '../../../../../supabase/functions/mobile-api/_shared/domains/places/geo-public'

export const PILLAR = {
  id: 'P63-matching-geocode-budget',
  invariant:
    'slow geocoding shares one bounded provider deadline so durable Worker inbox delivery is not held behind sequential provider timeouts',
  authority: [
    'approved Stage 1 implementation plan (foreground Worker offer p95 at most 10 seconds)',
    'governance/RULES.md #8 (provider latency must degrade honestly, never become fake success)',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/places/geo-public.ts',
  layer: 'unit',
  siblings: ['P49-durable-matching-delivery', 'P58-confirmation-outbox-dispatcher'],
  mutation:
    'restore a timeout per provider or remove the shared deadline; a slow primary and fallback can consume the Worker offer SLO',
} as const satisfies PillarManifest

installEdgeRuntimeTestHooks()

describe('Stage 1 matching geocode budget', () => {
  it('shares one bounded deadline across provider fallbacks', async () => {
    let now = 100
    const first = vi.fn(async (timeoutMs: number) => {
      expect(timeoutMs).toBe(CONFIRMED_MATCHING_GEOCODE_BUDGET_MS)
      now += 1_100
      return null
    })
    const second = vi.fn(async (timeoutMs: number) => {
      expect(timeoutMs).toBe(400)
      return { lat: 10.77, lng: 106.69, geoSource: 'google_maps' }
    })

    await expect(firstProviderResultWithinBudget(
      CONFIRMED_MATCHING_GEOCODE_BUDGET_MS,
      [first, second],
      () => now,
    )).resolves.toMatchObject({ geoSource: 'google_maps' })
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('stops before another provider after the total budget is exhausted', async () => {
    let now = 0
    const first = vi.fn(async () => {
      now = CONFIRMED_MATCHING_GEOCODE_BUDGET_MS
      return null
    })
    const second = vi.fn(async () => ({ lat: 10.77, lng: 106.69 }))

    await expect(firstProviderResultWithinBudget(
      CONFIRMED_MATCHING_GEOCODE_BUDGET_MS,
      [first, second],
      () => now,
    )).resolves.toBeNull()
    expect(second).not.toHaveBeenCalled()
  })
})
