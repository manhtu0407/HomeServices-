# REPORT B - six-service stability matrix

Evidence tier T0. Exactly 36 scenario results (6 services x 5 scenarios + 6 shared). Each row is the first of two identical runs; the second run produced the same fingerprint in every case. Inputs, expected outcomes and gating assertions are frozen in `01-freeze/scenario-matrix.json` (sha256 `dd8392cb...a51dd7`). The assertion definitions are in the same file under `assertions`.

Verdict words: PASS = every gating assertion held; FAIL = at least one did not; BLOCKED = the step needs a tier T0 does not have. BLOCKED is never counted as PASS.

## 1. The 36 results

| ID | Service | Class | Frozen input (abridged) | BEFORE | AFTER | Change | AFTER failures |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ELEC-S1 | electrical | S1 | Mình muốn nhờ thợ kiểm tra giúp mấy ổ cắm trong phòng ngủ, cắm … | PASS | PASS | UNCHANGED | none |
| ELEC-S2 | electrical | S2 | Điện nhà mình lúc có lúc không, không biết do tủ điện hay do má… | FAIL | FAIL | UNCHANGED | asks_clarifying_question:FAIL |
| ELEC-S3 | electrical | S3 | Ổ điện cạnh bồn rửa chén bốc khói đen, có mùi khét và vừa nháy … [hazard: fire] | FAIL | PASS | IMPROVED | none |
| ELEC-S4 | electrical | S4 | Nhà mình cần thợ điện xem hệ thống đèn hành lang chập chờn. +voice (4 steps) [hazard: fire] | FAIL | FAIL | UNCHANGED | emergency_escalated_acceptable:FAIL |
| PLMB-S1 | plumbing | S1 | Vòi nước ở bồn rửa chén nhà mình bị rỉ nhỏ giọt, nhờ thợ qua xe… | PASS | PASS | UNCHANGED | none |
| PLMB-S2 | plumbing | S2 | Nước ở nhà mình chảy yếu, có lúc do ống, có lúc do máy bơm của … | FAIL | FAIL | UNCHANGED | asks_clarifying_question:FAIL |
| PLMB-S3 | plumbing | S3 | Ống nước trên trần vừa vỡ, nước chảy tràn xuống đúng chỗ hộp cầ… [hazard: electrical_water] | FAIL | PASS | IMPROVED | none |
| PLMB-S4 | plumbing | S4 | Nhà mình cần thợ nước xem giúp đường ống nước nóng ở nhà tắm. +voice (4 steps) [hazard: medical] | FAIL | FAIL | IMPROVED | http_ok:FAIL, evidence_handled:FAIL |
| CLEN-S1 | cleaning | S1 | Mình muốn đặt dọn dẹp tổng quát căn hộ hai phòng ngủ vào cuối t… | PASS | PASS | UNCHANGED | none |
| CLEN-S2 | cleaning | S2 | Mình cần dọn nhà nhưng chưa biết nên dọn tổng thể hay chỉ dọn b… | PASS | PASS | UNCHANGED | none |
| CLEN-S3 | cleaning | S3 | Thợ dọn vừa trộn nước tẩy rửa với chất tẩy toilet, giờ hai ngườ… [hazard: medical] | FAIL | PASS | IMPROVED | none |
| CLEN-S4 | cleaning | S4 | Mình muốn dọn dẹp sau khi sửa nhà, bụi xi măng nhiều lắm. +voice (4 steps) [hazard: gas] | FAIL | PASS | IMPROVED | none |
| HVAC-S1 | hvac | S1 | I need two wall-mounted air conditioners cleaned; they have not… | PASS | PASS | UNCHANGED | none |
| HVAC-S2 | hvac | S2 | Máy lạnh nhà mình không mát nhưng hôm qua mới vệ sinh xong, chắ… | PASS | PASS | UNCHANGED | none |
| HVAC-S3 | hvac | S3 | The air conditioner just exploded with a loud bang and thick bl… [hazard: fire] | FAIL | PASS | IMPROVED | none |
| HVAC-S4 | hvac | S4 | Nhà mình cần thợ kiểm tra máy lạnh phòng ngủ chạy ồn. +voice (4 steps) [hazard: fire] | FAIL | PASS | IMPROVED | none |
| UPHO-S1 | upholstery | S1 | Mình muốn giặt bộ sofa vải ba chỗ ngồi, có vài vết cà phê cũ. | PASS | PASS | UNCHANGED | none |
| UPHO-S2 | upholstery | S2 | My sofa and mattress smell strange, I do not know if it is mold… | PASS | PASS | UNCHANGED | none |
| UPHO-S3 | upholstery | S3 | Người đến giặt sofa đang đe dọa mình và không chịu rời khỏi nhà. [hazard: police] | FAIL | PASS | IMPROVED | none |
| UPHO-S4 | upholstery | S4 | Mình cần giặt rèm cửa phòng khách và tấm thảm trải sàn. +voice (4 steps) [hazard: fire] | FAIL | PASS | IMPROVED | none |
| HAND-S1 | handyman | S1 | Nhờ thợ lắp giúp một cái kệ gỗ lên tường phòng khách và treo th… | PASS | PASS | UNCHANGED | none |
| HAND-S2 | handyman | S2 | Mình muốn treo mấy cái kệ lên tường nhưng chưa chắc tường bê tô… | PASS | PASS | UNCHANGED | none |
| HAND-S3 | handyman | S3 | Thợ đang khoan tường lắp kệ thì khoan trúng dây điện, bị giật v… [hazard: medical] | FAIL | PASS | IMPROVED | none |
| HAND-S4 | handyman | S4 | Mình cần thợ sửa cánh cửa tủ bếp bị lệch và lắp thêm ngăn kéo. +voice (4 steps) [hazard: medical] | FAIL | PASS | IMPROVED | none |
| ELEC-S5 | electrical | S5 | 15 checkpoints (J01-J15) | FAIL | BLOCKED | IMPROVED | J03:BLOCKED |
| PLMB-S5 | plumbing | S5 | 15 checkpoints (J01-J15) | FAIL | BLOCKED | IMPROVED | J03:BLOCKED |
| CLEN-S5 | cleaning | S5 | 15 checkpoints (J01-J15) | FAIL | BLOCKED | IMPROVED | J03:BLOCKED |
| HVAC-S5 | hvac | S5 | 15 checkpoints (J01-J15) | FAIL | BLOCKED | IMPROVED | J03:BLOCKED |
| UPHO-S5 | upholstery | S5 | 15 checkpoints (J01-J15) | FAIL | BLOCKED | IMPROVED | J03:BLOCKED |
| HAND-S5 | handyman | S5 | 15 checkpoints (J01-J15) | FAIL | BLOCKED | IMPROVED | J03:BLOCKED |
| C1 | plumbing | C | Có người vừa bị điện giật trong phòng tắm, nằm im không nhúc nh… +voice [hazard: medical] | FAIL | PASS | IMPROVED | none |
| C2 | electrical | C | Cho mình hỏi giá sửa ổ điện, mà giờ cái ổ điện đang bốc khói và… [hazard: fire] | FAIL | PASS | IMPROVED | none |
| C3 | plumbing | C | Căn hộ mình đang có lửa cháy ở phòng bếp, khói đen dày đặc. [hazard: fire] | FAIL | PASS | IMPROVED | none |
| C4 | plumbing | C | Căn bếp nhà mình đang bốc cháy dữ dội. x3 closed statuses [hazard: fire] | FAIL | PASS | IMPROVED | none |
| C5 | plumbing | C | Mình ngửi thấy mùi gas nồng ở bếp. +voice [hazard: mixed] | FAIL | PASS | IMPROVED | none |
| C6 | electrical | C | Ổ cắm trong phòng khách đang bốc khói và có lửa. (2 steps) [hazard: fire/fire] | FAIL | PASS | IMPROVED | none |

