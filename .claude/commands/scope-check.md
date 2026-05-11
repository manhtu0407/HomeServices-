# Scope Check

Đánh giá một feature hoặc task mới có nên build bây giờ không.

## Checklist

### 1. "Don't Build Now" List
Feature có nằm trong danh sách sau không?
- Multi-agent orchestration
- Autonomous booking (Kael tự book)
- Custom memory system
- Review Agent / CI Review Agent
- L3/L4 autonomy
- Mở rộng sang web platform
- Expand sang dịch vụ khác (ngoài điện + nước)
- Multi-city
- Bất kỳ "meta-orchestrator" nào

Nếu CÓ → 🔴 DEFER ngay.

### 2. Heuristic
- Cần hơn 1 tuần build? VÀ
- Chỉ cần thiết ở scale >10x hiện tại?

Nếu CẢ HAI đúng → 🔴 DEFER.

### 3. Survival Test
"Cái này có đóng góp trực tiếp vào việc đạt giao dịch thật đầu tiên không?"

Nếu KHÔNG → 🟡 DISCUSS với cộng sự.

## Output

```
🟢 BUILD — [lý do: trong scope + survival-critical]
🟡 DISCUSS — [borderline, cần cộng sự quyết định + 2–3 options]
🔴 DEFER — [lý do postpone + khi nào nên revisit]
```
