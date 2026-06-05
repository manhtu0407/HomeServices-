# Kael B3 Knowledge Corpus Gate

Document type: Plan §31 B3 draft-corpus verification report
Date: 2026-06-04
Status: approved; live source-audited; seed migration generated

## Scope

This report covers the B3 knowledge corpus draft at `docs/foundation/kael-knowledge-corpus.md`.

The corpus was approved by Tu in the 2026-06-04 Codex thread and now has a generated idempotent seed migration for:

- `worker_safety_patterns`
- `legal_awareness_patterns`
- `service_knowledge_boxes.safe_metadata.problem_hints`

## Evidence

- Added schema guard: `apps/api/src/__tests__/schema/kael-b3-knowledge-corpus.test.ts`
- Guard verifies:
  - corpus status is `approved`
  - `Migration Gate` is present
  - safety rows cover only `electrical`, `plumbing`, `cleaning`
  - legal rows use only `awareness_only`, `redirect_required`, `emergency_redirect`
  - every candidate row has a source reference present in the Source Set
  - generated migration contains signed metadata: `corpus_version`, `source_refs`, `source_trust_score`, `signoff_status=approved`
  - no `pending_tu_signoff` marker is present in migrations
- Added generator: `apps/api/scripts/kael-b3-corpus-to-sql.mjs`
  - fails closed while any candidate row is not approved
  - emits SQL only to stdout by default
  - generates idempotent `on conflict (pattern_key) do update` SQL
- Added live source audit harness: `apps/api/scripts/kael-b3-source-audit.mjs`
  - requires `KAEL_B3_SOURCE_AUDIT_LIVE=1`
  - reads `PERPLEXITY_API_KEY` from process env only
  - writes source/citation status, not secrets
- Live source audit artifact: `docs/foundation/source-trust-samples/kael-b3-source-audit-1780579373188.json`
  - Result: `source_count=8`, `on_domain_sources=7`, `failed_sources=0`
- Live source re-audit artifact: `docs/foundation/source-trust-samples/kael-b3-source-audit-1780593318790.json`
  - Result: `source_count=8`, `on_domain_sources=7`, `failed_sources=0`
  - The Perplexity key was provided transiently through process env and was not written to the artifact.
- Generated migration: `supabase/migrations/20260604203000_kael_b3_knowledge_corpus.sql`
  - Seeds 24 safety rows and 8 legal rows.
  - Updates 3 service-level `service_knowledge_boxes` rows with signed `problem_hints` metadata for supported problem slugs.
  - S3 source was changed from an unstable direct `xaydung.gov.vn` PDF/page URL to the live-verifiable VSQI QCVN 07 catalog URL.

## Verification

- Red signal:
  - `node ../../node_modules/vitest/vitest.mjs run src/__tests__/schema/kael-b3-knowledge-corpus.test.ts`
  - Failed before adding the `Migration Gate` section and before accounting for pre-B3 seed keys.
- Green signal:
  - `node ../../node_modules/vitest/vitest.mjs run src/__tests__/schema/kael-b3-knowledge-corpus.test.ts`
  - Result: `1 passed`, `3 tests passed`.
- Generator red/green:
  - Before script implementation, the B3 focused suite failed because `apps/api/scripts/kael-b3-corpus-to-sql.mjs` did not exist.
  - After implementation and Tu approval, focused B3 suite result: `1 passed`, `6 tests passed`.
  - After the final B3.4 audit, the suite was intentionally made red while the migration lacked `service_knowledge_boxes`, then passed after regenerating the SQL with `problem_hints`.
- Live audit:
  - `KAEL_B3_SOURCE_AUDIT_LIVE=1 node apps/api/scripts/kael-b3-source-audit.mjs`
  - First pass: failed closed while S3 used an unstable Ministry PDF/page URL.
  - Final pass after switching S3 to VSQI QCVN 07 catalog: `ok=true`, `source_count=8`, `on_domain_sources=7`, `failed_sources=0`.
  - Re-audit with the transient redacted Perplexity key: `ok=true`, `source_count=8`, `on_domain_sources=7`, `failed_sources=0`.
- Focused regression:
  - `node ../../node_modules/typescript/bin/tsc --noEmit`
  - Result: passed.
  - `node ../../node_modules/vitest/vitest.mjs run src/__tests__/schema/kael-b3-knowledge-corpus.test.ts src/__tests__/schema/source-trust-research.test.ts src/__tests__/unit/mobile-api-kael-q2-q3.test.ts src/__tests__/unit/mobile-api-kael-p5.test.ts`
  - Result: `4 passed`, `32 tests passed`.
  - `git diff --check -- docs/foundation/kael-knowledge-corpus.md apps/api/src/__tests__/schema/kael-b3-knowledge-corpus.test.ts`
  - Result: passed.

## Limitations

- The live audit used Perplexity Sonar plus direct official URL reachability. It is source evidence, not legal advice.
- Production application of the migration still requires the normal Supabase/staging apply gate.
