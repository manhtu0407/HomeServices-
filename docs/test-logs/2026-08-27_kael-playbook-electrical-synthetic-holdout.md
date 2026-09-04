# Kael electrical synthetic holdout — 2026-08-27

## Hypothesis

Một reviewer tự tạo expected labels có thể kiểm tra độ phủ của corpus, tính hợp lệ của token và các lỗ hổng nhãn trước khi Tu/domain reviewer cung cấp blind holdout. Nó không thể đo generalization hoặc thay thế đánh giá độc lập.

## Changed

- Thêm corpus `docs/playbooks/eval/electrical-synthetic-holdout-2026-08-27.json` gồm 24 ca mới, không sao chép câu chữ của development corpus: 18 `in_scope`, 3 `service_mismatch`, 3 `out_of_scope`; có đủ 8 electrical problem slugs.
- Tự review các nhãn theo contract hiện tại: 6 ca có tổng 10 safety-signal occurrences thuộc 8 token electrical hợp lệ; 7 ca yêu cầu clarification. Mỗi rationale được đánh dấu `[SYNTHETIC SELF-REVIEW]` để không nhầm với domain-reviewed ground truth.
- Sau khi Tu duyệt chạy holdout, đã deploy staging-only từ worktree này bằng bundled Supabase CLI. Listing ngay sau deploy báo `mobile-api` version 315; live baseline quan sát version 316 và live after quan sát version 317. Không deploy Production, không commit, không merge.
- Đã tạo một disposable customer account đã confirm, chạy đủ bốn lát canonical live runner theo pacing tối thiểu 190 giây, sau đó xoá và xác minh cleanup.

## Baseline

Combined trên 24 synthetic self-reviewed cases, flags `electrical_playbook=false`, observed deployment `mobile-api-v316`, `errored=0`:

| Metric | Result |
|---|---:|
| Overall pass | 9/24 = 37.50% |
| `scope_signal` | 19/24 = 79.17% |
| `suggested_service` | 24/24 = 100% |
| `needs_clarification` | 16/24 = 66.67% |
| `problem_slug` | 15/18 = 83.33% |
| Safety-gated cases | 1/6 = 16.67% |
| Required safety recall | 3/10 = 30.00% |
| Immediate-critical recall | 3/4 = 75.00% |
| Capability recall | 0/6 = 0.00% |
| Routing accuracy / macro-F1 | 79.17% / 0.6216 |
| False decline | 2/18 = 11.11% |
| Latency p50 / p95 | 5,766ms / 7,582ms |

Artifacts: `synthetic-baseline-p1` và `synthetic-baseline-p2` JSON, raw JSON và Markdown sidecars trong `docs/test-logs/`.

## After

Combined trên cùng 24 cases, flags `electrical_playbook=true`, observed deployment `mobile-api-v317`, observed playbook `electrical-playbook-2026-07-16.v2`, `errored=0`:

| Metric | Result |
|---|---:|
| Overall pass | 18/24 = 75.00% |
| `scope_signal` | 24/24 = 100% |
| `suggested_service` | 24/24 = 100% |
| `needs_clarification` | 20/24 = 83.33% |
| `problem_slug` | 17/18 = 94.44% |
| Safety-gated cases | 4/6 = 66.67% |
| Required safety recall | 8/10 = 80.00% |
| Immediate-critical recall | 4/4 = 100.00% |
| Capability recall | 4/6 = 66.67% |
| Routing accuracy / macro-F1 | 100.00% / 1.0000 |
| False decline | 0/18 = 0.00% |
| Latency p50 / combined p95 | 5,845ms / 8,094ms |

Artifacts: `synthetic-after-p1` và `synthetic-after-p2` JSON, raw JSON và Markdown sidecars trong `docs/test-logs/`.

## Delta

After trừ baseline trên cùng corpus:

| Metric | Delta |
|---|---:|
| Overall pass | +37.50pp |
| `scope_signal` | +20.83pp |
| `needs_clarification` | +16.66pp |
| `problem_slug` | +11.11pp |
| Safety-gated cases | +50.00pp |
| Required safety recall | +50.00pp |
| Immediate-critical recall | +25.00pp |
| Capability recall | +66.67pp |
| Routing accuracy / macro-F1 | +20.83pp / +0.3784 |
| False decline | -11.11pp |
| Latency p50 / combined p95 | +79ms / +512ms |

Case-level score comparison: 10 improved (`synth_02`, `synth_04`, `synth_05`, `synth_06`, `synth_08`, `synth_15`, `synth_17`, `synth_22`, `synth_23`, `synth_24`), 1 regressed (`synth_10`), 13 unchanged. Đây là tín hiệu diagnostic tích cực, không phải causal proof cho playbook vì các manifest cũng ghi nhận khác biệt prompt/runtime giữa hai arm và corpus vẫn do cùng reviewer tự gán nhãn.

## Diagnostic/live metrics

