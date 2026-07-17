# Codex Guide — Nâng năng lực Kael bằng Playbook, Policy và Eval

**Trạng thái:** Hướng dẫn đề xuất sau khi rà soát PR #116  
**Vị trí đề xuất trong repo:** `docs/playbooks/codex-kael-capability-guide.md`  
**Đối tượng:** Codex, Claude Code và người duyệt kỹ thuật/domain  
**Phạm vi:** Sáu service hiện tại của Kael; ưu tiên `electrical` trước

---

## 1. Quan điểm ngắn gọn

Đây **không phải huấn luyện trọng số mô hình**. Đây là quá trình nâng năng lực sản phẩm bằng cách kết hợp:

1. **Policy xác định bằng code** cho luật cứng, an toàn và ranh giới dịch vụ.
2. **Playbook cô đọng** cho suy luận mềm, cách hỏi và kiến thức nghiệp vụ.
3. **LLM** cho phần mơ hồ, ngôn ngữ tự nhiên và tổng hợp.
4. **Eval độc lập** để chứng minh thay đổi thật sự tốt hơn.
5. **Dữ liệu vận hành đã được duyệt** để mở rộng chương trình học theo thời gian.

PR #116 đã xây được vòng lặp `soạn → chưng cất → bật cờ → chạy eval → so delta`. Đây là hạ tầng đúng hướng.

Tuy nhiên, thí nghiệm hiện tại cũng cho thấy một kết luận quan trọng:

> Chèn một playbook dài vào system prompt không đồng nghĩa Kael sẽ làm theo, đặc biệt khi model runtime yếu hoặc prompt gốc có luật xung đột.

Vì vậy, **không nhân bản playbook điện sang năm service còn lại ngay**. Trước hết phải làm cho electrical có cải thiện đo được bằng kiến trúc hybrid.

---

## 2. Điều Codex phải coi là sự thật hiện tại

- Baseline đáng tin hiện tại chủ yếu là `scope_signal` ở lượt đầu.
- Baseline routing của electrical khoảng 70% trên tập nhỏ.
- Playbook đã được bật và xác nhận có mặt trong prompt staging.
- Các gap routing được thử sau khi bật playbook vẫn gần như không đổi.
- `problem_slug`, `safety_signals`, complexity và chất lượng báo giá chưa được chứng minh đầy đủ qua harness hiện tại.
- Tập 24 case là **smoke/regression set**, chưa phải bằng chứng production.
- Textbook electrical vẫn có các quyết định domain và product-policy cần con người xác nhận.
- Không được tuyên bố “Kael thông minh hơn” khi chưa có raw report before/after và holdout độc lập.

---

## 3. Vấn đề kiến trúc cần sửa trước

### 3.1 Luật prompt đang tự mâu thuẫn

Prompt intake hiện có ý tương đương:

- Chỉ hỏi khi mô tả thật sự quá mơ hồ.
- Nhưng đồng thời yêu cầu mọi `quote_driver` phải có dữ kiện trước khi `needs_clarification=false`.

Electrical có nhiều `quote_driver`; phần lớn câu mở đầu của khách không thể cung cấp đủ tất cả. Điều này đẩy model về hành vi hỏi liên tục, trái với nhiều nhánh playbook mong muốn chốt sớm.

**Hướng sửa:** tạo luật slot tối thiểu theo `service + problem_slug + work_mode`, bằng code hoặc dữ liệu có schema. Không dùng luật “phải đủ toàn bộ quote drivers”.

Ví dụ:

```ts
type RequiredSlotPolicy = {
  serviceType: string;
  problemSlug: string;
  minimumSlots: readonly string[];
  optionalSlots: readonly string[];
  estimateWithoutPhoto: boolean;
};
```

Model chỉ hỏi khi thiếu một slot **thật sự quyết định** cho nhánh hiện tại.

### 3.2 Hard policy đang được giao quá nhiều cho LLM

Các ranh giới sau nên có độ xác định cao:

- Cúp điện cả tầng/khu vực chung → tòa nhà/BQL.
- Trạm sạc xe điện, điện ba pha công nghiệp → ngoài phạm vi hiện tại.
- Treo TV thuần túy → handyman.
- Máy lạnh hỏng phần máy → HVAC.
- Bình nóng lạnh rò nước, phần điện vẫn bình thường → plumbing.
- Phần dây/tủ điện/cầu dao → electrical.

