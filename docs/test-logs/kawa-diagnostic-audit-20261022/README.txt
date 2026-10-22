Independent audit of the KAWA_01 six-service and H5 diagnostic - evidence
Date: 2026-10-22. Status: UNCOMMITTED in the working tree of branch claude/nestscout-kawa-01-diagnostic-bd0158; awaiting owner review.
Audited: docs/test-logs/kawa-diagnostic-baseline-20261021/ (commit 084d8d09302b3d797cb9133c7caa4aae38ecb04c)
Snapshots: BEFORE ce4bd3cd98c72a46ea14d4cc60d24e53c0b91f72, AFTER 42daced1a52ca5b8e5ee2e0b982c28e697f184c9. Tier: T0 only.

Read first
  AUDIT_REPORT.md      verdicts for DX-01/02/03, the 36-scenario scorecard, H5, shared cause,
                       S5 T1 requirements, remediation scope, owner decisions, limits

Contents
  scripts/             audit code. lib.mjs, run-vitest.mjs, rescore.mjs, dx01/dx02/dx03/h5/dev-set probes;
                       worktree/*.test.ts are the vitest drivers copied into the scratch worktrees
  results/             every output the report cites (repro/ = fresh runs of the committed harness)
  logs/                raw vitest output per run and commands.jsonl (worktree path replaced by a token)

Inputs used unchanged
  scenario-matrix.json sha256 dd8392cbcc2fec7ad4f0b1611a52abea0cb7ed86fc681972fec9707c74a51dd7 (checked by every script that reads it)
  sealed-h5.json sha256 (LF-normalised) 80e3e90701e4acc9418ed30209e251b613c84520c70f3f49ba73e2638052d81d (checked)
  file-digests.json of the audited package: 80 of 80 files match

Reproduce (needs the two worktrees at C:/ns-diag/before and C:/ns-diag/after, installed offline)
  node --experimental-transform-types scripts/<probe>.mjs        probes import the shipped TypeScript directly
  node scripts/run-vitest.mjs <before|after> src/__tests__/kael-edge-runtime/audit/<file> <label> KEY=VALUE ...
  node scripts/rescore.mjs                                       needs results/repro/*.json from the committed harness

Not done on purpose
  No product source change (git status of both scratch worktrees shows only untracked harness and audit test files).
  No commit, push, merge, deploy, RPC, migration, hosted or Production access, paid provider call, or protected-document edit.
  docs/test-logs/INDEX.md was not edited; this folder is not yet listed there.
  Session memory not written.

Independence
  Same agent lineage as the audited package. A second pass by a different method, not independent human review.
