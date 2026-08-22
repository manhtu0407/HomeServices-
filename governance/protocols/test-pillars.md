# Kael Protocol — Test Pillars

Load for: writing or reviewing any test in this repository.

This file is the pattern catalogue. `protocols/tdd.md` says *what counts* as a test layer; this
one says *what a good test looks like here* and points at a working example of each shape.

## Why this exists

The suite was rebuilt after a campaign that deleted several hundred cases which could not fail
(`docs/test-debt-ledger.md`). Test count was never the problem. Two things were:

1. **Coverage did not follow risk.** `domains/payment/commission.ts` computes worker payout and
   had zero tests, while hundreds of source-text wiring cases guarded things `tsc` already caught.
2. **Failures did not teach.** A red assertion said `expected true to be false`, so an agent had to
   re-run with logging to learn anything, several times over.

The pillars answer both. Each one sits on a real, previously-uncovered risk, and each one fails
loudly enough to be diagnosed from a single run.

## The rule

**Every test file matching `*-pillar.test.ts` / `*-pillar-test.tsx` must export a `PILLAR`
manifest, and the pillar suite is the only suite the runners collect.** The remaining ~431 files
stay on disk, uncollected, as reference material. Do not re-enable them wholesale; port what you
need into a pillar shape instead.

`node scripts/harness/pillar-registry.mjs` enforces this and runs in CI.

## The diagnostic contract

### 1. The manifest

```ts
export const PILLAR = {
  id: 'P01-commission-math',
  invariant: 'worker net = gross - round(gross * rateBps / 10000); unsafe input yields null',
  authority: ['governance/RULES.md #8 (fallback yes, fake success no)'],
  target: 'supabase/functions/mobile-api/_shared/domains/payment/commission.ts',
  layer: 'unit',
  siblings: ['P03-direct-payment-availability', 'P10-per-actor-rls'],
  mutation: 'replace Math.round with Math.floor — the 0.5-boundary case turns red',
} as const satisfies PillarManifest
```

Every field is required and the registry rejects an empty one.

- **`invariant`** — the property in one sentence. Not "tests the commission function".
- **`authority`** — where the rule comes from. A test with no cited authority is an opinion.
- **`siblings`** — what to read next when this breaks. Dangling ids fail the registry, because a
  link an agent cannot follow is worse than none.
- **`mutation`** — the edit that proves this pillar can fail. It must have been observed red.

`layer` is one of `unit`, `integration`, `static-type`, `security-negative`, `ui-visual`, `sql`.

The `PillarManifest` type lives in three byte-identical copies, one per package, because jest
resolves only the root `@nestscout/shared` entry and test helpers do not belong in a barrel that
ships to the device. The registry holds the copies in sync, as `check-skills-sync.mjs` does for
skills.

### 2. The failure message

vitest takes a message as `expect`'s second argument; jest takes none, so mobile pillars wrap
instead. Both routes print the same banner.

```ts
// vitest
expect(estimateWorkerNet(1_000_000, tier), pillarWhy(PILLAR, 'gross=1_000_000 rateBps=1500')).toBe(850_000)

// jest
withPillarContext(PILLAR, () => {
  expect(onConfirm).not.toHaveBeenCalled()
}, 'busy=true must block a second confirmation')
```

For SQL the equivalent is the `raise exception` payload: name the invariant, the actor, and the
offending rows. Never a bare `'assertion failed'`.

### 3. Skip versus throw

A prerequisite that is **absent** is a loud skip. One that is **present but misconfigured** is a
throw. `pillarPrerequisite()` encodes this, generalising
`apps/api/src/__tests__/integration/integration-target.ts`. An agent must never read
"environment unavailable" as "code is fine".

## Choosing a shape

