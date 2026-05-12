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

---

# Testing Guidelines — Cách viết tests hiệu quả

> **Bối cảnh**: PR#4 có 280 tests PASS nhưng miss 4 critical bugs (middleware dead code, role escalation, env validator thiếu, admin RLS thiếu). Nguyên nhân gốc: tất cả 280 tests chỉ ở MỘT layer (static type checking). Không có test nào chạy code thật, test runtime behavior, hay test security properties. Guidelines dưới đây tồn tại để chuyện này không tái diễn.

---

## 1. Test Layers — KHÔNG ĐƯỢC chỉ test 1 layer

Mỗi layer bắt bugs ở tầng khác nhau. Thiếu layer nào = mù ở tầng đó.

| Layer | Test cái gì | Tools cần | Ví dụ cụ thể trong project |
|-------|------------|-----------|----------------------------|
| **Static/Type** | Types khớp schema, enums đúng, fields đúng nullable/required | Vitest + TS `satisfies` + compile-time assertions | Tier 1-4 hiện tại: "jobs table có 36 fields", "service_type chỉ có electrical + plumbing" |
| **Unit** | Một function hoạt động đúng với mọi input (happy + edge + error) | Vitest + mock dependencies | `isRetryable(new AIProviderError('anthropic', 429, ''))` → true, `sanitizeForLLM()` strip control chars, `checkRateLimit()` block sau khi hết tokens |
| **Integration** | Các module phối hợp đúng — module A gọi module B đúng cách | Vitest + real modules (mock external APIs only) | `callAI()` retry khi provider throw 429, `env.anthropicApiKey` throw khi key missing, health route return degraded khi DB fail |
| **SQL/Migration** | RLS policies cho đúng/chặn đúng, triggers fire đúng, constraints enforce đúng | Supabase local (`supabase start`) + SQL queries với different roles | Admin query jobs → có data, customer query jobs của người khác → empty, review chỉ tạo được khi job status = 'confirmed' |
| **Wiring** | File X thực sự được import và sử dụng bởi hệ thống, không phải dead code | Grep codebase + runtime verification | `proxy.ts` import `updateSession` từ `middleware.ts`, health route import `ensureServerEnv` từ `env.ts`, AI providers import `env` thay vì `process.env` trực tiếp |
| **E2E** | User flow từ đầu đến cuối hoạt động | Supabase local + HTTP requests + real DB | Signup → verify role = customer trong DB, POST /api/health → 200 với tất cả checks = ok |

### Rule cứng

- **Mỗi PR PHẢI có tests ở ít nhất 2 layers khác nhau.** Static-only = KHÔNG đủ.
- **Nếu PR có security change → BẮT BUỘC có tests ở SQL/Migration layer hoặc Integration layer.**
- **Nếu PR tạo file mới → BẮT BUỘC có wiring test verify file đó được import bởi ít nhất 1 file khác.**

---

## 2. Anti-patterns — 5 lỗi mà PR#4 mắc phải

Đây là danh sách cụ thể. Nếu session nào mắc lại bất kỳ lỗi nào → đó là lỗi của session đó, không phải thiếu guideline.

### Anti-pattern #1: Chỉ test "happy path" types

**Sai ở đâu**: 280 tests chỉ verify "field X tồn tại", "enum có đúng giá trị". Không test xem code thật có chạy đúng không. Type đúng ≠ runtime đúng.

**Fix**: Mọi module có exported function → phải có unit test gọi function thật, verify return value. Không chỉ verify type signature.

**Ví dụ cụ thể**:
```typescript
// SAI — chỉ test type
it('env has anthropicApiKey getter', () => {
  type Key = typeof env.anthropicApiKey // string
  expect(true).toBe(true) // vô nghĩa
})

// ĐÚNG — test runtime behavior
it('env.anthropicApiKey throws when ANTHROPIC_API_KEY missing', () => {
  delete process.env.ANTHROPIC_API_KEY
  expect(() => env.anthropicApiKey).toThrow('Anthropic API key not configured')
})
```

### Anti-pattern #2: Con số test lớn tạo cảm giác an toàn giả