- Corpus: 24 cases; `in_scope=18`, `service_mismatch=3`, `out_of_scope=3`; 6 cases có safety labels; 10 safety occurrences; 7 clarification cases.
- Corpus SHA-256: `abf69e9615960ab4870c32b2e3e79a00cdfb9ed63ba985502ee9c8a706e5abb3`.
- Live protocol: baseline P1/P2 và after P1/P2, mỗi lát 12 cases, `--delay 190`, `--retry-wait 190`, `--limit 12`, một repetition/case; cả bốn runner invocation exit 0 và tổng cộng 24/24 case mỗi arm có observation.
- Không có runner error; `forbidden_signal_checks=0`. Repetition evidence không khả dụng vì mỗi case chỉ chạy một repetition.
- Safety misses baseline: `synth_01` (`fixed_wiring`, `protective_device`), `synth_02` (`protective_device`), `synth_13` (`new_circuit`, `distribution_board`), `synth_16` (`fixed_wiring`), `synth_17` (`exposed_live_parts`). After còn hai miss `fixed_wiring` ở `synth_01` và `synth_16`.
- After P2 có một latency outlier khoảng 199,471ms do pacing/retry behavior; combined p95 8,094ms không xoá được rủi ro outlier này.
- Disposable account verify: `confirmed=true`, `role=customer`; cleanup: Auth `404`, profile rows `0`, deletion-request rows `0`.
- Sau cleanup, `functions list` báo remote `mobile-api` version `318` và `secrets list` không còn hai evaluation flags. Các artifact manifest live ghi `deployment_attestation=not_performed`; không dùng version listing như bằng chứng attestation nội dung.

## Verification actually run

- Strict corpus validator: **PASS**, 24 cases; counts `18/3/3`; rationale synthetic marker đầy đủ.
- Bundled `supabase functions deploy mobile-api --project-ref xyylanuyflrjzbjzhqfl --use-api`: **PASS**, staging-only; immediate function listing showed version 315.
- Canonical runner: **PASS** cho `synthetic-baseline-p1`, `synthetic-baseline-p2`, `synthetic-after-p1`, `synthetic-after-p2`; mỗi lát exit 0, không có error case, đúng observed flag/playbook state.
- Disposable account Admin/API verification and deletion: **PASS**; cleanup verification returned Auth 404, profile 0, deletion-request 0.
- `supabase secrets list --project-ref xyylanuyflrjzbjzhqfl`: **PASS**, sau cleanup không còn hai evaluation flags; final `functions list` returned version 318.
- Strict runner guard trước đó cũng đã **PASS as a guard** khi từ chối invocation thử nghiệm `--delay 0` với `live_delay_below_safe_minimum_190_seconds`; invocation đó không gửi traffic và không được tính vào kết quả ở trên.
- Matched development-set result vẫn chỉ là evidence lịch sử trong [delta rerun report](2026-08-27_kael-playbook-electrical-delta-rerun.md): 24/24 per arm, `33.33% → 62.50%`; không được cộng gộp với corpus synthetic này.

## Human/domain review still required

- Tu hoặc domain reviewer vẫn phải giữ expected labels ngoài runner và duyệt một blind holdout độc lập; không dùng lại nhãn do chính Codex tạo.
- Reviewer cần xem regression `synth_10`, các safety misses còn lại (`synth_01`, `synth_16`), các miss baseline và ý nghĩa từng safety signal trong bối cảnh căn hộ TP.HCM.
- Cần xác nhận độc lập ranh giới `service_mismatch`/`out_of_scope`, mức clarification, và liệu latency outlier sau P2 có thể chấp nhận hay phải điều tra.
- Sau khi có corpus độc lập, phải re-attest đúng Edge source/version hiện hành, chạy canonical runner với pacing hợp lệ, rồi review regression/safety/latency.

## Risks/Limitations

- Đây là self-review circular: người tạo expected label cũng là người đánh giá corpus. Nó chỉ là diagnostic, không phải holdout và không đủ để mở khoá `kael-process`.
- Kết quả baseline/after live chịu ảnh hưởng của prompt/runtime profile theo từng arm; không quy toàn bộ delta cho electrical playbook.
- One repetition/case không đo variance hoặc stability. P2 latency outlier khoảng 199 giây cần follow-up trước performance claim.
- Deployment attestation nội dung chưa được thực hiện; version 315/316/317/318 chỉ là remote lifecycle identifiers, không thay thế source attestation.
- Chưa có native UI evidence, Deno check toàn bộ Edge function, migration SQL/RLS verification hoặc CI attestation cho exact source. API/live evaluator xanh không thay thế các gate này.
- Worktree intentionally dirty; chưa có commit/PR/merge. Đây là report/evidence của staging, không phải release artifact.

## Decision

**SYNTHETIC_DIAGNOSTIC_ONLY / NEEDS_HOLDOUT.** Live pair đã chạy thành công và cho tín hiệu dương `37.50% → 75.00%`, không lỗi request và không còn false decline trong corpus này; nhưng labels vẫn tự review, deployment chưa được content-attest, và còn regression/latency miss. Giữ `kael-process` locked; không claim production-ready và không mở Production.

## Next Step

Tu/domain reviewer cung cấp hoặc duyệt blind holdout độc lập với labels giữ ngoài runner. Khi có corpus đó, re-attest staging source/version, chạy lại canonical baseline/after đúng rate-safe config, review `synth_10`-type regressions, safety misses và latency outlier, rồi mới quyết định bước rollout tiếp theo. Không tự động unlock hoặc deploy Production từ synthetic result này.