| If you are guarding… | Copy | Layer |
|---|---|---|
| arithmetic, thresholds, a policy range | `commission-math-pillar.test.ts` | unit |
| a bound, a timeout, a resource that must be released | `bounded-response-read-pillar.test.ts` | unit + security-negative |
| workflow code that talks to the database | `direct-payment-availability-pillar.test.ts` | integration |
| a payload crossing a trust boundary | `remote-snapshot-validation-pillar.test.ts` | security-negative |
| a generated artifact that must stay in step with the schema | `generated-view-parity-pillar.test.ts` | static-type |
| a money or confirmation gate in the UI | `payment-unlock-gate-pillar-test.tsx` | ui-visual |
| loading / empty / error / success on one surface | `worker-verification-states-pillar-test.tsx` | ui-visual |
| Reduce Motion, Reduce Transparency, accessibility state | `worker-dock-motion-pillar-test.tsx` | ui-visual |
| text that must never leak PII | `kael-pii-scrub-pillar.test.ts` | security-negative |
| RLS, grants, constraints, RPC atomicity | `staging_security_verification.sql` | sql |
| a config table every enum member must appear in | `kael-routing-conformance-pillar.test.ts` | static-type |
| a state machine, or any graph whose *paths* carry the rule | `workflow-transition-composition-pillar.test.ts` | unit |
| a write that must not be durable until its audit row exists | `autonomy-decision-durability-pillar.test.ts` | integration |
| a budget or kill switch that must stop work *before* it starts | `kael-chat-cost-cap-pillar.test.ts` | integration |
| input that must be scrubbed and framed before a model sees it | `kael-inbound-safety-pillar.test.ts` | security-negative |
| a committed corpus of hostile inputs | `adversarial-surface-matrix-pillar.test.ts` | security-negative |
| a generated artifact vs. the source it was generated from | `capability-registry-parity-pillar.test.ts` | static-type |
| ownership, tenancy, and what a refusal reveals | `job-access-ownership-pillar.test.ts` | security-negative |
| an RPC that must refuse a malformed payload | `kael_price_reasoning_receipt_verification.sql` | sql |
| a guard whose operands must come from the call, not from constants | `matching-guard-liveness-pillar.test.ts` | integration |

Techniques worth naming, each visible in the files above: boundary values either side of a
threshold; an independent oracle (a hand-computed figure or a committed fixture, never a value
recomputed by the implementation); absence assertions (`not.toHaveBeenCalled()` after really
invoking the code); exhaustive matrices; fail-closed on hostile input; and cross-field checks
where two fields of one payload must agree.

Four more arrived with P11-P20, and they are what "deeper" means here:

- **Derive the property; do not restate the table.** `workflow-transition-composition` probes the
  public validator across every event and status pair, then runs a breadth-first search over what
  it answered. The dormant `lifecycle.test.ts` listed 51 edges and would stay green if a shortcut
  to `paid` were added; the derived property would not.
- **Assert ordering, not just outcome.** A budget or kill switch that fires after a provider call
  has already spent the money. `scriptedProviderFetch(...).calls` makes "nothing was reached" an
  assertion instead of an assumption.
- **Use a second source of truth.** `capability-registry-parity` reads roles off the live route
  descriptors through `matchRoute`, never by re-running the generator whose output it is checking.
  A generated artifact compared against its own generator can only ever agree with itself.
- **Assert the throw, and the second row.** A guard that swallows its own failure is invisible to
  any test that only checks the happy path.

A fifth, found while fixing what P18 reported: **a guard whose operands are all constants is not a
guard.** Two call sites in `domains/matching/candidate.ts` called `validateWorkflowTransition` with
`event`, `from` and `to` all string literals, so the answer was fixed at compile time. They now pass
the status the RPC actually returned, and `matching-guard-liveness` fails if either reverts. The
same shape is worth looking for anywhere a validator is called with a literal it already knows.

## The pillars

<!-- @pillar-index:begin -->

Generated by `node scripts/harness/pillar-registry.mjs --write`. 44 pillars.

