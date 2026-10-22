KAWA_01 remediation round 2, follow-up on PR #405 (R2b) - evidence package
Date: 2026-10-22. Tier: T0 (T1/T2/T3 NOT_RUN). Branch claude/nestscout-remediation-r1-20261022, on top of the round-2 commit 5f44351ea8b080a2f0a66d0d61267fab00da68d2.
Base: origin/main 42daced1a52ca5b8e5ee2e0b982c28e697f184c9. The round-1 and round-2 folders, the diagnostic baseline package and the audit are not modified here.

Read in this order
  REPORT.md           what Codex found, one more defect found while checking it, root causes, changes, before/after, coverage, verification, risks, checklist, tier limits
  results/tables.md   the 36 frozen scenarios (main, round 2, this candidate), S5 checkpoints, hazard route / visible guidance / metadata

Contents
  scripts/   same runner and tooling as the round-2 folder (run-candidate, reproduce, compare, final-pass, make-digests), adapted to compare against 5f44351e:
             red-first.mjs, scorecard.mjs, triplet-table.mjs, make-tables.mjs, secret-scan.mjs
             probes/ the throwaway scripts used to reproduce the findings and to run the fresh wording sets (paths are the scratch checkout of the author)
  results/   post/ (frozen matrix, journeys, supplementary, handler and hazard drivers), red-first/, scorecard.json, triplet-table.json,
             red-first-summary.json, final-pass-summary.json, tables.md
  logs/      final/ (every step of the final pass), red-first/, secret-scan/ (excluded from the digests: written after them),
             first-runs/ the runs kept as they happened: draft red runs of shorter test versions, the fresh probe sets' first run,
             and the route of the phóng/phòng wording on 04317126, 5f44351e and this candidate
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
  node scripts/final-pass.mjs            every step in order (the red-first step is run separately: node scripts/red-first.mjs)

Not done on purpose
  No merge, deploy or release. No migration, RPC, flag change, hosted or Production resource, paid or live model call.
  No change to a frozen fixture, a scenario id, an expected result, a hash, an earlier evidence folder, the sealed H5 set, a workflow, a scanner rule or configuration, a gate script or .gitleaksignore.
  KAWA_02 was not started. Protected session memory was not written. No locked governance document was edited.
