# Home Services Agent Lessons

## 2026-05-26 - P17 Staging Monitoring and A/B Setup

- If Plan asks for an A/B test but runtime does not yet collect paired samples, start with a truthful experiment contract and dashboard state instead of inventing sample rows.
- `price_synthesis` currently has routing config for Perplexity primary and Anthropic fallback, while live provider logs are still mostly `market_lookup`. Keep this distinction visible so later collection work does not mistake routing config for completed sample evidence.
- Dashboard views over sensitive provider/job data should use `security_invoker = true` plus underlying admin RLS, not broad definer views.
- A running experiment can honestly show `0/100` completed cases. That is better than fake metrics; the threshold decision should stay `collecting` until real samples exist.
- Production deploy plans belong behind an explicit Tu approval gate, even when staging deploy and advisors are clean.

## 2026-05-26 - P16 Pre-Launch Verification

- Treat old migrations as historical evidence, not active runtime proof. If a superseded migration contains forbidden automation, verify the active database function and later migration chain before failing the phase.
- P16 security evidence should separate exact-secret scans from placeholder/key-name scans. `.env.example` names and fake `eyJ...` comments are not leaked values, but the exact token/JWT sweeps must be clean.
- Admin-entered decision fields are not the same as Kael autonomy. `refund_amount`, `worker_credit_amount`, and worker suspension are acceptable only behind explicit admin decisions and must never appear as Kael recommendations.
- Use the live P15 cost/latency matrix as P16 performance evidence only when the report captured the full case matrix, realtime, cleanup, and cost rows in one successful run.
- Supabase advisor warnings need provenance. Existing Auth dashboard warnings, such as leaked-password protection disabled, should stay documented as residual platform settings rather than hidden or claimed fixed by migrations.

## 2026-05-26 - P15 Staging E2E Harness

- For P15-style staging tests, use Edge for workflow-sensitive actions and keep direct DB use explicit: fixture setup, timer preconditions, realtime stimulus, metrics, and cleanup only.
- Worker accept intentionally turns `worker_profiles.is_available=false`; long sequential harnesses must put workers back online through `/workers/me/availability` after a completed job.
- Realtime tests can be flaky if they rely on one update immediately after `SUBSCRIBED`. Retry small `kael_progress` updates until the authenticated mobile subscription receives one or the timeout fails with channel statuses.
- Evidence snapshot immutability is correct production behavior. Staging cleanup for disposable dispute fixtures must be scoped to tracked job ids and temporarily disable only the immutable trigger during cleanup.
- Do not mark P15 complete from partial runs. Require one continuous passing run with case counts, p95/cost metrics, `/log` report, and cleanup counts all captured together.

## 2026-05-26 - P14 Backend Gaps Cleanup

- Treat Plan phase counts as data, not memory. Active §23 has P0-P17 and five cases P9-P13; re-audit `Plan.md` when Tu challenges phase/case counts.
- Legacy HCMC district inputs need product-aware normalization. Since old Quận 2 and Quận 9 are now Thủ Đức in the active slug catalog, map q2/q9 variants to `thu_duc` instead of silently rejecting customer dispatch input.
- Make telemetry invariants database-enforced. Backfill legacy `api_logs.purpose`, add a non-empty check, and set `purpose not null`; reference API loggers must provide the same field as Edge.
- Supabase Cron migrations must use `cron.schedule` / `cron.unschedule`, not direct writes to `cron.job`. Use `to_regclass('cron.job')` instead of invalid exception names when guarding idempotent unschedule logic.
- `db lint --fail-on error` can surface old PL/pgSQL shadowing after new migrations. Fix already-applied function bodies with forward migrations and qualified aliases, not by rewriting history.
- Smoke data is acceptable only when it is tightly scoped and cleaned. For P14, 50 temporary `api_logs` rows and one orphan `analyzing` job proved behavior, then cleanup queries verified no leftovers.

## 2026-05-26 - Kael Case 5 Disputes

- Keep dispute Kael output strictly neutral: summarize customer statement, worker statement, and locked evidence counts; do not assign fault, decide outcome, or suggest money.
- Treat admin decision fields differently from Kael reasoning. Optional `refund_amount` and `worker_credit_amount` belong only to admin-entered decision records, never to Kael summaries or recommendations.
- Evidence immutability needs real DB enforcement. P13 uses an `evidence_snapshots` trigger that blocks update/delete; smoke cleanup must use DB-admin trigger control, not app paths.
- Use `unpaid_service` as a deferred Phase 0 subcase. It should return a clear deferred result instead of pretending payment handling is implemented.
- Admin decision side effects must be explicit admin actions. P13 can suspend a worker profile only when admin selects a suspension action, not from Kael abuse signals.