| id | layer | invariant | file | recorded mutation |
|---|---|---|---|---|
| `P01-commission-math` | unit | worker net = gross - round(gross * rateBps / 10000); any unsafe or out-of-policy input yields null instead of a fabricated rate | `apps/api/src/__tests__/unit/commission-math-pillar.test.ts` | replace Math.round with Math.floor in estimateWorkerNet — the 0.5-boundary case turns red |
| `P02-bounded-response-read` | security-negative | a provider response is read only up to maxBytes; an oversized body is refused and its stream cancelled, whatever the content-length header claims | `apps/api/src/__tests__/unit/bounded-response-read-pillar.test.ts` | delete the in-loop `if (totalBytes > maxBytes) throw` guard — the four streamed-bound cases turn red while the declared-oversize case stays green, since that one is caught by the content-length check instead |
| `P03-direct-payment-availability` | integration | the direct-payment projection is scoped by both job and customer, fails closed to null on any non-boolean answer, and never names the customer in its log | `apps/api/src/__tests__/kael-edge-runtime/domains/direct-payment-availability-pillar.test.ts` | weaken the guard from `typeof available !== "boolean"` to `available === undefined` — the non-boolean fail-closed cases turn red |
| `P04-remote-snapshot-validation` | security-negative | a server-supplied snapshot is trusted only when every field is in range, the service is one of the six, and the backend status agrees with the local status | `packages/shared/src/__tests__/remote-snapshot-validation-pillar.test.ts` | drop the `job.backendStatus === job.status` conjunct from isValidRemoteJobSnapshot — the disagreeing-status case turns red |
| `P05-generated-view-parity` | static-type | every view in the generated schema is named here with a column its consumers rely on, so a new, dropped, or renamed view cannot arrive unguarded | `apps/api/src/__tests__/schema/generated-view-parity-pillar.test.ts` | delete the worker_overview entry from VIEW_IDENTITY_COLUMN — type-check reports a missing property and the runtime count case turns red |
| `P06-payment-unlock-gate` | ui-visual | completion never advances without an explicit customer press, and while the server is handling one press neither decision can fire again | `apps/mobile/components/customer/__tests__/payment-unlock-gate-pillar-test.tsx` | remove `disabled={busy}` from the confirm KaelButton — the in-flight double-press case turns red |
| `P07-worker-verification-states` | ui-visual | a worker reads as ready for work only when every document check is recorded AND an admin has approved the profile; documents alone never unlock it | `apps/mobile/components/worker/__tests__/worker-verification-states-pillar-test.tsx` | drop the `Boolean(profile?.is_approved)` conjunct from the hero `ready` expression — the documents-complete-but-unapproved case turns red |
| `P08-worker-dock-motion` | ui-visual | the worker dock exposes four labelled tabs with exactly one selected, and neither Reduce Motion nor Reduce Transparency removes a tab or its selected state | `apps/mobile/components/worker/__tests__/worker-dock-motion-pillar-test.tsx` | drop `accessibilityState={{ selected }}` from WorkerV5DockTabButton — the single-selected-tab cases turn red |
| `P09-kael-pii-scrub` | security-negative | contact, identity, banking, and precise-address fragments are replaced before Kael text reaches a log, a model, or a user | `packages/shared/src/__tests__/kael-pii-scrub-pillar.test.ts` | remove the FLOOR_PATTERN replacement from scrubPiiText — the floor-fragment case turns red while every other placeholder stays green |
| `P09-native-ios-liquid-tabs` | ui-visual | Customer and Worker navigation keep the four primary routes together on the left and Kael as a sibling accessory on the right | `apps/mobile/app/__tests__/native-ios-liquid-tabs-pillar-test.tsx` | render NativeTabs.BottomAccessory or place Kael above the primary route cluster — the navigation geometry contract turns red |
| `P10-per-actor-rls` | sql | every actor reads and writes only what its role allows, and the matrix raises instead of merely recording when any check fails | `supabase/tests/staging_security_verification.sql` | flip one expected count in any `insert into security_results` row -- the verdict block names that check and the script exits nonzero |
| `P11-kael-routing-conformance` | static-type | every Kael purpose routes to a declared model within its latency, cost and token policy, and no call site may invent a model id | `apps/api/src/__tests__/unit/kael-routing-conformance-pillar.test.ts` | add a route with an undeclared model id such as gpt-4o, or raise a latencyBudgetMs above 20000 — the allowlist and the budget-ceiling cases turn red |
| `P12-workflow-transition-composition` | unit | a job status changes only where the event table and the status table agree, and no event moves a job into paid except the two payment events | `apps/api/src/__tests__/unit/workflow-transition-composition-pillar.test.ts` | add ["confirmed_by_customer", "reviewed"] to review_submitted — the unpaid-close case turns red; note that adding ["repairing", "paid"] there instead changes nothing, because the status table refuses it second |
| `P13-autonomy-decision-durability` | integration | an autonomy verdict is not durable until its audit row is written, an escalation also reaches the admin queue, a failed write raises instead of passing silently, and neither stored column carries contact details | `apps/api/src/__tests__/kael-edge-runtime/domains/autonomy-decision-durability-pillar.test.ts` | swallow the insert error in persistAutonomyRecord by returning instead of throwing — the two fail-closed cases turn red while every recorded-row case stays green. Separately, store input.gate.decision unscrubbed and both contact-detail cases turn red |
| `P14-kael-chat-cost-cap` | integration | a chat session that has reached the hard USD cap stops before the pipeline, reaches no provider, and says so instead of answering | `apps/api/src/__tests__/kael-edge-runtime/domains/kael-chat-cost-cap-pillar.test.ts` | change the guard to `currentCostUsd <= KAEL_CHAT_HARD_COST_CAP_USD` or raise the constant — the at-the-cap and no-provider-reached cases turn red |
| `P15-kael-inbound-safety` | security-negative | the kill switch halts Kael before any provider or database work and says so honestly in Vietnamese, and customer text is scrubbed and framed as untrusted before it can reach a model | `apps/api/src/__tests__/kael-edge-runtime/domains/kael-inbound-safety-pillar.test.ts` | rename the kill-switch code from AI_DISABLED, or drop the [email] replacement from scrubSensitiveForLLM — the halt cases and the email case turn red; note that removing the [phone] rule alone changes nothing, because the id-number rule redacts the same digits |
| `P16-ai-spend-envelope` | unit | a malformed spend cap falls back to the declared default rather than to zero or NaN, and a reservation is booked before the spend and released when it does not happen | `apps/api/src/__tests__/unit/ai-spend-envelope-pillar.test.ts` | drop the `parsed > 0` conjunct from positiveUsd — the zero and negative cap cases turn red, because a cap of 0 would compare false against every spend |
| `P17-adversarial-surface-matrix` | security-negative | every committed adversarial case is refused by the guard owning its surface, with the reason the corpus recorded, and only the truthful identity cases pass | `apps/api/src/__tests__/security/adversarial-surface-matrix-pillar.test.ts` | replace the first absolute_claim phrase in self-check FORBIDDEN_PHRASES — case self-003 turns red by name, where the dormant suite would have reported only a non-empty bypass array; note that disabling one boundary injection pattern changes nothing, since the semantic classifier still catches those |
| `P18-capability-registry-parity` | static-type | the audited capability policy for a route grants exactly the roles its descriptor declares plus the admin override, so the record that authorises a request is never wider than the route itself | `apps/api/src/__tests__/schema/capability-registry-parity-pillar.test.ts` | add "worker" to the roles of jobs.workerCandidateConfirm in platform/authz/capability-registry.ts — that route turns red by name, twice. Reverting the shorthand-roles fix in the generator no longer reaches this pillar: rolesForUndeclared refuses to build the registry at all |
| `P19-job-access-ownership` | security-negative | a job the caller does not own answers exactly as a job that does not exist, and a role the route forbids is refused before the database is read at all | `apps/api/src/__tests__/unit/job-access-ownership-pillar.test.ts` | change the cross-tenant customer branch from NOT_FOUND/404 to AUTH_FORBIDDEN/403 — the no-existence-leak cases turn red, because a 403 confirms the job exists |
| `P20-price-receipt-gate` | sql | a Kael quote cannot become a job unless both receipts are well formed and bound to it; dropping any required field, unbinding the receipt id, or restating a total that disagrees with the estimate all yield MISSING_REASONING_RECEIPT | `supabase/tests/kael_price_reasoning_receipt_verification.sql` | drop the coalesce around the receipt_id comparison in 20260814120000 -- `null <> 'x'` is null, the or chain stops firing, and a receipt with no receipt_id is accepted against any id. Nothing else catches that one: the price-evidence trigger on public.jobs does check schema_version, so dropping the coalesce there fails at the insert instead, but the trigger never looks at receipt_id. Deleting any other conjunct turns its own drop-one case red |
| `P21-matching-guard-liveness` | integration | the transition guard after a matching RPC checks the status the RPC actually returned, so a job the RPC left on an unexpected status is refused instead of being logged as a successful match | `apps/api/src/__tests__/kael-edge-runtime/domains/matching-guard-liveness-pillar.test.ts` | restore either guard to a literal `to:` — `to: "worker_matched"` on confirm or `to: "broadcasting"` on reject — and the mismatch case for that route turns green again, which is the whole defect |
| `P22-worker-jobs-workart-alpha` | ui-visual | Worker Jobs Workart has no baked white, mint, or checkerboard background for any supported service or the approval stage, while its visual shell stays transparent | `apps/mobile/components/worker/__tests__/worker-jobs-workart-alpha-pillar-test.tsx` | map a supported service back to a baked-background asset or restore a repeated Workart tile shell — the asset and shell assertions turn red |
| `P23-worker-jobs-empty-copy` | ui-visual | Worker Jobs empty opportunity copy stays readable beside the approved Prototype Workart without changing workflow affordances | `apps/mobile/components/worker/__tests__/worker-jobs-empty-copy-pillar-test.tsx` | replace the concise empty-state copy or regress the shared metadata text rhythm — the readability contract turns red |
| `P24-worker-earnings-period-palette` | ui-visual | Worker Earnings period selection uses the same mint selected-state palette as the active Income dock tab while preserving tab semantics | `apps/mobile/components/worker/__tests__/worker-earnings-period-palette-pillar-test.tsx` | restore the period selector to the generic service fill — the selected tab no longer shares the dock mint palette |
| `P25-customer-kael-chat-mascot` | ui-visual | Customer Kael chat surfaces use the shared accessible mascot asset with a static fallback when motion is reduced | `apps/mobile/components/customer/__tests__/kael-chat-mascot-pillar-test.tsx` | remove the shared mascot integration or its reduced-motion fallback — the customer chat mascot contract turns red |
| `P26-liquid-back-button-surface` | ui-visual | Shared liquid navigation controls preserve the accessible callback and their restrained vector surface layers | `apps/mobile/components/ui/__tests__/liquid-back-button-pillar-test.tsx` | remove the shared vector layers or callback wiring from the liquid back/send controls — the navigation surface contract turns red |
| `P27-theme-token-resolution` | ui-visual | customerTheme.darkLayer exposes exactly the light layer key set and resolves every surface token to its own value, so no dark-mode surface silently falls back to a light-mode literal | `apps/mobile/design/__tests__/theme-token-resolution-pillar-test.tsx` | copy any lightLayer surface value into darkLayer (for example set darkLayer.canvas to signature.bg) — dark mode then renders a light surface and this pillar goes red |
| `P28-text-scale-reflow` | ui-visual | scaledTypography grows line height with font size at every supported Dynamic Type step, so large text reflows instead of clipping | `apps/mobile/design/__tests__/text-scale-reflow-pillar-test.tsx` | stop scaling line height in scaledTypography (return base.lineHeight unscaled) — at 200% the glyphs outgrow the line box and this pillar goes red |
| `P29-harness-metadata-allowlist` | security-negative | the provenance allowlist admits only one-way digests, opaque version labels, and finite counts; it never relaxes the value constraints, and every key outside it still answers to the PII denylist | `apps/api/src/__tests__/harness/harness-metadata-allowlist-pillar.test.ts` | delete the `!HARNESS_METADATA_ALLOWLIST.has(normalized) &&` conjunct in sanitizeHarnessMetadata — five cases turn red here and nothing else in the suite moves, because every allowlisted digest and count key matches `prompt` or `token` in the denylist. Neutralising the whole condition to `false &&` instead is the wrong mutation: that short-circuits the denylist as well, so PII crosses and the pre-existing harness-trace cases fail instead of this pillar |
| `P30-kael-prompt-assembly` | unit | the assembled Kael system prompt is exactly its declared sections joined by the separator, in a fixed order, with the register section present only when a hint was supplied — so a prompt digest taken over those sections identifies the string the model actually received | `apps/api/src/__tests__/unit/kael-prompt-assembly-pillar.test.ts` | delete the `{ id: "mission", text: MISSION }` entry from the sections array in buildKaelSystemPromptParts — the committed-headers case and both ordered-id cases turn red, and nothing else in the prompt suite moves. That last part is the point: the four pre-existing prompt-content tests all stay green with a whole section missing from every request, which is the gap this pillar closes |
| `P31-kael-prompt-fingerprint` | security-negative | the prompt fingerprint changes exactly when the prompt changes and names which section moved, while carrying no prompt text of its own — and every field it emits survives the harness metadata allowlist unaltered | `apps/api/src/__tests__/unit/kael-prompt-fingerprint-pillar.test.ts` | digest `section.id` instead of `section.text` in computeKaelPromptFingerprint — exactly one case turns red, the isolation case, because the tone digest then stops moving when the purpose does. Emitting `section.text` in place of its digest turns three red instead: the width case, the no-text-crosses case, and the allowlist round-trip, since the raw summary breaks the sanitizer value charset. Both were observed |
| `P32-kael-request-provenance` | security-negative | provenance for a model call is derived from the request the seam is about to send, not from what a caller remembered to pass, so every purpose carries it; it is digests and counts only, and the whole record survives the harness metadata allowlist | `apps/api/src/__tests__/unit/kael-request-provenance-pillar.test.ts` | digest only `request.messages[0]` instead of every message — the two-messages-differ case turns red, because a request whose user turn changed then reports the same prompt_digest as the one before it. Reading `charter_version` from a mutable field instead of the module constant turns the charter case red instead |
| `P33-worker-jobs-zip-prototype` | ui-visual | the approved eleven-stage Jobs surface remains the single visual source for Prototype and Production, with workflow transitions and route data kept intact | `apps/mobile/components/worker/__tests__/worker-jobs-zip-prototype-pillar-test.tsx` | route Production through the retired Jobs surface or change the eleven-stage screen mapping — the source and workflow assertions turn red |
| `P34-admin-finance-bank-reference` | security-negative | a raw bank transaction reference never reaches the reconciliation RPC — only a SHA-256 of the trimmed value and at most its last sixteen characters cross, and a cash decision sends neither | `apps/api/src/__tests__/unit/admin-finance-bank-reference-pillar.test.ts` | pass `input.bank_reference` straight through as `p_bank_reference_hash` — two cases turn red, the hash-is-not-the-value one and the trimming one, since an untrimmed raw value no longer agrees with its trimmed twin. The suffix is computed separately and stays green, so truncating `normalized.slice(-16)` to eight is the second recorded mutation: it fails only the sixteen-character case. Both were observed; neither alone reaches the other half |
| `P35-worker-earnings-fail-closed` | unit | a worker sees earnings only from an aggregate that names them; a row belonging to someone else, a failed query, or any value outside the declared range fails the request closed rather than answering with a number nobody computed | `apps/api/src/__tests__/unit/worker-earnings-fail-closed-pillar.test.ts` | weaken the owner check from `row.worker_id !== expectedWorkerId` to `row.worker_id === undefined` — the cross-worker case and the log case turn red, and nothing else moves, because every remaining case fails closed on its own validator. The second recorded mutation reaches the other half: make `nonnegativeSafeInteger` return 0 instead of throwing, and the three coercion cases turn red while the owner case stays green. Both were observed |
| `P36-worker-route-unit-protection` | security-negative | a worker route preview answers with building-level coordinates only — the unit, floor, and building name are read from the job row to authorise the trip and never travel back in the response, and a job still at area-only release is refused outright | `apps/api/src/__tests__/kael-edge-runtime/domains/worker-route-unit-protection-pillar.test.ts` | return `{ ...result.data, latitude, longitude }` from workerRouteDestination instead of the two coordinates — the no-sentinel case names the unit it leaked and the destination-shape case names the extra keys. Dropping the `release_stage === "area_only"` guard turns only the area-only case red, which is why it is separate |
| `P37-ios-release-readiness` | security-negative | the store-bound iOS release uses one Build 44 identity and aligned metadata, purpose strings, audio posture, and push-entitlement runtime gate | `apps/mobile/config/__tests__/ios-release-readiness-pillar-test.tsx` | set ios.buildNumber back to 43 or let iOS push setup continue when iosPushNotificationsEnabled is false — the release identity or no-permission-call case turns red |
| `P38-public-privacy-policy-link` | ui-visual | registration and profile can render a localized, screen-reader-labelled link to the exact public NestScout privacy policy | `apps/mobile/components/ui/__tests__/public-privacy-policy-link-pillar-test.tsx` | remove accessibilityRole="link" or replace the public URL — the role/name or exact-open assertion turns red |
| `P39-apple-permission-behavior` | security-negative | user-initiated media and route features respect a denial through a shared granted/limited/denied/blocked state machine, and Settings is offered only on an explicit retry after Camera is blocked | `apps/mobile/components/__tests__/apple-permission-behavior-pillar-test.tsx` | request Camera without reading canAskAgain, offer Settings on the first denial, auto-open Settings, or restore an explicit Photo Library request — the permission-state cases turn red |
| `P40-role-aware-account-deletion` | security-negative | customer and worker self-deletion share one authenticated idempotent boundary, preserve unresolved work and settlement blockers, and fail closed until every owned private storage object is removed | `apps/api/src/__tests__/unit/account-deletion-pillar.test.ts` | remove worker from the route roles, skip one storage bucket, or finalize after a storage removal error — the role, storage, or fail-closed case turns red |
| `P41-worker-account-deletion-ui` | ui-visual | customer and worker can start account deletion in-app only after both confirmation gates, and a stale session offers an explicit sign-in-again action without deleting data | `apps/mobile/components/worker/__tests__/worker-account-deletion-pillar-test.tsx` | remove either confirmation gate or the explicit reauthentication action — the disabled-state, API, or stale-session cases turn red |
| `P42-auth-session-shell` | integration | a known same-account role keeps the routed shell mounted during auth refresh, while an account change blocks until its own role resolves | `apps/mobile/lib/__tests__/auth-loading-gate-pillar-test.tsx` | set loading=true during a same-account lookup — the pending refresh case blocks; dedupe by user id alone — the returning-account case skips its fresh lookup |
| `P43-staging-service-catalog` | integration | the configured Supabase integration target exposes exactly the six active NestScout service types declared by the shared contract | `apps/api/src/__tests__/integration/staging-service-catalog-pillar.test.ts` | filter the catalog query to the unsupported `appliance` service — PostgreSQL rejects the enum value and the query assertion turns red |

