// Assembles REPORT.md from the generated tables and the raw logs. Counts are parsed from the files, not typed.
// usage: node build-report.mjs   (run after final-pass.mjs)
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { WORKTREE, evidenceRoot } from './run-candidate.mjs'

const read = (relative) => readFileSync(join(evidenceRoot, relative), 'utf8')
const json = (relative) => JSON.parse(read(relative))
const strip = (text) => text.replace(/\x1b\[[0-9;]*m/g, '')
const pick = (text, pattern) => (pattern.exec(strip(text)) ?? [])[0]?.replace(/\s+/g, ' ').replaceAll('|', '/').trim() ?? 'not found'
const finalPass = json('results/final-pass-summary.json')
const exitOf = (name) => finalPass.find((entry) => entry.name === name)?.exit
const gate = (name) => (exitOf(name) === 0 ? 'pass' : `exit ${exitOf(name)}`)
const vitestLine = (name) => `${pick(read(`logs/final/${name}.log.txt`), /Test Files\s+[^\n]+/)}; ${pick(read(`logs/final/${name}.log.txt`), /Tests\s+[^\n]+/)}`
const roundOneApi = pick(readFileSync(join(evidenceRoot, '..', 'kawa-remediation-r1-20261022', 'logs/final/api-full-suite.log.txt'), 'utf8'), /Tests\s+[^\n]+/)

const red = json('results/red-first-summary.json')
const scorecard = json('results/scorecard.json')
const triplet = json('results/triplet-table.json')
const tally = (section) => Object.entries(scorecard[section].tally).map(([key, count]) => `${count} x ${key}`).join(', ')

const git = (args) => spawnSync(`git ${args}`, { cwd: WORKTREE, shell: true, encoding: 'utf8' }).stdout.trim().split('\n').filter(Boolean)
const changed = [
  ...git('diff --name-status 04317126635a4207a3f9b9ba35ffccf053d16340').map((line) => line.replace('\t', ' ')),
  ...git('ls-files --others --exclude-standard').map((path) => `A ${path}`),
].filter((line) => !line.includes('kawa-remediation-r2-20261022/'))
const stat = spawnSync('git diff --shortstat 04317126635a4207a3f9b9ba35ffccf053d16340', { cwd: WORKTREE, shell: true, encoding: 'utf8' }).stdout.trim()

function groupRows(pillar, side) {
  return Object.entries(red.pillars[pillar][side].groups)
}
function heldOut(pillar, needle) {
  const rows = groupRows(pillar, 'previous').filter(([key]) => key.includes(needle))
  return rows.map(([key]) => {
    const before = red.pillars[pillar].previous.groups[key]
    const after = red.pillars[pillar].current.groups[key]
    return `| ${key.replace(/^P4\d\d-[a-z0-9-]+: /, '')} | ${before.passed + before.failed} | ${before.failed} | ${after.failed} |`
  })
}

const testFile = readFileSync(join(WORKTREE, 'apps/api/src/__tests__/kael-edge-runtime/domains/kael-boundary-requested-work-pillar.test.ts'), 'utf8')
const rowsOf = (name) => {
  const start = testFile.indexOf(`const ${name}`)
  const end = testFile.indexOf('\n]\n', start)
  return testFile.slice(start, end).split('\n').filter((line) => /^\s+\['/.test(line)).length
}
const failedRows = (file) => strip(read(`logs/${file}`)).split('\n').filter((line) => /^\s+×/.test(line)).length
const setB = { rows: rowsOf('SECOND_PROBE_SET'), failed: failedRows('p421-heldout-b-first-run.log.txt') }
const setC = { rows: rowsOf('THIRD_PROBE_SET'), failed: failedRows('p421-heldout-c-first-run.log.txt') }
const freshRows = setB.rows + setC.rows
const freshPassed = freshRows - setB.failed - setC.failed

const out = `# KAWA_01 remediation round 2 - PR #405

Tier **T0**. Candidate: working tree of \`claude/nestscout-remediation-r1-20261022\`, on top of the reviewed round-1 commit \`04317126\`. Frozen inputs, sealed H5 and the round-1 and diagnostic records are unchanged. No merge, deploy, release, migration, RPC, flag change, hosted resource, paid or live model call.

## 1. State found at the start

- Branch head \`04317126\`, equal to the PR head; \`origin/main\` \`42daced1\`; PR #405 open, not draft.
- Codex review, two P2 findings: (1) \`requested-work.ts\`: "Máy giặt bị hư, cần thợ đến xem." no longer refused; (2) \`emergency-guidance.ts\`: "Nhờ lắp ổ cắm chống tia lửa cho bếp." and "Please replace the spark-proof outlet cover." routed to \`electrical_water\`.
- CI on \`04317126\`: two jobs failed and both failed only on the secret-scan step (3 Gitleaks \`generic-api-key\` findings, \`file-digests.json\` lines 29, 47, 67); every other step of both jobs passed (API, Mobile, Shared, Edge, structure, governance).

## 2. Root causes and what changed

### DX-01 (round-1 regression: explicit unsupported requests accepted)

The round-1 detector decided "the customer is asking for this appliance to be worked on" from a short list of verbs and fault words plus one sentence-level rule. Reading it against the Codex examples and then against negation, ambiguity, incidental mentions and mixed messages found six separate defects, not one:

1. \`FAULT_AFTER\` had no entry for \`hu\`, the accent-stripped form of "hư", so "bị hư" was never a fault.
2. "đến xem", "qua xem", "coi", "khám" were not request verbs.
3. The sentence-level rule (any repair verb anywhere in the sentence) both missed adjacent wording and over-refused: "Nhờ lắp kệ, máy giặt nhà mình vẫn tốt" closed a valid Case.
4. A negated request ("Không cần sửa máy giặt") counted as a request.
5. "cho" always meant "location", hiding "sửa chữa gấp cho cái máy giặt".
6. A fault after a mention that follows a location word was credited to the appliance ("Ổ cắm gần tủ lạnh bị hỏng").

\`requested-work.ts\` now decides per mention, from evidence in the mention's own clause, in this order: suspected cause or uncertainty before it (not a request); a repair or inspection verb that governs it, unless that verb is negated, finished ("đã sửa xong") or inside a "since/when/after" clause (request); a coordinated repair ("sửa vòi nước và cả máy giặt") (request); a location word before it (not a request, and the fault belongs to the head noun); a fault before or after it, from three classes (named breakage, "khong" + a device function, abnormal symptom) (request); a healthy statement (not a request); a request frame followed by a repair verb, or a next clause that is only request words, or a fault clause with no new subject (request); a location word after it (not a request). Negated requests and negated faults are blanked before any rule runs. Nothing is decided by sentence.

The default is unchanged from round 1: an appliance mentioned with no evidence either way leaves the Case open for its next question. That bias is deliberate (closing a Case is terminal; a Case that is later found unsupported is not), and it is why the detector's recall is not complete (section 6).

\`boundary-guard.ts\` and \`pipeline/utils.ts\` (the fallback intent) still share the one module.

### DX-02 (round-1 regression: spark-protection products escalated)

The round-1 spark cue fired on the word "spark" beside a wired fixture, with no notion of a product or something to avoid. A second mask (\`SPARK_PREVENTION_PHRASES\`, next to the existing \`PREVENTION_PHRASES\`) now blanks, before any cue runs, three classes of phrase: Vietnamese avoidance words directly before "tia lửa" (chống, ngăn, phòng ngừa, hạn chế, giảm, tránh, chịu, chắn, bảo vệ, "ít" + a generating verb); English "anti/non-spark", "spark-proof/free/resistant/safe/rated/arrestor/protection/prevention/suppression", and prevention verbs before "spark(s/ing)"; "protected/rated/safe from/against sparks". Masking blanks only the phrase, so a real spark in the same message still routes; a negation or "cannot/fail to" in front of the avoidance word cancels the mask. DX-03 is untouched: \`emergency-turn.ts\` and every precedence rule are byte-identical to round 1.

### Gitleaks findings

The three values are not secrets. Each is the SHA-256 of a saved evidence log; I recomputed the digest of all three files from their bytes and each equals the stored value (checked without printing it). The scanner's \`generic-api-key\` rule fires because the file path contains \`api\` and is followed by \`:\` and a 64-hex value. Finding fingerprints are bound to commit \`04317126\`, so a new commit cannot remove them from the PR scan range; the repository's own mechanism for that is a pinned entry in \`.gitleaksignore\` ("each exception pins one historical finding"). I added exactly three such entries (commit, file, rule, line), nothing else. The scanner configuration, workflows and rules are unchanged. Round-1's \`file-digests.json\` is left byte-identical so its digests stay valid. This round's digest file is written digest-first (\`["<sha256>", "<path>"]\`) so no path precedes a value.

Local check, same ruleset (\`config/security/gitleaks.toml\`), gitleaks v8.30.0 in the pinned container (CI runs v8.24.3): commit \`04317126\` alone gives 3 findings with the exact CI fingerprints; with the three entries it gives none.

### Changed files

${stat}

\`\`\`
${changed.join('\n')}
\`\`\`

The round-2 evidence folder itself (\`docs/test-logs/kawa-remediation-r2-20261022/\`) is not listed.

## 3. Before and after

Red-first: the round-2 pillar files, unchanged, run against the previous candidate (\`04317126\` checked out in a scratch worktree) and against this candidate.

| Pillar | Previous candidate: failed / total | This candidate: failed / total |
|---|---|---|
${Object.entries(red.pillars).map(([id, pair]) => `| ${id} | ${pair.previous.failed} / ${pair.previous.total} | ${pair.current.failed} / ${pair.current.total} |`).join('\n')}

Frozen 36-scenario matrix, 2 runs each, every playbook flag off and on (all inputs hash-checked on every run):

- Against main: flags off ${tally('matrix_flags_off')}; flags on ${tally('matrix_flags_on')}; S5 journeys ${tally('journey_flags_off')}; SUPP-C6b flags on ${tally('supp_c6b_flags_on')}.
- Against the round-1 candidate: flags off ${tally('r1_matrix_flags_off')}; flags on ${tally('r1_matrix_flags_on')}; S5 journeys ${tally('r1_journey_flags_off')} (flags on ${tally('r1_journey_flags_on')}); SUPP-C6b ${tally('r1_supp_c6b_flags_off')} / ${tally('r1_supp_c6b_flags_on')}.

Hazard checkpoints (route, visible guidance, metadata kept apart), frozen 21 + created 15, flags off and on: round 2 is correct on all three dimensions at every checkpoint (${Object.entries(triplet.round_two_summary).map(([key, value]) => `${key} ${value.route_correct}/${value.visible_exact}/${value.metadata_present} of ${value.checkpoints}`).join('; ')}); worse than round 1: ${triplet.worse_than_round_one.length}; worse than main: ${triplet.worse_than_main.length}; flags on delivering less than flags off: ${triplet.monotonic_violations_flags_on_vs_off.length}.

Full tables: \`results/tables.md\`.

### What the round-2 matrix does and does not show

No frozen scenario moved relative to round 1, which is the point: round 2 changes how two detectors read wording the frozen matrix never used. The matrix cannot show the Codex regressions; the new pillars do.

## 4. New regression coverage

- **P419** (spark): ${red.pillars.P419.current.total} rows. Generated: 10 Vietnamese avoidance words x 6 fixtures x 4 carriers x 3 written forms; 7 English modifiers, 4 noun phrases and 6 prevention verbs; the product + real spark controls; hostile-length rows. The positive controls prove the mask never hides a spark that is happening.
- **P420** (precedence, handler level): ${red.pillars.P420.current.total} rows, 10 new: routine spark-protection requests on an active Case (flags off and on) and on a Case waiting for confirmation (409, nothing written), and a real spark on a waiting Case still answered.
- **P421** (boundary): ${red.pillars.P421.current.total} rows. Generated: 10 appliances x (12 generic + 3 specific faults) x 5 carriers x 3 written forms x 6 services x flags off/on for refusals; 10 x 8 negation frames and 10 x 8 incidental frames for the open side; coordinated, mixed and finished-work rows; the fallback intent parity; and bounded-time rows.
- **Probe protocol.** Hand-written sentences in four lists, labelled by what they can honestly show:
  - *Development probes* (P421, and P419's product phrasings): written before the fix; the class-level rules were adjusted to the ones that failed. They are regression rows, not an estimate.
  - *Second set* (P421): written after the first implementation and run once; two class-level fixes followed its misses.
  - *Third set* (P421): written after those fixes, run once, never adjusted to.
  Only the first run of the second and third sets says anything about wording nobody tuned the detector to.

| Probe list | Rows in the file | Failed on previous candidate | Failed on this candidate |
|---|---|---|---|
${heldOut('P421', 'development probes').join('\n')}
${heldOut('P421', 'second probe set').join('\n')}
${heldOut('P421', 'third probe set').join('\n')}
${heldOut('P419', 'development probes').join('\n')}

Rows pinned as known misses are not in that table; they are listed in section 6.

First run of the fresh sets on this candidate, before any change made for them: second set ${setB.failed} failed of ${setB.rows}; third set ${setC.failed} failed of ${setC.rows}. Together ${freshPassed} of ${freshRows} (${Math.round((100 * freshPassed) / freshRows)}%) were decided as labelled the first time. Of the ${setB.failed + setC.failed} misses, two were fixed by class (a negated request with a "tho" in front of the verb; a fault word before the appliance) and the rest are pinned as known misses in the test file.

That percentage is the honest estimate of how this detector behaves on unseen wording from a single author. It is not a recall figure for real customers.

## 5. Verification (local)

| Check | Result |
|---|---|
| API full suite | ${vitestLine('api-full-suite')} (round 1: ${roundOneApi}) |
| API type-check | ${gate('type-check-api')} |
| Shared type-check / tests | ${gate('type-check-shared')} / ${gate('test-shared')}: ${pick(read('logs/final/test-shared.log.txt'), /Tests\s+[^\n]+/)} |
| Mobile type-check / tests | ${gate('type-check-mobile')} / ${gate('test-mobile')}: ${pick(read('logs/final/test-mobile.log.txt'), /Tests:\s+[^\n]+/)}; ${pick(read('logs/final/test-mobile.log.txt'), /Test Suites:\s+[^\n]+/)} |
| Edge type-check, 7 functions, pinned Deno container | ${gate('edge-check-docker-pinned-deno')} |
| Comment discipline (working / full repository) | ${gate('lint-comments-working')} / ${gate('lint-comments-full')} |
| Test integrity / added-source hygiene / reuse ladder | ${gate('lint-test-integrity-working')} / ${gate('lint-added-hygiene-working')} / ${gate('lint-reuse-ladder')} |
| Structure ratchet / baseline lock / source residue | ${gate('lint-structure')} / ${gate('lint-baseline')} / ${gate('lint-source-residue')} |
| Edge-to-database contract / protocol routes / work-plan coverage | ${gate('lint-edge-db')} / ${gate('lint-protocol-routes')} / ${gate('lint-work-plan-coverage')} |
| Workflow cost / test collection / runner parity | ${gate('lint-workflow-cost')} / ${gate('lint-test-collection')} / ${gate('lint-runner-parity')} |
| Skills sync / skill contracts / artifact-text assertions | ${gate('lint-skills-sync')} / ${gate('lint-skill-contracts')} / ${gate('lint-artifact-text-assertions')} |
| Harness verify / manifest check / pillar registry | ${gate('harness-verify')} / ${gate('harness-manifest-check')} / ${gate('pillar-registry-check')} |
| Authority citations | ${gate('lint-authority')} (fails identically on clean main 42daced1: one citation in \`apps/mobile/lib/__tests__/normal-chat-suggestions-cache-pillar-test.tsx\`, a file this round does not touch; log in the round-1 folder) |
| Secret scan, local equivalent | \`logs/secret-scan/\` (written after this file; excluded from the digests) |
| GitHub Actions on the new head commit | recorded on PR #405, not in this file |
| Codex review of the new head commit | requested on PR #405; its answer is not in this file |

\`ship:check\` is a post-commit check and is recorded in the PR comment, not here.

## 6. Remaining unresolved risks

1. **Recall is lexical and incomplete.** Pinned known misses: an appliance part as subject ("mặt kính bếp từ bị nứt"); a request clause with qualifiers after a topic-only clause; a malfunction described without any fault word ("chạy mãi mà quần áo vẫn ướt"); "không bấm được"; "lắp đặt thêm máy sấy" (installation of an appliance); a pipe leaking at a heater's connection read as a heater fault (over-refusal, as on main). Each is pinned in P421 so a change in either direction is visible.
2. **Flagged electrical Cases do not use this detector in the guard.** With the electrical playbook flag on, \`evaluateMessageBoundary\` hands the decision to the hard routing policy and then to the intent model; the fallback intent still uses this detector. "Máy giặt bị hư, cần thợ đến xem." on an electrical Case with the flag on is not refused by the guard today, exactly as on main and in round 1. The refusal tests skip that one combination for that reason; the open-side tests do not.
3. **Existing emergency-gate limits this round did not touch, now pinned in P419:** "không thể ngăn tia lửa bắn ra từ ổ cắm" reads as a negated spark; a spark clause split from its equipment by "nhưng/mà" is not escalated.
4. **Mixed messages.** An explicit unsupported request beside a supported one still refuses the whole Case (unchanged; owner decision from round 1).
5. **English appliance requests** are not covered by the out-of-scope catalogue at all (on main as well).
6. The rest of round 1's list stands (seven default-service-type safety-advice call sites, voice transcripts never screened by the boundary guard, water-heater scope, S5 journeys BLOCKED at T0).
7. Gitleaks: the local scanner is v8.30.0, CI uses v8.24.3.
8. One API run of this exact tree reported 3,803 passed / 7 skipped (one extra skipped test, not identified; its log was overwritten). Three later runs, including one with the JSON reporter, gave 3,804 / 6, the same two database-gated files as round 1.
9. A first draft of the "request words only" clause test used a regular expression with overlapping alternatives that backtracks exponentially (22 tokens: 64 ms, 24: 264 ms). It was found in self-review, never committed, and replaced by a token scan; bounded-time rows now guard both detectors, and each mention is read through a 160-character window.

## 7. Independent-review checklist

- [ ] Read \`requested-work.ts\` top to bottom (about 160 lines); confirm the order of rules in \`mentionIsRequested\` is the order you would want.
- [ ] Re-run \`vitest\` on P419, P420, P421 on this commit (green) and on \`04317126\` with these test files copied in (red): \`scripts/red-first.mjs\`.
- [ ] Confirm the three \`.gitleaksignore\` lines match the CI fingerprints and recompute the three digests from the committed files.
- [ ] Confirm \`emergency-turn.ts\`, \`turn.ts\`, \`create.ts\`, \`evidence.ts\` and \`intake-confirmation.service.ts\` have no diff against \`04317126\`.
- [ ] Try your own wording against \`detectRequestedApplianceWork\` and \`resolveReportedEmergencyGuidance\`; add the misses to the known-miss list or to a fix, not to the probe lists.
- [ ] Decide the owner questions in section 6 (2, 4) and round 1's list.

## 8. Tier limits

- **T0 only.** Stubbed model; in-memory harness; every number above is a T0 number.
- **T1 (PostgreSQL):** not run. No migration, RPC or SQL changed; S5 J03, J14 and J15 remain BLOCKED and nothing was changed to move them.
- **T2 (multi-actor / deployed):** not run. Nothing was deployed; Production flag state is unknown and was not queried.
- **T3 (device):** not run.
- **Sealed H5:** not read, not run, not changed. No claim about classifier recall on real traffic, no claim of Master Plan_01, H5 or six-service end-to-end completion.
`
writeFileSync(join(evidenceRoot, 'REPORT.md'), out)
console.log(out.length)
