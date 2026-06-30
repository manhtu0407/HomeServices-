# Kael Price Visualization (A5 estimate) — Execution Plan (for Codex)

Date: 2026-06-08
Status: APPROVED scope + approach, decisions locked by Tu 2026-06-08. Build owner: Codex. Verify owner: Claude. NOT started.
Surface: Expo React Native customer app (A5 estimate card). v1 is **frontend-only**; no Edge/DB change.
Scope: ONE trust-building visual encoding on the price-check estimate — a **price-range band** + a **confidence gauge** — rendered with hand-rolled `react-native-svg`, fed by a **deterministic, Zod-validated view-model derived from data the client already has**. The literal market-comparison band (quoted vs market low/median/high) is **Option B (deferred)** because the data is not honestly available client-side yet (see §2, Appendix B).

This is an engineering artifact (English technical). The only Vietnamese content is user-facing copy strings (product copy, Vietnamese-first with EN switch).

> **CODEX ROLE DIRECTIVE (read first, adopt before any work).**
> Act as a senior Anthropic product engineer on the "structured model output → safe rendered surfaces" lineage (Artifacts / tool-result rendering) with deep React Native + data-viz and AI-honesty-in-UI experience. You are Tu's technical co-founder, not a code generator. The bottleneck here is **trust and correctness of rendered AI data**, not chart fanciness. Challenge weak assumptions out loud, prefer the smallest safe change, and treat the visual as something the customer must be able to **trust at a glance** before the first transaction. A phase is not "done" until the change is **visible in the running app with captured evidence**. Never draw a number the data does not honestly support (RULES #8).

---

## 0. Metadata

- **Trigger:** Tu asked to upgrade Kael's *Visualize* capability. A unified codebase audit (2026-06-08) found the proposed 4-layer "Visualization Engine" plan was (a) written for a Next.js/web stack (Recharts/Mermaid/Vitest-only/`/app/chat/page.tsx`/"XSS") that this product is not, and (b) already ~3/4 built and more rigorously than the notes described (Data Contract, Orchestrator Binding, PII/number Safety). The single genuine gap is the **visual-encoding layer**: Kael renders estimates as `InfoRow` label/value text; `react-native-svg` is used only for chrome icons. There is no visual showing where the quoted price sits or how confident it is.
- **Authority refs (cannot be bypassed):** `RULES.md` #2 (AI server-side via `callAI`), #3 (Zod-validated AI output), #6 (service scope electrical/plumbing/cleaning), #8 (no fake/fabricated data — **central to this plan**), #9 (no PII in logs/rows). `STRUCTURES.md` runtime lock (mobile → Auth → Edge `mobile-api` → DB/RPC/AI; v1 does **not** change the response contract). `critical.md` §0 lifecycle + verification gates. `design.md` (LOCKED) visual/motion contract. `CLAUDE.md` runtime boundary (mobile never calls AI directly; workflow-state stays server-validated). `docs/architecture/code-ownership-map.md` owners.
- **Owner files (from `code-ownership-map.md`):**
  - shared contract: `packages/shared/kael/schemas/index.ts` (+ barrel export in `packages/shared/package.json` `./kael/schemas`), tests `packages/shared/src/__tests__/`.
  - mobile render: `apps/mobile/components/customer/kael-chat/agentic-parts.tsx` (`EstimateCard`, `EstimateInline`, `InfoRow`, `formatPriceRange`), new sibling `apps/mobile/components/customer/kael-chat/price-visuals.tsx`, tests `apps/mobile/components/customer/kael-chat/__tests__/`.
  - tokens/material: `apps/mobile/components/ui/tokens.ts`, `apps/mobile/components/customer/customer-theme`, `apps/mobile/components/ui/{glass-surface.tsx,reduce-motion-aware-animation.ts,accessibility-motion.ts,motion-tokens.ts}`.
  - api types (read-only for v1): `apps/mobile/lib/api-types.ts` (`KaelEstimate`, `KaelChatResponse`).
  - **Out of bounds for v1:** `supabase/functions/mobile-api/**` (no Edge change), `supabase/migrations/**` (no migration), prompts/system-prompt (no LLM change — numbers stay deterministic).