<!-- @pillar-index:end -->

## How the pillars run

| Runner | Collection |
|---|---|
| `apps/api` vitest | `include: ['src/__tests__/**/*-pillar.test.ts']` |
| `packages/shared` vitest | the pillar glob plus `kael-multi-turn-eval.test.ts`, which the Kael eval harness drives |
| `apps/mobile` jest | `testMatch: ['<rootDir>/**/*-pillar-test.tsx']` |
| SQL | every `supabase/tests/*.sql`, via `run-sql-tests.ps1` in the `database-controls` CI job |

The mobile `testMatch` list must stay non-empty: jest installs the match filter only when
`config.testMatch.length` is truthy, so an empty array removes the filter and every file under
`rootDir` starts to look like a suite.

`turbo test` and the per-workspace `pnpm … test` steps reach the pillars with no workflow edit.
The CI steps that name explicit paths still point at the dormant tree and find nothing there.

### Shared fakes

Two helpers in `apps/api/src/__tests__/kael-edge-runtime/harness/`, both exported from its barrel,
exist so a Kael test is a few lines rather than a hundred:

- `scriptedProviderFetch({ anthropic, deepseek, perplexity })` — the only seam between Kael and a
  model is `globalThis.fetch`. It dispatches on hostname, wraps each reply in that provider's
  envelope, throws on an unmodelled URL, and records `calls`, which is what lets a pillar assert
  that **no** provider was reached. Disambiguate a stage by reading `max_tokens` off the body.
