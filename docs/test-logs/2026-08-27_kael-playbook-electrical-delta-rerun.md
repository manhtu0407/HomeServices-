# Electrical playbook matched delta rerun — 2026-08-27

Phạm vi: staging project xyylanuyflrjzbjzhqfl, branch claude/audit-system-skills-e2ad42, worktree .claude/worktrees/skills-structure-review-fdda04, HEAD 99349b5fc64f07d00d1f62a340750c16d4563b38. Không có commit, push, merge hoặc Production mutation.

## Hypothesis

Khi bật electrical playbook trên cùng một corpus intake, Kael sẽ cải thiện scope/routing/safety signals và giảm false decline mà không tạo regression về scope. Đây là phép đo matched baseline ↔ after trên staging, không phải bằng chứng cho App Store hoặc production.

## Changed

- Root cause được xác nhận trong runtime: baseline lookup failure bị ném ra ngoài typed pipeline; outer catch trả pipeline_error và làm mất intake_observation trước response boundary.
- supabase/functions/mobile-api/_shared/kael/pipeline/stage-baseline.ts nay giữ failure trong typed result dưới honest NO_BASELINE, để observation vẫn được serialize; không tạo giá, worker hoặc dữ liệu giả.
- Thêm pillar test apps/api/src/__tests__/kael-edge-runtime/domains/kael-intake-observation-failure-pillar.test.ts, kiểm tra observation survives baseline failure và spend callback chỉ chạy một lần.
- Cập nhật evaluator apps/api/scripts/kael-playbook-eval.mjs để gửi client identity headers, Idempotency-Key ổn định và language=vi; thêm fail-fast validation cho native client identity.
- Theo quyền Tu cấp sau khi xác nhận defect, deploy staging-only mobile-api từ version 307 lên version 308. Production không bị deploy.
- Không mở khoá hay sửa kael-process; không commit/push/merge.

## Baseline

Artifacts:

- docs/test-logs/2026-08-27_kael-playbook-electrical-baseline-rerun-p1.json và sidecars
- docs/test-logs/2026-08-27_kael-playbook-electrical-baseline-rerun-p2.json và sidecars

Kết quả combined trên 24 case, tính lại bằng scorePlaybookCase và aggregatePlaybookResults từ hai JSON public artifact:

| Metric | Baseline |
|---|---:|
| Overall pass | 8/24 = 33.33% |
| Errored | 0/24 |
| scope_signal | 17/24 = 70.83% |
| suggested_service | 23/24 = 95.83% |
| needs_clarification | 14/24 = 58.33% |
| problem_slug | 12/18 = 66.67% |
| Safety-field pass | 2/8 = 25.00% |
| Routing accuracy | 70.83% |
| Routing macro-F1 | 0.5444 |
| False declines | 3/18 = 16.67% |
| Required-safety recall | 2/10 = 20.00% |
| Immediate-critical recall | 2/4 = 50.00% |
| Capability recall | 0/6 = 0% |
| Clarification rate | 12/24 = 50.00% |

## After

Artifacts:

- docs/test-logs/2026-08-27_kael-playbook-electrical-after-rerun-p1.json và sidecars
- docs/test-logs/2026-08-27_kael-playbook-electrical-after-rerun-p2.json và sidecars
- Diagnostic probe: docs/test-logs/2026-08-27_kael-playbook-electrical-after-rerun-probe.json và sidecars

Kết quả combined trên cùng 24 case:

| Metric | After |
|---|---:|
| Overall pass | 15/24 = 62.50% |
| Errored | 0/24 |
| scope_signal | 24/24 = 100% |
| suggested_service | 24/24 = 100% |
| needs_clarification | 19/24 = 79.17% |
| problem_slug | 15/18 = 83.33% |
| Safety-field pass | 6/8 = 75.00% |
| Routing accuracy | 100% |
| Routing macro-F1 | 1.0000 |
| False declines | 0/18 = 0% |
| Required-safety recall | 7/10 = 70.00% |
| Immediate-critical recall | 4/4 = 100% |
| Capability recall | 3/6 = 50.00% |
| Clarification rate | 11/24 = 45.83% |

