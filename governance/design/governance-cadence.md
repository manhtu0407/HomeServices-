# Design Reference — Governance Cadence

> A spoke of the `design.md` system. `critical.md` is highest authority; `design/runtime.md` routes here; `design/design-evidence.md` owns the source contract this file schedules. This spoke answers **when design governance is re-checked and how it retires its own rules** — so the wheel keeps itself honest instead of decaying into stale citations and orphaned rules.

## 0. Role

Every other design spoke states a rule. This one states **when a rule is re-examined and when it dies**. Without it the system fails two predictable ways: sources silently age past their freshness window and keep getting cited as "current", and superseded rules stay on the books because nobody owns removing them.

Nothing here runs on a timer. There is no scheduler, no CI job. Every trigger below is **event-driven** — it fires when an agent touches the relevant surface. Do not write "reviewed quarterly" into any artifact; that is a promise this repo cannot keep.

## 1. Ledger review cadence

The freshness windows live in `design-evidence.md` §3 (framework 90d · component/SDK 180d · foundations 12m · research 24m). This section says who checks them and when.

**Trigger.** The `kael-design-evidence` skill fires whenever a design rule rests on an external claim. Before that source is cited, compare `last_verified` + `freshness_window` against today.

**Outcome — one of three, always written back to the row:**

| State | Meaning | Action |
|---|---|---|
| fresh | inside the window | cite it; change nothing |
| review-due | past the window | re-verify **before** citing; then update `last_verified` + `lifecycle`, or downgrade |
| unverifiable | URL gone / paywalled / cannot reach | set `lifecycle = retired-site`; the rule needs a new source or must be retired (§4) |

**Marking review-due.** Set `lifecycle = unknown` and leave `last_verified` at its real old date. Never bump `last_verified` to today without actually re-reading the source — a refreshed date with no re-read is a fabricated verification, which `AGENTS.md` data-honesty forbids.

**Hard rule — no silent reuse.** A source past its window may not back a "current" claim just because it is already in the ledger. Either re-verify it, or say in the work product that the rule rests on an unverified source. Reusing an expired row without saying so is the exact failure this spoke exists to prevent.

**Scope discipline.** Re-verify only the rows the current task actually cites. A full-ledger sweep is its own task with its own evidence — not something to smuggle into an unrelated change.

## 2. Corpus manifest (freezing "N sources")

Any claim of the form "backed by N sources" must point at a frozen, countable set. A live CSV is not that — it changes under the claim.

**When to freeze.** On release of a playbook, a design corpus, or any artifact that states a source count.

**What a manifest records:**

```text
manifest_id · frozen_at · row_count_deduped · tier_breakdown · basis_breakdown · checksum · covers
```

- `row_count_deduped` — count **after** dedup by canonical URL. This is the only number that may be quoted publicly.
- `basis_breakdown` — how many rows are `repo-firsthand` vs `established-standard`. A count that hides this distinction overstates the evidence.
- `checksum` — of the ledger file at freeze time, so the claim stays auditable after the CSV moves on.
- `covers` — which artifact/version this manifest backs.

**Rule.** The number in the artifact equals `row_count_deduped` in its manifest. If no manifest exists, the artifact may not state a count at all — describe the evidence qualitatively instead.

## 3. Design-incident log

A visual or UX defect that reached a user (or reached Tu in review) is evidence that a gate missed. The log turns each one into a gate change instead of a one-off patch.

**File:** `docs/design-research/design-incident-log.md` — schema and usage live there.

**When to write one.** A rendering/layout/motion/copy defect that got past the static gates; a regression a reviewer caught that tests should have; an accessibility failure found on device.

**What each entry must answer:**

1. What shipped wrong — the observable defect, not the root cause story.
2. Which gate should have caught it and did not (type-check / jest / `kael-visual-qa` matrix / `kael-design-review` / human sign-off).
3. What changed so it cannot recur silently — a new test, a new capture-matrix cell, a rule edit, or an explicit accepted-risk.

**Rule.** An incident with no item 3 is not closed. "Fixed the bug" is not a closure; the gate is the deliverable. If the honest answer is "no gate can catch this cheaply", write that down as accepted risk — a stated gap beats a fake fix.

**Not a blame log.** Record the gate, not the author.

## 4. Rule retirement

Design rules accumulate. A rule that no longer matches the product, the platform, or the runtime is worse than no rule: agents still obey it.

**Retire when** the platform behavior it encodes is gone (an SDK removed the API), the product decision reversed, it is fully subsumed by another spoke, or its only supporting source is `retired-site` / `superseded` with no replacement.

**How to retire — explicitly, in one edit:**

1. Delete the rule from its spoke. Do not leave it commented out; `protocols/code-hygiene.md` forbids commented-out residue, and the same applies to governance prose.
2. State the retirement and its reason in the change that removes it, so the history carries the why.
3. Fix every pointer to it — the router `runtime.md`, the skill body, sibling spokes. A dangling pointer is the defect this step exists to prevent.
4. If a ledger row existed only to support that rule, mark its `lifecycle = superseded` or drop the row; do not leave it inflating the count.

**Rule.** Retirement is a normal, expected edit — not an admission of failure. A wheel that never retires anything is not being maintained.

## 5. Checklist

```text
[ ] Cited sources checked against their freshness window; review-due rows re-verified or declared unverified.
[ ] No last_verified date bumped without actually re-reading the source.
[ ] Any stated source count traces to a frozen manifest with a deduped row count.
[ ] Escaped visual/UX defect logged with the gate that missed it AND the gate change.
[ ] Rules that no longer hold are deleted, not left commented; every pointer to them fixed.
```