## 2026-05-25 - Kael Case 4 Customer Cancellation

- Customer-cancel P12 has five timing subcases. Treat cancellation after worker completion as a dispute trigger and keep the job in `completed_by_worker` for P13 instead of silently cancelling completed work.
- Phase 0 must stay non-monetary: no customer fee, no worker payout promise, and no autonomous customer block. Goodwill for 4C is an audit note, not compensation.
- Keep customer anti-abuse as trust signals plus admin review requirements. Do not turn cancellation signals into automatic blocks or penalties until a later approved phase.
- When adding RLS for participant/admin views, prefer one SELECT policy with `(select auth.uid())` and split admin insert/update/delete policies. Supabase advisors will flag direct auth calls and multiple permissive SELECT policies.
- Verify PL/pgSQL against the active schema names. P12 caught `worker_scope_changes` as stale; the active table is `scope_change_requests`.

## 2026-05-25 - Kael Case 3 Worker Cancellation

- Worker-cancel P11 intentionally supersedes older auto-suspend language: abuse signals open review and soft L4 red flags only; worker suspension requires an admin action.
- Treat explicit cancellation and no-show as separate subcases. Explicit cancellation can auto-approve for customer continuity and rebroadcast; no-show timer should queue admin review/fallback without autonomous status, money, or suspension mutation.
- Keep reason taxonomy admin-tunable and explicit: legit auto-approve with evidence, legit with admin review, suspicious, and no reason.
- Customer fallback options after worker cancel are wait 15 minutes for Kael search, reschedule, or cancel no charge in Phase 0.
- PL/pgSQL table-returning functions can shadow column names with output parameters. Qualify `RETURNING` columns or alias them, and guard the exact alias in schema tests.

## 2026-05-25 - Kael Case 2 Demanding Customer Spine

- Separate legitimate detail-oriented concern from pressure before responding. Legitimate concern gets transparency; pressure gets process/record/fairness language.
- Hard escalation must stop the Kael provider loop, append the admin-wait response, log the interaction, and open a high-priority admin queue row. It must not auto-change job status or money.
- Normalize Vietnamese input before pattern matching so accented and unaccented pressure signals behave the same.
- Defensive logs must store sanitized excerpts and safe metadata only. Do not store raw phone numbers or customer-controlled text in queue metadata.
- Keep anti-fraud language implicit and non-accusatory: process, record, fairness, admin review. Never tell the customer they are lying or threatening.

## 2026-05-25 - Kael Case 1 Normal Transaction Template

- Treat Case 1 as the baseline compact 6-phase workflow: intake, confirm, match, execute, complete, learn.
- Keep customer notifications to the five trusted signals: estimate ready, worker matched, worker arrived, worker completed, review thanks.
- Keep `worker_on_way`, `inspecting`, and `repairing` silent for the customer surface; these are operational state changes, not Kael conversation moments.
- Preserve Kael-owned pricing by setting normal-case `final_price` from `kael_price_max`; worker completion confirms work and notes, not price.
- After A14 review, write realtime memory evidence for L2/L3/L4/L5 and queue LS1-LS5 only. Skip LS6/LS7 unless the case has safety or decline signal.
- Build later agentic cases by changing the explicit skip/learning/notification plan rather than weakening the Case 1 baseline.

## 2026-05-15 - Prototype Runtime Cleanup

- Prototype code should live only until the approved production slice absorbs its useful decisions.
- Production React Native routes must not import prototype components, prototype routes, public mockups, or reference-code files.
- After cleanup, tests should assert prototype runtime artifacts are absent instead of asserting that review routes still exist.
- Durable design lineage belongs in product/design contracts and memory docs, not in throwaway runtime files.
- Expo store-bound apps should not ship `/prototype` routes or `apps/mobile/public` mockup artifacts.
- Keep lessons in this file when they should survive cleanup; do not preserve deleted prototype files just to retain context.
- Remotion visual explorations, `.superpowers/` brainstorm servers, and standalone design manuals should not stay in the production worktree unless Tu explicitly approves them as durable project assets.
- Root `design.md` is now an approved durable design operating system, not a scratch design manual. Do not delete it during prototype/runtime cleanup unless Tu explicitly asks.
