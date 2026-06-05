# Kael Section 32 Phase 0 Readiness

Document type: read-only readiness audit
Date: 2026-06-04
Status: P0 materially complete; code gate not open

## Scope

This report covers Plan.md section 32 Phase 0 and WBF.0 read-only work for PR #60:

- Customer perceived performance, stage streaming, and SSE planning.
- Worker Kael felt-parity and advisory chatbot boundary.
- Anti-disintermediation, apartment-access, and flexible-not-slop constraints.

No code implementation was started in this pass.

## Authority Read

Read or inspected:

- `critical.md`
- `RULES.md`
- `STRUCTURES.md`
- `design.md`
- `AGENTS.md`
- `CLAUDE.md`
- `skills.md`
- `docs/architecture/code-ownership-map.md`
- `README.md`
- `Plan.md` sections 8.2, 14, 15, 31, 32
- `MEMORY.md`
- `protocols/ai-data-security.md`
- `protocols/tdd.md`
- `protocols/architecture.md`
- `protocols/ui.md`
- `protocols/frontend-test.md`
- `.agents/skills/kael-ai-boundary/SKILL.md`
- `.agents/skills/kael-supabase/SKILL.md`
- `.agents/skills/kael-security-sweep/SKILL.md`
- `.agents/skills/kael-tdd/SKILL.md`
- `.agents/skills/kael-motion/SKILL.md`
- `.agents/skills/kael-frontend-test/SKILL.md`
- `.agents/skills/glass-liquid-signature/SKILL.md`
- `.agents/skills/karpathy-guidelines/SKILL.md`

Runtime rules restated:

- Mobile must stay behind Supabase Auth and Edge `mobile-api`.
- AI provider calls and secrets remain server-side.
- Workflow-sensitive writes remain behind Edge/RPC.
- AI output must be structured, Zod-validated, and self-checked before egress.
- Supported services stay electrical, plumbing, cleaning.
- No fake data, fake stages, provider names, or PII in user-visible copy, progress rows, or safe logs.
- Frontend phases are not done without real Expo app evidence, including light/dark and Reduce Motion/Transparency.

## Phase 0 Checklist

| Item | Status | Evidence |
|---|---|---|
| P0.1 governance stack | Done | Authority files and protocols listed above |
| P0.2 plan/audit/decisions | Done | PR #60 docs read from `origin/main`; Plan sections 8.2, 14, 15, 31, 32 inspected |
| P0.3 runtime owner files | Done | Edge and mobile files inspected; owner map reconciled |
| P0.4 `callAI` inventory | Done | Table below |
| P0.5 alignment gate | Open | Section 32 says build after section 31 and read-only verification before code |
| WBF.0 boundary spec | Drafted | `docs/architecture/kael-worker-advisory-boundary-spec-20260604.md` |

## callAI Inventory

| Stage or purpose | File | Output kind | Streamable? | Reason |
|---|---|---|---|---|
| `intent_classification` | `supabase/functions/mobile-api/_shared/kael/intent.ts` | Structured JSON | No | Parsed by `intentResultSchema`; drives service/scope decisions |
| `clarification` via intake diagnosis | `intent.ts` | Structured JSON with optional question field | Not in current form | The question is embedded in structured output; token streaming would require a separate text completion |
| `vision_analysis` | `vision.ts` | Structured JSON/image analysis | No | Image input plus `visionResultSchema`; not a safe token field |
| `market_lookup` | `market.ts` | Structured JSON/citations | No | Market range/citation object; not user-visible free text stream |
| `price_synthesis` main | `pipeline.ts` / `synthesis.ts` | Deterministic synthesis | No | No `callAI`; money estimate must never token-stream |
| `price_synthesis` A/B eval | `price-synthesis-ab.ts` | Structured JSON eval | No | Admin/eval path, schema-bound |
| `scope_change` review | `scope-change.ts` | Structured JSON | No | Money/scope-sensitive |
| `scope_change` estimate | `scope-change.ts` | Structured JSON | No | Money/scope-sensitive |
| `advisory_generation` current | `advisory.ts` | Deterministic text | Not applicable | No `callAI` today |
| `worker_assist` future | Not implemented | Single advisory text plus structured rails | Candidate after WBF.4 | Section 32 identifies this as the proper token-stream surface once safety passes |

Provider client finding:

- `supabase/functions/mobile-api/_shared/kael/provider-client.ts` currently buffers provider responses and parses JSON.
- There is no streaming mode yet.

## Current Code Findings

- `updateKaelProgress` only writes `jobs.kael_progress` and returns early without a job id.
- Customer chat calls `runKaelPipeline` without a progress target, so chat progress is not written.
- `GET /kael/chat/:id/progress` does not exist.
- `apps/mobile/lib/api.ts` buffers full response text.
- Customer `KaelLiveActivityIndicator` derives labels from local client state, not real backend stage progress.
- Worker `askKaelForWorker` is a deterministic capped Q&A stub using `kael_worker_qa_log`.
- Worker JobRoom chat is human relay through `/jobs/:id/messages`, not AI.
- Worker memory read/delete exists; worker feedback and training consent are missing.
- Existing contact-leak guard is not proven for both worker-to-customer and customer-to-worker directions.

## Section 31 Dependency Audit

Section 32 says: build after section 31.

Section 31 is not a small prerequisite. It is a 26-phase, sequential plan with K0, Tracks A-D, and K-FINAL. Current local dirty worktree shows partial work for section 31, especially A/B areas:

- A5 eval harness artifacts exist.
- B3 knowledge corpus artifacts exist.
- B4/B5 migrations and tests appear to be in progress.
- Dirty files include learning, knowledge, RAG, admin, and type changes.

Evidence that section 31 is not proven complete:

- No `docs/test-logs/2026-06-04_kael-core-baseline.md` was found for section 31 K0 baseline.
- Existing section 31 test logs cover B3 and A5 deterministic evaluation, not K-FINAL.
- The A5 eval log explicitly says deterministic mode is not a substitute for scheduled live provider run.
- The B3 corpus gate says production application still requires the normal Supabase/staging apply gate.
- No current evidence proves KF.1 end-to-end staging path across A+B+C+D.
- No current evidence proves section 31 Claude verification/sign-off.
- Worktree is dirty and branch `origin/pr/58` is gone, so code state cannot be treated as a verified shipped baseline.

Conclusion:

- Section 32 read-only P0/WBF.0 can continue.
- Section 32 code implementation should not start until Tu or Claude confirms the section 31 gate is satisfied or explicitly overrides it for this branch.

## Files Added By This Pass

- `docs/architecture/kael-worker-advisory-boundary-spec-20260604.md`
- `docs/test-logs/2026-06-04_kael-section32-phase0-readiness.md`

## Recommended Next Action

If Tu wants section 32 implementation to proceed in parallel with the unfinished section 31 work, record that as an explicit override and keep all section 32 code behind narrow, test-proven contracts:

1. Start with Part A P1 backend only.
2. Avoid touching section 31 dirty learning/knowledge implementation paths except where progress plumbing requires the same Kael pipeline types.
3. Run targeted Edge/router/shared tests after each small step.
4. Do not claim frontend phases done without native Expo evidence.
