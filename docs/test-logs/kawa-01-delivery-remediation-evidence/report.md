# KAWA_01 — Final safety-delivery remediation candidate

**Verdict: READY FOR INDEPENDENT REVIEW.** This is the author's implementation handoff, not independent acceptance or release approval. Broad automatic emergency detection is still inadequate. Final CI, merge and deployment have not been authorized or run.

Repository: manhtu0407/HomeServices-, PR #403. Worktree: C:/Users/Phan Manh Tu/.codex/worktrees/kawa-foundation-safety-20261020/home-services. Branch: codex/kawa-foundation-safety-20261020. HEAD remains 062db16094a5eb8168e9bdec9823c221aea729ae. Latest fetched main: 111988b0ad6ec276082f6a4706866401fc887e4b. The candidate includes uncommitted changes; its tree identity and simulation limits are in candidate-metadata.json. The dirty Desktop checkout was not edited.

## Scope and exact changes

Owner approved an additive emergency error contract, actual Customer Kael handling, and a minimal local fallback. The parent handled integration and all remaining work after Tu requested no more SubAgents. No further agents were created.

[source-files.md](source-files.md) lists all 30 source/test/generated-registry paths changed for this delivery remediation. [delivery-only.patch.txt](delivery-only.patch.txt) is the incremental diff from the preserved starting index; [candidate-complete.patch.txt](candidate-complete.patch.txt) includes the earlier staged quality corrections and current index/ledger changes. New evidence files are inventoried separately in file-digests.json to avoid a self-referential patch. No new RPC, migration, provider, dependency, Job/quote/match/payment/consent transition, or paid call was introduced. Existing evidence packets are retained.

Implementation owners:

- Shared contract twins: packages/shared/src/contracts/emergency-guidance.ts and supabase/functions/_shared/contracts/emergency-guidance.ts; shared index exports. Strict version/route whitelist, no free text, identifiers or extra keys. VI/EN static copy exactly matches the frozen classifier copy.
- Domain: domains/kael-chat/emergency-turn.ts registers route-only delivery metadata after customer authorization and existing-Case ownership. create/turn/evidence register before the relevant business refusal. Schema-failure handling extracts bounded customer-authored text, checks referenced-Case ownership, and writes no state.
- Transport: platform/emergency-guidance.ts holds request-local WeakMap metadata; http.ts clears contexts and appends only trusted guidance to existing JSON errors; http/dispatch/kael.ts covers schema rejections; stream.ts attaches it to error events. Arbitrary exception extras cannot populate the reserved field; other fields are retained.
- Customer mobile: api.ts and kael-stream.ts validate optional guidance. Request/evidence/next-action/decision handlers and normal-conversation forwarding deliver it to a separate conversation reducer slot. No error creates a successful turn or modifies booking state. Mode/session changes clear guidance. Static copy is rendered separately from localized generic failure text.
- Local UI: customer-kael-emergency-access.tsx is wired into the existing Customer Kael surface. A visible button opens a scrollable opaque native sheet with six reviewed guidance routes and 112/113/114/115 contact information. No network, classifier, provider, phone permission, automatic call or business write is required.
- P416/P417/P418 are collected by existing API/mobile runners; the generated pillar registry is updated. Evaluator source hashing includes the new delivery dependency and contract, preserving P402's provenance invariant. H5 labels, thresholds and historical manifests are unchanged.

## Root causes and fixed regression matrix

The common defect was that recognized safety guidance either arrived after a business rejection or was embedded in a string that mobile deliberately replaced with localized failure copy. SSE also discarded structured guidance. The fix adds a safe delivery channel while retaining the rejection.

| Failure | Preserved outcome | Correction and evidence |
|---|---|---|
| New Case, foreign media | 400 VALIDATION, no Case/turn | Authorized new request registers route before media validation; P416 foreign-media tracer |
| Invalid media format | 400 VALIDATION, no Case/turn | Bounded schema-refusal path; no evidence consumed; P416 malformed-media test |
| Missing upload intent | 400 MEDIA_INTENT_INVALID, no Case/turn | Registration precedes upload-intent validation; P416 |
| Required evidence refused | 409 EVIDENCE_REQUIRED, Case unchanged | Advisory electrical-water route accompanies refusal; skip still denied; P416 |
| Existing Case, rejected evidence | 400 MEDIA_INTENT_INVALID, Case/turns unchanged | Registration follows ownership and precedes evidence consumption; P416 |
| Closed Case | 409 INVALID_STATUS, never reopened | Existing owner receives guidance in error metadata; confirmed/abandoned/unsupported tested |
| Emergency reply persistence fails | 500 DB_ERROR, no business transition | Metadata survives failed writes; existing bounded partial-write mitigation is preserved, not claimed atomic |
| SSE request fails | Existing SSE transport plus error event, no result event | Trusted route attached to error event; mobile returns success:false and leaves Case/turn state unchanged |
| New-Case quota rejects | 429 RATE_LIMITED, no Case/turn | Route registered before create quota; quota is still enforced |

