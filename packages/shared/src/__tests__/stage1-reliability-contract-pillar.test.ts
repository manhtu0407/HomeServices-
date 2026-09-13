import { describe, expect, it } from 'vitest'

import {
  confirmationOperationReceiptSchema,
  intakeCoverageSchema,
  kaelChatConfirmSchema,
  matchingDeliveryStateSchema,
  quoteModeSchema,
  releaseIdentitySchema,
  serviceCoverageReadinessSchema,
  serviceIntakePolicySchema,
} from '../index'
import { pillarWhy, type PillarManifest } from './pillar-manifest'

export const PILLAR = {
  id: 'P44-stage1-reliability-contract',
  invariant:
    'quote mode, intake coverage, confirmation recovery, delivery, and release identity are closed validated contracts that cannot turn missing evidence into a priced or completed success',
  authority: [
    'governance/RULES.md #7 (customer confirmation before matching)',
    'governance/RULES.md #8 (fallback is allowed, fake success is forbidden)',
    'approved Stage 1 implementation plan (hybrid quote and durable recovery)',
  ],
  target: 'packages/shared/src/contracts/stage1-reliability.ts',
  layer: 'security-negative',
  siblings: ['P04-remote-snapshot-validation', 'P18-capability-registry-parity', 'P20-price-receipt-gate'],
  mutation:
    'remove the quote-mode/confirmation-kind consistency refinement — the RFQ-disguised-as-priced-offer case turns green and this pillar turns red',
} as const satisfies PillarManifest

const baseCoverage = {
  policy_id: '11111111-1111-4111-8111-111111111111',
  policy_version: 1,
  quote_mode: 'rfq',
  order_eligible: true,
  missing_required_fields: [],
  missing_enrichment_slots: ['breaker_state'],
  safety_blocker: null,
  confirmation_kind: 'rfq_request',
  next_action: 'rfq_review',
} as const

