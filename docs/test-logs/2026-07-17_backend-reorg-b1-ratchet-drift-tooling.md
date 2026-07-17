# Backend Reorg §44 — B1 Ratchet + Drift Contract Tooling

Closes the live ratchet hole (F5) and builds the Drift Contract tooling (§44.4 D1/D2) that every
later increment depends on. Scope is `scripts/` only — no backend runtime file was touched.

- **Date:** 2026-07-17
- **Branch:** `claude/backend-audit-restructure-609b5d` (worktree `multi-llm-plan-review-fa5814`)
- **HEAD:** `0359f1db2`
- **Entry gate:** B0 green (see `2026-07-17_backend-reorg-b0-green-baseline.md`)
- **Verdict:** B1 acceptance met. Not committed (awaiting Tu).

## Result

| Gate | Exit | Result |
|---|---|---|
| `deno check` (Edge) | 0 | clean |
| `lint:structure` | 0 | `632 source files; 8 grandfathered oversize, 120 dup-type groups` |
| `lint:comments` (full) | 0 | clean |
| `lint:comments --working` | 0 | clean (Stop-hook ratchet over the new scripts) |
| `check-reorg-drift` (new) | 0 | `every file under the scanned roots has one declared home and sits in it` |
| test `apps/api` | 0 | 215 files passed, 4 skipped · **2876 passed, 75 skipped** |
| test `packages/shared` | 0 | 23 files passed · **725 passed** |

Test totals identical to B0 (**3601 passed, 0 failed**) — B1 changed no behaviour.

## 1. Ratchet re-init — F5 closed, and it only TIGHTENED

`node scripts/lint-structure.mjs --init` regenerates from the working tree, so the real risk is that
a regen silently *grandfathers* new debt. Verified by diffing the committed baseline against the
regenerated one:

| Check | Result |
|---|---|
| Newly grandfathered oversize files | **0** |
| Per-file caps raised | **0** |
| New dup-type groups | **0** |
| Dup-type file lists that grew | **0** |
| Oversize entries dropped (now under the 800 cap, fully enforced) | **6** |
| Oversize caps lowered | **8** |
| Dup-type groups resolved | **2** (`KaelLottieSource`, `KaelChatMediaUploadInput`) |

Caps lowered (slack removed):

| File | Was | Now | Slack removed |
|---|---|---|---|
| `_shared/router.ts` | 2,534 | **1,174** | −1,360 (could have grown 2.16x unnoticed) |
| `customer/v21/surfaces.tsx` | 5,637 | **1,833** | −3,804 (3.07x) |
| `worker/worker-v5-flow.tsx` | 7,472 | 7,184 | −288 |
| `lib/frontend-workflow-provider.tsx` | 1,833 | 1,303 | −530 |
| `kael/cron/process-batch-results.ts` | 1,059 | 948 | −111 |
| `customer/booking-wizard.tsx` | 1,954 | 1,899 | −55 |
| `ui/kael-primitives.tsx` | 1,103 | 1,101 | −2 |
| `ui/floating-glass-tab-bar.tsx` | 1,050 | 1,048 | −2 |

Baseline entries: 14 → 8. `router.ts` now pinned at its real size, so B5's target (<800) is enforceable.

## 2. Drift Contract tooling

**`scripts/reorg-manifest.json`** — declarative home for all 117 Edge source files.
- `services/` = **regex** (16 folders). A new `kael-chat-*` file is auto-absorbed — D1's "không ai phải nhớ".
- `kael/` = **explicit list** (11 folders + `index.ts`/`types.ts` at root). Deliberate per D-9: kael filenames
  carry no domain prefix, so a new file matches nothing and routes to a human rather than being guessed.

Verified mechanically against the §44.3.2/§44.3.3 target tables — **every folder count matches**:
services `54/54` (_runtime 6, kael-chat 13, jobs 9, matching 5, workers 3, worker-kael 3, scope-change 2,
cancellation 2, completion-review 2, profile-insights 2, kael-memory 2, notifications/places-geo/
apartment-access/admin/catalog 1 each); kael `61/61` (case-work 9, guards 10, stages 7, provider 7,
routing 7, memory 4, market 4, source-trust 3, charter 6, observability 3, _runtime 1).

**`scripts/check-reorg-drift.mjs`** — modelled on `check-comment-discipline.mjs` (zero deps, same exit
convention). Exit 0 clean / 1 drift / 2 manifest failure.

### Semantics — a deliberate reading of D2 worth recording

D2 says a flat file under `services/` should FAIL, but B1 requires the tool to PASS on the current tree,
where all 54 are still flat. Read together with D1 (auto-absorb) and D8 (resume contract), the coherent
reading is: **the drift tool enforces destination coverage + correct placement, not root-emptiness.**
Flat-but-claimed is reported as `pending`. The "root must be empty" invariants I1/I2 are assigned to
`lint-structure.mjs` at **B9**, exactly as D7's own table states. Recorded here because the code picked a
side on an ambiguity in the plan text.