Đây là taxonomy và product policy, không phải bài toán sáng tạo ngôn ngữ. Đưa toàn bộ vào prompt khiến hành vi xác suất và khó kiểm soát.

### 3.3 Eval đang đo gián tiếp

Runner hiện suy ra `service_mismatch` hay `out_of_scope` từ nội dung câu lỗi. Đây là phép đo dễ vỡ khi copy thay đổi. `suggested_service` cũng chưa được chấm.

**Hướng sửa:** staging/eval phải đọc trực tiếp structured output đã sanitize:

```ts
type IntakeEvalObservation = {
  scopeSignal: "in_scope" | "out_of_scope" | "service_mismatch";
  suggestedService: string | null;
  problemSlug: string | null;
  needsClarification: boolean;
  safetySignals: string[];
  modelId: string;
  promptVersion: string;
  playbookVersion: string | null;
};
```

Không expose dữ liệu nhạy cảm; chỉ expose contract field cần chấm.

### 3.4 Ground truth còn vòng tròn

Case được sinh từ playbook rồi dùng để chứng minh model làm đúng playbook. Điều đó có thể đo **độ tuân thủ playbook**, nhưng chưa chứng minh playbook đúng với thực tế.

Mỗi service cần ba nguồn nhãn:

- Quy tắc product/taxonomy đã được Tu duyệt.
- Domain review từ người có kinh nghiệm nghề.
- Case thật đã ẩn danh, có kết quả sau công việc hoặc adjudication.

Không để cùng một agent vừa viết playbook, vừa viết toàn bộ expected, vừa tự kết luận pass.

### 3.5 Runtime artifact bị sao chép thủ công

Appendix trong Markdown và constant TypeScript có thể lệch nhau theo thời gian.

Phải có một trong hai cách:

- Một nguồn có cấu trúc sinh ra runtime segment và tài liệu; hoặc
- Script trích Appendix A, tính hash và CI fail khi constant không khớp.

Ngoài ra CI phải kiểm tra các slug, signal, enum và slot key vẫn tồn tại trong code contract.

---

## 4. Kiến trúc dài hạn được khuyến nghị

```text
Customer input
    │
    ▼
A. Normalize + deterministic safety scan
    │
    ▼
B. High-precision hard scope router
    │   ├─ quyết định chắc chắn → structured decision
    │   └─ chưa chắc → tiếp tục
    ▼
C. Candidate slug/work-mode selector
    │
    ▼
D. Chọn playbook nhỏ đúng service + candidate
    │
    ▼
E. LLM suy luận phần mơ hồ
    │
    ▼
F. Schema validator + policy validator + deterministic repair
    │
    ▼
G. Response/advisory + telemetry
```

### A. Safety scan độc lập

Safety không nên phụ thuộc hoàn toàn vào việc model có nhớ prompt hay không.

- Dùng normalization tiếng Việt có dấu/không dấu.
- High-precision lexical/rule scan phát hiện tín hiệu rõ.
- LLM có thể bổ sung tín hiệu từ ngữ cảnh.
- Kết quả cuối là union đã validate theo contract.
- Critical safety miss là hard failure trong eval.

### B. Hard scope router

Chỉ xử lý rule có precision cao. Khi không chắc, trả `null` để model xử lý.

```ts
type HardRoutingDecision = {
  scopeSignal: "out_of_scope" | "service_mismatch";
  suggestedService: string | null;
  reasonCode: string;
};

function applyHardRoutingPolicy(input: NormalizedIntake): HardRoutingDecision | null;
```

Mỗi `reasonCode` phải có unit test và telemetry count.

### C. Playbook nhỏ, đúng ngữ cảnh

Không chèn toàn bộ textbook hoặc toàn bộ service tree vào mọi request.

Sau khi xác định candidate:

- Inject contract chung ngắn.
- Inject safety rules cần thiết.
- Inject một hoặc vài nhánh liên quan.
- Dùng version/hash ổn định.
- Đo token, latency và cache thực tế; không giả định.

### D. Model theo độ khó