Observed live state: playbookVersion = electrical-playbook-2026-07-16.v2; deployment = mobile-api-v308.

## Delta

After trừ baseline:

| Metric | Delta |
|---|---:|
| Overall pass | +29.17pp |
| scope_signal | +29.17pp |
| suggested_service | +4.17pp |
| needs_clarification | +20.84pp |
| problem_slug | +16.66pp |
| Safety-field pass | +50.00pp |
| Routing accuracy | +29.17pp |
| Routing macro-F1 | +0.4556 |
| False-decline rate | -16.67pp |
| Required-safety recall | +50.00pp |
| Immediate-critical recall | +50.00pp |
| Capability recall | +50.00pp |
| Clarification rate | -4.17pp |

Case-level result: 9 improved (el_03, el_04, el_06, el_08, el_15, el_18, el_20, el_21, el_24), 2 regressed (el_09, el_10), 13 unchanged. Scope changed in 7 cases and all 7 moved toward the expected state; no scope regression was observed:

- el_04 in_scope → out_of_scope
- el_12 out_of_scope → in_scope
- el_15 out_of_scope → in_scope
- el_18 out_of_scope → service_mismatch
- el_20 in_scope → out_of_scope
- el_21 in_scope → out_of_scope
- el_23 out_of_scope → in_scope

## Diagnostic/live metrics

- Lần chạy đầu có 4/12 missing_intake_observation. Trace code cho thấy baseline stage exception đi qua outer catch của advance.ts; không thể khôi phục label từ record đã bị mất và không tổng hợp observation từ diagnosis_scope.
- Sau patch, baseline P1/P2 và after P1/P2 đều hoàn tất 12/12 case, tổng 24/24, errored = 0.
- Native-contract probe sau khi sửa evaluator trả HTTP 201 với scope_signal và problem_slug; các request evaluation có client identity, Idempotency-Key và language=vi.
- Conversation latency:

| Arm | Slice | p50 | p95 |
|---|---|---:|---:|
| Baseline | P1 | 5,590ms | 6,993ms |
| Baseline | P2 | 5,200ms | 10,862ms |
| After | P1 | 5,756ms | 7,095ms |
| After | P2 | 5,403ms | 12,101ms |

- Staging flags đã được unset và secrets list xác nhận không còn hai flag. Auth user test đã bị xoá; GET Auth trả 404. Exact REST query cho profile và customer_account_deletion_requests theo user test đều trả [] sau cleanup. Không có secret hoặc credential trong artifacts.
- Holdout follow-up sau khi Tu duyệt Next Step: chưa có blind corpus độc lập nên Codex tạo synthetic self-review corpus 24 ca; corpus này không phải ground truth độc lập. Đã chạy live đúng pacing qua bốn lát canonical runner: baseline `9/24 = 37.50%` trên `mobile-api-v316`, after `18/24 = 75.00%` trên `mobile-api-v317`, cả hai arm `errored = 0`; delta diagnostic `+37.50pp`, required safety recall `30% → 80%`, false decline `11.11% → 0%`. Deploy lifecycle là v315 → v316 → v317, cleanup xong function listing báo v318; không gắn các version này với matched artifacts v308 và manifest live ghi `deployment_attestation=not_performed`. Chi tiết và sidecars ở `2026-08-27_kael-playbook-electrical-synthetic-holdout.md`.

## Verification actually run

