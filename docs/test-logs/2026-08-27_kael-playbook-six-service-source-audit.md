# Kael six-service source audit — 2026-08-27

## Verdict

`SOURCE_ARTIFACT_GATE_PASS / LIVE_UNVERIFIED`

The six source lanes now pass the local artifact-quality gate. This does not prove a live model improvement, an independent holdout decision, or Production readiness.

## Identity and scope

- Worktree: `C:/Users/Phan Manh Tu/Desktop/home-services/.claude/worktrees/skills-structure-review-fdda04`
- Branch: `claude/audit-system-skills-e2ad42`
- Initial audit HEAD: `99349b5fc64f07d00d1f62a340750c16d4563b38`
- No commit, push, merge, or deploy was performed.
- The attached screenshot was treated as UI evidence only. Its `+27,601 -156` indicator was not treated as an instruction or as a Playbook count.

## Artifact inventory

Line counts are from the current worktree and include the textbook, runtime segment, corpus, and synthetic holdout for each service.

| Service | Textbook | Runtime | Corpus | Holdout | Total |
|---|---:|---:|---:|---:|---:|
| electrical | 1,119 | 68 | 393 | 362 | 1,942 |
| plumbing | 352 | 75 | 362 | 362 | 1,151 |
| hvac | 184 | 74 | 365 | 362 | 985 |
| handyman | 189 | 77 | 362 | 362 | 990 |
| cleaning | 187 | 76 | 364 | 362 | 989 |
| upholstery | 178 | 70 | 363 | 364 | 975 |
| **all six** | **2,209** | **440** | **2,209** | **2,174** | **7,032** |

The five non-electrical lanes account for 5,090 source-artifact lines. Electrical is not a 20k-line Playbook; its earlier embedded JSON appendix was removed in favor of canonical machine-readable files and a summary, while keeping the actual corpus at 24 cases.

## Why the branch display looked larger and incomplete

- At initial audit HEAD `99349b5f`, `git ls-tree` contained the Electrical textbook, corpus, and runtime only for this Playbook set.
- The five newer textbooks, ten newer eval files, shared registry/flags, and pillar tests were untracked worktree files; they were absent from the branch commit and remote branch ref before the explicitly authorized publication.
- Before this audit report was added, the untracked inventory was 89 files / 26,668 lines (the report itself adds 1 file / 91 lines).
  - `docs/test-logs`: 47 files / 19,390 lines.
  - `docs/playbooks/eval`: 11 files / 3,990 lines.
  - `docs/playbooks/services`: 5 files / 1,090 lines.
  - runtime playbooks/flags/registry: 7 files / 460 lines.
  - pillar tests: 3 files / 359 lines.
  - other untracked artifacts: 16 files / 1,379 lines.

Therefore the screenshot's addition count is dominated by raw test logs and other worktree additions, not by 24 Electrical Playbooks or 20k lines of Electrical source.

## Local quality gate

Final `pnpm lint:playbooks` passed all six lanes:

- exactly 24 corpus + 24 holdout per lane;
- every contract slug appears at least twice;
- scope mismatch and out-of-scope cases are present;
- easy / medium / hard and small / medium / large thresholds pass;
- every service safety signal is represented;
- each lane has a hard multi-signal case;
- every case has grounded `detail` of at least 40 characters;
- holdout wording does not repeat corpus wording;
- every lane has a no-diacritic Vietnamese input variant;
- Appendix A and runtime segment parity passes after line-ending normalization.

Electrical final distributions:

- corpus: 24 cases; 18 in-scope / 3 service-mismatch / 3 out-of-scope; difficulty 12 easy / 7 medium / 5 hard; complexity 4 small / 6 medium / 6 large;
- holdout: 24 cases; 18 in-scope / 3 service-mismatch / 3 out-of-scope; difficulty 14 easy / 6 medium / 4 hard; complexity 4 small / 4 medium / 6 large.

