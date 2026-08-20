---
name: kael-design-evidence
description: Record and check the external sources behind NestScout design rules. Use when a design decision rests on an external claim, a platform guideline, a standard, or a benchmark — or when adding to the source ledger, checking source freshness or lifecycle, or turning research into a design rule. Enforces first-party tiers (T0–T2), freshness windows, quality ≥ 24/30, honest counts, and no fabricated "current" claims.
---

# kael-design-evidence

Thin wrapper. The tiers, record fields, freshness windows, lifecycle, quality bar, and prohibited claims are canonical in `governance/design/design-evidence.md`; the ledger is `docs/design-research/source-ledger.csv`. Do not duplicate them here.

When this fires:

1. A design rule from outside the repo must trace to a real T0–T2 first-party source. T3 supports only; never T4/T5 alone.
2. Add a ledger row with every field; `last_verified` is a real date you checked; `basis` is honest (`repo-firsthand` vs `established-standard`).
3. Score it (authority / freshness / lifecycle); it backs a rule only at `q_total ≥ 24` with the minimums, lifecycle known.
4. Dedup by canonical URL. The cited source count equals the deduped row count — never claim a number the ledger lacks.
5. Do not call a source "current" without a date + known lifecycle; do not pad the ledger.
6. Check the row against its freshness window before citing it. Past the window, re-verify or say the rule rests on an unverified source — never reuse it silently, and never bump `last_verified` without re-reading. Cadence, corpus manifests, the incident log, and rule retirement are in `governance/design/governance-cadence.md`.

## Close

```text
Claim:
Source:
Source type:
Applies to:
Conflicts:
```

A source you did not open is not evidence. Record the claim as unverified rather than attributing it to a guideline you recalled.

Single source: `governance/design/design-evidence.md` + `governance/design/governance-cadence.md` + `docs/design-research/`. Pair with `kael-research` and the design router `governance/design/runtime.md`.
