# MEMORY

## 2026-05-17 Frontend Logic & Workflow Session

- Completed mobile frontend workflow slice focused on auth, role guards, Customer booking, Kael handoff, Worker local deal audit, and frontend-only PR#12 lifecycle alignment.
- Added an in-memory local deal state machine in shared code. It does not use AsyncStorage, Supabase mutations, or backend job mutations.
- Customer flow now follows: draft/analyzing -> awaiting customer confirm -> broadcasting -> worker accepted/progressed -> completed by worker -> confirmed by customer.
- Worker flow now sees incoming local broadcasts only after customer confirm, hides full address until accept, then progresses through on-way/arrived/inspecting/repairing/completed.
- Login now uses Supabase Email/Password, reads profile role, guards Customer/Worker sections, and lets admin audit both sections from the auth gateway.
- Mobile Expo config loads public Supabase URL/publishable key from environment or local env files. Do not commit secrets, passwords, service-role keys, or admin credentials.
- Customer Profile admin header was fixed after browser audit so the role badge and section switch action do not overflow on narrow viewports.
- Fake production data was removed from Customer/Worker surfaces: no fake worker, earnings, payment success, review success, fixed VND estimate, or hardcoded Kael draft.
- Payment/review/scope-change remain locked placeholders until backend wiring is intentionally added.

## Verification Notes

- Relevant checks run during the session: mobile type-check, shared type-check, full repo type-check, shared mobile workflow tests, shared mobile wiring tests, full test suite, build, static sweeps, and Expo web route smoke.
- Known residual issue: `pnpm lint` still fails on pre-existing API lint debt outside this frontend workflow slice.
- Runtime caveat: local deal state is in-memory only and resets on reload/logout until backend wiring is implemented.