During the audit, the strengthened no-diacritic rule first caught Electrical's holdout as incomplete. One existing holdout case and two Handyman inputs were repaired without increasing the 24-case limit; the final gate then passed.

## Verification run

- `pnpm lint:playbooks` — PASS, six services.
- `pnpm test:api` — PASS, 25 test files; 603 passed, 1 skipped.
- targeted registry/safety pillar tests — PASS, 2 files; 7 passed.
- `pnpm type-check:api` — PASS, exit 0.
- `pnpm lint:comments` — PASS.
- `pnpm lint:structure` — PASS, 1,057 source files.
- `pnpm lint:workplan` — PASS, 10 slices closed and 133 changed files inside the declared read-window.
- `pnpm lint:workplan:coverage` — PASS, 38/38 skills reachable.
- `pnpm lint:authority` — PASS with existing archived-Plan citation warnings.
- `pnpm lint:residue` — PASS.
- `pnpm skills:check` — PASS.
- `pnpm skills:contracts` — PASS, 38 skills.
- `pnpm harness:manifest:check` — PASS.
- `pnpm harness:pillars:check` — PASS, 47/47 pillars.
- `pnpm db:local:doctor` — REFUSED on the first check with daemon unreachable and RAM 2.3 GB; final rerun reached the daemon but still refused at RAM 1.6 GB below the 4 GB floor. Disk and ports passed both checks.

Because Docker doctor refused, G2 `edge:check`, local database tests, staging baseline/after, live holdout, and G5 delta were not run. No live or Production claim is made and all playbook flags remain OFF.

## Remaining decision

The source artifacts are complete enough for the local six-lane gate. At audit close, the branch still needed an explicitly authorized commit/push before another branch or remote UI could display them; that authorization was granted in the next user turn. Independent domain labeling and deployment-attested baseline/after remain required before enabling any service.

## Runtime gate addendum — 2026-08-27

The follow-up runtime evidence is recorded in [`2026-08-27_kael-playbook-six-service-runtime-gate.md`](2026-08-27_kael-playbook-six-service-runtime-gate.md).

- `pnpm edge:check` now passes with `edge check passed: 6 function(s)` — fresh G2 evidence.
- `pnpm lint:playbooks` passes all six 24-case corpora and 24-case holdouts — fresh G3/source evidence.
- `pnpm db:local:test` did not execute because its database-container guard found no running `supabase_db_nestscout`; it is not counted as pass or SQL failure.
- All ten new-service live arm attempts were blocked before traffic by missing approved staging environment variables, so G4, delta/G5, and live holdout remain unverified.
- Docker was brought down and stopped after the run; all playbook flags remain OFF.

## Fresh branch/worktree re-audit — 2026-08-28

- Pre-publication local and remote branch refs both resolved to
  `f444cf04a232afe03afda3939368081521b02491`.
- A fresh physical-line recount reproduced every table value above: Electrical
  `1,942`; Plumbing `1,151`; HVAC `985`; Handyman `990`; Cleaning `989`;
  Upholstery `975`; total `7,032`, with `5,090` in the five newer lanes.
- `pnpm lint:playbooks` passed again for all six lanes: exactly 24 corpus + 24
  holdout cases per service, 288 cases total, with all coverage and parity
  ratchets satisfied.
- `pnpm test:api` passed again with 25 test files passed / 1 skipped and 603
  tests passed / 1 skipped; `pnpm type-check:api` passed with `tsc --noEmit`.
- `git ls-tree` confirmed pre-publication HEAD `f444cf04` contained only the Electrical
  textbook, corpus, and runtime segment from this six-service artifact set.
  The five newer textbooks, ten newer eval files, five newer runtime segments,
  registry, and flags existed only in the worktree. This explains why the branch
  UI displayed an incomplete Playbook set before the authorized publication.
- The complete local runtime rerun now also passes 54/54 SQL verification files
  and 6/6 Edge checks. Staging G4/G5 remains blocked before traffic by absent
  approved staging identity; no hosted environment or flag was changed.
