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

---

## 51. React Doctor triage — shadow cross-platform + hook hygiene — 2026-08-12

> **Trigger.** Tu yêu cầu chạy React Doctor quét toàn bộ codebase, lọc ra warning nào là bug
> thật ảnh hưởng Production, nhóm theo độ rủi ro, **không fix**. Audit đã chạy trong phiên
> `claude/react-doctor-audit-zrlda5`, kết quả nén nguyên vào §51.0.7 của chính plan này —
> không đẻ file audit riêng.
> **Freshness check (2026-08-12, chạy ngay trước khi viết section này).**
> `git status` → sạch, 0 file thay đổi · `git merge-base --is-ancestor` **cả hai chiều**
> giữa `origin/main` và `HEAD` → **YES/YES**, nhánh đang đứng đúng bằng `origin/main`,
> không lệch · HEAD `3a60840d` = merge PR #194 · dải đã merge #1 → #194.
> Baseline đo thật: `react-doctor@0.5.8` full scan **387 issues** (Bugs 241 · Performance 91 ·
> Maintainability 55) trên 977 file / 2 project. `jest` mobile **đo xong, xanh: 119 suite /
> 1116 test / 0 fail / `exit 0` / 125s**. `tsc` mobile **CHƯA ĐO ĐƯỢC bằng gate thật** — lý do
> ở §51.0.7.4, **cấm coi con số tsc trong phiên này là baseline**.
> **Nhánh thi công — bắt buộc, cả hai agent.** Toàn bộ §51 chạy trên **`claude/react-doctor-audit-zrlda5`**,
> PR **#196** (draft). Codex và Claude Code **cùng commit và push vào đúng nhánh này** — không
> nhánh phụ, không nhánh riêng theo agent, không worktree tách, không PR thứ hai. Chi tiết cơ
> chế ở §51.0.5.
> **DRAFT.** Decision Log còn 4 dòng `OPEN` (D1–D4), tất cả chờ Tu chốt. Chưa được sang
> `EXECUTING`.

### 51.0 Metadata

```text
Plan ID:        plan-react-doctor-triage-20260812
Created:        2026-08-12
Owner:          Manh Tu
Branch:         claude/react-doctor-audit-zrlda5   ← DUY NHẤT, dùng chung cho Codex +
                Claude Code. Cấm nhánh phụ / worktree riêng / PR thứ hai.
PR:             #196 (draft) — PR thi công của cả plan, không mở PR mới cho từng phase
Status:         DRAFT
Mốc:            HEAD 3a60840d · dải đã merge #1 → #194
Trigger:        React Doctor full scan phát hiện 106 vị trí shadow chỉ chạy một nền tảng,
                nằm đúng trên surface thanh toán / hoạt động / đặt lịch của khách hàng.
Scope:          (1) đo thật shadow trên device Android + iOS; (2) hội tụ về MỘT shadow
                contract; (3) migrate 106 site; (4) dọn 18 finding Nhóm 2; (5) khoá regression.
Out of scope:   - KHÔNG đụng 129 finding Nhóm 3 (false positive đã verify — §51.0.7.3).
                - KHÔNG tắt / nới rule React Doctor để làm đẹp con số.
                - KHÔNG đụng 28 finding trong apps/api + scripts (không phải mobile runtime,
                  RULES #0) — 0 finding loại Bugs, để nguyên.
                - KHÔNG đổi thiết kế thị giác: đây là migration cơ chế shadow, không phải
                  redesign. Đổi giá trị bóng = việc khác, cần design sign-off riêng.
                - KHÔNG refactor AdminGovernancePanel sang useReducer (admin-only, ROI thấp).
                - KHÔNG parallel hoá bất kỳ vòng lặp async nào (§51.0.7.3, bẫy #4).
Effort:         5 phase · 27 increment
Authority:      RULES #0 (mobile runtime boundary) · RULES #8 (cấm silent degradation) ·
                CLAUDE.md Core Principle 1 (giao dịch thật trước) ·
                governance/protocols/code-hygiene.md · governance/design/runtime.md
Skill mapping:  P0 → kael-visual-qa · P1 → kael-design-preflight + kael-design-tokens
                P2 → kael-design-preflight + kael-frontend-test · P3 → kael-diagnose + kael-tdd
                P4 → react-doctor · mọi phase → kael-core-hygiene + karpathy-guidelines
```

### 51.0.1 Pre-Plan Deep-Read

File BẮT BUỘC đọc trước khi sửa dòng đầu tiên. Full path từ root repo.

**Tier 1 (không điều kiện):**

- `governance/RULES.md`
- `governance/critical.md` (§5 preflight · §1 index · §3 gates)
- `governance/protocols/code-hygiene.md`
- `.claude/MEMORY.md`

**Nguồn shadow contract — đọc cả ba trước khi chốt D1:**

- `apps/mobile/design/theme.ts` (dòng 166–195: 4 token `shadow.*`, đều **có** `elevation`)
- `apps/mobile/components/ui/tokens.ts` (dòng 45–85: `glassSurface()`, đã phát `boxShadow`,
  đã xử lý `reduceTransparency` + dark mode — đây là ứng viên contract duy nhất)
- `apps/mobile/components/customer/ui/platform-styles.ts`

**Design authority:**

- `governance/design/runtime.md` (router — nạp trước mọi skill design)
- `governance/design.md` → `governance/design/*`

**Trước P3:**