## 2. Per-service verdict by tier

A service is FAIL if any of its S1-S5 scenarios FAIL, BLOCKED if none fails but any is BLOCKED, PASS otherwise. The six shared scenarios (C1-C6) are cross-service and all PASS in AFTER; they are listed separately and are not folded into any one service.

| Service | T0 S1 | T0 S2 | T0 S3 | T0 S4 | T0 S5 | T0 verdict BEFORE | T0 verdict AFTER | T1 | T2 | T3 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Electrical | PASS > PASS | FAIL > FAIL | FAIL > PASS | FAIL > FAIL | FAIL > BLOCKED | FAIL | FAIL | NOT_RUN | NOT_RUN | NOT_RUN |
| Plumbing | PASS > PASS | FAIL > FAIL | FAIL > PASS | FAIL > FAIL | FAIL > BLOCKED | FAIL | FAIL | NOT_RUN | NOT_RUN | NOT_RUN |
| Cleaning | PASS > PASS | PASS > PASS | FAIL > PASS | FAIL > PASS | FAIL > BLOCKED | FAIL | BLOCKED | NOT_RUN | NOT_RUN | NOT_RUN |
| Air conditioning (HVAC) | PASS > PASS | PASS > PASS | FAIL > PASS | FAIL > PASS | FAIL > BLOCKED | FAIL | BLOCKED | NOT_RUN | NOT_RUN | NOT_RUN |
| Sofa/mattress/curtain/carpet | PASS > PASS | PASS > PASS | FAIL > PASS | FAIL > PASS | FAIL > BLOCKED | FAIL | BLOCKED | NOT_RUN | NOT_RUN | NOT_RUN |
| Minor repair/installation | PASS > PASS | PASS > PASS | FAIL > PASS | FAIL > PASS | FAIL > BLOCKED | FAIL | BLOCKED | NOT_RUN | NOT_RUN | NOT_RUN |

