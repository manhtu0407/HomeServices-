# Proposed session memory (NOT written)

`.claude/MEMORY.md` and `docs/memory/2026-10.md` are protected and were not touched. `docs/memory/INDEX.md` requires Tu to confirm the draft before it is written. If approved, the two writes are: prepend the entry below to `docs/memory/2026-10.md`, and prepend the one-line hook to the Recall Index in `.claude/MEMORY.md`.

## One-line hook (Recall Index)

- **2026-10-21** KAWA_01 six-service + H5 diagnostic - 36 frozen T0 scenarios x BEFORE/AFTER: 23 improved, 13 unchanged, 0 regressed; H5 11/29 traced to cue matching (LEXICAL_COVERAGE) for 22/22 misses; found a pre-existing false out-of-scope decline that closes the Case (boundary-guard appliance keywords) and a gate-defers-to-flagged-playbook loss; package is `docs/test-logs/kawa-diagnostic-baseline-20261021/`, UNCOMMITTED, T1/T2/T3 NOT_RUN.

## Full entry (for `docs/memory/2026-10.md`)

## 2026-10-21 KAWA_01 six-service baseline and H5 root-cause diagnostic

- Compared `ce4bd3cd` and `42daced1` with a matrix frozen before any run (sha256 `dd8392cb...`, 36 scenarios) through the repository's real Edge handler with providers stubbed and an in-memory DB (T0). Scored 72 executions (+72 determinism repeats, all identical): 23 IMPROVED, 13 UNCHANGED, 0 REGRESSED. Hazard steps with an acceptable emergency number 0/21 -> 20/21; H5 rows 0/29 -> 11/29; no business action in any run. Existing API suites green in both (AFTER 3,438 passed/0 failed/6 skipped; BEFORE 2,456/0/6). Mobile P418 29/29.
- H5: every one of 18 misses, the 1 false alarm and the 4 judgement misses fail at cue matching (no regex matched); zero caused by normalisation, segmentation, negation, routing, entry point or delivery. 11 rows' mechanism isolated by a single-change counterfactual against the unchanged classifier (digit token in a filler span, two-word span limit, synonym, word order, English tense). Development rows 267/267; one wrong tone mark loses 40 %, one typo about 30 %.
- New findings: (1) `boundary-guard.ts` `OUT_OF_SCOPE_KEYWORDS` declines any request that merely mentions an appliance ("máy giặt", "bình nóng lạnh", "máy bơm") with zero provider calls and the Case becomes `unsupported` - pre-existing, no regression test; (2) with `KAEL_PLAYBOOK_*` flags on, the KAWA_01 gate defers to the flagged path and 4/21 hazards lose their number (17/21 vs 20/21); Production flag state unknown; (3) STRUCTURES section 12 is stale against the code (21 events not 24, `customer_started_payment`, payment skip closed, 20 phases).
- Gaps: T1/T2/T3 NOT_RUN; J03 quote-readiness is decided in SQL (BLOCKED); model-assisted safety, Production flags, native rendering and the 429 new-Case quota case not exercised; phrases agent-authored and non-blind; KAWA_02/05 specs are not in the repo. Production release containment verified read-only: `NESTSCOUT_BACKEND_RELEASE_ENABLED=false`, backend workflow skipped, `release-production` fails in its gate before any release step, `production` environment has no protection rules.
- Environment: two detached worktrees at `C:/ns-diag/{before,after}` (outside the repo, untracked harness files only; remove with `git worktree remove --force` plus `robocopy /MIR` on Windows because of long pnpm paths). Shell here-documents lose backslashes - write scripts with the editor, not `cat <<EOF`.