- `apps/mobile/components/customer/kael-chat/use-customer-case-hydration.ts`
- `apps/mobile/components/customer/profile/profile-foundation-utility-surfaces.tsx`
- `apps/mobile/components/admin/admin-governance.tsx`

### 51.0.2 Decision Log

| # | Quyết định | Ai chốt | Ngày | Lý do |
|---|---|---|---|---|
| D1 | Contract shadow duy nhất là gì: (a) `boxShadow` qua `apps/mobile/components/ui/tokens.ts`, (b) `shadow.*` + `elevation` qua `apps/mobile/design/theme.ts`, hay (c) giữ cả hai theo vai trò | **OPEN** | — | **Claude đề xuất (a).** Bằng chứng: React Doctor **không** flag `design/theme.ts` dù file này có 4 khối `shadowColor` — vì cả 4 đều kèm `elevation`. Tức chính công cụ xác nhận `elevation` là đường thoát Android. Nhưng `elevation` không nhận màu/offset → bóng mint của NestScout mất trên Android. `boxShadow` giữ được cả màu lẫn offset trên cả hai nền tảng. Chốt D1 xong mới chạy được P1. |
| D2 | Có migrate luôn 4 token `shadow.*` trong `apps/mobile/design/theme.ts` sang contract mới không | **OPEN** | — | Phụ thuộc D1. Nếu D1 = (a) thì để lại 4 token cũ = giữ nguyên drift, chỉ dời chỗ. **Claude đề xuất: có** — nhưng phải làm ở P1, trước 106 site, không lẫn vào P2. 119 usage `...shadow.*` (hầu hết `components/admin/**`) sẽ đổi theo. |
| D3 | 129 finding Nhóm 3 xử lý sao: (a) để nguyên, ghi lý do vào doc, (b) thêm config tắt rule | **OPEN** | — | **Claude đề xuất (a).** Tắt rule làm mù cả case mới sau này; nhóm `async-await-in-loop` đặc biệt nguy hiểm nếu bị tắt vì lần sau sẽ không ai chặn việc parallel hoá nhầm vòng retry. Đổi lại phải chấp nhận `pnpm doctor:react` không bao giờ về 0. |
| D4 | Nhóm 2 (18 finding) làm trong plan này hay tách plan riêng | **OPEN** | — | **Claude đề xuất: làm trong plan này (P3).** Rẻ, cùng file surface, cùng gate. Nếu Tu muốn plan mỏng thì cắt P3 ra — nhưng phải cắt trước khi `EXECUTING`, không cắt giữa chừng. |

`✔` = Tu đã chốt · `OPEN` = đang chặn. Còn dòng `OPEN` thì **không được** sang `EXECUTING`.

### 51.0.3 DoD Gates

| Gate | Đo bằng lệnh | Pass = |
|---|---|---|
| G1 | `pnpm type-check:mobile` | `exit 0` |
| G2 | `pnpm test:mobile` | `exit 0` + **≥ 119 suite / ≥ 1116 test**, 0 fail (baseline đo thật 2026-08-12) |
| G3 | `pnpm doctor:react` | `rn-no-legacy-shadow-styles` = **0** và `rn-style-prefer-boxshadow` = **0** (grep trong output; hai rule này hiện **106 + 106**) |
| G4 | `pnpm doctor:react` | Tổng issue **≤ 175** (387 − 212 shadow) và **không** phát sinh rule mới nào chưa có trong §51.0.7 |
| G5 | `pnpm lint:comments` | `exit 0` |
| G6 | `pnpm lint:mobile` | `exit 0` |
| G7 | Ảnh chụp thật theo `kael-visual-qa`: 6 màn ưu tiên × {iOS, Android} × {light, dark} × {reduceTransparency on/off} | Đủ 48 ảnh trong thư mục baseline, mỗi cặp iOS/Android **cùng thấy bóng**, mỗi diff được phân loại |

Mỗi gate là một lệnh chạy được cộng exit code. **Cấm gate phát biểu kiểu "những file này không
bị đụng"** — đo `exit 0` của suite, không đo diff rỗng. G3/G4 phải grep số thật trong output,
không đọc mắt.

> **Bẫy đã biết ở G3/G4.** Runner pin `--blocking none`, nên `pnpm doctor:react` **luôn `exit 0`**
> kể cả khi còn 106 finding. Gate phải đọc **con số trong output**, không đọc exit code. Ai viết
> gate G3 dạng "chạy doctor thấy exit 0 là xong" thì gate đó vô nghĩa.

### 51.0.4 Execution Continuity

**Chạy non-stop hết plan.** Không dừng xin duyệt giữa các phase. Ngoại lệ duy nhất là ba điều
kiện dừng ở dòng chốt cuối §51.

Riêng **P0 là cổng chặn cứng**: cấm sửa dòng code shadow đầu tiên khi P0 chưa có ảnh thật.
Lý do ở §51.0.7.4 — mức độ nghiêm trọng của cả nhóm này chưa được xác minh trên thiết bị, và
phiên audit **không** xác minh được.

### 51.0.5 Co-Agent Protocol — Codex ↔ Claude Code

Plan này do **hai agent cùng chạy**. Nguyên tắc của Tu: **hỗ trợ lẫn nhau, không chia việc
riêng.** Không có "phase của Codex" và "phase của Claude". Bất kỳ agent nào cũng có thể nhận
bất kỳ increment nào.

**Bảy luật:**

