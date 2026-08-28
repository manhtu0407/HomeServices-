# Kael Playbooks

Distilled reasoning that teaches Kael how to think about each service — the "teaching channel" from the 2026-07 thread. Not model training: we compress a senior specialist's diagnosis into procedures a cheap runtime model executes the same way every time, then prove the gain with an eval.

**Start here:** [`process-distillation.md`](process-distillation.md) — the step-by-step SOP for producing or revising a playbook. Follow it every time; do not freestyle. Use [`TEMPLATE.md`](TEMPLATE.md) for the service textbook shape.

**Latest audits:** [`six-service source audit`](../test-logs/2026-08-27_kael-playbook-six-service-source-audit.md) verifies all six lanes and explains why the branch UI omits untracked Playbooks; [`runtime gate report`](../test-logs/2026-08-27_kael-playbook-six-service-runtime-gate.md) records the 54/54 SQL and 6/6 Edge PASS plus the staging boundary.

## Layout

```
playbooks/
  process-distillation.md      ← the method (read before authoring)
  TEMPLATE.md                  ← reusable structure extracted from the electrical artifact
  codex-kael-capability-guide.md ← the three-task implementation + measurement guide
  INDEX.md                     ← this file (index + status board)
  services/<service>.md        ← the full textbook per service (human source of truth)
  eval/<service>-cases.json    ← ground-truth eval corpus per service
```

The compressed runtime segment (Appendix A of each textbook) does NOT live here — it becomes a code constant next to `prompts.ts` when injected (see the SOP §5). This folder holds the review source and measurement contract. A runtime copy is not proven equivalent merely because both files exist: generate it or enforce a bounded parity/hash gate before claiming source/runtime parity.

## Status board

| Service | Textbook | Runtime segment injected | Eval baseline | Last delta |
|---|---|---|---|---|
| electrical | [services/electrical.md](services/electrical.md) — v0.1 draft; Tu/domain review pending | local hardening implemented behind existing `KAEL_PLAYBOOK_ELECTRICAL_ENABLED`; synthetic live diagnostic deployed staging-only from this worktree (immediate v315; live baseline v316; live after v317; final listing v318); manifest deployment content attestation remains pending; Appendix/runtime byte parity is unit-tested | matched development baseline/After: 24/24 cases per arm, 0 errored; overall 33.33% → 62.50%, scope_signal 70.83% → 100%; synthetic self-review live baseline/After: 24/24 per arm, 0 errored, overall 37.50% → 75.00%, scope_signal 79.17% → 100%; synthetic labels are diagnostic only, not independent holdout | **NEEDS_HOLDOUT** — positive diagnostic deltas (+29.17pp matched; +37.50pp synthetic) with no observed scope regression in either pair; content-attest staging source and obtain independent labels before unlock/rollout |
| plumbing | [services/plumbing.md](services/plumbing.md) — v0.1 source artifact; domain review pending | registered behind `KAEL_PLAYBOOK_PLUMBING_ENABLED` (default off); Appendix/runtime byte parity checked locally; G2 `edge:check` PASS | strict local corpus + synthetic holdout: 24/24 each, 0 validation errors; G4 staging baseline/after blocked before traffic by missing approved staging variables | **SOURCE_ARTIFACT_READY / G2_PASS / NEEDS_HOLDOUT / LIVE_EVAL_BLOCKED** — no live delta or safety-recall claim; see [runtime gate report](../test-logs/2026-08-27_kael-playbook-six-service-runtime-gate.md) |
| cleaning | [services/cleaning.md](services/cleaning.md) — v0.1 source artifact; domain review pending | registered behind `KAEL_PLAYBOOK_CLEANING_ENABLED` (default off); selected-service safety scanner and deterministic inspection path wired; Appendix/runtime parity checked locally; G2 `edge:check` PASS | strict local corpus + synthetic holdout: 24/24 each; every slug ≥2; safety/difficulty/complexity coverage gate PASS; G4 staging baseline/after blocked before traffic | **SOURCE_ARTIFACT_READY / G2_PASS / NEEDS_INDEPENDENT_REVIEW / LIVE_EVAL_BLOCKED** — no live delta or safety-recall claim |
| hvac | [services/hvac.md](services/hvac.md) — v0.1 source artifact; domain review pending | registered behind `KAEL_PLAYBOOK_HVAC_ENABLED` (default off); selected-service safety scanner includes `height_access`; Appendix/runtime parity checked locally; G2 `edge:check` PASS | strict local corpus + synthetic holdout: 24/24 each; every slug ≥2; safety/difficulty/complexity coverage gate PASS; G4 staging baseline/after blocked before traffic | **SOURCE_ARTIFACT_READY / G2_PASS / NEEDS_INDEPENDENT_REVIEW / LIVE_EVAL_BLOCKED** — no live delta or safety-recall claim |
| upholstery | [services/upholstery.md](services/upholstery.md) — v0.1 source artifact; domain review pending | registered behind `KAEL_PLAYBOOK_UPHOLSTERY_ENABLED` (default off); selected-service safety scanner and treatment-safety guidance wired; Appendix/runtime parity checked locally; G2 `edge:check` PASS | strict local corpus + synthetic holdout: 24/24 each; every slug ≥2; safety/difficulty/complexity coverage gate PASS; G4 staging baseline/after blocked before traffic | **SOURCE_ARTIFACT_READY / G2_PASS / NEEDS_INDEPENDENT_REVIEW / LIVE_EVAL_BLOCKED** — no live delta or safety-recall claim |
| handyman | [services/handyman.md](services/handyman.md) — v0.1 source artifact; domain review pending | registered behind `KAEL_PLAYBOOK_HANDYMAN_ENABLED` (default off); selected-service safety scanner and specialist-boundary guidance wired; Appendix/runtime parity checked locally; G2 `edge:check` PASS | strict local corpus + synthetic holdout: 24/24 each; every slug ≥2; safety/difficulty/complexity coverage gate PASS; G4 staging baseline/after blocked before traffic | **SOURCE_ARTIFACT_READY / G2_PASS / NEEDS_INDEPENDENT_REVIEW / LIVE_EVAL_BLOCKED** — no live delta or safety-recall claim |

Update this row whenever a playbook advances a stage. "Kael got smarter" is only true when the "Last delta" column shows a measured, positive, non-regressing number.

## The 1% (what needs Tu before electrical ships)

See `services/electrical.md` Appendix C: resolve the `[VERIFY]` domain tags and three product-policy calls, attest the reviewed runtime segment, then run matched live baseline/After arms plus an independent holdout before shipping or claiming improvement.
