NestScout four-blocker execution update - evidence folder
Date: 2026-10-22. Base: PR #405 head 8e859073 (stacked; PR #405 itself is untouched). Tier: T0 and T1 (local PostgreSQL). T2 and T3 NOT_RUN.

Read in this order
  REPORT.md                       the one concise report: five verdicts, payment rail, findings, commit, merge-readiness
  results/s5-matrix.md            J01-J15 by service, T0 or T1 per cell
  results/h5/PREREGISTRATION.md   acceptance rule and data provenance for the H5 standard evaluation

Contents
  scripts/                        everything needed to reproduce a number in REPORT.md
    probes/                       boundary flag parity probe (26 rows) used to find the flag-on bypass
    h5/                           fresh probe set (hash-pinned), temporary harness test, analysis, runner
    t1/                           disposable database (up.sh, patch.sql), run-t1.sh, mutations.sh, committed-data concurrency scripts
    reproduce.mjs, run-candidate.mjs, compare-with-r2b.mjs   frozen 36-scenario matrix on the candidate, compared with the R2b results
    red-first.mjs                 changed and new pillars against the PR #405 head's boundary guard (red) and the candidate's (green)
    final-pass.mjs, secret-scan.mjs, make-digests.mjs, make-s5-matrix.mjs
  results/                        machine-readable results; post/ is the frozen matrix and drivers on the candidate
  logs/                           raw output; logs/t1/ holds the SQL suite, concurrency, mutation and privilege-query logs
  file-digests.json               sha256 of every file here except itself

Reproduce the database half (needs Docker and the image public.ecr.aws/supabase/postgres:17.6.1.121 already pulled)
  bash scripts/t1/run-t1.sh        rebuilds the container ns-b4-pg and runs the SQL suite and both concurrency scripts
  bash scripts/t1/mutations.sh     mutation checks on the same container
  The container is disposable. The concurrency scripts leave committed fixtures behind because payment reconciliation
  events are immutable; never point them at a shared database.

Frozen inputs were used unchanged: scenario matrix sha256 dd8392cb...a51dd7 and the frozen harness files are hash-checked by
run-candidate.mjs on every run and removed afterwards. Sealed H5 was not read, run or copied. No hosted or Production
resource was touched, no migration was applied outside the disposable container, no paid provider was called, and no
protected memory was written.

.gitattributes sets -text so the bytes in file-digests.json are the bytes on every checkout.