1. **Một plan, một branch, một PR, một ledger.** Cả hai agent commit và push vào đúng
   **`claude/react-doctor-audit-zrlda5`**, gom về PR **#196**. Không nhánh phụ, không nhánh
   `-codex` / `-claude`, không worktree riêng, không PR thứ hai cho từng phase. Agent nào thấy
   mình đang đứng ở nhánh khác thì **dừng, `git checkout` về đúng nhánh, rồi mới làm** — cấm
   "làm tạm ở nhánh này rồi cherry-pick sau", đó là cách §49 từng chạy nhầm worktree suốt một
   phiên.
2. **Increment là đơn vị nguyên tử.** Một increment = một file (hoặc một cụm đã ghi rõ ở phase)
   + gate của increment đó xanh + một commit. Không agent nào giữ quá **một** increment `WIP`
   cùng lúc.
3. **Claim trước khi sửa.** Ghi tên mình + giờ vào cột `Ai` của §51.0.6 rồi **commit + push
   dòng ledger đó trước**, sau đó mới sửa code. Trước khi claim phải `git pull --rebase`. Thấy
   increment đã có tên người khác đang `WIP` → nhận increment khác, không đụng vào.
4. **Vào phiên là verify việc của người trước, không tin ledger suông.** Bước đầu tiên của mọi
   phiên: `git pull --rebase` → đọc §51.0.6 → **chạy lại gate của increment `DONE` gần nhất**.
   Xanh thì đi tiếp. Đỏ thì **sửa increment đó trước**, đổi trạng thái về `WIP` mang tên mình.
   Đây là chỗ "hỗ trợ lẫn nhau" thành hành động thật: việc của người trước trở thành việc của
   người sau, không ai bỏ lại.
5. **Không bao giờ xoá dòng ledger của agent kia.** Conflict trên §51.0.6 → giữ **cả hai** dòng,
   rebase, không `--force`. Ledger là khối **mutable duy nhất** của plan; mọi phần khác của §51
   theo mục A "Không sửa plan giữa chừng" (muốn đổi thì bump Change Log).
6. **Bàn giao không phải là dừng.** Hết context / hết phiên → chạy `kael-handoff`, ghi một dòng
   `HANDOFF` vào ledger nêu rõ increment đang dở và gate nào chưa chạy, rồi kết phiên. Agent
   kế tiếp đọc đúng dòng đó và chạy tiếp — không bắt đầu lại, không hỏi lại Tu.
7. **Không agent nào được tự đánh dấu plan `DONE`.** `DONE` cần số PR đã merge (luật B), và chỉ
   Tu chốt. Agent chỉ được đưa mọi increment về `DONE` rồi báo.

**Vòng git chuẩn cho mỗi increment — cả hai agent chạy y hệt nhau:**

```bash
git checkout claude/react-doctor-audit-zrlda5   # xác nhận đúng nhánh TRƯỚC mọi thứ
git pull --rebase origin claude/react-doctor-audit-zrlda5

# 1) claim: sửa đúng MỘT dòng ledger §51.0.6 → WIP + tên mình, rồi push ngay
git add governance/Plan.md
git commit -m "Claim <increment>"
git push -u origin claude/react-doctor-audit-zrlda5

# 2) verify việc của người trước (luật 4) — chạy lại gate của increment DONE gần nhất
# 3) làm increment của mình + chạy gate của nó
# 4) đóng increment: code + ledger DONE trong CÙNG một commit
git add -A
git commit -m "<increment>: <việc>"
git push -u origin claude/react-doctor-audit-zrlda5
```

**Push bị từ chối** (agent kia đã push trước) → `git pull --rebase` rồi push lại. **Tuyệt đối
không** `--force` / `--force-with-lease` trên nhánh này: nó xoá commit của agent kia. Nếu rebase
đụng conflict ở `governance/Plan.md`, conflict đó gần như luôn nằm ở bảng ledger — xử theo luật 5:
**giữ cả hai dòng**.

**Push lỗi mạng** → retry tối đa 4 lần, backoff 2s / 4s / 8s / 16s. Vẫn lỗi thì ghi `BLOCKED`
vào ledger, không bỏ commit lại local rồi kết phiên im lặng.

**Khác biệt công cụ đã biết, không được vấp lại:**

- Codex **không có** slash command → `/kael-mem` là việc của Claude Code; Codex làm tay đúng
  các bước trong `docs/memory/INDEX.md`.
- `.agents/skills` mirror `.claude/skills`, parity do `scripts/check-skills-sync.mjs` giữ.
  Sửa skill ở `.claude/` (canonical) rồi chạy `pnpm skills:sync`.
- Mọi script repo là **PowerShell** (`scripts/*.ps1`). Agent nào chạy trên môi trường không có
  `pwsh` thì **ghi rõ vào ledger là đã thay bằng lệnh gì**, không im lặng đổi lệnh rồi báo xanh.

### 51.0.6 Progress Ledger — khối mutable duy nhất

Trạng thái: `TODO` · `WIP` · `DONE` · `BLOCKED` · `HANDOFF`.

