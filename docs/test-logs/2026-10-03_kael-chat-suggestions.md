# Kael Chat starters, ghost suggestions, and send states

Date: 2026-10-03

## Scope

Implemented the approved normal-chat plan for Customers and Workers:

- Light-mode send/stop colors use the shared idle and sending tokens.
- Starter prompts use one horizontal swipe rail with the scroll indicator hidden, mint capsule styling, and role/language-specific draft text.
- The static instruction line beneath the starters is removed. The short dynamic hint remains only while a ghost suffix is available.
- Selecting a starter edits the composer draft; it does not send or create a session.
- Follow-up suggestions are loaded from role-specific authenticated normal-chat routes, cached by account/role/session/source-turn/language, and never become message text until accepted.
- The suggestion route reads only the active session's context, scrubs text before DeepSeek, validates output, and does not write transcript or memory state.

At this initial implementation report checkpoint, no commit, push, pull request, or deployment had been performed. The later ship-preparation record below tracks subsequent Git actions.

## Identity and review

- Worktree: `C:/Users/Phan Manh Tu/.codex/worktrees/21dd/home-services`
- Branch: `codex/kael-chat-three-phases-20261002`
- HEAD: `7eb3e41f2af8c947c0434287be6c9280276365aa`
- Review fixed point: uncommitted working tree at the HEAD above; unrelated pre-existing dirty state was preserved.
- Specification: Tu's approved “Plan thực thi cho Luna MAX 6.0: Nút gửi và gợi ý trong Kael Chat” and supplied visual references.
- OCR: snapshot `624893263aa7538c5987cce7eaa4c6ae7e707479`, 49 reviewable files / 2,239 changed lines / 15 batches. All batches were read and marked; excluded router, plan, test-registry, and generated database-type files were also inspected manually. No blocking OCR finding was recorded.
- `kael-review`: spec compliance and both Customer/Worker wiring reviewed; AI remains server-side through the shared provider/spend boundary; session ownership, role, normal-chat mode, latest-turn freshness, PII scrubbing, and no-transcript-write constraints were checked. No blocking review finding was recorded.

## Verification

| Gate | Result |
|---|---|
| `pnpm type-check:shared` | PASS |
| `pnpm type-check:mobile` | PASS |
| `pnpm type-check:api` | PASS |
| `pnpm test:shared` | PASS — 7 files / 140 tests |
| `pnpm test:mobile` | PASS — 234 suites / 2,244 tests; no skipped tests |
| `pnpm test:api` | PASS — 123 files passed, 2 skipped; 1,718 passed / 2 skipped, plus 58 Node contract tests passed |
| `pnpm build` | PASS — workspace Next.js/Turbo build |
| `pnpm db:local:reset` | PASS — clean replay of 430 migrations and seed |
| `pnpm db:local:test` | PASS — 128 discovered / 128 executed / 128 passed / 0 failed |
| `pnpm db:local:types` | PASS — generated schema changes inspected; memory table, RPCs, and ordering are present |
| `pnpm harness:migrations:check` | PASS — 430 migrations |
| `pnpm harness:capabilities:check` | PASS — 266 routes |
| `pnpm harness:access:check` | PASS — 193 tables / 355 functions |
| `pnpm harness:pillars:check` | PASS — 283 unique pillars; manifest copies match |
| `pnpm lint:test-collection` | PASS — 13 CI-named filters collected |
| `pnpm lint:comments --working` | PASS |
| `pnpm lint:structure` | PASS — 1,329 source files; existing grandfathered exceptions reported |
| `pnpm doctor:react:changed` | PASS WITH FINDINGS — 34 diagnostics across 129 files, all outside the changed Kael composer surfaces |
| `pnpm design:preflight` | PASS |
| Deliberate mutation proof (scope isolation and ghost-not-sent) | NOT RUN — pillar tests cover both invariants, but the plan's two temporary mutation checks were not performed |
| `git diff --check` | PASS — CRLF informational notices only |
| `pnpm db:local:down` | PASS — local Supabase stack stopped after SQL verification |
| `pnpm edge:check` | BLOCKED — `mobile-api` reported `error waiting for container: unexpected EOF`; the command hung afterward and was interrupted. It is not a passing Edge check. |
| `pnpm lint:workplan` | FAIL — pre-existing `.scratch/work-plan.json` scope/read violations (25 violations, 90 files against a 76-file ceiling); unrelated state was preserved. |

