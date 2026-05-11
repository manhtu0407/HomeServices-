# Pre-Flight Check

Chạy TRƯỚC khi bắt đầu bất kỳ coding task nào. Đọc STRUCTURES.md và RULES.md, sau đó verify:

1. **Scope check**: Feature này thuộc sửa điện hoặc sửa nước không? Nếu không → STOP.
2. **"Don't build" check**: Xem STRUCTURES.md mục 7 (Future Roadmap). Feature có trong danh sách "don't build now" không? Nếu có → STOP.
3. **Survival test**: "Cái này có đưa chúng ta đến giao dịch thật đầu tiên không? Hay nó chỉ thỏa mãn về mặt kỹ thuật?" Nếu không liên quan → flag ngay.
4. **Applicable rules**: Liệt kê rule numbers từ RULES.md áp dụng cho task này.
5. **Security**: Có implications về secrets, PII, hoặc input validation không?

## Output format

```
✅ Scope: [pass/fail + reason]
✅ Not on "don't build" list: [pass/fail]
✅ Survival test: [pass/fail + cách nó đóng góp vào transaction đầu tiên]
📋 Applicable rules: [Rule #X, #Y, #Z]
🔒 Security notes: [concerns hoặc "None"]
```

Nếu bất kỳ check nào FAIL → dừng lại, báo cáo cho cộng sự, đề xuất hướng khác.
