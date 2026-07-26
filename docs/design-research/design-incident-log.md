# Design Incident Log

Append-only record of visual / UX defects that got past the design gates. The contract for when to write an entry and when one may be closed is `governance/design/governance-cadence.md` §3.

The point of this file is **the gate change**, not the bug fix. An entry whose "Gate change" column says only "fixed it" is not closed.

## Schema

| Field | Meaning |
|---|---|
| `id` | `DI-NNN`, sequential, never reused |
| `date` | ISO date the defect was observed |
| `surface` | screen / component / flow where it showed |
| `defect` | what was observably wrong — not the root-cause narrative |
| `found_by` | `user` · `Tu-review` · `agent-review` · `device-smoke` |
| `gate_missed` | which gate should have caught it: `type-check` · `jest` · `visual-qa` · `design-review` · `human-signoff` · `none-existed` |
| `why_missed` | one line: why that gate could not see it |
| `gate_change` | the durable change — new test, new capture-matrix cell, rule edit, or an explicit accepted risk |
| `status` | `open` · `closed` (closed requires a real `gate_change`) |

## Entries

_None recorded yet. This log starts empty on purpose — no incident has been observed since it was created, and seeding it with invented entries would corrupt the evidence it exists to hold._

| id | date | surface | defect | found_by | gate_missed | why_missed | gate_change | status |
|---|---|---|---|---|---|---|---|---|

## Worked example (illustration only — NOT a real incident)

The row below is a format demonstration. It is deliberately kept outside the table above so it can never be miscounted as a recorded incident.

```text
id            DI-001
date          2026-01-01
surface       customer booking — price confirmation card
defect        On Android dark mode the price text rendered on a near-black glass
              fallback at ~2.1:1 contrast; unreadable in sunlight.
found_by      device-smoke
gate_missed   visual-qa
why_missed    The capture matrix covered iOS light + dark and Android light, but
              not Android dark, which is the only cell where the blur fallback
              (not native glass) is used.
gate_change   Added Android × dark as a required cell for any surface using
              GlassSurface; recorded in design/visual-qa.md §1.
status        closed
```

Note what makes the example closable: the gate change is a matrix cell that now exists, not "changed the colour".
