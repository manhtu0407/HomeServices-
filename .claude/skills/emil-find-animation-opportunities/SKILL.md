---
name: emil-find-animation-opportunities
description: Search a codebase or UI for places that don't animate but should, and reject everything that shouldn't. Read-only; it proposes motion with exact values, it does not implement it. Use when the user asks 'what could be animated here?' or wants to 'make this feel more alive'. For fixing existing animations, use improve-animations or review-animations instead. Use when the user asks where motion could help or how to improve responsiveness.
---

# emil-find-animation-opportunities

## Purpose
Find purposeful motion opportunities and candidates that should remain static.

## Source and adaptation
The full upstream skill is preserved at [find-animation-opportunities](docs/design-research/corpus/upstream/emilkowalski-skills/skills/find-animation-opportunities/SKILL.md) from emilkowalski/skills at commit 2d228630ba1446365f614a108cb8252f1feda202. Read its full source and only adjacent recipes or references needed for the task. The file inventory and checksums are in docs/design-research/corpus/upstream-manifest.json.
Use upstream material as expert guidance. NestScout governance, the assigned runtime, user scope, and the existing Design Wheel remain the operating contract. Do not repeat an upstream scripted greeting, stop early at an upstream prompt, or infer permission to install dependencies or edit extra surfaces.

## Runtime boundary
Target: cross-platform review. Translate principles to the assigned runtime and existing NestScout Design Wheel.

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