describe('Stage 1 reliability contract', () => {
  it('keeps quote modes closed', () => {
    for (const mode of ['kael_auto_quote', 'rfq', 'inspection_only', 'blocked']) {
      expect(quoteModeSchema.safeParse(mode).success, pillarWhy(PILLAR, `mode=${mode}`)).toBe(true)
    }
    expect(
      quoteModeSchema.safeParse('price_optional').success,
      pillarWhy(PILLAR, 'an unknown mode must fail closed instead of silently using auto quote'),
    ).toBe(false)
  })

  it('accepts the canonical underscore slugs already stored in the service taxonomy', () => {
    const parsed = serviceIntakePolicySchema.safeParse({
      policy_id: '11111111-1111-4111-8111-111111111111',
      service_type: 'plumbing',
      problem_slug: 'pipe_leak',
      version: 1,
      status: 'published',
      quote_mode: 'rfq',
      required_fields: ['service_type', 'problem_slug', 'description'],
      enrichment_slots: [],
      safety_requirements: [],
      capability_requirements: [],
      evidence_requirements: {
        minimum_source_count: 0,
        minimum_high_trust_source_count: 0,
        requires_active_baseline: false,
      },
      questions: [],
      change_reason: 'Initial governed taxonomy seed',
      created_by: '22222222-2222-4222-8222-222222222222',
      created_at: '2026-08-23T00:00:00.000Z',
      published_by: '33333333-3333-4333-8333-333333333333',
      published_at: '2026-08-23T00:01:00.000Z',
    })
    expect(parsed.success, pillarWhy(PILLAR, 'DB taxonomy slugs use underscores and must survive the public contract')).toBe(true)
    expect(
      serviceIntakePolicySchema.safeParse({ ...(parsed.success ? parsed.data : {}), problem_slug: 'pipe leak' }).success,
      pillarWhy(PILLAR, 'whitespace is not a canonical slug separator'),
    ).toBe(false)
  })

  it('allows optional enrichment to remain missing without blocking an RFQ', () => {
    expect(
      intakeCoverageSchema.safeParse(baseCoverage).success,
      pillarWhy(PILLAR, 'Tier B is optional for RFQ dispatch'),
    ).toBe(true)
  })

  it('keeps public booking readiness separate from intake completeness', () => {
    const readyCell = {
      service_type: 'plumbing',
      district_code: 'q7',
      status: 'ready',
      minimum_worker_count: 3,
      eligible_reachable_worker_count: 3,
      required_capabilities: [],
      reason_code: 'READY',
      checked_at: '2026-09-04T05:00:00.000Z',
      valid_until: '2026-09-04T05:00:30.000Z',
    } as const

    expect(
      serviceCoverageReadinessSchema.safeParse(readyCell).success,
      pillarWhy(PILLAR, 'three distinct eligible and reachable workers open one public cell'),
    ).toBe(true)
    expect(
      serviceCoverageReadinessSchema.safeParse({
        ...readyCell,
        eligible_reachable_worker_count: 2,
      }).success,
      pillarWhy(PILLAR, 'intake completeness cannot disguise a cell below the public supply threshold'),
    ).toBe(false)
    expect(
      serviceCoverageReadinessSchema.safeParse({
        ...readyCell,
        worker_ids: ['11111111-1111-4111-8111-111111111111'],
      }).success,
      pillarWhy(PILLAR, 'the public coverage contract must not expose worker identity'),
    ).toBe(false)
  })

  it('rejects coverage that calls RFQ a priced offer', () => {
    expect(
      intakeCoverageSchema.safeParse({
        ...baseCoverage,
        confirmation_kind: 'priced_offer',
        next_action: 'offer_review',
      }).success,
      pillarWhy(PILLAR, 'RFQ must never imply that Kael supplied a price'),
    ).toBe(false)
  })

  it('rejects order eligibility while a Tier A field is missing', () => {
    expect(
      intakeCoverageSchema.safeParse({
        ...baseCoverage,
        missing_required_fields: ['scheduled_at'],
      }).success,
      pillarWhy(PILLAR, 'a missing dispatch field must block confirmation'),
    ).toBe(false)
  })

  it('keeps the legacy priced confirmation compatible while requiring RFQ disclosure', () => {
    expect(
      kaelChatConfirmSchema.safeParse({ price_reasoning_receipt_id: 'receipt_stage1_01' }).success,
      pillarWhy(PILLAR, 'old binaries infer a priced-offer confirmation from the receipt'),
    ).toBe(true)
    expect(
      kaelChatConfirmSchema.safeParse({ confirmation_kind: 'rfq_request' }).success,
      pillarWhy(PILLAR, 'an RFQ has explicit customer disclosure and no fake price receipt'),
    ).toBe(true)
    expect(
      kaelChatConfirmSchema.safeParse({ confirmation_kind: 'priced_offer' }).success,
      pillarWhy(PILLAR, 'a priced offer without its reasoning receipt must fail'),
    ).toBe(false)
  })

  it('requires a job id after the durable operation creates the job', () => {
    expect(
      confirmationOperationReceiptSchema.safeParse({
        operation_id: '22222222-2222-4222-8222-222222222222',
        idempotency_key: 'stage1-confirm-key-0001',
        session_id: '33333333-3333-4333-8333-333333333333',
        job_id: null,
        quote_mode: 'rfq',
        state: 'confirmation_pending',
        terminal: false,
        accepted_at: '2026-08-23T00:00:00.000Z',
        updated_at: '2026-08-23T00:00:00.000Z',
        retry_after_ms: 500,
        support_code: 'K8H2M4Q9',
      }).success,
      pillarWhy(PILLAR, 'an accepted command may still be waiting for the atomic job write'),
    ).toBe(true)

    expect(
      confirmationOperationReceiptSchema.safeParse({
        operation_id: '22222222-2222-4222-8222-222222222222',
        idempotency_key: 'stage1-confirm-key-0001',
        session_id: '33333333-3333-4333-8333-333333333333',
        job_id: null,
        quote_mode: 'rfq',
        state: 'matching_queued',
        terminal: false,
        accepted_at: '2026-08-23T00:00:00.000Z',
        updated_at: '2026-08-23T00:00:01.000Z',
        retry_after_ms: 500,
        support_code: 'K8H2M4Q9',
      }).success,
      pillarWhy(PILLAR, 'matching cannot be queued for a job the receipt cannot identify'),
    ).toBe(false)
  })

  it('accepts the ISO offset timestamps returned by PostgREST', () => {
    expect(
      confirmationOperationReceiptSchema.safeParse({
        operation_id: '22222222-2222-4222-8222-222222222222',
        idempotency_key: 'stage1-confirm-key-offset-0001',
        session_id: '33333333-3333-4333-8333-333333333333',
        job_id: '44444444-4444-4444-8444-444444444444',
        quote_mode: 'kael_auto_quote',
        state: 'matching_queued',
        terminal: false,
        accepted_at: '2026-08-23T03:26:45.185997+00:00',
        updated_at: '2026-08-23T03:26:46.185997+00:00',
        retry_after_ms: 500,
        support_code: 'K8H2M4Q9',
      }).success,
      pillarWhy(PILLAR, 'a committed confirmation must not look failed because PostgREST uses an offset timestamp'),
    ).toBe(true)
  })

  it('keeps delivery states and release identity closed and public-safe', () => {
    expect(matchingDeliveryStateSchema.safeParse('seen').success, pillarWhy(PILLAR, 'seen is durable')).toBe(true)
    expect(
      matchingDeliveryStateSchema.safeParse('pushed').success,
      pillarWhy(PILLAR, 'transport success is not proof the Worker received the offer'),
    ).toBe(false)

    const release = {
      release_id: 'rel_stage1_20260823',
      git_sha: 'a'.repeat(40),
      source_bundle_hash: 'b'.repeat(64),
      mobile_build_fingerprint: '3'.repeat(64),
      production_ui_source_hash: '5'.repeat(64),
      edge_bundle_hash: 'c'.repeat(64),
      migration_watermark: '20260823110000',
      migration_inventory_hash: '4'.repeat(64),
      policy_hash: 'd'.repeat(64),
      prompt_hash: 'e'.repeat(64),
      capability_hash: 'f'.repeat(64),
      price_evidence_hash: '1'.repeat(64),
      provider_readiness_fingerprint: '2'.repeat(64),
      generated_at: '2026-08-23T00:00:00.000Z',
    }
    expect(releaseIdentitySchema.safeParse(release).success, pillarWhy(PILLAR, 'immutable identity')).toBe(true)
    expect(
      releaseIdentitySchema.safeParse({ ...release, release_id: 'unreleased' }).success,
      pillarWhy(PILLAR, 'Production must never advertise an anonymous release'),
    ).toBe(false)
  })
})