The real local Postgres migration replay and SQL verification passed. Authenticated local HTTP tests using the real DB and provider stub were **NOT RUN**. Live DeepSeek smoke was **NOT RUN**, so live model availability, token use, cost, and latency remain unverified. Native iPhone/Android verification and screenshots were **NOT RUN**; `adb` and `xcrun` are unavailable in this environment. Browser Preview is not counted as native evidence.

## Risks and remaining evidence

- The UI/unit/regression gates and SQL gates pass, but full acceptance remains open until both Customer and Worker local HTTP flows are exercised with authenticated users and a provider stub.
- The plan's two deliberate mutation checks remain open; passing pillar tests alone does not prove those mutations turn assertions red.
- Run live DeepSeek smoke only when server credentials and runtime are available; record observed model, token count, cost, and latency without logging raw prompts or secrets.
- Capture the specified states on iPhone and Android. Do not treat the unavailable `edge:check` container as type-check proof; rerun it only under an approved runtime attempt.
- React Doctor diagnostics and the work-plan lint failure are outside this feature's changed composer/API files and remain documented rather than silently fixed.

## Next step

Complete authenticated local HTTP/provider-stub coverage, live DeepSeek smoke, and native Customer/Worker visual verification when the respective runtimes are available. Keep this work uncommitted until separately requested.

## Follow-up — Worker parity and starter-chip review

Date: 2026-10-03

- Added `P301-normal-chat-suggestions-router`, exercising both authenticated role routes through the real mobile-api handler. Customer and Worker dispatch to their matching services; cross-role calls and client-supplied `actor_id` are rejected before service dispatch.
- The first post-restart Worker Preview showed no static starters because the local visual-audit flag also suppressed the static rail. Split static starter eligibility from dynamic suggestion loading: an empty normal Worker Chat now shows the rail even when AI suggestions are unavailable. Dynamic suggestions remain disabled for the local visual-audit session.
- Removed the leading `+` decoration from every starter chip in the shared Customer/Worker rail. The rail remains one horizontal swipe row with hidden scroll indicators and mint capsule styling.
- Test first failed against the missing Worker starter eligibility function, then passed after the fix. The plus-removal assertions also failed against the old shared rail, then passed after the icon was removed.

### Follow-up verification

| Gate | Result |
|---|---|
| Focused API suggestions/router tests | PASS — 2 files / 8 tests |
| `pnpm type-check:api` | PASS |
| `pnpm test:api` | PASS — 124 files passed / 2 skipped; 1,720 passed / 2 skipped; 58 Node contract tests passed |
| `pnpm type-check:mobile` | PASS |
| Focused Customer/Worker starter and composer tests | PASS — 2 files / 13 tests |
| `pnpm test:mobile` | PASS — 234 suites / 2,245 tests; no skips |
| `pnpm harness:pillars:check` | PASS — 284 unique pillars; manifest copies match |
| `pnpm lint:test-collection` | PASS — all 13 CI-named filters resolve to collected tests |
| `pnpm lint:comments --working` | PASS |
| `pnpm doctor:react:changed` | PASS WITH FINDINGS — 34 diagnostics across 129 files; none point to the changed Kael starter/composer files |
| `pnpm lint:workplan` | FAIL — current broad worktree state: `.scratch/work-plan.json` declares 77 paths against 143 dirty paths, with 42 work-router violations; the new P301 route test was not flagged. Preserved as pre-existing scope state. |
| `git diff --check` | PASS — CRLF informational notices only |
| Incremental OCR review | PASS — snapshots `55b0710`, `11d4a88`, and `bfd56b7` were inspected and marked; the generated P298/P301/P302 registry entries were checked manually |
| `kael-review` follow-up | PASS — checked spec compliance, role/scope boundaries, and maintainability for the Worker static-rail fix and shared chip change; no blocking finding |

