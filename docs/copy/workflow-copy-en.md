# Workflow Copy — English (Canonical)

> Status: active reference. Phase 4.4 (plan §22.9.E, 2026-05-23).
>
> English mode is allowed only through the VI/EN switch (Rule #5). Default is
> Vietnamese; do not mix languages within a single mode.
>
> See `workflow-copy-vi.md` for the canonical Vietnamese counterpart.

## Hard locked strings

- Price disclaimer (Rule #4): use the Vietnamese wording even in EN summaries when the rule applies, OR keep an exact English translation only if the EN VI/EN switch is enabled end-to-end. Current production keeps Vietnamese wording; EN copy below mirrors meaning, not enforced for compliance.
- Kael final-price authority badge (Phase 2.0): `Computed by Kael` / `The new estimate is recomputed by Kael based on the scope the worker reported.`

## Customer workflow (EN-mode strings)

| Step | Surface | Key copy |
|---|---|---|
| A11 modal | ScopeChangeHardStopModal | `Approve scope change`, `Original estimate (Kael)`, `New estimate (Kael)`, `Computed by Kael` badge (Phase 2.0d). |
| A12 completion review | CustomerHistorySurface Done tab | `Final price (locked by Kael)`, `No completion photos yet`, `No worker notes`. |
| A14 review tags | CustomerHistorySurface review | `On time`, `Professional`, `Clean work`, `Explained clearly`, `Fair price`. |

## Worker workflow (EN-mode strings)

| Step | Surface | Key copy |
|---|---|---|
| B6 scope change | IncomingRequestSheet | `New scope details`, `Reason for the change`, `Kael computes the new price through policy review; the customer can add input or appeal.`, `Scope change photos (optional)`. |
| B7 completion | IncomingRequestSheet | `Completion notes`, `After-completion photos (1-5)`, `Kael-locked price` badge. |
| Notifications | EN body fallback uses Vietnamese until customer switches language; mobile notifications listener is language-aware after MEMORY.md confirms TS extraction. |

## TS extraction plan (deferred follow-up)

Same as Vietnamese — see `workflow-copy-vi.md`.