## 3. A real defect was found and fixed before B1 closed

The first version of the checker **passed a misplaced file**. Reproduced directly: moving
`spend-gate.ts` (declared home `guards/`) into `kael/market/` printed `clean`, exit 0.

This mattered because **no other gate catches it**: I1/I2 only look at the root, I3 is size-only, and I6's
byte-diff is byte-identical for a file dropped in the wrong folder. Across B2/B3's ~113 hand-driven moves,
a file shoved into the nearest-looking folder — the exact thing §44.P.6 forbids — would have been invisible
and permanent.

Fixed: the checker now recurses into every declared folder and asserts each file resolves to the folder it
sits in. Per-root `renamesExpected` handles the asymmetry honestly — `services/` renames at B4
(`job-create.service.ts` → `jobs/create.ts`), so an unrecognisable name inside a folder is accepted as
already-renamed; `kael/` keeps filenames, so an unlisted file there is a genuine error and fails.

Also fixed in the same pass:
- **Regexes realigned to the plan's own D1 JSON.** Five rules had been silently narrowed (e.g. `cancellation`
  shipped `\.` where D1 writes `[-.]`), weakening auto-absorb. Re-verified: all 54 files still resolve identically.
- **Stale-entry (reverse coverage)** — a manifest entry naming a deleted file now fails, so the hand-maintained
  kael list cannot rot.
- **`__tests__` no longer mistaken for a domain** (mirrors `lint-structure.mjs` SKIP_DIRS).
- **Nested folders** now scanned (§44.3.3 already anticipates `case-work/intake/`).
- **Honest progress counters** — `kept` (pre-existing `agentic`/`cron`/`playbooks`/`skills`) split from `moved`,
  so a resuming agent reads real B3 progress (0/61) instead of a misleading 24/85.

## 4. Verification — every branch exercised for real

| # | Scenario | Expect | Got |
|---|---|---|---|
| 1 | current tree | 0 | **0** |
| 2 | misplaced file inside wrong folder | 1 | **1** — `spend-gate.ts is misplaced — its declared home is guards/` |
| 3 | unclassified file inside a kael folder | 1 | **1** |
| 4 | stale manifest entry (file deleted) | 1 | **1** |
| 5 | `__tests__` dir present | 0 | **0** |
| 6 | correctly moved + renamed services file | 0 | **0** |
| 7 | unclaimed flat file in `services/` | 1 | **1** |
| 8 | unclaimed flat file in `kael/` | 1 | **1** |
| 9 | undeclared folder | 1 | **1** |
| 10 | new `kael-chat-*` file (D1 auto-absorb) | 0 | **0** — claimed as `-> kael-chat/` |
| 11 | two rules claim one file | 1 | **1** — reported as a tie, not first-match-wins |
| 12 | filename listed under two folders | 2 | **2** |
| 13 | invalid regex | 2 | **2** |

All probe files removed; `git status -- supabase/` empty after every experiment.

## 5. Open findings — NOT fixed, deliberately out of B1 scope

Reported rather than silently carried:

1. **The drift check is wired into nothing.** D2 says "chạy đầu MỖI increment + trong CI", but there is no
   `package.json` script and no CI job — it only runs when someone types it, which is the human-memory
   dependency D1 exists to remove. **Not fixed because the B1 diff is constrained to `scripts/` + `docs/test-logs/`.**
   Needs Tu's go to touch `package.json` + `.github/workflows/`. Until then B1 can be green while drift lands.
2. **`baseline.maxLines` is written but never read.** `lint-structure.mjs` checks the module constant
   `MAX_LINES = 800`; editing that one constant silently relaxes the cap for all 632 files with CI green.
   Belongs to B9 (which owns `lint:structure` changes), not B1.
3. **`--init` unconditionally blesses the working tree** — no "may only shrink" guard. This regen was verified
   clean by hand, but that is a property of the tree, not the tool. B2/B3 create strong pull to re-init. A
   shrink-only guard belongs with B9.
4. **The factory `_shared/services.ts` sits outside both scanned roots**, so nothing enforces that
   §44.3.2's `services/index.ts` move ever happens. The `rootAllowlist` reserves the slot but never checks it.
5. **`^job-` is a superset prefix.** A future `job-cancellation.service.ts` would be absorbed to `jobs/`
   silently rather than routed to `cancellation/`. Correct for all 54 files today; a future-drift exposure.

## 6. Honest limits

- The adversarial review that surfaced the misplacement defect ran as 5 review agents + 15 refutation agents;
  **all 15 refutation agents died on a session limit**, so the workflow's "0 findings survived" is an artifact
  of the crash, not a verdict. One reviewer (`tool-robustness`) also died before reporting. Every finding acted
  on above was re-verified by hand against the real tree; the un-run lens means the review is **not exhaustive**.
- No mobile tests, no integration tests, no type-check, no deploy (all out of §44 B0/B1 scope).
- Nothing committed.
