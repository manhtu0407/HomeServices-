# Home Services Agent Lessons

## 2026-09-24 - One CI workflow, one pass per gate, and the pushes that burned the month

- **The five pull-request workflows are now one `ci.yml`** with three jobs: `controls` always, then `workspace` and `database` when the paths select them. Before the merge, one push that touched two harness scripts billed 36 minutes, because the whole-workspace type-check ran three times, the tests twice, and the Deno checks twice. A new gate goes into the one job that owns it, never into a second workflow.
- **What burned September was agent behaviour, not only duplication.** One session pushed about 12 pull requests two or three times each, waited on a `CONFLICTING` pull request that never gets CI, and dispatched the Production release lane repeatedly (28 to 58 minutes each). Open pull requests as drafts, check `mergeStateStatus` before waiting, fix locally, mark ready once, and diagnose a failed smoke before dispatching again.
- **The strict `release-production` lane is paused by the repository variable `NESTSCOUT_STRICT_RELEASE_ENABLED`.** Pillar P56 forbids a manual dispatch for it, so its push trigger stays and its jobs skip for free while the variable is unset. Do not set the variable until `transaction-critical-coverage.mjs --require-mapped` can pass.

## 2026-09-21 - Every push to a pull request is billed, and a billing block looks like a code failure

- **CI minutes are metered and a spending limit blocks everything.** CI was blocked five times in six days in September. Jobs that fail within seconds having run no steps, with the annotation "spending limit needs to be increased", are a billing block, not a code fault; rerunning them proves nothing.
- **One push costs 20 to 40 minutes**, because lanes are chosen by the whole pull request diff, not the last commit, and each job rounds up to a whole minute. Iterate in a **draft** pull request (CI skips drafts), batch commits, run `pnpm ship:check` first, and push once per review round.
- **Check headroom before a burst of pushes:** `node scripts/ci-usage-report.mjs --month <YYYY-MM> --budget <cap>`. Only the account owner can read the plan and budget, so pass the cap as an argument. With fewer than three full pushes of headroom, stop and tell Tu.
- **Never add a cron above four runs a day.** `pnpm lint:workflow-cost` fails it. Availability monitoring belongs on an external uptime service; a `*/15` cron is 672 billed runs a week.
- The whole model, measurements, and runbook are in `docs/ops/github-actions-cost.md`.

## 2026-08-21 - Editing a skill, and the checksum that goes with it

- **Editing any `SKILL.md` invalidates its recorded checksum.** `config/harness/manifest.json` stores a `git-blob-sha1` per skill, so a perfectly intended edit turns `harness:manifest:check` red. The sequence after touching a skill is: `pnpm skills:sync` (mirror to `.agents/`), then `pnpm harness:manifest:write` (record the new hash), then `pnpm harness:manifest:check`. Do **not** hand-edit the hex in the JSON — that is how it gets typed wrong or skipped.
- `harness:manifest:write` writes checksums and nothing else, and **refuses while any other problem is outstanding** (mirror drift, missing path, count drift). If it refuses, fix the real problem first; it is not a way to make the gate quiet.
- `config/harness/manifest.json` is CRLF with one compact entry per line and does **not** round-trip through `JSON.stringify(value, null, 2)`. Edit it by targeted line replacement, or a two-line change becomes a whole-file diff.
- `config/agent-skills/skills-lock.json` is a different thing and must not be "corrected" to match: it holds the sha256 of the **upstream** file at install time, matches neither the local CRLF nor LF hash, and is read by no script. Rewriting it destroys provenance.
- Windows-only trap that CI cannot see: the working tree is CRLF (`core.autocrlf=true`) while `.gitattributes` does not cover `SKILL.md`. Any tool that parses skill bodies must use `\r?\n`, never a bare `\n`. A bare `\n` in a fenced-block regex made `check-skill-contracts` report 25 false violations locally while staying green on ubuntu CI.

## 2026-07-14 - Docs conventions + Kael teaching playbooks

- `README.md` is a locked filename in this project (the root `README.md` is on the locked list). Do NOT create new `README.md` files for folder indexes; use `INDEX.md`, matching the existing `docs/test-logs/INDEX.md` convention. `docs/INDEX.md` is the docs navigation map.
- When archiving a doc, update references only in ACTIVE/forward-looking files (e.g. `governance/Plan.md`); leave historical snapshots (`docs/memory/*`, `docs/test-logs/*`) untouched as point-in-time records, and document the move in `docs/archive/INDEX.md`.
- Never archive on a rubber-stamp when evidence contradicts. `kael-core-v9.md` was an approved archive candidate, but it is referenced by `governance/design/ASSET_MAP.md` and other docs read "Superseded by Kael Core v9" — it is the current direction. Kept it; verify supersession before moving design-lineage docs.
- Teaching Kael = distilling reasoning into a playbook (prompt segment + knowledge) measured by an eval, NOT model training. The repeatable method is `docs/playbooks/process-distillation.md`. Bind every emitted token to the exact code contract; the clarification-question filter silently rejects any question containing " và ", and `customer_sentiment` only accepts `neutral|detail_oriented|pressure`.

## 2026-05-26 - Kael Cost Optimization Q1 Baseline

- Keep baseline rows even when fixture jobs and provider logs are cleaned. Persist aggregate evidence in `kael_quality_baseline` and safe per-call flags/cost signals in `kael_optimization_metrics`.
- A successful job-level baseline can still expose provider-level instability. In Q1, all 50 staging jobs completed, while DeepSeek and Perplexity each hit 6 timeout rows at their current budgets.
- Do not start Source Trust before the Plan.md dependency is true. §25 R0 requires §24 Q3 market cache to exist and be verified.

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