| Shared | BEFORE | AFTER |
|---|---|---|
| C1 voice-only on an existing session | FAIL | PASS |
| C2 emergency in a price-question turn | FAIL | PASS |
| C3 invalid schedule plus emergency | FAIL (400, no guidance) | PASS (2xx, no schedule stored) |
| C4 closed Case (confirmed, abandoned, unsupported) | FAIL x3 | PASS x3 as scored: the number is present in the response and the Case is unchanged. Delivered in a 409 whose body also carries a structured `emergency` field the client reads (DX-04) |
| C5 gas + shock + smoke across three fields | FAIL | PASS (112) |
| C6 write failure and retry | FAIL | PASS as frozen; the real failure path is SUPP-C6b |

T1 (PostgreSQL: RLS, grants, locks, atomicity), T2 (multi-actor and deployed parity) and T3 (native device) are **NOT_RUN for every service**. No service has a PASS at any tier above T0.

## 3. Workflow and Stage mapping

The Customer -> Kael -> Booking -> Matching -> Worker -> Completion map, the authoritative state owner for every transition, the Worker UI stages against persisted statuses, and the per-service profile, gates, hazards and coverage are in `04-workflows/SIX_SERVICE_WORKFLOW_MAPS.md`. The short version:

- 18 `jobs.status` values, 20 `WORKFLOW_PHASES` (STRUCTURES documents 19), 11 Worker UI stage slots over 10 distinct screens. The mapping is many-to-many: stage 5 spans arrived/inspecting/repairing, stage 4 spans worker_matched/worker_on_way, stages 6 and 7 are both `scope_change_pending`, stages 10 and 11 share a screen id, and five statuses have no Worker stage.
- The lifecycle code (`lifecycle.ts`, `workflow-orchestrator.ts`) is byte-identical in BEFORE and AFTER, so KAWA_01 did not change a state machine. It changed who may call the endpoints (D-03, D-04) and added the emergency gate.
- The service profile registry (profile ids, gates, capabilities) is identical in both snapshots.

## 4. Reproduced defects

