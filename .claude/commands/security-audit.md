# Security Audit

Sweep codebase hoặc changes gần đây. Kiểm tra 5 areas:

## 1. Secrets Exposure
- Scan cho hardcoded API keys, tokens, passwords trong code
- Verify `.env` và `.env.local` có trong `.gitignore`
- Verify không có secrets trong client-side code (browser, React components, RN bundle)
- Verify `.env.example` có key names nhưng KHÔNG có values
- Mỗi secret mới: (1) `.env.example` (2) env validator (3) deployment config

## 2. PII in Logs
- Scan `console.log`, `console.warn`, `console.error`
- Không được log: số điện thoại đầy đủ, CCCD, địa chỉ đầy đủ, tokens, passwords
- Chỉ log: IDs, status codes, error codes, metadata không nhạy cảm

## 3. Input Validation
- User input validated + sanitized trước khi đưa vào DB
- User input validated + sanitized trước khi đưa vào LLM prompt
- File uploads: validate type + size
- System prompt có refusal instruction cho off-topic

## 4. Network Security
- Mọi network call có timeout (Anthropic 20s, Perplexity 15s, DeepSeek 10s)
- Retry logic: tối đa 2 lần, exponential backoff
- HTTPS only
- Budget cap: $0.50 per user session

## 5. AI-Specific
- Mọi AI API calls server-side only
- Responses validated trước khi đến user
- Không fabricate data khi API fail
- Rate limit cho AI API calls per session

## Output

```
✅ Clean: [areas không có issues]
⚠️ Warning: [potential issues cần xem xét]
❌ Critical: [must-fix ngay — block deployment]
```
