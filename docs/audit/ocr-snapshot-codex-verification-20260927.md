# OCR Snapshot Mode: Codex Verification — 2026-09-26 to 2026-09-27

## Scope and identity

Executed Plan §56 on branch claude/find-open-source-repos-7a37bf in C:/Users/Phan Manh Tu/Desktop/home-services/.claude/worktrees/workers-jobs-stage-5-ad4bff. The recorded Mốc was commit 56128ca5aaddecd86dcb4c38ef16940a62b8c394; its merge base with origin/main was e2994bac10320847acfa8ea70470308ac90cd9d4. The target branch was clean before this verification. The unrelated dirty primary checkout was left untouched.

At the close of the initial verification pass, no OCR source, rule, or Plan file had been changed; that pass left only this report and its session-memory entry. The later authorized fix pass is recorded below. No commit, push, or PR was made.

## Gate results

| Phase / gate | Result | Evidence |
|---|---|---|
| P0 — baseline | PASS with version caveat | Exact Mốc and unchanged OCR tooling were confirmed. The installed CLI reported open-code-review v1.12.8 (5c7b383), while Plan §56 pins v1.12.7. No install or update was attempted. |
| G1 | PASS | node --test scripts/ocr-review-gate.test.mjs scripts/harness/classify-ci-changes.test.mjs: 35 tests, 35 passed, 0 failed, exit 0. |
| G2 — full snapshot | PASS on installed CLI | In a fresh codex exec -s workspace-write session, node scripts/run.mjs run-node scripts/ocr-review.mjs plan --full --fetch returned the recorded merge base, 8 reviewable files, 1,132 changed lines, 4 batches, and snapshot 7fd49c5c774581f36004b1cc47ad0979449e3f67. Fetch timed out; the command used the last-known origin/main. |
| G3 — incremental review | PASS | After marking S1 and adding the probe, plan reported incremental review of 1 file and 1 changed line in 1 batch. Snapshot S2 was 53126ad8b4c653cc5abd7091bbf35ef1297793f3; its printed diff contained the probe line. |
| G4 — no new work | PASS | After marking S2, plan printed “Nothing new to review since the last review.” |
| G5 — private object store | PASS | git cat-file -e S2 failed without an alternate object directory and succeeded with GIT_ALTERNATE_OBJECT_DIRECTORIES pointing to .scratch/ocr/objects. The probe was removed and the temporary worktree returned clean. |
| G6 — independent review | PASS | A separate full plan selected 8 files / 1,132 lines in 4 batches. All 8 were reviewed; 7 Markdown files outside OCR selection were checked manually; skipped = 0. mark exited 0 and the next plan reported no new work. |
| G7 — Codex self-compliance | PASS | A fresh Codex session received the prescribed duration-format task without an OCR hint. node --test scripts/format-duration.test.mjs passed 5/5; node --check on both temporary files and corepack pnpm lint:comments --working passed. It recorded OCR review of its selected files; the post-mark plan reported nothing new. Its final response stated 7 Markdown files were not fully hand-reviewed. |
| G8 — blind review | PASS | A separate seed session created exactly 8 defects and 3 benign controls across 5 files. A fresh reviewer session, with no --add-dir and no answer key in its sandbox, reviewed 20 files (13 OCR-selected and 7 checked manually), marked the snapshot, and reported 8/8 defects at the exact seeded lines with 0/3 controls falsely flagged. |

The first nested P2 attempt stopped before its steps after identifying the installed-versus-pinned CLI mismatch and that the baseline checkout did not contain the new §56 text. A second fresh session received the exact P2 steps from the target branch and completed G2–G5. The first P5 seed session stopped before edits; the authorized retry created and checked the fixtures. During its additional self-review, Codex streaming repeatedly failed with stream disconnected / Windows error 10054; that session was interrupted after the files and answer key were safely written. This did not affect the independent P5 reviewer, which completed its review.

