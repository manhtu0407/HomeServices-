# NestScout / Kael Rebuild Scoreboard

Status: Phase 1 foundation started. Agentic Center route is wired, but visual-match scoring still requires native screenshots.

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
| A | 1.1 Splash Screen | TBD | TBD | TBD | None yet | Not started |
| A | 1.2 Welcome | TBD | TBD | TBD | None yet | Not started |
| A | 1.3 Login with Email | TBD | TBD | TBD | None yet | Not started |
| A | 1.4 Register with Email | TBD | TBD | TBD | None yet | Not started |
| A | 1.5 Onboarding | TBD | TBD | TBD | None yet | Not started |
| B | 2.1 Home | TBD | TBD | TBD | None yet | Not started |
| B | 2.2 Search & Filter / Book | TBD | TBD | TBD | None yet | Not started |
| B | 2.3 Media / Voice Note | TBD | TBD | TBD | None yet | Not started |
| B | 2.4 Kael Live Performance Chat | TBD | TBD | TBD | None yet | Not started |
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

- Existing app has many raw color/rgba/background/shadow hits in mobile UI/lib files. Phase 1 has added the official runtime token source, but full token compliance is not claimed yet.
- Missing official Kael state assets block full visual match for mascot-heavy screens.
- Missing final NestScout logo decision blocks final splash/welcome fidelity.
- Profile screens must use real data only; missing metrics require honest empty/loading/error states.
