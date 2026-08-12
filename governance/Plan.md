# NestScout — Plan

Plan.md là **contract để viết plan thực thi**, không phải kho lưu plan cũ. File chứa đúng bốn khối: luật dùng file (A), từ vựng trạng thái (B), template để copy (C), luật viết (D). Plan đang sống viết nối tiếp bên dưới D.

Audience: AI coding agent (Claude Code hoặc Codex) thực thi, Tu duyệt và review. Plan không phải tài liệu marketing — mỗi phase phải xuất ra evidence chạy thật, không phải claim suông.

> **Lịch sử §0–§50** — kế hoạch từ 2026-05-20 đến 2026-08-05, 17.831 dòng — đã chuyển **nguyên văn** sang [`plan-archive/2026-05-20_workflow-enhancement.md`](plan-archive/2026-05-20_workflow-enhancement.md). Mọi tham chiếu dạng `Plan.md §N` với N ≤ 50 trỏ vào file đó. Số §0–§50 đã tiêu, không tái sử dụng — plan mới bắt đầu từ **§51**.

---

## A. Plan.md là gì

- **Một plan sống tại một thời điểm.** Plan mới thay plan cũ, không nối đuôi. Hai việc song song = hai file, không phải hai section.
- **Xong là rời đi.** Status chuyển `DONE #<PR>` → chuyển nguyên section sang `governance/plan-archive/<YYYY-MM-DD>_<slug>.md`, Plan.md quay về chỉ còn A–D. Đây là luật ngăn file phình lại 17k dòng.
- **`Plan ID` là danh tính, số `§` chỉ là chỗ ngồi.** Plan ID (`plan-<slug>-<YYYYMMDD>`) là duy nhất toàn cục và có ngay từ lúc viết dòng đầu. Số `§` **chỉ được cấp khi plan vào ở trong Plan.md** — mà mỗi lúc chỉ có một plan ở trong đó, nên mỗi lúc chỉ có một số đang được cấp. Plan viết song song ở file riêng **không mang số `§`**; nó dùng Plan ID cho tới lượt vào Plan.md. Không cần sổ đăng ký, không có hai người cùng nhận một số.
- **Số section không tái sử dụng**, kể cả khi plan bị `ABANDONED`. Dùng lại số cũ là cách "§44" từng mang ba nghĩa khác nhau trong ba commit khác nhau.
- **Plan.md thua `RULES.md` và `critical.md`.** Conflict thì dừng, báo, hỏi Tu — không tự chọn nguồn tiện hơn.
- **Không sửa plan giữa chừng.** Phát hiện phải đổi → bump version ở Change Log hoặc viết addendum, không edit im lặng.

Scope sản phẩm, runtime boundary, và autonomy gate **không** được viết lại trong plan. Nguồn canonical là `RULES.md` #0/#6/#7; plan chỉ trỏ tới.

---

## B. Status vocabulary

Status là enum. Không viết văn xuôi.

| Status | Nghĩa | Bắt buộc kèm |
|---|---|---|
| `DRAFT` | đang viết, quyết định chưa chốt hết | — |
| `LOCKED` | chốt hết, chờ Tu nói "go" | Decision Log không còn dòng `OPEN` |
| `EXECUTING` | đang chạy | tên branch |
| `DONE` | đã merge vào `main` | **số PR** — ví dụ `DONE #144` |
| `ABANDONED` | bỏ | một dòng lý do |

`DONE` không có số PR thì không phải `DONE`. Trạng thái trung gian — "đã chạy xong nhưng chưa commit", "chờ Tu duyệt lần cuối" — thuộc `EXECUTING`; viết chi tiết ở dòng trạng thái dưới blockquote, không đẻ status mới.

---

## C. Template

Copy nguyên khối dưới đây khi viết plan mới. Mọi mục là **bắt buộc**, kể cả với task nhẹ — không có bản rút gọn.

````markdown
## <N>. <Tiêu đề ngắn> — <YYYY-MM-DD>

> **Trigger.** Tu yêu cầu gì, trong phiên nào, trên nhánh nào. Audit chạy ở đâu (trong chat
> hay thành file riêng).
> **Freshness check (<ngày>, chạy ngay trước khi viết section này).** `git status` ·
> `git merge-base --is-ancestor` cả hai chiều so với `main` · baseline đo THẬT (số test
> pass/skip/fail + exit code). Không đo được thì ghi "CHƯA ĐO ĐƯỢC" + lý do — cấm đoán.
> **<STATUS>.** Một dòng: đang ở đâu, chờ gì.

