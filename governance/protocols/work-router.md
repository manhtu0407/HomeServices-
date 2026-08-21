# Kael Protocol: `kael-work-router`

Canonical procedure for the `kael-work-router` skill. The skill body is the always-on trigger; this file is the method.

The router runs **before** work starts. It answers three questions in order: what am I actually being asked, which slices and skills does that need, and — at the end — was the result worth what it cost.

It does not do the work. It decides how the work gets spent.

## The standard

Effort is proportional to the size of the job, and information is read at the moment it is used.

Two failures this exists to stop:

1. **Disproportionate effort.** Wide reads with no question, re-reading files already in context, long ceremony on a one-line change, a full suite where a narrow gate proves it.
2. **Front-loading.** On a long task or a multi-topic mission, gathering everything up front and then working through it slowly. Information loaded first is furthest from the point of use and the first to be compacted away — the highest token price for the lowest retention. Auto-compaction does not rescue it, because it compresses by recency, not relevance.

## 1. Read the brief

`Asked task` and `Real goal` are already defined in `governance/critical.md` section 0 — state them there, do not restate the definitions here.

The router adds exactly one thing: **is this one task, or a mission of several topics?** A mission is sliced per topic, and one topic closes before the next opens.

## 2. Classify on two axes

"Diverse tasks" is two independent dimensions. Collapsing them into one is why a domain table alone cannot route.

| Axis | Answers | Source |
|---|---|---|
| **Domain** — where in the system | which skills are candidates | the twelve classes in `governance/critical.md` section 2 |
| **Reach** — how far the change cuts | how many candidates actually fire, how wide to read, how many gates | `T` / `C` / `X` / `E` |

Same domain, different reach: editing a comment in a migration is `T`; adding an enum value that a later migration already consumes is `X`. One axis cannot express that difference.

**Never define a thirteenth domain.** The twelve classes are the vocabulary; reach is size, not another domain.

### Signals, in order of authority

**Paths beat prose.** The tree is objective; the wording of a request is not.

| Path | Domain | Reach floor |
|---|---|---|
| `packages/shared/**` | contract; domain follows the verb | `X` — and run the api suite too, its schema test asserts mobile source strings |
| `supabase/functions/_shared/**` | cross-function contract | `X` |
| `supabase/migrations/**`, `**/*.sql` | `database` | `C`; `X` when an enum or type a later migration consumes is touched |
| `supabase/functions/mobile-api/_shared/kael/**` | `ai` | `C` |
| `supabase/functions/mobile-api/_shared/http/**`, `domains/**` | `feature` or `refactor`, by verb | `C` |
| `apps/mobile/app/**`, `apps/mobile/components/**` | `ui` | by surface count |
| `scripts/**`, `config/**`, `.claude/**`, `.github/**` | `infra` | `C` |
| `governance/**`, `docs/**` | `docs` | `T` or `C` |
| any path touching RLS, auth, tokens, logs, PII, or money | `security`, **added to** the base domain, never replacing it | at least `C` |

**Skill triggers are declared data, not guesswork.** Every skill states its own firing condition in the `trigger` field of `config/harness/manifest.json`. Read those rather than recalling what a skill is for; the manifest is the only copy that cannot fall out of date.

**Request wording is the weakest signal.** Verbs suggest a domain. They never override a path signal.

## Lane — by domain

The domain produces a **candidate set**, not a firing set.

| Domain | Candidates |
|---|---|
| `bugfix` | `kael-diagnose` then `kael-tdd` |
| `feature` | `kael-tdd`; add `kael-supabase` or `kael-ai-boundary` when the paths reach them |
| `ui` | hand to `kael-design-preflight`, which routes through `governance/design/runtime.md` sections 1-2; close with `kael-frontend-test` |
| `enhancement`, `refactor` | `kael-codebase-memory` for blast radius; add `react-doctor` for React files |
| `test` | `kael-tdd` |
| `infra` | usually none plus one gate; add `kael-docker` when a real database or Deno check is required |
| `security` | `kael-security-sweep`, always added rather than chosen |
| `database` | `kael-supabase`; add `supabase-postgres-best-practices` for queries or indexes, `kael-docker` to verify against a real database, `supabase` for CLI and management work |
| `ai` | `kael-ai-boundary` plus `kael-security-sweep` |
| `docs` | `kael-doc-audit` |
| `review` | a protocol, not a skill — see the namespace trap below |

The `ui` row delegates on purpose. All eleven design skills are routed by `governance/design/runtime.md`; copying its table here would create a second source to drift.

## Lane — by session condition

These fire on state, not on where the code lives, so they are independent of domain.

| Condition | Skill |
|---|---|
| unfamiliar area, or a symbol whose owning runtime is unclear | `kael-codebase-memory` |
| a decision that needs evidence from outside the repository | `kael-research` |
| a question better answered by hand before production code | `kael-prototype` |
| destination clear, path unclear, **across several sessions** | `kael-wayfinder` — hands back to this router when the map exists |
| session closing, context about to compact, or handing between agents | `kael-handoff` and `source-command-kael-mem` |

## Always-on — exempt from routing

`kael-core-hygiene` `karpathy-guidelines` `kael-subagent-orchestration` `kael-work-router`

These are never selected because they are never optional. A lane that does not name them is correct.

## Namespace trap — protocol, not skill

These names appear in `governance/critical.md` section 1 and have **no skill of that name**. Load the protocol file; do not go looking for a skill.

`kael-preflight` `kael-review` `kael-architecture-deepening` `kael-code-enhancement` `kael-zoom-out` `kael-ui-rn-execution` `kael-clarify-with-docs` `kael-to-prd` `kael-issue-slicing` `kael-triage` `kael-docs-execution` `kael-agent-context-setup`

