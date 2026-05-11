# Test Report

Sinh test report SAU KHI chạy tests. Lưu vào `docs/test-logs/`.

## Khi nào dùng

Sau mỗi lần chạy test suite (mới hoặc regression). KHÔNG bịa kết quả — chỉ report từ output thật.

## Quy trình

1. Chạy `npm test` — capture output đầy đủ
2. Tạo file `docs/test-logs/YYYY-MM-DD_<tên-ngắn>.md` theo format bên dưới
3. Cập nhật `docs/test-logs/INDEX.md` (chạy `/project:test-log`)
4. Commit cả report + index

## Format report

```markdown
# Test Log: [Tên] — YYYY-MM-DD

## Tổng kết

| Metric | Value |
|--------|-------|
| Test files | [số] |
| Total tests | [số] |
| Passed | [số] |
| Failed | [số] |
| Duration | [ms] |
| Framework | [tên + version] |
| Branch | [branch name] |

---

## [Tier/Suite Name] (`filename.test.ts`)

**Mục đích**: [1 câu — test cái gì, vì sao quan trọng]

| # | Test | Kết quả | Chi tiết |
|---|------|---------|----------|
| 1 | [tên test] | PASS/FAIL | [context ngắn] |

### Vì sao test này quan trọng
[2-3 câu — loại bug nào sẽ bắt được]

---

## Bugs phát hiện

| # | Mô tả | Severity | Status | Fix |
|---|-------|----------|--------|-----|
| 1 | [mô tả bug] | Critical/High/Medium/Low | Fixed/Open | [cách fix hoặc "cần investigation"] |

*Nếu không có bugs: "Không phát hiện bugs trong lần chạy này."*

---

## Giới hạn (thành thật)

| Không test được | Lý do | Cần gì để test |
|-----------------|-------|----------------|
| [item] | [lý do] | [cần gì] |

---

## Cách chạy lại

\`\`\`bash
[command chính xác]
\`\`\`
```

## Rules

- **KHÔNG bịa results.** Report từ output thật.
- **KHÔNG bỏ qua failures.** Mọi FAIL phải ghi + giải thích.
- Bugs phát hiện → ghi severity + status + fix ngay nếu được.
- Giới hạn → ghi thành thật, không che giấu.
- Mỗi test phải có "Vì sao quan trọng" — không test vô nghĩa.
