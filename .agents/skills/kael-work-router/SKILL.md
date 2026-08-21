---
name: kael-work-router
description: Entry layer that runs before any task starts. Classifies the work on two axes, assigns the smallest sufficient set of skills (or none), fixes what gets read in which slice, and at close reconciles what was spent against what was produced. Use at the start of every task or mission, and whenever a task is long, multi-topic, or unclear in shape.
---

# kael-work-router

Always-on entry layer. Full procedure is canonical in `governance/protocols/work-router.md` — do not duplicate it here. It runs before the work, not instead of it: it decides how effort is spent, then hands off.

Two failures it exists to stop: effort out of proportion to the job, and front-loading — gathering everything up front on a long or multi-topic task, where information read first is furthest from its point of use and the first to be compacted away.

When this fires:

1. **Read the brief.** State `Asked task` and `Real goal` per `governance/critical.md` section 0. Add one judgement: one task, or a mission of several topics.
2. **Classify on two axes.** Domain — one of the twelve classes in `governance/critical.md` section 2, never a thirteenth. Reach — `T` trivial (one known file, no behavior change), `C` contained (one behavior, one owner file and its test), `X` cross-cutting (crosses a contract, runtime, or boundary), `E` exploratory (destination unknown, reading wide is the work). Paths beat wording: `packages/shared/**` and `supabase/functions/_shared/**` are `X` regardless of how small the change looks, and anything touching RLS, auth, tokens, logs, PII, or money adds `security` to the base domain.
3. **Assign skills from the lane, then cut by reach.** The lane in the protocol gives candidates; reach decides how many fire. At `T` the right answer is `skills: none`. Skill firing conditions are declared in the `trigger` field of `config/harness/manifest.json` — read those rather than recalling what a skill does.
4. **Slice, with a read-window each.** Every slice declares `slice:` / `class:` / `read:` / `skills:` / `gate:`. A slice closes before the next opens. In a multi-topic mission, a whole topic closes before the next topic opens.
5. **Declare every drop.** A candidate skill cut from the lane needs one line: `dropped: <skill> — <reason>`. Unstated, a deliberate cut and an oversight look identical.
6. **Close with measure beside verdict.** Run the reconciler, then answer the two questions no script can: was this the work that was asked for, and was the output worth what it cost.

Slices at reach `T` owe no plan file. Anything larger writes `.scratch/work-plan.json` and reconciles with `pnpm lint:workplan`, which checks files changed against files declared, changes outside every read-window, slices left open, and whether the declared domain and reach match the paths that actually changed.

`governance/critical.md` section 1 lists names that are protocols, not skills — including `kael-preflight`, `kael-review`, and `kael-architecture-deepening`. Load the protocol file; do not go looking for a skill of that name. The protocol carries the full list.

Authority is binding. Reading outside a slice read-window, skipping an assigned skill, or merging slices is allowed and must be declared with its reason at close; an undeclared deviation is a violation, not discretion. The router never overrides `governance/RULES.md`, the Tier 1 read requirement, or a locked document — where it appears to conflict with one, stop and surface it.

This skill directs; it does not staff and it does not build. `kael-subagent-orchestration` decides who carries a slice once the router has cut it.

## Close

```text
Shape:
Slices:
Skills fired:
Skills dropped:
Read outside window:
Measure:
Right work:
Worth the spend:
```

`Right work:` and `Worth the spend:` are never left blank — they are the judgement the reconciler cannot make. Do not claim a slice closed without naming the gate that proved it.