The eight owner-specified classes are covered; invalid-format and foreign-media variants are shown separately. SSE retains the existing HTTP 200 stream-opening protocol. It emits a failure event with the original code, never a successful result; JSON rejections retain their original HTTP status. This does not disguise a failed business operation as successful.

P416 also covers ordinary input, foreign customer (existing privacy-preserving 404), worker/admin 403, rejected-request replay, and hostile exception extras. No new private Case content is returned to unauthorized callers. Strict payload tests reject transcript/address/actor_hash extensions and unknown versions/routes. The fixtures assert no providers, forbidden table writes, Jobs, approval or evidence acceptance. These are T0 proofs with real HTTP dispatch and in-memory database boundaries, not RLS or transaction proofs.

## Compatibility and mobile behavior

Wire addition: optional emergency: { version: 'v1', route: 'fire' | 'medical' | 'police' | 'electrical_water' | 'gas' | 'uncertain' }. Existing status, code, error/message and other fields are preserved. Old clients may ignore the addition. New clients safely accept old responses with no emergency field. Unknown versions, routes and extra keys are ignored. Client language selects reviewed copy; no raw exception text is rendered as guidance.

P418 exercises api.post, the actual message action and conversation reducer, and the real SSE parser/transport with an injected fetch boundary. The optional transport argument follows the existing normal-conversation testing seam; Expo's lazy native fetch remains the production default. JSON 400/409/500, SSE error, repeated reports, hostile/missing metadata, network interruption and connection timeout all keep the original failure and existing Case. Two repeated reports occupy one guidance slot and create no extra transcript turn. Local access opens and closes in VI/EN without calling fetch. No business state is used by the local UI.

## Red/green and actual verification

Raw logs and exit-code records are retained in this folder. Commands shown here were actually executed; interim failures were corrected rather than hidden.

- P416 original-index implementation: 12 failures / 4 negative controls passed, exit 1. Backups were restored in finally; no branch or real index change. The first foreign-media tracer independently reproduced the missing field before implementation.
- P418 initial JSON/action tracer: 2 failures, Jest exit 1. Final P418: 15/15 pass, exit 0. A Sentry cleanup timer in the test environment was isolated with a telemetry mock; real parsing, request actions and reducer remain under test.
- Final P416/P417: 32/32 pass. Earlier full P401-P417 API selection: 982/982, 16 collected files; the additional hostile-exception-extra control subsequently passes with P416.
- Full root pnpm test:api: exit 0, Vitest 3,438 pass / 7 skipped in that run, followed by Node 114 pass / 1 skipped. After the final reserved-field control, full Vitest was repeated: 3,440 pass / 6 skipped, zero failures; see api-vitest-complete.json and api-skipped-tests.json. The exported JSON redacts two occurrences of one token-like substring in test-title metadata; counts/statuses and raw text logs are unchanged (report-redactions.json). No assertion or skip condition was weakened. Skips require isolated local DB or hosted Stage 1 context; neither was provisioned here. Node tests' one skip is recorded in the root log.
- pnpm test:mobile: exit 0, 285 suites / 2,646 tests pass. Final focused P418 rerun: 15 pass. The full run retains existing act warnings; warnings are not native visual evidence.
- pnpm test:shared and pnpm type-check:shared: exit 0, 189 tests pass. API/mobile type checks and pnpm build:api pass. An incomplete test-only SSE input was corrected to include required photo_urls before final mobile type verification.
- Structure/baseline/comments, production UI copy, Edge-to-DB source scan, migration/pillar registries, test collection, playbook parity, skill sync/contracts, and React Doctor changed checks pass. React Doctor reports zero issues in the changed scope. Work-plan lint is rerun after closing implementation slices.
- Last full mobile lint remains red: 75 existing errors and 89 warnings in that run. Two new duplicate-import warnings were subsequently removed; changed mobile files lint clean. Existing baseline errors are not accepted or repaired by this task. API lint passes with existing warnings. lint:authority remains red at the unchanged normal-chat-suggestions-cache pillar's nonexistent Plan section 3.4 citation.
- Gitleaks 8.30.1 with config/security/gitleaks.toml scans the candidate patch and complete evidence folder clean; no secret found. An initial wrong config-path invocation failed and was corrected. The first complete-folder scan flagged token-like test-title metadata; only those exported title fields were redacted before a clean rescan. Prior 17-log renames remain byte-identical, classifier files unchanged, and the original 93-path staged correction patch was verified unchanged.

Edge verification: PASS, 7 discovered / 7 selected / 7 checked / 0 failed, plus 4 Deno client-compatibility tests passed; runner exit 0. The first stable-updater attempt timed out after 300 seconds (underlying 124; wrapper 1). Tu then reopened Docker and explicitly made it available for use; the updater is not retried. Fresh Docker/Compose identity and the new Edge run are recorded separately. No Docker restart, repair, data cleanup or database stack was initiated by the agent.

