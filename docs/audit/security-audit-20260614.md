# Security Audit — Home Services (mobile-api + Supabase)

- **Date:** 2026-06-14
- **Auditor role:** Product Security Engineer (AppSec) — assume-breach, defense-in-depth, deny-by-default
- **Branch:** `claude/gallant-sinoussi-b0c0c3`
- **Status:** READ-ONLY audit. **No code changed.** Remediation is plan-first; code only after Tu approves each phase.
- **Scope (Tu, 2026-06-14):** all 4 domains — Authz/IDOR + AI cost, PII & Storage, Prompt injection & Autonomy, Anti-fraud & Abuse.
- **Method:** static read of the Edge boundary + Kael stack; live **read-only** Supabase advisors + `pg_policies`/`storage.buckets` inspection on **Staging** (`xyylanuyflrjzbjzhqfl`) and **Production** (`iwevizmsedyqozxlawwl`).
- **Authority:** `RULES.md` #0,#1,#7,#8,#9,#10 + Security Invariants; `protocols/ai-data-security.md`; `STRUCTURES.md`.

---

## 1. Executive verdict

The codebase is **more hardened than typical for a pre-revenue product**. The core defensive layers are real and functioning: a strict mobile→Edge→DB boundary, per-request JWT+role auth, Zod validation at every route, consistent tenant isolation, properly-scoped storage RLS (verified against the live DB), and a genuinely robust money-authority gate (Rule #7).

**No immediately-exploitable vulnerability was found in this pass.** The single most material gap is the **absence of a durable, global AI-spend brake** (wallet-DoS resistance at system scale). The remainder are low-severity hardening and latent/defense-in-depth items.

Severity scale: CRITICAL / HIGH / MEDIUM / LOW / INFO.

---

## 2. Verified-strong (defenses that work — with evidence)

| Domain | Control | Evidence |
|---|---|---|
| Secrets / boundary | No server secret in RN bundle; `.env.example` segregates public vs server-side; no committed `.env` | grep `apps/mobile` for `SERVICE_ROLE\|ANTHROPIC\|PERPLEXITY\|sk-ant\|...` → 0 matches; `.env.example` |
| Auth | JWT validated per request; role read from `profiles`; downstream client is service-role | `_shared/auth.ts` |
| Privilege | Signup trigger **forces `role='customer'`** server-side; execute revoked from `anon`/`authenticated` | `migrations/20260517192455_harden_auth_signup_trigger.sql` |
| Input validation | Zod `safeParse` at every dispatch; 64 KB body cap; path-traversal guard (`..`); bounded lat/lng/ISO; media refs must be `supabase://job-media/<stage>/...` | `_shared/router.ts` (`readJson`, `isSupabaseJobMediaStageRef`, `workerStatusUpdateSchema`) |
| Tenant isolation (read) | `getJob`+`listJobMessages` → `requireJobAccess` (returns **404**, no existence leak); `getKaelChat` → `assertKaelSessionOwnership`; `getWorkerKaelChat` → ownership-scoped `readWorkerKaelSession` | `_shared/access.ts`, `_shared/services.ts:2647,5318,1577,4274` |
| Tenant isolation (write) | RPCs re-check ownership/role in SQL (e.g. `decide_worker_cancellation_atomic` checks admin + job-worker match + `FOR UPDATE`) | `migrations/20260519120720_*` |
| **Storage / PII** | **Live DB**: all buckets `public:false`; SELECT scoped to `private.is_job_participant(...)` (job-photos, completion-photos, job-media); worker-documents / worker-verification owner-or-admin; INSERT scoped by participant + stage. Init-schema's loose "any authenticated" policy was **superseded**. | `pg_policies` on `storage.objects` (staging) |
| Money authority (Rule #7) | `llm_proposed` decisions rejected unless `KAEL_AUTONOMY_FULL_ENABLED`; Zod-validated; `policy_id` must be `kael.autonomy.*`; evidence references checked vs known catalog (no fabricated evidence); per-action evidence-kind sufficiency; high-stakes (payment/dispute, ≥1M VND) escalate to human queue on confidence <0.82; **prompt-injection deny-patterns** (`ignore previous`, `override policy`, `set status=`, `release payment`, `rpc(`…) + PII/secret detection; full audit to `kael_autonomy_decision_audit` | `_shared/kael/autonomy-gate.ts` |
| AI output (Rule #3) | `runKaelOutputPipeline` schema-validates raw LLM output → safe fallback if invalid → sanitize → re-validate; `sanitizeKaelText` scrubs PII **and strips VND price patterns** from prose; disclaimer always attached; worker brief exposes full address only in post-accept `guidance` stage | `_shared/kael/output-pipeline.ts` |
| PII scrubbing | Layered: `memory-sanitizer.ts` (memory writes), `output-pipeline.scrubPiiText` (LLM output), chat `contactGuard` redaction, per-agentic-case redaction; stored chat turns scrubbed by migration | `migrations/20260529130000_scrub_chat_turns_pii.sql` |
| Logging | Logs carry IDs/error codes/safe metadata only; no full phone/address/token values observed | grep `console.*` across `supabase/functions` |
| Anti-fraud | Disintermediation: detect + redact contact in chat + record risk to `kael_admin_queue` (`disintermediation_risk`) + **soft matching de-prioritization** for repeat offenders (logged, no silent change, §32.6) | `_shared/services.ts:5363-5513,7810-7924` |
| Rate limit (per-user) | Kael chat POST limit is **DB-backed/durable** (5/min + 20/hr); in-memory bucket is fallback only | `_shared/services.ts:1300-1309`, `migrations/20260529110000_kael_chat_rate_limit_log.sql` |
| Conversational injection (input) | Deterministic, **cost-0-on-decline**, pre-pipeline boundary guard: prompt-injection (EN + unaccented-VN), out-of-scope, service-mismatch + optional semantic classifier; runs before any provider call | `_shared/kael/boundary-guard.ts` |
| Per-call cost ceiling | Each provider call rejected if `estimatedCostUsd > costCeilingUsd` for the purpose | `_shared/kael/routing.ts:27` |
| Realtime exposure | All 8 published tables (`jobs`, `chat_messages`, `disputes`, `evidence_snapshots`, `job_broadcasts`, `job_events`, `notifications`, `scope_change_requests`) have RLS enabled + tenant-scoped SELECT (`is_job_participant`/owner/admin); Realtime only delivers rows the user can SELECT | live `pg_publication_tables` + `pg_policies` (staging) |
| DB posture | Live security advisors on **both** envs near-clean (see §3 F3/F5) | `get_advisors(security)` staging + prod |

**Structural note (by design, not a bug):** the Edge builds the downstream Supabase client with the **service-role key**, so RLS is bypassed inside handlers. Authorization therefore rests entirely on explicit Edge checks (`requireJobAccess` / role guards / RPC SQL checks). RLS remains defense-in-depth for direct-client reads. Consequence: **one workflow route that forgets its ownership guard = IDOR or money-state manipulation.** This is why §6 Phase S3 (authz-coverage test) is high-value.

---

## 3. Findings

### F1 — No durable, global AI-spend brake — **MEDIUM** (highest-leverage gap)
- **Where:** `_shared/kael/rate-limit.ts:43-44` (in-memory `counters`/`costCounters` `Map`); `_shared/kael/routing.config.ts:16,20,76` (`dailyProviderCapUsd:30`); `_shared/kael/circuit-breaker.ts:37` (in-memory `buckets`).
- **What:**
  - Per-user request rate IS durable (DB-backed chat limit) — this bounds cost per user. ✓
  - But per-actor cost caps (`monthlyCostCapUsd:5`, `dailyCostCapUsd:30`) live in an **in-memory Map** → per-isolate, reset on cold start. Supabase Edge runs ephemeral, horizontally-scaled isolates with no shared memory.
  - `dailyProviderCapUsd:30` is **declared but never consumed** anywhere (grep: only `routing.config.ts` references it) → a global daily provider cap that gates nothing.
  - The only `kill_switch` is `KAEL_LEARNING_KILL_SWITCH` (learning loop). There is **no kill-switch for the customer-facing estimate/chat/vision pipeline**.
  - Customer signup is open (`role='customer'`), enabling **N-account amplification**.
- **Impact:** a motivated attacker (many accounts, or cycling cold isolates) can drive Anthropic/Perplexity spend past intended caps; no emergency stop in an incident.
- **Recommendation:** build a durable spend gate (DB counter, global + per-user, daily/monthly) checked before each provider call; wire a real global cap; add `KAEL_AI_KILL_SWITCH`; migrate cost caps off in-memory; throttle/verify signup before AI access. → Phase S4.

### F2 — Admin learning-candidate routes over-permissive in the router — **LOW (latent / defense-in-depth)**
- **Where:** `_shared/router.ts:1320-1345`.
- **What:** `list`/`approve`/`reject` carry `roles: ["customer","worker","admin"]`, unlike every other `/admin/*` route (`["admin"]`). The service layer re-checks `ctx.role !== "admin"` (`services.ts:6742,6768,6821`, denial audited at `6848-6873`), so it is **not exploitable today**.
- **Impact:** correctness depends on a single service-layer guard; a future refactor that trusts router roles (as all other admin routes do) would silently open privilege escalation into the learning loop / pricing knowledge base.
- **Recommendation:** set these routes to `roles: ["admin"]`; keep the service guard as defense-in-depth. → Phase S2.

### F3 — Leaked-password protection disabled — **LOW (config, both envs)**
- **Where:** Supabase Auth setting (live advisor WARN on staging + prod).
- **What:** HaveIBeenPwned compromised-password check is off → users may set known-breached passwords → account-takeover risk.
- **Recommendation:** enable in dashboard; while there, review Auth password strength, OTP/email send rate limits, and MFA posture. Config-only, no code. → Phase S1.

### F4 — In-memory rate-limit + circuit-breaker are best-effort across isolates — **LOW**
- **Where:** `_shared/kael/rate-limit.ts`, `_shared/kael/circuit-breaker.ts`.
- **What:** the durable DB chat limit covers the main customer path, but the Kael actor rate-limit counters and the provider circuit-breaker are in-memory (per-isolate, reset on cold start). The credit-failure breaker (HTTP_402, opens 60 min) won't persist across a cold isolate.
- **Recommendation:** fold into the F1 durable-counter work (shared DB-backed state for spend + breaker signal). → Phase S4.

### F5 — Two rate-limit-log tables: RLS enabled, no policy — **INFO (confirm intent)**
- **Where:** `public.kael_chat_rate_limit_log`, `public.kael_worker_chat_rate_limit_log` (live advisor INFO, both envs).
- **What:** RLS on + no policy = deny-all for `anon`/`authenticated`; only service-role (Edge) can touch them → functionally **safe and intentional** (Edge-only tables).
- **Recommendation:** add an explicit deny-all policy + table comment to document intent and silence the linter. → Phase S2.

### F6 — Conversational injection defense is partly flag-gated / deny-list — **LOW**
- **Where:** `_shared/kael/boundary-guard.ts` (deterministic patterns + flag-gated `semanticInjectionClassifierEnabled`); `_shared/kael/system-prompt.ts`.
- **What:** the first-layer injection patterns are a heuristic deny-list (bypassable by novel phrasing); the semantic classifier is **flag-gated** (may be off in prod); the system prompt has safety/scope framing but no explicit "never reveal system prompt / never output secrets" line.
- **Impact:** LOW — a deny-list bypass cannot breach because downstream structural controls fail closed (autonomy source-gate blocks `llm_proposed`; output pipeline scrubs PII/secrets + strips prices; schema validation). Worst case of a bypass = one wasted provider call + a scrubbed/validated response.
- **Recommendation:** enable the semantic classifier in prod; add explicit refuse-and-never-reveal instructions to the system prompt as belt-and-suspenders. → Phase S2/S5.

---

## 4. Deep-verification results (pass 2–3) — gaps from pass 1 now CLOSED

All five items flagged "not yet verified" in pass 1 were deep-audited. Result: **closed with evidence; no missing control found.**

1. **Exhaustive route authz — CLOSED.** Enumerated every resource-scoped route. Each enforces ownership via one of: `requireJobAccess` (Edge, returns 404); session-ownership preflight (`getKaelChat`/`assertKaelSessionOwnership`/`readWorkerKaelSession`; `streamKaelChatTurn` calls `getKaelChat` before streaming); or an atomic RPC receiving `ctx.user.id`/`ctx.role` and checking participant/owner/admin in SQL (`open_dispute_atomic`, `confirm_kael_chat_atomic` `p_customer_id`, `decide_scope_change_atomic` `p_customer_id` + autonomy `jobRelation:"own_customer_job"`, `decide_worker_cancellation_atomic` admin-check, `accept_broadcast` worker-eligibility). Fails closed on mismatch.
2. **Conversational prompt-injection — CLOSED** (residual = F6, LOW). Deterministic pre-pipeline `boundary-guard.ts` blocks injection/out-of-scope/mismatch at cost 0; output pipeline scrubs; autonomy gate blocks `llm_proposed`. Defense does not depend on LLM compliance.
3. **Idempotency — CLOSED.** Create paths (`jobs`, `kael_chat_sessions`) use `client_request_id` partial-unique indexes (`migrations/20260529100000`). State mutations are protected by status-guarded atomic RPCs (e.g. `ALREADY_CONFIRMED`, status `FOR UPDATE` checks) — a replayed mutation fails closed.
4. **SSE / Realtime authz — CLOSED.** SSE streams do an ownership preflight before emitting. All 8 Realtime-published tables have RLS enabled with tenant-scoped SELECT policies (verified live) — Realtime only delivers rows the subscriber can SELECT.
5. **Per-call cost ceiling — CLOSED.** Enforced at `routing.ts:27`. (The *daily/global* cap is the separate, still-open F1.)

Remaining true open items after pass 3: **F1 (MEDIUM)** + the low/latent F2–F6.

---

## 5. Threat model (attacker goals, this app)

1. **Wallet-DoS** — burn Anthropic/Perplexity budget via chat/vision. *(F1 — primary residual)*
2. **IDOR / cross-tenant** — read/modify another party's job, address, media, messages, earnings. *(strong; lock with S3)*
3. **PII exposure** — phone, exact address/unit, CCCD images, bank account. *(strong: storage RLS + layered scrub)*
4. **Money manipulation** — final_price (worker blocked), scope-change fraud, fake completion, dispute, autonomy bypass. *(strong: Rule #7 gate)*
5. **Prompt injection** — steer Kael to unsafe advice / leak / poison learning / touch money-state. *(money-state defended; conversational depth = S5)*
6. **Disintermediation** — off-platform contact exchange. *(detect+redact+penalty present)*
7. **Account takeover / abuse** — breached passwords (F3), spam booking, fake worker, review/cancellation abuse.

---

## 6. Remediation plan — phased, ranked EASY → HARD

Sequencing per Tu (2026-06-14): do the easy fix/build items in early phases; concentrate effort on the hard phases last. Each phase is plan-first; code only after explicit approval.

### Phase S1 — config-only, no code · *effort: minutes · risk: none*
- Enable **leaked-password protection** (F3).
- Review Auth: password strength, OTP/email send rate limits, MFA posture.
- *Deliverable:* dashboard change + a note in this doc. No code, no migration.

### Phase S2 — tiny code / DDL · *effort: small · risk: low (behavior unchanged)*
- Tighten admin learning-candidate routes to `roles: ["admin"]` (F2).
- Add explicit deny-all policy + comment on the 2 rate-limit-log tables (F5).
- Enable the semantic injection classifier in prod + add explicit "never reveal system prompt / never output secrets" to the system prompt (F6).
- *Deliverable:* 1 router edit + 1 migration + flag + system-prompt edit + regression test that a non-admin still gets 403 on those routes.

### Phase S3 — tests only, turns audit into durable guardrails · *effort: medium · risk: none*
- **Authz-coverage test:** assert every job/scope/dispute/cancellation-scoped route enforces ownership (`requireJobAccess` or RPC SQL check). Closes coverage gap #1 and prevents future IDOR regressions.
- Negative security tests: cross-tenant job/media/message read → 404; `llm_proposed` autonomy → reject; contact-redaction in chat; storage cross-job read denied.
- *Deliverable:* test files only; no production code change.

### Phase S4 — the real build: durable global AI-spend gate + kill-switch · *effort: high · risk: medium (hot AI path)*
- DB-backed spend counter (global + per-user, daily/monthly) checked before each provider call.
- Activate a real global daily cap (wire `dailyProviderCapUsd` or a dedicated global cap); migrate `costCounters`/`counters` off in-memory; persist circuit-breaker signal (folds F4).
- `KAEL_AI_KILL_SWITCH` env to hard-stop customer-facing AI in an incident (mirror learning kill-switch), with a Vietnamese unavailable state (Rule #8, no fake success).
- Signup-amplification mitigation: throttle signup / require verified account before AI access.
- *Risk control:* careful fallback so legit users are never wrongly blocked; load/abuse tests; staged rollout behind a flag.

### Phase S5 — ongoing guardrails · *effort: medium / ongoing*
> Note: the pass-1 verification backlog (authz coverage, prompt-injection, idempotency, SSE/Realtime, cost ceiling) was completed in pass 2–3 (see §4). S5 is now mostly CI/process guardrails.
- CI: secret scanning (e.g. gitleaks) + lint forbidding new `console.*` of PII fields.
- Negative-test the conversational injection paths against novel phrasings; re-baseline `boundary-guard` patterns periodically.
- Run advisors after any DDL; re-baseline.

---

## 7. Process / authority notes

- Locked docs (`CLAUDE.md`, `RULES.md`, `STRUCTURES.md`, `critical.md`, `design.md`, `README.md`) are **not** edited by this work.
- Each phase is gated: plan-first design → Tu approval → code → honest verification with evidence (Rule #8, no fake success; per `feedback_honest_reporting`).
- Any new secret (e.g. for S4) follows Rule #1: add to `.env.example` (name only), env validation, deployment config — never a value in code/logs/docs.

## 8. Change log
- 2026-06-14 — Initial read-only audit (pass 1) across all 4 domains; live advisors + storage RLS verified on staging + prod; findings F1–F5; phased plan S1–S5. No code changed.
- 2026-06-14 — Pass 2–3 deep verification: closed all 5 pass-1 coverage gaps with evidence (exhaustive route authz, conversational injection, idempotency, SSE/Realtime, per-call cost ceiling); added F6 (LOW). Net open: F1 (MEDIUM) + low/latent F2–F6. No code changed.

---

## 9. S1 execution log — leaked-password (F3) · config-only · HARD GATE #2 handoff

**Status:** Claude prepared + verified baseline; **dashboard toggle is Tu's action** (Supabase Auth config has no MCP/API write surface here; §38 S1 = "Claude soạn checklist, Tu bấm"). No code, no migration.

**G6 baseline captured (read-only `get_advisors(security)`, 2026-06-14) — identical on both envs:**

| Env | project_id | WARN | INFO |
|---|---|---|---|
| Staging | `xyylanuyflrjzbjzhqfl` | `auth_leaked_password_protection` (**F3**) | `rls_enabled_no_policy`: `public.kael_chat_rate_limit_log`, `public.kael_worker_chat_rate_limit_log` (**F5**) |
| Production | `iwevizmsedyqozxlawwl` | same | same |

Matches §38 G6 PRE-fix baseline exactly: 1 WARN (F3) + 2 INFO (F5), both envs.

**Tu dashboard checklist — run on BOTH staging + production:**
1. **Enable leaked-password protection** (closes F3): Supabase Dashboard → **Authentication → Policies / Password settings** → turn ON *"Leaked password protection"* (checks HaveIBeenPwned). Ref: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
2. **Password strength** (while there): set Minimum length ≥ 8 and require a reasonable character mix.
3. **OTP / email send rate limits**: Authentication → Rate Limits — confirm email/OTP send caps are sane (not unlimited).
4. **MFA posture**: review MFA (TOTP) availability; document current state (v1 may not enforce).

**POST-S1 verification (proves F3 closed):** re-run `get_advisors(security)` on both project_ids → the `auth_leaked_password_protection` WARN must be **gone**; the 2 `rls_enabled_no_policy` INFO remain (those are F5, closed in S2). Append the post-toggle advisor result here.

**POST-S1 result:** _pending Tu dashboard toggle — to be filled after step 1 applied on both envs._
