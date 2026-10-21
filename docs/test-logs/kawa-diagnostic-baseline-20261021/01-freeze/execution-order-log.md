# Order of operations (UTC, 2026-10-21)

Times come from `01-freeze/*.json` and `logs/commands.jsonl`. They exist so a reader can check that the matrix was frozen before it was run and that H5 phrase text and classifier cue lists were read only after the scored runs.

| Time | Event |
|---|---|
| before 16:11 | Governance, KAWA ledger, safety coverage matrix and the H5 *aggregate* (metrics and missed row ids with their expected routes) read. Cue lists, development fixtures and H5 phrase text NOT read. Two detached worktrees created and installed offline. One neutral sentence run on both snapshots to prove the harness binds (not a scenario). |
| 16:11:30 | `scenario-matrix.json` hashed and frozen (`dd8392cbcc2fec7ad4f0b1611a52abea0cb7ed86fc681972fec9707c74a51dd7`) |
| 16:16:00 - 16:18:23 | Harness self-test on neutral sentences and the published P414 sentinels (never a frozen input). It showed (a) the confirm route needs the harness-audit RPCs to answer, (b) STRUCTURES documents event names the code no longer has |
| 16:18 - 16:21 | Interpretation register I1-I7 written; harness patched for (a) and for the journey verdict precedence; SUPP-C6b pre-registered; supplementary and harness hashes written |
| 16:21:29 | Harness frozen (`harness-freeze.json`) |
| 16:21:44 - 16:22:08 | **Scored runs**: matrix and journeys, BEFORE then AFTER, two repeats each |
| 16:23 - 16:25 | Pre-registered supplementary runs: SUPP-C6b, then SUPP-FLAGS (harness v1.1 switch added before this run) |
| after 16:25 | `emergency-guidance.ts`, `emergency-signal-text.ts`, `boundary-guard.ts`, the development fixtures and the H5 phrase rows read for the first time |
| 16:30 - 16:35 | H5 classifier + end-to-end runs, development-set and perturbation probes, counterfactual probes (rounds 1-3), full existing API suites |

## Things that went wrong and were kept

- My first draft of S5 checkpoints J06/J08 used event names from STRUCTURES section 12.3; two do not exist in code. Handled through the interpretation register, not by editing the matrix.
- The first background run of the existing suites never started (a backslash lost in a shell here-document). It was rewritten with a file and rerun; the failed attempt wrote nothing.
- Round-1 counterfactual for H5-019 (synonym) was wrong and the compound edits for H5-001/013/014/028 did not isolate a single change; rounds 2 and 3 are additional probes, and all three rounds' outputs are kept (`05-h5/probes-round*.json`).
- The first version of my own workflow note said KAWA_01 closed-Case guidance was not rendered by the client; the ledger section I had read predated the final remediation. I corrected it after checking the error body (structured `emergency` field) and running the mobile P418 pillar (29/29).
