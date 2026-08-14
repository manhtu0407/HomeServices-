# Test Pillars — pointer

The canonical contract is **[`governance/protocols/test-pillars.md`](../../governance/protocols/test-pillars.md)**.
Read that before writing any test. This file exists only so `docs/architecture/` links resolve;
governance outranks `docs/`, and nothing here is a rule.

The pillar suite is the only suite the runners collect. The ~431 pre-existing test files remain on
disk, uncollected, as reference material.

| id | layer | file |
|---|---|---|
| `P01-commission-math` | unit | `apps/api/src/__tests__/unit/commission-math-pillar.test.ts` |
| `P02-bounded-response-read` | security-negative | `apps/api/src/__tests__/unit/bounded-response-read-pillar.test.ts` |
| `P03-direct-payment-availability` | integration | `apps/api/src/__tests__/kael-edge-runtime/domains/direct-payment-availability-pillar.test.ts` |
| `P04-remote-snapshot-validation` | security-negative | `packages/shared/src/__tests__/remote-snapshot-validation-pillar.test.ts` |
| `P05-generated-view-parity` | static-type | `apps/api/src/__tests__/schema/generated-view-parity-pillar.test.ts` |
| `P06-payment-unlock-gate` | ui-visual | `apps/mobile/components/customer/__tests__/payment-unlock-gate-pillar-test.tsx` |
| `P07-worker-verification-states` | ui-visual | `apps/mobile/components/worker/__tests__/worker-verification-states-pillar-test.tsx` |
| `P08-worker-dock-motion` | ui-visual | `apps/mobile/components/worker/__tests__/worker-dock-motion-pillar-test.tsx` |
| `P09-kael-pii-scrub` | security-negative | `packages/shared/src/__tests__/kael-pii-scrub-pillar.test.ts` |
| `P10-per-actor-rls` | sql | `supabase/tests/staging_security_verification.sql` |
| `P11-kael-routing-conformance` | static-type | `apps/api/src/__tests__/unit/kael-routing-conformance-pillar.test.ts` |
| `P12-workflow-transition-composition` | unit | `apps/api/src/__tests__/unit/workflow-transition-composition-pillar.test.ts` |
| `P13-autonomy-decision-durability` | integration | `apps/api/src/__tests__/kael-edge-runtime/domains/autonomy-decision-durability-pillar.test.ts` |
| `P14-kael-chat-cost-cap` | integration | `apps/api/src/__tests__/kael-edge-runtime/domains/kael-chat-cost-cap-pillar.test.ts` |
| `P15-kael-inbound-safety` | security-negative | `apps/api/src/__tests__/kael-edge-runtime/domains/kael-inbound-safety-pillar.test.ts` |
| `P16-ai-spend-envelope` | unit | `apps/api/src/__tests__/unit/ai-spend-envelope-pillar.test.ts` |
| `P17-adversarial-surface-matrix` | security-negative | `apps/api/src/__tests__/security/adversarial-surface-matrix-pillar.test.ts` |
| `P18-capability-registry-parity` | static-type | `apps/api/src/__tests__/schema/capability-registry-parity-pillar.test.ts` |
| `P19-job-access-ownership` | security-negative | `apps/api/src/__tests__/unit/job-access-ownership-pillar.test.ts` |
| `P20-price-receipt-gate` | sql | `supabase/tests/kael_price_reasoning_receipt_verification.sql` |

P11-P20 cover the Edge request boundary, the workflow state machine, and the Kael agentic pipeline.
Two shared fakes support them, in `apps/api/src/__tests__/kael-edge-runtime/harness/`:
`scriptedProviderFetch()` for model providers and `makeLedgerClient()` for AI spend.

`P18-capability-registry-parity` was written red: it found 12 routes whose audited capability roles
were wider than their descriptors declared, including the money-gated worker-candidate confirmation.
The generator has since been fixed and now fails the build instead of widening silently. The
governance file records what it found and how the fix is shaped.

Each pillar's invariant, authority, sibling links, and recorded mutation live in its `PILLAR`
manifest and in the generated index inside the governance file.
`node scripts/harness/pillar-registry.mjs` validates both and runs in CI.
