# Design Reference — Design Evidence

> A nan of the `design.md` system. `critical.md` is highest authority; `AGENTS.md` owns the data-honesty rules; `design/runtime.md` routes here. The `kael-design-evidence` skill points here and pairs with `kael-research`. This nan governs **how an external design claim earns its place** in a rule — and the source ledger that records it: `docs/design-research/source-ledger.csv`.

## 0. Role

Design rules that come from outside the repo (a platform guideline, a standard, an SDK behavior) must be **traceable to a real, current, first-party source**. This nan defines the source tiers, the record fields, the freshness windows, the lifecycle states, and the quality bar. It exists so no rule rests on a half-remembered blog post or a fabricated "best practice".

## 1. Source tiers

| Tier | What | Examples |
|---|---|---|
| T0 | normative standard / spec | W3C WCAG, ECMA, IETF |
| T1 | first-party platform vendor docs | Apple HIG, Android / Material 3, React Native docs, Expo docs |
| T2 | first-party vendor engineering | vendor GitHub issues / release notes / API reference / SDK source |
| T3 | reputable secondary | established design-org research (e.g. NN/g), well-known design-system docs |
| T4 | community | individual blogs, Medium, StackOverflow, tutorials |
| T5 | unverified | AI-generated, marketing, undated, anonymous |

A design rule should rest on **T0–T2**. T3 is supporting only. T4/T5 never back a rule on their own.

## 2. Required record fields (the ledger schema)

`docs/design-research/source-ledger.csv` has one row per source:

```text
id · tier · publisher · title · url · backs · lifecycle · last_verified · freshness_window · q_authority · q_freshness · q_lifecycle · q_total · basis
```

- `backs` — the exact rule / nan this source supports.
- `last_verified` — the date the source was checked (ISO). Passed in by the recorder; never invented.
- `freshness_window` — see §3.
- `q_*` — the quality sub-scores (§5); `q_total` = their sum.
- `basis` — how it was verified: `repo-firsthand` (seen in this repo's `node_modules` / source) or `established-standard` (a known standard recorded from knowledge, live URL re-verify due at review).

## 3. Freshness windows

A source is "fresh" only within its window from `last_verified`; past it, re-verify before citing as "current".

| Source about… | Window |
|---|---|
| OS / framework version behavior | 90 days |
| a component / SDK API | 180 days |
| foundations (a11y, layout, color standards) | 12 months |
| research / benchmark | 24 months |

## 4. Lifecycle states

`current` · `preview` · `beta` · `deprecated` · `retired-site` (URL gone) · `historical` (kept for context) · `superseded` (replaced by a newer source) · `unknown`.

A rule may cite `current` / `preview` / `beta` (with a note). `deprecated` / `superseded` require a migration note. `unknown` cannot back a "current" claim.

## 5. Quality score (≥ 24 / 30)

Three sub-scores, each 0–10:

- `q_authority` — by tier: T0 = 10, T1 = 9, T2 = 8, T3 = 6, T4 = 3, T5 = 1. **Minimum 4.**
- `q_freshness` — verified within window = 10; recorded from knowledge but URL not live-checked = 6; past window = 3; no date = 0. **Minimum 3.**
- `q_lifecycle` — current & known = 10; preview / beta = 7; deprecated-but-relevant = 4; unknown / retired = 0. **Lifecycle must be known (not `unknown`).**

`q_total = q_authority + q_freshness + q_lifecycle`. A source may back a rule only at **q_total ≥ 24** with every minimum met.

## 6. Dedup

One row per canonical source (dedup by canonical URL, else publisher + title). If two rows describe the same source, merge and keep the higher-quality record. The ledger's source **count is the deduped row count** — nothing else.

## 7. Prohibited claims

- Do not claim a source count the ledger does not have. "1000 sources" is allowed only when the ledger holds 1000 **deduped** records.
- Do not call a source "current" without a `last_verified` date **and** a known lifecycle.
- Do not seed the ledger to hit a number ("pad to 42 rows"). Record only sources that genuinely back a rule.
- Do not fabricate a `last_verified` date or a publisher; if unknown, mark `unknown` and score accordingly.

## 8. Checklist

```text
[ ] Source is T0–T2 (T3 supporting only; never T4/T5 alone).
[ ] Row has every field; last_verified is a real date; basis is honest.
[ ] Within its freshness window, or re-verified before citing "current".
[ ] Lifecycle known; not unknown / retired for a live rule.
[ ] q_total ≥ 24 with authority ≥ 4, freshness ≥ 3, lifecycle known.
[ ] Deduped; the cited source count equals the deduped row count.
```