### Preview evidence and limits

- Restarted Expo web Preview on port 8085 and left two Codex In-app Browser tabs open. Customer: `http://localhost:8085/kael-chat?mode=normal&ns_audit_role=customer`. Worker: `http://localhost:8085/chat?ns_worker_screen=3.1-kael-chat-normal&ns_audit_role=worker`.
- Both rendered the four horizontal role-specific starter chips after reload, with no `+` inside the chips. The Worker screenshot also confirms the audit-preview path now keeps static starters visible.
- `apps/mobile/.env.local` is absent in this worktree, so the guarded Production-preview launcher could not load its required app environment. The running Preview uses the workspace Expo web script without Supabase credentials. It is UI-only: authenticated HTTP, provider calls, and send actions were not exercised. `ns_audit_role` selects local audit presentation; it is not authentication proof.
- This browser Preview is not native iPhone/Android evidence. Live DeepSeek, provider-stub HTTP, mutation checks, native screenshots, and the previously blocked `pnpm edge:check` remain open as listed above.

## Post-merge-base CI recovery — 2026-10-04

- Review point: PR #314, branch `codex/kael-chat-three-phases-20261002`, source HEAD `cc1bb1ae06b3b6f5a800d711f75666fd4f4b641c`.
- The first CI run after merging the current `main` base exposed two contract issues: the exact retired mode-menu aura file was missing from the deletion allow-list, and a workflow contract test assumed LF line endings. The allow-list now permits only that exact removed path; the test normalizes CRLF before assertions.
- `node --test scripts/harness/plan55-workflow-contract.test.mjs`: PASS — 18/18.
- PowerShell deletion-policy check: PASS — one deleted path, the approved aura component; zero unapproved deletions. The GitHub Linux control job also passed this guard.
- `pnpm lint:comments --working`: PASS. `git diff --check`: PASS.
- `pnpm ship:check`: PASS — 10/10 gates on clean HEAD `cc1bb1ae`. The command lists type-check/tests/build/lint, Edge checking, and SQL replay/matrix as separate checks not run by that local command.
- GitHub Actions on `cc1bb1ae`: PASS — secret/repository controls, harness and script-fixture suites, actor-scoped guard tests, type-check/tests/build/Kael evals/Edge checks, empty database replay/generated types/integration suite, and the Plan 55 package job. Production-only release jobs were skipped by their normal pull-request conditions.
- The first WSL shell reproduction could not resolve this Windows linked-worktree Git path; the PowerShell policy check and the actual GitHub Linux control job subsequently verified the deletion guard.
- This establishes CI and SQL matrix evidence for the pushed code. Authenticated local HTTP/provider-stub flows, live DeepSeek smoke, deliberate mutation checks, and native iPhone/Android screenshots remain NOT RUN. They remain open acceptance evidence; no deployment was performed.

## Ship preparation — 2026-10-04

The user authorized committing, pushing, and merging the complete current diff. This branch includes the Kael Chat phases and UI follow-ups, Worker dock/earnings/profile updates, and the requested Docker RAM-gate removal. They are being reviewed as one explicitly multi-theme change set. No deployment is included.

### Current verification

