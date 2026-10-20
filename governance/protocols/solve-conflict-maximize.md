# Protocol: `kael-solve-conflict-maximize`

Canonical procedure for the `kael-solve-conflict-maximize` skill (`.claude/skills/kael-solve-conflict-maximize`, mirrored to `.agents/skills`). The skill body is the trigger; this file is the method.

It exists because coding agents reach "done" by the cheapest path available, and the cheapest path is usually one that makes a check green without making the code correct. Three shapes of that path are blocked here: changing the test or the gate instead of the code, leaving authorship residue in production source, and reporting a verification result that was never observed.

## Evidence this protocol answers to

`docs/test-debt-ledger.md` records what happened without this discipline:

- 233 cases asserted substrings of `.sql` migrations. A `toContain` on a migration passes whether or not the migration ran.
- 27 cases declared an object literal with a `satisfies` clause, then asserted the same literal back. The runtime half was theatre.
- 163 cases read file text and asserted nothing a reader could act on, such as `expect(pkg.name).toBe('nestscout')`.

Memory records the reporting side of the same failure: a green count reported as proof, a revert reported as recovery, a "pre-existing" failure claimed without a baseline, and a doc's scope claim repeated after the config contradicted it.

## Scope and reach

- Pillar A (test integrity) applies whenever a diff touches a test file, a gate, or a protected surface.
- Pillar B (source hygiene) applies to every added line in `apps/`, `packages/`, `supabase/functions/` `.ts`/`.tsx` files.
- Pillar C (final claims) applies to every final message that reports pass, done, fixed, or pre-existing.

Reach `T` (one known file, no behavior change) still runs Pillar B and Pillar C. Pillar A runs only when a test or gate changed.

## Pillar A: test integrity

### Protected surface

Gates are the oracle. An agent does not get to rewrite the oracle to pass. These paths are protected:

```text
scripts/check-*.mjs              scripts/harness/**
scripts/structure-baseline.json  scripts/lint-structure.mjs
config/harness/manifest.json     **/jest.config.*   **/vitest.config.*
.github/workflows/**             .claude/settings*.json   .claude/hooks/**
docs/test-debt-ledger.md
```

Editing a protected path is allowed when Tu approves it in the current conversation. It must still appear on its own line in the final report, as `Gate or protected-surface changes:`. The checker lists these files and never hides them. It does not block them on its own, because a legitimate gate fix is sometimes the right change.

If the test went red and the fix to the code did not make it green, the answer is not to edit the gate. Count the attempts. After two code changes that leave the same gate red, stop and report the unedited output (Stop rule below).

### Forbidden moves

| Move | Detector | Enforcement |
|---|---|---|
| Delete or weaken an assertion so the test passes | `check-test-integrity`: net drop in `expect(`/`assert` count per test file | Blocks |
| Add `.skip`, `.only`, `.todo`, `xit`, `xdescribe`, `xtest` | `check-test-integrity` on added lines | Blocks |
| Add a snapshot assertion or run snapshot update (`-u`, `--updateSnapshot`) | `check-test-integrity` on added lines | Blocks |
| Test file with no assertion at all | `check-test-integrity` on the current file | Blocks |
| `expect(true)` / `expect(false)` as proof | `check-test-integrity` on added lines | Blocks |
| Type escapes in a test (`as any`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`) | `check-test-integrity` on added lines | Blocks |
| Change an expected literal in the same change as the implementation | Heuristic, shown as a report line | Reports |
| Swallow an error (`try {} catch {}`) or return early before an assertion | Judgment | Reviewer |
| Derive the expected value from the implementation instead of a spec, fixture, or hand calculation | Judgment, see oracle rule | Reviewer |
| Narrow collection (`testRegex`, `include`, `--passWithNoTests`) | Protected surface | Reports |

A net assertion drop is blocked because it is the most common way a red test turns green. A legitimate removal (a duplicate, or an assertion superseded by a stronger one) is still a removal. Put it in the final report under `Gate or protected-surface changes` and ask Tu to clear it. The checker does not accept an excuse.

### Red-first

A regression test must be observed failing on the code before the fix. Record the command and its red output in the Claim→Evidence block. A test that has never been red has not been shown to test anything.

### Oracle rule

Expected values come from a spec, a committed fixture, a known-good example, or a hand calculation. A test that recomputes the implementation's answer is a tautology. The `test-pillars.md` catalogue names the second-source technique that avoids this.

### Stop rule

After two attempts to make a gate green by changing code, with the same gate still red, stop. Report the gate, the unedited output, and the two attempts. Do not edit the gate to get past the failure.

## Pillar B: source hygiene

### Zero comments on added production lines

On every added line in production source (`apps/**`, `packages/**`, `supabase/functions/**`, `.ts`/`.tsx`, excluding test files), no comment token is allowed. That includes:

- line comments, block comments, and JSDoc
- authority citations such as `RULES.md #8` or `critical.md §3`
- trailing comments on a line that is otherwise code
- JSX comments such as `{/* ... */}`

Existing comments are not touched. The rule is a ratchet: it judges the lines a change adds. A line that already had a trailing comment is an added line the moment the agent edits it, so the agent removes the comment as part of that edit.

The check is `pnpm lint:comments --diff <ref>` and `pnpm lint:comments --working`. It uses the TypeScript parser to find comment tokens, so `https://` inside a string literal is not a comment and is not flagged. The full scan (`pnpm lint:comments` with no flag, the CI full-repository step) keeps only the banner rules, so legacy comments do not turn it red.