**Sai ở đâu**: "280 tests pass" nghe ấn tượng nhưng tất cả 280 đều cùng 1 layer (static type checking). 10 integration tests có giá trị hơn 280 type-checking tests cho việc tìm bugs thực tế.

**Fix**: Phân bố tests across layers. Ưu tiên thứ tự:
1. Integration tests (bắt bugs thật nhiều nhất)
2. Unit tests (nhanh, dễ viết, bắt logic bugs)
3. Static/Type tests (bắt schema drift)
4. Wiring tests (bắt dead code)

**Metric đúng**: Không phải "bao nhiêu tests" mà "bao nhiêu layers được cover". 50 tests across 4 layers > 500 tests ở 1 layer.

### Anti-pattern #3: Test không chạy code thật

**Sai ở đâu**: `satisfies` chỉ check compile-time. `as any` bypass type system. `expect(true).toBe(true)` luôn pass. Những tests này cho cảm giác coverage nhưng không bắt runtime bugs.

**Fix**: Mọi `expect()` phải assert trên giá trị thật từ function call, không phải hardcoded value.

**Ví dụ cụ thể**:
```typescript
// SAI — luôn pass bất kể code có bug hay không
it('middleware exists', () => {
  const _check: typeof updateSession = {} as any
  expect(true).toBe(true)
})

// ĐÚNG — chạy code thật, verify behavior
it('backoffMs increases exponentially', () => {
  expect(backoffMs(0)).toBe(1000)
  expect(backoffMs(1)).toBe(2000)
  expect(backoffMs(2)).toBe(4000)
  expect(backoffMs(5)).toBe(10000) // capped at 10s
})
```

### Anti-pattern #4: Không test "cái KHÔNG nên xảy ra" (negative tests)

**Sai ở đâu**: Chỉ test "enum có 2 values" mà không test "user không thể tự set admin". Chỉ test "env trả về key" mà không test "env throw khi key thiếu". Positive tests verify tính năng hoạt động. Negative tests verify security + error handling.

**Fix**: Mỗi positive test → hỏi "cái gì KHÔNG nên xảy ra?" → viết negative test cho nó.

**Ví dụ cụ thể**:
```typescript
// Positive test (đã có)
it('service_type has electrical and plumbing', () => {
  expect(Constants.public.Enums.service_type).toEqual(['electrical', 'plumbing'])
})

// Negative test (THIẾU trong PR#4 — phải có)
it('signup with role=admin in metadata still gets customer role', async () => {
  const { data } = await supabase.auth.signUp({
    phone: '0900000099',
    password: 'test',
    options: { data: { role: 'admin' } }
  })
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('role')
    .eq('id', data.user!.id)
    .single()
  expect(profile!.role).toBe('customer') // NOT 'admin'
})
```

### Anti-pattern #5: Không test wiring (dead code invisible)

**Sai ở đâu**: `src/lib/middleware.ts` tồn tại, TypeScript compile thành công, nhưng KHÔNG file nào import nó → dead code. Không có test nào bắt điều này. File có thể tồn tại mãi mà không ai biết nó không được dùng.

**Fix**: Sau khi tạo file mới, verify nó được import bởi ít nhất 1 file khác.

**Ví dụ cụ thể**:
```typescript
// Wiring test cho proxy.ts
it('proxy.ts imports updateSession from lib/middleware', () => {
  // Read proxy.ts source, verify import statement exists
  const source = readFileSync(resolve(__dirname, '../../proxy.ts'), 'utf-8')
  expect(source).toContain("import { updateSession } from '@/lib/middleware'")
})

// Wiring test cho AI providers dùng env module
it('anthropic provider imports from env module, not process.env directly', () => {
  const source = readFileSync(
    resolve(__dirname, '../../lib/ai/providers/anthropic.ts'), 'utf-8'
  )
  expect(source).toContain("import { env } from '../../env'")
  expect(source).not.toContain('process.env.ANTHROPIC_API_KEY')
})
```

---

## 3. Checklist — BẮT BUỘC chạy trước khi báo "tests pass"

Session nào báo "tests pass" mà không đi qua checklist này = báo cáo sai.