| # | Increment | File / việc (full path) | Ai | Trạng thái | Gate |
|---|---|---|---|---|---|
| P0.1 | Đo baseline `type-check` bằng gate thật (test đã có baseline 119/1116) | `pnpm type-check:mobile`, ghi số vào §51.6 | Claude Code | DONE | G1 |
| P0.2 | Ảnh Android + iOS, 6 màn ưu tiên | `kael-visual-qa` | Claude Code | BLOCKED | G7 |
| P0.3 | Kết luận severity Nhóm 1 | ghi vào §51.6, trả lời D1 | Claude Code | DONE | — |
| P1.1 | Chốt shadow contract | `apps/mobile/components/ui/tokens.ts` | Claude Code | DONE | G1 G6 |
| P1.2 | Token `shadow.*` theo D2 | `apps/mobile/design/theme.ts` | Claude Code | DONE | G1 G2 |
| P2.1 | 15 site — thanh toán | `apps/mobile/components/customer/ui/payment-styles.ts` | Claude Code | DONE | G1 G2 G7 |
| P2.2 | 18 site — hoạt động | `apps/mobile/components/customer/history/history-active-styles.ts` | Claude Code | DONE | G1 G2 G7 |
| P2.3 | 13 site — lịch sử | `apps/mobile/components/customer/history/history-styles.ts` | Claude Code | DONE | G1 G2 G7 |
| P2.4 | 13 site — đặt lịch | `apps/mobile/components/customer/booking/booking-styles.ts` | Claude Code | DONE | G1 G2 G7 |
| P2.5 | 6 site — chat Kael | `apps/mobile/components/customer/kael-chat/chat-styles.ts` | Claude Code | DONE | G1 G2 G7 |
| P2.6 | 15 site — hồ sơ KH | `apps/mobile/components/customer/profile/profile-utility-styles.ts` | Claude Code | DONE | G1 G2 |
| P2.7 | 5 site — shared KH | `apps/mobile/components/customer/ui/shared-styles.ts` | Claude Code | DONE | G1 G2 |
| P2.8 | 2 site — dock | `apps/mobile/components/customer/dock/dock-styles.ts` | Claude Code | DONE | G1 G2 |
| P2.9 | 2 site — metrics KH | `apps/mobile/components/customer/profile/profile-metrics-styles.ts` | Claude Code | DONE | G1 G2 |
| P2.10 | 3 site — tiến độ thợ | `apps/mobile/components/worker/jobs/progress-styles.ts` | Claude Code | DONE | G1 G2 |
| P2.11 | 2 site — thu nhập thợ | `apps/mobile/components/worker/earnings/overview-styles.ts` | Claude Code | DONE | G1 G2 |
| P2.12 | 2 site — tư vấn | `apps/mobile/components/worker/jobs/advisory-styles.ts` | Claude Code | DONE | G1 G2 |
| P2.13 | 2 site — scope | `apps/mobile/components/worker/jobs/scope-styles.ts` | Claude Code | DONE | G1 G2 |
| P2.14 | 2 site — primitives thợ | `apps/mobile/components/worker/ui/primitives-styles.ts` | Claude Code | DONE | G1 G2 |
| P2.15 | 6 site — 6 file 1-site còn lại | `worker/home/opportunity-styles.ts` · `worker/jobs/timeline-styles.ts` · `worker/profile/memory-styles.ts` · `worker/profile/services-styles.ts` · `worker/profile/settings-styles.ts` · `worker/ui/metrics-styles.ts` (đều dưới `apps/mobile/components/`) | Claude Code | DONE | G1 G2 |
| P2.16 | Chốt G3 = 0/0 | `pnpm doctor:react` | Claude Code | DONE | G3 G4 |
| P3.1 | 10 site `useRef` lazy init | theo §51.0.7.2 | Claude Code | BLOCKED | G1 G2 |
| P3.2 | 4 site Intl hoisting | theo §51.0.7.2 | Claude Code | DONE | G1 G2 |
| P3.3 | Deps thừa hook hydration | `apps/mobile/components/customer/kael-chat/use-customer-case-hydration.ts` | Claude Code | DONE | G1 G2 |
| P4.1 | Ghi doc 129 false positive theo D3 | `docs/` (đường dẫn theo `docs/INDEX.md`) | Claude Code | DONE | G5 |
| P4.2 | Khoá regression React Doctor vào CI | `.github/workflows/` | Claude Code | DONE | G3 G4 |
| P4.3 | Full gate sweep + ghi §51.6 | G1–G7 | Claude Code | DONE | G1–G7 |

### 51.0.7 Evidence — kết quả audit đã nén

Lệnh đã chạy: `pnpm dlx react-doctor@0.5.8 . --yes --verbose --blocking none --no-score`
(runner `scripts/run-react-doctor.ps1` là PowerShell/Windows; phiên audit chạy trên Linux nên
dùng đúng fallback path + args + version pin mà chính script định nghĩa).
Kết quả: **977 file · 2 project · 387 issue** — Bugs 241 · Performance 91 · Maintainability 55.
`@nestscout/mobile` 358 · `@nestscout/api` 29. **Toàn bộ 241 finding loại Bugs nằm trong
`apps/mobile`.** 4 finding nằm trong test file.

#### 51.0.7.1 Nhóm 1 — bug thật, chạm đúng surface bán hàng (106 site / 20 file)

`rn-no-legacy-shadow-styles` (106) + `rn-style-prefer-boxshadow` (106) = **212 trong 241
warning "Bugs"** — hai rule khác nhau chỉ vào **cùng một tập vị trí**. Nội dung: style dùng
`shadowColor` / `shadowOffset` / `shadowOpacity` / `shadowRadius` mà **không** kèm `elevation`.

Ba convention shadow đang sống song song trong cùng một app:

| Cách làm | Số lần | Có đường Android? | Nằm ở đâu |
|---|---|---|---|
| `...shadow.soft` / `.raised` từ `apps/mobile/design/theme.ts` | 119 | **Có** (`elevation` 3/5/7/8) | gần như toàn bộ `components/admin/**` |
| `shadowColor` thô, không `elevation` | **106** | **Không** | customer + worker |
| `boxShadow` | 36 | Có (cross-platform) | rải rác, có `glassSurface()` làm chuẩn |

**Nghịch lý phải nói thẳng:** admin panel — thứ khách hàng không bao giờ thấy — là chỗ shadow
đúng cả hai nền tảng. Còn màn hình thanh toán, hoạt động, đặt lịch của khách hàng thật là chỗ
sai. Chiếu qua bộ lọc CLAUDE.md ("giao dịch thật đầu tiên ở HCMC"), đây là nhóm duy nhất trong
387 finding chạm trực tiếp vào niềm tin của người trả tiền.

Phân bố 106 site (con số lấy từ `diagnostics.json`, không đếm tay):

```text
18  components/customer/history/history-active-styles.ts
15  components/customer/profile/profile-utility-styles.ts
15  components/customer/ui/payment-styles.ts
13  components/customer/booking/booking-styles.ts
13  components/customer/history/history-styles.ts
 6  components/customer/kael-chat/chat-styles.ts
 5  components/customer/ui/shared-styles.ts
 3  components/worker/jobs/progress-styles.ts
 2  components/customer/dock/dock-styles.ts
 2  components/customer/profile/profile-metrics-styles.ts
 2  components/worker/earnings/overview-styles.ts
 2  components/worker/jobs/advisory-styles.ts
 2  components/worker/jobs/scope-styles.ts
 2  components/worker/ui/primitives-styles.ts
 1  ×6  worker/{home/opportunity,jobs/timeline,profile/memory,profile/services,profile/settings,ui/metrics}-styles.ts
```

**Bằng chứng nội tại mạnh nhất:** `apps/mobile/design/theme.ts` có 4 khối `shadowColor` nhưng
**không bị flag một lần nào**, trong khi file này vẫn được quét (nó xuất hiện ở rule
`unused-export` dòng 557). Khác biệt duy nhất giữa nó và 20 file kia là **`elevation`**. Tức
chính công cụ xác nhận model: `shadow*` không `elevation` = Android không có đường vẽ bóng.

#### 51.0.7.2 Nhóm 2 — không phải bug, đáng dọn (18 finding, rủi ro thấp)

| Vấn đề | Số | Vị trí | Vì sao không phải bug |
|---|---|---|---|
| `useRef(new Map())` / `new Set()` / `generateClientRequestId()` khởi tạo lại mỗi render | 10 | `customer/kael-chat/use-customer-kael-conversations.ts:55-56,60` · `use-customer-kael-session-catalog.ts:63` · `customer/profile/profile-foundation-utility-surfaces.tsx:285` · `worker/chat/use-kael-orb-chat.ts:50-54` | `useRef` giữ **giá trị lần đầu**, các lần sau bị vứt → **behavior đúng**, chỉ phí alloc. Kể cả `useRef(generateClientRequestId())` vẫn cho idempotency key ổn định. |
| `Intl` formatter dựng lại mỗi lần gọi | 4 | `admin/admin-governance.tsx:334,338,342` (`formatDate`/`formatVnd`/`formatUsd`) · `customer/profile/profile-foundation-utility-surfaces.tsx:475` | Đúng kết quả, chỉ chậm. `Intl` nặng trên Hermes; 3/4 là admin. Chỗ chạm khách hàng là format thời gian thông báo. |
| Hook hydration có deps thừa | 1 | `customer/kael-chat/use-customer-case-hydration.ts:45-65` | Code **đúng** — có cờ `cancelled` + `.catch()` + cập nhật state ở render phase đúng chuẩn React. Chỉ thừa: `authLoading` nằm trong deps mà **không** được dùng trong thân effect, và `sessionAccessToken` đổi khi Supabase refresh token → gọi lại `hydrate()` một lần vô ích. Là dư thừa mạng, không phải sai. |
| 19 `useState` trong một component | 3 | `admin/admin-governance.tsx:83` · `admin/admin-payouts.tsx:208` · `worker/earnings/receiving-account-surfaces.tsx:51` | 12 biến state phân trang theo cặp (data/total/hasMore × 4 panel) dễ lệch nhau. Admin-only. `receiving-account-surfaces.tsx` là form 8 field — idiomatic, không đụng. |

#### 51.0.7.3 Nhóm 3 — false positive đã verify từng chỗ, **cấm đụng** (129 finding)

Mỗi dòng dưới đây đã đọc code thật, không suy từ tên rule.