- `makeLedgerClient(capUsd)` — a stateful spend ledger. `makeSequenceClient` cannot be used for
  spend: it short-circuits `reserve_kael_ai_spend` to an allowed reservation and does not record the
  call, so the assertion surface is invisible.

### What P18 found, and why the generator now fails closed

P18 was written red. It reported 12 routes whose audited capability roles were wider than their
descriptors declared — including `jobs.workerCandidateConfirm` / `…Reject`, the RULES #7
proposed-worker gate marked `risk: money`, which the registry recorded as worker-confirmable.

The cause was in `scripts/harness/capability-registry.mjs`. It regex-scrapes the route files, and it
could not read two forms: an ES6 shorthand `roles` (the eight `kael.chat.*` session routes) and a
computed `kind:` ternary (the candidate confirm/reject pair). When the scrape came back empty it
substituted `defaultRoles()` — every role. Its own "protected route without roles" guard could never
fire, because `admin` was appended unconditionally first, and CI's drift check regenerates with the
same scraper, so drift was 0 by construction. Three defects compounding: two parse gaps and a
fail-open default that hid them.

All three are fixed. `declaredKinds()` reads the whole `kind:` expression and takes the branches a
ternary can produce; `shorthandRoleBinding()` resolves shorthand through the file's alias map; and
`rolesForUndeclared()` now **throws** rather than widening — a route whose roles cannot be read fails
the build. Two routes are exempt by name in `ROUTES_WITHOUT_DECLARED_ROLES` (`jobs.get`, `services`),
because both declare `roles?:` and emit none on purpose; anything else that lands there is a bug.