Ship readiness: final pnpm ship:check exits 1 for uncommitted Git state only; all ten machine gates pass, including harness assurance and script fixture suites. The first attempt leaked a temporary GIT_INDEX_FILE into fixture repositories and failed; it is retained as a tooling failure, not a product result. The corrected run uses normal Git environment with exact candidate paths staged for verification and restores the real starting index afterward. The PowerShell wrapper was interrupted after pnpm printed its final exit-1 summary; explicit restoration and byte comparison confirm the original 93-path staged patch is intact. No GitHub acceptance workflow was dispatched.

## Quality, risk and gate assessment

| Item | Assessment |
|---|---|
| W00 | Existing permission/actor boundary preserved; scoped T0 controls pass |
| W01 | Approved delivery matrix passes at T0; broad classifier safety remains a release blocker |
| W02 | Evaluation arithmetic/provenance regression passes; no independent blind validation performed |
| W03 | Previous trace fix preserved; new error metadata is route/version only; no private-text trace fields added |
| G0 | Authorized scope, worktree, implementation ownership and existing dirty-state preservation verified |
| G1 | Source contracts/ownership controls verified at T0; target RLS, grants and transaction behavior unverified |
| G2 | Red/green delivery, compatibility, mobile state and negative controls pass |
| G3 | Tests/build/types pass; Edge passes; ship result below; baseline lint/authority and native evidence prevent release acceptance |
| G6 | Review packet provided; independent acceptance not performed; session-memory write awaits review |

H5 is still REPRODUCTION, independent_validation:false: only 11/29 emergencies detected and exactly routed, with 18 false negatives and one false alarm among 30 negatives. Canonical sealed hash 80e3e90701e4acc9418ed30209e251b613c84520c70f3f49ba73e2638052d81d and both classifier files are unchanged. The fallback improves access when detection fails; it does not improve or prove automatic detection. Classifier work and a genuinely independent blind set remain separate release decisions. No paid fallback is added.

Known limits: T0 fixtures cannot prove RLS/grants, durable replay, row locks, transaction atomicity or multi-actor concurrency. Existing partial emergency-write behavior remains. No hosted/Production mutation or live paid provider was used. No native simulator/device capture was available; browser or static tests are not substituted for RN visual proof.

## Design and native evidence handoff

Design decision: narrow Customer Kael component correction in A3/A4 communication/intake; source-mode=none because external pattern research adds no value to approved safety copy and existing design tokens. Reuse existing KaelButton, theme/spacing/typography and native Modal/SafeAreaView/ScrollView. Material is opaque/tinted; no new glass layer, animation or dependency. Reduced motion is satisfied by a nonanimated sheet; reduced transparency has no blur to remove. VI/EN and light/dark tokens are exercised by component tests. Human readability/brand fit still need native review; no aesthetic approval is claimed.

Native-only capture checklist, grouped into one pass per platform:

1. Customer Kael portrait on iOS and Android at a narrow phone width: open manual help with keyboard visible, scroll all sections and close. Risk: inaccessible control, keyboard/safe-area overlap, clipped long text. Example name: kael-safety__fallback__ios-current__narrow-portrait-keyboard__light__default__offline__vi.png.
2. On each platform, rotate to landscape and show the error-guidance panel plus composer. Risk: panel traps transcript/composer, or long electrical-water guidance cannot scroll. Example: kael-safety__delivery__android-current__narrow-landscape__dark__large__error__en.png.

Locale content, theme tokens, duplicate state, network independence and business outcome are covered in pillars; they do not need a separate screenshot permutation. Screen-reader focus behavior, actual text clipping/material rendering, keyboard and native navigation remain device checks. Captured: none. Diff verdict: not captured. Design verdict: ready-for-human-review, not approved.

## Integration, rollback and owner decisions

The latest main was fetched read-only. Modern HEAD merge-tree exits 1 with exactly .claude/MEMORY.md and docs/memory/2026-10.md conflicts. A temporary-index tree includes the uncommitted candidate; legacy tree simulation exits 0 but contains the same two conflict-marker regions. That exit code is not a clean merge verdict. The generated pillar registry merges textually; new P416/P417/P418 IDs are absent from main, and the earlier existing-ID comparison is preserved. Regenerate and validate the registry after approved integration. No commit, real index overwrite or merge was performed for simulation.

No final acceptance CI was triggered. The candidate is suitable for independent code review; merge/release readiness remains blocked by protected memory resolution, baseline red gates, independent safety decisions and missing native/T1 evidence. Preserve main's newer release/governance tooling during any future integration.

Rollback is a reviewed source operation only: first verify the exact candidate hashes, inspect delivery-only.patch.txt, then run git apply --reverse --check in an isolated checkout before any approved reverse apply. Do not reverse candidate-complete.patch.txt: it includes prior approved quality corrections. No database rollback is needed. Never reset/clean the shared dirty checkout.

Owner decisions still required: independent reviewer/acceptance; native capture and isolated T1/T2 verification; classifier improvement and independent blind validation; approval of the protected memory merge and session-memory draft; and any later commit/push, final CI, merge or deployment. [session-memory-draft.md](session-memory-draft.md) is review-only under docs/memory/INDEX.md's show-before-write rule. Actual protected memory files remain unchanged. Stop before KAWA_02 and six-service remediation.