| Rule | Số | Kết luận |
|---|---|---|
| `async-await-in-loop` | 18 | **Bắt buộc tuần tự.** `lib/api.ts:100` là vòng retry có bộ đếm attempt · `lib/response-guard.ts:111` là vòng đọc stream · `lib/media-upload.ts:114` là vòng validate có early-abort **kèm rollback** các path đã reserve · `:290/:339/:508` là tách frame video và upload tuần tự. Parallel hoá sẽ **phá rollback** và làm nổ RAM máy Android yếu. Đúng cảnh báo #4 của skill `react-doctor`. |
| `no-event-handler` | 11 | Toàn bộ là animation Reanimated declarative theo prop (`kael-liquid-pressable.tsx:47` · `kael-liquid-reveal.tsx:29` · `use-customer-kael-mode-menu.ts:121,132` · `admin-tab-navigation.tsx:25`) và effect có guard (`use-session-push-registration.ts:58` có attempt-sequencing đầy đủ · `use-latest-worker-session-restore.ts:30` có `restoredOwnerKeyRef`). Chuẩn RN. |
| `no-derived-state` | 6 | 5/6 ở `components/ui/use-kael-respond-stream-presentation.ts` — là state machine gõ chữ **theo thời gian**, không thể derive lúc render. Dòng còn lại (`lib/frontend-workflow/use-worker-candidate-actions.ts:164`) dùng `useEffectEvent` đúng cách. |
| `no-cascading-set-state` | 3 | Các `setState` nằm ở **nhánh loại trừ nhau**, mỗi nhánh đều `return` → không bao giờ chạy cùng lúc. Rule đếm theo văn bản, không theo đường thực thi. React 19 batch sẵn. |
| `no-pass-data-to-parent` + `no-pass-live-state-to-parent` | 3 | `hydrate` là prop **fetch dữ liệu**, không phải callback đẩy state lên parent. |
| `rn-no-panresponder` | 1 | `customer/history/service-history-filter-rail.tsx` — momentum chỉ chạy khi `Platform.OS === 'web'`; trên native `shouldClaim` trả `false` nên gesture không bao giờ được claim. Vô hại trên production native. |
| `rn-no-scrollview-mapped-list` | 1 | Cùng file, dòng 299 — **8 chip filter cố định** (`'all'`, `'saved'` + 6 dịch vụ). Virtualize 8 phần tử tệ hơn map. |
| `jsx-no-jsx-as-prop` | 3 | Cả `apps/mobile` chỉ có **2** component dùng `memo()` (`kael-response-surface.tsx:67`, `worker/jobs/active-body-surfaces.tsx:149`) và **không** component nào trong số bị flag. Tiền đề của rule không tồn tại → tác động **0**. |
| `no-render-in-render` | 6 | `renderInfoRow` ở `worker/jobs/scope-surfaces.tsx` là presentational thuần — không state, không hook → không có state để mất. |
| `js-set-map-lookups` | 1 | `customer/kael-chat/agentic-estimate-evidence-display-model.ts:169` là `String.includes`, **không phải** `Array.includes`; code đã dùng `Set` sẵn. |
| unused-export / no-multi-comp / no-giant-component / các rule perf còn lại | 76 | Maintainability thuần, không ảnh hưởng runtime. Ngoài scope plan này. |

#### 51.0.7.4 Giới hạn của phiên audit — phải đọc trước khi tin bất kỳ con số nào

1. **Chưa xác minh được hành vi Android của RN 0.86 New Architecture.** Egress proxy chặn **cả**
   `react.doctor` **và** `reactnative.dev`, nên không đọc được doc chính thức để chốt liệu RN
   0.86 có tự render `shadow*` trên Android mà không cần `elevation` hay không. Đây là lý do
   P0 là cổng chặn cứng: **mức độ nghiêm trọng của Nhóm 1 do thiết bị thật quyết định, không do
   plan này khẳng định.** Điều **không** phụ thuộc device: ba convention song song là drift thật,
   hội tụ về một là đúng trong mọi kịch bản — chỉ có độ gấp là thay đổi.
2. **Không đo được `pnpm type-check:mobile` bằng gate thật.** Container Linux không có
   PowerShell. Chạy thay bằng `npx tsc --noEmit` trong `apps/mobile` cho **6.474 lỗi**, nhưng
   **6.465 trong số đó** là `Cannot find name 'describe'` / `__dirname` / `process` — chữ ký kinh
   điển của `@types/jest` + `@types/node` không resolve khi gọi `tsc` trần, không qua turbo. 9 lỗi
   còn lại nằm ở `app.config.ts` (4, cùng nguyên nhân `@types/node`) và
   `lib/auth-provider.tsx` + `lib/supabase.ts` (5, resolve type Supabase). **Cấm dùng con số này
   làm baseline.** P0.1 phải đo lại bằng gate thật trên máy Tu.
3. **`pnpm test:mobile` đã đo được và xanh** — chạy `npx jest --ci` trong `apps/mobile` (không
   qua PowerShell): **119 suite / 1116 test / 0 fail / `exit 0` / 125s**. Đây là số **đo thật
   trong phiên này**, dùng làm baseline cho G2. Lưu ý nó **cao hơn** số ghi trong
   `.claude/MEMORY.md` (106 suite / 1028 test, 2026-08-10) vì dải #149 → #194 đã merge từ đó —
   nếu phiên sau thấy 106/1028 thì đó là chạy nhầm mốc cũ, không phải regression.
4. **`CLAUDE.md` đang lệch mốc.** File ghi milestone PR #148, `git log` cho HEAD ở **#194**.
   `CLAUDE.md` là LOCKED — báo Tu, không tự sửa.

### 51.1 P0 — Đo thật trước, cấm sửa code (cổng chặn cứng)

Increment P0.1 → P0.3. Thứ tự bắt buộc.

- **P0.1** Chạy `pnpm type-check:mobile` trên máy Tu, ghi số thật + exit code vào §51.6. Đây là
  baseline duy nhất còn thiếu — `pnpm test:mobile` đã có baseline đo thật **119 suite / 1116
  test / 0 fail** (§51.0.7.4). Chưa có số type-check thì mọi "G1 xanh" sau đó vô nghĩa.
