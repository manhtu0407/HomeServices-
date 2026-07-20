import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CONTRADICTION_MAX_RATIO as EDGE_CONTRADICTION_MAX_RATIO,
  EDGE_CONFIDENCE_THRESHOLD,
  EDGE_MIN_EVIDENCE,
  ROLLING_WINDOW_DAYS as EDGE_ROLLING_WINDOW_DAYS,
} from '../../../../../supabase/functions/mobile-api/_shared/kael/learning-constants'
import {
  CONFIDENCE_THRESHOLD,
  CONTRADICTION_MAX_RATIO,
  MIN_EVIDENCE,
  ROLLING_WINDOW_DAYS,
} from '@/lib/learning/evidence-gate'

const MIGRATIONS_DIR = join(
  __dirname,
  '../../../../../supabase/migrations',
)

describe('learning gate constants: one source across Edge, apps/api, and SQL', () => {
  it('Edge constants equal the apps/api reference constants', () => {
    expect(EDGE_MIN_EVIDENCE).toBe(MIN_EVIDENCE)
    expect(EDGE_CONFIDENCE_THRESHOLD).toBe(CONFIDENCE_THRESHOLD)
    expect(EDGE_CONTRADICTION_MAX_RATIO).toBe(CONTRADICTION_MAX_RATIO)
    expect(EDGE_ROLLING_WINDOW_DAYS).toBe(ROLLING_WINDOW_DAYS)
  })

  it('promotion RPC migration pins the same evidence gate numbers', () => {
    const migration = readFileSync(
      join(MIGRATIONS_DIR, '20260714101000_atomic_learning_autopromotion.sql'),
      'utf8',
    )
    expect(migration).toContain(
      `v_candidate.evidence_count < ${EDGE_MIN_EVIDENCE} or v_candidate.confidence < ${EDGE_CONFIDENCE_THRESHOLD}`,
    )
  })

  it('edge skill registry consumes the shared constants, not literals', () => {
    const registry = readFileSync(
      join(
        __dirname,
        '../../../../../supabase/functions/mobile-api/_shared/kael/skills/registry.ts',
      ),
      'utf8',
    )
    expect(registry).toContain('min_evidence_count: EDGE_MIN_EVIDENCE')
    expect(registry).toContain('confidence_threshold: EDGE_CONFIDENCE_THRESHOLD')
  })
})
