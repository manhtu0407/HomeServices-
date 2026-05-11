# Code Review

Chạy SAU khi code xong, TRƯỚC khi commit. Đọc RULES.md và verify từng rule:

## 10 Rules Check

- [ ] **Rule #1**: Secrets không ở client — không hardcode key, không expose ra browser/RN bundle
- [ ] **Rule #2**: AI API calls qua centralized wrapper (`@/lib/ai/client`) — không gọi SDK trực tiếp
- [ ] **Rule #3**: AI responses validated trước khi đến user — check format giá, off-topic, ngôn ngữ
- [ ] **Rule #4**: Price estimates có disclaimer — "Đây là ước tính dựa trên thị trường..."
- [ ] **Rule #5**: Vietnamese-first cho user-facing text — error messages, push notifications đều tiếng Việt
- [ ] **Rule #6**: Kael chỉ trả lời về điện và nước — hard rule, polite decline cho dịch vụ khác
- [ ] **Rule #7**: Không autonomous action — booking/payment/cancel phải có user confirm
- [ ] **Rule #8**: Không fake data — fallback OK, nhưng không fabricate data khi API fail
- [ ] **Rule #9**: Logging không chứa PII/secrets — chỉ IDs, status codes, metadata
- [ ] **Rule #10**: Timeout cho mọi network call — Anthropic 20s, Perplexity 15s, DeepSeek 10s

## Security Invariants

- [ ] `.env` files gitignored, `.env.example` có key names không có values
- [ ] Input validated + sanitized trước DB và LLM
- [ ] PII không bị share ngoài những gì cần cho job
- [ ] Rate limit considerations

## Code Quality

- [ ] Không over-engineering — giải pháp đơn giản nhất đạt yêu cầu
- [ ] Không thêm features ngoài scope task
- [ ] Không build thứ chỉ cần ở scale >10x hiện tại

## Output format

```
✅ Passed: [list]
❌ Failed: [list + specific fixes needed]
⚠️ Warnings: [list]
```