Two notes for whoever touches this next:

- **The registry grants `admin` on every protected route, and that is accurate.**
  `platform/auth.ts:141-143` lets an admin past any `allowedRoles` list, so the override is real
  enforcement, not a generated guess. P18 derives its expectation as `declared ∪ {admin}` rather than
  relaxing to a superset check, so any *other* extra role is still red.
- **The pillar reads descriptors through `matchRoute`, never the generator.** Re-running the
  generator to check the generator's own output can only ever agree. That is why this pillar caught
  what the drift check structurally could not.

## Adding a pillar

1. Pick a risk that is real and currently unguarded. Check the index above first.
2. Write the manifest before the assertions. If you cannot state the invariant in one sentence,
   the test is not ready.
3. Write the failing case first and watch it fail for the stated reason.
4. Record the mutation, apply it, and **watch the pillar go red**. Revert. A pillar whose recorded
   mutation leaves it green is not finished.
5. Run `node scripts/harness/pillar-registry.mjs --write` to refresh the index above.

## The money and privilege invariants (written, not yet executed)

The `docs/test-debt-ledger.md` §1–§2 gaps now have scripts, all modelled on pillar 10. Every
constraint they assert **already existed** in a migration; what was missing was anything that ran
it, so a later migration could have dropped one unnoticed. None of these required a production
diff — they are additive scripts only.

