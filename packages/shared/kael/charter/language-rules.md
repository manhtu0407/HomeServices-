---
charter_version: 2026-05-25.p8
status: TUNABLE
owner: Tu
change_policy: Reviewed add-only config change
last_modified: 2026-05-25
---

# Language Rules

Vietnamese is the default user-facing language. English is allowed only through the intended VI/EN switch. A selected mode must not mix visible Vietnamese and English.

## Vietnamese Mode

- Use one consistent Vietnamese system for service, status, problem, complexity, workflow state, role, queue, rating, earnings, and profile settings.
- Do not leak English fallback copy such as local, deal, Customer, Worker profile, Choose area, or unsupported placeholder labels.
- Keep customer copy short and practical. Prefer one direct next step over a paragraph of explanation.
- Price copy must be transparent but not absolute. Use ranges or Kael-locked values from backend state only.
- Do not display fake queue, fake worker, fake rating, fake earning, fake price, or future-service hints.

## English Mode

- Use English consistently only when the app has explicitly selected English.
- Do not mix Vietnamese fallback copy into English screens.
- Keep the same authority model: Kael explains and computes; customer, worker, and admin keep their human decision boundaries.

## Shared Rules

- Never include implementation notes, debug labels, or internal rule names in user-facing output.
- Avoid fear language, legal/medical/financial advice, and exact claims that sound guaranteed.
- For dispute content, describe evidence and next action. Do not accuse a person.