```
TRƯỚC KHI BÁO "TESTS PASS":

[ ] 1. Có test cho MỌI file mới tạo/sửa không?
      → Nếu file mới mà không có test → giải thích tại sao trong report.

[ ] 2. Có negative tests không?
      → Invalid input, unauthorized access, missing config, edge cases.
      → Mỗi security change PHẢI có negative test.

[ ] 3. Có tests ở nhiều hơn 1 layer không?
      → Static + Unit = tối thiểu.
      → Nếu có migration → thêm SQL layer.
      → Nếu có new module → thêm Wiring layer.

[ ] 4. Có test runtime behavior không? (không chỉ compile-time)
      → Ít nhất 1 test gọi function thật và check return value.
      → `expect(true).toBe(true)` KHÔNG đếm.

[ ] 5. Có test wiring không? (file mới được import đúng chỗ?)
      → Grep hoặc đọc source verify import tồn tại.

[ ] 6. Nếu có security change → có test verify security property?
      → Role-based: test đúng role access, sai role bị chặn.
      → Input validation: test malicious input bị reject.

[ ] 7. Nếu có migration mới → có test verify RLS/triggers/constraints?
      → Chạy SQL query as different roles, verify results.

[ ] 8. Phần "Giới hạn" có ghi rõ những gì KHÔNG test được và tại sao?
      → "Cần Supabase local running" = lý do hợp lệ.
      → Không ghi giới hạn = không thành thật.

[ ] 9. `npm test` pass?
[ ] 10. `npx tsc --noEmit` pass? (0 errors)
[ ] 11. `npm run build` pass? (nếu applicable)
```

---

## 4. Template test theo từng loại thay đổi

Khi viết code thuộc loại nào → PHẢI có tests tương ứng. Không có ngoại lệ.

### 4.1 New file / module

```
Bắt buộc:
  ✓ Unit test cho mỗi exported function
  ✓ Wiring test: verify ít nhất 1 file khác import module này
  ✓ Edge case: empty input, null, undefined, boundary values

Ví dụ: Tạo src/lib/validation.ts
  → Unit test: jobCreateSchema.parse() với valid + invalid input
  → Unit test: sanitizeForLLM() strip control chars, truncate long strings
  → Wiring test: verify API route import validation module
```

### 4.2 Migration (SQL)

```
Bắt buộc:
  ✓ RLS test: đúng role truy cập đúng data
  ✓ RLS negative test: sai role bị chặn
  ✓ Constraint test: invalid data bị reject (CHECK, UNIQUE, NOT NULL)
  ✓ Trigger test: trigger fire đúng (updated_at, auto-create profile, rating update)
  ✓ Nếu là migration sửa function → test function cũ không còn vulnerable

Ví dụ: Migration fix handle_new_user() + admin RLS
  → Test signup metadata {role:'admin'} → profile.role = 'customer'
  → Test admin user query jobs → có data
  → Test customer query jobs người khác → empty
  → Test is_admin() function return đúng cho admin, sai cho customer
```

### 4.3 Env / Config change

```
Bắt buộc:
  ✓ Test throw khi biến thiếu (clear env, call getter, expect throw)
  ✓ Test trả đúng giá trị khi biến có
  ✓ Test build không crash khi env chưa set (build-time safety)

Ví dụ: Refactor env.ts
  → delete process.env.ANTHROPIC_API_KEY → env.anthropicApiKey throws
  → set process.env.ANTHROPIC_API_KEY = 'sk-test' → env.anthropicApiKey === 'sk-test'
  → isBuildTime = true → validateClientEnv() không throw
```

### 4.4 AI provider change

```
Bắt buộc:
  ✓ Unit test error handling: provider throw AIProviderError với đúng status code
  ✓ Unit test retry logic: 429/500 → retry, 401/404 → không retry
  ✓ Unit test cost calculation: verify math đúng
  ✓ Unit test timeout: verify withTimeout reject sau đúng ms

Ví dụ: Thêm AIProviderError class
  → new AIProviderError('anthropic', 429, 'rate limit').retryable === true
  → new AIProviderError('anthropic', 401, 'unauthorized').retryable === false
  → isRetryable(new AIProviderError(..., 500, ...)) === true
  → isRetryable(new Error('random')) === false
```

