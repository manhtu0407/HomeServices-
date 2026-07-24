# Design Research — Source Ledger

The record of external sources that back NestScout design rules. Canonical contract: `governance/design/design-evidence.md` (tiers, fields, freshness, lifecycle, quality bar, prohibited claims). Skill: `kael-design-evidence`.

## What this is

`source-ledger.csv` has one row per real, first-party source that supports a design rule in the `governance/design/*` nan. It is not a reading list and not a citation-count trophy — it is the auditable link between a rule and the source that justifies it.

## Columns

`id · tier · publisher · title · url · backs · lifecycle · last_verified · freshness_window · q_authority · q_freshness · q_lifecycle · q_total · basis`

See `design-evidence.md` for the meaning and scoring of each. In short:
- `tier` T0–T2 back a rule; T3 supports; T4/T5 never alone.
- `basis` is honest: `repo-firsthand` (verified in this repo's `node_modules` / source) or `established-standard` (a known standard recorded from knowledge; live URL re-verify due at review).
- `q_total ≥ 24` (authority ≥ 4, freshness ≥ 3, lifecycle known) for a source to back a rule.

## Current seed (honest count)

**9 rows.** Four are `repo-firsthand` (Expo Glass Effect SDK 54, React Native Accessibility, React Native useWindowDimensions, Reanimated) — verified in this repo during §44. Five are `established-standard` (Apple HIG Materials, Apple HIG Accessibility, WCAG 2.2 Contrast, WCAG 2.2 Target Size, Material 3 Window size classes) — recorded from established standards; their live URLs have **not** been fetched this session and are due for a freshness re-verify (which is why they score `q_freshness = 6`, not 10). The ledger has **not** been padded.

## Adding a source

1. Confirm it genuinely backs a rule in a `design/*` nan (not "nice to know").
2. It must be T0–T2 (or T3 as support). Fill every column; `last_verified` is a real date you checked.
3. Score it (`design-evidence.md` §5); it must reach `q_total ≥ 24` with the minimums.
4. Dedup by canonical URL. The cited "number of sources" is always the deduped row count.

## Review

Freshness re-verification and lifecycle updates are an ongoing governance job (plan §44.6 / P6): re-check each row against its `freshness_window`, update `last_verified` / `lifecycle`, and retire superseded sources.
