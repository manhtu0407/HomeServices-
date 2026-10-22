# KAWA_01 remediation round 2, follow-up on PR #405 (R2b)

Date: 2026-10-22. Tier: T0 (T1, T2, T3 NOT_RUN). Branch `claude/nestscout-remediation-r1-20261022`, on top of `5f44351ea8b080a2f0a66d0d61267fab00da68d2` (round 2). Base: `origin/main` 42daced1. Not merged, not deployed. The round-1 and round-2 folders, the diagnostic baseline, the audit and the sealed H5 set are not modified. This folder only adds evidence; the round-2 REPORT.md stays a record of `5f44351e` and its counts (P419 109, P420 43, P421 214) are superseded by section 4 below.

## 1. What triggered it

Codex reviewed `5f44351e` and posted two inline findings. Looking into the first one with fresh wording turned up a third defect, introduced by my own round-2 change.

| # | Source | Finding | Verdict |
|---|---|---|---|
| 1 | Codex P1, `emergency-guidance.ts` | "Tôi đang cố ngăn tia lửa điện bắn ra từ ổ cắm." routed `electrical_water` on `04317126`, but returned no route on `5f44351e`: the spark-prevention mask blanked `ngăn tia lửa điện` before any cue ran | Confirmed. A customer trying to stop a live spark got no guidance |
| 2 | Codex P2, `requested-work.ts` | "Mình đã sửa xong vòi nước rồi và cần sửa máy giặt." detected no appliance on `5f44351e` (it did on `04317126`): the finished-work marker silenced every repair verb in the context window | Confirmed. An explicit unsupported request passed on a handyman Case |
| 3 | Found by me, probing finding 1 | "Ổ cắm đang phóng tia lửa, nóng rát tay." (the outlet is shooting sparks) routed `electrical_water` on `04317126` and no route on `5f44351e`. Plain text "phong" is both "phòng" (prevent) and "phóng" (shoot), and the mask treated them alike | Confirmed regression of `5f44351e`, not reported by Codex. Evidence: `logs/first-runs/phong-regression-by-commit.txt` |

## 2. Root causes and changes

Changed production files (3, +54 -13 lines, no comment tokens added):

- `emergency-signal-text.ts`: `blankMatches` takes an optional `keep(start, end)` predicate; callers without it are unchanged.
- `emergency-guidance.ts`: the spark-prevention mask now leaves a phrase unmasked when the customer is acting on a spark that exists. That means an attempt before it (`cố gắng`, `nỗ lực`, accented `cố`, `đang` before `ngăn`/`chặn`, English `trying/tried/attempting/struggling to`), or a source after it (`bắn/phát/xẹt ... ra từ/ở/tại ...`, `coming/shooting/flying ... out of/from`). A purpose or capability word before it (`để`, `có thể`, `designed to`, `that can`, `would`) keeps the mask, so "an outlet that stops sparks coming out of the contacts" stays a product description. `phong` followed by `tia lửa` is read as "shoot" unless it is spelled `phòng`, so the mask keeps `phòng tia lửa` and `phòng ngừa tia lửa` only.
- `requested-work.ts`: finished work is now scoped. `finishedWork` returns each finished repair act with its span; a mention is excused only if its own governing act (act before it, coordinated act, or act after it) is a finished one, or the mention sits inside a finished clause. A new request in the same sentence is judged on its own verb.

Not touched: `emergency-turn.ts`, DX-03 precedence and gate ordering, the boundary guard, the fallback intent, scripts, workflows, scanner configuration, `.gitleaksignore`, frozen fixtures.

## 3. Before and after

| Wording | `04317126` | `5f44351e` | This candidate |
|---|---|---|---|
| Tôi đang cố ngăn tia lửa điện bắn ra từ ổ cắm. | electrical_water | no route | electrical_water |
| I am trying to stop sparks coming out of the outlet. | electrical_water | no route | electrical_water |
| Ổ cắm đang phóng tia lửa, nóng rát tay. | electrical_water | no route | electrical_water |
| Nhờ lắp ổ cắm chống tia lửa cho bếp. | electrical_water | no route | no route |
| Mình đã sửa xong vòi nước rồi và cần sửa máy giặt. | refused | open | refused |
| Mình đã sửa xong máy giặt rồi. | refused (finished work not recognised) | open | open |
| Mình đã sửa máy giặt xong rồi và cần xem tủ lạnh. | máy giặt and tủ lạnh | none | tủ lạnh only |

## 4. Coverage and red-first

Pillar ids are unchanged. Counts: P419 175 (was 109), P420 47 (was 43), P421 254 (was 214).
Red-first, final test files against `5f44351e` (`results/red-first-summary.json`): P419 28 of 175 fail, P420 2 of 47, P421 18 of 254. On this candidate: 0, 0, 0. Earlier, shorter versions of the same files were also run first and are kept in `logs/first-runs/draft-red-*`.

