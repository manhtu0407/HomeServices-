---
name: emil-pick-ui-library
description: Pick the right library for a given frontend task from a curated, opinionated list — numbers, OTP inputs, charts, command menus, virtualization, drag and drop, toasts, state, styling, and more. Only runs when explicitly invoked; it does not trigger on its own. Use when the user explicitly invokes this skill to select a library.
---

# emil-pick-ui-library

## Purpose
Compare candidate libraries for an assigned frontend runtime.

## Source and adaptation
The full upstream skill is preserved at [pick-ui-library](docs/design-research/corpus/upstream/emilkowalski-skills/skills/pick-ui-library/SKILL.md) from emilkowalski/skills at commit 2d228630ba1446365f614a108cb8252f1feda202. Read its full source and only adjacent recipes or references needed for the task. The file inventory and checksums are in docs/design-research/corpus/upstream-manifest.json.
Use upstream material as expert guidance. NestScout governance, the assigned runtime, user scope, and the existing Design Wheel remain the operating contract. Do not repeat an upstream scripted greeting, stop early at an upstream prompt, or infer permission to install dependencies or edit extra surfaces.

## Runtime boundary
Target: library selection. Translate principles to the assigned runtime and existing NestScout Design Wheel.

## Use
1. Check the user-assigned surface and workflow.
2. Read the upstream skill and only relevant support files.
3. Keep fixtures and visual alternatives in test or sandbox code; preserve NestScout language, product, accessibility, data, and performance rules.
4. Use the matching NestScout protocol and gates for edits.

## Close
Apply only the requested result and state any material runtime or verification limit.