- Model rẻ xử lý case rõ, sau hard router.
- Case mơ hồ, xung đột hoặc safety-sensitive có thể escalate sang model mạnh hơn.
- Escalation phải do policy/code quyết định, có budget và telemetry.
- Không dùng model mạnh để che một taxonomy chưa rõ.

### E. Validator sau model

Validator phải kiểm tra:

- Enum/string đúng contract.
- Không invent `profile_facts`.
- Không có giá do LLM tự đặt.
- Clarification question qua hard filter.
- Scope và suggested service nhất quán.
- Safety signal hợp lệ.
- Không vi phạm language/self-check.

Khi có lỗi, ưu tiên deterministic repair; chỉ gọi lại model khi không thể sửa an toàn.

---

## 5. Mục tiêu khác nhau theo service

Không dùng một template “diagnostic tree” cho mọi dịch vụ.

| Service profile | Mục tiêu chính | Metric quan trọng |
|---|---|---|
| `electric_diagnose` | Phân loại lỗi, safety, phạm vi thợ | safety recall, routing, slug, câu hỏi |
| `water_diagnose` | Nguồn rò/tắc, mức độ thiệt hại, isolation | damage/safety recall, routing, diagnosis |
| `clean_scope` | Phạm vi phòng, độ sâu, bề mặt, thiết bị | scope completeness, clarification efficiency |
| `air_scope` | Work mode, thiết bị, triệu chứng, tiếp cận | mode/route accuracy, scope completeness |
| `fabric_scope` | Vật liệu, số lượng, tình trạng, phương pháp | material/scope accuracy |
| `task_scope` | Phân loại việc nhỏ, lắp đặt, vật tư, access | task routing, parts/access completeness |

“Kael tốt hơn” phải được định nghĩa riêng cho từng profile.

---

## 6. Hệ thống eval đúng chuẩn

### 6.1 Bốn tập dữ liệu tách biệt

1. **Authoring examples**  
   Ví dụ dùng khi viết rule/playbook. Không dùng làm số liệu cuối.

2. **Development set**  
   Cho Codex chạy nhanh khi sửa code.

3. **Blind holdout**  
   Codex không được đọc expected trước khi hoàn thành thay đổi. Chỉ evaluator/human giữ nhãn.

4. **Shadow production set**  
   Case thật đã ẩn danh, không tác động khách, dùng để theo dõi drift.

### 6.2 Case phải phản ánh runtime thật

Mỗi case nên hỗ trợ:

```json
{
  "id": "el_xxx",
  "initial_message": "...",
  "user_turns": [
    {"when_asked_for": "breaker_state", "reply": "..."},
    {"when_asked_for": "photo", "fixture": "images/el_xxx_breaker.jpg"}
  ],
  "expected": {
    "scope_signal": "in_scope",
    "suggested_service": null,
    "acceptable_problem_slugs": ["breaker_trip"],
    "required_safety_signals": ["protective_device"],
    "forbidden_safety_signals": [],
    "max_clarification_turns": 1
  }
}
```

Không gửi lại cùng một đoạn `detail` cho mọi câu hỏi. Harness phải trả lời đúng slot model vừa hỏi.

### 6.3 Metric bắt buộc

Không chỉ dùng overall pass rate.

**Routing**

- Accuracy và macro-F1.
- Confusion matrix theo `in_scope / out_of_scope / service_mismatch`.
- Accuracy của `suggested_service`.
- Tỷ lệ false decline của job hợp lệ.

**Safety**

- Recall cho từng critical signal.
- Số critical miss tuyệt đối.
- False-positive rate.
- Thứ tự advisory có đúng safety-first hay không.

**Conversation**

- Tỷ lệ clarification.
- Số lượt trung bình trước quyết định.
- Repeated-question rate.
- Generic-question fallback rate.

**Diagnosis/scope**

- Slug/work-mode accuracy.
- Slot completeness.
- Complexity agreement.
- Scope-change prediction recall sau khi có dữ liệu on-site.

**Operations**

- p50/p95 latency.
- Token và cost theo purpose/model.
- Escalation rate.
- Schema-repair/retry rate.

### 6.4 Chạy lặp để đo độ ổn định

Một lần/case không đủ cho hệ thống xác suất.

