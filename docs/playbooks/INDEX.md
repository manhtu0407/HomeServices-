# Kael Playbooks

Distilled reasoning that teaches Kael how to think about each service — the "teaching channel" from the 2026-07 thread. Not model training: we compress a senior specialist's diagnosis into procedures a cheap runtime model executes the same way every time, then prove the gain with an eval.

**Start here:** [`process-distillation.md`](process-distillation.md) — the step-by-step SOP for producing or revising a playbook. Follow it every time; do not freestyle.

## Layout

```
playbooks/
  process-distillation.md      ← the method (read before authoring)
  codex-kael-capability-guide.md ← the three-task implementation + measurement guide
  INDEX.md                     ← this file (index + status board)
  services/<service>.md        ← the full textbook per service (human source of truth)
  eval/<service>-cases.json    ← ground-truth eval corpus per service
```

The compressed runtime segment (Appendix A of each textbook) does NOT live here — it becomes a code constant next to `prompts.ts` when injected (see the SOP §5). This folder holds the review source and measurement contract. A runtime copy is not proven equivalent merely because both files exist: generate it or enforce a bounded parity/hash gate before claiming source/runtime parity.

## Status board

| Service | Textbook | Runtime segment injected | Eval baseline | Last delta |
|---|---|---|---|---|
| electrical | [services/electrical.md](services/electrical.md) — v0.1 draft; Tu/domain review pending | local hardening implemented behind existing `KAEL_PLAYBOOK_ELECTRICAL_ENABLED`; **not deployed in this pass**; Appendix/runtime byte parity is unit-tested, but no deployed bundle is attested | historical live baseline: 20 cases, overall 40%, routing 70%; structured harness contract is local/mock only; live baseline/After requires approved matched staging slices | **NEEDS_HOLDOUT** — no comparable live After/delta or independent holdout yet |
| plumbing | — | no | — | — |
| cleaning | — | no | — | — |
| hvac | — | no | — | — |
| upholstery | — | no | — | — |
| handyman | — | no | — | — |

Update this row whenever a playbook advances a stage. "Kael got smarter" is only true when the "Last delta" column shows a measured, positive, non-regressing number.

## The 1% (what needs Tu before electrical ships)

See `services/electrical.md` Appendix C: resolve the `[VERIFY]` domain tags and three product-policy calls, attest the reviewed runtime segment, then run matched live baseline/After arms plus an independent holdout before shipping or claiming improvement.