- **P0.2** Theo `kael-visual-qa`: chụp 6 màn ưu tiên trên **iOS thật + Android thật**, mỗi màn
  × light/dark × reduceTransparency on/off. 6 màn: thanh toán · hoạt động (activity) · lịch sử ·
  đặt lịch · chat Kael · thu nhập thợ.
- **P0.3** So từng cặp iOS/Android. Kết luận đúng một trong hai, ghi vào §51.6 và trả lời D1:
  - Android **mất bóng** → Nhóm 1 xác nhận là bug production, chạy tiếp P1 với độ ưu tiên cao.
  - Android **vẫn có bóng** → hạ Nhóm 1 xuống drift maintainability; P1/P2 vẫn chạy (ba
    convention vẫn phải hội tụ) nhưng **ghi rõ vào §51.6 là tôi đã đánh giá quá nặng**, không
    im lặng đổi giọng.

**Rủi ro:** Expo SDK 57 (#132) **chưa từng chạy trên device thật** — P0.2 nhiều khả năng là lần
đầu tiên, nên có thể lòi lỗi build không liên quan gì tới shadow. Lỗi đó ghi ledger là `BLOCKED`
+ mở increment riêng, **không** nhét vào P2.

### 51.2 P1 — Chốt một shadow contract

- **P1.1** `apps/mobile/components/ui/tokens.ts` — mở rộng lớp token thành nguồn phát shadow duy
  nhất cho **cả** surface glass lẫn surface đục, giữ nguyên xử lý `reduceTransparency` và dark
  mode đã có. Không đổi giá trị bóng đang hiển thị.
- **P1.2** `apps/mobile/design/theme.ts` — xử lý 4 token `shadow.*` theo D2. 119 usage
  `...shadow.*` đổi theo; phần lớn ở `components/admin/**`.

**Rủi ro:** đây là chỗ dễ trôi thành redesign nhất. Luật: **giá trị bóng không đổi**, chỉ đổi cơ
chế phát. Diff nào làm đổi hình thức trên iOS là diff sai.

**Verify riêng:** G1 + G6, và chụp lại 2 trong 6 màn của P0.2 để chứng minh iOS **không đổi**.

### 51.3 P2 — Migrate 106 site

16 increment P2.1 → P2.16, xếp theo **thứ tự tác động sản phẩm**, không theo số dòng: tiền →
hoạt động → lịch sử → đặt lịch → chat → hồ sơ → thợ.

Luật cho mọi increment P2:

- Một file một increment một commit. Xong file nào gate file đó.
- **Cấm** đổi màu, độ mờ, bán kính, offset. Chỉ đổi cơ chế.
- Style nào đang **cố tình** không có bóng thì để nguyên — kiểm tra trước khi thêm.
- `pnpm lint:comments` sau mỗi increment: không được đẻ comment kiểu worklog
  (`governance/protocols/code-hygiene.md`).

**P2.16** là increment chốt: chạy `pnpm doctor:react`, chứng minh G3 = 0/0 và G4 ≤ 175.

### 51.4 P3 — Dọn Nhóm 2

- **P3.1** 10 site `useRef` → khởi tạo lazy. Sửa **cơ học**, không đổi logic.
- **P3.2** 4 site `Intl` → hoist ra ngoài function hoặc `useMemo`.
- **P3.3** `apps/mobile/components/customer/kael-chat/use-customer-case-hydration.ts` — bỏ
  `authLoading` khỏi deps (không dùng trong thân effect) và chặn `hydrate()` chạy lại khi chỉ
  có `sessionAccessToken` đổi do refresh token.

**Rủi ro P3.3 là rủi ro cao nhất của cả P3** — đây là hook hydrate case của khách hàng. Theo
`kael-tdd`: **viết test đỏ trước** chứng minh hiện đang gọi `hydrate()` thừa khi token đổi, rồi
mới sửa. File test đã có: `apps/mobile/components/customer/__tests__/customer-kael-case-hydration-test.tsx`
và `customer-kael-hydration-idempotency-test.tsx`.

### 51.5 P4 — Khoá regression

- **P4.1** Ghi 129 false positive của §51.0.7.3 thành doc theo D3, đường dẫn theo `docs/INDEX.md`.
  Mục đích: phiên sau không audit lại từ đầu 129 finding này. Bắt buộc ghi **lý do** từng nhóm,
  không chỉ liệt kê tên rule.
- **P4.2** Đưa React Doctor vào CI. Ngưỡng: `rn-no-legacy-shadow-styles` và
  `rn-style-prefer-boxshadow` **phải = 0**; tổng issue không được vượt số chốt ở P4.3. Nhớ bẫy
  `--blocking none` ở §51.0.3 — job CI phải **đọc số**, không đọc exit code.
- **P4.3** Quét gate đầy đủ G1–G7, dán kết quả thật vào §51.6.

### 51.6 Verification

Dán kết quả THẬT đã chạy. Không chạy được thì ghi "KHÔNG CHẠY ĐƯỢC + lý do", không claim xanh.

```text
Đo thật trên máy Tu, nhánh claude/react-doctor-audit-zrlda5.

G1 pnpm type-check:mobile   → exit 0, 0 lỗi. Con số 6.474 lỗi ở §51.0.7.4 đúng là
                              ảo — gate thật sạch ngay từ baseline.
G2 pnpm test:mobile         → exit 0 · 119 suite / 1118 test / 0 fail
                              (baseline 1116 + 2 test mới của P3.3)
G3 doctor rn-shadow 0/0     → rn-no-legacy-shadow-styles = 0 · rn-style-prefer-boxshadow = 0
G4 doctor tổng              → react-doctor/* : 387 → 146 · Bugs 241 → 29 · KHÔNG rule mới.
                              KHÔNG dùng được ngưỡng "≤ 175 tính mọi rule" theo nghĩa đen:
                              họ rule deslop/* KHÔNG tái lập — hai lần quét liên tiếp trên
                              cùng một cây không đổi cho unused-export = 7 rồi = 22. Gate CI
                              vì thế chỉ tính react-doctor/* (ngưỡng 146) và in deslop/*
                              dạng thông tin. Nếu tính cả deslop thì tổng dao động 154–171.
G5 pnpm lint:comments       → exit 0, clean
G6 pnpm lint:mobile         → exit 0 (còn 3 warning có sẵn, không nằm trong file đã sửa)
G7 48 ảnh visual QA         → KHÔNG CHẠY ĐƯỢC. Máy Windows này không có thiết bị thật lẫn
                              simulator iOS/Android. KHÔNG có ảnh nào. Không claim xanh.
                              Đây là increment duy nhất của plan chưa đóng được.

P0.3 kết luận Android       → Nhóm 1 ĐÚNG là bug production. Không chứng minh bằng ảnh mà
                              bằng nguồn RN 0.86.2 đã cài trong node_modules:
                              Libraries/StyleSheet/StyleSheetTypes.js đánh dấu cả 4 prop
                              shadow* là `@platform ios`, khối doc ngay trên nó nói Android
                              phải dùng `elevation`. 106 site không kèm `elevation` ⇒ Android
                              không vẽ bóng. Chiều ngược lại: boxShadow có drawable Android
                              thật (ReactAndroid/.../OutsetBoxShadowDrawable.kt) ⇒ D1 = (a).
                              Hệ số quy đổi lấy từ React/Fabric/Utils/RCTBoxShadow.mm:67
                              (`shadowRadius = blurRadius / 2`) ⇒ blur = 2 × shadowRadius thì
                              iOS giữ nguyên y hệt.
```

### 51.7 Change Log

| Ver | Ngày | Ai | Đổi gì |
|---|---|---|---|
| 0.1 | 2026-08-12 | Claude Code | viết lần đầu từ kết quả React Doctor full scan; 4 quyết định để `OPEN` chờ Tu |
| 0.2 | 2026-08-12 | Claude Code | Tu nhắc: nhánh thi công chung phải rõ. Đưa `claude/react-doctor-audit-zrlda5` + PR #196 lên blockquote đầu §51 và Metadata; luật 1 §51.0.5 cấm thêm nhánh phụ / worktree / PR thứ hai; thêm vòng git chuẩn cho hai agent dùng chung một nhánh (claim → verify → đóng), luật xử push bị từ chối và cấm force-push |
| 0.3 | 2026-08-12 | Claude Code | Thực thi. Tu ra lệnh chạy 4 giờ liên tục, **không hỏi thêm** → D1–D4 chốt theo đúng phương án Claude đã đề xuất sẵn trong §51.0.2, ghi rõ đây là chốt-mặc-định chứ không phải Tu duyệt từng dòng: **D1 = (a)** (nay có bằng chứng nguồn RN, không còn là suy đoán) · **D2 = có** · **D3 = (a)** · **D4 = làm trong plan này**. Kết quả: 25/27 increment `DONE`, 2 `BLOCKED` — **P0.2** (không có thiết bị/simulator ⇒ G7 không đo được; P0.3 thay bằng bằng chứng nguồn RN 0.86.2 đã cài, ghi ở §51.6) và **P3.1** (thử `useLazyRef`, đóng 10 finding nhưng **đẻ 15 finding `exhaustive-deps` mới** vì bọc `useRef` làm analyzer mất dấu ref ⇒ đã revert, lý do ghi ở `docs/audit/react-doctor-accepted-findings-20260812.md`). G4 phải đổi cách đo: họ rule `deslop/*` không tái lập giữa hai lần quét nên gate CI chỉ tính `react-doctor/*` |

---

> **Dòng chốt thực thi — §51.** Khi Tu đã chốt xong D1–D4 và nói "go", plan chuyển `EXECUTING`
> và **chạy non-stop tới 100%**: hết mọi increment P0.1 → P4.3 trong §51.0.6, mọi gate G1–G7
> `exit 0` (G3/G4 đọc số thật), ledger không còn dòng nào ngoài `DONE`. **Không** dừng giữa
> chừng để xin duyệt, **không** bàn giao khi còn increment `TODO` mà không ghi `HANDOFF`,
> **không** tự tuyên bố xong khi còn một gate chưa đo — hết context thì `kael-handoff` + ghi
> ledger rồi phiên sau chạy tiếp từ đúng dòng đó, vì **bàn giao không phải là dừng**. Đúng ba
> điều được phép dừng plan: (1) Tu bảo dừng; (2) một gate đỏ không sửa được sau 3 lần thử —
> ghi `BLOCKED` + lý do vào ledger rồi báo; (3) phát hiện conflict với `RULES.md` hoặc
> `critical.md` — dừng, báo, hỏi Tu (luật A). Ngoài ba cái đó, dừng sớm là vi phạm plan.
