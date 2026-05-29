# Kael Protocol — UI / React Native Execution

> Extracted from `critical.md` for progressive disclosure (2026-05-29). critical.md keeps the universal gates, `kael-preflight` (§5), and `kael-review` (§8); load this file only when critical.md §1 selects one of its protocols for the current task class.

Load for UI work in the Expo RN app and Next.js support/admin/prototype surfaces. Read `design.md` alongside this when the task touches visual design, motion, mascot, tokens, or layout.

## 16. Kael Protocol: `kael-ui-rn-execution`

Use for UI work in the current Expo React Native app and in Next.js support/admin/prototype surfaces.

### Inputs Required

- Target surface: Expo React Native app, admin, prototype, or API support.
- User flow step.
- Copy requirements.
- Confirmation requirements.
- Verification method.
- `design.md` when the task touches visual design, layout, motion, mascot, design tokens, frontend styling, or prototype UI.

### Workflow

1. Confirm the surface is not turning Next.js into the consumer product.
2. Apply `design.md` before choosing visual direction, layout, tokens, motion, mascot treatment, or prototype structure.
3. For major screens or visual systems, run the `design.md` design lab before production build.
4. State skill adaptations from `design.md` before using generic design/frontend skills.
5. Use Vietnamese for all user-facing text.
6. Use terms from `STRUCTURES.md`.
7. Preserve explicit confirmation for booking/payment/scope changes.
8. Verify UI impact across related screens/components.
9. For small UI tasks, use test-after or visual/manual verification.
10. For React Native work, check mobile constraints and the Edge/mobile runtime boundary.

### Current Product Workflow Reference

Customer flow:

- A0 Auth.
- A1 Customer dashboard.
- A2 Problem chips.
- A3 Detailed description and media upload.
- A4 Kael clarification.
- A5 Price estimate card.
- A6 Time selection.
- A7 Customer confirms booking search.
- A8 Searching for worker.
- A9 Worker matched.
- A10 Active job and chat.
- A11 Scope change confirmation.
- A12 Completion confirmation.
- A13 Payment.
- A14 Worker rating.

Worker flow:

- B0 Worker registration and manual approval.
- B1 Admin approval required.
- B2 Worker home and availability.
- B3 Incoming job request with 60s accept countdown.
- B4 Job details after accept.
- B5 On-site status updates.
- B6 Scope change request.
- B7 Complete job.
- B8 Earnings.

Critical confirmations:

- A7 customer booking confirmation.
- B2 worker accept.
- A11 customer scope change confirmation.
- B5 worker completion signal.
- A12 customer completion/payment confirmation.

### Money-Impacting UI Rule

Any booking, payment, cancellation, or scope change UI MUST include explicit user confirmation. The UI MUST NOT auto-advance through money-impacting states.

Scope change A11 is a critical confirmation protocol:

- full-screen or equivalent hard-stop state,
- old scope vs new scope,
- old price reference vs new price reference,
- clear reason,
- continue or cancel,
- worker blocked until customer decision.

B2 worker accept countdown MUST later be tested for expiry and auto-decline behavior when implemented.

### Chat Relay Conduct Rule

Customer and worker chat content is relayed through Kael. Kael MUST NOT filter or rewrite normal customer/worker content. Kael may only intervene for safety, legal, security, abuse, or platform-protection cases. Kael system messages MUST be visually distinct from human messages.

### Current React Native Mobile Constraints

For React Native work, the agent MUST consider:

- small screen layout,
- slow network,
- image/video upload,
- push notifications,
- permission flows,
- offline-ish interruption handling,
- mobile keyboard behavior,
- accessibility/touch targets.

### Anti-Slop UI Gate

Before adding any animation or decorative effect, run the motion preflight (skill `kael-motion`; canonical `design/motion.md`):

- **Should this animate at all?** Motion is required only at key product moments. If it is not one, ship it static.
- **Reject AI-slop motion:** pulsing indicators, blur-everywhere entrances, hover-scale-on-everything, stagger-spam, bouncy springs on utility actions, uniform fade-ins, motion-on-mount for static content, animated blur radius, decorative infinite loops, glass-on-glass stacking, large parallax, spinning.
- **Decoration must earn its place** (`design.md` §27 Forbidden AI Defaults + `design/decoration-mascot-icons.md`): no gradient orbs, bento-as-default, card spam, nested cards, fake stats.
- **Honor** Reduce Motion / Reduce Transparency and the Performance Budget (60fps; no real-time blur in long lists).

### Output Format

```text
Surface:
Workflow step:
User-facing copy:
Confirmation states:
design.md impact:
Skill adaptation:
Verification:
Related UI risk:
```

### Failure Modes

- English user-facing copy.
- Generic SaaS/Bento/web design default instead of `design.md`.
- Next.js becomes consumer web product.
- Auto-confirming money-impacting actions.
- UI change verified only in one narrow state.

### Anti-Patterns

- Marketing landing page instead of functional app surface.
- Using XanhSM as a copy target instead of a reference system.
- Hidden booking/payment side effects.
- Future-service entries shown without Tu's explicit approval.

