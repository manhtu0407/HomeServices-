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

## 51. `kael-work-router` — lớp định tuyến vào trước mọi việc — 2026-08-21

> **Trigger.** Tu yêu cầu nghiên cứu một skill hệ Supporting luôn Active cho cả skills system và Codex, ban đầu tên `Kael-anti-overengineers`. Tu bổ sung hai lần: (1) bản chất không chỉ là effort budget — Codex/Claude có xu hướng gom sạch thông tin trước rồi làm từ từ, Input phình, mất dần do context, Output yếu; skill nên đổi tên và hoạt động như support/link skill phân bổ skills theo tasks; (2) plan chưa nói skill **nhận diện task thuộc dạng nào** để định hướng. Audit chạy trong chat, plan ở file riêng ngoài repo. Nhánh `claude/skills-structure-review-fdda04`.
> **Freshness check (2026-08-21, chạy ngay trước khi viết section này).** `git status` = 14 file bẩn (toàn bộ là diff của plan này) · baseline đo THẬT: `check-skill-contracts` **exit 1 ĐỎ SẴN** (25 vi phạm giả, xem §51.1), `check-runner-parity` **exit 1 ĐỎ SẴN** (fixture path Windows), `check-manifest` / `check-skills-sync` / `check-comment-discipline` / `lint-structure` exit 0. Toolchain: `node v24.19.0` có, **`pnpm` và `npm` KHÔNG có trên máy** → mọi gate viết bằng `node scripts/…`.
>
> **⚠ Freshness check ban đầu SAI — đã sửa (2026-08-21, sau khi mở PR #222).** Bản đầu ghi *"`merge-base --is-ancestor` cả hai chiều giữa `HEAD cd3b0487` và `main` đều YES (bằng nhau)"*. Câu đó đo trên ref **`main` local đã cũ**, không phải `origin/main`. Thực tế: `main` local = `cd3b0487`, **`origin/main` = `a8d763e3`, đi trước 11 commit**. PR #222 vì thế báo merge conflict. Luật D3 nói "freshness check đo thật" — `git merge-base ... main` **không** phải đo thật khi chưa `git fetch`; phải đo với `origin/<base>` sau khi fetch. Đây là lỗi của phiên này, ghi lại nguyên văn thay vì sửa lặng.
>
> Trong 11 commit đó có `1fba34c9 fix(scripts): give the runner-parity gate the parity it checks for` — tức `check-runner-parity` mà §51 khai là "đỏ sẵn, ngoài scope" **đã được sửa trên `origin/main`**, không còn đỏ sau khi merge.
>
> **EXECUTING — PR [#222](https://github.com/manhtu0407/HomeServices-/pull/222) đang mở.** 2 commit (`b89623c5` P0 tách riêng, `3bbb3258` feature) + 1 merge commit từ `origin/main`. Chờ Tu review và merge.

### 51.0 Metadata

```text
Plan ID:        plan-work-router-20260821
Created:        2026-08-21
Owner:          Manh Tu
Branch:         claude/skills-structure-review-fdda04
Status:         EXECUTING
Mốc:            HEAD cd3b0487 · dải đã merge #1 → #217
Trigger:        Model mạnh hơn, đốt nhiều token hơn, Output không tốt lên tương ứng
Scope:          Skill always-on kael-work-router + protocol canonical + ratchet đo được
                + Stop hook warn-only + thu gọn karpathy-guidelines để ngân sách
                always-on GIẢM chứ không tăng
Out of scope:   Sửa luật đọc Tier 1 (chỉ đo + đề xuất, §51.9) · sửa critical.md §1/§2
                (LOCKED, router đọc chứ không viết lại) · hấp thụ kael-subagent-orchestration
                · đẻ taxonomy miền thứ 13 · chép bảng route design vào router
                · đưa lint:workplan vào CI · hook chặn thật (v2, chờ dữ liệu)
                · sửa check-runner-parity · sửa drift 3-vs-6 dịch vụ ở skills.md (D6)
Effort:         10 phase P0–P9, 9 gate G0–G8
Authority:      RULES #0/#6 · critical.md §1/§2/§3/§24 · protocols/code-hygiene.md
                · protocols/work-router.md (mới) · design/runtime.md (tiền lệ)
Skill mapping:  P0 kael-diagnose · P1 kael-tdd · P2-P4 kael-doc-audit · P5-P7 none
                · P8 đo + đề xuất · P9 source-command-kael-mem
```

### 51.0.1 Pre-Plan Deep-Read

- `governance/critical.md` §0 (Agent Activation Contract, Protocol Load Rule), §1 (Quick Protocol Index), §2 (Task Classification Matrix), §3 (Core Quality Gates), §24 (Forbidden Behaviors)
- `governance/skills.md` Core Skill 1–6 + Anti-Patterns + NestScout Operating Addendum
- `governance/design/runtime.md` §1–§2 (tiền lệ classify → route to skill)
- `governance/protocols/code-hygiene.md` (mẫu Rationalization → Reality)
- `governance/protocols/subagent-orchestration.md`, `.claude/skills/kael-wayfinder/SKILL.md`, `governance/protocols/docs-workflow.md` §18 (ba hàng xóm, kiểm ranh giới)
- `config/harness/manifest.json` + `config/harness/manifest.schema.json` + `scripts/harness/check-manifest.mjs`
- `scripts/check-skill-contracts.mjs`, `scripts/check-comment-discipline.mjs`, `scripts/lib/git-status.mjs`, `.claude/hooks/verify-comment-hygiene.mjs`, `.claude/settings.json`

### 51.0.2 Decision Log

| # | Quyết định | Ai chốt | Ngày | Lý do |
|---|---|---|---|---|
| D1 | Tên `kael-work-router`, bỏ `Kael-anti-overengineers` và `kael-effort-budget` | Tu ✔ | 2026-08-21 | "anti-overengineers" đọc ra "chống lại những kỹ sư quá giỏi"; và bản chất là định tuyến, không chỉ ngân sách |
| D2 | Không hấp thụ `kael-subagent-orchestration`; hai skill bổ trợ | Tu ✔ | 2026-08-21 | orchestration là lớp **thực thi** (gom người khi đã biết việc), router là lớp **định hướng** chạy trước |
| D3 | Thẩm quyền **ràng buộc** — lệch phải khai lý do | Tu ✔ | 2026-08-21 | tư vấn suông đã trôi một lần rồi: `karpathy-guidelines` 234 dòng always-on mà vẫn bị bỏ qua |
| D4 | Được sửa file LOCKED `CLAUDE.md` cho plan này | Tu ✔ | 2026-08-21 | thiếu 4 sửa đổi Tier 3 thì `check-manifest` ĐỎ, build không thể xanh |
| D5 | Commit tách P0 riêng khỏi diff skill | **OPEN** | — | P0 là bug fix độc lập; Tu chưa nói commit trong phiên này |
| D6 | Sửa drift "3 dịch vụ" → sáu, ở **5 file** | Tu ✔ | 2026-08-21 | Tu xác nhận "6 Services mới đúng". Grep toàn repo ra 7 chỗ; sửa 5 chỗ là scope law (`governance/skills.md`, `governance/design/decoration-mascot-icons.md`, `governance/design/screen-recipes.md` ×2, `docs/design/worker-production-contract.md`, `docs/product/client-price-check-production-ui-prep.md`). **KHÔNG sửa 2 chỗ**: `docs/architecture/workflow-step-contracts.md:14` đang mô tả khuyết điểm của file cũ (đúng như lịch sử) và `docs/foundation/kael-knowledge-corpus.md:7` cố ý giới hạn **corpus B3**, không phải scope sản phẩm. Sửa xong thì mục `## Project Correction` trong karpathy thành thừa → xoá |
| D7 | Mở quyền `CLAUDE.md` phủ **cả P8**, không chỉ đăng ký skill Tier 3 | Tu ✔ | 2026-08-21 | Tu nhắc lại là đã cho quyền sửa; tôi đã đọc hẹp hơn mức Tu cấp. P8 chuyển từ "đề xuất" sang **đã áp dụng** |
| D8 | Đóng papercut checksum bằng `harness:manifest:write` thay vì sửa tay JSON | Tu ✔ | 2026-08-21 | Gate bắt đúng nhưng cách chữa là gõ tay 40 ký tự hex — đã cắn 2 lần chỉ trong phiên này, và memory 2026-08-19 đã ghi "SKILL.md edits need a manual manifest checksum bump" như một trap tái diễn. `--write` chỉ ghi checksum và **từ chối** khi còn bất kỳ vấn đề nào khác, nên nó không thể bị dùng để làm gate im |

### 51.0.3 DoD Gates

| Gate | Đo bằng lệnh | Pass = |
|---|---|---|
| G0 | `node scripts/check-skill-contracts.mjs` | `exit 0` + `32 skills` |
| G1 | `node scripts/harness/check-manifest.mjs` | `exit 0` + `32 repository skills` |
| G2 | `node scripts/check-skills-sync.mjs` | `exit 0` |
| G3 | `node scripts/check-comment-discipline.mjs --working` | `exit 0` |
| G4 | `node scripts/lint-structure.mjs` | `exit 0` |
| G5 | `node --test scripts/check-work-plan.test.mjs` | `exit 0` + 17 pass |
| G6 | `node scripts/check-work-plan.mjs` trên tree bẩn thật | `exit 0` khi khai đúng; `exit 1` + đúng 6 lớp vi phạm khi cố tình khai sai |
| G7 | `echo '{}' \| node .claude/hooks/verify-work-plan.mjs` | `exit 0` + một dòng trong `.scratch/work-log.jsonl` |
| G8 | `node scripts/check-work-plan.mjs --coverage` | `exit 0` + `32/32`; và `exit 1` sau khi tiêm một skill giả vào manifest |

`check-runner-parity` đỏ sẵn từ trước plan này, **không** nằm trong gate và không được dùng làm cớ nói build đỏ.

### 51.0.4 Execution Continuity

Chạy non-stop hết P0 → P9 trong một phiên, dừng trước khi commit để Tu duyệt D5.

### 51.1 P0 — Bug CRLF chặn gate (diff riêng)

`scripts/check-skill-contracts.mjs:104` dùng regex fence `` /```[a-z]*\n(...)```/ ``. Máy Tu bật `core.autocrlf=true` và `.gitattributes` không phủ `SKILL.md` → file trên đĩa CRLF → `\n` trần không khớp → `hasReportTemplate()` luôn `false` → **25 skill `closeout: report` báo vi phạm giả**. Dòng 105 ngay dưới đã dùng `split(/\r?\n/)` — tác giả có ý xử lý CRLF, chỉ sót dòng 104. CI chạy ubuntu (LF) nên xanh: lỗi vô hình với CI, chỉ hiện trên máy Windows.

Sửa: `/```[a-z]*\r?\n([\s\S]*?)```/g`. Rủi ro: không — nới regex chỉ thêm case khớp. Verify: G0.

### 51.2 P1 — Tooling

`package.json` thêm `lint:workplan` (phải có **trước** P3 vì `checkCommands()` từ chối `pnpm <name>` không tồn tại) · `scripts/check-skill-contracts.mjs` thêm `.scratch/` vào `UNTRACKED` (gitignored, không thêm thì backtick `.scratch/work-plan.json` trong SKILL.md fail `pathCandidates()`) · `scripts/check-work-plan.mjs` mới (reconcile + `--coverage` + `--warn` + `--json` + `--log`) · `scripts/check-work-plan.test.mjs` mới.

Ghi thật: `scripts/harness/verify.mjs:8-10` nói pass `node --test` đang **TẮT** ở CI → G5 chạy tay, **không** claim CI phủ.

### 51.3 P2 — Protocol canonical

`governance/protocols/work-router.md` mới. Nhận diện hai trục (Miền từ `critical.md` §2, Tầm với `T`/`C`/`X`/`E`), bảng path→miền kèm sàn tầm với, lane theo miền, lane theo điều kiện phiên, bảng always-on miễn route, **bảng bẫy namespace 12 tên protocol-only**, bảng độ sâu, luật `dropped:`, read-window, waste ledger 8 mục, thẩm quyền ràng buộc, bảng Rationalization → Reality.

Uỷ quyền chứ không chép: hàng `ui` trỏ `governance/design/runtime.md` §1-§2 (11 design skill giữ một nguồn), miền lấy nguyên `critical.md` §2.

### 51.4 P3 — Skill

`.claude/skills/kael-work-router/SKILL.md` (42 dòng) + `agents/openai.yaml`. Inline chỉ giữ thứ dùng mọi lượt (hai trục, 4 class, block 5 field, luật read-window, luật `dropped:`); bảng dài để lại protocol. 12 tên miền **không** chép vào body vì `critical.md` §2 đã là Tier 1 đọc bắt buộc.

### 51.5 P4 — Thu gọn `karpathy-guidelines`

234 → **41 dòng**. Xoá phần trùng nguyên văn `governance/skills.md` Core Skill 1–4 + Anti-Patterns + Decision Protocol + Summary. Giữ frontmatter `license: MIT` + `metadata.source` (attribution upstream), `## When To Apply`, prompt template (bỏ hết thì vi phạm `closeout: report`), `## Close`.

**Không đụng `config/agent-skills/skills-lock.json`** — hash ở đó là sha256 của file upstream lúc cài, không khớp bản local dù CRLF hay LF; nó là bản ghi provenance, không phải checksum bản local, và không script nào đọc.

Phát hiện chặn được một lỗi thật: `governance/skills.md:212` ghi scope **ba dịch vụ**, mâu thuẫn `RULES.md` #6 và `CLAUDE.md` (**sáu**). Nếu xoá dòng sáu-dịch-vụ của karpathy với lý do "skills.md đã có", kết quả là xoá bản đúng và giữ bản sai. Đã giữ lại thành mục `## Project Correction`; sửa nguồn là D6.

### 51.6 P5 — Manifest + routers

`config/harness/manifest.json`: entry mới chèn đúng alphabet giữa `kael-wayfinder` và `karpathy-guidelines`, `group: everyday`, `readiness: autonomous`, `closeout: report`, `sideEffectClass: none`, `requiredCapability: repository.plan` (bằng với hai skill định hướng đã có), checksum `git hash-object`; **tính lại cả checksum `karpathy-guidelines`** sau P4. Diff 2 dòng, không reformat cả file (round-trip `JSON.stringify` **không** byte-identical vì file CRLF + compact).

`AGENTS.md`: `31/20` → `32/21`, thêm router vào danh sách auto-trigger.

`CLAUDE.md` (LOCKED, D4): `Two groups, 32 total.` · `**Everyday (21).**` · thêm `kael-work-router` vào code block · câu always-on ba skill · readiness `autonomous 30` · một hàng Tier 2 mới trỏ `governance/protocols/work-router.md`.

### 51.7 P6 — Hook warn-only

`.claude/hooks/verify-work-plan.mjs` clone shape `verify-comment-hygiene.mjs`, **luôn exit 0**, ghi `.scratch/work-log.jsonl`. `.claude/settings.json` thêm entry thứ 3 vào `hooks.Stop[0].hooks[]`, `timeout: 60`.

Ràng buộc và warn-only không mâu thuẫn: luật khai-lệch sống ở thân skill + `## Close` (được `check-skill-contracts` verify là tồn tại) + gate No False Completion §3. Hook v1 chỉ ghi số; đặt ngưỡng chặn từ ngày đầu là cách nhanh nhất để hook bị tắt vĩnh viễn.

### 51.8 P7 — Sync

`node scripts/sync-skills.mjs` → `.agents/skills/`. Cấm sửa tay `.agents/`.

### 51.9 P8 — Tier 1: ĐÃ ÁP DỤNG (D7)

Đo thật 2026-08-21:

| File | Dòng | Bytes |
|---|---|---|
| `governance/critical.md` | 628 | 30.055 |
| `.claude/MEMORY.md` | 100 | 24.055 |
| `governance/RULES.md` | 310 | 14.251 |
| `CLAUDE.md` | 152 | 13.834 |
| `governance/protocols/code-hygiene.md` | 109 | 6.974 |
| **Tổng Tier 1** | **1.299** | **89.169 ≈ ~22k token** |

Ngân sách always-on (thân skill vào context mỗi lượt):

| | Trước | Sau |
|---|---|---|
| `kael-core-hygiene` | 2.954 B | 2.954 B |
| `karpathy-guidelines` | 8.764 B | **2.384 B** |
| `kael-work-router` | — | 3.973 B |
| **Tổng** | **11.718 B** | **9.311 B** |

**Thêm một skill always-on mà tổng vẫn giảm 2.407 B (−151 dòng) mỗi lượt.** Đây là điều kiện tự đặt: lớp định tuyến phải tự trả tiền cho chỗ nó chiếm.

**Mâu thuẫn đã sửa (D7).** Thứ tệ nhất không nằm ở `CLAUDE.md` mà ở `AGENTS.md:117`: *"read every important `.md` file in authority order"* rồi liệt kê ~13 tài liệu, **trước mọi batch lớn**. Nó mâu thuẫn với chính `AGENTS.md:9` (*"Tier 1 is unconditional. Tier 2 depends on the task."*) — mâu thuẫn nội bộ trong cùng một file, không phải chéo file. Đây đúng là front-load viết thẳng vào luật, tức thứ router sinh ra để chặn.

Đã áp dụng, tối thiểu và không hạ sàn an toàn:

- `AGENTS.md`: bỏ "đọc hết mọi `.md` quan trọng" + bỏ bullet "rebuild the important `.md` manifest"; thay bằng Tier 1 đầy đủ **rồi chỉ đọc các hàng Tier 2 mà task thật sự chạm**, và nói ra là hàng nào.
- `CLAUDE.md`: giữ nguyên câu *"A one-line fix does not exempt you from Tier 1"* (nó đúng), thêm phân biệt **whether vs depth**. `RULES.md` và `critical.md` §3 gates đọc **full ở mọi kích cỡ** — đó là sàn security và honesty, và việc một-dòng chính là chỗ hay bỏ qua cả hai. Phần Tier 1 còn lại: lát `T` được đọc mức index; `C`/`X`/`E` đọc full.
- `governance/protocols/work-router.md`: thêm bảng "Tier 1 depth by reach" làm nguồn canonical mà `CLAUDE.md` trỏ tới.

Sàn không được hạ: `RULES.md` full mọi lúc, §3 gates full mọi lúc. Khai sai reach để mua read rẻ hơn là failure mode duy nhất của thay đổi này, và nó bị `check-work-plan.mjs` đối chiếu reach khai với path thật sự đổi.

### 51.9b P8b — Đóng papercut checksum (D8)

Gate `harness:manifest:check` bắt đúng: sửa `SKILL.md` → blob hash đổi → checksum trong manifest thành cũ → ĐỎ. Vấn đề không phải cái gate, mà là **cách chữa**: gõ tay 40 ký tự hex vào một file JSON một-entry-một-dòng. Đã cắn 2 lần trong chính phiên này (karpathy sửa 2 lần), và `.claude/MEMORY.md` 2026-08-19 đã ghi nó như trap tái diễn.

- `scripts/harness/check-manifest.mjs`: thêm `--write`, export `recordChecksums(text, drifts)`. Chỉ ghi field `checksum`, thay theo dòng có `"id":"<id>"` nên giữ nguyên CRLF và format compact. **Từ chối ghi khi còn bất kỳ problem nào không phải checksum drift** — nếu không, cờ này thành cách làm gate im thay vì cách ghi nhận một sửa đổi có chủ ý.
- Thông điệp drift giờ tự nói cách chữa: `… — if the edit was intended, record it with \`pnpm harness:manifest:write\``.
- `package.json`: thêm `harness:manifest:write`.
- `docs/agent-lessons.md`: mục mới ghi trình tự `skills:sync` → `harness:manifest:write` → `harness:manifest:check`, cộng ba bẫy liền kề (manifest không round-trip qua `JSON.stringify`; `skills-lock.json` là provenance upstream, cấm "sửa cho khớp"; CRLF phải dùng `\r?\n`).

Chứng minh chạy thật, cả hai chiều: sửa `kael-tdd/SKILL.md` → gate ĐỎ đúng entry → `--write` ghi `86b0a7e5… -> c4955ead…` → gate XANH. Rồi làm bẩn thêm mirror của `kael-tdd` và `kael-diagnose` → `--write` **từ chối**, `exit 1`, và checksum `kael-diagnose` **không đổi** (`c0becc70…` giữ nguyên trong khi file hash `dbb95821…`). Toàn bộ file test đã khôi phục, `git status` sạch phần đó.

`scripts/harness/check-manifest.test.mjs`: 15 → **18 test**, thêm ghi-đúng-dòng, từ-chối-id-lạ, và thông điệp có nêu lệnh chữa.

### 51.10 Verification

Kết quả THẬT, chạy 2026-08-21 trên `HEAD cd3b0487` + working tree:

```text
G0  node scripts/check-skill-contracts.mjs
    exit 0 — skill contracts ok: 32 skills (30 autonomous, 2 gated; 26 report, 6 inline)
G1  node scripts/harness/check-manifest.mjs
    exit 0 — 32 repository skills, 8 runtime tools, 1 provider adapters, 2 routers
G2  node scripts/check-skills-sync.mjs
    exit 0 — skills in sync: .claude/skills === .agents/skills
G3  node scripts/check-comment-discipline.mjs --working
    exit 0 — clean, no note-banner comments found
G4  node scripts/lint-structure.mjs
    exit 0 — 1042 source files; 9 grandfathered oversize, 120 grandfathered dup-type groups
G5  node --test scripts/check-work-plan.test.mjs
    exit 0 — 17 pass, 0 fail
G6  node scripts/check-work-plan.mjs
    exit 0 — 4 slices closed, 14 files changed inside the declared read-window
    Chứng minh bắt được: khai sai cố ý → exit 1, đủ 6 lớp (domain ngoài 12 class ·
    reach ngoài TCXE · thiếu dropped · slice còn open · file ngoài read-window ·
    14 file thật vs 4 file khai)
G7  echo '{}' | node .claude/hooks/verify-work-plan.mjs
    exit 0 — ghi được dòng vào .scratch/work-log.jsonl
G8  node scripts/check-work-plan.mjs --coverage
    exit 0 — 32/32 skills reachable (4 always-on exempt, 12 protocol-only names trapped)
    Chứng minh bắt được: tiêm skill giả vào manifest → exit 1
    "kael-phantom-skill: in the manifest but no lane can reach it"
```

Đỏ sẵn từ trước, ngoài scope, KHÔNG sửa: `node scripts/check-runner-parity.mjs` exit 1 (fixture path Windows).

Một bug thật do test bắt trong lúc build: `--coverage` ban đầu tính cả mục always-on vào tập "lane đã route", nên ba skill always-on bị báo nhầm là "named by a lane but absent from manifest". Đã tách: chỉ mục `## Lane …` mới route; mục always-on được đối chiếu ngược với hằng số trong ratchet.

### 51.11 Change Log

| Ver | Ngày | Ai | Đổi gì |
|---|---|---|---|
| 0.1 | 2026-08-21 | Claude | viết lần đầu dưới tên `kael-effort-budget` |
| 0.2 | 2026-08-21 | Claude | Tu bổ sung front-load + link-skill → đổi tên `kael-work-router`, thêm chức năng C phán quyết đáng-hay-không, D2/D3 |
| 0.3 | 2026-08-21 | Claude | Tu bổ sung "skill nhận diện task dạng nào" → thêm B.1-B.4 hai trục + lane + bẫy namespace + gate G8 coverage; D4 mở khoá `CLAUDE.md` |
| 1.0 | 2026-08-21 | Claude | execute P0–P9, 9/9 gate xanh, ghi số thật vào §51.9 và §51.10 |

## 54. Việc còn lại sau khi nâng cấp `kael-docker` — 2026-08-26

> **Trigger.** Tu nhờ audit và nâng cấp `kael-docker`. Phần sửa **đã xong** trong phiên
> `claude/audit-system-skills-e2ad42` (chi tiết ở §54.0.2). Section này giao Codex phần **không sửa
> được bằng cách viết doc** — những thứ cần Docker chạy thật, cần lịch sử CI, hoặc thuộc phạm vi Tu đã
> gạt ra khỏi các plan trước.
> **Freshness check (2026-08-27).** HEAD `99349b5f` · `database-controls` trên đúng HEAD xanh ở
> [run 32731516949](https://github.com/manhtu0407/HomeServices-/actions/runs/32731516949), log ghi
> `54 passed / 0 failed / 54 total` · Docker CLI v29.7.2 · lane B đã chạy xanh · lần retry lane A
> doctor mới nhất đo RAM `2.43 GB` / sàn 4 GB và daemon unreachable, nên từ chối start; trước đó
> trong cùng lần thử RAM dao động `5.24 GB` rồi `4.01 GB`, disk/4 port đều free. Log Docker xác nhận
> backend crash khi mở stale runtime reparse-point `...\\Docker\\run\\dockerInference`; không xóa
> được link vì execution policy từ chối thao tác destructive ngoài workspace. **EXECUTING.**
> P0/P1 đã xong; P2 dừng đúng precondition; P3 đã ghi memory. Không trùng việc với §52 và §53 —
> xem §54.0.3.

### 54.0 Metadata

```text
Plan ID:        plan-kael-docker-residue-20260826
Created:        2026-08-26
Owner:          Manh Tu
Branch:         claude/audit-system-skills-e2ad42
Status:         EXECUTING (P0/P1/P3 complete; P2 blocked below RAM floor; P4 out of scope)
Mốc:            HEAD 99349b5f · main đã merge tới #228
Trigger:        Nâng cấp kael-docker xong phần doc; còn lại là phần phải chạy thật mới biết.
Scope:          Đối chiếu ledger với bằng chứng CI · chứng minh lane B · thử lane A
                · ghi memory phiên · đóng hai việc treo từ phiên audit.
Out of scope:   KHÔNG sửa lại SKILL.md trừ khi P1/P2 chứng minh nội dung sai
                · KHÔNG hạ sàn RAM 4 GB · KHÔNG đụng production
                · KHÔNG làm lại việc của §52 (đo playbook) hay §53 (6 nghề)
Effort:         5 phase P0-P4, 6 gate G1-G6
Authority:      critical.md §3 (Core Quality Gates) · RULES #0 (Docker là dev dependency)
                · .claude/skills/kael-docker/SKILL.md (bản mới)
Skill mapping:  P0 kael-docker lane D · P1-P2 kael-docker lane A/B · P3 source-command-kael-mem
                · P4 kael-authority
```

### 54.0.1 Pre-Plan Deep-Read

- `.claude/skills/kael-docker/SKILL.md` — **bản mới**, đọc kỹ `## Lane selection` và `## Degraded lane`
- `docker/INDEX.md` — đã sửa mô tả CI
- `docs/test-debt-ledger.md` — đối tượng chính của P0
- `.github/workflows/harness-assurance.yml` job `database-controls`
- `docker/scripts/run-sql-tests.ps1` và `docker/scripts/edge-check.ps1`
- `governance/Plan.md` §52 và §53 — để không làm trùng

### 54.0.2 Phần đã XONG trong phiên Claude (không làm lại)

`kael-docker` đã được audit và viết lại. Sáu lỗi đã sửa:

- Mọi lệnh trước đây chỉ có dạng gọi qua package manager, mà thứ đó không có trên PATH máy này → nay
  mỗi lệnh có thêm dạng `node scripts/run.mjs …` chạy thẳng.
- Khung binary "lane chính / degraded" → nay **bốn lane chọn theo câu hỏi** (`structure` / `behavior`
  / `types`), lane rẻ nhất đứng đầu.
- Skill từng khẳng định không có daemon thì không có Postgres và câu hỏi schema phải báo "không trả
  lời được" → **sai**, đã thay bằng lane C (introspection chỉ đọc qua Supabase MCP).
- `edge:check` từng bị gộp chung lane tất-cả-hoặc-không-gì → tách thành **lane B**, chỉ cần daemon,
  **không cần sàn RAM, không cần Supabase CLI**.
- `docker/INDEX.md` mô tả CI sai ("3 workflow mỏng, không type-check, không unit test") → sửa đúng
  thực tế: 5 workflow, `database-controls` replay toàn bộ migration.
- `docs/test-debt-ledger.md` ghi sàn RAM 7 GB → sửa thành **4 GB** (khớp `doctor.ps1` và `up.ps1`).

Đã chứng minh, không phải khai suông: contract gate bắt được lỗi cấy vào rồi xanh lại sau revert; và
lane C trả về policy RLS thật của `public.kael_chat_sessions` từ Postgres đang chạy.

**Ba thứ đã kiểm và KHÔNG phải lỗi** — đừng điều tra lại: doctor exit code đúng (exit 1, `up.ps1` chặn
bằng `$LASTEXITCODE`); `db:local:reset` thiếu `--local` không phải lỗ hổng vì CLI ghi `--local (default
true)`; Supabase CLI **resolve được** trong worktree này qua `apps/api/node_modules/.bin/supabase.CMD`.

### 54.0.3 Ranh giới với §52 và §53

| Section | Việc | Trạng thái |
|---|---|---|
| §52 | Đo delta playbook electrical | đã giao Codex |
| §53 | Playbook cho cả 6 nghề rồi lên Production | đã giao Codex |
| **§54** | **Việc còn lại của `kael-docker` + hai việc treo** | **section này** |

Không phase nào ở đây đụng vào playbook, eval, hay Production. Nếu thấy mình đang chỉnh playbook thì
đã lạc sang §52/§53.

### 54.0.4 Decision Log

| # | Quyết định | Ai chốt | Ngày | Lý do |
|---|---|---|---|---|
| D1 | Giao phần còn lại cho Codex | Tu ✔ | 2026-08-26 | Tu: "Viết vào Plan.md trong Branch này công việc còn lại cho Codex xử lý nốt" |
| D2 | P0 chạy trước và **không cần Docker** | Claude ✔ | 2026-08-26 | Đây là lane D của chính skill vừa nâng cấp — dùng bằng chứng đã có thay vì dựng stack. Cũng là phép thử xem khung mới có thật sự dùng được không |
| D3 | Không hạ sàn RAM 4 GB để lane A chạy được | Claude ✔ | 2026-08-26 | Sàn tồn tại để chặn máy rơi vào swap nặng. Hạ sàn là route around the gate, đúng thứ skill cấm |
| D4 | Nếu P2 thất bại thì đó là **kết quả**, không phải thất bại của plan | Claude ✔ | 2026-08-26 | Stack chưa từng lên lần nào trong lịch sử dự án. Một con số đo được kèm lý do có giá trị hơn một lần thử im lặng |

### 54.0.5 DoD Gates

| Gate | Đo bằng lệnh | Pass = |
|---|---|---|
| G1 | `node scripts/check-ship-ready.mjs` | **11/11 xanh** sau mỗi phase |
| G2 | P0 — đối chiếu ledger với lịch sử CI | mỗi hàng đổi trạng thái đều kèm **URL run + commit SHA** |
| G3 | P1 — `node scripts/run.mjs docker/scripts/edge-check` | `exit 0`, hoặc ghi "KHÔNG CHẠY ĐƯỢC + lý do" |
| G4 | P2 — `node scripts/run.mjs docker/scripts/doctor` | ghi lại **số RAM đo được**, bất kể pass hay fail |
| G5 | P4 — `node scripts/check-authority-citations.mjs` | `exit 0`, và số warning **giảm** so với 28 |
| G6 | `node scripts/check-skill-contracts.mjs` | `38 skills`, `exit 0` |

### 54.0.6 Execution Continuity

P0 chạy trước và chạy độc lập — nó không cần Docker. P1 đã mở được sau một lần restart Docker
Desktop; lane B không đọc sàn RAM. P2 chạy doctor và dừng trước `up` vì RAM dưới sàn 4 GB, nên
không có reset/test cần dọn. P3 đã ghi memory sau khi Tu duyệt draft; P4 bị loại khỏi phạm vi người
dùng giao.

---

### 54.1 P0 — Đối chiếu ledger với bằng chứng CI (không cần Docker)

**Đây là việc giá trị nhất, và nó là phép thử cho chính lane D vừa thêm vào skill.**

`docs/test-debt-ledger.md` hiện có **9 hàng ghi "asserts it, unrun"**. Nhưng:

- `docker/scripts/run-sql-tests.ps1` quét **toàn bộ** `supabase/tests` với filter `*.sql`, sort theo
  tên — hiện **54 file**, không phải một tập con.
- `.github/workflows/harness-assurance.yml` job `database-controls` chạy `supabase db reset --local`
  (replay mọi migration từ rỗng) **rồi** chạy chính runner đó với `--stop-on-first-failure`, trên
  **mọi pull request và mọi push vào main**.

Suy ra: **nếu `database-controls` từng xanh trên một commit, thì toàn bộ 54 file SQL đã thực thi thật
trên một Postgres vừa replay xong mọi migration.** Khi đó chữ "unrun" là sai, và sai theo cách kiểm
được mà không cần Docker.

Việc phải làm:

1. Tra lịch sử GitHub Actions của `harness-assurance` → tìm lần `database-controls` **xanh** gần nhất.
2. **Nếu có**: từng hàng "asserts it, unrun" đổi thành đã-thực-thi, **kèm URL run và commit SHA**.
   Không có URL thì không được đổi — đó là điều kiện của G2.
3. **Nếu chưa từng xanh**: đó chính là phát hiện, và nó lớn hơn cả ledger — nghĩa là ma trận SQL chưa
   từng pass ở đâu cả, kể cả CI. Ghi thành một dòng riêng ở đầu ledger.
4. Hàng "silent" (script có nhưng không assert invariant) giữ nguyên trạng thái — CI xanh không cứu
   được một script không assert gì.

**Kết quả P0 (2026-08-27):** `gh run list` cho thấy run xanh gần nhất là [33031610158](https://github.com/manhtu0407/HomeServices-/actions/runs/33031610158) trên `main` tại commit `b87e099f521772c5402960fa1aaeb55e46968a7b`; run đó có job `database-controls` xanh. Quan trọng hơn, đúng branch HEAD `99349b5fc64f07d00d1f62a340750c16d4563b38` cũng có job `database-controls` xanh tại [run 32731516949](https://github.com/manhtu0407/HomeServices-/actions/runs/32731516949), với log `54 passed / 0 failed / 54 total`. Static inspection xác nhận 9 dòng được đổi trạng thái đều có assertion thật; các dòng `silent`, `partial`, `still debt` giữ nguyên.

### 54.2 P1 — Chứng minh lane B là thật (cần Docker Desktop)

Skill mới khẳng định lane B chỉ cần daemon — **không cần sàn RAM 4 GB, không cần Supabase CLI**.
Khẳng định đó đã được chứng minh trong phiên này.

1. Tu bật Docker Desktop.
2. Chạy `node scripts/run.mjs docker/scripts/edge-check`.
3. RAM khả dụng lúc chạy là **2.4–2.8 GB**, dưới sàn lane A. Nếu nó vẫn xanh → lane B được chứng minh,
   và đó là lần đầu tiên repo này type-check được toàn bộ Edge trên máy Tu.
4. Nếu nó đỏ vì lý do **không phải** RAM (ví dụ registry trả 403), ghi nguyên văn lỗi — đó là
   precondition thứ hai trong bảng, không phải phản chứng cho lane B.
5. Nếu nó đỏ vì RAM → **nội dung skill sai**, sửa lại bảng lane và nói rõ.

**Kết quả P1 (2026-08-27):** `docker desktop restart --timeout 60` khôi phục daemon; `docker info`
trả `29.7.2`; `docker compose pull --policy missing deno` exit 0 với pinned image đã có sẵn.
`node scripts/run.mjs docker/scripts/edge-check` exit 0 và ghi `edge check passed: 6 function(s)`.
Lane B đúng; không cần sửa `SKILL.md`. Compose không để lại container, network đã được dọn, cache
volume được giữ lại. Docker Desktop đã stop sau kiểm tra.

### 54.3 P2 — Thử lane A (cần Docker Desktop + RAM ≥ 4 GB)

Local stack **chưa từng lên lần nào** trong lịch sử dự án. Đây là lần thử có chuẩn bị.

1. Đóng bớt ứng dụng. Đo cho thấy RAM bị chia mỏng nhiều tiến trình chứ không bị một thứ ngốn hết, nên
   đóng browser và các app agent không dùng là cách rẻ nhất để qua sàn.
2. `node scripts/run.mjs docker/scripts/doctor` → **ghi lại số đo, pass hay fail** (G4).
3. Nếu doctor xanh, chạy theo đúng thứ tự: `up` → `reset` → `test` → `down`. **Mọi `up` đều phải có
   `down`.**
4. Một file SQL đỏ là **kết quả, không phải sự cố**. Phân loại: script hỏng / lỗi schema thật / thiếu
   JWT context. **Cấm sửa migration để ép xanh.**
5. Nếu doctor vẫn từ chối → ghi số RAM và dừng. Đó là kết quả hợp lệ (D4), không phải thất bại.

**Kết quả P2 (2026-08-27):** lần thử đầu `node scripts/run.mjs docker/scripts/doctor` exit 1 vì
available RAM `2.45 GB < 4 GB`; lần retry theo Next Step thấy daemon `29.7.2` reachable nhưng
doctor tiếp tục exit 1 tại RAM `3.86 GB < 4 GB` và port `55322` unavailable. `docker compose ps -a`
trong worktree mục tiêu không có container; port được map bởi `supabase_db_nestscout` thuộc project
`nestscout`. Read-only inspect xác nhận `supabase_edge_runtime_nestscout` bind-mount
`supabase/functions` của worktree mục tiêu, nên `node scripts/run.mjs docker/scripts/down` từ đúng
worktree đã dừng stack liên quan với exit 0, không purge volume. `pnpm supabase:version` pass với
CLI `2.98.2`. Doctor đã chặn trước `up`, nên không chạy reset/test; sau cleanup port `55322` free
và không còn container local của stack này. Sau khi dọn app và restart Docker theo Next Step, lần
doctor mới exit 1 tại available RAM `2.08 GB < 4 GB`; disk `66.09 GB` và ports `55321–55324` đều
free. Docker daemon vẫn reachable tại thời điểm doctor để giữ đúng yêu cầu khởi động Docker, nhưng
local stack không chạy.

**Retry cuối sau khi dọn app người dùng:** đã đóng 32 PID đã xác minh, khoảng `1.15 GB` working
set; browser/app mục tiêu không còn, Codex host/MCP và system/security được giữ. Sau terminate riêng
`docker-desktop` rồi start lại (status `running`, server `29.7.2`), doctor exit 1 tại available RAM
`2.18 GB < 4 GB`; disk `66.08 GB` và ports `55321–55324` đều free. Không chạy `up/reset/test`.
Sau đó `docker desktop status` và `docker info` đều exit 1 vì API unavailable; Widgets/WidgetService
đã auto-respawn một lần và được đóng lại, không disable Windows service.

**Next Step retry sau khi Tu yêu cầu chạy tiếp (2026-08-27):** doctor đầu lượt đo RAM `5.24 GB`
nhưng daemon unreachable. Sau khi launch lại Docker Desktop và terminate riêng `docker-desktop`,
doctor đo `4.01 GB` rồi `2.43 GB`, đều không có daemon usable ở thời điểm kiểm tra cuối; disk
`65.86 GB` và cả 4 port free. `wsl.exe --terminate docker-desktop` exit 0; Docker Desktop tạo
GUI process nhưng backend không dựng được. Read-only log `backend.error.json` ghi lỗi `initializing
Inference manager` vì không thể remove stale 0-byte reparse-point
`C:\\Users\\Phan Manh Tu\\AppData\\Local\\Docker\\run\\dockerInference`; `fsutil` cũng trả
`Error 1920`. Đã xác minh target không phải volume/container data; thao tác remove đúng target bị
execution policy từ chối, không dùng workaround. Không chạy `up/reset/test`, không đụng
`docker_data.vhdx`/volume và không disable service hệ thống.

**Follow-up sau khi Docker tiếp tục respawn (2026-08-27):** phát hiện một launcher cũ dưới
`codex.exe` (PID `4272`) vẫn tự launch Docker và poll daemon; đã dừng đúng launcher này, không dừng
Codex host/MCP. Sau đó đã dừng toàn bộ Docker Desktop/backend hiện tại và terminate riêng
`docker-desktop`. `Move-Item` reversible, `fsutil reparsepoint delete` và `Remove-Item` trên đúng
reparse-point đều không thực hiện được (`Error 1920` hoặc execution policy từ chối). Link
`dockerInference` vẫn còn nguyên; không dùng `cmd/rm` workaround, không đụng volume/data.

### 54.4 P3 — Ghi memory phiên

`governance/critical.md` §3. Entry đầy đủ → `docs/memory/2026-08.md`, đúng một dòng →
`.claude/MEMORY.md`. Ba điều bắt buộc có:

1. `edge:check` **không cần sàn RAM và không cần Supabase CLI** — chỉ cần daemon. Đây là năng lực đã
   bị chôn suốt thời gian qua vì bị gộp chung lane với database stack.
2. `check-skill-contracts.mjs` quét regex `pnpm` + khoảng trắng + tên trên **toàn file kể cả văn
xuôi**, nên viết một câu tiếng Anh có chữ đó theo sau bởi một từ thường là gate đỏ. Trong văn xuôi
phải để trong backtick.
3. Kết quả P0 — ma trận SQL đã từng chạy ở CI hay chưa.

**Kết quả P3 (2026-08-27):** sau khi Tu duyệt draft, Codex đã prepend full entry vào
`docs/memory/2026-08.md` và đúng một dòng vào `.claude/MEMORY.md`. Entry ghi rõ bằng chứng CI,
lane B, stop-condition lane A, phần chưa chạy và P4 ngoài phạm vi; không chứa secret, token hay PII.

### 54.5 P4 — Hai việc treo từ phiên audit

Không thuộc `kael-docker` nhưng đang mở và chưa ai nhận:

1. **28 cảnh báo authority citation.** `check-authority-citations.mjs` báo 28 chỗ trích một section
   Plan đã bị archive mà không nêu file archive. Nằm ở `docs/design`, tests, `packages/shared/kael/charter`,
   `governance/structures`, `docs/foundation`, `docs/ops`. Sửa cho nêu rõ đích archive. **G5** đo bằng
   số warning giảm.
2. **Ratchet eval playbook chưa đấu vào CI.** `docs/playbooks/process-distillation.md` từng tuyên bố
   mỗi thay đổi playbook sẽ tự chạy lại corpus trong CI; câu đó đã được sửa thành PLANNED trong phiên
   trước, nhưng **ratchet vẫn chưa tồn tại**. Script chạy eval có trong cả hai `package.json` mà không
   nằm trong workflow nào. Đây là task riêng, cần secret staging trong CI — **chỉ ghi lại, đừng tự làm
   trong §54** trừ khi Tu bảo.

### 54.6 Verification

**CẬP NHẬT 2026-08-27.** Gate nào đã chạy được ghi số thật; gate bị chặn hoặc ngoài phạm vi vẫn
ghi rõ lý do (`critical.md` §3: gate không chạy được **không phải** gate đã pass).

| Gate | Kết quả | Số thật |
|---|---|---|
| G1 | PARTIAL | `node scripts/check-ship-ready.mjs` exit 1 only at git-state check: all 11 content gates xanh; 133 existing/uncommitted paths remain and were not committed |
| G2 | PASS | `database-controls` xanh ở [run 32731516949](https://github.com/manhtu0407/HomeServices-/actions/runs/32731516949), exact HEAD `99349b5fc64f07d00d1f62a340750c16d4563b38`; log `54 passed / 0 failed / 54 total` |
| G3 | PASS | `node scripts/run.mjs docker/scripts/edge-check` exit 0; `edge check passed: 6 function(s)` |
| G4 | PASS (honest refusal) | Latest doctor exit 1; daemon unreachable and RAM `2.43 GB < 4 GB` (same retry had `5.24 GB` and `4.01 GB` before Docker/backend state changed), disk `65.86 GB`, ports `55321–55324` free. Docker log points to stale `dockerInference` reparse-point; no `up`. |
| G5 | NOT RUN — ngoài phạm vi kael-docker | P4 authority-citation audit không thực hiện theo chỉ thị chỉ làm phần kael-docker |
| G6 | PASS | `node scripts/check-skill-contracts.mjs` exit 0; 38 skills (`35 autonomous`, `3 gated`; `31 report`, `7 inline`) |

### 54.7 Change Log

| Ver | Ngày | Ai | Đổi gì |
|---|---|---|---|
| 0.1 | 2026-08-26 | Claude | viết lần đầu; giao Codex phần còn lại sau khi nâng cấp `kael-docker` |
| 0.2 | 2026-08-27 | Codex | P0 đối chiếu ledger với CI exact HEAD; P1 chứng minh lane B xanh trên 6 Edge functions; P2 doctor chặn lane A tại `2.45 GB < 4 GB`; không chạy P4, không đụng Production |
| 0.3 | 2026-08-27 | Codex | P3 ghi full session memory và Recall Index sau khi Tu duyệt; giữ nguyên gap RAM lane A và phạm vi loại trừ P4 |
| 0.4 | 2026-08-27 | Codex | Retry Next Step: doctor chặn lane A tại `3.86 GB < 4 GB` và port `55322` bận bởi stack `nestscout`; xác nhận Supabase CLI `2.98.2`; không dừng stack khác, không chạy `up/reset/test` |
| 0.5 | 2026-08-27 | Codex | Xác nhận Supabase stack gắn với worktree qua bind-mount, chạy `down` exit 0 không purge volume; port `55322` free, Docker Desktop sau đó không còn chạy; vẫn không chạy `up/reset/test` vì RAM dưới sàn |
| 0.6 | 2026-08-27 | Codex | Sau khi dọn app người dùng không dùng và restart Docker theo yêu cầu, doctor vẫn chặn tại `2.08 GB < 4 GB`; disk/ports pass, daemon giữ reachable, không chạy `up/reset/test` |
| 0.7 | 2026-08-27 | Codex | Dọn 32 PID app không dùng (~`1.15 GB` working set), terminate riêng `docker-desktop`, start lại thành công; doctor cuối chặn tại `2.18 GB < 4 GB`, disk/ports pass, không chạy `up/reset/test` |
| 0.8 | 2026-08-27 | Codex | Đóng lại Widgets auto-respawn; Docker Desktop sau retry không giữ được API (`status/info` exit 1), không restart vòng lặp, giữ nguyên Codex và system/security |
| 0.9 | 2026-08-27 | Codex | Next Step retry: RAM từng đạt `5.24 GB`/`4.01 GB` nhưng daemon không usable, giảm còn `2.43 GB`; read-only log xác nhận stale `dockerInference` reparse-point, remove bị execution policy từ chối; không workaround, không `up/reset/test`, không đụng volume |
| 1.0 | 2026-08-27 | Codex | Dừng stale Docker launcher PID `4272`, dừng Docker backend/GUI và terminate riêng `docker-desktop`; `Move-Item`/`fsutil`/`Remove-Item` không xử lý được reparse-point (`Error 1920`/policy), link và data giữ nguyên |

### 54.8 Audit vòng lặp và contract nâng cấp `kael-docker` — 2026-08-27

**Audit baseline:** branch `claude/audit-system-skills-e2ad42`, HEAD
`99349b5fc64f07d00d1f62a340750c16d4563b38`, **48/100 — D**. Các gate cấu trúc cũ xanh nhưng
không chặn được hành vi nguy hiểm. Lịch sử retry ở §54.2–§54.7 được giữ nguyên làm bằng chứng cho lỗi
vòng lặp; subsection này thay thế contract vận hành cũ, không viết lại lịch sử.

**P0 đã xác định:** doctor/up công khai skip-doctor và hạ sàn RAM; daemon probe không timeout hoặc
attempt budget; doctor đề xuất prune/down khi chưa chứng minh ownership; POSIX type generation có thể
nuốt exit code. **P1 đã xác định:** Edge/SQL có đường zero-target false-green và summary lệch nền
tảng; descriptor, manifest và `docker/INDEX.md` drift khỏi mô hình bốn lane.

**Quyết định sửa:** một probe daemon giới hạn 15 giây; chỉ một launch/restart Docker Desktop khi Tu
yêu cầu rõ và một final probe; `Next Step` không mở lại attempt budget. `lean=4 GB`, `full=7 GB`, không
override. Trạng thái preflight đỏ đóng Lane A/B và route C/D. Skill không tự đóng ứng dụng, terminate
WSL, sửa AppData/reparse point, đụng Docker data, prune hay suy ownership từ port. Lane C chỉ read-only
và phải nêu target; Lane D cần exact SHA, workflow/job URL và log trả lời đúng câu hỏi.

**Phạm vi triển khai:** canonical/mirror `kael-docker`, runner trực tiếp dưới `docker/scripts`, profile
docs và `docker/INDEX.md`, package alias, riêng manifest entry `kael-docker`, contract fixture/ratchet và
CI `governance-controls`. Không restart Docker, không live Lane A, không Production, không skill khác,
không commit/push/PR và không ghi session memory trong batch này.

**Acceptance gates:**

1. `node --test scripts/check-docker-contracts.test.mjs`
2. `node scripts/check-docker-contracts.mjs`
3. `node scripts/check-runner-parity.mjs`
4. `node scripts/check-skill-contracts.mjs`
5. `node scripts/check-skills-sync.mjs`
6. `node scripts/harness/check-manifest.mjs`
7. `node scripts/check-comment-discipline.mjs --working`
8. `node scripts/check-ship-ready.mjs`; dirty-only được ghi `PARTIAL` với số content gate thật.

**Kết quả fixed point:** `PASS` cho contract content: fixture `13/13`; Docker ratchet `18` file;
runner parity `13` dispatched / `11` cross-platform / `2` Windows-only; skill contracts `38` skill;
canonical/mirror sync; manifest; comment discipline. `check-ship-ready` là `PARTIAL` chỉ vì git state có
`152` path chưa commit được giữ nguyên; cả `11/11` content gate của lệnh đều xanh. Không chạy Docker
Desktop thật, không thử live Lane A/B và không ghi session memory theo ranh giới batch.

### 54.9 Version policy và runtime-completion ratchet — 2026-08-28

**Yêu cầu bổ sung:** mỗi local Lane A/B phải đưa Docker về bản stable mới nhất khi Docker Desktop hỗ
trợ updater, hoặc chứng minh bản Engine/Compose hiện có là phù hợp với capability repo cần. Mọi task
đi qua `kael-docker` phải có runtime evidence liên quan trước khi ghi `DONE`; ưu tiên hoàn thành task
không được biến thành retry Docker/Windows vô hạn.

**Quyết định:** runner `docker:version:ensure` không nhận override. Nó đọc version hiện tại, gọi đúng
một lần `docker desktop update --quiet` với timeout 300 giây khi Desktop CLI hỗ trợ, đọc lại version,
rồi kiểm `compose pull --policy` và `compose run --pull`. Khi Desktop updater không tồn tại, chỉ hai
capability đó mới cho phép kết luận `suitable`; không hardcode latest, không prerelease channel, không
package-manager privilege escalation và không retry update.

**RAM và runtime:** doctor xanh thì chạy runtime ngay. RAM dưới sàn chỉ mở một read-only inventory và
một safe recovery pass cho exact stale task-owned helper/dev/test child; Codex, Claude Code,
system/security, Docker cần cho lượt chạy và user app có thể có dữ liệu chưa lưu đều được bảo vệ. Mọi
target khác cần Tu phê duyệt chính xác. Sau một final doctor, Lane A/B đóng nếu vẫn đỏ. `DONE` cần Lane
A/B trên current checkout hoặc Lane D với exact SHA + workflow/job URL + log/artifact; dirty checkout
không thể mượn CI của commit cũ.

**Ratchet:** fixture đỏ phải bắt updater retry, Desktop update failure, suitable fallback thiếu
capability, invalid invocation và closeout không có runtime evidence. Gate cuối gồm Docker fixtures,
contract checker, runner parity, skill contracts/sync, manifest, comment discipline và ship-ready.
Batch triển khai này chỉ dùng fake Docker; không update Docker Desktop thật, không chạy live Lane A/B,
không sửa Windows/WSL/AppData/Docker data, không commit/push/PR và không ghi session memory.

**Kết quả fixed point:** Docker fixture `17/17`; contract ratchet `20` file; runner parity `14`
dispatched / `12` cross-platform / `2` Windows-only; skill contracts `38`; canonical/mirror sync;
manifest; comment discipline; Bash syntax và PowerShell parser đều xanh. `skill-creator` validator
xanh cho cả canonical và mirror bằng Python/PyYAML tạm, sau đó dependency tạm đã được xóa.
`check-ship-ready` có đủ `11/11` content gate xanh và exit 1 chỉ vì git state còn `154` path chưa
commit được bảo toàn. Không có Docker command thật, updater thật hoặc local-runtime task nào được gọi.

### 54.10 Clean reinstall và runtime follow-up — 2026-08-28

**Phạm vi phiên:** Tu yêu cầu gỡ Docker Desktop cùng Docker-owned state/WSL data, giữ lại
`%USERPROFILE%\\.docker`, rồi cài lại bản stable mới nhất để tiếp tục xác thực. WSL không còn distro
Docker và `.docker` vẫn tồn tại. Installer chính thức Docker Desktop `4.88.1` được kiểm tra SHA-256
`89fe3d80a326a2ad521de09b5a89ef04d10c60593604b344f11f433ca7f1f6f0`; binary local báo Engine
`29.7.2`, Compose `v5.4.0`.

**Lỗi phát hiện và sửa:** preflight đầu tiên trả `docker command unavailable` vì per-user install
không cập nhật `PATH` của process Codex đã mở. `scripts/run.mjs` nay bổ sung các thư mục Docker CLI
per-user/system hiện hữu trước khi dispatch, giữ nguyên entry PATH cũ; fixture mới bắt regression này.
Contract checker tăng từ 20 lên 21 file; fixture Docker đạt `18/18`, runner parity `14/14`.

**Runtime result:** sau khi resolver được sửa, một doctor probe hợp lệ với profile `lean` tìm thấy
CLI nhưng timeout đúng `15` giây; RAM `7.09 GB`, disk `66.38 GB`, các port `55321–55324` đều free.
`backend.error.json` ghi Docker Desktop không thể remove reparse point
`...\\AppData\\Local\\Docker\\run\\dockerInference` và trả `Error 1920`. Vì đây là host
repair/AppData boundary bị `kael-docker` cấm, không chạy `up`, `reset`, SQL, type generation,
Edge pull, restart hay retry vòng hai.

**Trạng thái:** source/contract work `PARTIAL`; local Lane A/B `BLOCKED` tại daemon. Cần một thao tác
host riêng do Tu kiểm soát (reboot để áp dụng pending deletion hoặc xử lý exact reparse point bằng
quyền Windows), sau đó mới mở attempt mới cho doctor; không xem ảnh lỗi hay static gate là runtime
proof.

### 54.11 WSL enablement và final runtime follow-up — 2026-08-28

**Host action được Tu cho phép:** sau khi reboot không giải quyết được Docker backend, Tu đã xử lý
đúng các target reparse point được nêu trong phiên. `dockerInference`, `sailor-ingest.sock`,
`dockerEthernetVfkit`, `userAnalyticsOtlpHttp.sock` và `docker-secrets-engine\\engine.sock` đều đã
biến mất ở các lần kiểm tra tương ứng; các socket trong `Local\\Docker\\run` được Docker tự tạo lại
khi launch và không bị coi là bằng chứng runtime thành công.

**WSL:** cài đúng một distro Ubuntu bằng `wsl --install --distribution Ubuntu --no-launch
--web-download`; kiểm tra sau đó cho thấy `Ubuntu Running 2`, default distribution `Ubuntu` và
default version `2`. Docker Desktop `4.88.1.237512` đã tồn tại và installer chính thức chỉ báo
`Existing installation is up to date`, không có reinstall thay đổi version.

**Final probe:** sau một launch Docker duy nhất sau thay đổi WSL, `node scripts/run.mjs
docker/scripts/doctor --profile lean` timeout đúng `15` giây và exit `1`; RAM `6.16 GB`, disk
`66.02 GB`, ports `55321–55324` đều đạt. Named pipes Docker đã xuất hiện và frontend process còn
responding, nhưng daemon API chưa trả lời. Không chạy `up`, SQL, type generation, Edge check,
restart hoặc retry thêm.

**Trạng thái:** `kael-docker` runtime vẫn `PARTIAL/BLOCKED` tại daemon; static contract gates vẫn
giữ kết quả xanh của §54.10. WSL change và socket cleanup là host actions có user authorization,
không phải contract cho skill tự sửa Windows. Không commit/push/PR và không ghi session memory trong
batch này.

### 54.12 Clean host repair và bounded runtime diagnosis — 2026-08-28

**Phạm vi được Tu cho phép:** dừng Docker Desktop, dùng cleanup hook/uninstaller chính thức, cách ly
Docker-owned state, cài sạch bản stable mới nhất, giữ `%USERPROFILE%\.docker`, dọn một lượt RAM app
không dùng và xác minh runtime. Không reset/clean Git, không commit/push/PR và không đụng Production.

**Clean reinstall:** `docker desktop stop --force --timeout 30` exit `0`. `.docker` được sao lưu tại
`%TEMP%\codex-docker-config-backup-20260828` rồi khôi phục đủ `54` file / `823526107` byte. Cleanup
hook `InstallerCli.exe -k -u` và official uninstaller đều exit `0`; user-local residue được move có
thể phục hồi vào `%TEMP%\codex-docker-state-quarantine-20260828`. Installer chính thức SHA-256
`89FE3D80A326A2AD521DE09B5A89EF04D10C60593604B344F11F433CA7F1F6F0` cài thành công Docker
Desktop `4.88.1.237512` với backend WSL2. Version policy chạy một lần và xác nhận Engine `29.7.2`,
Compose `v5.4.0`, Desktop updater `upToDate`; không có update retry.

**RAM recovery:** doctor đầu exit `1` tại RAM `3.69 GB < 4 GB` và daemon timeout `15` giây. Một
recovery pass dừng đúng stale Expo web tree, Cốc Cốc và Douyin đã xác minh; Codex, Docker,
system/security được giữ. RAM tăng lên `5.85 GB`; final doctor vẫn exit `1` vì Docker Desktop báo
`unable to start`, trong khi disk khoảng `60.3 GB` và ports `55321–55324` đều đạt. Lane A/B đóng;
không chạy `up`, SQL, types hoặc Edge.

**Root cause evidence:** diagnostics ID `E0F08C2D-37BA-4560-B244-C675D44BE4BC`, bundle SHA-256
`7B6E49FB3D79998375B2FB4C0A492477CB85857DB2008BCC7293053DF9D01302`. Bundle bị truncate do
gatherer treo nhưng giải nén được `286` file. Backend log chứng minh lần đầu WSL relay lỗi
`chdir(...\AppData\Local\Docker) failed 2`, rồi `Wsl/Service/0x8007274c`; lần hậu-fix tiếp theo
crash tại stale `sailor-ingest.sock` với `Error 1920`. Docker state được bỏ NTFS compression
(`39` file); WSL shutdown hoàn tất; toàn bộ `Docker\run` được move recoverably sang
`%TEMP%\codex-docker-run-quarantine-20260828-1325` và tạo mới.

**Host blocker còn lại:** Windows thấy các directory mới dưới `%LocalAppData%`, nhưng WSL 2.7.10
trên Windows `10.0.26200.9168` không thấy cùng absolute path qua DrvFS, kể cả sau unmount/remount và
full `wsl --shutdown`. Official `wsl --update --web-download` xác định target `2.7.12` nhưng phiên
cài đầu đang chờ Windows UAC; lần gọi thứ hai dừng đúng một lần với MSI `1618`, không retry tiếp.
Doctor cuối sau socket isolation vẫn exit `1`: RAM `6 GB`, disk `60.18 GB`, ports đều free, Linux
engine pipe không tồn tại. Kết quả local runtime là `PARTIAL/BLOCKED`; bước host kế tiếp duy nhất là
hoàn tất UAC update WSL, reboot nếu installer yêu cầu, rồi mở một attempt mới. Đây không trở thành
quyền tự sửa Windows của skill.

**UAC completion và fresh attempt:** Windows Installer ghi `Installation success or error status: 0`
cho WSL `2.7.12.0`; `wsl --version` xác nhận kernel `6.18.3.33.2-2`. Một phiên Ubuntu `login -- root`
còn giữ distro đã được đóng đúng PID, sau đó `vmmemWSL` dừng thật. Mount mới vẫn cho kết quả Windows
`53` entry so với DrvFS `49` entry dưới `%LOCALAPPDATA%`; bốn entry WSL không thấy là `Codex`,
`Docker`, `docker-secrets-engine` và probe dùng một lần. Đổi probe sang ACL chuẩn giống `Programs`
không thay đổi visibility, nên đây không phải lỗi DACL đơn thuần.

Docker Desktop được launch đúng một lần qua Explorer broker lúc `13:48:24+07:00`, nhưng process thoát,
`docker-desktop` distro vẫn stopped và state/log mới chỉ xuất hiện trong Windows view mà DrvFS không
thấy. Đây là bằng chứng cho thấy launch từ agent vẫn ở packaged-app filesystem namespace; kết luận
AppContainer overlay là inference từ chênh lệch directory count, mtime và launch result, không phải
runtime pass. Final doctor lean exit `1`: RAM `5.04 GB`, disk `63.36 GB`, ports `55321–55324` đều đạt,
nhưng `dockerDesktopLinuxEngine` pipe không tồn tại. Attempt budget đóng; không probe/restart lần hai,
không chạy Lane A/B.

**Ratchet mới:** `kael-docker` và `docker/INDEX.md` thêm Windows launch-origin gate. Khi Windows và
WSL/DrvFS bất đồng trên cùng `%LOCALAPPDATA%\Docker`, agent không được thử `Start-Process`, Explorer,
elevation, scheduled task, WSL interop hay broker vòng hai. Chỉ một launch từ Start menu hoặc Windows
shell không sandbox của Tu mới được tính `1/1`, rồi chạy đúng một final doctor. Contract test mới khóa
guard này để tránh tái tạo vòng lặp host-repair.

**Acceptance sau guard:** `node --test scripts/check-docker-contracts.test.mjs` PASS `19/19`;
Docker contract PASS `22` file; runner parity PASS `14` runner (`12` cross-platform, `2` Windows-only);
skill contracts PASS `38` skill; skills mirror, manifest, comment discipline và scoped `git diff --check`
đều PASS. Manifest writer chính thức chỉ cập nhật checksum `kael-docker` sang
`git-blob-sha1:d66a94f2d1c01a60fe9a9aebf68ecba2f669527d`. `check-ship-ready` có `11/11`
content gate xanh và kết luận `NOT READY — git state` vì `155` path chưa commit; đây là dirty state
được bảo toàn, không phải content-gate failure. Probe chẩn đoán đã move recoverably vào quarantine;
Ubuntu/vmmem dừng sạch và Docker process count về `0`. Không commit/push/PR, không ghi session memory.

### 54.13 Release audit và live proof — 2026-08-28

**Audit hiện tại:** contract/source trước release phát hiện fixture Windows của doctor chỉ tạo
`docker.cmd`, trong khi runner production cố ý ưu tiên `docker.exe`. Sau khi Docker Desktop được cài
lại, hai test fail/hang vì vô tình gọi daemon thật và có thể xanh giả. Fixture nay biên dịch một
`docker.exe` tạm thời bằng compiler .NET Framework trên Windows; PATH được cập nhật qua đúng key
case-insensitive. Production runner không có test hook và không đổi đường resolve Docker.

**Acceptance:** `node --test scripts/check-docker-contracts.test.mjs` PASS `23/23`, gồm exit code
daemon giả lập, timeout 15 giây và xác nhận process con không còn sống. Docker contract PASS `22`
file; runner parity PASS `14` runner (`12` cross-platform, `2` Windows-only); skill contracts PASS
`38` skill; canonical/mirror sync, manifest, PowerShell parser, Bash `-n`, comment discipline và
scoped `git diff --check` đều PASS.

**Live proof:** version policy chạy đúng một lần và trả Engine `29.7.2`, Compose `v5.4.0`,
`strategy=latest-stable`, `result=updated-or-current`, `update_attempts=1`. Doctor lean exit `0` với
daemon `29.7.2`, RAM khả dụng `4.76 GB`, disk `63.08 GB` và ports `55321–55324` đều đạt. Lane B thật
pull pinned Deno image một lần và `edge-check` exit `0`: `discovered=6 selected=6 checked=6
failed=0`. Không restart Docker, không start/reset local Supabase, không sửa WSL/AppData và không
đụng Production. Tu đã cho phép tạo scoped commit và push riêng toàn bộ diff liên quan
`kael-docker`; dirty state không liên quan tiếp tục được bảo toàn.
