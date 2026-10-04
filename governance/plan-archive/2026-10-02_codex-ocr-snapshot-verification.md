# Archived plan: §56 Codex OCR Snapshot verification

> **Archive status: ABANDONED.** Superseded by Tu request to execute a new complete plan, recorded in §57 of governance/Plan.md on 2026-10-02. The original section is preserved below.

---

## 56. Codex kiểm chứng OCR Snapshot Mode — 2026-09-21

> **Trigger.** Tu yêu cầu trong phiên Claude Code, nhánh `claude/find-open-source-repos-7a37bf`: đưa phần cần Codex kiểm chứng vào `governance/Plan.md` để Codex xem và biết kiểm chứng. Claude đã build và push (`3ea0b3cc`), rồi sửa runbook, `AGENTS.md` và một chú thích của hook sau khi tự review lại (`56128ca5`, không đổi hành vi). Section này giao Codex phần Claude **không tự chứng minh được**: thứ chỉ chạy đúng trong môi trường Codex, và những phép đo mà người viết công cụ không nên tự chấm. Không có audit riêng; bằng chứng của Claude nằm ở §56.7.
> **Freshness check (2026-09-21T15:30Z, đo ngay trước khi chốt Mốc của section này).** `git status` sạch tại HEAD `56128ca5`, ngoài chính section này chưa commit · `origin/main` = `e2994bac` (#264, vừa `git fetch origin main`): `git merge-base --is-ancestor origin/main HEAD` exit `0`, chiều ngược lại exit `1` (nhánh hơn `main` 2 commit, không sau commit nào) · `node --test scripts/ocr-review-gate.test.mjs scripts/harness/classify-ci-changes.test.mjs` = `tests 35 · pass 35 · fail 0`, exit `0` · `ocr` v1.12.7 · node v24.19.0 · git 2.55.0.windows.4 · `plan --full` tại Mốc = `8 reviewable files, 1132 changed lines, 4 batches`, snapshot `7fd49c5c774581f36004b1cc47ad0979449e3f67`.
> **EXECUTING.** Claude đã build, push và tự kiểm phần Claude làm được. Codex chưa chạy V1–V5. P0–P3 chạy non-stop; P4–P5 chờ Tu nói "go" vì tốn token.

### 56.0 Metadata

```text
Plan ID:        plan-ocr-codex-verification-20260921
Created:        2026-09-21
Owner:          Manh Tu
Branch:         claude/find-open-source-repos-7a37bf
Status:         EXECUTING (build + push xong; chờ Codex chạy V1-V5)
Mốc:            HEAD 56128ca5 · main tại e2994bac (#264), nhánh hơn main 2 commit
                (commit kế tiếp chỉ thêm section này và một mục memory)
Trigger:        Tu: đưa phần cần Codex kiểm chứng vào Plan.md để Codex xem và biết kiểm chứng.
Scope:          Codex kiểm chứng độc lập OCR Snapshot Mode: chạy lại test tất định trong checkout sạch
                · chuỗi plan/diff/mark trong sandbox thật của Codex · review độc lập chính mã công cụ
                · Codex có tự theo AGENTS.md không · chất lượng review của Codex trên lỗi gieo sẵn.
Out of scope:   KHÔNG sửa mã công cụ hay .opencodereview/rule.json (thấy lỗi thì ghi thành finding, Tu quyết)
                · KHÔNG dùng `ocr review` hay `ocr config provider` (engine API key, Tu đã bác)
                · KHÔNG nối Headroom · KHÔNG sửa ~/.claude hay ~/.codex ngoài mục trust nêu ở bẫy 7
                · KHÔNG commit, push, mở PR, merge · KHÔNG sửa các file bị khóa
                · KHÔNG làm §55 (Production activation) hay §51-§54
                · KHÔNG "sửa" lint:authority hay flake Docker (xem §56.0.2)
Effort:         6 phase P0-P5, 8 gate G1-G8
Authority:      RULES.md #0 · critical.md §3 · critical.md §8 · STRUCTURES.md §4.5
                · docs/ops/agent-tooling.md · governance/protocols/work-router.md
Skill mapping:  P0-P5 kael-work-router · P2 kael-diagnose · P3 kael-security-sweep, kael-core-hygiene
                · P4-P5 kael-ai-boundary (nội dung lỗi gieo) · cuối phiên source-command-kael-mem
```

### 56.0.1 Pre-Plan Deep-Read

Đọc từ nhánh, không đọc từ checkout của bạn (checkout chính đang có §55 chưa commit): `git show claude/find-open-source-repos-7a37bf:<đường dẫn>`.

- `docs/ops/agent-tooling.md` — runbook: Snapshot Mode, Stop hook, bản đồ phủ sóng, riêng tư, rollback
- `AGENTS.md` mục `## OCR Review` — bước Codex phải làm trước phản hồi cuối
- `.claude/commands/ocr-review.md` — thủ tục review; Codex không có slash command nên làm tay theo file này
- `scripts/ocr-review.mjs` và `scripts/lib/ocr-review-gate.mjs` — CLI và thư viện (snapshot, base, tăng dần, chia lô)
- `.claude/hooks/verify-ocr-review.mjs` — Stop hook, chỉ dành cho Claude Code; đọc để review, không chạy trong Codex
- `scripts/ocr-review-gate.test.mjs` — 20 test tất định: repo git tạm, worktree liên kết thật, `ocr` giả
- `.opencodereview/rule.json` — 12 luật, mỗi luật trích một rule của `governance/RULES.md` hoặc `governance/STRUCTURES.md` §4.5
- `docs/memory/2026-09.md` mục 2026-09-21 — quyết định của Tu và các giới hạn đã biết
- `governance/RULES.md` và `governance/STRUCTURES.md` §4.5 — chuẩn để đối chiếu các trích dẫn của rule.json (đọc, không sửa)

### 56.0.2 Phần đã XONG trong phiên Claude (không làm lại)

Ba chế độ của OCR (`workspace`, `range`, `commit`) mỗi chế độ sót một phần worktree: `workspace` chỉ thấy phần chưa commit (0 file trên nhánh đã commit sạch), `range` không bao giờ thấy phần chưa commit hay file mới, và `--from main` với `main` cục bộ cũ kéo commit của người khác vào. `scripts/ocr-review.mjs` gộp chúng thành **một** Snapshot Mode: chụp cả cây bằng git plumbing vào kho object riêng `.scratch/ocr/objects` (không ghi gì vào `.git`, nên chạy được trong sandbox Codex) rồi chạy `ocr delegate preview --from origin/main --to <snapshot>`. Chỉ Delegation Mode: agent review, OCR không gọi LLM, không API key.

Claude đã tự kiểm, và **giới hạn của từng bằng chứng chính là lý do Codex phải làm lại**:

| Bằng chứng của Claude | Kết quả | Vì sao chưa đủ |
|---|---|---|
| 20 test tất định + 15 test classifier | 35/35 | cùng một agent viết cả mã lẫn test |
| Lab OCR thật, 17 kịch bản (worktree liên kết chạy từ thư mục con, `main` cũ, tăng dần, rebase, đổi tên) | 17/17 | lab do Claude viết, chỉ chạy trên máy này |
| `plan`, `diff`, `mark` trong sandbox Codex thật | exit 0 | n=1, chạy bằng `codex exec`, chưa qua app Codex |
| Review mù lỗi gieo sẵn | 7/7 bắt đúng dòng, 1/3 đối chứng báo nhầm | n=8, Claude vừa gieo vừa chấm; chưa đo với Codex làm reviewer |
| Codex tự theo `AGENTS.md` khi làm một task thật | có | n=1 |
| Stop hook | nối tay: exit 2 rồi exit 0 | chưa quan sát trong phiên Claude Code thật; Claude-only nên không giao Codex |

**Bốn thứ đã kiểm và KHÔNG phải lỗi của công việc này** — đừng điều tra lại:

- `node scripts/check-authority-citations.mjs` đỏ ngay trên `e2994bac` (bản sạch, chưa có commit nào của nhánh này): hai trích dẫn hỏng trong test pillar, một tới rule số 19 của `governance/RULES.md` và một tới mục 22.3 của `governance/STRUCTURES.md`, cả hai không tồn tại. Có sẵn từ trước, không nằm trong `ship:check`, không có workflow CI nào gọi nó.
- Một clone sạch không có `node_modules`: 33 test khác trong `scripts/` thất bại với `Cannot find module 'typescript'`. Bình thường; chỉ chạy các lệnh của §56.0.5.
- `ship:check` gate "script fixture suites" từng đỏ ngắt quãng ở `ensure-docker-*` trong phiên Claude, và xanh 405/405 ở worktree có `node_modules`. Flake không liên quan tới OCR.
- Headroom đã cài nhưng chủ ý không nối: Claude Desktop ghi đè `ANTHROPIC_BASE_URL` nên không proxy được (upstream `headroomlabs-ai/headroom#869`), và Codex chỉ tiết kiệm 0,44 đến 0,6% input token. Đừng đề xuất nối lại.

### 56.0.3 Ranh giới với §55 và các section khác

| Section | Việc | Trạng thái |
|---|---|---|
| §51–§54 | `kael-work-router`, đo playbook, playbook 6 nghề, `kael-docker` | không liên quan |
| §55 | Six-service Production activation | Codex đang chạy; chỉ tồn tại dưới dạng sửa chưa commit ở checkout chính (nhánh `codex/stage1`), đo ngày 2026-09-21 |
| **§56** | **Kiểm chứng OCR Snapshot Mode** | **section này** |

§55 chiếm số 55 trước, nên section này lấy §56. Cả hai nhánh cùng nối đuôi `Plan.md`, nên lúc merge git sẽ báo xung đột ở cuối file: giữ **cả hai** section, không sửa nội dung của bên kia.

### 56.0.4 Decision Log

| # | Quyết định | Ai chốt | Ngày | Lý do |
|---|---|---|---|---|
| D1 | Chỉ Delegation Mode, không API key | Tu ✔ | 2026-09-21 | Tu: Codex và Claude Code đủ lo phần suy luận; không thích tích hợp API key vì tốn tiền mà ít dùng |
| D2 | Snapshot Mode: một commit object không gắn nhánh chứa cả phần chưa commit lẫn đã commit | Tu ✔ | 2026-09-21 | Ba chế độ của OCR mỗi chế độ sót một phần; ngoại lệ Git Rule đã duyệt, rồi rút gọn thành không ghi gì vào `.git` (object nằm ở `.scratch/ocr/objects`) |
| D3 | Tự kích hoạt bằng `AGENTS.md` + `/ocr-review` + Stop hook; không thêm vào `ship:check` hay CI | Tu ✔ | 2026-09-21 | CI đã bị chặn billing năm lần trong tháng 9 (`docs/ops/github-actions-cost.md`) |
| D4 | Codex kiểm chứng trong một checkout riêng ở đường dẫn ngắn, không dùng checkout chính | Claude ✔ | 2026-09-21 | Snapshot chụp **cả cây** kể cả §55 chưa commit; đường dẫn dài vượt MAX_PATH trên Windows |
| D5 | Số `§56`, Plan ID `plan-ocr-codex-verification-20260921` | Claude ✔ | 2026-09-21 | §55 đã bị chiếm ở checkout chính; số § chỉ là chỗ ngồi, Plan ID mới là danh tính (mục A) |
| D6 | P4 và P5 chỉ chạy khi Tu nói "go" | Claude ✔ | 2026-09-21 | Một task Codex thật ở repo này tốn khoảng 4,6 triệu token input (Claude đo bằng `codex exec`); Tu gánh quota |
| D7 | Thấy lỗi của công cụ thì ghi finding, không tự sửa | Claude ✔ | 2026-09-21 | Người kiểm chứng sửa thứ mình đang chấm thì mất tính độc lập; sửa là bước Tu yêu cầu riêng |
| D8 | Kết quả ghi vào phản hồi cuối theo bảng §56.7, không sửa `Plan.md` | Claude ✔ | 2026-09-21 | Git Rule cấm commit khi Tu chưa yêu cầu, worktree tạm sẽ bị xóa, và sửa cuối file gây xung đột với §55 |

Không còn dòng `OPEN`.

### 56.0.5 DoD Gates

Mọi lệnh chạy trong `C:/tmp/ocr-verify` (dựng ở P0), trừ khi ghi khác.

| Gate | Đo bằng lệnh | Pass = |
|---|---|---|
| G1 | `node --test scripts/ocr-review-gate.test.mjs scripts/harness/classify-ci-changes.test.mjs` | `exit 0`, `tests 35`, `pass 35`, `fail 0` |
| G2 | `node scripts/run.mjs run-node scripts/ocr-review.mjs plan --full --fetch` | `exit 0`; `Base: origin/main (merge-base e2994bac10320847acfa8ea70470308ac90cd9d4)`; `8 reviewable files, 1132 changed lines, 4 batches.`; `Snapshot: 7fd49c5c774581f36004b1cc47ad0979449e3f67` (dòng đếm và `Snapshot:` chỉ đúng tại Mốc, xem P0) |
| G3 | P2 bước 3: `plan` sau `mark` và một file thăm dò mới | `exit 0`; `Review: incremental`; đúng `1 reviewable files, 1 changed lines, 1 batches.` |
| G4 | P2 bước 6: `plan` sau lần `mark` thứ hai | `exit 0` và có dòng `Nothing new to review since the last review.` |
| G5 | P2 bước 7: `git cat-file -e <S2>` không đặt biến môi trường, rồi đặt `GIT_ALTERNATE_OBJECT_DIRECTORIES` trỏ vào `.scratch/ocr/objects` | lệnh đầu in `exit=` khác 0 (snapshot không nằm trong object database của repo), lệnh sau in `exit=0` |
| G6 | P3: lệnh `mark` in ở cuối `plan --full` | `exit 0`, bảng coverage có `total = reviewed + skipped` |
| G7 | P4 sau khi Codex làm xong task thật: `node scripts/run.mjs run-node scripts/ocr-review.mjs plan` | `exit 0` và `Nothing new to review since the last review.`, cộng dòng `Verification:` của Codex có kết quả OCR |
| G8 | P5: chấm theo bảng đáp án | báo số đo thật; ngưỡng khởi đầu `>= 6/8` lỗi bắt đúng và `<= 1/3` đối chứng báo nhầm |

Ngưỡng của G8 là giá trị khởi đầu do Claude đặt, không phải benchmark: số của Alibaba không áp dụng cho Delegation Mode vì nó thiếu bước gom bundle, định vị dòng và reflection của `ocr review`.

### 56.0.6 Execution Continuity

P0 → P3 chạy non-stop, ghi kết quả sau từng phase. **P4 và P5 dừng chờ Tu nói "go"** (D6). Không có phase nào cần Tu duyệt giữa chừng khác.

Tu bắt đầu bằng một câu trong Codex: `Đọc governance/Plan.md §56 trên nhánh claude/find-open-source-repos-7a37bf (git show claude/find-open-source-repos-7a37bf:governance/Plan.md), rồi chạy P0 đến P3. Chưa chạy P4, P5.`

Kết thúc: phản hồi cuối theo khuôn `Changed / Verification / Risks / Next Step` của `AGENTS.md`, kèm bảng §56.7 đã điền `PASS`, `FAIL`, `BLOCKED` (môi trường hoặc sandbox chặn, kèm lỗi nguyên văn) hoặc `NOT RUN`. Không commit, không sửa `Plan.md` (D8).

### 56.0.7 Chín cái bẫy đã trả giá — đọc trước khi chạy

1. **Đừng chạy OCR trong checkout đang bẩn của bạn.** Snapshot chụp cả cây, kể cả việc chưa commit của bạn. Dùng `C:/tmp/ocr-verify`; đường dẫn dài vượt MAX_PATH trên Windows.
2. **Sandbox `workspace-write` của Codex cấm ghi `.git/objects`**, và `.git` của một worktree liên kết nằm ngoài writable root: `git add`, `commit-tree`, `fetch` có thể bị từ chối. Script được thiết kế để không cần ghi vào `.git`, nên `plan`, `diff`, `mark` phải chạy được. `git worktree add` của P0 thì có thể bị chặn. Bị chặn: ghi nguyên văn lỗi, thử đường dự phòng của P0, vẫn chặn thì `BLOCKED`. **Không nâng quyền sandbox khi chưa có Tu.**
3. **Dòng đầu stderr của git thường là cảnh báo vô hại** (`warning: unable to access ... ignore`); lỗi thật nằm ở dòng sau. Script đã lọc; khi tự chạy git, đọc hết stderr.
4. **`git diff` thường không thấy snapshot.** Dùng dòng `diff:` do `plan` in ra.
5. **Chỉ dùng `ocr` 1.12.7** (`ocr --version`). Script từ chối `schema_version` lạ. **Không chạy `ocr review` hay `ocr config provider`.**
6. **PowerShell chặn shim `ocr.ps1`.** Gọi qua `node scripts/run.mjs run-node ...`, đừng gọi `ocr` trực tiếp. Codex chạy lệnh shell qua `powershell.exe -Command`.
7. **`codex exec -C <thư mục mới>` với quyền ghi làm Codex thêm `[projects.'<dir>'] trust_level = "trusted"` vào `~/.codex/config.toml`.** Xóa đúng mục đó sau thử nghiệm và không đụng gì khác; app Codex tự ghi các cài đặt UI (`conversationDetailMode`) vào cùng file, đừng nhận nhầm là của mình.
8. **Chi phí:** một task Codex thật ở repo này tốn khoảng 4,6 triệu token input, phần lớn là cached, cho vòng đọc Tier 1 trước khi động vào mã. Chỉ P4 và P5 cần; báo số bạn đo được.
9. **Không có `node_modules` trong checkout sạch** (bẫy đã ghi ở §56.0.2). Đừng cài để cho các test khác chạy: ngoài phạm vi.

---

### 56.1 P0 — Checkout kiểm chứng riêng, tại đúng Mốc

**Đụng tới:** không file nào của repo. Chỉ tạo `C:/tmp/ocr-verify` và metadata worktree.

```powershell
git worktree add --detach C:/tmp/ocr-verify 56128ca5
cd C:/tmp/ocr-verify
git rev-parse --short HEAD          # 56128ca5
ocr --version                       # dòng đầu: open-code-review v1.12.7
```

- **Đường dự phòng** nếu `git worktree add` bị từ chối: `git clone --local <thư mục repo của bạn> C:/tmp/ocr-verify`, rồi `git checkout --detach 56128ca5`. Trong clone, thêm `--base e2994bac10320847acfa8ea70470308ac90cd9d4` vào **mọi** lệnh `plan` (dòng `Base:` khi đó in SHA thay vì `origin/main`), vì `origin/main` của clone là `main` cục bộ của repo nguồn và có thể cũ.
- **Mốc đã bị nhánh vượt qua?** Nếu `git log 56128ca5..claude/find-open-source-repos-7a37bf -- scripts .claude .opencodereview` không rỗng, mã đã đổi sau Mốc: kiểm chứng ở đầu nhánh, và dòng đếm cùng `Snapshot:` của G2 không còn áp dụng vì chúng chỉ khớp tại Mốc. Mọi gate khác vẫn áp dụng.

**Verify riêng:** HEAD in `56128ca5` và `ocr` in `v1.12.7`. Thiếu `ocr` thì dừng và báo Tu, không tự cài (`docs/ops/agent-tooling.md`).

### 56.2 P1 — V1: chạy lại test tất định trong checkout sạch

**Đụng tới:** không file nào.

```powershell
node --test scripts/ocr-review-gate.test.mjs scripts/harness/classify-ci-changes.test.mjs
```

Đạt G1. Giá trị: 20 test tạo repo git tạm và một worktree liên kết thật dưới thư mục tạm của hệ điều hành, nên chúng thử được máy và sandbox của Codex, không chỉ máy của Claude. Sandbox chặn ghi thư mục tạm thì `BLOCKED` kèm lỗi nguyên văn, đó là một phát hiện về môi trường chứ không phải lỗi mã.

### 56.3 P2 — V2: chuỗi plan/diff/mark trong sandbox Codex thật

**Đây là phase giá trị nhất: chỉ Codex chạy được.** Claude đã thấy chuỗi này chạy một lần trong `codex exec`; câu hỏi là nó có chạy trong môi trường Codex bạn dùng hằng ngày không.

**Đụng tới:** tạo rồi xóa `scripts/lib/ocr-verify-probe.mjs` (file chưa theo dõi, chỉ trong `C:/tmp/ocr-verify`); tạo `.scratch/ocr/` (đã gitignore). Tuyệt đối không chạy trong checkout chính.

| Bước | Lệnh | Mong đợi |
|---|---|---|
| 1 | `node scripts/run.mjs run-node scripts/ocr-review.mjs plan --full --fetch` | G2. Có thể có dòng `Warning: git fetch origin main failed or timed out ...` nếu sandbox chặn mạng hoặc `.git`: chấp nhận, ghi lại có hay không. Chép giá trị `Snapshot:` thành **S1** |
| 2 | `node scripts/run.mjs run-node scripts/ocr-review.mjs mark --snapshot <S1> --base origin/main` | `exit 0`, `Recorded review of snapshot <S1>.` (chỉ thử cơ chế, chưa phải một review thật) |
| 3 | `node -e "require('fs').writeFileSync('scripts/lib/ocr-verify-probe.mjs','export const ocrVerifyProbe = 1\n')"` rồi `node scripts/run.mjs run-node scripts/ocr-review.mjs plan` | G3. Chép `Snapshot:` mới thành **S2** và dòng `diff:` |
| 4 | chạy **nguyên văn** dòng `diff:` của bước 3 | `exit 0`, có dòng `+export const ocrVerifyProbe = 1` |
| 5 | `node scripts/run.mjs run-node scripts/ocr-review.mjs mark --snapshot <S2> --base origin/main` | `exit 0` |
| 6 | `node scripts/run.mjs run-node scripts/ocr-review.mjs plan` | G4 |
| 7 | `git cat-file -e <S2>; "exit=$LASTEXITCODE"` rồi `$env:GIT_ALTERNATE_OBJECT_DIRECTORIES = "$PWD/.scratch/ocr/objects"; git cat-file -e <S2>; "exit=$LASTEXITCODE"; Remove-Item Env:GIT_ALTERNATE_OBJECT_DIRECTORIES` rồi `git status --porcelain` | G5: lệnh đầu in `exit=` khác 0, lệnh sau in `exit=0` (mã thoát của cả dòng PowerShell là của `Remove-Item`, nên phải in `$LASTEXITCODE`). `git status` chỉ có `?? scripts/lib/ocr-verify-probe.mjs` |
| 8 | `node -e "require('fs').rmSync('scripts/lib/ocr-verify-probe.mjs')"` rồi `git status --porcelain` | rỗng |

Ý nghĩa: bước 1 và 3–6 chứng minh chuỗi chạy trọn trong sandbox mà **không ghi vào `.git`**; bước 7 chứng minh điều đó bằng dữ kiện: snapshot có trong kho riêng và không có trong object database của repo. Snapshot là hàm thuần của (cây, cha) với danh tính và ngày cố định, nên `Snapshot:` của bước 1 phải trùng đúng chuỗi ở G2 trên mọi máy và mọi đường dẫn; lệch nghĩa là có thứ phụ thuộc môi trường, đáng điều tra: so `git rev-parse HEAD^{tree}` với dòng `tree` của `git cat-file -p <S1>` (chạy với biến `GIT_ALTERNATE_OBJECT_DIRECTORIES` như bước 7).

Bước nào thất bại: ghi **lệnh và lỗi nguyên văn**, gồm cả dòng sau các dòng `warning:`. `FAIL` là lỗi của công cụ; `BLOCKED` là sandbox hoặc môi trường chặn việc kiểm chứng.

### 56.4 P3 — V3: review độc lập chính mã của công cụ

**Đụng tới:** không sửa file nào (D7). Tạo `.scratch/ocr/` trong `C:/tmp/ocr-verify`.

Chạy `node scripts/run.mjs run-node scripts/ocr-review.mjs plan --full` (**không** dùng `plan` trần: P2 đã `mark`, nên nó sẽ báo "Nothing new") và làm theo `.claude/commands/ocr-review.md` từng bước, đúng như Codex phải làm hằng ngày. Tại Mốc đó là 4 batch, 8 file reviewable; 7 file Markdown nằm ở mục "Not reviewed by OCR" và bạn phải xem tay theo `critical.md` §8: `AGENTS.md`, `docs/ops/agent-tooling.md`, `.claude/commands/ocr-review.md`, `.claude/commands/review.md`, `docs/INDEX.md`, `docs/memory/2026-09.md`, `.claude/MEMORY.md`.

**Nghi ngờ có chủ đích** — Claude không tin những chỗ này, hãy thử phá chúng:

- (a) đường dẫn có khoảng trắng, `[id]`, `(tabs)` hoặc dấu nháy đơn trong dòng `diff:` in ra; script quote kiểu POSIX, còn Codex chạy PowerShell
- (b) không có `origin/main`, HEAD detached, hoặc repo chưa có commit nào
- (c) một file rất lớn chưa bị ignore nằm trong cây: `git add -A` phải băm nó vào kho riêng
- (d) một file **đã theo dõi** trùng mẫu bí mật (`.env.*`, `*.pem`, `.npmrc`): sửa nó không vào snapshot, nên không bao giờ được review
- (e) hai lần `plan` hoặc `mark` chạy song song: `.scratch/ocr/state.json` không ghi nguyên tử
- (f) mọi đường thoát của Stop hook (stdin rỗng, JSON hỏng, `ocr` thiếu, hết thời gian) phải `exit 0`; chỉ đường nudge mới `exit 2`
- (g) 12 trích dẫn trong `.opencodereview/rule.json` có khớp `governance/RULES.md` và `governance/STRUCTURES.md` §4.5 không (`node scripts/check-authority-citations.mjs` không quét file `.json`)
- (h) các khẳng định trong `docs/ops/agent-tooling.md` có đúng với mã không: "không ghi gì vào `.git`", hook chỉ ghi dưới `.scratch/ocr`, và bảng phủ sóng (Claude đo bằng OCR thật: một commit rỗng làm `from`, cả cây làm `to`; đo lại nếu làm được trong sandbox)
- (i) mục "Codex hooks" của `docs/ops/agent-tooling.md` và câu tương ứng trong `AGENTS.md`: Claude viết chúng từ `codex features list` và một bản tóm tắt tài liệu chính thức, tức là nguồn đã bị nén. Đối chiếu với trang chính thức và với bản Codex bạn đang chạy: có sự kiện `Stop`, `exit 2` có tiếp tục lượt không, hỗ trợ Windows ra sao, hook phải được trust thế nào. Đây chỉ là kiểm chứng câu chữ; nối hook thật là quyết định của Tu, không thuộc plan này
- (j) bước nào trong `.claude/commands/ocr-review.md` Codex phải đoán hoặc không làm được (`$ARGUMENTS`, `allowed-tools`, "the ocr-review skill" trong thông báo của hook)

**Báo cáo** theo khuôn của file đó: `P1/P2 - file:line - vấn đề, tác động, cách sửa`, kèm bảng coverage và mục "Not reviewed by OCR". Mỗi finding ghi thêm **cách kiểm**: lệnh và kết quả nếu bạn tái hiện được, hoặc "đọc, chưa chạy". Đạt G6 khi chạy được `mark` cuối phiên. Không có finding nào cũng là kết quả hợp lệ, miễn nêu rõ đã xem những gì.

### 56.5 P4 — V4: Codex có tự theo `AGENTS.md` không (chờ Tu "go")

Claude quan sát một lần Codex tự chạy bước OCR (n=1). Một lần chưa phải một tỷ lệ tuân thủ.

**Đụng tới:** một worktree dùng một lần `C:/tmp/ocr-comply` (`git worktree add --detach C:/tmp/ocr-comply 56128ca5`, không có `.scratch`). Codex tạo `scripts/lib/format-duration.mjs` và `scripts/format-duration.test.mjs` trong đó, không nơi nào khác.

Giao cho một phiên Codex **mới**, nguyên văn, không nhắc tới OCR:

> Trong repo này, thêm `scripts/lib/format-duration.mjs` xuất hàm `formatDuration(ms)` đổi mili-giây thành chuỗi như `1h 02m 03s` (xử lý 0, số âm, số thập phân, giá trị rất lớn), kèm `scripts/format-duration.test.mjs` chạy bằng `node --test`. Làm theo quy trình của repo và báo cáo cuối theo khuôn của `AGENTS.md`.

Đo, không đánh giá: (1) phản hồi cuối có nêu kết quả OCR trong dòng `Verification:` không; (2) `.scratch/ocr/objects` có tồn tại không; (3) G7; (4) Codex có tự sửa finding không (`AGENTS.md` chỉ cho báo cáo); (5) token đã dùng. Codex bỏ qua bước OCR là **một kết quả** (bằng chứng cần siết câu chữ trong `AGENTS.md`), không phải plan thất bại. Dọn: xóa worktree khi Tu đã nhận kết quả.

### 56.6 P5 — V5: chất lượng review mù, Codex làm reviewer (chờ Tu "go")

Claude đo 7/7 trên lỗi do chính Claude gieo và chấm. Phép đo đáng tin phải do một người khác gieo, một phiên khác review, và reviewer là Codex vì Codex là người sẽ review thật trong các phiên Codex.

**Đụng tới:** worktree dùng một lần `C:/tmp/ocr-blind` (`git worktree add -b blind-probe C:/tmp/ocr-blind 56128ca5`, nhánh tạm, không bao giờ push) và đáp án ở `C:/tmp/ocr-blind-key.json`, **ngoài** worktree.

1. **Phiên A (người gieo).** Nguyên văn: *Trong `C:/tmp/ocr-blind`, tạo đúng 8 lỗi thật và 3 đoạn đối chứng vô hại (trông đáng ngờ nhưng đúng) dưới `supabase/functions/mobile-api/_shared/{http,domains,kael,platform}`, rải trên ít nhất 5 file, mỗi loại 2 lỗi: (1) module `domains/` gọi thẳng nhà cung cấp AI thay vì qua wrapper Kael; (2) log ra token, secret hoặc PII; (3) tầng thấp import ngược tầng cao, ví dụ `platform/` import `http/`; (4) gọi mạng không có timeout hoặc vòng retry không giới hạn. Không để comment nào gợi ý lỗi. Không commit. Ghi đáp án vào `C:/tmp/ocr-blind-key.json` dạng `[{file, line, category, kind}]`, `kind` là `defect` hoặc `control`.*
2. **Phiên B (reviewer), phiên mới hoàn toàn.** Nguyên văn: *Review toàn bộ thay đổi trong `C:/tmp/ocr-blind` theo `.claude/commands/ocr-review.md`. Chỉ báo cáo. Không đọc `C:/tmp/ocr-blind-key.json`.*
3. **Chấm** (một bước riêng, hoặc Tu): một lỗi là *bắt được* khi có finding trên **cùng file, trong ±3 dòng, cùng loại**; một đoạn đối chứng bị finding P1/P2 là *báo nhầm*. Báo `n/8`, `n/3`, và độ chính xác dòng (đúng dòng, trong ±3).

Đạt G8 theo ngưỡng khởi đầu, hoặc báo số thật nếu dưới ngưỡng. Giới hạn phải ghi cùng kết quả: người gieo và reviewer cùng một mô hình nên "mù" chỉ ở mức không chia sẻ ngữ cảnh, n=8 nhỏ, và mã gieo nằm trong repo này nên không đại diện cho mọi loại lỗi. Dọn: xóa hai worktree/nhánh tạm và file đáp án.

### 56.7 Verification

Trạng thái: `PASS` · `FAIL` · `BLOCKED` (môi trường hoặc sandbox chặn, kèm lỗi nguyên văn) · `NOT RUN`.

| ID | Việc | Ai | Kết quả | Bằng chứng / giới hạn |
|---|---|---|---|---|
| C1 | Lab OCR thật, 17 kịch bản worktree và branch | Claude | PASS 17/17 | lab dùng một lần đã xóa, chỉ chạy trên máy này |
| C2 | Hai suite của G1 tại `56128ca5`, trong worktree mới không có `node_modules` | Claude | PASS 35/35, exit 0 | cùng agent viết mã và test |
| C3 | `plan`, `diff`, `mark` trong sandbox Codex thật | Claude | PASS exit 0 (n=1) | `codex exec`, chưa qua app Codex |
| C4 | Review mù lỗi gieo sẵn | Claude | 7/7 đúng dòng; 1/3 đối chứng báo nhầm | n=8; Claude gieo và chấm |
| C5 | Codex tự theo `AGENTS.md` | Claude | có (n=1) | một lần, chưa lặp |
| C6 | Stop hook nối tay | Claude | exit 2 rồi exit 0 | chưa thấy trong phiên Claude Code thật |
| C7 | Dry-run P0–P2 trong worktree mới tại Mốc, không có `node_modules`, ngoài sandbox: một lần bằng bash (19 kiểm tra), một lần chạy **nguyên văn bảng P2 của section này** qua `powershell.exe` (14 kiểm tra) | Claude | PASS 19/19 và 14/14 tại `56128ca5`; `Snapshot:` = `7fd49c5c774581f36004b1cc47ad0979449e3f67` khớp ở ba worktree khác đường dẫn | chứng minh lệnh chạy đúng như viết, và lần chạy đầu bằng PowerShell bắt được một lỗi của chính section này (đường dẫn kho riêng viết cứng ở bước 7, đã sửa thành `$PWD`); **không** chứng minh chúng chạy trong sandbox Codex |
| V1 | G1 | Codex | NOT RUN | |
| V2 | G2–G5 | Codex | NOT RUN | |
| V3 | G6 | Codex | NOT RUN | |
| V4 | G7 | Codex | NOT RUN (chờ Tu "go") | |
| V5 | G8 | Codex | NOT RUN (chờ Tu "go") | |

**Việc còn lại không thuộc Codex** (ghi để không ai tưởng đã có người làm):

- **N1 — Stop hook trong phiên Claude Code thật.** Hook chỉ nạp lúc khởi động phiên. Tu mở một phiên Code-tab **mới** trong một worktree của nhánh này, sửa ít nhất 30 dòng trong file OCR quét được, rồi kết thúc lượt: phải thấy đúng một lần bị chặn kèm thông điệp OCR, và lượt kết thúc kế tiếp cho cùng trạng thái thì đi qua.
- **N2 — test Claude headless.** Cần Tu chạy `claude auth login` một lần; phiên OAuth của CLI đi kèm app đã hết hạn.
- **N3 — Headroom.** Tu quyết giữ hay gỡ (`uv tool uninstall headroom-ai`). Không chặn plan này.

### 56.8 Change Log

| Ver | Ngày | Ai | Đổi gì |
|---|---|---|---|
| 0.1 | 2026-09-21 | Claude | viết lần đầu; build và push tại `3ea0b3cc`, sửa sau tự review tại `56128ca5`; Codex chưa chạy V1–V5 |