Before the P5 review, the seed session reported lint:comments clean, lint:baseline and migration inventory passing, and lint:structure reporting the two intentionally planted reverse-layer imports. Its first pnpm lint attempt began a slow download for 1,252 packages; the relevant direct Node gates then completed. No fixture function was executed.

P5's key was created outside the blind worktree as specified, then moved outside the reviewer sandbox after inspection showed that the sandbox also exposes /tmp. The reviewer explicitly reported it had not read the key. The key and all benchmark fixtures were removed after scoring.

## Findings from the initial verification

These were review findings only in the initial pass. Plan §56 D7 said to report tool defects rather than repair the code being evaluated; no fixes were applied at that point.

1. **P1 — empty Stop-hook input can block.** .claude/hooks/verify-ocr-review.mjs:28–37 treats empty stdin as {}, falls back to CLAUDE_PROJECT_DIR or the current directory, and can emit exit 2 when more than 30 reviewable lines exist. A manual reproduction with empty stdin, CLAUDE_PROJECT_DIR=C:\tmp\ocr-verify, and 31 changed lines exited 2. This conflicts with the planned fail-open behavior for empty/unreadable input.
2. **P1 — .ssh/ is not excluded from snapshots.** scripts/lib/ocr-review-gate.mjs:28–35 omits .ssh/**, while docs/ops/agent-tooling.md:70 says .ssh/ is refused by the snapshot. A tracked or otherwise addable .ssh/id_ed25519 can therefore be referenced by the private snapshot store. The blind reviewer independently reported this.
3. **P2 — hook and subprocess timeouts differ.** .claude/settings.json:49 gives the Stop hook 60 seconds, while scripts/lib/ocr-review-gate.mjs:194 permits the OCR subprocess 120 seconds. A slow preview can outlive the hook's configured window. This was an independent reviewer finding, not a timeout reproduction; Claude's [command-hook documentation](https://code.claude.com/docs/en/hooks) specifies that the host cancels a command hook when its timeout expires.
4. **P2 — apostrophe paths fail in PowerShell.** scripts/lib/ocr-review-gate.mjs:332 renders POSIX apostrophe escaping. A PowerShell reproduction failed to parse the printed path command. The runbook already documents the limitation; no currently tracked path has an apostrophe.
5. **P2 — tracked secret-shaped files retain their committed snapshot content.** In an isolated repository probe, read-tree HEAD followed by the exclusion pathspec left a tracked .npmrc at its committed value in the snapshot; the edited working value was not captured. The existing test covers only untracked secret-shaped files. The runbook also states that tracked matching files retain committed content, but its preceding “never enter the snapshot object store” sentence is broader than the observed behavior.

The blind reviewer also reported the planted benchmark defects at the following exact lines in the disposable worktree: direct provider calls at domains/kael-chat/provider-assist.ts:16,37; missing timeout and unbounded retry at domains/catalog/coverage-query.ts:2,6; access-token and email logging at http/request-diagnostics.ts:5 and kael/ops/conversation-diagnostics.ts:5; and reverse layer imports at platform/request-bridge.ts:1,2. These fixture files were deleted and never entered the target branch.

## Limits and cleanup

- Installed OCR was v1.12.8, not the pinned v1.12.7. All reported CLI results are compatibility evidence for v1.12.8.
- `git fetch origin main` timed out during the initial OCR verification, which used merge base e2994bac10320847acfa8ea70470308ac90cd9d4. The fix follow-up refreshed `origin/main` successfully and used merge base `60ff7e20ba5b87f8a1f74f778f7c8807fdef02e2` for its OCR review.
- The Stop hook was not observed in a live Claude Code session; the empty-input behavior was tested by invoking its script directly.
- G8 is a small synthetic sample (n=8). Sower and reviewer used separate sessions in the same model family; the reviewer received neither the key nor the sower's findings. P5 reviewer token usage was 119,269; the interrupted sower's final token count was unavailable.
- P5's clean-worktree lint attempt triggered a slow pnpm dependency download. The direct Node gates completed; the temporary worktree and partial install were removed. No seeded function was executed and no remote Supabase command was run.
- Temporary worktrees, the blind-probe branch, the isolated P3 probe repository, answer key, and result files were removed. The existing .scratch contents in the target worktree were preserved.

## Initial verification closeout self-review

- **Fixed point:** uncommitted documentation changes on branch HEAD 6202c4c93bc195a70cd08b36d0cfe9ffe77e32ec; the verification and changed-file status are stated above.
- **Spec and standards:** the report records the requested Plan §56 gates, preserves its D7/D8 boundaries, and separates temporary benchmark defects from findings in the OCR tooling.
- **Scope and maintainability:** only this dated audit and the required memory records are retained; no fixture, generated key, source edit, or review result is mixed into product files.
- **Verification honesty:** CLI version mismatch, fetch fallback, missing live Claude session, incomplete P5 seed-session closeout, and unrun product build/tests are explicit.
- **Required fixes:** none were applied during the initial verification pass. Tu later authorized a fix pass, recorded below.

## Authorized fix follow-up — 2026-09-27

Tu asked Codex to fix the five recorded OCR tooling findings. That follow-up supersedes the initial D7 report-only boundary for these fixes; `governance/Plan.md` remains unchanged.

| Finding | Change |
|---|---|
| Empty Stop-hook input could block | Empty or whitespace-only stdin now exits fail-open before project discovery. |
| `.ssh/` was missing from exclusions | `.ssh/` was added to the shared private-path patterns. The temporary index removes secret-shaped and `.scratch/` entries before adding files, so tracked and untracked paths are absent from the snapshot tree while the source index and worktree remain unchanged. |
| Host timeout was shorter than OCR timeout | OCR subprocess remains bounded at 120 seconds; the Claude Stop hook timeout is 150 seconds. |
| Apostrophe paths were invalid in PowerShell | Diff rendering now uses doubled apostrophes for PowerShell and POSIX escaping on other platforms. |
| Tracked secret-shaped files kept committed snapshot content | Regression coverage proves tracked and untracked `.env*`, `.npmrc`, `.pem`, `id_rsa*`, `.ssh/`, and `.scratch/` entries are omitted. |

The runbook in `docs/ops/agent-tooling.md` now describes the privacy and shell-quoting behavior.

### Follow-up verification

- `node --test scripts/ocr-review-gate.test.mjs`: 24/24 passed. The five focused regression cases first reproduced the previous failures, then passed after the fixes.
- `node --check scripts/lib/ocr-review-gate.mjs` and `node --check .claude/hooks/verify-ocr-review.mjs`: passed; `.claude/settings.json` parsed successfully; `git diff --check` passed.
- `corepack pnpm lint:comments --working`: passed, no note-banner comments found.
- PowerShell round-trip using the formatter output `'src/it''s.ts'`: passed; the parsed argument matched `src/it's.ts`.
- `corepack pnpm lint:workplan`: passed after the follow-up paths were reconciled.
- `node scripts/run.mjs run-node scripts/ocr-review.mjs plan --fetch`: exit 0; selected 4 files / 92 changed lines in 2 batches at snapshot `fbc49c5dccd2148fbccaff25dc091f4cb47e7df9`, using merge base `60ff7e20ba5b87f8a1f74f778f7c8807fdef02e2`.
- Both printed OCR diffs were reviewed manually against their rule groups; no new findings. The docs and excluded `.env.example` were also reviewed manually; its one non-placeholder value is the static flag `false`, with no credential value exposed.
- `node scripts/run.mjs run-node scripts/ocr-review.mjs mark --snapshot fbc49c5dccd2148fbccaff25dc091f4cb47e7df9 --base origin/main`: exit 0, review recorded.

The Stop hook was exercised by directly launching its script with empty, whitespace-only, malformed, and valid payloads; it was not observed in a live Claude Code session. The branch remains uncommitted and unpushed. Existing `.scratch` contents were not removed; this follow-up updated the existing work plan and OCR review state and added the current snapshot objects.
