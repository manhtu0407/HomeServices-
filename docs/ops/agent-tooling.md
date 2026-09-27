# Agent tooling: OCR review and Headroom

Runbook for the two open-source tools evaluated for Claude Code and Codex on this repository. OCR review is wired into the repo. Headroom was installed and measured but is **not wired**; section 2 records why.

## 1. OCR review (Open Code Review)

Pinned: `@alibaba-group/open-code-review@1.12.7` (Apache-2.0, `github.com/alibaba/open-code-review`). Upgrade deliberately: the script refuses an `ocr delegate` answer whose `schema_version` it does not know.

```bash
npm install -g @alibaba-group/open-code-review@1.12.7
ocr --version        # open-code-review v1.12.7
```

- npm reports `allow-scripts` for the postinstall step and skips it. That is harmless: the native binary ships in the platform package `@alibaba-group/ocr-win32-x64`.
- **Windows:** PowerShell refuses the npm shim `ocr.ps1` when script execution is disabled, and Node cannot spawn `.cmd` files safely. `scripts/lib/ocr-review-gate.mjs` therefore runs the package's `bin/ocr.js` launcher with `node` directly. In PowerShell call `ocr.cmd`; Git Bash `ocr` works.
- Smart App Control blocks unsigned binaries with no reputation. The OCR binary is unsigned and was not blocked on this machine; re-check after an upgrade with `ocr --version`.

### Mode: one snapshot, one range

OCR has three separate modes, and none sees the whole picture of a worktree: `workspace` shows only uncommitted work, `range` compares two commits and never sees uncommitted work, `commit` shows one commit. Measured with the real CLI on the same tree: workspace saw `+3` lines of a file that had `+6` in total and missed the committed half; range saw the other `+3` and missed a new untracked file.

`scripts/ocr-review.mjs plan` therefore reviews **one snapshot** of the worktree:

1. It builds a temporary index under `.scratch/ocr/`, adds every non-ignored file (secret-shaped paths and `.scratch/` excluded), writes a tree and one commit object (`git commit-tree`, fixed identity `ocr-snapshot`, parent `HEAD`). The new objects go to a private store, `.scratch/ocr/objects` (`GIT_OBJECT_DIRECTORY`), with the repository's own objects read through `GIT_ALTERNATE_OBJECT_DIRECTORIES`. Nothing is written to the repository's object database, refs, stash, real index or working files, so no Git Rule exception is needed and it works where `.git/objects` is read-only: Codex's workspace sandbox denies those writes (`insufficient permission for adding an object to repository database`), which is why the store is private. Plain `git diff` cannot see a snapshot; the plan prints a `node scripts/ocr-review.mjs diff` command per batch.
2. It runs `ocr delegate preview --from <base> --to <snapshot>`: a single range from `origin/main` (else `main`) to the snapshot covers committed work, staged and unstaged edits and new files, with one combined diff per file.
3. **Incremental:** after `mark`, the next snapshot's parent is the previous snapshot, so OCR reports only what changed since. Committing does not change the tree, so it never triggers a re-review. A rebase, a merge of the base, a branch switch or a pruned snapshot falls back to a full review of the branch. `--full` forces it.

State lives in `.scratch/ocr/state.json` per worktree (gitignored, disposable). Removing it means the next run reviews the whole branch.

The agent reviews; OCR runs no LLM in this mode (`ocr delegate`). Procedure: `.claude/commands/ocr-review.md`. Claude Code runs `/ocr-review`; Codex follows the same steps by hand (`AGENTS.md`, section OCR Review).

### Stop hook

`.claude/hooks/verify-ocr-review.mjs` asks for a review once per change state when 30 or more reviewable lines have not been reviewed. Apart from its own state under `.scratch/ocr` (snapshot objects and a nudge marker), it only reads git state and runs `ocr delegate preview`, and it fails open on every infrastructure problem. The threshold is a starting value: tune `NUDGE_LINE_THRESHOLD` in `scripts/lib/ocr-review-gate.mjs` after some weeks of use. Hooks load at session start, so a new hook applies from the next session.

### Codex hooks