- Chạy nhiều mẫu trên case quan trọng.
- Ghi model ID, sampling config và provider.
- Báo consistency rate.
- Với safety, đánh giá theo worst run, không chỉ trung bình.

### 6.5 Run manifest bắt buộc

Mỗi report phải ghi:

```json
{
  "git_sha": "...",
  "deployment_version": "...",
  "model_id": "...",
  "prompt_version": "...",
  "playbook_version": "...",
  "playbook_hash": "...",
  "feature_flags": {"electrical_playbook": true},
  "corpus_version": "...",
  "run_mode": "staging",
  "started_at": "...",
  "repetitions": 3
}
```

Khi playbook thay đổi, prompt version hoặc playbook hash trong telemetry phải thay đổi.

---

## 7. Release gate

Với corpus còn nhỏ, chỉ được gọi kết quả là “tín hiệu thử nghiệm”. Khi có holdout đủ lớn, dùng gate sau:

### Hard gates

- Không có critical safety miss.
- Không vi phạm price authority, PII, autonomy hoặc language guardrail.
- Contract/schema tests pass.
- Không tăng false decline ở service hợp lệ vượt ngưỡng đã duyệt.
- Raw before/after artifacts được lưu.

### Quality gates

- Routing macro-F1 tăng có ý nghĩa và lặp lại qua nhiều run.
- Không category nào tụt nghiêm trọng dù overall tăng.
- Clarification turns không tăng vô lý.
- Latency/cost nằm trong budget.
- Human review xác nhận những case thay đổi là đúng nghiệp vụ.

### Rollout

1. Offline.
2. Staging.
3. Shadow.
4. Canary nhỏ.
5. Mở rộng dần.
6. Có kill switch và rollback.

Không bật toàn bộ service chỉ vì một tập dev tăng điểm.

---

## 8. Chương trình làm việc đề xuất cho Codex

### P0 — Evidence và vệ sinh môi trường

- Xác minh trạng thái thực của flag staging.
- Xóa function debug tạm nếu còn.
- Thu hồi credential/token từng bị lộ.
- Lưu hoặc tái tạo raw after-eval.
- Đồng bộ `docs/playbooks/INDEX.md`, progress log và trạng thái textbook.
- Không tuyên bố cleanup khi chưa kiểm tra thật.

### P1 — Làm phép đo đáng tin

- Expose structured eval observation trên staging/test path.
- Chấm trực tiếp `scope_signal` và `suggested_service`.
- Thêm run manifest.
- Thêm repeated runs.
- Tách dev set và blind holdout.
- Bổ sung confusion matrix và per-category metrics.

### P2 — Gỡ xung đột slot/clarification

- Audit `buildIntakeDiagnosisMessages`.
- Thay luật “đủ mọi quote driver” bằng minimum slot policy.
- Viết contract tests cho các case chốt sớm và case phải hỏi.
- Đảm bảo model không hỏi lại dữ kiện đã có.

### P3 — Deterministic safety + hard routing

Bắt đầu từ các gap đã biết, nhưng không hardcode theo một câu exact.

- Normalize accent/typo.
- Rule theo semantic signal có precision cao.
- Unit test positive, negative và adversarial.
- Safety scan chạy trước scope route.
- Unknown trả về model, không ép quyết định.

### P4 — Modular playbook compiler

- Chọn một source of truth có schema.
- Sinh runtime snippet hoặc kiểm tra hash tự động.
- Validate token contract với code.
- Chỉ inject nhánh liên quan.
- Ghi version/hash trong telemetry.

### P5 — Multimodal harness

- Fixture ảnh/video an toàn, không chứa PII.
- Test luồng model yêu cầu ảnh.
- Đánh giá cả trường hợp không có ảnh.
- Không để “cần ảnh” trở thành lý do hỏi vô hạn.

### P6 — Dữ liệu học dài hạn

Nguồn signal sau job:

- Worker xác nhận/chỉnh problem category.
- Scope change reason.
- Parts/access thực tế.
- Kết quả completion checklist.
- Customer correction hoặc dispute.
- Safety finding thực tế.

Pipeline học:

```text
event thật
→ sanitize + aggregate
→ candidate lesson
→ human/domain review
→ cập nhật policy/playbook/corpus bằng PR
→ offline eval
→ staging/shadow/canary
→ release hoặc revert
```