| ID | Service / stage | Class | Severity | Summary |
|---|---|---|---|---|
| DX-01 | electrical, plumbing (any) / Case turn | PRE-EXISTING | P1 | Mentioning an appliance (washing machine, water heater, building pump) as a suspected cause triggers `OUT_OF_SCOPE_KEYWORDS`; Kael declines a legitimate request with zero provider calls and the Case becomes `unsupported`, which is a permanent end by design (migration X1), so one false keyword hit is unrecoverable (CONFIRMED in source and in 3 reproductions) |
| DX-02 | electrical / S4 final turn | PRE-EXISTING family, NEW instance | P0 for any recall claim | "tủ điện nóng rát tay, mùi khét, tia lửa xẹt sau cánh tủ": no cue matched; the pipeline answered with a price-lookup message. Same defect family as the H5 misses (PARTLY CONFIRMED: the exact missing cue is a hypothesis) |
| DX-03 | hvac, plumbing, upholstery / flagged playbook path | NEW interaction | P1 if any flag is on in Production | With playbook flags on, AFTER's gate defers to the flagged path and 4 of 21 hazard steps lose their number. Production flag state is UNKNOWN |
| DX-04 | all / closed Case and failed writes | KAWA_01 residual, largely addressed | P2 (was P1 before the final remediation) | AFTER returns `emergency: {version, route}` in the error envelope and the client renders local VI/EN copy from it (mobile P418, 29/29 run here). Residual: native rendering, a real network failure and older client builds are UNVERIFIED; the 429 new-Case quota case (ledger N-02) was not re-tested |
| DX-05 | all / S4 corrections | UNVERIFIED | - | Understanding of corrections needs a live model |
| DX-06 | all / persistent write failure | NEW (minor) | P3 | `total_turns` lags the row count until the retry heals it |
| DX-07 | all / failure observability | FIXED for emergencies | P2 | BEFORE leaves no warn/error line when a reply write fails |
| G6 | docs | PRE-EXISTING | P2 | STRUCTURES 12.2/12.3/12.1 disagree with the code: event names, event count (24 documented, 21 in code), open payment-skip gap (closed in code), phase count (19 against 20) |

Fixed by KAWA_01 and visible here: admin accepting the customer's intake decision (J04), admin submitting evidence for the customer (J05), admin reaching the durable worker-accept RPC (J11), the invalid-schedule 400 that swallowed an emergency (C3), no emergency path on the Case turn (S3, S4, C1, C2, C5), no trace and no recovery for a failed emergency write (C6, SUPP-C6b).

## 5. Existing regression coverage per service

Static counts of test files whose source contains the service string. These are proxies for attention, not coverage measurements.

| Service | API pillar files | Mobile test files | Shared test files | Note |
|---|---|---|---|---|
| Electrical | 26 | 42 | 10 | `mobile-api-kael-electrical-intake-policy.test.ts` has the richest electrical intake phrasings but is **not collected** by Vitest (collection is `*-pillar.test.ts` only), so it protects nothing |
| Plumbing | 41 | 30 | 8 | |
| Cleaning | 13 | 16 | 6 | no Case-world pillar builds a cleaning Case |
| HVAC | 28 | 17 | 7 | the only service with several Case-world pillars (S01 incident, P392) |
| Upholstery | 9 | 8 | 5 | lowest |
| Handyman | 17 | 18 | 5 | |

Regression protection for previously repaired defects: the API-side recurring-incident pillars (P392 Case context, P398 stateful E2E with its D1/D2) are in the existing suite and passed in BEFORE and AFTER (0 failed across the full API run). The mobile-side pillars of the same incidents (for example P397 quote-blocker card, P399 client parity) were not run in this diagnostic. KAWA_01's own defects D-01..D-04 are pinned by P411-P414, which exist only in AFTER. **DX-01 has no regression protection at all**: no collected pillar sends an in-scope request that mentions an appliance through the boundary guard (the appliance phrasings in collected pillars exercise only the emergency classifier).

## 6. What this matrix cannot say

It cannot say a service works in Production, that Kael asks good questions (model stubbed), that corrections are understood, that approvals are atomic or isolated by RLS, that payment works, or that any Worker or Customer screen renders correctly. Those are T1/T2/T3 and were not run.
