---
name: emil-break-ui
description: Try to break a piece of UI by feeding it worst-case data — long names, unbreakable emails, one-letter names, missing fields, huge counts, zero items, long labels, non-Latin text, emoji, extreme numbers — then render it behind a 'Demo data / Worst case' toggle and report everything that broke, with the fix for each. Use when the user asks to stress-test, break, or find edge cases in a component or screen, or to 'try t Use when the user asks to stress-test UI edge cases.
---

# emil-break-ui

## Purpose
Stress-test UI with edge-case fixtures, without fake product data.

## Source and adaptation
The full upstream skill is preserved at [break-ui](docs/design-research/corpus/upstream/emilkowalski-skills/skills/break-ui/SKILL.md) from emilkowalski/skills at commit 2d228630ba1446365f614a108cb8252f1feda202. Read its full source and only adjacent recipes or references needed for the task. The file inventory and checksums are in docs/design-research/corpus/upstream-manifest.json.
Use upstream material as expert guidance. NestScout governance, the assigned runtime, user scope, and the existing Design Wheel remain the operating contract. Do not repeat an upstream scripted greeting, stop early at an upstream prompt, or infer permission to install dependencies or edit extra surfaces.

## Runtime boundary
Target: cross-platform tests. Translate principles to the assigned runtime and existing NestScout Design Wheel.

## Use
1. Check the user-assigned surface and workflow.
2. Read the upstream skill and only relevant support files.
3. Keep fixtures and visual alternatives in test or sandbox code; preserve NestScout language, product, accessibility, data, and performance rules.
4. Use the matching NestScout protocol and gates for edits.

## Close
```text
Scope:
Source principles retained:
NestScout adaptations and limits:
Findings or changes:
Verification / untested states:
```
