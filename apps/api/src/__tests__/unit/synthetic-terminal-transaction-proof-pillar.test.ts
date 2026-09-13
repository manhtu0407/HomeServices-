import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { Stage1SyntheticReleaseSmoke } from '../../../scripts/stage1-synthetic-release-smoke.mjs'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'

export const PILLAR = {
  id: 'P69-synthetic-terminal-transaction-proof',
  invariant:
    'Production promotion requires both auto-quote and RFQ/inspection cohorts to traverse public fulfillment with private media and then reach isolated simulated paid-to-review without writing real finance, payout, analytics, or reviews',
  authority: [
    'approved Production Agentic Transaction Readiness plan (Production synthetic paid to review)',
    'governance/RULES.md #8 (no fake success or fake money)',
  ],
  target: 'supabase/migrations/20260904232000_synthetic_terminal_transaction_proof.sql',
  layer: 'security-negative',
  siblings: ['P54-synthetic-cohort-nonvisibility', 'P56-stage1-production-release-workflow', 'P68-completion-payment-authority'],
  mutation:
    'write a synthetic job into a real finance table, skip public fulfillment/media, or record a promotion smoke without two reviewed terminal receipts; this pillar turns red',
} as const satisfies PillarManifest

const root = resolve(__dirname, '../../../../../')
const migrationPath = resolve(
  root,
  'supabase/migrations/20260904232000_synthetic_terminal_transaction_proof.sql',
)
const smokePath = resolve(root, 'apps/api/scripts/stage1-synthetic-release-smoke.mjs')
const cleanupPath = resolve(root, 'apps/api/scripts/stage1-synthetic-cohort-cleanup.mjs')

describe('isolated synthetic terminal transaction proof', () => {
  it('tests attached-media refusal without deleting completion evidence through the user API', async () => {
    const smoke = Object.create(Stage1SyntheticReleaseSmoke.prototype)
    smoke.api = vi.fn().mockResolvedValue({ json: { code: 'MEDIA_INTENT_STATE_CHANGED' } })
    const remove = vi.fn()
    smoke.admin = { storage: { from: () => ({ remove }) } }
    await smoke.assertAttachedEvidenceProtected({ id: 'worker' }, 'job', ['job/after/evidence.png'])
    expect(smoke.api).toHaveBeenCalledWith({ id: 'worker' }, 'POST', '/jobs/job/media-revoke',
      { object_paths: ['job/after/evidence.png'] }, expect.objectContaining({
        expectedSafeError: { status: 400, code: 'MEDIA_INTENT_STATE_CHANGED' },
      }))
    expect(remove).not.toHaveBeenCalled()
  })

  it('refuses a smoke result that allowed attached evidence to be revoked', async () => {
    const smoke = Object.create(Stage1SyntheticReleaseSmoke.prototype)
    smoke.api = vi.fn().mockResolvedValue({ json: { revoked_count: 1 } })
    await expect(smoke.assertAttachedEvidenceProtected({ id: 'worker' }, 'job', ['job/after/evidence.png']))
      .rejects.toThrow('attached evidence revocation was not refused')
  })

  it('ships an append-only release, cohort, run, sequence, and scenario-bound receipt', () => {
    expect(existsSync(migrationPath), pillarWhy(PILLAR, 'terminal proof migration must ship')).toBe(true)
    const migration = readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n')

    expect(migration).toContain('public.stage1_synthetic_transaction_proofs')
    expect(migration).toContain('stage1_synthetic_transaction_proofs_append_only')
    expect(migration).toContain("scenario_kind in ('auto_quote', 'rfq_or_inspection')")
    expect(migration).toContain('STAGE1_TERMINAL_PROOFS_REQUIRED')
    expect(migration).toContain('stage1_smoke_requires_terminal_proofs')
    expect(migration).toMatch(/grant execute on function public\.complete_synthetic_transaction_proof\([\s\S]*?\) to service_role/iu)
    expect(migration).toMatch(/revoke execute on function public\.complete_synthetic_transaction_proof\([\s\S]*?\) from public, anon, authenticated/iu)
    expect(migration).not.toMatch(/\b(drop|truncate|delete\s+from)\b/iu)
  })

  it('keeps real finance and reviews fail-closed while allowing only the scoped simulator', () => {
    const migration = readFileSync(migrationPath, 'utf8').replace(/\r\n/g, '\n')

    expect(migration).toContain("payment_provider = 'staging_simulator'")
    expect(migration).toContain("payment_status = 'received'")
    expect(migration).toContain('new.gross_amount is not null')
    expect(migration).toContain('new.platform_fee is not null')
    expect(migration).toContain('new.worker_net is not null')
    expect(migration).not.toContain('insert into public.job_payment_orders')
    expect(migration).not.toContain('insert into public.worker_payment_ledger')
    expect(migration).not.toContain('insert into public.reviews')
  })

  it('uses the public Worker fulfillment and private-media APIs before the service-role terminal proof', () => {
    const smoke = readFileSync(smokePath, 'utf8').replace(/\r\n/g, '\n')
    const statuses = [
      "status: 'worker_on_way'",
      "status: 'arrived'",
      "status: 'inspecting'",
      "status: 'repairing'",
      "status: 'completed_by_worker'",
    ]
    let cursor = smoke.indexOf('async runFulfillmentAndTerminalProof')
    for (const status of statuses) {
      const next = smoke.indexOf(status, cursor)
      expect(next, pillarWhy(PILLAR, `public fulfillment stage ${status}`)).toBeGreaterThan(cursor)
      cursor = next
    }
    expect(smoke.indexOf('complete_synthetic_transaction_proof', cursor),
      pillarWhy(PILLAR, 'terminal simulator follows public completion')).toBeGreaterThan(cursor)
    expect(smoke).toContain('/media-upload`')
    expect(smoke).toContain("uploadToSignedUrl")
    expect(smoke).toContain('/media-revoke`')
    expect(smoke).toContain("rehydratedJob?.status !== 'reviewed'")
  })

  it('removes only exact cohort media objects before deleting scenario rows', () => {
    const cleanup = readFileSync(cleanupPath, 'utf8').replace(/\r\n/g, '\n')
    const mediaCleanup = cleanup.indexOf('await removeExactCohortMedia')
    const rowCleanup = cleanup.indexOf("admin.rpc('cleanup_synthetic_matching_cohort'")

    expect(mediaCleanup).toBeGreaterThan(0)
    expect(rowCleanup).toBeGreaterThan(mediaCleanup)
    expect(cleanup).toContain("objectPath.startsWith(`${jobId}/`)")
    expect(cleanup).toContain("admin.storage.from('job-media').remove(objectPaths)")
  })
})
