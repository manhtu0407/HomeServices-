# Worker Map Real Provider — MP0 Spike Companion Doc (Plan.md §37)

Status: **MP0 PARTIAL — việc 1–2 DONE (2026-06-10, Claude), việc 3–4 PENDING (device-bound, handoff below). BUILD GATE CHƯA MỞ** — MP1+ stays blocked until việc 3–4 pass and the renderer is locked.

Owner: Manh Tu. Plan: Plan.md §37 (Tu LOCK Hướng B + Option-1 Edge proxy, D1–D9).

---

## MP0 việc 1 — VietMap ToS proxy: verdict **SILENT** (not forbidden, not explicitly allowed)

Method: 4-angle web research workflow (ToS/legal, dev-docs, pricing, industry precedent) + adversarial verifier that re-fetched the load-bearing pages raw and re-ran live endpoint probes (2026-06-10).

**Evidence (verified verbatim against live pages):**
- VietMap Maps API overview (`maps.vietmap.vn/docs/map-api/overview/`) **recommends exactly our architecture**: "we strongly recommend that you integrate with our API **via your backend server**", "API Keys … must be securely stored and only used on your backend", "Never expose your API Key or Tokens on the frontend", and "**You may implement caching** or response filtering as appropriate." Section heading: "Backend Integration Guide for Secure API Communication".
- BUT the **tilemap docs** assume a client-embedded key ("set limitation (add referer and limit req by ip for APIKey)", offline tile caching on device) — whether the backend guide was written with *tile traffic* in mind is genuinely ambiguous.
- **No public Maps-API ToS exists**: `/console/terms`, `/console/terms-and-conditions`, `/console/terms-of-use` are all HTTP 404; the signup checkbox links to a Privacy Policy with zero usage clauses (0 hits for proxy/caching/redistribution).
- Key scope (verified): "Tilemap apikey only for display tilemap on the SDK, can't be used for other APIs". Billing: "1 transaction = 25 tile requests", "counted only once per unique tile URL".
- Live probes (reproduced): `style.json?apikey=dummy` → **HTTP 200** and templates the apikey into tile URLs; tile `.pbf` with dummy key → **HTTP 401**; `sprite.json` without key → **HTTP 200**; glyph URLs carry no key. ⇒ enforcement is at the tile endpoint only; the proxy must inject the key on tile requests, and sprite/glyphs can pass through.
- Industry context: MapTiler / Stadia / Thunderforest all **prohibit or fee-gate** exactly this proxy/cache pattern (verbatim quotes on file) — so VietMap's silence cannot be read as tacit consent.
- Precedent: one public repo (`huynqhe186603-prog/holamate-new`) runs a VietMap tile proxy with server-side key injection + 86400s cache — proves technical feasibility, not provider acceptance.

**Plan-gate ruling:** việc 1 *Pass* requires "xác nhận bằng điều khoản/văn bản". SILENT ≠ pass, SILENT ≠ STOP (nothing forbids it). **Action: Tu gửi email xác nhận cho VietMap** (template below) — spike work may continue in parallel, but **production tile traffic is gated on a written reply**, and a shared server-side cache is gated on an explicit "yes" to Q2.

**Email (send to `maps.info@vietmap.vn`, CC `maps-api.support@vietmap.vn` — CC address unverified):**

> Subject: Xác nhận kiến trúc backend proxy cho Tilemap API — [tên công ty]
>
> Chào đội ngũ VietMap,
>
> Chúng tôi đang xây dựng ứng dụng di động (React Native, dùng VietMap GL RN SDK) và làm theo "Backend Integration Guide for Secure API Communication" trong tài liệu Maps API: API key được giữ hoàn toàn phía server, mọi request từ app đi qua backend của chúng tôi (Supabase Edge Function, một dải IP egress) rồi mới đến máy chủ VietMap.
>
> Xin xác nhận bằng văn bản 5 điểm sau:
> 1. Chúng tôi được phép phục vụ **style.json và vector tiles (Tilemap API)** qua backend proxy của mình như trên — tile hiển thị duy nhất trong VietMap SDK, không tái phân phối cho bên thứ ba — đúng không?
> 2. Backend của chúng tôi có được phép **cache tile phía server** (ví dụ TTL 24h) để giảm transaction không? Nếu có, có giới hạn TTL/phạm vi nào không?
> 3. Với mô hình một IP egress duy nhất, cấu hình key khuyến nghị là gì — whitelist IP egress và **không** bật giới hạn per-IP?
> 4. Văn bản **Điều khoản sử dụng Maps API** chính thức nằm ở đâu? Checkbox đăng ký console hiện liên kết tới Privacy Policy, chúng tôi chưa tìm thấy ToS công khai.
> 5. Mô hình proxy này có ảnh hưởng gì đến cách tính transaction (25 tile request = 1 transaction) hoặc yêu cầu gói cước nào không?

**Decision rule:** written "yes" Q1 → proxy fully unblocked. "Yes Q1, no Q2" → ship pass-through proxy, NO shared cache. "No Q1" → STOP per plan; fallback = client-embedded restricted tilemap key (needs Tu amend RULES.md:41 — Option-2).

