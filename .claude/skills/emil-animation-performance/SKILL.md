---
name: emil-animation-performance
description: Keep web animations inside the frame budget — animate composite-only properties, keep motion off the main thread when the page is busy, and find the cause when an animation drops frames. Covers the layout/paint/composite pipeline, cheaper property swaps, CSS vs WAAPI vs requestAnimationFrame, Framer Motion's hardware-accelerated path, React re-rendering per frame, inherited CSS variable recalculation, blur cost, and  Use when an explicitly web-targeted animation is janky or needs performance review.
---

# emil-animation-performance

## Purpose
Diagnose web animation frame-budget problems.

## Source and adaptation
The full upstream skill is preserved at [animation-performance](docs/design-research/corpus/upstream/emilkowalski-skills/skills/animation-performance/SKILL.md) from emilkowalski/skills at commit 2d228630ba1446365f614a108cb8252f1feda202. Read its full source and only adjacent recipes or references needed for the task. The file inventory and checksums are in docs/design-research/corpus/upstream-manifest.json.
Use upstream material as expert guidance. NestScout governance, the assigned runtime, user scope, and the existing Design Wheel remain the operating contract. Do not repeat an upstream scripted greeting, stop early at an upstream prompt, or infer permission to install dependencies or edit extra surfaces.

## Runtime boundary
Target: web. Use only for explicitly assigned web work; do not apply DOM, CSS, hover, Sonner, or browser-performance guidance to apps/mobile.

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
