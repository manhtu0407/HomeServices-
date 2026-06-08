# Kael Worker On-Site Vision + Advisory — Execution Plan (for Codex)

Date: 2026-06-08
Status: APPROVED scope, decisions locked by Tu 2026-06-08. Build owner: Codex. Verify owner: Claude. NOT started.
Surface: Supabase Edge `mobile-api` (worker Kael advisory) + Expo React Native worker app.
Priority: **1** (Tu's explicit scenario). Sequenced before the UX quick-wins plan (`docs/design/kael-chat-ux-quickwins-20260608.md`).
Scope: give the worker advisory Kael chat the ability to **see** on-site photos the worker sends, identify what is in them (honestly, with bounded certainty), and discuss next steps — reusing the existing vision gateway, never granting money/scope/status authority.

This is an engineering artifact (English technical). Vietnamese only for user-facing copy strings.

> **CODEX ROLE DIRECTIVE (read first).** Senior Anthropic product engineer on "structured model output → safe rendered surfaces", deep RN + AI-safety-in-UI. Tu's co-founder, not a code generator. The hard part here is **honest vision under a safety-critical trade (electrical/plumbing)** — strong identification WITHOUT false certainty. Challenge weak assumptions, smallest safe change, visible-in-app evidence before "done". Vision *sees*; the advisory *reasons*; the human worker *confirms* safety-critical specifics. Never let vision unlock money/scope/status.

---

## 0. Metadata

- **Trigger:** Tu (2026-06-08): "khi thợ phát hiện biến số on-site rồi trao đổi với Kael, Vision của Kael cần thật mạnh để xác định rõ nó là gì, xong mới trao đổi tiếp." Audit found the worker advisory chat (§32 B-FUNC) is built but **blind**: `worker-assist.ts` receives `mediaRefs` yet only passes `media_ref_count` to the model ([worker-assist.ts:416](../../supabase/functions/mobile-api/_shared/kael/worker-assist.ts)) and sends **no image blocks** ([worker-assist.ts:202-209](../../supabase/functions/mobile-api/_shared/kael/worker-assist.ts)); vision (`analyzeDescription`) runs only in the customer pipeline ([pipeline.ts:187](../../supabase/functions/mobile-api/_shared/kael/pipeline.ts)).
- **Authority refs (cannot be bypassed):** `RULES.md` #2 (AI server-side via `callAI`), #3 (Zod-validated AI output), #6 (service scope), #8 (no fake data / no false certainty), #9 (no PII in logs/rows). `STRUCTURES.md` runtime lock + worker address-privacy. `critical.md` §0 lifecycle/verify gates. `CLAUDE.md` runtime boundary (mobile never calls AI; money/scope only via validated `KaelAutonomyDecision`). `docs/architecture/code-ownership-map.md` (Kael provider pipeline + worker workflow owners). `docs/architecture/kael-worker-advisory-boundary-spec-20260604.md` (advisory boundary — vision must stay inside it).
- **Owner files:**
  - engine: `supabase/functions/mobile-api/_shared/kael/worker-assist.ts` (advisory engine — add the seeing channel here).
  - vision gateway (reuse): `supabase/functions/mobile-api/_shared/kael/vision.ts` (`analyzeDescription`, `fetchVisionImageBlocks`), `prompts.ts` (`buildVisionMessages`), `types.ts` (`visionResultSchema`), `routing.config.ts` (`vision_analysis` budget), `utils.ts` (`sanitizeVisionPhotoUrls`).
  - worker chat handlers + media access: `supabase/functions/mobile-api/_shared/services.ts` (worker Kael chat turn handler), `_shared/access.ts`, private Storage signed-URL helper.
  - safety: `permission-gate.ts`, `self-check.ts`, `ai-boundary-contract.ts` (`detectForbiddenAiDecisionText`).
  - mobile worker: `apps/mobile/components/worker/worker-surfaces.tsx` (worker Kael chat surface), `apps/mobile/lib/{services.ts,media-upload.ts}`.
  - tests: `apps/api/src/__tests__/unit/mobile-api-worker-kael-chat.test.ts` (extend), edge schema tests, RLS tests.
- **Skills mapping:** `kael-ai-boundary` (advisory-only, no money/scope, structured-output-first), `kael-security-sweep` (RLS worker-media isolation, no PII, no provider names, prompt-injection-via-image), `kael-supabase` (signed-URL access + any schema change + RLS tests), `kael-frontend-test` (worker surface RNTL + recording), `kael-tdd` (failing test first), `karpathy-guidelines` (surgical diffs).
- **Decision log:**
  - 2026-06-08 — Tu: build worker on-site vision + advisory FIRST (before UX quick-wins).
  - 2026-06-08 — Claude **(D1)** reuse the existing vision gateway; do **not** build a new vision/OCR system (the prior audit established the gateway already exists; OCR/OD deferred — no use case, no self-host infra).
  - 2026-06-08 — Claude **(D2, default — confirm in Phase 0)** prefer **Option 1: separate vision pass → structured findings → advisory** over sending raw images into the `worker_assist` completion. Option 1 preserves "separate seeing from reasoning" (Tu's own IUG principle), keeps `worker_assist` provider-flexible, and makes the vision finding independently Zod-validated/auditable. Option 2 (single vision-capable `worker_assist` call) is a later cost optimization.
  - 2026-06-08 — Claude **(D3, honesty boundary, LOCKED)** worker vision output MUST carry a confidence and a `requires_direct_verification` signal; for safety-critical claims (especially **electrical**) the advisory phrases findings as a hypothesis + asks the worker to confirm, and NEVER asserts safety certainty. Vision never unlocks money/scope/status — the existing `guardWorkerAssistText` / `detectForbiddenAiDecisionText` / `self-check` guards stay in force on every turn.
- **Change log:** 2026-06-08 v0.1 — initial plan (Claude), after confirming `worker-assist.ts` is blind.

---

## 1. Problem (audit-grounded, evidence cited)

- Worker advisory chat exists (migrations `20260604224500_kael_worker_chat_sessions.sql`, engine `worker-assist.ts`, `worker_assist` routing, test `mobile-api-worker-kael-chat.test.ts`) — multi-turn, Zod-validated, permission-gated, self-checked, PII-scrubbed, money/status-guarded. Strong discipline.
- **But it cannot see.** `runWorkerAssist` → `buildWorkerAssistContext` injects only `media_ref_count` ([worker-assist.ts:416](../../supabase/functions/mobile-api/_shared/kael/worker-assist.ts)); `buildWorkerAssistRequest` messages are text-only ([worker-assist.ts:202-209](../../supabase/functions/mobile-api/_shared/kael/worker-assist.ts)). So a worker who attaches an on-site photo and asks "cái này là gì / có nguy hiểm không?" gets an answer generated **without the image**.
- Vision is customer-pipeline-only ([pipeline.ts:187](../../supabase/functions/mobile-api/_shared/kael/pipeline.ts)). The reusable gateway (`analyzeDescription` + `fetchVisionImageBlocks` + `visionResultSchema`) already enforces fetch guards (timeout 5s, max 4MB, media-type whitelist, URL sanitize) and structured Zod output.
- Adjacent: scope-change uses only a `hasPhotos` boolean ([scope-change.ts] has no image/vision) — same blindness at the money-risk moment.

---

## 2. Reframe (locked)

- **Add a seeing channel to worker-assist by reusing the vision gateway** (D1) — not a new system.
- **Separate seeing from reasoning** (D2): run a vision pass on the worker's media → produce a Zod-validated structured finding → feed that finding (text) into the advisory context. The advisory model reasons over clean, validated findings, not raw pixels.
- **Honest, bounded certainty** (D3): findings carry confidence + `requires_direct_verification`; advisory presents safety-critical identification as hypothesis-to-confirm. Electrical especially: no "safe to touch" certainty from a photo.
- **Zero new authority**: vision changes nothing about money/scope/status. All existing worker-assist guards remain; the seeing channel cannot bypass them.
- **Worker media privacy** (STRUCTURES): worker on-site photos are private Storage; vision fetch must use a server-side signed/service-role read, never a public URL, and findings/logs must hold no PII (RULES #9).

---

## 3. Execution plan

Conventions per step: **File(s) → Action → Acceptance → Evidence/Test → Verify (Claude)**. Surgical diffs. Each phase ends with `/log`. Safety suite (Phase 3) is a **hard gate** before any mobile wiring.

### Phase 0 — Pre-plan / confirm (Codex reads; NO code)
- **0.1** Governance read (authority order); restate runtime lock, RULES #2/#3/#6/#8/#9, advisory boundary, worker address/media privacy.
- **0.2 (media access)** Confirm how the worker Kael chat turn handler in `services.ts` obtains `mediaRefs` and whether they are **signed/service-role-readable** URLs that `fetchVisionImageBlocks` can fetch (worker media is private Storage). **Acceptance:** documented path; if signed URLs are not yet generated for worker chat media, add that as Phase 2.0.
- **0.3 (provider)** Confirm the `worker_assist` provider/model + cost/latency budget in `routing.config.ts`, and whether a vision pass should reuse `vision_analysis` routing or get a worker-scoped vision budget. **Acceptance:** chosen routing + cost ceiling for the extra vision call; confirm D2 (Option 1) vs Option 2.
- **0.4 (honesty)** Confirm electrical safety phrasing rules with `kael-ai-boundary` + charter; define the `requires_direct_verification` triggers. **Gate:** Tu signs off Phase 0 restatement before Phase 1.

### Phase 1 — Worker vision finding schema (Zod; Vitest/edge tests)
- **1.1** **File:** `kael/types.ts` (or `packages/shared/kael/schemas` if shared). **Action:** define `workerVisionFindingSchema` — reuse `visionResultSchema` fields (`problem_identified`, `severity_indicators`, `complexity_hint`) **plus** `confidence: number 0..1` and `requires_direct_verification: boolean` (+ optional `safety_flags: string[]`). `.strict()`. **Acceptance:** valid/invalid coverage; `requires_direct_verification` defaults true on low confidence. **Evidence:** schema tests. **Verify:** Claude.

### Phase 2 — Backend: worker-assist sees (Option 1)
- **2.0 (if 0.2 requires)** generate signed/service-role read URLs for worker chat media before vision fetch. RLS-safe. **Verify:** Claude.
- **2.1** **File:** `worker-assist.ts` (+ reuse `vision.ts`). **Action:** when `mediaRefs` is non-empty, run a vision pass (reuse `analyzeDescription` or a worker-scoped `analyzeWorkerMedia`) → `workerVisionFindingSchema`; on success inject a **structured findings block** into `buildWorkerAssistContext` (replace the bare `media_ref_count`); on failure fall back to count + neutral copy (never fake a finding). **Acceptance:** with a photo, the advisory answer is grounded in real findings; without/with failure, graceful text-only behavior. **Evidence:** unit (mocked vision) + integration (real image → finding → advisory). **Verify:** Claude reads the grounded answer.
- **2.2 (cost/latency)** **File:** `worker-assist.ts`, cost-tracking. **Action:** log the extra vision call cost; keep within the 0.3 budget; respect the worker chat rate-limit/cap. **Verify:** Claude.
- **2.3 (honesty wiring)** **File:** `worker-assist.ts`, `prompts.ts`. **Action:** when `requires_direct_verification` or low confidence, the advisory MUST hedge ("Kael nhìn ảnh thấy có thể là …, bạn xác nhận giúp …") and, for safety topics, add a verification safety note. **Acceptance:** low-confidence/electrical fixture never yields a confident safety assertion. **Verify:** Claude.

### Phase 3 — Safety suite (HARD GATE before mobile)
- **3.1** Negative tests: vision finding cannot make the advisory set price/scope/status or move support off-app (existing guards still trip). **Verify:** Claude.
- **3.2** False-certainty test: an electrical photo yields hedged language + `requires_direct_verification`, never "an toàn để chạm/đấu". **Verify:** Claude.
- **3.3** Prompt-injection-via-image (text embedded in the photo telling Kael to ignore rules) is ignored; self-check still screens. **Verify:** Claude.
- **3.4** RLS: worker A cannot trigger vision on worker B's media; no PII / no provider names in findings, logs, or rows. **Verify:** Claude.

### Phase 4 — Mobile worker surface (visible)
- **4.1** **File:** `apps/mobile/components/worker/worker-surfaces.tsx` (worker Kael chat). **Action:** ensure on-site **photo attach** in the worker Kael chat (reuse media-upload), and render Kael's vision-grounded answer honestly — show what Kael saw + the confidence/"cần xác minh" treatment; never a bare confident claim. **Acceptance:** worker can attach a photo, ask, and see a grounded, honestly-hedged answer. **Evidence:** RNTL + device recording (light/dark/Reduce Motion). **Verify:** Claude; not done without recording.
- **4.2 (a11y)** screen-reader summary of the finding; Reduce Motion/Transparency honored. **Verify:** Claude.

### Phase 5 — Close-out
- Honesty + security audit (RULES #8/#9, `kael-security-sweep`); cost check; `/log` + `/test-log`; update `code-ownership-map.md` (worker-assist now has a vision channel); flag the scope-change photo-evidence reuse (§6) for a follow-up. **Verify:** Claude + Tu.

---

## 4. Honesty & safety contract

- Vision **sees and hypothesizes**; it never certifies safety. Safety-critical identification (electrical live parts, gas, structural) is always hypothesis + "thợ xác minh trực tiếp".
- Vision changes **no** money/scope/status; all worker-assist guards remain authoritative.
- No fabricated findings: vision failure → honest text-only fallback, never a guessed object.
- Worker media stays private (signed/service-role read); no PII, no provider names in findings/logs/rows.

## 5. Risks & mitigations
- **Worker private-media fetch** → signed/service-role URL (Phase 0.2 / 2.0); never public.
- **Cost of a 2nd AI call** → budgeted in 0.3; vision only when media present; cap respected.
- **Electrical false certainty** → D3 hedge + `requires_direct_verification` + safety suite 3.2.
- **Latency** (vision + assist) → reuse the §32 thinking-state on the worker chat (the perceived-perf mechanism already exists).
- **Runtime lock** → all server-side; advisory-only; no `KaelAutonomyDecision` change.

## 6. Follow-up (flagged, not in this plan)
- **Scope-change photo evidence check:** reuse this seeing channel so Kael verifies whether worker scope-change photos actually support the claimed extra work (strengthens `anti-fraud.ts` at B6/A11). Separate plan once this lands.

## 7. Limitations / honesty
- VLM identification accuracy on real on-site photos is **unverified** until Phase 2 integration on real images; the plan assumes hedged, confidence-bounded output, not perfect recognition.
- Worker-media signed-URL path is assumed until Phase 0.2 confirms it.