- **Skills mapping:** `kael-ai-boundary` (honesty, no raw/fake AI numbers), `kael-frontend-test` (RNTL + real screenshot evidence; RN reality — no web/hover/DOM), `kael-motion` (chart entrance + Reduce Motion budget), `glass-liquid-signature` (neutral base + ONE mint accent, specular sheen, mode-aware edge), `kael-tdd` (failing test first, ≥2 layers), `karpathy-guidelines` (surgical diffs), `kael-security-sweep` (no PII, no provider names) — relevant if Option B is later scoped.
- **Decision log:**
  - 2026-06-08 — Tu **(D1)** charting approach = **hand-rolled `react-native-svg`** (already a dependency `15.12.1`; zero bundle bloat; exact glass-liquid control; correct for 2–3 bespoke charts). Rejected `victory-native` / `react-native-gifted-charts` (extra dep + style-fit cost).
  - 2026-06-08 — Tu **(D2)** scope = **price-in-market + confidence only** (A5 estimate). Scope-change delta (B6/A11) and lifecycle timeline are deferred.
  - 2026-06-08 — Tu **(D3)** workflow = **plan-first; Codex builds, Claude verifies** (matches the §31 / §32 division of labor). No code until Tu approves this plan.
  - 2026-06-08 — Claude **(D4, senior call, locked in this plan)** v1 is **frontend-only and honest**: the client already has `price_min/max`, `confidence`, `complexity` on `session.estimate`, which is enough to visualize an *estimated range + confidence*. The client does **not** have a trustworthy market band (low/median/high) → drawing a "market average" line now would be fabricated (RULES #8). The real market-comparison band is **Option B (deferred)**, gated on a `synthesis.ts` audit + Source-Trust (`Plan.md §25`). To avoid overclaiming, the v1 component is named **`PriceRangeBand`**, not "market comparison".
  - 2026-06-08 — Claude **(D5)** the existing `InfoRow` text rows in `EstimateCard` **stay** as the canonical, screen-reader-accessible source of truth. The chart **augments**; it never replaces the text. (RN screen readers cannot read SVG paths.)
- **Change log:**
  - 2026-06-08 v0.1 — initial execution plan (Claude), authored after the unified visualization audit and Tu's D1–D3.

---

## 1. Problem (audit-grounded, evidence cited)

What already exists (do **not** rebuild):
- **Data Contract** — `packages/shared/kael/schemas/index.ts` `estimateCardV3Schema` (Zod 4 `.strict()` + `superRefine`: `price_max ≥ price_min`, `needs_inspection ⇒ low confidence + advisory`, etc.); `supabase/functions/mobile-api/_shared/kael/artifact-contract.ts` (`kaelArtifactProposalSchema`, `kaelTicketPatchSchema` forbidding workflow-status keys). Risk/deviation logic already exists: `packages/shared/kael/anti-fraud.ts` `calculateScopeChangeAnomaly` (`driftRatio`/`score`).
- **Orchestrator Binding** — `supabase/functions/mobile-api/_shared/kael/output-pipeline.ts` `runKaelOutputPipeline()` = `safeParse(raw) → fallback → sanitize → re-parse → render` with a `fallback_used` flag.
- **Safety** — `packages/shared/kael/sanitizers/index.ts` (`scrubPiiText`, `stripVndPatterns`, control-char strip) runs inside the pipeline and renderers. (RN has no DOM/`innerHTML`; `<Text>` does not execute markup — browser-style XSS is not the threat model. PII/price/number leakage is, and it is already handled.)

What is missing (this plan):
- **Visual encoding.** `apps/mobile/components/customer/kael-chat/agentic-parts.tsx` `EstimateCard` (≈ lines 993–1055) renders price/confidence as `InfoRow` text (`Khoảng giá: 250.000đ - 450.000đ`, `Độ tin cậy: 72%`). `react-native-svg` is imported only for chrome icons (`ChatBackIcon`/`ChatSendIcon` etc., ≈ lines 1150–1190). No bar/gauge shows the magnitude of the range or the confidence at a glance.

Honest data inventory — what the client actually has on `session.estimate` (`apps/mobile/lib/api-types.ts` `KaelEstimate`, lines 34–43):
```
problem_category: string
problem_summary: string
complexity: 'small' | 'medium' | 'large'
price_min: number          // VND
price_max: number          // VND
confidence: number         // 0..1 (the mobile card renders Math.round(confidence*100)%)
advisory: string | null
disclaimer: string
```
`price_source` and `needs_inspection` are **not** on `KaelEstimate`; they live on the optional `estimate_card_v3?: Record<string, unknown>` (api-types.ts:49). A trustworthy market band (low/median/high) is **not** exposed to the client at all. ⇒ v1 visualizes only what is guaranteed-honest: the quoted range, the confidence, and complexity context.

Related perf gap (NOT in D2 scope, flagged honestly): the chat thread renders with a plain `ScrollView` + `turns.map(...)` (`thread.tsx:164,168`), not a virtualized `FlatList`. For long Kael threads this is a real risk; tracked in §6 as a deferred follow-up, not built here.

---

## 2. Reframe (locked)

- **v1 = a frontend-only, honest re-presentation of existing estimate data.** No Edge change, no migration, no prompt change. The numbers are already server-computed and Zod-validated; the chart is a deterministic *view* of them.
- **Deterministic derivation, not LLM output.** A pure function `buildPriceVisualModel(estimate)` (shared) maps `KaelEstimate` → a validated `kaelPriceVisualModel`. The model is the chart's only input. No model call, no client guesswork beyond clamping/normalizing.
- **Honesty over richness.** If a value is absent or out of range, the model degrades to a safe state (e.g., collapse a zero-width band to a single marker; clamp `confidence` into `[0,1]`; if `price_max < price_min` treat as a point estimate). The component **never** invents a market average; the "market band" channel is `null` in v1 and only populated by Option B with a real, audited source.
- **The chart augments, never replaces, the accessible text** (D5). The `InfoRow` price/confidence rows remain; the chart sits above them inside the card. The chart carries its own `accessibilityLabel` summarizing the numbers so it is not a silent visual.
- **House style, not generic charts.** Neutral base + ONE mint accent + restrained copper only for an uncertainty/warning state, per `design.md` + `glass-liquid-signature`. Respect dark mode, Reduce Transparency, Reduce Motion.

---

## 3. Data contract (L1) — `kaelPriceVisualModel`

New, additive, **view-model only** (does not touch `estimateCardV3Schema` or any Edge response contract). Lives in `packages/shared/kael/schemas/index.ts`, exported via the existing `./kael/schemas` barrel.

Proposed shape (Codex finalizes field names in Phase 1; refine rules are the contract):
```
kaelPriceVisualModelSchema = z.object({
  quoted: z.object({
    min: z.number().int().positive(),
    max: z.number().int().positive(),
  }).strict(),
  confidence: z.object({
    value: z.number().min(0).max(1),                  // normalized 0..1
    bucket: z.enum(['low','medium','high']),           // derived for color/segment
  }).strict(),
  complexity: z.enum(['small','medium','large']),
  market: z.object({                                    // OPTION B ONLY; null in v1
    low: z.number().int().positive(),
    median: z.number().int().positive(),
    high: z.number().int().positive(),
  }).strict().nullable(),
  deviation: z.object({                                 // OPTION B ONLY; null in v1
    ratio: z.number(),                                  // quoted vs market
    flag: z.enum(['within','elevated','high']),
  }).strict().nullable(),
}).strict().superRefine(...)
```
Refine rules (the real value of L1):
- `quoted.max >= quoted.min` (else builder collapses to a point estimate before validation).
- `confidence.bucket` consistent with `confidence.value` (e.g. `<0.45 → low`, `<0.75 → medium`, else `high`; mirror `numericConfidenceToLabel` in `output-pipeline.ts` so client and server agree).
- `market` ordering `low ≤ median ≤ high` when present.
- `deviation` is non-null **iff** `market` is non-null (you cannot deviate from a band you do not have).

Builder: `buildPriceVisualModel(estimate: KaelEstimate): KaelPriceVisualModel`
- Clamp/round `quoted` (reuse the `Math.max(1, Math.round(...))` discipline already in `output-pipeline.ts`/`fallbacks`).
- Normalize `confidence` to `[0,1]`; derive `bucket`.
- `market = null`, `deviation = null` in v1.
- Total function: any malformed input yields a safe model (never throws into render).

---

## 4. Execution plan

Conventions per step: **File(s) → Action → Acceptance → Evidence/Test → Verify (Claude)**. Surgical diffs (`karpathy-guidelines`). Each phase ends with a `/log` entry to `README.md` and must pass `critical.md` review/verify gates before merge. Frontend phases are not done without a screen recording / screenshots of the real app (`kael-frontend-test`).

### Phase 0 — Pre-plan / context load (Codex reads; NO code)
- **0.1** Read the governance stack in authority order (`critical.md → RULES.md → STRUCTURES.md → design.md → AGENTS.md → CLAUDE.md → code-ownership-map.md → skills.md → karpathy SKILL.md → MEMORY.md`). **Acceptance:** restate the runtime lock, RULES #3/#6/#8/#9, and the "no fake data / no provider names" rule.
- **0.2** Read `design.md` (LOCKED) sections on cards, color/material, motion/loading. **Acceptance:** confirm whether a chart/data-viz pattern is already covered. If **not covered**, FLAG it for Tu (do not freelance a new visual language) — proceed with `glass-liquid-signature` defaults pending Tu.
- **0.3** Confirm the exact `session.estimate` (`KaelEstimate`) fields in `apps/mobile/lib/api-types.ts` and whether `estimate_card_v3` is reliably present (it is `Record<string, unknown>`). **Acceptance:** decision recorded — v1 reads only guaranteed `KaelEstimate` fields; `price_source`/`needs_inspection` enrichment from `estimate_card_v3` is OPTIONAL and only added if safely parseable.
- **0.4 (scopes Option B)** Audit `supabase/functions/mobile-api/_shared/kael/{synthesis.ts,market.ts}`: does the pipeline compute a **trustworthy** market band (low/median/high), and is it safe/honest to surface? Cross-check Source-Trust (`Plan.md §25`). **Acceptance:** a written yes/no. If yes → Option B becomes a separate follow-up plan; if no → Option B stays deferred and v1's `market` channel stays `null`. **Do not** surface a band that is a single baseline point dressed up as a range.
- **0.5** If alignment is unclear, run the interview loop (hypothesis + confidence + one focused question) and stop for Tu. **Gate:** Tu (or Claude on Tu's behalf) signs off the Phase 0 restatement before Phase 1.

### Phase 1 — L1 contract + deterministic builder (shared; Vitest)
- **1.1** **File:** `packages/shared/kael/schemas/index.ts`. **Action:** add `kaelPriceVisualModelSchema` (+ inferred type) per §3, `.strict()` with the four refine rules. **Acceptance:** schema accepts a valid v1 model and rejects each violated refine. **Evidence:** Vitest (pattern: `packages/shared/src/__tests__/kael-output-format.test.ts`), new `kael-price-visual.test.ts`; coverage ≥ 90% of the schema/builder (the bar from the original notes). **Verify:** Claude reads tests + runs Vitest.
- **1.2** **File:** same module (or `packages/shared/kael/` sibling). **Action:** add `buildPriceVisualModel(estimate)` total function; reuse confidence-bucketing from `output-pipeline.ts` `numericConfidenceToLabel` to keep client/server agreement (extract a shared helper if cleaner — do not duplicate the thresholds). **Acceptance:** valid estimate → valid model; malformed (max<min, confidence 1.4, NaN) → safe model, never throws. **Evidence:** Vitest edge-case table. **Verify:** Claude.
- **1.3** **Phase gate:** Vitest green; `type-check` clean in `packages/shared`; `/log`.

### Phase 2 — L2 chart primitives (mobile; hand-rolled `react-native-svg`)
- **2.1** **File:** new `apps/mobile/components/customer/kael-chat/price-visuals.tsx`. **Action:** `PriceRangeBand` — a horizontal SVG track with the quoted `[min,max]` segment in mint; min/max VND labels via the existing `formatPriceRange`/`vndFormatter` (reuse from `agentic-parts.tsx`, do not duplicate). When `market` is present (Option B) it underlays a neutral band + a deviation marker; in v1 (`market === null`) it renders the quoted range on a neutral, self-scaled axis with an honest "estimated range" caption — **no** market line. **Acceptance:** props-in only (the `kaelPriceVisualModel`); no fetch, no business logic, no API import. **Evidence:** RNTL render tests; static test asserting no API/business-logic import. **Verify:** Claude.
- **2.2** **File:** same. **Action:** `ConfidenceGauge` — a small SVG arc or 3-segment gauge driven by `confidence.value`/`bucket`; mint fill; copper only for `low` + an explicit uncertainty caption. **Acceptance:** renders for low/medium/high; the numeric label matches the existing `Math.round(value*100)%`. **Verify:** Claude.
- **2.3 (a11y, mandatory)** **File:** same. **Action:** every chart carries a single `accessibilityLabel` summarizing the data in VI/EN (e.g. `Khoảng giá ước tính 250.000đ đến 450.000đ, độ tin cậy trung bình`); the SVG internals are `accessible={false}`/not focusable so the screen reader reads one coherent sentence, not path noise. **Acceptance:** RNTL `getByLabelText` finds the summary; VI primary + EN parity. **Verify:** Claude.
- **2.4 (theming)** **File:** same. **Action:** consume `useKaelChatTokens()` (dark mode), and the Reduce Transparency fallback already wired through those tokens; no hard-coded colors. **Acceptance:** correct in light + dark + Reduce Transparency. **Evidence:** RNTL three modes + screenshots. **Verify:** Claude.

### Phase 2M — Chart motion (frontend, visible; `kael-motion` + `glass-liquid-signature`)
- **2M.1** **File:** `price-visuals.tsx`. **Action:** on first appearance, the band fills and the gauge sweeps with a single spring-overshoot + specular sheen entrance (Reanimated worklet / native driver), per the signature. One entrance, no decorative auto-loop. **Acceptance:** plays once on mount, settles; no re-trigger on parent re-render. **Evidence:** recording. **Verify:** Claude.
- **2M.2 (Reduce Motion)** **Action:** RM → instant final state, no sweep/sheen (`reduce-motion-aware-animation.ts` / `accessibility-motion.ts`). **Acceptance:** static correct path. **Evidence:** RNTL RM test. **Verify:** Claude.
- **2M.3** If §2A/`design.md` does not already cover a chart-entrance pattern, FLAG for Tu (per 0.2) rather than inventing one. **Verify:** Claude + Tu.

### Phase 3 — Wire into the estimate card (visible in app)
- **3.1** **File:** `apps/mobile/components/customer/kael-chat/agentic-parts.tsx` (`EstimateCard`). **Action:** call `buildPriceVisualModel(estimate)` and render `PriceRangeBand` + `ConfidenceGauge` near the top of the card, **above** the existing `InfoRow`s, which stay unchanged (D5). Keep the disclaimer and platform-fee rows exactly as-is. **Acceptance:** card shows the visuals + all current text; no regression to existing `customer-kael-chat-estimate-card` test IDs. **Evidence:** RNTL on `EstimateCard` + screenshot. **Verify:** Claude.
- **3.2 (honesty states)** **File:** same. **Action:** when the estimate reflects an uncertain/low-confidence case, the gauge shows the `low`/uncertainty state and the band caption stays "estimated range" — never a confident-looking precise bar. **Acceptance:** a low-confidence fixture renders the uncertainty treatment, not a false-precision band. **Evidence:** RNTL negative-ish test. **Verify:** Claude.
- **3.3 (perf — lazy mount)** **Action:** the chart subtree mounts only when an estimate exists (it already renders conditionally via `lifecyclePanel === 'estimate'` in `thread.tsx`); keep SVG nodes minimal; do not re-render the whole turn list when the card mounts. **Acceptance:** no measurable first-paint regression on the chat thread. **Evidence:** before/after note. **Verify:** Claude.
- **3.4 (VISIBLE DONE)** **Evidence required:** screenshots/recording of the running app showing the estimate card with the band + gauge in **light, dark, and Reduce Motion**, plus a low-confidence case. **Verify:** Claude reviews; Phase 3 is not done without it.

### Phase 4 — Close-out
- **4.1** Honesty + security pass (`kael-security-sweep`, RULES #8/#9): no fabricated market line in v1; no provider names; no PII; numbers match the source estimate exactly. **Verify:** Claude.
- **4.2** Full Reduce Motion / Reduce Transparency / contrast pass on the new visuals (`kael-motion`, a11y). **Verify:** Claude.
- **4.3** Test log + evidence index (`/test-log`, `/log`); update `code-ownership-map.md` UI section to note `price-visuals.tsx` ownership (not locked). **Verify:** Claude.
- **4.4** Flag the deferred items in §6 for Tu (thread virtualization; Option B). **Verify:** Tu.

---

## 5. Honesty & safety contract (RULES #8/#9, `kael-ai-boundary`)

- v1 visualizes **only** `price_min`, `price_max`, `confidence` (and `complexity` context) from the already-validated estimate. No new numbers are introduced.
- **No market-average / "you're paying X% above market" line in v1** — that band is not honestly available client-side; it is Option B with an audited source.
- The chart never shows more precision or certainty than the estimate has (low confidence ⇒ visible uncertainty, not a crisp bar).
- The accessible `InfoRow` text remains the canonical source; the chart carries an equivalent `accessibilityLabel`.
- No PII, no provider names, no raw AI text in any chart label. Disclaimer (`KAEL_PRICE_DISCLAIMER_V3`) stays on the card.

---

## 6. Risks & mitigations

- **Overclaiming "market comparison" with no market data** → v1 named `PriceRangeBand`, `market`/`deviation` channels `null`, real band deferred to Option B (Appendix B), gated on the 0.4 synthesis/Source-Trust audit.
- **SVG a11y silence** (screen reader cannot read paths) → mandatory summarizing `accessibilityLabel`, internals non-focusable (Phase 2.3).
- **Motion jank / re-trigger** → Reanimated worklet, single mount entrance, Reduce Motion path (Phase 2M).
- **Scope creep** → strictly D2 (price-in-market + confidence). Scope-change delta (B6/A11) and lifecycle timeline are **not** in this plan.
- **Thread virtualization (deferred, real):** `thread.tsx` uses `ScrollView` + `turns.map` (not `FlatList`). Out of D2 scope; recommend a separate small perf task before long-thread usage grows. Flagged, not built here.
- **`design.md` is LOCKED** → if it has no chart pattern, FLAG for Tu (0.2 / 2M.3); do not edit the locked doc.

---

## 7. Open decisions for Tu (remaining)

- **Option B (real market band):** build it after the 0.4 audit confirms a trustworthy source? (If yes, it becomes a small follow-up: surface `market` from `synthesis.ts` into the response + populate the model's `market`/`deviation` channels + extend the band component, which is already designed to accept them.)
- **Estimate-card-v3 enrichment:** should v1 also read `price_source`/`needs_inspection` from `estimate_card_v3` to add a small "basis" chip, or keep v1 strictly to guaranteed `KaelEstimate` fields? (Default: keep strict; add the chip only if Phase 0.3 finds `estimate_card_v3` reliably present.)

## 8. Locked-doc impact (flag only — needs Tu approval, not edited here)

- `design.md` (LOCKED): a chart/data-viz + chart-entrance motion pattern may need to be added to the visual/motion contract — Tu approval required; do not edit.
- `STRUCTURES.md` (LOCKED): **no impact in v1** (response contract unchanged). Option B would add an optional `market` field to the estimate response → would require a documented note + Tu approval.
- `Plan.md` (not locked): add a pointer section (proposed **§33**) referencing this doc with the phase list + DoD. (Pending Tu — see handoff.)
- `docs/architecture/code-ownership-map.md` (not locked): add `price-visuals.tsx` to the UI System Ownership table (Phase 4.3).

## 9. Limitations / honesty

- v1 is a **re-presentation** of existing data; it does **not** make the estimate more accurate, only more legible and trustworthy at a glance.
- The "market comparison" the original notes imagined is **not** shipped in v1 by design — the honest data is not there yet (Option B).
- No performance numbers are claimed until Phase 3.3/3.4 capture them on a real device.
- The thread-virtualization perf gap is acknowledged but explicitly out of this slice.

---

## Appendix B — Option B (deferred): real quoted-vs-market band

Only if Phase 0.4 proves a trustworthy market band exists and is safe to surface:
1. **Edge:** surface `{low, median, high}` (already computed by synthesis, if it exists) into the estimate response as an **optional** field (Zod-validated; honest source; no single-point-dressed-as-range). Flag `STRUCTURES.md` for Tu.
2. **Shared:** populate the model's `market` + `deviation` channels in `buildPriceVisualModel` (deterministic comparison; reuse the `anti-fraud.ts` ratio discipline for `deviation.flag`).
3. **Mobile:** `PriceRangeBand` already accepts `market`/`deviation` (built in Phase 2.1) → it renders the underlay band + deviation marker with copper only when `flag !== 'within'`.
4. **Honesty:** if the band is wide/uncertain, say so; never imply a precise "market average" the data cannot support.
