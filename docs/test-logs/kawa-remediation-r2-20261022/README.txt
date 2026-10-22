KAWA_01 six-service and H5 diagnostic - targeted remediation round 2 (PR #405) - evidence package
Date: 2026-10-22. Tier: T0 (T1/T2/T3 NOT_RUN). Branch claude/nestscout-remediation-r1-20261022, on top of the reviewed round-1 commit 04317126635a4207a3f9b9ba35ffccf053d16340.
Base: origin/main 42daced1a52ca5b8e5ee2e0b982c28e697f184c9. The round-1 folder, the diagnostic baseline package and the audit are not modified here.

Read in this order
  REPORT.md              state found, root causes, changed files, before/after, coverage, verification, risks, review checklist, tier limits
  results/tables.md      the 36 frozen scenarios (main, round 1, round 2), S5 checkpoints, hazard route / visible guidance / metadata

Contents
  scripts/   run-candidate.mjs   injects the frozen diagnostic harness (hash-checked, H5 file never injected), runs one vitest file, removes the harness
             reproduce.mjs       the frozen matrix, journeys, supplementary matrices and handler drivers for a phase
             compare.mjs         verdict and per-assertion comparison of two scored result files
             scorecard.mjs       scorecard of this candidate against main and against the round-1 candidate, derived from raw results
             triplet-table.mjs   route / visible guidance / metadata for every hazard checkpoint, three-way
             make-tables.mjs     renders results/tables.md
             red-first.mjs       the round-2 pillar files against 04317126 (scratch worktree, put back afterwards) and against this candidate
             final-pass.mjs      every suite and gate, one command per step, exit codes recorded
             build-report.mjs    assembles REPORT.md from the result files and logs
             secret-scan.mjs     local secret-scan evidence (pinned scanner image, repository ruleset)
             make-digests.mjs    sha256 of every file here except file-digests.json and logs/secret-scan/
  results/   post/ (frozen matrix, journeys, supplementary, handler and hazard drivers on this candidate), red-first/ (JSON reporter output),
             scorecard.json, triplet-table.json, red-first-summary.json, final-pass-summary.json, tables.md
  logs/      final/ (every step of the final pass), red-first/, secret-scan/ (excluded from the digests: written after them),
             commands.jsonl and final-commands.jsonl (command, exit, injected-file hashes), and the drafts kept for the record:
             red-p419-on-r1-candidate.log.txt and red-p421-on-r1-candidate-draft.log.txt (first red runs, earlier versions of the test files),
             p421-attempt1.log.txt, p421-attempt2.log.txt (first implementation, before the two class-level refinements),
             p421-heldout-b-first-run.log.txt and p421-heldout-c-first-run.log.txt (the fresh sets, run once)
  file-digests.json   sha256 of the files above, digest first then path

Inputs used unchanged (verified by every run)
  scenario-matrix.json            sha256 dd8392cbcc2fec7ad4f0b1611a52abea0cb7ed86fc681972fec9707c74a51dd7
  kawa-diag-matrix-pillar.test.ts f9f61e2b3aa079d58501407bede0f42bf05cc472700d033438f0009fe8a26a75
  kawa-diag-journey-pillar.test.ts 2e9de0780ff9fb68b56e5fa8630b3eb38db9c00273fc7463ec58778c871fb087
  diag-support.ts (v1.1)          ed5770514c61effafa360af670fa3c633feaf3a56287540dfdf1512a104c9f72
  supplementary-matrix.json       a657eb4f61be4fe8ce7a16e0312de63acc916d868229551fab76c741cbf5d20c
  sealed-h5.json                  not read, not run, not changed

Reproduce (needs the candidate checkout, a scratch checkout of main at C:/ns-fix/base, and the diagnostic branch checked out somewhere)
  KAWA_BASELINE_DIR=<diagnostic branch>/docs/test-logs/kawa-diagnostic-baseline-20261021
  KAWA_AUDIT_DIR=<diagnostic branch>/docs/test-logs/kawa-diagnostic-audit-20261022
  KAWA_R1_WORKTREE=<candidate checkout>, default C:/ns-fix/r1
  node scripts/final-pass.mjs            every step in order
  node scripts/final-pass.mjs red-first  one step

Not done on purpose
  No merge, deploy or release. No migration, RPC, flag change, hosted or Production resource, paid or live model call.
  No change to a frozen fixture, a scenario id, an expected result, a hash, the round-1 folder, the diagnostic baseline package, the audit or the sealed H5 set.
  No change to a workflow, a scanner rule or configuration, a gate script, a harness manifest or a test-debt ledger. The only security-related edit is three pinned lines in .gitleaksignore.
  KAWA_02 was not started. Protected session memory was not written. No locked governance document was edited.
