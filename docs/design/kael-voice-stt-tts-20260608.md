# Kael Voice — STT (on-device input) + ElevenLabs TTS (Kael voice) — Execution Plan (for Codex)

Date: 2026-06-08
Status: SPIKE-GATED. Scope locked by Tu 2026-06-08 (combine on-device STT + ElevenLabs TTS). Build owner: Codex. Verify owner: Claude. NOT started — Phase 0 spike must pass Tu's gate before any build.
Surface: Expo React Native (customer + worker Kael chat) + Supabase Edge `mobile-api` (TTS only).
Priority: **3** (after worker-vision and UX quick-wins). Lower survival priority, but Tu wants both input and output voice.
Scope: **(B) STT** — replace the web-only mic with real on-device speech-to-text that fills the composer draft; **(C) TTS** — give Kael a spoken voice via ElevenLabs, server-side, reading advisory/clarification text only — **never money/price numbers**.

English technical artifact; Vietnamese only for copy strings.

> **CODEX ROLE DIRECTIVE.** Senior AI-UX + RN-platform engineer. Voice is delight, not a first-transaction necessity — so prove value and cost in the spike before building. Two hard rules: (1) the ElevenLabs key lives server-side only (RULES #2); (2) TTS NEVER reads price/money numbers (mispronounced-price = broken trust, RULES #8). Voice is never the only path (a11y).

## 0. Metadata
- **Trigger:** Tu (2026-06-08): combine on-device STT + ElevenLabs TTS. Audit found voice is effectively absent on the real app — the composer mic is web-only ([agentic-parts.tsx:170-185,473](../../apps/mobile/components/customer/kael-chat/agentic-parts.tsx) `getKaelWebSpeechRecognition` returns null on native), and `apps/mobile/package.json` has **no** audio/speech dependency (`expo-av`/`expo-speech`/`expo-audio`/`react-native-voice` all absent).
- **Authority refs:** `RULES.md` #2 (provider keys server-side; ElevenLabs via Edge like `callAI`), #8 (no fake/false output — never read prices aloud), #9 (no PII — keep STT on-device, no audio upload). `STRUCTURES.md` runtime lock. `design.md` (LOCKED) + `kael-motion` for any voice-state motion. `code-ownership-map.md`.
- **Owner files:** mobile composer `apps/mobile/components/customer/kael-chat/agentic-parts.tsx` (`KaelChatComposer` mic) + worker mirror; new mobile audio util; new deps (a native STT module + `expo-audio`) — requires a **dev/EAS build** (not Expo Go). Edge: new TTS route in `router.ts`/`services.ts`, ElevenLabs key in `EdgeAiSecrets` (`kael/types.ts`), cost-tracking. Config: `app.config.ts` mic permission strings.
- **Skills mapping:** `kael-security-sweep` (key server-side, no PII, no audio upload), `kael-ai-boundary` (TTS never emits price/decision), `kael-frontend-test` (device recording — voice needs real device), `kael-supabase` (secret + route), `karpathy-guidelines`.
- **Decision log:**
  - 2026-06-08 — Tu: combine STT (on-device) + ElevenLabs TTS.
  - 2026-06-08 — Claude **(D1)** STT = **on-device** native recognition (no cloud STT) → zero per-use cost + audio never leaves the device (RULES #9). Do STT first (higher practical value for a repair app: dirty hands, fast description).
  - 2026-06-08 — Claude **(D2)** TTS = ElevenLabs via **Edge only**; cache audio by text hash to bound cost; **strip price/money before synthesis** (reuse `stripVndPatterns` discipline) so Kael never speaks a number.
  - 2026-06-08 — Claude **(D3)** voice is always optional; text remains the primary path; honor Reduce Motion for any speaking-state animation.
- **Change log:** 2026-06-08 v0.1 — initial spike-gated plan (Claude).

## 1. Execution plan

### Phase 0 — SPIKE (research; HARD GATE — Tu signs off before build)
- **0.1 (STT module)** Identify an on-device STT that works on Expo SDK 54 / RN 0.81 in a dev/EAS build (candidates: `expo-speech-recognition` community module, `@react-native-voice/voice`), with **Vietnamese locale**. **Acceptance:** a working spike on a real device transcribing VN into a text box; documented module + permission needs + Expo-Go limitation.
- **0.2 (ElevenLabs VN quality)** Synthesize sample Kael advisory copy (VI) via ElevenLabs; judge naturalness/pronunciation of Vietnamese. **Acceptance:** Tu-acceptable VN voice, or a decision to defer TTS.
- **0.3 (cost + latency)** Measure cost/char and TTS latency; design caching (text-hash). **Acceptance:** cost ceiling + cache plan within budget.
- **0.4 (no-price rule)** Confirm the strip-before-synthesis approach removes all price/money from any text sent to TTS. **Gate:** Tu reviews 0.1–0.4; build proceeds only on sign-off (TTS may be deferred while STT proceeds).

### Phase 1 — STT on-device (input) [build first]
- **1.1** add the chosen STT dep (dev/EAS build) + mic permission strings in `app.config.ts`.
- **1.2** **File:** `agentic-parts.tsx` `KaelChatComposer`. **Action:** replace the web-only mic with the native STT: on press, request mic permission, start recognition (VN locale), append the transcript to the draft via the existing `appendDraft`. Keep the web path as a fallback when `Platform.OS === 'web'`. **Acceptance:** on a real iOS/Android device, speaking fills the composer; permission-denied shows honest copy. **Evidence:** device recording. **Verify:** Claude.
- **1.3 (a11y/privacy)** audio stays on-device (no upload); a "listening" state respects Reduce Motion; mic is never required to send. **Verify:** Claude.
- **1.4** worker composer mirror (same pattern). **Verify:** Claude.

### Phase 2 — TTS Edge route (ElevenLabs) [only if 0.2/0.4 pass]
- **2.1** **File:** `kael/types.ts` (`EdgeAiSecrets` + `elevenLabsApiKey`), Edge env. **Action:** add the key server-side. **Verify:** Claude.
- **2.2** **File:** `router.ts` + `services.ts`. **Action:** `POST /kael/tts` (owner-access-checked) that takes a text id/field, **strips price/money** (reuse `stripVndPatterns` + a number guard), calls ElevenLabs, caches by text hash, returns audio (URL/stream). Never accepts arbitrary client text that could include prices — derive from the persisted advisory/clarification turn. **Acceptance:** returns cached audio for advisory text; refuses/那strips any price content; no key on client. **Evidence:** edge test (incl. a price-bearing input → no number in output). **Verify:** Claude.

### Phase 3 — Mobile playback [with Phase 2]
- **3.1** add `expo-audio`; new playback util.
- **3.2** **File:** `thread.tsx`. **Action:** a play button ONLY on advisory/clarification Kael turns (not on the estimate card / price rows). Tap → fetch + play; speaking-state visual respects Reduce Motion. **Acceptance:** Kael speaks advisory text; no play affordance on price content. **Evidence:** device recording. **Verify:** Claude.

### Phase 4 — Close
- Security/honesty audit: key server-side, no audio upload, no PII, **no price ever spoken**; cost within budget; `/log` + `/test-log` + recordings. **Verify:** Claude + Tu.

## 2. Honesty & safety contract
- TTS reads advisory/clarification only — **never** price/money/decision text (strip before synthesis).
- STT audio stays on-device; no upload (RULES #9).
- ElevenLabs key server-side only (RULES #2). Voice is always optional; text is primary (a11y).

## 3. Risks & mitigations
- **Expo Go cannot run native STT/audio** → dev/EAS build required; document for the test loop.
- **ElevenLabs VN quality / cost** → Phase 0 spike gate; defer TTS if quality/cost fail while STT ships.
- **Spoken price error** → strip-before-synthesis + no play affordance on price content; tested.
- **Permissions** → honest mic-permission copy; never block sending on mic.

## 4. Limitations / honesty
- Voice is a delight/accessibility feature, not a first-transaction need; sequenced after worker-vision and UX quick-wins.
- VN TTS quality and STT module compatibility are **unproven** until the Phase 0 spike on a real device.
