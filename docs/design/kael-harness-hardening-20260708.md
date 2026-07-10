# Kael Harness Hardening — §42 Execution Companion

Canonical plan: `governance/Plan.md` §42. Status: implemented and locally verified on 2026-07-10.

## Invariants

- All customer/worker visible Kael text reaches one server-side output gateway before persistence or response.
- Vietnamese is canonicalized only for policy matching; the original validated output is preserved when safe.
- Mobile never calls a provider and receives no server secret.
- Permission, output, memory, adapter, and status changes preserve existing public response fields or add optional metadata only.

## Files / Action / Acceptance

| Workstream | Owner files | Acceptance |
|---|---|---|
| W1 output gateway | `canonicalize-vn.ts`, `output-gateway.ts`, four chat services, `self-check.ts` | Accented/unaccented forbidden phrases, `500k`, `500 nghìn`, `500 ngàn`, `500.000đ`, and mixed units cannot bypass the same choke point; safe text keeps original accents |
| W2 permission confidence | `permission-gate.ts`, `autonomy-gate.ts`, assistant/chat callers | Every topic has provenance/confidence; an LLM topic defaults to deny without valid server config and independent boundary evidence |
| W3 memory quarantine | `kael/index.ts`, `memory.ts`, schema tests | Dormant L1–L6 context is absent from the production import barrel; authenticated self-memory CRUD remains backward compatible |
| W5 provider adapters | `provider-adapter.ts`, `provider-client.ts` | Exactly three thin adapters own provider request/response/cost/failure differences; `callAI` keeps timeout/retry/spend/circuit authority |
| W4 stage status | `orchestrator.ts`, `orchestrator-facade.ts`, `pipeline.ts` | `ok | declined | degraded | failed` distinguishes outcomes; legacy boolean telemetry remains available |

## W1 live path inventory

1. Customer Kael assistant response.
2. Worker assist response.
3. Customer chat service output/persistence path.
4. Worker chat service output/persistence path.

The orchestrator also uses the same gateway. Guardrail audit stores only safe rule/version/path metadata and never raw chat text.

## Security and compatibility

- Canonicalization uses Unicode normalization, Vietnamese mark removal, lowercase, whitespace/punctuation folding, and compact-money detection.
- Permission audits record provenance booleans/confidence only. Raw descriptions, phone/address data, and provider text are not logged.
- Provider adapters remain server-only and do not add a new provider or SDK.
- The stage status union is internal; façade telemetry retains `stage_success` and adds `stage_status`.

## Verification

- Output gateway regression covers accented/unaccented refusal phrases, `500k`, mixed units, safe-number false positives, all four chat paths, and audit evidence.
- Permission/autonomy regressions cover low-confidence LLM labels, missing threshold, deterministic provenance, canonical Vietnamese evidence, provider/DB short-circuit, and money/status denial.
- Memory import-graph tests prove quarantine without deleting self-memory routes.
- Provider adapter tests cover inventory, capabilities, endpoints, payloads, response cost, failure classes, and current Anthropic sampling compatibility.
- Orchestrator tests cover all four statuses plus legacy façade telemetry.
- `pnpm test:api`: 121 files passed / 4 skipped; 1,720 tests passed / 75 skipped after final correction.
- `pnpm type-check:api`: passed.
- `pnpm dlx deno@2.9.2 check --config supabase/functions/mobile-api/deno.json supabase/functions/mobile-api/index.ts`: passed.

## Remaining rollout limitation

The durable §41 schema/RPC contract is applied and verified on staging, including a committed cross-session circuit check. The exact local Edge graph is active as `mobile-api` v117 and its public charter route returned HTTP 200. `KAEL_DURABLE_GUARDS_ENABLED=true` is set and fingerprint-verified server-side. No commit, push, PR, production deploy, provider key, or mobile AI path was created.