### 4.5 Security fix

```
Bắt buộc:
  ✓ Reproduction test: chứng minh exploit CŨ hoạt động TRƯỚC fix (nếu có thể)
  ✓ Verification test: chứng minh exploit KHÔNG CÒN hoạt động SAU fix
  ✓ Regression test: đảm bảo fix không phá normal functionality

Ví dụ: Fix role escalation
  → TRƯỚC fix: signup({data:{role:'admin'}}) → profile.role = 'admin' (vulnerable)
  → SAU fix: signup({data:{role:'admin'}}) → profile.role = 'customer' (fixed)
  → Normal flow: signup bình thường → profile.role = 'customer' (không bị ảnh hưởng)
```

### 4.6 Bug fix

```
Bắt buộc:
  ✓ Regression test: reproduce bug trước → verify fix → test không tái phát
  ✓ Test viết TRƯỚC fix (TDD approach) — chạy fail → fix → chạy pass

Ví dụ: Fix isRetryable() string matching
  → Test cũ: isRetryable(error với message chứa "500") → true (fragile)
  → Test mới: isRetryable(AIProviderError(500)) → true (typed)
  → Negative: isRetryable(Error('got 500 points')) → false (không retry do message ngẫu nhiên)
```

---

## 5. Bài học cụ thể từ PR#4 — Audit Findings

Đây là record vĩnh viễn. Mỗi bug, tại sao miss, test nào cần có.

| # | Bug bị miss | Severity | Tại sao miss | Layer thiếu | Test cần có (cụ thể) |
|---|-------------|----------|-------------|-------------|----------------------|
| 1 | `src/lib/middleware.ts` là dead code — `updateSession()` defined nhưng không file nào import | Critical | Không có wiring test. 280 static tests không detect dead code. | Wiring | `grep -r "updateSession" src/` verify có ≥1 file import ngoài file định nghĩa. Hoặc: đọc `proxy.ts` source, assert chứa import statement. |
| 2 | `handle_new_user()` cho phép user tự set role = 'admin' qua signup metadata | Critical | Không có security negative test. Chỉ test "enum có 3 roles" nhưng không test "user không thể chọn role" | SQL/Migration + Negative | Signup với `{role:'admin'}` → query profiles → assert role = 'customer'. Cần Supabase local running. |
| 3 | `env.ts` chỉ validate client keys, server keys dùng `?? ''` → silent failure | High | Không test runtime throw. Chỉ test "env object tồn tại" (static). | Integration + Negative | `delete process.env.ANTHROPIC_API_KEY` → `expect(() => env.anthropicApiKey).toThrow()`. Pure unit test, không cần infra. |
| 4 | Không có RLS policy nào cho admin → admin panel query → empty/denied | Critical | Không test "admin có thể làm gì". Chỉ test "RLS enabled" (regex SQL). | SQL/Migration | Query `jobs` as admin user → assert rows returned. Query `api_logs` as admin → assert rows returned. Cần Supabase local. |

### Root cause chung

**280 tests đều là static analysis — đọc file, check type, regex SQL. KHÔNG test nào chạy code, gọi function, hay query database.**

Kết quả: mọi thứ "nhìn đúng" ở level types nhưng KHÔNG hoạt động ở level runtime.

### Nguyên tắc rút ra

1. **Static tests verify "code trông đúng". Runtime tests verify "code chạy đúng".** Cần CẢ HAI.
2. **Nếu chỉ có 1 loại test → chọn integration tests.** Chúng bắt bugs thật nhiều nhất.
3. **"Tests pass" KHÔNG có nghĩa "code đúng".** Tests chỉ tốt bằng những gì chúng thực sự kiểm tra.
4. **Mỗi test report PHẢI có phần "Giới hạn" liệt kê rõ những gì KHÔNG ĐƯỢC test.** Đây là phần quan trọng nhất — nó cho biết blind spots ở đâu.
5. **Negative tests quan trọng hơn positive tests cho security.** "Admin CÓ THỂ query" ít quan trọng bằng "Customer KHÔNG THỂ query data người khác".