### <N>.0 Metadata

```text
Plan ID:        plan-<slug>-<YYYYMMDD>
Created:        <YYYY-MM-DD>
Owner:          Manh Tu
Branch:         <nhánh duy nhất — không nhảy nhánh giữa chừng>
Status:         <enum mục B>
Mốc:            HEAD <sha> · dải đã merge #1 → #<n>
Trigger:        <1-2 dòng>
Scope:          <làm gì>
Out of scope:   <KHÔNG làm gì — viết ra, đây là cái chặn scope creep>
Effort:         <số increment / phase>
Authority:      RULES #<...> · STRUCTURES §<...> · protocols/<...>.md
Skill mapping:  <skill nào cho phase nào>
```

### <N>.0.1 Pre-Plan Deep-Read

File BẮT BUỘC đọc trước khi sửa dòng đầu tiên. Ghi đường dẫn đầy đủ từ root repo.

### <N>.0.2 Decision Log

| # | Quyết định | Ai chốt | Ngày | Lý do |
|---|---|---|---|---|
| D1 | ... | Tu / Claude | <ngày> | ... |

`✔` = Tu đã chốt · `OPEN` = đang chặn. Còn dòng `OPEN` thì **không được** sang `EXECUTING`.

### <N>.0.3 DoD Gates

| Gate | Đo bằng lệnh | Pass = |
|---|---|---|
| G1 | `<lệnh chạy được>` | `exit 0` + <số cụ thể> |

Mỗi gate là một lệnh chạy được cộng exit code, không phải mô tả. **Cấm gate phát biểu kiểu
"những file này không bị đụng"** — đo `exit 0` của suite, không đo diff rỗng.

### <N>.0.4 Execution Continuity

Chạy non-stop hết plan, hay dừng xin duyệt ở từng phase. Nói rõ một lần, không để mơ hồ.

### <N>.1 … <N>.k  Phase

Mỗi phase ghi: increment + thứ tự chạy + file đụng tới (full path) + rủi ro + cách verify riêng.

### <N>.<x> Verification

Dán kết quả THẬT đã chạy. Không chạy được thì ghi "KHÔNG CHẠY ĐƯỢC + lý do", không claim xanh.

### <N>.<y> Change Log

| Ver | Ngày | Ai | Đổi gì |
|---|---|---|---|
| 0.1 | <ngày> | <ai> | viết lần đầu |
````

---

## D. Luật viết plan

Mười luật. Mỗi luật là một lỗi đã trả giá thật trong §0–§50.

1. **Status theo enum mục B.** Văn xuôi tự do là lý do bảy section từng ghi sai trạng thái so với `main` — có section ghi "chưa execute" trong khi việc đã merge.
2. **`DONE` phải kèm số PR.** Không có số thì chưa xong.
3. **Freshness check đo thật.** Không đo được thì viết ra, cấm suy đoán baseline.
4. **Gate đo bằng exit code.** Gate phát biểu kiểu "những file này không bị đụng" từng báo xanh trong khi suite đang đỏ.
5. **Đường dẫn ghi full path từ root repo** — `supabase/functions/mobile-api/_shared/kael/types.ts`, không viết tắt `kael/types.ts`.
6. **Trạng thái trước khi move phải đánh dấu `(before)`.** Không đánh dấu thì phiên sau tưởng đó là đường dẫn hiện hành.
7. **Không hardcode scope sản phẩm vào plan.** Scope canonical ở `RULES.md` #6. Plan cũ khoá "3 dịch vụ" trong một section tự dán nhãn *locked*, và nó nằm lại đó nhiều tháng sau khi scope đã thành sáu.
8. **`Out of scope` là mục bắt buộc**, không phải tuỳ chọn.
9. **Plan xong thì archive**, không để lại "cho có lịch sử".
10. **Không tham chiếu `Plan.md §N` trong source code.** `kael-core-hygiene` cấm; traceability đi qua commit và PR.

---

Plan đang sống viết từ đây xuống, bắt đầu từ **§51**.
