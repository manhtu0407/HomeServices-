# NestScout / Kael Rebuild Scoreboard

Status: Phase 1 foundation implemented with the hidden design gallery and Agentic Center route. Visual-match scoring still requires native screenshots.

Scoring gates from the handoff:

- Structure: 100% binary.
- Token compliance: 100% binary.
- Visual match: target >= 99%.

Legend:

- `Not started`: no rebuild work yet.
- `Blocked`: needs Tu answer or asset/export.
- `TBD`: score to be filled after screenshot comparison.

| Group | Screen | Structure | Token compliance | Visual match | Evidence | Status |
|---|---|---:|---:|---:|---|---|
| A | 1.1 Splash Screen | Partial | Partial | TBD | Expo app name/permissions now NestScout; final splash logo asset still missing | In progress |
| A | 1.2 Welcome | Partial | Partial | TBD | `pnpm --filter @home-services/mobile type-check`; focused auth test passed | In progress |
| A | 1.3 Login with Email | Partial | Partial | TBD | Focused auth test verifies role-first entry and customer email fallback remains explicit | In progress |
| A | 1.4 Register with Email | Partial | Partial | TBD | Worker create UI remains honest unavailable state; no auth sign-up API exposed in provider | In progress |
| A | 1.5 Onboarding | Partial | Partial | TBD | Existing customer profile setup remains wired to `updateCustomerProfile`; native screenshot pending | In progress |
| B | 2.1 Home | Partial | Partial | TBD | Customer Home focused test passed: 4 real shortcuts, 3 supported services, active status/estimate from real deal data | In progress |
| B | 2.2 Search & Filter / Book | Partial | Partial | TBD | Booking wizard Search & Filter brief reads real area/service/issue fields, shows now-only schedule and locked payment honestly; focused booking test passed | In progress |
| B | 2.3 Media / Voice Note | Partial | Partial | TBD | Focused booking test verifies photo rail + honest voice capsule | In progress |
| B | 2.4 Kael Live Performance Chat | Partial | Partial | TBD | Live Performance panel reads real service, pending/media evidence count, and polled Kael progress trace while preserving server service wrappers; focused Kael chat test passed | In progress |
| C | 2.5 Case Overview | Partial | Partial | TBD | Customer Activity command overview reads real deal, status, quote, and address-release state; focused history test passed | In progress |
| C | 2.6 Matching & AI Score | Partial | Partial | TBD | Activity Matching Score panel reads estimate confidence, broadcast worker signal, intake evidence count, area, and Kael prebrief from real state; focused history test passed | In progress |
| C | 2.7 Kael Helper for Options | Partial | Partial | TBD | Agentic Center links to full Kael chat; server-backed chat path preserved | In progress |
| C | 2.8 Worker Offers & Quote | Partial | Partial | TBD | Price tab quote sheet reads broadcast price, Kael estimate, scope-change price, and final-price state; focused history test passed; no fake offer/worker stats added | In progress |
| C | 2.9 Location & ETA | Partial | Partial | TBD | Address stays area-only until released; ETA uses honest live-signal waiting copy | In progress |
| C | 2.10 Live Job Alert | Partial | Partial | TBD | Existing notification/approval state surfaced in Agentic Center; push simulation not added | In progress |
| C | 2.11 Job Acceptance | Partial | Partial | TBD | Activity command overview reflects worker accepted/on-way state through existing deal data | In progress |
| C | 2.12 Job in Progress | Partial | Partial | TBD | Activity command overview and worker checklist reflect active workflow gates | In progress |
| D | 3.1 Worker Home | Partial | Partial | TBD | Existing worker home remains wired to real readiness/jobs; focused worker suite passed | In progress |
| D | 3.2 Jobs | Partial | Partial | TBD | Worker active jobs now include safety checklist gates; focused worker suite passed | In progress |
| D | 3.4 Kael On-site Advisory Chat | Partial | Partial | TBD | Worker JobRoom on-site advisory rail reads real status, address release, scope, and evidence gates; focused worker suite passed | In progress |
| D | 3.4 Evidence Upload | Partial | Partial | TBD | Existing completion evidence box remains wired; checklist routes completion guidance to evidence state | In progress |
| D | 3.5 Earnings | Partial | Partial | TBD | Earnings reconciliation strip reads paid jobs, pending payout, platform fee, and daily chart data from `EarningsResponse`; focused worker suite passed | In progress |
| D | 3.6 Worker Rating | Partial | Partial | TBD | Worker profile no longer shows placeholder locked milestone copy; focused worker suite passed | In progress |
| D | 3.7 Safety & Checklist | Partial | Partial | TBD | Safety checklist renders address/scope/completion gates from real workflow state; focused worker suite passed | In progress |
| D | 3.8 Evidence & Scope Change | Partial | Partial | TBD | Existing scope/evidence boxes preserved; checklist does not add direct price input | In progress |
| D | 3.8 Job Summary | Partial | Partial | TBD | Submitted job summary reads completion note/media/status and waits for Kael price reconciliation; focused worker suite passed | In progress |
| D | 3.9 Summary & Report | Partial | Partial | TBD | Worker report card is read-only from real completion evidence; no fake report generation or final price input | In progress |
| E | 5.1 Customer Home / Commanding Home | Partial | Partial | TBD | Agentic Center summary row and Kael Orb route focused test passed | In progress |
| E | 5.2 Active Case Command Center | Partial | Partial | TBD | Active-case summary values use real deal/approval/preference state; focused test passed | In progress |
| E | 5.3 Approval Queue | Partial | Partial | TBD | Approval count is real state length or honest text empty state; focused test passed | In progress |
| E | 5.4 Memory & Preferences | Partial | Partial | TBD | Memory count is real preference length or honest text empty state; focused test passed | In progress |
| F | Worker Overview | Partial | Partial | TBD | Worker profile route remains real-data only; locked milestone placeholder fixed | In progress |
| F | Worker Level Journey | Partial | Partial | TBD | Locked milestone copy is localized and honest; no placeholder markers | In progress |
| F | Worker Reputation & Performance | Partial | Partial | TBD | Existing reputation fields remain data-gated; no fake chart/radar added | In progress |
| F | Customer Overview | Partial | Partial | TBD | Customer profile insight panels use existing profile metadata; focused customer profile test passed | In progress |
| F | Customer Usage Ranking | Partial | Partial | TBD | Usage ranking reads real metadata aliases only, otherwise waiting state | In progress |
| F | Customer Money Protection | Partial | Partial | TBD | Money protection reads real metadata aliases only, otherwise waiting state | In progress |

## Current Known Scoring Risks

- Existing app has many raw color/rgba/background/shadow hits in mobile UI/lib files. Phase 1 has added the official runtime token source and the new primitive/gallery files are raw-color clean, but full app token compliance is not claimed yet.
- The hidden `/(design-gallery)` foundation route renders the base component set, but no native screenshot has been captured against the official Component System page yet.
- Missing official Kael state assets block full visual match for mascot-heavy screens.
- Missing final NestScout logo decision blocks final splash/welcome fidelity.
- Profile screens now have honest data-gated insight panels, but native screenshot comparison is still pending.
