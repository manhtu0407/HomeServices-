# Structures Spoke - Admin Workflow

> Extracted from `STRUCTURES.md` section 8 for progressive disclosure (2026-06-24). The hub keeps sections 0-4 plus the spoke routing table; load this spoke for admin control workflows. `RULES.md` and `critical.md` remain higher authority; if this conflicts with them or with Tu, stop and ask.

## 8. Admin Workflow

Admin panel is required because trust, pricing, learning, and support cannot be safely handled only by customer/worker apps.

```text
Admin workflows
-
|- worker approval queue
|- worker profile review
|- worker suspension/reinstatement
|- CCCD entry at worker approval (required before the first approval)
|- discipline queue: confirm, dismiss or mark fabricated; one-tap L5 suspension; appeal decisions; identity blocklist (workers.discipline.manage)
|- ambassador program editor with a live 60% cap preview; approval by a second administrator (workers.bonus.manage)
|- worker_bonus tax rule with an optional threshold in the finance tax editor
|- price baseline management
|- job monitor
|- scope change monitor
|- failed AI call monitor
|- support/dispute queue
|- service taxonomy management
|- learning rule visibility and rollback
|- AI cost/session monitoring
```

Admin control points:

```text
Human control required
-
|- worker approval
|- worker suspension
|- every worker penalty (the system only proposes)
|- ambassador program versions
|- dispute resolution
|- service expansion
|- payment policy changes
|- rollback of bad learned rules
```

Admin does not approve every Kael learning event. Admin must be able to see, audit, disable, and roll back learned rules.