Codex has hooks of its own, so the Stop hook above is Claude Code only by choice, not by necessity. As read on 2026-09-21: `codex features list` shows `hooks  stable  true` on `codex-cli 0.155.0-alpha.9.2`, and the [official documentation](https://developers.openai.com/codex/hooks) lists a `Stop` event that continues the turn on `exit 2` with a reason on stderr (the convention `.claude/hooks/verify-ocr-review.mjs` already uses), configured in `~/.codex/hooks.json` or a `[hooks]` table in `~/.codex/config.toml`, trusted by hash before it runs, with a `commandWindows` override for Windows. This repository wires none, because Codex state is user-level and the repository never contains a `.codex/` (`AGENTS.md`). Whether the existing hook script runs unchanged under Codex is not tested; wiring it edits a user-level file, so it is Tu's decision.

### What OCR does not scan

Selection is OCR's own: binary, secret paths, `exclude`, `include`, an allowlist of file extensions, then default test-file patterns. Measured with the real CLI over the 3,423 files tracked at `e2994bac`: an empty commit as `from`, the whole tree as `to`, this repository's `rule.json` applied. The numbers drift as files change; repeat the measurement when it matters.

| Area | Tracked | Scanned |
|---|---:|---:|
| `supabase/migrations`, `supabase/tests` | 497 | 497 |
| `supabase/functions` | 485 | 478 |
| `scripts`, `.github` | 147 | 146 |
| `apps/mobile` | 1,083 | 750 |
| `packages/shared` | 117 | 63 |
| `apps/api` | 523 | 206 |
| `docs`, `governance`, `.claude`, `.agents` | 507 | 102 |
| everything else | 64 | 46 |
| **Total** | **3,423** | **2,288** |

The 1,135 files not scanned, by OCR's own reason: 484 default test or fixture path, 410 unsupported extension, 233 binary, 8 excluded by `rule.json`. **Markdown is never scanned** (390 files: governance, docs, commands, skills, `AGENTS.md`), nor `.mts`, `.cts` or images. Every plan lists those files under "Not reviewed by OCR" so they are checked by hand or reported as unreviewed. Pillar tests are re-included by `include` in `.opencodereview/rule.json` (163 of the scanned files are there because of it); other test files are skipped by default.

### Known limits

- The printed `diff:` command uses shell-specific quoting: PowerShell doubles apostrophes inside single-quoted paths, while POSIX shells close, escape, and reopen the quote. Spaces, `(tabs)`, and `[id]` were checked in PowerShell and bash; `$`, backticks, and `;` were checked in bash. Apostrophe escaping is tested for both formats and round-tripped in PowerShell.
- Review quality is the agent's, not OCR's: delegation mode has none of OCR's bundling, reflection or line positioning, so the vendor's benchmarks do not apply. It was measured only on 8 planted defects by the agent that built the tooling.

### Review rules

`.opencodereview/rule.json` is read from the repo root. Rules are matched **first match wins**, most specific first. Each rule cites the `governance/RULES.md` rule or `governance/STRUCTURES.md` invariant it comes from; those files are locked, so the rules are a condensed copy and can drift. Check a path with `ocr rules check <path>`.

### Privacy

- OCR makes no LLM call in delegation mode. Telemetry is off by default. It writes only under `~/.opencodereview`.
- OCR excludes secret paths (`.env*`, `.npmrc`, `*.pem`, `id_rsa*`, `.ssh/`) from review. Before taking a snapshot, the private index drops those paths and `.scratch/`, including tracked entries; additions use the same exclusions. This keeps their content out of the snapshot tree while leaving the source index and worktree unchanged.
- The Claude Stop hook allows 150 seconds; its OCR subprocess is bounded at 120 seconds, leaving time for snapshot and hook work around the subprocess.
- Codex runs shell commands through `powershell.exe -Command`. The documented form `node scripts/run.mjs run-node scripts/ocr-review.mjs ...` works there because `node.exe` is signed and `run.mjs` starts PowerShell with `-ExecutionPolicy Bypass`; calling `ocr` directly from PowerShell does not.
- `codex exec -C <new directory>` with write access makes Codex add a `trust_level = "trusted"` entry for that directory to `~/.codex/config.toml`. Remove such entries after throwaway experiments.

### Rollback

`npm uninstall -g @alibaba-group/open-code-review`. Remove the `verify-ocr-review.mjs` entry from the `Stop` list in `.claude/settings.json`; nothing else depends on it and the hook fails open. Delete `.scratch/ocr` to drop all review state and snapshot objects. There is nothing to clean up in git.

Procedure adapted from the Apache-2.0 skills `open-code-review` and `open-code-review-delegate` in the upstream repository. Not installed as skills: each skill needs a manifest entry and a line in the locked `CLAUDE.md`, and the upstream `delegate-review` command edits code by default.

## 2. Headroom (evaluated, not wired)

`headroom-ai 0.37.0` (Apache-2.0) compresses tool output before it reaches the model, through a local proxy. Installed on this machine as `uv tool install --python 3.13 "headroom-ai[proxy,code]==0.37.0"`, without `[ml]` because that pulls `torch` and the machine often has under 3 GB free RAM.

Why it is not wired:

- **Claude Desktop cannot be routed.** The Desktop app replaces `ANTHROPIC_BASE_URL` with `https://api.anthropic.com` when it spawns an agent session, so the value Headroom writes to `~/.claude/settings.json` is ignored. `headroom doctor` reports it, and upstream issue `headroomlabs-ai/headroom#869` (open) confirms zero requests reach the proxy from the Code tab on this exact setup. Only terminal Claude Code and the VS Code extension are routable.
- **Measured savings on Codex were small.** Through the proxy, two canary tasks and one realistic read-only repo task saved 0.6 percent and 0.44 percent of input tokens (2,550 of 582,907). A deterministic test of a 47 KB JSON log saved 33.8 percent in the shell-output shape and 0 percent in the Claude `Read` tool shape (Headroom never lossy-compresses file reads). Savings grow with large, repetitive tool output; these sessions had little.
- **Cost:** proxy working set about 408 MB (1.2 GB private), 26 s cold start, unsigned `headroom.exe` blocked by Smart App Control (run `python -m headroom.cli`).
- The persistent install writes to `~/.claude/settings.json` and `~/.codex/config.toml`; an older `headroom wrap codex` lost Codex chats (upstream issue 2159).

If it is wired later: set `HEADROOM_BEACON=off`, `DO_NOT_TRACK=1`, `HEADROOM_UPDATE_CHECK=off`, `HEADROOM_CCR_BACKEND=memory` first (the anonymous beacon is on by default and the CCR store keeps tool output on disk otherwise), back up both config files, and measure again on real work.
