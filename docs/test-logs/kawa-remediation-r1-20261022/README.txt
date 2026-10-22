KAWA_01 six-service and H5 diagnostic - targeted remediation round 1 (DX-01, DX-02, DX-03) - evidence package
Date: 2026-10-22. Status: UNCOMMITTED in the worktree C:/ns-fix/r1 on branch claude/nestscout-remediation-r1-20261022; awaiting independent review. Tier: T0 (T1/T2/T3 NOT_RUN).
Base: origin/main 42daced1a52ca5b8e5ee2e0b982c28e697f184c9 (KAWA_01 merged). Diagnostic baseline package and audit are on branch claude/nestscout-kawa-01-diagnostic-bd0158 and are NOT modified here.

Read in this order
  REPORT_D_closure_scorecard.md   verdict, closure per defect, S5 T1 dependencies, owner decisions, claims-to-evidence block
  REPORT_A_implementation.md      root causes, exact source changes, regression tests, changed existing tests, compatibility, rollback
  REPORT_B_regression_matrix.md   the 36 frozen scenarios (baseline vs candidate), flags off and on, hazard checkpoints, suites and gates
  REPORT_C_safety.md              route / guidance / metadata, negative controls, H5 limits, remaining production risks

Contents
  scripts/      run-candidate.mjs   injects the frozen harness (hash-checked), runs one vitest file, removes the harness
                reproduce.mjs       the frozen matrix, journeys, supplementary matrices and handler drivers for a phase (pre | post | base)
                compare.mjs         verdict and per-assertion comparison of two scored result files
                scorecard.mjs       derives the baseline-vs-candidate scorecard from raw results (results/scorecard.json)
                triplet-table.mjs   route / visible guidance / metadata for every hazard checkpoint (results/triplet-table.json)
                make-tables.mjs     renders results/tables.md
                final-pass.mjs      the complete final regression pass, one command per step
                probe-scanner-vs-gate.mjs   why the intake-policy scanner was not reused for DX-02
                worktree/           kawa-r1-hazard-triplet-pillar.test.ts (derived from the audit handler driver; adds the route metadata)
  results/      pre/   unmodified main in the new worktree (reproduction before any edit)
                base/  clean worktree C:/ns-fix/base at 42daced1 (triplet driver and the flags-on C6b rerun)
                post-attempt1-boundary-guard-only/   the first candidate run, kept because ELEC-S2 still failed (second keyword site)
                post/  the final candidate
                scorecard.json, triplet-table.json, tables.md, probe-scanner-vs-gate.json, final-pass-summary.json
  logs/         raw output per run; red-*.log.txt and red-on-baseline-*.log.txt are the failing runs before the fix;
                green-*.log.txt the passing runs; gates/ the individual gate logs; final/ the final regression pass;
                commands.jsonl and final-commands.jsonl record command, exit and the hash of every injected file

Inputs used unchanged (verified by every run)
  scenario-matrix.json            sha256 dd8392cbcc2fec7ad4f0b1611a52abea0cb7ed86fc681972fec9707c74a51dd7
  kawa-diag-matrix-pillar.test.ts f9f61e2b3aa079d58501407bede0f42bf05cc472700d033438f0009fe8a26a75
  kawa-diag-journey-pillar.test.ts 2e9de0780ff9fb68b56e5fa8630b3eb38db9c00273fc7463ec58778c871fb087
  diag-support.ts (v1.1)          ed5770514c61effafa360af670fa3c633feaf3a56287540dfdf1512a104c9f72
  supplementary-matrix.json       a657eb4f61be4fe8ce7a16e0312de63acc916d868229551fab76c741cbf5d20c
  sealed-h5.json                  not read, not run, not changed

Reproduce (needs the two worktrees, installed offline, and the diagnostic branch checked out somewhere:
  KAWA_BASELINE_DIR=<diagnostic branch>/docs/test-logs/kawa-diagnostic-baseline-20261021
  KAWA_AUDIT_DIR=<diagnostic branch>/docs/test-logs/kawa-diagnostic-audit-20261022   (the audit folder is untracked on that branch at the time of writing)
  KAWA_R1_WORKTREE=<candidate checkout>, default C:/ns-fix/r1)
  node scripts/reproduce.mjs post                      frozen matrix + journeys + supplementary + drivers on the candidate
  KAWA_R1_WORKTREE=C:/ns-fix/base node scripts/reproduce.mjs base triplet,supp-c6b-flags-on      baseline-side runs
  node scripts/scorecard.mjs && node scripts/triplet-table.mjs && node scripts/make-tables.mjs
  node scripts/final-pass.mjs                          every gate and suite, in order

Not done on purpose
  No commit, push, merge or deploy. No migration, RPC, flag change, hosted or Production resource, paid or live model call.
  No change to a frozen fixture, a scenario id, an expected result, a hash, the diagnostic baseline package, the audit, or the sealed H5 set.
  KAWA_02 was not started. Protected session memory was not written. No locked governance document was edited.

Scratch worktrees (outside the repository, registered in its git metadata)
  C:/ns-fix/r1    the candidate (uncommitted changes live here)
  C:/ns-fix/base  clean detached checkout of 42daced1, used for baseline-side runs; it holds no change.
  Remove the baseline one with: git worktree remove --force C:/ns-fix/base   (then robocopy an empty folder over node_modules if Windows long paths block deletion).
  Do not remove C:/ns-fix/r1 until the change is committed or discarded by the owner.
