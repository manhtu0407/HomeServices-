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
| B | 2.1 Home | Partial | Partial | TBD | Existing route has real greeting/address/services/dock; native screenshot pending | In progress |
| B | 2.2 Search & Filter / Book | Partial | Partial | TBD | Booking wizard remains wired to real service/problem/address handoff | In progress |
| B | 2.3 Media / Voice Note | Partial | Partial | TBD | Focused booking test verifies photo rail + honest voice capsule | In progress |
| B | 2.4 Kael Live Performance Chat | Partial | Partial | TBD | Existing Kael chat uses server service wrappers and honest mic unavailable path; native screenshot pending | In progress |
| C | 2.5 Case Overview | TBD | TBD | TBD | None yet | Not started |
| C | 2.6 Matching & AI Score | TBD | TBD | TBD | None yet | Not started |
| C | 2.7 Kael Helper for Options | TBD | TBD | TBD | None yet | Not started |
| C | 2.8 Worker Offers & Quote | TBD | TBD | TBD | None yet | Not started |
| C | 2.9 Location & ETA | TBD | TBD | TBD | None yet | Not started |
| C | 2.10 Live Job Alert | TBD | TBD | TBD | None yet | Not started |
| C | 2.11 Job Acceptance | TBD | TBD | TBD | None yet | Not started |
| C | 2.12 Job in Progress | TBD | TBD | TBD | None yet | Not started |
| D | 3.1 Worker Home | TBD | TBD | TBD | None yet | Not started |
| D | 3.2 Jobs | TBD | TBD | TBD | None yet | Not started |
| D | 3.4 Kael On-site Advisory Chat | TBD | TBD | TBD | None yet | Not started |
| D | 3.4 Evidence Upload | TBD | TBD | TBD | None yet | Not started |
| D | 3.5 Earnings | TBD | TBD | TBD | None yet | Not started |
| D | 3.6 Worker Rating | TBD | TBD | TBD | None yet | Not started |
| D | 3.7 Safety & Checklist | TBD | TBD | TBD | None yet | Not started |
| D | 3.8 Evidence & Scope Change | TBD | TBD | TBD | None yet | Not started |
| D | 3.8 Job Summary | TBD | TBD | TBD | None yet | Not started |
| D | 3.9 Summary & Report | TBD | TBD | TBD | None yet | Not started |
| E | 5.1 Customer Home / Commanding Home | Partial | Partial | TBD | `pnpm --filter @home-services/mobile type-check`; focused Agentic Center test passed | In progress |
| E | 5.2 Active Case Command Center | Partial | Partial | TBD | Active-case real-data RNTL test passed | In progress |
| E | 5.3 Approval Queue | Partial | Partial | TBD | Empty-state and unread-count RNTL coverage passed | In progress |
| E | 5.4 Memory & Preferences | Partial | Partial | TBD | Real metadata RNTL coverage passed | In progress |
| F | Worker Overview | TBD | TBD | TBD | None yet | Not started |
| F | Worker Level Journey | TBD | TBD | TBD | None yet | Not started |
| F | Worker Reputation & Performance | TBD | TBD | TBD | None yet | Not started |
| F | Customer Overview | TBD | TBD | TBD | None yet | Not started |
| F | Customer Usage Ranking | TBD | TBD | TBD | None yet | Not started |
| F | Customer Money Protection | TBD | TBD | TBD | None yet | Not started |

## Current Known Scoring Risks

- Existing app has many raw color/rgba/background/shadow hits in mobile UI/lib files. Phase 1 has added the official runtime token source and the new primitive/gallery files are raw-color clean, but full app token compliance is not claimed yet.
- The hidden `/(design-gallery)` foundation route renders the base component set, but no native screenshot has been captured against the official Component System page yet.
- Missing official Kael state assets block full visual match for mascot-heavy screens.
- Missing final NestScout logo decision blocks final splash/welcome fidelity.
- Profile screens must use real data only; missing metrics require honest empty/loading/error states.
