# React Doctor — accepted findings ledger

Scope: `react-doctor@0.5.8` full scan of the repo, run through `pnpm doctor:react`.

This file exists so a later session does not re-audit the same findings from scratch. Every rule
below was read against the real code, not inferred from the rule name. If you are about to "fix"
one of these, read the reason first — most of them are wrong to fix, and two of them are actively
dangerous to fix.

The scan does not go to zero and is not supposed to. `pnpm doctor:react` pins `--blocking none`,
so it always exits 0; the CI gate reads the counts out of the output instead of trusting the exit
code (`.github/workflows/react-doctor.yml`).

## Closed — do not reopen

| Rule | Was | Now | What happened |
|---|---|---|---|
| `rn-no-legacy-shadow-styles` | 106 | 0 | Every legacy `shadow*` site moved to `createSurfaceShadow` |
| `rn-style-prefer-boxshadow` | 106 | 0 | Same migration; the two rules flag one shared set of sites |
| `js-hoist-intl` | 4 | 0 | `Intl` formatters hoisted to per-language module constants |
| `exhaustive-deps` | 0 | 0 | Never had findings; held at zero to catch the trap below |

Total went 387 → 171. These four are held at zero by CI.

### The `useLazyRef` trap — do not repeat this

`rerender-lazy-ref-init` (10 findings) was attempted and **reverted**. Replacing
`useRef(new Map())` with a `useLazyRef(() => new Map())` helper closed all 10 findings and
immediately opened **15 new `exhaustive-deps` findings** across
`use-customer-kael-conversations.ts`, `use-customer-kael-session-catalog.ts`, and
`use-kael-orb-chat.ts`.

The cause: the analyzer recognises a direct `useRef(...)` call as a stable ref and excludes it
from dependency analysis. Behind a wrapper it no longer sees a ref, so every
`someRef.current.get` becomes a value it demands in the deps array.

The trade was bad in both directions — it swapped a cosmetic allocation count for the loss of
real staleness detection in three of the most stateful hooks in the app. `useRef(new Map())`
allocates and discards on re-render but its **behaviour is correct**, which is why these 10 sit
in the accepted list below rather than the closed list above.

The remaining escape hatch is the inline form, which keeps `useRef` as the literal call site:

```ts
const ref = useRef<Map<K, V> | null>(null)
ref.current ??= new Map()
```

That was measured, not assumed. It passes eslint — writing `ref.current` during render is only
an error for a plain assignment, not for `??=`. The cost is the type: applied to one ref in
`use-customer-kael-session-catalog.ts` it produced **5 `TS18047: possibly 'null'` errors**, one
per usage. Ten refs means roughly that many non-null assertions, each one silencing a real type
guarantee to save an allocation. Not worth it — but if someone does take this path, it is the
only form that keeps the analyzer's ref detection intact.

## Accepted — correct as written

### `async-await-in-loop` — sequential on purpose

The loops are sequential because the work is ordered, not because someone forgot to parallelise.

- `lib/api.ts` — retry loop with an attempt counter. Parallelising retries defeats retrying.
- `lib/response-guard.ts` — stream read loop. Chunks have an order.
- `lib/media-upload.ts` — validation loop with an early abort that **rolls back already-reserved
  paths**. Running these concurrently breaks the rollback and leaks reservations.
- `lib/media-upload.ts` video frame extraction and upload — sequential to bound peak memory on
  low-end Android devices.

Parallelising any of these is a correctness or memory regression. This is the single most
dangerous rule in the list to "clean up".

### `no-event-handler` — declarative Reanimated and guarded effects

Reanimated animations driven by props (`kael-liquid-pressable.tsx`, `kael-liquid-reveal.tsx`,
`use-customer-kael-mode-menu.ts`, `admin-tab-navigation.tsx`) plus effects that already carry
their own sequencing guards (`use-session-push-registration.ts` sequences attempts;
`use-latest-worker-session-restore.ts` guards on `restoredOwnerKeyRef`). This is idiomatic React
Native, not event logic misplaced into an effect.

### `no-derived-state` — time-driven state machines

Most hits are in `components/ui/use-kael-respond-stream-presentation.ts`, a typing/streaming
presentation machine that advances **over time**. There is nothing to derive during render — the
value depends on elapsed time, not on props. The remaining hit
(`lib/frontend-workflow/use-worker-candidate-actions.ts`) already uses `useEffectEvent` correctly.

### `no-cascading-set-state` — mutually exclusive branches

The flagged `setState` calls sit in branches that each `return`, so they never run in the same
pass. The rule counts textual occurrences, not reachable paths, and React 19 batches anyway.

### `no-pass-data-to-parent` / `no-pass-live-state-to-parent`

`hydrate` is a data-fetching prop, not a callback that pushes child state upward.

### `rn-no-panresponder` — web-only branch

`customer/history/service-history-filter-rail.tsx` runs momentum only when
`Platform.OS === 'web'`; on native `shouldClaim` returns false, so the gesture is never claimed.
Inert on the production native runtime.

### `rn-no-scrollview-mapped-list` — eight fixed chips

Same file. The list is a fixed set of filter chips (`all`, `saved`, plus the six services).
Virtualising eight elements costs more than mapping them.

### `jsx-no-jsx-as-prop` — precondition absent

The rule matters when the receiving component is memoised. Only two components in `apps/mobile`
use `memo()` (`kael-response-surface.tsx`, `worker/jobs/active-body-surfaces.tsx`) and neither is
among the flagged call sites, so the measurable impact is zero.

### `no-render-in-render` — presentational helper

`renderInfoRow` in `worker/jobs/scope-surfaces.tsx` holds no state and calls no hooks, so there is
no state for a remount to lose.

### `js-set-map-lookups` — not an array lookup

`customer/kael-chat/agentic-estimate-evidence-display-model.ts` uses `String.includes`, not
`Array.includes`. The code already uses a `Set` where a set belongs.

### `rerender-lazy-ref-init` — correct, just allocation

`useRef(new Map())` / `new Set()` / `generateClientRequestId()` build a value on every render and
keep only the first. The behaviour is right — including the request-id case, where the ref still
yields a stable idempotency key. See the `useLazyRef` trap above before trying to close these.

### Maintainability rules — out of scope

`unused-export`, `no-multi-comp`, `no-giant-component`, `prefer-useReducer`, and the remaining
performance rules do not change runtime behaviour. `AdminGovernancePanel` is deliberately left on
`useState` rather than `useReducer`: it is admin-only, so the payoff does not justify the churn.

## Findings in `apps/api` and `scripts`

Left untouched. `apps/api` is not the mobile runtime (`governance/RULES.md` #0) and none of its
findings are in the Bugs category.