| Gate | Result |
|---|---|
| `pnpm test:api` | PASS — 124 files; 1,720 passed / 2 skipped; plus 58 Node contract tests |
| `pnpm test:mobile` | PASS — 234 suites / 2,245 tests; no skips |
| `pnpm test:shared` | PASS — 7 files / 140 tests |
| `pnpm type-check:shared` | PASS |
| `pnpm type-check:mobile` | PASS |
| `pnpm type-check:api` | PASS |
| `pnpm build` | PASS — workspace build |
| `pnpm db:local:reset` | PASS — clean replay of 430 migrations and seed on the verified `nestscout` volume |
| `pnpm db:local:test` | PASS — 128/128 SQL checks |
| `pnpm db:local:types` | FAIL — Supabase CLI 2.98.2 attempted `127.0.0.1:5432`; the verified local DB was configured at `127.0.0.1:55322`. No database URL override was used and generated types were not overwritten by this failed run. |
| `pnpm edge:check` | PASS — all 6 canonical Edge functions, including `mobile-api`, checked successfully on the clean retry |
| Focused Docker contract suite | PASS — 27 passed / 1 skipped / 0 failed; the single skip is only when Windows Application Control blocks the temporary native Docker shim |
| Harness migration/capability/access/manifest checks | PASS — 430 migrations; 266 routes; 193 tables / 355 functions; 35 skills / 10 tools / 1 provider adapter / 2 routers |
| `pnpm harness:verify` | PASS — hosted health probe returned HTTP 500 and was treated as no prior release |
| `pnpm harness:pillars:check` | PASS — 284 unique pillars; copies match |
| `pnpm lint:test-collection` | PASS — 13/13 CI filters resolve |
| `pnpm lint:comments --working` | PASS |
| `pnpm lint:structure` | PASS — 1,329 files; only grandfathered exceptions reported |
| `pnpm doctor:react:changed` | PASS WITH FINDINGS — 34 diagnostics across 129 files; findings were reviewed against the changed surfaces |
| `pnpm design:preflight` | PASS |
| `pnpm lint:edge-db` | PASS — 247 RPC names resolved; 0 unscannable |
| `pnpm exec node --test scripts/check-docker-contracts.test.mjs` | PASS — 27 passed / 1 skipped / 0 failed |
| `pnpm ship:check` | PASS — 10/10 gates on clean HEAD `6b5e9033`; the checker explicitly lists type-check/test/build/lint, Edge, and SQL as separate commands rather than proof from this gate |
| `pnpm lint:workplan` | FAIL — `.scratch/work-plan.json` is stale for another mission (42 work-router violations; 77 declared paths versus 143 dirty paths); scratch state was preserved |
| `git diff --check` | PASS — only line-ending notices |
| `pnpm db:local:down` | PASS — local services stopped; verified `nestscout` Docker volume remains present |

### Review and remaining evidence

- Source review fixed point: original implementation diff from `7eb3e41f2af8c947c0434287be6c9280276365aa` through `cd7fdf0e`; generated-inventory follow-up is commit `6b5e9033` on branch `codex/kael-chat-three-phases-20261002`.
- Spec source: Tu's approved Kael Chat implementation plan and the subsequent explicit requests to remove starter-chip plus signs and include every current diff in the ship request.
- Spec compliance: Customer and Worker use the shared starter rail and message-suggestion behavior; suggestions are server-routed through the existing spend/provider boundary, and the separate Work flow remains outside this route. Docker RAM is informational and no longer blocks the local lane.
- Rules and security: ownership, role, normal-chat scope, latest-turn freshness, PII scrubbing, and no transcript/memory writes were reviewed in the implementation record above. Free-form address formats beyond known scrubber patterns remain a limitation, not a proven complete PII defense.
- Maintainability: starter UI and suggestion cache are shared; role API handlers remain thin; new suggestion purpose is registered in the manifest. The host-policy test skip is narrowly matched to the OS block message.
- Scope: this is deliberately a multi-theme PR because the user authorized all current diff. No unrelated `.scratch` work-plan or Production state is being changed.
- The first clean `pnpm ship:check` run caught stale migration/access digests after removing the extra EOF blank line from the new migration. Both registries were regenerated through the official writers; the focused Plan 55 suite passed 53/53, `pnpm harness:verify` passed, and a clean rerun of `pnpm ship:check` passed all 10 gates at `6b5e9033`.
- Authenticated local HTTP/provider-stub flows, live DeepSeek smoke, deliberate mutation checks, and native iPhone/Android screenshots remain NOT RUN. Browser Preview is not native evidence. These gaps keep full feature acceptance unverified even though automated unit/type, SQL, Edge, and build gates pass.
