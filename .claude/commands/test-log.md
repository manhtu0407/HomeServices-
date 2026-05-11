# Test Log Index

Cập nhật `docs/test-logs/INDEX.md` — danh sách tất cả test reports.

## Khi nào dùng

Sau khi tạo test report mới bằng `/project:test-report`.

## Quy trình

1. Đọc `docs/test-logs/INDEX.md`
2. Thêm entry mới ở đầu (mới nhất trước)
3. Commit

## Format entry

```markdown
| YYYY-MM-DD | [Tên report](YYYY-MM-DD_tên.md) | X/Y passed | [bugs: N \| clean] | [notes ngắn] |
```

## Rules

- Entry mới ở ĐẦU bảng (reverse chronological)
- KHÔNG xóa hay sửa entry cũ
- Ghi chính xác số pass/fail — không làm tròn
- Nếu có bugs → ghi số lượng, không giấu