| Script | Covers |
|---|---|
| `supabase/tests/worker_payment_ledger_verification.sql` | `gross_amount = platform_fee + worker_net`; `commission_rate_bps` within `[0, 1500]`; tier monotonicity; financial-field immutability; write grants locked |
| `supabase/tests/sepay_vietqr_webhook_verification.sql` | first delivery pays once; replay returns `duplicate` and writes no second event; one transaction id cannot settle two jobs; underpayment parks the job; execute limited to `service_role` |
| `supabase/tests/signup_role_guard_verification.sql` | signup metadata claiming `admin` or `worker` still lands as `customer`; the profile row is still created; `public.handle_new_user()` stays dropped; direct execute revoked |
| `supabase/tests/kael_price_reasoning_receipt_verification.sql` | pillar P20 — a quote cannot be confirmed without a well-formed `analysis_receipt.v1`: each required field, the pinned schema version, field types, the closed `analysis_status` set, and the closed `price_source` set |

**Status: unverified.** They were written against the migration source and have never been executed.
The `database-controls` CI job replays every migration from empty and then runs
`docker/scripts/run-sql-tests.ps1`, so the first real verdict comes from CI. Treat a green JS gate
as saying nothing about them until that job has run.

The agent environment cannot close this gap on its own, and it is worth recording why so nobody
spends the time again: a Docker daemon **can** be started here, and `psql` and the Supabase CLI are
both obtainable, but the image layers themselves are unreachable — pulls of `supabase/postgres` and
friends return `403 Forbidden` from the CDN behind the proxy. The blocker is registry egress, not
tooling.

Still open after these: the cash-commission settlement path
(`docs/test-debt-ledger.md` §1, `worker-cash-commission-settlement`) and the media-retention
leasing invariants (§2b).
