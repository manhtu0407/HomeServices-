# Kael five-service source diagnostic — 2026-08-27

## Hypothesis

Nếu hoàn thiện đủ source lane cho plumbing, HVAC, handyman, cleaning và upholstery theo cùng contract của electrical, đồng thời dùng corpus/holdout cân bằng từ ca dễ tới ca suy luận nhiều tầng, Kael sẽ có nền tảng playbook nhất quán để đo độc lập từng nghề sau này. Source readiness không đồng nghĩa với live improvement: staging baseline/after và nhãn độc lập vẫn là điều kiện riêng.

## Changed

- Làm việc đúng worktree `C:\Users\Phan Manh Tu\Desktop\home-services\.claude\worktrees\skills-structure-review-fdda04`, branch `claude/audit-system-skills-e2ad42`, HEAD `99349b5fc64f07d00d1f62a340750c16d4563b38`.
- Giữ và audit lane plumbing đã có; thêm lane runtime + textbook + corpus + synthetic holdout cho HVAC, handyman, cleaning và upholstery.
- Đăng ký đủ 5 segment trong playbook registry, version ngày `2026-08-27`, giữ flag service playbook ở trạng thái OFF.
- Tách scanner safety theo service khỏi electrical policy để giữ structure ratchet; bổ sung guidance/estimate safety theo `serviceType` và giữ tương thích với electrical.
- Review bổ sung regression cho HVAC `sparking`: service-specific guidance được ưu tiên đúng ngữ cảnh, không rơi về hướng dẫn aptomat/thợ điện của electrical.
- Thêm coverage/parity evaluator và package gate `pnpm lint:playbooks`.
- Không commit, push, merge, deploy, sửa Production, tạo credential hay bật flag.

## Corpus and holdout coverage

Mỗi lane có đúng 24 corpus + 24 synthetic holdout. Holdout dùng câu chữ mới và rationale có nhãn `[SYNTHETIC SELF-REVIEW]`; đây là self-review có kiểm soát, không phải ground truth độc lập.

| Service | Corpus / holdout | Scope corpus | Scope holdout | Difficulty corpus / holdout (easy/medium/hard) | Complexity corpus / holdout (small/medium/large; null) | Slug/safety/parity |
|---|---:|---|---|---|---|---|---|
| plumbing | 24 / 24 | 19 in / 3 mismatch / 2 out | 19 in / 3 mismatch / 2 out | 11/8/5 · 11/8/5 | 4/4/9 (7) · 4/4/9 (7) | pass |
| hvac | 24 / 24 | 19 / 3 / 2 | 19 / 3 / 2 | 6/8/10 · 6/8/10 | 4/4/9 (7) · 4/4/9 (7) | pass |
| handyman | 24 / 24 | 18 / 4 / 2 | 18 / 3 / 3 | 8/6/10 · 8/6/10 | 5/4/8 (7) · 5/4/8 (7) | pass |
| cleaning | 24 / 24 | 19 / 3 / 2 | 19 / 3 / 2 | 8/7/9 · 8/7/9 | 4/4/9 (7) · 4/4/9 (7) | pass |
| upholstery | 24 / 24 | 19 / 3 / 2 | 19 / 3 / 2 | 7/6/11 · 6/7/11 | 4/4/9 (7) · 4/4/9 (7) | pass |

The evaluator also confirms every exact contract slug appears at least twice, every service safety signal is represented, there are multi-signal hard cases, out-of-scope cases, service mismatches, and Vietnamese no-diacritic/typo variants. The matrix intentionally keeps a meaningful hard tail instead of padding with easy paraphrases.

Every corpus and holdout case also carries a non-empty `detail` field; the large cases add grounded constraints such as access, hidden infrastructure, material uncertainty, prior repair history, occupant sensitivity, or scope boundaries. This gives Kael evidence to reason over rather than only a label to classify.

## Verification actually run

Passed local gates:

- `pnpm lint:playbooks` — all five services pass the strict 24+24, grounded `detail >= 40`, slug, scope, difficulty, complexity, safety, hard multi-signal, wording-disjointness and Appendix/runtime parity ratchets.
- `pnpm type-check:api` — pass.
- `pnpm test:api` — `25` test files passed, `1` skipped; `603` tests passed, `1` skipped.
- `pnpm harness:pillars:write` then `pnpm harness:pillars:check` — `47/47` pillar IDs unique and manifest copies identical.
- `pnpm lint:comments --working` — clean.
- `pnpm lint:structure` — pass; `1057` source files, only existing grandfathered exceptions reported.
- `pnpm lint:workplan:coverage` — `38/38` skills reachable.
- `pnpm lint:authority` — `182` citations across `2048` files resolve; archived Plan warnings are non-blocking.
- `pnpm lint:residue` — pass; no focused/skipped tests, debug probes or runtime `console.log` in the scanned source.
- `pnpm lint:edge-db` — pass as a static scan; it reported 5 pre-existing/unscannable dynamic RPC call sites and did not compare against a database because no `--functions` target was supplied.
- `node scripts/check-ship-ready.mjs` — all 11 content/governance gates reported OK; overall readiness stayed `NOT READY` because 127 paths are intentionally uncommitted, and the command explicitly did not substitute missing Deno/Supabase/CI checks.
- `pnpm --dir apps/api exec vitest run src/__tests__/unit/kael-service-playbook-safety-pillar.test.ts` — intentional red proof for the HVAC guidance regression, then green after the fix (`1` file, `3` tests passed).
- `git diff --check` — pass; line-ending warnings are the known Windows `core.autocrlf` noise.

## Baseline

**NOT RUN / BLOCKED BY DOCTOR.** The required local toolchain was not allowed to start. The latest `pnpm db:local:doctor` measured Docker daemon reachable, disk and ports available, but only `1.85 GB` available RAM against the repository’s `4 GB` floor. Doctor refused to start the local stack.

## After

**NOT RUN / BLOCKED BY DOCTOR.** No local stack was started, so `pnpm edge:check`/G2 was not run and no staging after arm was attempted. No playbook flag was enabled.

## Delta

**N/A.** There is no matched baseline/after pair for these five services in this turn. No scope delta, safety recall delta, or live holdout metric may be claimed.

## Live metrics

Not run. There was no staging deploy, no account/secret mutation, no production observation, and no native/device evidence. The synthetic holdouts are useful for deterministic coverage and reasoning-shape checks only; their self-review labels cannot establish independent accuracy.

## Human/domain review still required

- An independent Vietnamese-speaking domain reviewer must verify each service’s routing, safety interpretation, urgency, evidence requirements, and safe wording.
- The reviewer should challenge the hard and multi-signal cases, especially concealed/building-system plumbing, refrigerant/electrical HVAC signals, structural/concealed handyman requests, high-access/chemical cleaning, and unknown/delicate upholstery materials.
- After the Docker RAM precondition is restored, each lane still needs G2, staging baseline and after, matched delta, and an independent holdout. Only then can G5 be assessed.

## Risks / Limitations

- This is source readiness, not production readiness. `kael-process` remains locked and all five flags remain OFF.
- Synthetic holdout labels were authored by the same self-review process that built the cases; they do not break the label circularity.
- G2 and all live arms remain unverified because the doctor measured `1.85 GB < 4 GB`. Bypassing that gate would violate the Docker protocol and risk heavy swap.
- No claim is made about native UI, production latency, provider behavior, worker availability, actual job outcomes, or safety recall in production.
- The worktree remains dirty by design; unrelated user/Claude changes were preserved. There is no commit or remote publication.

## Decision

`SOURCE_ARTIFACT_READY / NEEDS_INDEPENDENT_REVIEW / TOOLCHAIN_BLOCKED` for all five lanes. The source, corpus, holdout, parity and local static/API checks are ready for the next controlled measurement, but the plan cannot advance to G2, baseline/after, G5, or rollout from this environment state.

## Next Step

Reclaim enough host memory to satisfy the repository’s `>= 4 GB` Docker floor, then run the exact sequence: `pnpm db:local:doctor` → G2/`pnpm edge:check` → per-service staging baseline → after → delta and required-safety recall → independent holdout/domain review. Keep all flags OFF until each service has an honest passing gate and a documented decision.
