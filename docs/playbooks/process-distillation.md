# Kael Knowledge Distillation — Process (SOP)

How to teach Kael a body of reasoning (a "playbook") so it measurably improves, without training a model and without breaking the runtime contract. This is the repeatable process behind `services/electrical.md`. Follow it for every new service and every playbook revision.

## 0. Mental model (read once)

Kael's runtime intelligence = rented LLMs + distilled procedure. We do not change model weights. We compress a senior specialist's reasoning into a form a cheap runtime model can execute the same way every time, then we measure whether it helped.

A playbook lives as **three artifacts**, never one:

| Artifact | Home | Role | Goes to the LLM? |
|---|---|---|---|
| Textbook (full playbook) | `docs/playbooks/services/<service>.md` | human-readable source of truth, reviewed by Tu | No |
| Runtime segment (compressed) | a code constant (see §5) | the actual instructions injected into the system prompt | Yes, cached |
| Eval corpus | `docs/playbooks/eval/<service>-cases.json` | ground truth that proves improvement | No (it drives the runner) |

"Kael got smarter" is only a real claim when the eval delta says so. Without a before/after eval, improvement is a feeling — do not ship on feelings.

## 1. Preconditions

- Read `governance/critical.md` (preflight), `governance/RULES.md` (#6, #7, #8 — AI boundary, price authority, honest failure), and the `kael-ai-boundary` skill.
- Confirm the service is one of the six supported (`electrical, plumbing, cleaning, hvac, upholstery, handyman`). Nothing outside scope.
- Have the binding contract open: `supabase/functions/mobile-api/_shared/kael/performance-profiles.ts`, `types.ts`, `self-check.ts`, `prompts.ts`, `pipeline.ts`. Everything the playbook emits must be an exact string from these files.

## 2. Extract the binding contract for the service (do this FIRST, always)

Before writing any content, pull the exact tokens from code. For the target service, record:

- `problem_slugs` — the exact set from `PROBLEM_SLUGS_BY_SERVICE` in `types.ts`.
- `quote_drivers` — exact keys from the service's profile in `performance-profiles.ts`.
- Safety + capability gates — the exact `trigger_signals` (both gates' signals are valid members of the `safety_signals[]` output array; `pipeline.ts` filters against their union).
- `scope_change_triggers` — exact keys.
- The intake-diagnosis output schema (`intentResultSchema` in `types.ts`) and its hard filters (see §3).

If any of these change in code later, the playbook and its eval are stale — re-verify.

## 3. Non-negotiable output constraints (the traps that silently break a weak model)

These come from real code and have bitten drafts before. Bake them into the playbook's conventions section:

1. **Clarification question filter** (`isSingleFocusedClarificationQuestion`, `types.ts`): ≤160 chars, ends with exactly one `?`, no `;` `:` or newline, at most one comma, and NEVER a standalone " và " / " and ". A violating question is silently replaced by a canned generic one. Write question banks that pass; use "hay"/"hoặc" for choices; split two-fact questions across turns.
2. **`customer_sentiment` enum**: `neutral | detail_oriented | pressure` only. No other value parses. Never invent "stressed"/"angry".
3. **`confidence` is numeric 0–1**, never a word.
4. **`complexity_hint` is a vision-schema field, not intake.** In intake trees, use internal `complexity:` notes; do not emit a `complexity_hint` key from intake (Zod strips it → the signal is lost).
5. **`profile_facts` must be grounded** (`prompts.ts` rule): record only what the customer stated or confirmed. Never record advice, assumptions, or invented timing/quantity as a fact.
6. **`safety_signals[]` = exact trigger_signal strings**, from either gate. Never translated, never invented.
7. **Customer-visible Vietnamese** (`self-check.ts` rejects): full diacritics, sentences ≤20 words, no digits-as-money, no prices ever; no fear language, no absolute claims, no AI self-reference, no slang. Describe the action, never the catastrophe.
8. **The LLM never sets prices** (RULES #7, `synthesizePrice` deterministic). A playbook teaches qualitative diagnosis / clarification / complexity / scope only. Zero money reasoning anywhere.

## 4. Author the textbook (`docs/playbooks/services/<service>.md`)

Structure (mirror `services/electrical.md`):

- **Header** — status, injection plan, a verified contract snapshot (the §2 extract).
- **PB0 Conventions** — the §3 constraints as an action vocabulary the trees reuse.
- **One diagnostic tree per problem_slug** — `condition -> action` decision trees. Allowed actions only: set problem_slug, add `<signal>` to safety_signals, record `<quote_driver_key>="<vi fact>"`, ask `vi:"<one question>"`, set scope_signal (+ suggested_service), advise `vi:"..."`, internal `complexity:` note. Procedural, not prose — the runtime model is DeepSeek-class.
- **Fallback + service disambiguation** — when to use the two fallback slugs; a routing table for confusable requests across the six services.
- **Domain context** — locale reality (HCMC apartments). Mark any claim you are not certain of as `[VERIFY: reason]` instead of asserting it.
- **Vision checklist** — per evidence type, what to look for, mapped to the exact vision output contract.
- **Complexity rubric** — operational small/medium/large + escalators/de-escalators + mid-job → scope_change_triggers.
- **Safety/advisory wording bank** — verbatim `vi:"..."` templates per hazard signal, each pre-checked against `self-check.ts`.
- **Appendix A** — the compressed runtime segment (§5).
- **Appendix B** — the eval corpus, mirrored to `eval/<service>-cases.json` (§6).
- **Appendix C** — honest verification status + the review list for Tu (the [VERIFY] tags + any policy calls you made that are product decisions, not engineering).

### Recommended production method (multi-agent, adversarial)

The electrical playbook was produced by a workflow; reuse it (it is worth the tokens for a teaching artifact):

1. **Draft** — one specialist agent per section, in parallel, each given the §2 contract + §3 constraints verbatim.
2. **Verify** — three independent adversarial lenses per section: (a) senior domain expert hunting wrong/unsafe claims, (b) contract-compliance reviewer reading the source files to catch illegal slugs/keys/strings and self-check violations, (c) a weak-model-simulator finding ambiguous branches with no deterministic next step.
3. **Repair** — apply confirmed critical/major findings.
4. **Eval** — generate the ground-truth corpus from the finished playbook.

Guardrails learned: this can hit session usage caps — checkpoint per section, and if the agent path dies, finish inline. `pass:true` with an empty finding list from an agent that never ran is not a pass; only count lenses that actually executed, and tag everything unverified as `[VERIFY]`.

## 5. Compress the runtime segment (Appendix A)

- One STABLE block (no per-request interpolation) so Anthropic's prompt cache hits (Plan §43 Workstream C). Target ≈1.5–2k tokens; measure the real count at injection, do not guess.
- It must contain: output discipline (§3), safety-scan-first rule, routing, slug selection, condensed decision trees (condition → facts/signals/complexity), complexity rules, domain context, and the verbatim safety wording.
- Keep it byte-stable across requests or the cache never hits.

## 6. Build the eval corpus (`eval/<service>-cases.json`)

- ~24 cases minimum for a sample (2 per slug + service_mismatch + out_of_scope + safety-critical); the full §43 E0 target is ~50/purpose.
- Realistic Vietnamese customer messages — include no-diacritics and typo'd variants, because that is how users type.
- Each case: `{ id, input_text_vi, expected{ problem_slug, scope_signal, suggested_service, safety_signals[], needs_clarification, complexity }, difficulty, rationale }`.
- `expected` follows the playbook's trees, not the author's private opinion.
- Scoring: exact match on problem_slug / scope_signal / needs_clarification; `safety_signals` expected set must be a subset of emitted (extra grounded signals do not fail); `complexity` informative only in v0. `suggested_service` is NOT observable via the serialized API response, so the mismatch decline is scored through `scope_signal` only.

**Runner:** `apps/api/scripts/kael-playbook-eval.mjs` (Node, matches the repo's other `scripts/*.mjs`). It POSTs each case through the live electrical intake at `/kael/chat`, reads `{session, turns}`, and scores the observed intake fields.
- Dry-run (no credentials — proves the scoring wiring): `node apps/api/scripts/kael-playbook-eval.mjs --mock apps/api/scripts/fixtures/kael-playbook-eval-mock.json --label mock --date <YYYY-MM-DD>`.
- Live: set `KAEL_PB_EVAL_MOBILE_API_URL`, `KAEL_PB_EVAL_ANON_KEY`, `KAEL_PB_EVAL_BEARER_TOKEN` (a signed-in staging **user** JWT), then `node apps/api/scripts/kael-playbook-eval.mjs --label baseline`. An agent cannot mint the user token; a human runs the live command.

## 7. The measurement loop (this is what makes "smarter" real)

```
   author/revise playbook
        │
        ▼
   run eval on staging  ─────────►  baseline (no playbook)   ← run ONCE before first injection
        │
        ▼
   inject Appendix A behind an env flag (e.g. KAEL_PLAYBOOK_<SERVICE>_ENABLED)
        │
        ▼
   run eval again  ─────────►  post-injection pass-rate
        │
        ▼
   delta = post − baseline    ← the literal answer to "did Kael get smarter, by how much"
        │
        ├─ positive & no regression → keep; fold new-found failures back into the corpus (curriculum grows)
        └─ flat/negative            → the playbook did not teach; diagnose and revise
```

Ratchet: each playbook/prompt change re-runs the corpus in CI (§43 Workstream E). A change that drops pass-rate > threshold fails the build, so accumulation is monotonic — you cannot silently make Kael dumber. The "memory" of getting smarter lives in git history + the rising eval baseline, both auditable. Kael has no introspective awareness of its own improvement, and that is intentional (RULES: no autonomous self-modification).

## 8. Definition of done for one distillation

- [ ] Contract extracted from code and snapshotted in the textbook header.
- [ ] Textbook written; every emitted token verified exact; every uncertain claim `[VERIFY]`-tagged.
- [ ] All customer-visible Vietnamese passes the §3 checks (grep for ` và ` inside `ask vi:"..."`, for `:` inside questions, for digit-money).
- [ ] Eval corpus mirrored to `eval/<service>-cases.json` and JSON-valid.
- [ ] Appendix C lists exactly what Tu must review (the 1%).
- [ ] Nothing injected into the runtime before a baseline eval exists.
- [ ] Tu resolved the [VERIFY] tags and any product-policy calls.

## 9. Where each service stands

Tracked in `docs/playbooks/INDEX.md`. One row per service: textbook / segment-injected / eval-baseline / last-delta.
