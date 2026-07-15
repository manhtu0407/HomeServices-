# Kael Playbooks

Distilled reasoning that teaches Kael how to think about each service — the "teaching channel" from the 2026-07 thread. Not model training: we compress a senior specialist's diagnosis into procedures a cheap runtime model executes the same way every time, then prove the gain with an eval.

**Start here:** [`process-distillation.md`](process-distillation.md) — the step-by-step SOP for producing or revising a playbook. Follow it every time; do not freestyle.

## Layout

```
playbooks/
  process-distillation.md      ← the method (read before authoring)
  INDEX.md                     ← this file (index + status board)
  services/<service>.md        ← the full textbook per service (human source of truth)
  eval/<service>-cases.json    ← ground-truth eval corpus per service
```

The compressed runtime segment (Appendix A of each textbook) does NOT live here — it becomes a code constant next to `prompts.ts` when injected (see the SOP §5). This folder is the source of truth and the measurement; the runtime copy is generated from it.

## Status board

| Service | Textbook | Runtime segment injected | Eval baseline | Last delta |
|---|---|---|---|---|
| electrical | [services/electrical.md](services/electrical.md) — v0.1, Tu approved | **wired behind `KAEL_PLAYBOOK_ELECTRICAL_ENABLED` (off; not deployed)** | single-turn baseline 20/24 (routing 70%, 6 gaps); multi-turn harness ready; full before/after rate-gated (20 creates/hour/user) | — (awaiting deploy + paced runs) |
| plumbing | — | no | — | — |
| cleaning | — | no | — | — |
| hvac | — | no | — | — |
| upholstery | — | no | — | — |
| handyman | — | no | — | — |

Update this row whenever a playbook advances a stage. "Kael got smarter" is only true when the "Last delta" column shows a measured, positive, non-regressing number.

## The 1% (what needs Tu before electrical ships)

See `services/electrical.md` Appendix C: resolve the `[VERIFY]` domain tags and three product-policy calls, then run the baseline eval before any injection.
