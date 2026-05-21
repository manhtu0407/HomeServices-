# Frontend Redesign Production Contract - 2026-05-21

Status: accepted prototype to production.

The approved source of taste is `.tmp/design-lab/frontend-redesign-20260521/index.html`. Production must absorb the layout, hierarchy, mint/cream material language, role gate, Kael surfaces, client/worker presence map shells, worker JobRoom, wage/profile polish, and toolbar motion direction without importing the prototype runtime artifact.

Implementation rules:
- Role gate uses the approved hero line `Bắt đầu từ điều bạn cần hôm nay` and signature `Đúng người, đúng việc, đúng lúc nhà cần.` with a restrained glass ribbon.
- Client and worker auth stay role-first. Client can show Google/phone intent only when implemented honestly; worker does not show Google.
- Customer Home, Booking, Kael, Schedule/History, Profile and Worker Home, Jobs, JobRoom, Earnings, Profile follow the accepted prototype hierarchy.
- Schedule/History may include presence-map shells only when backed by real workflow state or honest empty/pending state; never show fake live coordinates.
- Worker earnings keeps the prototype chart shell, but shows a no-data/empty visualization until real daily earning data exists.
- No prototype mock stats, fake prices, fake workers, fake ratings, fake earnings, fake queue, or fake addresses ship to production.
- Glass stays on shell, hero/summary, primary CTA, and dock. Repeated rows stay opaque/tinted.
- Motion uses small press feedback, opacity/y entrance, and toolbar selection motion. Reduce Motion and Reduce Transparency remain respected.

Verification:
- Compare production source against the prototype for missing sections, dock effects, role/login states, Kael chat structure, worker tabs, wage/earnings state, and profile polish.
- Run mobile type-check, shared mobile wiring tests, workflow tests, static sweeps, React Doctor if available, and `git diff --check`.