`governance/critical.md` section 1 maps each of them to its file.

## 3. Depth — reach decides how many candidates fire

| Reach | It is | Read envelope | Skills that fire |
|---|---|---|---|
| `T` trivial | one known file, no behavior change | nothing beyond the named file; no new files | **none** — `skills: none` is the right answer, not laziness |
| `C` contained | one behavior, one owner file plus its test | owner file and its callers; one protocol | one primary plus one verifier |
| `X` cross-cutting | crosses a contract, runtime, or boundary | the Tier 2 rows the change touches | the whole lane plus every overlay |
| `E` exploratory | destination unknown; **reading wide is the work** | wide reads are legitimate | the condition lanes; the output is a written artifact, not code |

**Declare what you dropped.** Every candidate cut from the lane needs one line: `dropped: <skill> — <reason>`. Without it, "I ran one skill" is indistinguishable from "I forgot three". This is the line that makes the routing decision reviewable.

### Tier 1 depth by reach

Reach never decides *whether* Tier 1 is read. It decides how deep.

| | Every reach, always | Reach `T` may read at index level | Reach `C` / `X` / `E` |
|---|---|---|---|
| `governance/RULES.md` | **in full** | in full — never reduced | in full |
| `governance/critical.md` §3 gates | **in full** | in full — never reduced | in full |
| rest of `governance/critical.md` | — | §1 and §2 as an index; pull a section only when it bears on the change | in full |
| `.claude/MEMORY.md` | — | the Recall Index; fetch an entry only when it bears on the change | in full |
| `governance/protocols/code-hygiene.md` | — | machine-enforced by the linter and the Stop hook, so the index suffices | in full |

`RULES.md` and the §3 gates are the security and honesty floor. A one-line change is exactly where both get skipped, which is why they are the two that never shrink. Everything else in Tier 1 is a lookup surface, and a lookup surface read cover-to-cover before the question exists is front-loading.

Getting the reach wrong to buy a cheaper read is the failure mode here. The reach floors in the path table above are not negotiable, and the reconciler checks the declared reach against the paths that actually changed.

## 4. Slice

Each slice declares five things:

```text
slice:
class:
read:
skills:
gate:
```

`class` is `<domain>/<reach>`. `read` names paths, never a directory of governance. `gate` is the narrowest command that proves this slice done.

**Read-window per slice.** A slice closes before the next one opens. This is the mechanic that stops front-loading; reading wide is something reach `X` and `E` buy, not the default.

**Multi-topic missions** run as clusters: every slice of one topic closes before the next topic opens. No interleaving — otherwise topic A stays resident in the window while topic C is being worked.

Slices at reach `T` owe no plan file. Anything larger writes `.scratch/work-plan.json`, which `pnpm lint:workplan` reconciles against the tree.

## 5. Close — measure beside verdict

Two things sit next to each other, and the gap between them is the point.

**The measure** (`pnpm lint:workplan`): files changed against files declared, changes outside every read-window, slices left open, and whether the declared domain and reach match the paths that actually changed.

**The verdict** (written, never blank): was this the work that was asked for, and is the output worth the tokens it cost.

No script can judge "worth it". Putting a number beside the claim makes a mismatch visible, which is all a gate can honestly do.

## Waste ledger

Name the ones that happened. They are process waste, distinct from the artifact simplicity that `karpathy-guidelines` owns.

| Waste | What it looks like |
|---|---|
| `front-load` | gathering everything before slicing — the heaviest one |
| `blind-sweep` | reading without a question to answer |
| `re-read` | opening a file already in context |
| `ceremony-inflation` | long preflight or review on a `T` or `C` slice |
| `gate-shotgun` | running the full suite when a narrow gate already proves it |
| `gold-plating` | tests, docs, or error handling nobody asked for |
| `rework-loop` | claiming done, gate goes red, doing it again |
| `narration` | a closing response that retells what the diff already says |

## Authority

Binding. Reading outside a slice read-window, skipping an assigned skill, or merging slices is allowed — and must be **declared with its reason** at close. An undeclared deviation is a violation, not discretion.

The router never overrides `governance/RULES.md`, the Tier 1 read requirement, or any locked document. Where it appears to conflict with one, the conflict rule in `governance/critical.md` applies: stop and surface it.

## Neighbours

| Neighbour | Its job | The boundary |
|---|---|---|
| `kael-subagent-orchestration` | execution — local or delegated, fan-out, exclusive write scope, who owns integration | the router runs first and hands over slices; orchestration decides who carries them |
| `kael-wayfinder` | mapping decisions across several sessions | it excludes bounded single-session work itself; when its map exists, it hands back here |
| issue slicing (a protocol) | cutting a plan into durable tracker issues for later | the router cuts slices to execute now, with a read-window, a skill assignment, and a gate |

Full chain: **router (direction) → orchestration (staffing) → the slice's own protocol or skill (doing) → the gate (proof)**.

## Rationalization → Reality

| Rationalization | Reality |
|---|---|
| "This task is diverse, so read everything to be safe." | Diversity is the reason to slice, not the reason to skip slicing. Reading everything is front-loading: the highest token price for the lowest retention. |
| "Gathering context first is being thorough." | Thorough is reading the right thing at the moment it is used. Context loaded first is compacted away first. |
| "It is faster to keep one big slice." | One big slice makes everything in-scope, so nothing is measurable. The gap between what was declared and what changed is the only evidence of control. |
| "Running every relevant skill is safer." | Loaded context you do not act on is distraction with a price tag. `governance/critical.md` already forbids protocol overload. |
| "The task was small, so no plan was needed." | Correct — at reach `T`. Say so; a `T` claim with a large diff is what the reconciler catches. |
| "I dropped that skill because it was not needed." | Then write the line. An unstated drop and an oversight look identical to the next reader. |
