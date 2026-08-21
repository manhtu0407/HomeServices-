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
