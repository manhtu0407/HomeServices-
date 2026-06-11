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
| A | 1.1 Splash Screen | Partial | Partial | TBD | Expo app name/permissions, Kael charter/system prompt, public charter summary, and API metadata title now use NestScout; final splash logo asset still missing | In progress |
| A | 1.2 Welcome | Partial | Partial | TBD | Welcome shows NestScout, Kael mascot, supported-service chips for electrical/plumbing/cleaning only, and reference step dots; focused auth test, type-check, and full mobile Jest passed | In progress |
| A | 1.3 Login with Email | Partial | Partial | TBD | Customer email fallback submits through `signInWithPassword`; reset password stays an honest unavailable state; focused auth test passed | In progress |
| A | 1.4 Register with Email | Partial | Partial | TBD | Worker create UI now shows a review-boundary checklist, removes fake upload/action copy, and keeps submit on the real unavailable path because no mobile sign-up API is exposed; focused auth test passed | In progress |
| A | 1.5 Onboarding | Partial | Partial | TBD | Customer setup shows Kael onboarding hero/steps and saves real session/profile fields through `updateCustomerProfile`; focused auth test passed | In progress |
| B | 2.1 Home | Partial | Partial | TBD | Customer Home focused test passed: 4 real shortcuts, 3 supported services, active status/estimate from real deal data | In progress |
| B | 2.2 Search & Filter / Book | Partial | Partial | TBD | Booking Search & Filter reads real area/service/issue fields, supports user-selected problem chips for the three supported services, shows now-only schedule and locked payment honestly, and passes selected filters to Kael; focused booking test passed | In progress |
| B | 2.3 Media / Voice Note | Partial | Partial | TBD | Booking media rail previews real image-picker drafts by file name and hands the same `photoDrafts` to Kael chat; voice remains honest unavailable; focused booking test passed | In progress |
| B | 2.4 Kael Live Performance Chat | Partial | Partial | TBD | Live Performance panel reads real service, pending/media evidence count, selected problem chips, and polled Kael progress trace while preserving server service wrappers; focused Kael chat test passed | In progress |
| C | 2.5 Case Overview | Partial | Partial | TBD | Customer Activity command overview reads real deal, status, quote, address-release state, and workflow next event; focused history test passed | In progress |
| C | 2.6 Matching & AI Score | Partial | Partial | TBD | Activity Matching Score panel reads estimate confidence, broadcast worker signal, intake evidence count, area, real issue text, and Kael prebrief from real state; focused history test passed | In progress |
| C | 2.7 Kael Helper for Options | Partial | Partial | TBD | Chat helper shows real service and workflow gate context before opening the server-backed full Kael chat path | In progress |
| C | 2.8 Worker Offers & Quote | Partial | Partial | TBD | Price tab quote sheet reads broadcast price, Kael estimate, scope-change price/reason, and final-price state; focused history test passed; no fake offer/worker stats added | In progress |
| C | 2.9 Location & ETA | Partial | Partial | TBD | Activity Location & ETA panel reads address-release state, route gate, and search/worker signal, releases full address only after policy, and keeps ETA pending until a real travel signal exists; focused history test passed | In progress |
| C | 2.10 Live Job Alert | Partial | Partial | TBD | Activity Live Job Alert panel reads real notification rows, unread count, workflow artifact, and workflow next event; focused history test passed; push simulation not added | In progress |
| C | 2.11 Job Acceptance | Partial | Partial | TBD | Activity Job Acceptance panel reads accepted status, real service, released address, job chat gate, job id, and Kael prebrief; focused history test passed; no fake worker profile/rating added | In progress |
| C | 2.12 Job in Progress | Partial | Partial | TBD | Activity Job in Progress panel reads workflow phase, next event, completion evidence artifact, and job chat gate; focused history test passed; no fake percent/ETA added | In progress |
| D | 3.1 Worker Home | Partial | Partial | TBD | Worker Home readiness row reads real profile verification, availability, and current request state; focused worker suite passed | In progress |
| D | 3.2 Jobs | Partial | Partial | TBD | Active Jobs row reads accepted deal id, service, area, status, and real worker earning estimate; focused worker suite passed | In progress |
| D | 3.4 Kael On-site Advisory Chat | Partial | Partial | TBD | Worker JobRoom on-site advisory rail reads real status, address release, scope, and evidence gates; focused worker suite passed | In progress |
| D | 3.4 Evidence Upload | Partial | Partial | TBD | Completion evidence preview rail reads local image-picker draft URI/file names before the existing upload/status action; focused worker suite passed | In progress |
| D | 3.5 Earnings | Partial | Partial | TBD | Earnings reconciliation strip reads paid jobs, pending payout, platform fee, `from_date`/`to_date`, and daily chart data from `EarningsResponse`; focused worker suite passed | In progress |
| D | 3.6 Worker Rating | Partial | Partial | TBD | Worker profile no longer shows placeholder locked milestone copy; focused worker suite passed | In progress |
| D | 3.7 Safety & Checklist | Partial | Partial | TBD | Safety checklist renders address/scope/completion gates from real workflow state; focused worker suite passed | In progress |
| D | 3.8 Evidence & Scope Change | Partial | Partial | TBD | Existing scope/evidence boxes preserved; checklist does not add direct price input | In progress |
| D | 3.8 Job Summary | Partial | Partial | TBD | Submitted job summary reads completion note/media/status and waits for Kael price reconciliation; focused worker suite passed | In progress |
| D | 3.9 Summary & Report | Partial | Partial | TBD | Worker report card is read-only from real completion evidence; no fake report generation or final price input | In progress |
| E | 5.1 Customer Home / Commanding Home | Partial | 100% | TBD | Agentic Center greeting reads real profile metadata; summary shows active case, approval count, and unread notifications separately; Kael Orb route focused test passed; added-line token grep clean | In progress |
| E | 5.2 Active Case Command Center | Partial | 100% | TBD | Active case shows real deal id, service/status/estimate/area/description, `WorkflowPhaseContext` source/phase/artifact/next-event/action gate, real section rail, and case-level Kael chat/History actions; focused test passed; added-line token grep clean | In progress |
| E | 5.3 Approval Queue | Partial | 100% | TBD | Approval count is real state length or honest empty state; review actions route to existing History flows; scope approval uses real `actions.decideScopeChange` when customer decision is unlocked; completion stays review-only while Kael gate is locked; focused test passed; targeted surface token grep clean | In progress |
| E | 5.4 Memory & Preferences | Partial | 100% | TBD | Rows read sanitized `GET /me/kael-memory` self-view plus real profile metadata fallback; unsafe memory metadata is not rendered; edit CTA routes to the real profile surface; focused test passed; added-line token grep clean | In progress |
| F | Worker Overview | Partial | Partial | TBD | Worker profile route remains real-data only; hero uses real `legal_name` when present; locked milestone placeholder fixed; focused worker test passed | In progress |
| F | Worker Level Journey | Partial | Partial | TBD | Locked milestone copy is localized and honest; no placeholder markers | In progress |
| F | Worker Reputation & Performance | Partial | Partial | TBD | Reputation panel reads real `rating`, `total_jobs`, availability, and suspension state only; missing feedback stays in waiting state; no fake chart/radar added; focused worker test passed | In progress |
| F | Customer Overview | Partial | Partial | TBD | Customer profile insight panels use existing profile metadata; focused customer profile test passed | In progress |
| F | Customer Usage Ranking | Partial | Partial | TBD | Usage ranking reads real metadata aliases only, renders the `usage_rank_points` progress track when present, and otherwise hides the track with a waiting state; focused customer profile test passed | In progress |
| F | Customer Money Protection | Partial | Partial | TBD | Money protection reads real metadata aliases only, renders the `money_protection_score` progress track when present, and otherwise hides the track with a waiting state; focused customer profile test passed | In progress |

## Current Known Scoring Risks

- Existing app has many raw color/rgba/background/shadow hits in mobile UI/lib files. Phase 1 has added the official runtime token source and the new primitive/gallery files are raw-color clean, but full app token compliance is not claimed yet.
- The hidden `/(design-gallery)` foundation route renders the base component set, but no native screenshot has been captured against the official Component System page yet.
- Missing official Kael state assets block full visual match for mascot-heavy screens.
- Missing final NestScout logo decision blocks final splash/welcome fidelity.
- Profile screens now have honest data-gated insight panels and progress tracks, but native screenshot comparison is still pending.
