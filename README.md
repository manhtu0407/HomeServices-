# Home Services — Progress Log

### 2026-05-11 — PR#3 Schema Tests

- **Task**: Viết 177 test cases cho database schema PR#3 (4 files, Vitest)
- **Result**: 177/177 PASSED — 4 files, 312ms. Tier1 (types), Tier2 (business rules), Tier3 (relationships), Tier4 (SQL migration).
- **Next**: Merge tests vào PR#3, tiến tới Phase 1 application code
- **Blockers**: None. `database.types.ts` có artifact `<claude-code-hint>` tag cần remove (đã fix).

### 2026-05-12 — Foundation Hardening (Phase 0)

- **Task**: Fix 6 infrastructure gaps phát hiện qua audit: env validator, type-safe Supabase, AI wrapper, CLAUDE.md updates, settings.json, layout.tsx
- **Result**: 6/6 items done. `npm run build` pass, 177/177 tests pass. Files: `src/lib/env.ts`, `src/lib/ai/` (client + types + 3 providers), `server.ts`/`client.ts`/`middleware.ts` type-safe, CLAUDE.md thêm Platform/Structure/Phase, settings.json mở rộng, layout.tsx lang=vi
- **Next**: Feature implementation plan (riêng) — bắt đầu từ Auth (A0/B0)
- **Blockers**: None
