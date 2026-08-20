---
name: kael-design-review
description: Final design review of a NestScout Expo React Native UI change before human sign-off. Use for a design review, final review, or design critique — checking hierarchy, workflow correctness, state completeness, accessibility, and anti-slop before a surface is called done. Reviews in priority order, separates objective proof from subjective taste (human sign-off), and ends with a verdict — never a self-assigned score.
---

# kael-design-review

Thin wrapper. The review order, evidence boundary, and verdicts are canonical in `governance/design/design-review.md` — do not duplicate them here. This is the design review; `critical.md` §8 (`kael-review`) is the general code review.

When this fires:

1. Review in order, stopping at the first hard failure: user goal → workflow correctness → hierarchy / content → state completeness → platform / adaptive → accessibility → performance → brand fit → anti-slop.
2. Declare only what you can prove (tests / tree / screenshot / trace / ledger source). Taste and brand feel need human sign-off — prepare a comparison, do not assert it resolved.
3. An agent score is never proof; never self-assign an aesthetic rating.
4. End with one verdict: `block` | `revise` | `ready-for-human-review`.

## Close

```text
Surface:
Reviewed in order:
Blocking failures:
Needs human taste:
Verdict:
```

The verdict is `block`, `revise`, or `ready-for-human-review` — never `approved`. Taste and brand fit need Tu's eyes, and an agent score is not proof.

Single source: `governance/design/design-review.md`. Pair with `kael-frontend-test`, `kael-visual-qa`, and the design router `governance/design/runtime.md`.