Không cho Kael tự sửa prompt hoặc policy trực tiếp trong production.

### P7 — Mở rộng service

Chỉ mở service kế tiếp khi electrical đạt gate. Ưu tiên theo volume, risk và khả năng có ground truth; không theo việc playbook nào dễ viết nhất.

---

## 9. Task đầu tiên nên giao cho Codex

```text
Mục tiêu:
Làm cho routing electrical có cải thiện đo được mà không phụ thuộc vào việc
DeepSeek ghi nhớ một prompt dài.

Phạm vi:
1. Audit xung đột needs_clarification/quote_drivers.
2. Tạo minimum-slot policy theo problem slug.
3. Tạo safety pre-scan và hard scope router có precision cao cho các policy
   đã được Tu duyệt.
4. Nâng eval để đọc structured fields, chấm suggested_service và xuất
   confusion matrix + run manifest.
5. Chạy baseline trước khi đổi, rồi chạy after trên dev set.
6. Không dùng holdout để tune.
7. Không deploy hoặc bật flag khi chưa có Tu phê duyệt.

Deliverables:
- Code và narrow tests.
- Raw baseline/after JSON.
- Báo cáo delta theo từng metric.
- Danh sách policy/domain assumption cần Tu xác nhận.
- Risks và rollback plan.

Không làm:
- Không tạo playbook cho service mới.
- Không đổi price authority.
- Không tự tạo ground truth domain.
- Không tuyên bố production-ready từ 24 synthetic cases.
```

---

## 10. Quy trình Codex phải tuân thủ cho mọi thay đổi Kael

1. Đọc `AGENTS.md`, governance cần thiết, code contract và guide này.
2. Viết một hypothesis kiểm chứng được.
3. Chỉ rõ metric mục tiêu và regression guard.
4. Chụp baseline trước khi sửa.
5. Thực hiện thay đổi nhỏ nhất giải quyết hypothesis.
6. Chạy static/contract/unit eval.
7. Chạy dev corpus; không xem/tune bằng blind holdout.
8. Nhờ evaluator/human chạy holdout.
9. Lưu raw artifacts và manifest.
10. Chỉ đề xuất rollout khi gate pass.
11. Sau rollout, theo dõi drift và rollback khi cần.

Mỗi PR chỉ nên trả lời một câu hỏi rõ, ví dụ:

> “Minimum-slot policy có giảm hỏi thừa mà không làm giảm routing và safety không?”

Không trộn thay prompt, thay model, thay corpus và thay routing code trong cùng một thí nghiệm; nếu trộn, delta không còn khả năng quy nguyên nhân.

---

## 11. Definition of Done cho một service

- Product taxonomy và policy đã được owner duyệt.
- Domain assumption quan trọng đã được chuyên gia hoặc bằng chứng xác nhận.
- Source playbook và runtime artifact không thể drift im lặng.
- Contract tests và safety tests pass.
- Dev set tốt hơn.
- Blind holdout tốt hơn, không safety regression.
- Multimodal path được test khi runtime yêu cầu evidence.
- Cost/latency nằm trong budget.
- Raw reports, version/hash và deployment SHA có thể audit.
- Canary ổn định.
- Status board cập nhật đúng sự thật.
- Có rollback và kill switch.

---

## 12. Mẫu báo cáo cuối của Codex

```text
Hypothesis:
...

Changed:
...

Baseline:
...

After:
...

Delta:
- routing macro-F1:
- suggested-service accuracy:
- critical safety misses:
- clarification turns:
- p95 latency:
- cost/case:

Verification actually run:
...

Human/domain review still required:
...

Risks/Limitations:
...

Decision:
KEEP | REVISE | REVERT | NEEDS_HOLDOUT

Next Step:
...
```

---

## Kết luận

Playbook vẫn có giá trị, nhưng nên là **tài liệu tri thức và input có chọn lọc**, không phải nơi chứa mọi luật cứng.

Con đường bền vững cho Kael là:

> **Code kiểm soát điều bắt buộc; playbook cung cấp kiến thức; model xử lý phần mơ hồ; eval và dữ liệu thật quyết định có được phát hành hay không.**

Đó là “training Kael” theo nghĩa sản phẩm: năng lực tăng dần, có bằng chứng, có review và có thể rollback.