New rows:
- P419: attempt matrices (6 Vietnamese verbs x 6 fixtures x 5 carriers x 3 written forms; 4 English verbs x 5 fixtures x 4 carriers), four single examples including the Codex sentence, quiet matrices for need, capability and purpose wording, the phóng/phòng matrices, bounded-time rows for the new patterns, a 15-row probe set, and three pinned two-way readings (below).
- P420: two live-spark messages join the hazard list, so route, visible 112/114/115, metadata, single speaking and flag-parity are checked for them with the flags off and on.
- P421: finished-work matrices (10 appliances x 5 finished objects x 6 carriers x 3 forms, refused), the same appliance finished beside a supported request (stays open), seven exact-set detector rows and a 12-row probe set.

Probe sets written after the implementation and run once, before any adjustment (`logs/first-runs/fresh-probes-first-run.txt`): finished work 12 of 12; sparks 14 of 15. The one miss was a false escalation ("Ổ cắm hiện tại đang chống tia lửa khá tốt", a bare `đang` before a property verb); fixing it by limiting `đang` to `ngăn`/`chặn` is what exposed finding 3. All 15 and all 12 are kept as rows; the rows are labelled with this history and are not held-out evidence any more.

## 5. Verification (this candidate, one pass, `logs/final/`)

- API: 3,913 pass, 7 skipped (round 2: 3,804 pass, 6 skipped; +109 rows). The extra skip is the same unidentified one-off seen once in round 2; the rows added here are not skipped. Mobile 2,660 pass. Shared 189 pass. Type-checks API, shared, mobile pass. Edge check 7 of 7 (Docker, pinned Deno).
- Frozen 36 scenarios, flags off: 30 PASS + 6 S5 BLOCKED, identical to round 2 (30 unchanged); against main 26 unchanged + 4 FAIL to PASS. Flags on: 30 PASS identical to round 2, against main 23 unchanged + 7 FAIL to PASS. SUPP-C6b unchanged against round 2. Zero regressions against either reference. Frozen inputs and the harness were hash-checked on every run and removed afterwards.
- Hazard checkpoints, route / visible guidance / metadata: 21 of 21 frozen and 15 of 15 created, flags off and on; 0 worse than round 2, 0 worse than main, 0 where flags on delivers less than flags off.
- Gates passing: comment discipline (working and full), test integrity, added-source hygiene, reuse ladder, structure and baseline, Edge-DB contract, source residue, protocol routes, work-plan coverage, workflow cost, test collection, runner parity, skills sync, skill contracts, artifact text assertions, harness verify and manifest, pillar registry.
- `lint:authority` fails on one citation (`apps/mobile/lib/__tests__/normal-chat-suggestions-cache-pillar-test.tsx:31`, Plan §3.4), identical on clean main; not touched.
- Secret scan, local, pinned scanner and repository ruleset: `logs/secret-scan/`. No scanner rule, configuration, workflow or `.gitleaksignore` entry changed. GitHub Actions and Codex results for the pushed commit are recorded on PR #405, not here.

## 6. Remaining risks (new in this round, on top of round 2 section 6)

1. Both detectors are lexical. The fresh-wording sets are small (27 probes). Recall on real traffic is not measured.
2. The spark mask can still hide wording that reads two ways, pinned as rows: unaccented `co ngan tia lua` (cannot be told from "có"); "trying to prevent sparks" (the shared gate treats `to prevent` as hypothetical, already so before this round); a product question that names where sparks come from ("stops sparks coming out of the socket") is routed on the safe side, so it can show emergency guidance on a routine question.
3. The homograph class was checked by hand against the avoidance verbs; only `phong` was found. A systematic check against a Vietnamese word list was not done.
4. An electrical Case whose text pairs an outlet or breaker with a work verb is never screened by the keyword gate (`boundary-guard.ts:386`, `hasElectricalInfrastructureContext`), so an appliance request in the same message is not refused there. Pre-existing, outside this finding, and why the test objects of the finished-work matrices avoid electrical components.
5. A mixed message is still refused as a whole when one part is an unsupported request (round 2 behaviour, unchanged).
6. Round-2 risks that are not restated here still stand.

## 7. Review checklist

1. `git diff 5f44351e..HEAD -- supabase/` shows three files and no change to `emergency-turn.ts` or DX-03 ordering.
2. Run the 3 pillar files on `5f44351e` with these test files: expect 28, 2 and 18 failures; on HEAD: none.
3. Re-run the sentences in section 3 (`scripts/probes/`).
4. Confirm `logs/first-runs/` holds the first runs unedited (ANSI colour codes stripped only).
5. Check the digests: `file-digests.json` is digest first, then path.

## 8. Tier limits

T0 only: in-memory harness, stubbed model, no PostgreSQL, no deployed Edge, no device. No claim about Master Plan_01, H5 or six-service end-to-end completion. S5 journeys stay BLOCKED. Not merged, not deployed, no Production resource, flag, migration, RPC or paid model call touched. KAWA_02 not started; protected session memory not written.