- node --check apps/api/scripts/kael-playbook-eval.mjs — PASS.
- Pillar test kael-intake-observation-failure — PASS, 1/1.
- pnpm type-check:api — PASS.
- pnpm test:api — PASS: 23 suites passed, 1 skipped; 596 tests passed, 1 skipped.
- pnpm lint:comments — PASS, comment-discipline clean.
- node scripts/check-authority-citations.mjs — PASS, chỉ còn các warning archived Plan citation đã biết.
- node scripts/check-skill-contracts.mjs — PASS, 38 skills.
- node scripts/check-skills-sync.mjs — PASS.
- node scripts/harness/check-manifest.mjs — PASS.
- node scripts/lint-structure.mjs — PASS.
- node --test scripts/check-work-plan.test.mjs — PASS, 17/17.
- git diff --check — PASS, không có whitespace error.
- node scripts/check-ship-ready.mjs — 11/11 content gates PASS; process exit 1 vì worktree còn uncommitted changes, đúng D7 và không được che giấu.
- Supabase deploy staging-only — PASS, mobile-api version 307 → 308; không dùng --prune và không đụng Production.
- Synthetic corpus strict validator — PASS, 24 cases với counts `18/3/3`, SHA-256 `abf69e9615960ab4870c32b2e3e79a00cdfb9ed63ba985502ee9c8a706e5abb3`.
- Synthetic canonical runner — PASS: baseline P1/P2 và after P1/P2, mỗi lát 12 case, `--delay 190`, `--retry-wait 190`, exit 0, tổng 24/24 case mỗi arm; artifacts nằm trong `docs/test-logs/2026-08-27_kael-playbook-electrical-synthetic-*`.
- Synthetic staging deploy — PASS, immediate listing v315; live baseline quan sát v316, after quan sát v317; final listing sau cleanup v318; không đụng Production.
- Cleanup verification — PASS: flags absent, Auth 404, exact REST rows [] và evaluator credential env/log tạm đã xoá.

## Human/domain review still required

- Cần một blind holdout corpus độc lập, có expected scope/routing/safety/capability labels do Tu hoặc domain reviewer giữ ngoài runner. Synthetic corpus vừa chạy vẫn do Codex tự gán nhãn nên không đóng gate này.
- Domain reviewer cần xem regression `synth_10`, safety misses after (`fixed_wiring` ở `synth_01` và `synth_16`), và xác nhận rằng mọi escalation/clarification là đúng nghiệp vụ electrical tại căn hộ TP.HCM.
- Sau holdout cần review lại có nên giữ NO_BASELINE như trạng thái honest hay truy nguyên tiếp nguồn baseline lookup failure.

## Risks/Limitations

- Matched development-set và synthetic pair đều chưa phải blind holdout; one repetition per case không đo được variance.
- Positive delta có thể bao gồm khác biệt prompt/runtime profile và runtime patch observation-loss cùng playbook; không quy toàn bộ improvement cho playbook.
- Synthetic after P2 có một latency outlier khoảng 199,471ms dù combined p95 là 8,094ms; cần theo dõi nếu tiến tới performance gate.
- Synthetic manifest chưa có content deployment attestation; version listing chỉ là remote lifecycle identifier.
- Chưa chạy native iPhone/Android UI evidence, Deno check toàn bộ Edge function, migration SQL/RLS verification hoặc CI attestation cho exact source. API gates xanh không thay thế các gate này.
- Worktree intentionally dirty; chưa có commit/PR/merge. Đây là report/evidence của staging, không phải release artifact.

## Decision

NEEDS_HOLDOUT — tín hiệu thực nghiệm tích cực và không có scope regression trong matched pair, nhưng chưa đủ điều kiện mở khoá kael-process, claim production-ready hoặc rollout. Giữ kael-process ở trạng thái locked.

## Next Step

Tu hoặc domain reviewer cung cấp/duyệt blind holdout độc lập với expected labels. Synthetic live result chỉ là diagnostic để ưu tiên review; sau đó chạy blind holdout trên đúng staging source đã content-attested, review regression/safety miss và latency outlier, rồi mới quyết định có mở khoá `kael-process` hay cần sửa tiếp. Không tự động unlock hoặc deploy Production từ kết quả này.
