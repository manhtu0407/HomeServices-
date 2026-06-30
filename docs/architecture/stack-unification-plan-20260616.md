# Stack Unification Plan (Issue #5) — Supabase + Code Regions

> **STATUS: DRAFT — PARKED. Do NOT build yet.**
> Tu's directive (2026-06-16): write this plan, leave it with thorough notes, then discuss the
> remaining items (#3 UI/UX-in-STRUCTURES, #4 README, #2 test/skill eval) — and only AFTER all 5
> are discussed do we "build tổng thể một lần" (build everything in one pass). This doc is the
> context anchor for that build. No code until the full 5-item discussion is closed and Tu approves.

- **Date:** 2026-06-16
- **Owner:** Tu (founder) + Claude (technical co-founder)
- **Scope:** Issue #5 of the 5-item stack-reorg initiative. #5 = re-arrange Supabase (if needed) + re-arrange code regions. UI itself is NOT in #5 — it comes in #3.
- **Authority refs:** `CLAUDE.md` (locked runtime path, Kael autonomy rules), `RULES.md` (#1 no client secrets, #9 no PII in logs, no hardcoded VND), `STRUCTURES.md` (workflow truth — #3 will edit it), `skills.md` Core Skill 5 (comment discipline, from #1).
- **Related docs:** `docs/architecture/code-ownership-map.md`, `docs/architecture/migration-chain.md`, `docs/design/kael-voice-stt-tts-20260608.md`, `docs/design/kael-worker-onsite-vision-20260608.md`, `docs/design/worker-map-real-provider-20260608.md`.

---

## §0. How to use this doc (read first if resuming cold)

This plan was produced from a **live read-only audit** of PROD Supabase + a full **8-subsystem code map** + the **design handoff zip** (`nestscout-codex-handoff.zip`). Every claim below is evidence-backed (§2). If you are an agent resuming this work:

1. Read §2 (evidence) and §3 (locked decisions) before proposing anything.
2. Do NOT re-derive the audit — it is captured here. Re-verify a specific fact only before editing the thing it describes.
3. The build is gated: nothing executes until Tu closes the #3/#4/#2 discussions and approves a combined build.
4. #3 will introduce Frontend/UI scope that **overlaps Track C (mobile surfaces)** — reconcile C1/C4-mobile with #3 before building (see §6 cross-dependency note). This is WHY Tu sequenced 5→3→4→2-then-build-once.

---

## §0.5 — Arrangement Philosophy (THE WAY Tu wants it organized) — guiding principle

> Confirmed by Tu 2026-06-16 ("đúng ý tôi rồi"). This GOVERNS every decision in Track C AND the Track S data shapes. When in doubt during the reorg, re-read this section. It is the kim chỉ nam.

**One unified philosophy for BOTH Supabase and code — not two separate concerns:**
> Gather tightly-related things into cohesive groups ("chains"), laid out by logic and order, so the structure is instantly scannable, clean, and refined ("tinh tế").

**The image-1 → image-2 nuance (CRITICAL — do NOT misread):**
- **image-1 (current pain)** = a chaotic, undifferentiated mess that costs a human/AI a lot of time and tokens just to understand. In our codebase this shows up as BOTH extremes at once: a few giant god-files (`services.ts` 10K, `*-surfaces.tsx` 9.7K/7.8K) AND one concept scattered across many places (`KaelEstimate` ×4, Kael brain in 2 runtimes, contract in 3 places).
- **image-2 (target)** = FEWER, COHESIVE, DIFFERENTLY-SIZED blocks grouped by relation, in a clean layout you understand at a glance.
- **Therefore the goal is RIGHT-SIZING + GROUPING-BY-RELATION, NOT fragmentation.** Do NOT chop everything into hundreds of uniform tiny files (that recreates image-1's noise). Do NOT keep giant blobs. Each module is sized to its domain — some larger, some smaller — and is one strong, self-contained chain. **Success metric = "can a human/AI look and understand fast," NOT "lines per file" or "number of files."** (Earlier framing that emphasized "split god-files into ~400-line files" was too narrow — the principle is cohesion + right-size, not a target line count.)

**Consequences that bind this plan:**
- One concept = one canonical home; the whole codebase speaks ONE organizational language (look anywhere, see the same order).
- Consolidate scattered/duplicated pieces (one home) AND break overloaded god-files — both serve the SAME goal: a structure easy to see, develop, and extend.
- **Data-side emblem:** "one clean, complete, ordered view of each worker" (Tu's "1 bảng đủ thông tin mỗi worker, dễ nhìn, tinh tế"). Realized by `worker_overview` / `customer_overview` VIEWs over the normalized tables + `worker_stats`/`customer_stats` — i.e., Tu's idea delivered in its best form. **RETRACT the earlier "mega-table is an anti-pattern" framing** — the real need is READABILITY of a whole worker at a glance, which the view gives without breaking the DB.
- Forward-looking: an improvement that creates momentum (đà) for future build / bugfix / enhance — not a one-off cleanup.
- Permanent: enforced by a strict rule (Core Skill 6, §5 C5) so agents never re-create the mess.

**Tu's term "Charts":** interpreted as the backend's current sprawling/fragmented structure (many disconnected pieces across 69 tables + scattered files) that feels "rườm rà" — exactly what this reorg consolidates. (Interpretation accepted under "đúng ý tôi rồi"; revisit if Tu meant something more specific.)

---

## §1. Why #5 exists — Tu's concerns (verbatim intent)

**Supabase worries:**
- (A1) Design shows rich profile data (worker tier/level/points, badges, performance radar, income trend, on-time/completion %; customer rank, trust score, money-protected). **Does Supabase actually store/compute these, or is it surface-only?**
- (A2) Worried no storage exists for Kael-received **images, videos, and voice**. Voice especially — could it make Kael smarter over repeated listens?
- (A3) Backend feels fragmented ("Charts / rườm rà"). Wants, e.g., 5 workers → a clean, ordered, readable view of each worker's full info.
- (A4) Is the backend optimized to run smoothly at ~1000 users? Will upgrade to Pro/Max at launch. Are we production-ready for many users?
- (A5, added 2026-06-16) Payment Gate: Supabase must build a real payment subsystem (orders + immutable ledger + protected money state + worker wallet + payout + webhooks + refunds), per `design/PAYMENT_GATE_ARCHITECTURE_AND_UX.md`. Currently only `jobs.final_price`/`paid_at` + a Sepay webhook stub exist. See §S4.

**Code-region worries:**
- (C-want-1) Review (with EVIDENCE, not eyeballing) whether code is chaotic / lacks continuity / hard to develop.
- (C-want-2) Move from image(1) (chaotic uniform mess, expensive for devs/AI to parse) → image(2) (organized groups / strong "chains" of tightly-related code).
- (C-want-3) The re-arrangement is an improvement that sets up momentum for future build / bugfix / enhance — not just a one-off fix.

---

## §2. Evidence dossier (proven, 2026-06-15/16 audit)

**Projects:** PROD `HomeServices` = `iwevizmsedyqozxlawwl`; STAGING `HomeServices Staging` = `xyylanuyflrjzbjzhqfl`. Both ap-southeast-1, PG17.

**Security/posture (PROD, strong):** RLS enabled on **all 69 public tables**. Only **1 security advisor WARN**: leaked-password protection disabled (enable HaveIBeenPwned in Auth). anon/PUBLIC grants revoked; authenticated workflow DML revoked (Edge service_role owns workflow writes). Workflow atomic RPCs are `SECURITY INVOKER` (respect RLS); only service-role-only ops (spend/learning/autonomy/rate helpers) are `SECURITY DEFINER`. ~37 public RPC + 7 private helpers. **155 migrations** (20260511→20260615). **1 Edge function** deployed: `mobile-api` v30.

**Data = pre-revenue/seed:** profiles 3, customer 1, worker 1, jobs 24 (test), chat_messages 0, reviews 0, disputes 0 → **zero real transactions yet**. (Implication: any "stats" are currently empty/mock; gamification has no real data to calibrate against — see D1.)

**Extensions installed:** `vector` (pgvector 0.8 → RAG), `pg_cron` (scheduler), `vault`, `pgcrypto`, `uuid-ossp`, `pg_stat_statements`. **No PostGIS** — geo = hand-written `distance_km()` + VietMap proxy. `pgmq` available but unused (custom `kael_learning_queue` table instead).

**Storage:** 5 buckets, all private — `job-photos` (img+mp4), `job-media` (img+mp4, 25MB), `completion-photos` (img), `worker-documents` (img), `worker-verification` (img+pdf). **No bucket allows audio mime.** `job_media_assets` table tracks job media (bucket_id/object_path/mime/safe_metadata). `kael_chat_turns` + `kael_worker_chat_turns` have `content_type` + `media_refs[]` (can reference media) but no audio home. `kael_analysis_artifacts` exists but **0 rows** (vision results likely not persisted yet → "worker-assist BLIND").

### A1 — Profile feature → backend backing (the key evidence table)

| Design feature | Backed? | Evidence |
|---|---|---|
| Worker rating 4.9 | YES | `worker_profiles.rating` + `update_worker_rating()` |
| Worker total jobs 128 | YES | `worker_profiles.total_jobs` |
| Reviews list | YES | `reviews` (idx worker_id) |
| Customer member-since | YES | `customer_profiles.created_at` |
| Worker tier "Cấp 4" + points 480/900 | **NO** | no tier/level/points column or table |
| Completion% / on-time% / response-time 18m | **NO** | no aggregate column/table/view |
| 30-day income + trend chart | **NO** | no earnings ledger; `jobs` has only `final_price` (int), **no `worker_net`/`platform_fee` columns** (net is computed FE-side from a constant fee) |
| Badges / achievements / performance radar | **NO** | no badges/achievements table |
| Customer rank "Hạng 3" + points 620/1000 | **NO** | no rank/tier/points column or table |
| Trust score 92 / money-protected 2.150.000đ / dispute-free 100% | **NO** | no column/table (`source_trust_registry.trust_score` is for MARKET DOMAINS, not customers) |
| Customer bookings 24 / total spent | derivable | from `jobs` (idx customer_id), not stored as aggregate |

`worker_profiles` columns: id, service_types[], years_experience, districts[], is_approved, is_available, cccd/selfie urls, bank_*, **rating**, **total_jobs**, verification_status, is_suspended, legal_name, dob, gender, home_lat/lng, service_radius_km, problem_specializations[]. → has primitives, **no stats/tier/income**.
`customer_profiles` columns: id, building_name, unit_number, floor, district, created_at, updated_at. → **address only**, no rank/trust/stats.

Cross-check from the design source: `CODEX_REBUILD_PROMPT.md` mandates *"UI-layer replacement. Nothing else changes... if any UI change requires modifying business logic, STOP."* → Codex builds these profile screens as **UI with mock numbers**; it will NOT create backend. Frontend grep confirms the profile (group F) screens are largely **not built yet** (worker-surfaces 1 hit, customer-surfaces 14). **Conclusion: the gamification/reputation layer is design-spec only — no storage, no computation.**

### A4 — Scale evidence (1000 users)
- Hot-table indexes are GOOD: `jobs` (customer_id, worker_id, status, status_created_at, created_at, idempotency, service_problem_id), `job_broadcasts` (job_id, worker_id, status, unique job+worker), `chat_messages` (job_id, created_at, sender_id), `notifications` (user_status, job_id), `reviews` (worker_id, customer_id, job_id unique), `job_events` (job_id_created_at, actor_id).
- **`worker_profiles` has ONLY pkey** — no index on `is_available`/`districts`/`service_types` → worker-matching query = **seq scan** (bad at scale).
- **Realtime is POLLING** (15–20s intervals; `realtime.ts` prepared but NOT wired). At 1000 active users ≈ **~67 req/s baseline just for polling** → Edge + DB load. This is the bigger scale risk than indexes.
- RLS calls `private.is_*` helpers per row — acceptable, watch at scale.
- **No load test has been run** (data ~0). Pro/Max upgrade helps compute/connections but does NOT fix the matching index gap or the polling architecture.

### Code-region evidence (image-1 reality, measured — not eyeballed)
- God-files: `supabase/functions/mobile-api/_shared/services.ts` = **10,010 lines**; `apps/mobile/components/worker/worker-surfaces.tsx` = **9,709**; `apps/mobile/components/customer/customer-surfaces.tsx` = **7,776**; `supabase/functions/mobile-api/_shared/router.ts` = **2,535**; `apps/mobile/lib/frontend-workflow-provider.tsx` = **1,382**; `auth-surfaces.tsx` = 1,881; `booking-wizard.tsx` = 1,685; `kael-chat/agentic-parts.tsx` = 1,206.
- **Kael brain duplicated across 2 runtimes:** Edge `supabase/functions/mobile-api/_shared/kael/` = **40 files**; Next.js `apps/api/src/lib/kael/` = **10 files**. Different concurrency (Edge parallel / Next.js sequential), different fallbacks, different log schemas. Prompts duplicated in both `prompts.ts`. Learning duplicated (Edge async/queue vs Next.js sync), both writing `learning_candidates`/`learning_rules`.
- **Contract duplicated in 3 places:** mobile `apps/mobile/lib/api-types.ts` (re-declares), Edge `router.ts` (own copies), `packages/shared/src/types/api-responses.ts`. Plus `supabase/functions/_shared/domain.ts` (628-line standalone copy of `packages/shared` constants+validation; **0 npm imports**; parity test `contracts-parity.test.ts` is **shape-only/regex** — value drift passes).
- **Workflow state machine in 2 places (Edge):** `lifecycle.ts` (VALID_TRANSITIONS) vs `workflow-orchestrator.ts` (29 events); autonomy-gate is a 3rd validation layer.

---

## §3. Locked decisions (2026-06-16)

- **D1 — Gamification scope = "core-derivable real now, rest deferred."** Build REAL backend ONLY for metrics derivable from existing data (completion%, on-time%, response-time, income-30d, bookings, total-spent) via `worker_stats`/`customer_stats`. **Defer** tier/level/points, badges/achievements, customer rank, trust-score algorithm until real transactions exist (need real data to calibrate formulas/thresholds; avoid building for unearned scale per CLAUDE.md). Until then the deferred items render with mock UI — acceptable for now, flagged.
- **D2 — Voice = transcripts-only.** STT on-device → store TEXT in `kael_chat_turns.text_content`. **No audio bucket, no voice/audio table.** Rationale: raw voice is biometric PII (RULES #9), storage-heavy; Kael learns from transcript content, not waveforms. Revisit raw-audio only with a proven training need + consent + retention policy. (Consistent with `docs/design/kael-voice-stt-tts-20260608.md`.) Images + video storage already exist (no change needed there).
- **D3 — One Kael brain = Edge canonical (option B + shared-core lift).** RN app only talks to Edge `mobile-api` (locked runtime); `apps/api` is NOT on the RN path. So Edge is the single source of truth for Kael. `apps/api`'s parallel Kael/learning is consolidated away (retired or reduced to importing shared core); pure runtime-agnostic logic (price synthesis, prompt templates, schemas, fallback builders) lifts into `packages/shared/kael` as ONE source. `apps/api` keeps only genuine admin/support surfaces (calling Edge/DB, no duplicated brain). Rationale: RN-first, kills drift, fastest to first transaction. Deno↔npm import resolution for shared is the implementation hurdle (see C2).
- **D4 — Payment = Managed-Marketplace Hybrid (CONVERGED 2026-06-16, Tu "hướng a"; full design §S4).** HS = **principal** (sells the service, dispatches paid-subcontractor workers priced by Kael) → money received = revenue, paying workers = paying contractors. **Digital** = HS business account (SePay inbound) or licensed intermediary HOLDS → forward worker net (fee withheld) = "Bảo vệ thanh toán". **Cash** = customer pays worker direct → fee collected from worker via pre-paid `worker_fee_wallet`. Kael advises only, never moves money. GATES (not built until resolved): legal confirms principal + worker-subcontractor contracts (OQ7); accountant VAT-on-gross; provider choice (OQ8); phasing (OQ9).

---

## §4. Track S — Supabase plan

### S1 · `worker_stats` + `customer_stats` aggregate tables  → solves A1-core + A3
**Why (A3 reconciliation):** Tu wants "1 table holding each worker's full info, ordered, readable." A single mega-table for everything is an anti-pattern (wide/sparse, hard to RLS/index). The right shape that achieves Tu's goal: keep normalized tables, ADD a per-actor aggregate (1 row/worker, 1 row/customer) holding exactly the displayed metrics, plus a read-only VIEW that joins the pieces for admin readability.

- `worker_stats` (1 row per worker): `worker_id` PK/FK, `completion_rate`, `on_time_rate`, `avg_response_time_min`, `income_30d`, `jobs_30d`, `total_income`, `cancel_rate`, `last_recomputed_at`. (rating/total_jobs stay on `worker_profiles`; do NOT duplicate — reference.)
- `customer_stats` (1 row per customer): `customer_id` PK/FK, `bookings_total`, `bookings_30d`, `total_spent`, `dispute_free_rate`, `last_recomputed_at`.
- **Maintenance:** event-driven counts via trigger/RPC at workflow transitions (job confirmed/paid/reviewed/cancelled); rolling-window metrics (income_30d, rates) via a **`pg_cron`** daily recompute (pg_cron is installed). Backfill once from existing `jobs`/`reviews`.
- **Read VIEW** `worker_overview` / `customer_overview` joining profile + stats for admin/debug "see everything about X."
- **Deferred (D1):** tier/points/badges/trust-score get their OWN tables + formulas later; `worker_stats`/`customer_stats` are designed to be extended (add columns) without rework.
- **Note:** income needs a per-job net. Today `jobs.final_price` exists but net is FE-computed from a constant fee. Decide: add `jobs.worker_net`/`platform_fee` columns (persist net at payment) OR compute net in the stats recompute from `final_price` × fee. Prefer persisting net at `paid` for auditability.

### S2 · Scale → solves A4
- Add indexes on `worker_profiles`: partial index on `is_available WHERE is_available`, GIN on `districts`, GIN on `service_types` (or `problem_specializations`) — to make matching index-driven, not seq-scan.
- Realtime: wire `realtime.ts` (`subscribeToJobMessages`/`subscribeToJobStatus` already written) as the primary live path with polling as reduced-interval fallback (the hybrid the code already hints at). Reduces the ~67 req/s polling load at 1000 users.
- Load-test checklist BEFORE claiming production-scale: simulate ~1000 concurrent users on the hot paths (job timeline read, broadcast accept, chat, realtime subscriptions); measure p95 latency, DB CPU, connection count, Edge cold-starts. Decide tooling (k6 against Edge + pgbench-style on RPC). Record results in `docs/test-logs/`.

### S3 · Storage tidy → minor "sắp xếp"
- Evaluate consolidating the 3 job-image buckets (`job-photos`, `job-media`, `completion-photos`) and the 2 worker-doc buckets (`worker-documents`, `worker-verification`). `completion-photos` is a distinct lifecycle stage — may keep but unify naming/policy. Migration must preserve existing objects + `job_media_assets.bucket_id` refs (8 rows live). Low priority.
- Confirm voice = transcript (D2): no audio bucket added.

### S4 · Payment Gate — Managed-Marketplace Hybrid (CONVERGED & LOCKED 2026-06-16, Tu chose "hướng a")
Source of truth: `design/PAYMENT_GATE_ARCHITECTURE_AND_UX.md` (CHỐT) + flow `design/flows/06_payment_gate_final.png`. This supersedes the earlier generic-escrow framing. Build as ONE cohesive payment chain (tables + services + RPCs + webhook + Kael boundary) per §0.5 — NOT scattered.

**Positioning (Tu 2026-06-16) — what makes the money model legal-cleaner:** HS is a **managed marketplace / principal** — "HS cung cấp dịch vụ + điều phối thợ" (Urban-Company-style). Customer buys *Home Services' service*; workers are **HS's paid subcontractors**, priced/dispatched by Kael. So money received = HS revenue, paying workers = paying contractors (NOT pure payment intermediation). GATE: legal confirms this + worker-as-subcontractor contracts (OQ7).

**Two payment paths, ONE fee-collection philosophy (the platform fee is ALWAYS captured):**
- **Digital (protected — keeps "Bảo vệ thanh toán"):** customer → **HS business account (inbound confirmed by SePay) OR a licensed intermediary** → money held in protected state → on completion, **forward the worker's net share (platform fee withheld)** via a chi-hộ provider or manual transfer. Full money state machine + immutable ledger apply.
- **Cash (unprotected):** customer pays the worker in cash directly → HS never touches it → platform collects its fee **from the worker** via a pre-paid `worker_fee_wallet` (insufficient balance → worker can't accept new jobs = collection guarantee).
- **Unifying rule:** digital = fee withheld at forward; cash = fee debited from fee-wallet. Either way the fee is captured. (Cash carries no customer-money protection — acceptable, flagged on UI.)

**Inbound / Outbound rails:**
- Launch-cheap: **SePay** (inbound notification to HS business account) + **manual** worker payout + fee-wallet for cash.
- Scale/safest: **one licensed intermediary doing BOTH collect + chi-hộ** (VNPAY / MoMo / 9Pay / AppotaPay) → licensed party in the money loop (legal-safest), automated payout, one integration (OQ8).

**Backend domains (one payment chain):**
- *Protected/digital side:* `payment_orders` (pay-in); `ledger_entries` (**IMMUTABLE** append-only source of truth; trigger-enforced like `evidence_snapshots`); `job_money_state` (money state machine, separate from `jobs.status`); `worker_wallets` (available/pending/settled); `worker_payout_methods` (verified; supersedes `worker_profiles.bank_account`/`bank_name`); `payout_requests`; `payment_webhook_events` (idempotent; current Sepay handler is a STUB needing HMAC/nonce/replay); `refunds` (partial/full).
- *Fee-collection side (both paths, mandatory for cash):* `worker_fee_wallet` (balance); `fee_wallet_transactions` (**IMMUTABLE**: top-ups / fee debits / adjustments); `platform_fee_charges` (per job: fee, status, source = digital-withheld | wallet-debited).
- *Cross-cutting:* `payment_records` (per job: method bank/cash, amount, confirmer) — lightweight, NOT custody.

**Services (one chain):** `PaymentService`, `LedgerService`, `WalletService`, `PayoutService`, `FeeService` (fee-wallet/commission). Money transitions via atomic RPCs (like existing workflow RPCs); ledgers immutable; webhooks idempotent; reconcile provider events vs internal ledger (ledger wins).

**Money state machine (digital path):** `created → payment_pending → paid_held → worker_assigned → in_progress → completion_submitted → completed_pending_release → released_to_worker_wallet → payout_requested → payout_processing → payout_sent`. Exceptions: `payment_failed, payment_expired, dispute_opened, release_blocked, partial_refund, full_refund, payout_failed, payout_reversed`. **Cash sub-flow:** `cash_confirmed → fee_due → fee_debited` (+ `fee_overdue` if wallet empty). Reconcile with `jobs.status` + `disputes`.

**Kael boundary (CLAUDE.md AI-money rule, unchanged):** Kael MAY explain protection/fees/net, remind to add payout method, explain payout status, guide dispute/refund, warn off-platform, remind to top up fee-wallet. Kael MUST NOT release money, change final amount, approve refund, bypass payout/completion authority, override dispute, or debit/credit wallets by itself. → Add payment actions to the Kael forbidden/gated list (`ai-boundary-contract.ts`); only server-validated `KaelAutonomyDecision` touches money-state.

**Security:** money = highest-stakes → atomic transitions + immutable ledgers + idempotent webhooks + reconciliation + audit; positive AND negative RLS tests per actor (customer/worker/admin/service-role); no bank/PII in logs (RULES #9).

**Frontend (6 screens, = #3 UI):** Customer Payment Review / Payment Method / Protection Status; Worker Income Wallet / Payout Method / Withdraw Request. (Built in #3; backend here.)

**GATES before build (in §7):** OQ7 legal confirms "principal" + worker-subcontractor contracts; accountant confirms VAT-on-gross; OQ8 provider choice; OQ9 phasing (launch = SePay-inbound + manual payout + cash fee-wallet; scale = licensed provider collect+disburse). Do NOT build until resolved + combined-build approval.

### Deferred (post-first-transaction)
- tier/level/points engine, badges/achievements, customer rank, trust-score algorithm (need real transaction data to calibrate).

---

## §5. Track C — Code regions plan (image-1 → image-2)

**SCOPE (Tu, 2026-06-16): FULL-codebase reorganization** — not just 1–2 god-files. The ENTIRE codebase (mobile + edge + shared; apps/api per D3) must reach the image-2 structure: domain-grouped cohesive modules, one source per concept, no cross-runtime duplication. Execution = behavior-preserving, **staged in safe slices, tests green at every step**. **Prerequisite: a green test baseline before starting** (memory notes a prior RED baseline — must be green first). Mobile-side grouping reconciled with #3 to avoid splitting surfaces twice.

### C-want-1 verdict — is the code chaotic / lacking continuity / hard to develop? YES, all three (evidence)
- **Chaotic (one file = a whole layer):** `services.ts` = 10,010 lines holding ALL domains (createJob, acceptBroadcast, kaelChat, scopeChange, dispute, cancellation, payment/sepay, notification, review). `worker-surfaces.tsx` 9,709 + `customer-surfaces.tsx` 7,776 = all surfaces of a role in one file each.
- **Lacks continuity (one concept defined in many places):** `KaelEstimate` defined **4×** — `apps/mobile/lib/api-types.ts:34`, `packages/shared/src/types/api-responses.ts:22`, `supabase/functions/mobile-api/_shared/router.ts:73`, `supabase/functions/mobile-api/_shared/kael/types.ts:282`. `CreateJobResponse` ×3, `KaelChatResponse` ×3. The only "parity test" string-slices the files (`mobile-wiring.test.ts:3756–3790`), not real type sharing. Plus Kael in 2 runtimes (edge 40 / api 10 files) and `domain.ts` 628-line dup.
- **Hard to develop (1 change → many edits):** one response field change = 3–4 synced file edits; one Kael logic change = 2 runtimes; editing the worker home screen = opening a 9.7K-line file → high token/context cost + risky diff (this is exactly Tu's "tốn thời gian + Token" complaint).

### image-2 target grouping (concrete)
- `services.ts` (10K) → `services/{jobs, broadcasts, chat, kael-chat, scope-change, cancellation, dispute, payment, notification, review}.service.ts` + `index.ts` assembler (~300–800 lines each = one chain per domain).
- `worker/customer-surfaces.tsx` → per-surface modules: `customer/{home,booking,history,profile,dock}/…`, `worker/{home,jobs,chat,earnings,profile,dock}/…`.
- Contract → ONE source: `packages/shared/.../api-responses.ts` is the only declaration of KaelEstimate/CreateJobResponse/KaelChatResponse; mobile `api-types.ts` re-exports; edge `router.ts` + `kael/types.ts` import from shared (delete the copies); real parity test replaces string-slicing.
- Kael brain → one (D3): `packages/shared/kael` pure logic; edge `kael/` runtime wiring only; `apps/api/kael` retired.

### C-want-3 — why this creates momentum (not a one-off fix)
After regrouping: change price → 1 file (not 4); change Kael logic → 1 file (not 2 runtimes); edit one screen → a ~400-line file (not 9.7K) → less token/context, safer diffs, two devs/agents can work different chains without collision; each chain has a clear owner so dev/AI knows immediately where a change lives. This lowers the cost of every future build/bugfix/enhance.

### C1 · Target module map (the "chains") — DOC FIRST, no code
Define cohesive domain groups + ownership, "one source per concern." Draft target shape (to finalize, and to reconcile with #3 for the mobile side):
- **mobile:** group by feature-domain, not by giant surface files. Split `worker-surfaces.tsx` (9.7K) and `customer-surfaces.tsx` (7.8K) into per-surface modules under `components/{customer,worker}/<surface>/`. `lib/` data layer split into `data/{api, services, realtime, workflow}`.
- **edge:** thin `router.ts` → per-domain handlers; split `services.ts` (10K) by domain: jobs, broadcasts, chat, scope-change, dispute, cancellation, notifications, payment, kael.
- **kael (edge canonical):** keep the 40-file edge `kael/` but assess cohesion; pure logic → `packages/shared/kael`.
- **shared:** one contract source (responses + domain + kael pure logic).
- Output = an updated `docs/architecture/code-ownership-map.md` section (the image-2 blueprint) before any file moves.

### C2 · One contract source → kills 3-place drift
- Generate DB types via Supabase type-gen (already in `packages/shared/src/types/database.types.ts`); hand-authored response contracts live ONLY in `packages/shared`.
- Solve Deno↔npm: make Edge consume `packages/shared` via an import map / Deno-compatible build, eliminating `supabase/functions/_shared/domain.ts` duplication. Replace shape-only `contracts-parity.test.ts` with a **value-level** parity test (or remove the need entirely once there's one source).
- Mobile `api-types.ts` re-exports from shared instead of re-declaring.

### C3 · One Kael brain (D3) → retire apps/api duplicate
- Edge = canonical. Lift shareable pure logic to `packages/shared/kael`. Reduce `apps/api` Kael/learning to either deletion or thin admin/support that imports shared. Verify no RN-path dependency on apps/api (there is none — RN talks to Edge only).

### C4 · Split god-files → image-2 cohesion
- `services.ts` (10K), `worker/customer-surfaces` (9.7K/7.8K), `router.ts` (2.5K), `frontend-workflow-provider` (1.4K) → cohesive modules per C1. Each split must preserve behavior (tests green before/after) and apply comment-discipline (#1, `pnpm lint:comments`). Large + risky → sequence per-module, one at a time, verify each.

---

### C5 · Code-Organization Rule (recurrence prevention) — Tu 2026-06-16
A strict, enforced rule (mirroring #1 comment-discipline) so future agents don't recreate god-files / scattered duplicate concepts.
- **Home:** new "Core Skill 6: Code Organization" in `skills.md` + 1-line pointer in `.agents/skills/karpathy-guidelines/SKILL.md`.
- **Rule content:** one concept = one canonical home (import, never re-declare across files/runtimes — e.g. the `KaelEstimate` ×4 must collapse to one); group by domain into cohesive modules, never append to a catch-all god-file; file-size guardrail (a file over ~600–800 lines OR mixing unrelated domains → split first); no duplicated logic across runtimes (share via `packages/shared`); red-flags + rationalization table.
- **Enforcement (DECIDED — doc + CI lint):** `pnpm lint:structure` = file-size cap + duplicate-export/duplicate-type check, CI-gated as a **ratchet on changed files only** (legacy grandfathered; cleaned by the reorg itself). Same mechanism as #1's `lint:comments`.
- **Timing (DECIDED — folded into combined build):** write + enforce DURING the combined build alongside the reorg, NOT now — per the "discuss all 5 → build once" gate.

## §6. Execution order, FIRST step, and the build gate

**Gate (Tu, 2026-06-16):** do NOT build until ALL 5 items (#1 done; #5 planned here; #3, #4, #2 still to discuss) are discussed; then build everything in one combined pass.

**Cross-dependency (critical):** #3 (UI/UX workflow in STRUCTURES.md) touches Frontend → overlaps **C1/C4-mobile**. Finalize the mobile module map WITH #3 so we don't split mobile surfaces twice. This is exactly why Tu sequenced 5→3→4→2-then-build-once.

**Proposed build order (when unlocked):**
1. **C1** target module map (doc; reconciled with #3) — foundation for everything.
2. **S1** `worker_stats`/`customer_stats` + backfill + VIEW (unblocks profile data + A3).
3. **C2** one contract source (kills drift before splitting files).
4. **C3** one Kael brain (retire apps/api duplicate).
5. **C4** god-file splits (per-module, behavior-preserving).
6. **S2** matching indexes + realtime wiring + load test.
7. **S3** storage tidy (low priority).

---

## §7. Open questions / decisions still pending

- **OQ1 (gamification formulas):** when D1's deferred layer is built later — tier thresholds + point formula, trust-score algorithm, badge criteria. Needs real transaction data. Decide at that time.
- **OQ2 (income net):** persist `jobs.worker_net`/`platform_fee` at payment, or compute in stats recompute? (Lean: persist at `paid`.)
- **OQ3 (realtime):** full switch to realtime, or hybrid realtime-primary + polling-fallback? (Lean: hybrid — code already hints it.)
- **OQ4 (bucket consolidation):** merge job-image buckets or keep `completion-photos` distinct? (Low stakes.)
- **OQ5 (Deno↔shared):** exact mechanism for Edge to consume `packages/shared` (import map vs build step) — spike during C2.
- **OQ6 (#3 overlap):** mobile module map (C1/C4) must be finalized with #3's UI/UX direction.
- **OQ7 (Payment LEGAL — blocker):** Can we legally hold client funds (custodial/protected) in Vietnam, or must a licensed payment provider hold custody while we only orchestrate money-state? Decides the whole money-holding design. Needs Tu + legal. I am not a licensed advisor.
  - **KEY DECIDING FACTOR (refined 2026-06-16):** it hinges on STRUCTURE, not mechanics. If HS is the **principal/seller** (customer buys the service FROM Home Services; workers are HS's contractors/suppliers HS pays), then money into HS's business account = normal revenue + paying contractors = NOT payment intermediation → likely no special license (plausible: Kael diagnoses/prices, HS quality-controls → HS is the service provider). If HS is a **pure intermediary** (just connecting independent customer↔worker), holding+forwarding = payment intermediation → needs NHNN license.
  - **Tu's "business-account" model (2026-06-16):** customer → HS business account (worker sees it via SePay inbound notification) → HS forwards the worker's deserved share, fee withheld. This IS self-custody; it revives the §S4 protected-money design with HS as custodian (instead of a 3rd-party provider). **Legally clean ONLY under the principal framing** — confirm with legal.
  - **Tax flag:** principal model = full customer payment is HS revenue (VAT on gross), worker pay = cost — confirm with accountant.
  - **Tech flag:** SePay = inbound notification only; **outbound auto-payout to workers is NOT covered by SePay** → needs a bank bulk-payment API / disbursement provider / manual transfers (manual first, automate later).
- **OQ8 (Payment provider):** which provider(s) for pay-in (Sepay VietQR present) and for payout (bank transfer / e-wallet)? What is the payout-method verification flow?
  - **Disbursement/chi-hộ candidates (verified 2026-06-16):** licensed intermediaries — **AppotaPay** (licensed, real-time API to any bank), **9Pay** (thu hộ + chi hộ), **VNPAY**, **MoMo** (chi hộ DN), **Payoo**, **Ngân Lượng**; bank chi-hộ/bulk APIs — **MB, Techcombank, VPBank, OCB**. (SePay = inbound notification; check if it now offers payout.)
  - **Recommendation:** use ONE licensed intermediary for BOTH collect + chi-hộ (VNPAY / MoMo / 9Pay / AppotaPay) → licensed party in the money loop (legally safest), automated worker payout via API, one integration ("thống nhất"). Higher fees/onboarding than SePay. Cheapest launch path = SePay-inbound + MANUAL payout first → provider chi-hộ at volume.
  - **HS positioning (Tu stated 2026-06-16):** managed marketplace / **principal** — "HS cung cấp dịch vụ + điều phối thợ" (Urban-Company-style). Supports the principal framing in OQ7 (money in = revenue, paying workers = paying contractors). Condition: worker contracts = HS's paid subcontractors (not "worker sells, HS only connects"). Confirm with legal.
- **OQ9 (Payment phasing):** minimal first-transaction path (pay-in + protected state + manual/assisted payout) vs full wallet/immutable-ledger/auto-payout now? (Phasing toward first real transaction.)
- **OQ10 (money-state vs jobs.status):** exact sync mapping between `job_money_state` and `jobs.status`, and which is source of truth at each transition.
- **OQ11 — RESOLVED (Tu "hướng a", 2026-06-16):** the payment MODEL is the **§S4 Managed-Marketplace Hybrid** (HS=principal; DIGITAL = business-account/licensed-provider HOLDS → forward worker net, fee withheld = "Bảo vệ thanh toán"; CASH = customer→worker direct, fee collected from worker via pre-paid `worker_fee_wallet`). The earlier escrow-vs-fee-wallet fork is **CLOSED** — §S4 + D4 supersede it; the two are no longer "mutually exclusive / do not build", they are COMBINED in the hybrid. Remaining payment items are OPERATIONAL gates (not a model fork): legal confirms "principal" + worker-subcontractor contracts, accountant VAT-on-gross, provider choice (OQ8), plus OQ9 (phasing) + OQ10 (money-state↔jobs.status mapping) as implementation sub-decisions.

---

## §8. Verification strategy
- Supabase changes: new migration per change (never edit merged migrations), regenerate types, positive+negative RLS tests per actor, re-run `get_advisors` after DDL.
- Code splits: tests green before AND after each split; `pnpm lint:comments` clean; no behavior change (git diff scoped).
- Scale: documented load-test evidence in `docs/test-logs/` before any "production-ready for N users" claim.
- Honesty: report what was tested and what was NOT (per Tu's honest-reporting standard).

---

## §9. Change log
- 2026-06-16 — Initial draft. Evidence captured from PROD audit + 8-subsystem code map + design handoff zip. Locked D1 (gamification core-only), D2 (voice transcripts-only), D3 (Edge-canonical Kael / option B + shared-core lift). Parked pending #3/#4/#2 discussion + combined-build approval.
- 2026-06-16 — Added §5 C-want-1 verdict (by dimension, with evidence) + concrete image-2 grouping.
- 2026-06-16 — Track C scope expanded to FULL-codebase reorg; added C5 Code-Organization Rule (Core Skill 6; enforce via `lint:structure` CI ratchet; folded into combined build).
- 2026-06-16 — Added §0.5 Arrangement Philosophy (Tu-confirmed): right-size + group-by-relation (not fragment, not blob); readability as the success metric; `worker_overview` view = Tu's "1 bảng dễ nhìn" delivered; retracted the "mega-table anti-pattern" framing.
- 2026-06-16 — Added §S4 Payment Gate (from updated handoff `nestscout-codex-handoff-final-payment-gate.zip` → `design/PAYMENT_GATE_ARCHITECTURE_AND_UX.md`): 8 custodial-money domains + 4 services + immutable ledger + money state machine + Kael boundary. Added D4, A5, OQ7–OQ10. Flagged VN custodial-licensing legal risk (OQ7).
- 2026-06-16 — Verified SePay/VietQR don't hold money; added custody-options + principal-vs-intermediary deciding factor (OQ7) + chi-hộ provider candidates (OQ8) + payment-model fork (OQ11).
- 2026-06-16 — Tu chose "hướng a" → REWROTE §S4 to the CONVERGED Managed-Marketplace Hybrid: HS=principal; digital→business-account/provider holds→forward worker net (protected); cash→worker fee-wallet; one payment chain; gates = legal-principal + tax + provider + phasing. Updated D4.
