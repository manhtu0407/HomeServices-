KAWA_01 six-service baseline and H5 root-cause diagnostic - evidence package
Date: 2026-10-21. Status: committed on branch claude/nestscout-kawa-01-diagnostic-bd0158 for Codex review; owner review pending. Tier: T0 (T1/T2/T3 NOT_RUN).
Snapshots: BEFORE ce4bd3cd98c72a46ea14d4cc60d24e53c0b91f72, AFTER 42daced1a52ca5b8e5ee2e0b982c28e697f184c9.

Read in this order
  07-reports/FINAL_VERDICT.md                  the four decisions, stop-condition map, restrictions
  07-reports/REPORT_A_kawa01_impact.md         before/after, eight measures, attribution, limits
  07-reports/REPORT_B_six_service_stability.md the 36 results, per-service verdicts, defects, coverage
  07-reports/REPORT_C_h5_root_cause.md         63 rows, frequencies, mechanisms, architecture options
  07-reports/REPORT_D_remediation_backlog.md   blockers, actions, owner decisions, tests, criteria
  04-workflows/SIX_SERVICE_WORKFLOW_MAPS.md    workflow and Stage maps, issue register

Contents
  00-preflight/        snapshot verification, release containment (read-only GitHub API)
  01-freeze/           scenario-matrix.json (frozen, sha256 dd8392cb...), freeze-manifest.json,
                       harness-freeze.json, execution-order-log.md
  02-harness/          the harness (diag-support.ts, matrix/journey/H5/probe tests, run-diag.mjs),
                       interpretation-register.md, self-test and supplementary matrices
  03-results/          before|after matrix.json and journey.json (scored), comparison.json,
                       selftest/ (harness validation, not findings), supplementary/ (C6b, flags-on)
  04-analysis/         compare.mjs, h5-diagnosis.mjs, make-traced-clone.mjs, build-reports.mjs,
                       run-existing-suite.mjs, traced-clone.json
  05-h5/               classifier + end-to-end rows, row-level diagnosis, probes (rounds 1-3)
  06-existing-suites/  full existing API Vitest JSON for both snapshots
  07-reports/          generated reports (sources in _src/; tables are generated from the JSON)
  08-proposed-memory/  session-memory draft, NOT written to protected memory
  logs/                raw output per run and commands.jsonl (command, cwd, exit, hashes)
  file-digests.json    sha256 of every file here except itself

Reproduce (needs the two worktrees at C:/ns-diag/before and C:/ns-diag/after, installed offline)
  node 02-harness/run-diag.mjs <before|after> <abs path to 01-freeze/scenario-matrix.json> <abs out.json> kawa-diag-matrix-pillar.test.ts "" 2 <label>
  node 02-harness/run-diag.mjs <before|after> <matrix> <out.json> kawa-diag-journey-pillar.test.ts "" 2 <label>
  node 04-analysis/compare.mjs
  compare.mjs refuses to compare results produced against a matrix whose hash differs from
  01-freeze/freeze-manifest.json (the runner records the hash it used in logs/commands.jsonl).
  node 04-analysis/make-digests.mjs rewrites file-digests.json and fails if the matrix changed.

Redaction: the local repository path was replaced by <repo> in logs/commands.jsonl and the two
  existing-suite logs. Nothing else was edited after generation. .gitattributes sets -text so the
  bytes in file-digests.json are the bytes on every checkout.

Not done on purpose
  No product source change; no merge; no RPC or migration; no deploy or hosted database
  operation; no paid provider; no protected memory write. The branch is based on main commit
  111988b0, the commit before the KAWA_01 merge; both compared snapshots are referenced by sha.
  The only file outside this folder that changed is the new row in docs/test-logs/INDEX.md.

Scratch worktrees (outside the repository, registered in its git metadata)
  C:/ns-diag/before and C:/ns-diag/after hold only untracked harness files and node_modules.
  Remove with: git worktree remove --force C:/ns-diag/before   (then robocopy an empty folder over
  node_modules if Windows long paths block deletion).