**Risk posture until reply:** worst realistic case is unilateral key suspension (no contract exists to protect either side). Mitigations baked into the spike: pass-through (no shared cache yet), stable tile URLs (billing counts unique URLs once), usage terminates in the VietMap SDK, whitelist the Edge egress IP, no per-IP key limit.

---

## MP0 việc 2 — Edge `/map/style` rewrite prototype: **DONE (code + tests; live fetch pending deploy)**

Per Plan.md §37.4 (v0.5 tweak): built as a **standalone spike function**, NOT wired into `mobile-api`.

| File | What it is |
|---|---|
| `supabase/functions/map-proxy-spike/style-rewrite.ts` | Pure rewrite module: rewrites every VietMap `sources[].tiles` / `sources[].url` / `glyphs` / `sprite` URL to `/u/{host}/{path}` on the proxy, strips ALL key params (`apikey`/`api_key`/`key`/`access_token`), keeps MapLibre `{z}/{x}/{y}`/`{fontstack}/{range}` braces literal (no `new URL` — WHATWG percent-encodes braces), plus `buildUpstreamUrl` inverse mapping with host allowlist + traversal guard + client-smuggled-key strip. |
| `supabase/functions/map-proxy-spike/index.ts` | Deno entrypoint: `GET /style?style=tm|lm|dm|hm|tf` (fetch upstream with key → rewrite → hard G2 self-check: 500 if any key material would leak) and `GET /u/{host}/{path}` passthrough with key injection, 15s timeout (RULES #10), safe-metadata logs only. |
| `apps/api/src/__tests__/unit/map-proxy-spike-style-rewrite.test.ts` | 8 unit tests — **run green 2026-06-10** (`npx vitest run … 128 passed` incl. these 8): zero key material in rewritten payload, braces literal, external hosts untouched+reported, idempotent re-rewrite, non-key params preserved, inverse URL build, allowlist + traversal rejection, smuggled-key strip. |

*Pass criteria status:* "trả style.json hợp lệ + grep payload = 0 apikey lộ" — proven at unit level; **live proof needs the spike deployed to staging** (key đã có trong Supabase secrets: `VIETMAP_API_KEY`). Deploy + curl check is folded into the việc-3 handoff below (1 command, no app code).

*Mapping note for MP2:* the spike uses a generic `/u/{host}/{path}` passthrough (robust to unknown style variants). Plan §37.5 sketches `/map/tiles|glyphs|sprite` routes — decide at MP2 whether to keep the generic scheme (recommended; less route churn) or specialize.

---

## MP0 việc 3–4 — HANDOFF (device + dev-client required; not executable in an agent-only env)

**Việc 3 — SDK + styleURL through the proxy.** Steps:
1. Deploy the spike: `supabase functions deploy map-proxy-spike --project-ref xyylanuyflrjzbjzhqfl` (needs `SUPABASE_ACCESS_TOKEN`; key already in staging secrets). Smoke: `curl -H "Authorization: Bearer <staging-anon-key>" "https://xyylanuyflrjzbjzhqfl.supabase.co/functions/v1/map-proxy-spike/style?style=tm" | grep -ci apikey` → must print `0`.
2. In a scratch Expo app (or a dev-client build of apps/mobile on a branch): `npx expo install @vietmap/vietmap-gl-react-native`, follow VietMap's Expo guide (prebuild/dev-client — NOT Expo Go).
3. `<MapView styleURL="https://xyylanuyflrjzbjzhqfl.supabase.co/functions/v1/map-proxy-spike/style?style=tm" …/>`. NOTE: the SDK may attach its own apikey to sub-requests — if so, the proxy strips it (`buildUpstreamUrl` already drops client-smuggled keys), record the behavior here.
4. *Pass:* real VietMap map renders on one physical device with tiles+glyphs+sprite ALL via the proxy (verify with the device's network log / charles — zero requests to `*.vietmap.vn` from the app), key absent from the JS bundle (`grep -r apikey` over the built bundle).
   Auth note: the function deploys with verify_jwt — pass the staging anon key as Bearer; if MapLibre cannot attach headers to style/tile requests on the native side, temporarily deploy the spike with `--no-verify-jwt` (staging only) and record that MP2 must solve auth properly (e.g. signed short-lived query token).

**Việc 4 — Expo compat.** Record: dev-client build worked? EAS profile changes needed? newArch (RN 0.81) issues? *Pass:* dev build runs the SDK. *Fail:* lock the WebView + VietMap GL JS fallback (same proxy) and record it here.

**Output to fill in:** renderer verdict (native SDK vs WebView fallback) + effort estimate MP1–MP7 → then MP0 gate OPENS and Claude verifies before MP1.

---

## Change log
- v0.1 — 2026-06-10 — Created at MP0 (Claude): việc 1 ToS research verdict SILENT + support-email template + decision rule; việc 2 prototype (pure rewrite + spike function + 8 unit tests green); việc 3–4 handoff steps. Gate remains CLOSED until việc 3–4 pass.