Do not split an expression or statement across lines only to make room for a comment. Reviewers and `kael-review` own that judgment; no detector covers it.

### Watermarks

A watermark is any marker that says who or what produced the file. In source, these are blocked on added lines:

- `Generated with ... Claude`
- `Co-Authored-By:`
- the robot emoji
- `generated|written|authored by|with <AI name>` (Claude, Codex, Copilot, Cursor, ChatGPT, GPT)
- an author, license, `SPDX-License-Identifier`, or `Copyright (c)` header

No license header exists in product source today, so any header is new and counts as a watermark. The bare word `Claude` is not banned, because model IDs and tool names contain it.

The watermark scope is source files. Commit-message trailers come from the harness and sit outside this skill.

### Relationship to the existing comment linter

The zero-comment rule lives in `pnpm lint:comments --diff` and `--working`. The full scan still allows WHY comments and authority citations, and `governance/protocols/code-hygiene.md` describes that allowance for existing code. `pnpm lint:added-hygiene` judges watermarks only. The two modes of one linter disagree by design: the ratchet blocks new comments, while the full scan only reports banners.

## Pillar C: final claims

Every claim in the final message maps to one row of this block:

```text
Claims -> evidence:
Not run:
Pre-existing (baseline):
Gate or protected-surface changes:
Comments / watermark (lint result):
Stop-rule triggers:
```

Rules that fill it:

- A command that was run appears with its exit code and the count line copied from its output. A count recalled from memory is not evidence.
- A bug is "fixed" only after the original repro runs again and passes. Record the before and after.
- "Pre-existing" requires a baseline run on a clean tree, and the baseline must have the same failure.
- Every `file:line` or symbol cited is resolved by grep or Read in the same turn. A citation from earlier context is re-checked.
- A revert inside a tree that a running job reads is not "recovered" until the units completed during the dirty window are checked against their recorded hashes and timestamps (`feedback_revert_is_not_a_save`).
- A doc's claim about a gate's scope is checked against the config it describes. Example: `test-pillars.md` once said mobile collects only pillar files; `apps/mobile/jest.config.js` collected every `*test.tsx`. The config wins, and the doc is reported as drift.
- Memory is a freshness signal. Verify it before it appears in a claim.
- Anything not run is named in `Not run:`. Device, native, CI, and Stop-hook gaps are named there, never omitted.

## Enforcement

| Layer | Mechanism | Strength |
|---|---|---|
| L1 | Skill `description` and manifest `trigger` | Claude selects the skill; soft |
| L2 | Lane row in `governance/protocols/work-router.md` (session condition) | Router assigns the skill at Verify and Close |
| L3 | Stop hook `.claude/hooks/verify-test-integrity.mjs` (Claude Code only) | Blocks "done" on a new blocking finding; fails open on infrastructure errors |
| L4 | `controls` job in `.github/workflows/ci.yml`, `--diff` against the base SHA | Blocks merge for Claude and Codex alike |
| L5 | Tier 3 line in `CLAUDE.md` and pointer in `AGENTS.md` | Registration |

Codex has no hook. Its automatic check is L4, and it runs the commands by hand before reporting.

What the checkers cannot do: a weak assertion that still executes real code is not detected. Neither is a test that checks the wrong property well. Those remain reviewer findings. This protocol does not claim to stop semantic gaming.

## Commands

```bash
pnpm lint:test-integrity --working     # uncommitted change (Stop hook)
pnpm lint:test-integrity --diff <ref>  # committed range <ref>...HEAD (CI)
pnpm lint:comments --working            # zero comments on added production lines (Stop hook)
pnpm lint:comments --diff <ref>        # the same ratchet over the committed range (CI)
pnpm lint:added-hygiene --working      # watermarks on added production lines
pnpm lint:added-hygiene --diff <ref>
```

Exit codes: `0` clean, `1` blocking findings, `2` the checker could not run. A `2` is not a pass.

## Output format

```text
Claims -> evidence:
Not run:
Pre-existing (baseline):
Gate or protected-surface changes:
Comments / watermark (lint result):
Stop-rule triggers:
```

## Failure modes

- Editing the test to match the output of the code.
- Adding a skip to get a suite green, then reporting the suite green.
- Reporting a count of tests that were not run.
- Calling a pre-existing failure "unrelated" with no baseline.
- Leaving a comment because "it documents the decision".

## Rationalization table

| Rationalization | Reality |
|---|---|
| "The assertion was redundant." | Then say so in `Gate or protected-surface changes` and let Tu clear it. The checker does not take your word for it. |
| "I skipped it temporarily." | Temporary skips are the ones that stay. Do not add one. |
| "The gate is wrong, so I fixed the gate." | Maybe. That is Tu's call, approved in chat, and reported on its own line. |
| "The comment documents why." | The commit message and `docs/` document why. The source states the code. |
| "It is only one `//` line." | The rule has no size threshold, because the reviewer cannot tell a one-line comment from a page of them. |
| "Tests pass." | Show the command, the exit code, and the count it printed. |
