# Customer Kael Respond — implementation and verification

Date: 2026-10-18. **Local Customer Chat verification PASS for the exercised flows. Native/device and Production code behavior UNVERIFIED.** No commit, push, PR or code deployment.

## Source, authorization and runtime

- Baseline `main` verified at execution: `e8b95d2122a8ce802c5504630a778f6e51daa72f`; existing Plan §61 work was already integrated.
- Uncommitted branch `codex/kael-respond-customer-20261018`, isolated managed worktree `C:/Users/Phan Manh Tu/.codex/worktrees/kael-respond-customer/home-services`. The dirty primary `codex/stage1` checkout was preserved.
- Customer normal chat only. Public API, DB schema, migrations, provider models, transaction confirmation and cost limits unchanged. No Worker file changed. Shared normal-image prompt now states its existing output contract; Worker compatibility is covered by existing suites.
- Real local Supabase Auth → `mobile-api` → Postgres/Storage → providers. Test account authenticated through local Auth, no synthetic audit role. Browser: Codex in-app browser, `http://localhost:8085/kael-chat?mode=normal`, viewport 358 × 715.
- Owned stack `nestscout-kael-respond-20261018`, gateway 57321, DB 57322. The existing stacks on 55321 and 56321 were preserved; no shared DB reset.
- Docker 29.8.2 / Compose v5.6.0 version ensure passed on this invocation. Resume used one bounded daemon probe and one start. No Desktop restart, RAM reclamation, broad cleanup or volume deletion. Low available RAM was informational.

## Observed before / after

| Case | Observed defect / red signal | Result after fix |
|---|---|---|
| All shipped Customer VI/EN starter drafts | 7/8 routed incorrectly or inferred a repair category | All 8 exercise the real response path in collected tests; 3 original VI starters also succeed with real AI |
| Capability / photo / description paraphrases | 5/6 initially clarified instead of answering the help question | Existing `normal_chat_response` answers without a new classifier call |
| Ordinary `rõ`, `với`, `đến`; camera for attaching photos | Broad accent-stripped keywords selected plumbing/electrical or rejected camera | Narrow fixture phrases; photo control distinguished from camera installation |
| Same-session follow-up / correction | Refused, or negated service dominated | Customer context used; latest correction replaces the earlier subject |
| Photo follow-up after earlier starter help | Live “Cái đó thì sao?” asked generic app clarification; a short fixture missed this | Full live transcript reproduced a red test; validated recent image now takes priority at its source turn |
| Fresh session / topic change / assistant introduction | Could inherit an unsupported or invented subject | Asks for the missing context; no previous-session image/service reused |
| Unsafe / unrelated / injected instructions | Safety-device bypass reached provider in original baseline | Current safety request overrides old context; injection stays quoted evidence; relevant negative tests pass |
| Small photo in real Storage | `Range: bytes=0-262143` timed out for a 34,344-byte object; normal GET and 1 KB range succeeded | Customer HEAD obtains server size, then bounded range ends at EOF; original privacy scan retained; Worker default unchanged |
| Vision structured output | Prompt referred to an unspecified schema; later response could exhaust 300 tokens before closing JSON | Exact existing JSON fields and concise output budget supplied; 300-token/model/cost caps unchanged |
| Fresh web chat rows | 3 text cells had height 0; Reanimated entering left absolute nodes and overlaid the reasoning card | Plain flow wrapper on web; existing native entrance retained; 0 zero-height text cells / 0 overlapping pairs in live checks |
| Provider failure / timeout / rate limit | Actual KEY_MISSING, media errors and HTTP 429 observed | Honest failure state; composer text/attachment retained for retry; no fabricated success |

Understanding remains under the existing Edge assistant owner. The new turn-context helper reads at most 20 recent turns, uses Customer statements, and accepts only schema-checked same-session image memory. Memory and image findings are quoted untrusted user data. App-help replies discard invented service intents/actions. The reply policy marker is `2026-10-18.v1`.

## Automated verification actually executed

| Command / check | Final result |
|---|---|
| `corepack pnpm test:api` | PASS: 177 Vitest suites / 2,239 tests; 1 suite/test skipped. Node contracts: 114 passed / 1 skipped, 0 failed |
| `corepack pnpm type-check:api` | PASS |
| `corepack pnpm type-check:mobile` | PASS |
| `corepack pnpm test:mobile` | PASS: 281 suites / 2,601 tests; existing React `act` warnings present |
| Focused fresh-row Jest regression via `--runTestsByPath` | Observed red 1 fail / 2 pass, then green 3/3; native iOS/Android still request their entrance |
| Focused Customer/image/privacy Vitest regressions | Observed real red signals, then green 79/79 before final full API pass |
| `corepack pnpm doctor:react:changed` | Exit 0; scanned changed React file, 0 issues; score unavailable |
| `corepack pnpm edge:check` | PASS: discovered 7, selected 7, checked 7, failed 0; request-compatibility checks passed |
| `node scripts/check-edge-db-contract.mjs --emit-sql`; actual `psql` query; `--functions ...` | PASS: 265/265 RPC names present; 227 literal + 38 resolved, residue 0 |
| Local migration catalog | 453 canonical migrations applied from 463-entry inventory |
| `lint:structure`, `lint:baseline`, `lint:comments --working` | PASS after product changes; final documentation checks recorded below |
| Pillar registry | 386 unique pillars including new P391; registry validates actual collected file names |
| `git diff --check` | PASS after product changes; final closeout below |

The first attempted narrow Jest command used a Jest-30-style flag with Jest 29 and collected the broader suite. It was stopped and rerun with `--runTestsByPath` to observe the intended red signal. The separate required full mobile command later completed successfully. Initial RPC CLI output needed conversion from plain lines to JSON; the corrected inventory comparison actually ran and passed. Neither failed attempt is counted as a passing check.

## Real-model and visible Preview evidence

Real providers: text `deepseek-v4-pro` through `normal_chat_response`; image `claude-sonnet-5-5` through `normal_chat_vision`, then DeepSeek writes the visible answer. Provider traces were queried from the real local `harness_events`; successful HTTP alone was not the quality criterion.

| Scenario | Real repetitions / observation | Assessment |
|---|---|---|
| Original capability question | Original UI sequence + rounds 2/3 API; rounds 2/3 3,802 / 3,338 ms | Describes supported help and six services; no false refusal |
| Photo intent without attachment | Original UI sequence + rounds 2/3 API; 2,930 / 2,885 ms | Explains attaching a photo; no invented visual findings |
| Description help | Original UI + rounds 2/3 API; 3,445 / 5,051 ms | Useful description details and a specific question; no false plumbing route |
| HVAC → follow-up → correction to plumbing | Rounds 2/3 real API; inverse plumbing → HVAC correction also performed in UI | Uses corrected subject; no old-photo answer after explicit correction |
| Actual faucet photo, final concise prompt | UI ~10 s; two additional full Auth/Edge/Storage API turns 10,222 / 5,574 ms | All 3 describe visible drop/faucet/calcification and state unknown cause/condition; all schema validated |
| Follow-up about that photo, final context fix | UI 6.1 s; two further real API follow-ups 12,866 / 3,901 ms | All 3 refer to the actual faucet/drop; UI asks which aspect is meant |
| Reload / switch session / return | Actual browser reload restores text and photo; fresh “Cái đó thì sao?” asks context, ~0.3 s | No cross-session topic inheritance; deterministic clarification, no provider |
| Safety request after follow-up | Actual UI “Hướng dẫn tôi đấu tắt aptomat” refused, ~0.1 s | Deterministic safe boundary, no provider |
| Error / retry | Initial missing-key failures, real media failures and one rate-limit HTTP 429 | Preserved entered text; retained attachment for retry. Rate bucket was not reset or weakened |

The third description repetition first hit the existing 10-token / one-token-per-minute session bucket (HTTP 429). After refill it completed with the same test account. No alternate actor or limit bypass was used. Diagnostic Anthropic text probes established key validity only; they are not counted as image or Preview passes.

Some early attempts failed during runtime/configuration changes and are excluded from final successful repetitions. The real photo sequence exposed and drove the Storage-range, missing-schema, output-truncation and image-context regressions above. No model/provider response mock substituted for these runs.

Quality limits: one plumbing follow-up repeated much of its preceding advice; one photo follow-up proposed possible internal causes while also stating uncertainty. Some visible sentence/list segmentation remains awkward in the existing reply renderer. The existing new-chat empty illustration also displays “You've got this!” in VI mode. These are recorded quality/copy debt, not a native or Production approval.

### UI evidence

- [Original starter sequence with real AI](assets/2026-10-18-kael-respond/real-original-sequence.jpg)
- [Actual photo after layout fix](assets/2026-10-18-kael-respond/real-photo-after-layout-fix.jpg)
- [Follow-up about photo](assets/2026-10-18-kael-respond/real-photo-followup.jpg)
- [Correction after layout fix](assets/2026-10-18-kael-respond/real-correction-after-layout-fix.jpg)
- [History after reload](assets/2026-10-18-kael-respond/real-history-after-reload.jpg)
- [Fresh session](assets/2026-10-18-kael-respond/fresh-session-after-fix.jpg)
- [Safety boundary after layout fix](assets/2026-10-18-kael-respond/safety-after-layout-fix.jpg)

Screenshots contain only the synthetic test conversation and a public fixture, without login credentials, provider keys or contact details. Photo fixture: [Dripping faucet 1.jpg](https://commons.wikimedia.org/wiki/File:Dripping_faucet_1.jpg), Dschwen, [CC BY-SA 2.5](https://creativecommons.org/licenses/by-sa/2.5/); downscaled public test image, not a Customer job.

Visual checks covered idle, pending, partial/final answer, image attachment, error/retry, reasoning receipt, reload and session switch on Expo web. Live nonempty row measurements after the fix found 0 height-zero cells, 0 overlapping adjacent pairs, minimum gap about 8 px. Native entrance preserved by RNTL boundary tests; native pixels, dark mode, device font scaling and accessibility settings were not visually exercised. Source mode: none; no redesign, token/material changes or external design adapter.

### Runtime adapter and identity qualification

The pinned local CLI injects `SUPABASE_URL=http://kong:8000`, which the tracked target guard classifies as remote. The disposable copy of `supabase/functions` therefore has a declared bootstrap-only adapter:

1. Resolve environment as local using `host.docker.internal:57321`, then use the CLI's actual internal Kong URL for real server-side Auth/DB/Storage clients and vision trust.
2. Rewrite only outbound JSON Storage URL origins from internal Kong to the same public `127.0.0.1:57321` gateway. This fixed the history thumbnail after reload. Stream responses are passed through.

All handlers, authorization, image guards, assistant source and providers are real; no auth/provider/storage mock was installed. The tracked Production target guard and Production launcher remain unchanged. The final source-copy comparison must differ only at this declared bootstrap. The branch marker identifies the base plus uncommitted work, not a registered release; local runtime is `unreleased`. This does not prove a deployed release matches Production.

## Credential operation authorized separately by Tu

Tu explicitly authorized replacing the two existing Backend keys, requested no memory, and requested removal of `provider.env` after use.

- Registered Production project verified: `iwevizmsedyqozxlawwl`.
- Exactly `ANTHROPIC_API_KEY` and `DEEPSEEK_API_KEY` updated once with Supabase CLI `secrets set --project-ref ... --env-file <server-only file>`. No key value in CLI arguments, source, public environment or this report.
- Subsequent read-only Secrets metadata matched SHA-256 computed in process for both supplied values. Only boolean match results retained. CLI metadata exposes the digest as `value`; an initial checker assumed `digest` and was corrected before read-only verification. No second Secrets mutation was needed.
- Both providers called successfully locally through the centralized provider boundary. Hosted Production AI behavior was not exercised; digest match is configuration evidence, not a Production smoke test.
- No code deployment, other Secrets change or Production DB write.
- No canonical or external memory entry written; the earlier proposed memory draft was removed at Tu's request.

## Final review and closeout

Fixed point: uncommitted diff against `e8b95d2122a8ce802c5504630a778f6e51daa72f`, including untracked source/tests/docs. Spec source: the approved Customer Respond plan and Tu's later UI/key instructions.

- Spec compliance: original starter sequence, real photos, contextual follow-ups/corrections, reload, session isolation and safety exercised successfully in local Preview; model quality debt stated above.
- Rules/standards: centralized AI, same-session input, schema validation, bounded reads, privacy scan, rate/cost limits and confirmation gates retained. No public contract/schema change, no Git publication or code deploy.
- Maintainability: existing assistant/domain/prompt owners retained; one bounded context helper, web-specific row adapter and Customer-only Storage range option. No baseline weakening or duplicate contract.
- Scope deviation justified by actual failures: the image pipeline and fresh-row fixes were necessary for the approved real Preview/photo/UI checks. No Worker source file was edited.
- Native/device and Production code behavior remain UNVERIFIED; this is not a release or Production-ready verdict.

The executed closeout and subsequent user steering are recorded below.
### Executed final closeout

- Exact-value leak scan: **5,423 files / 141,180,084 bytes**, task scratch/cache and owned Edge logs; served Expo bundle **18,315,405 bytes**. **0 exact matches** outside the explicitly allowed temporary provider file. No claim about unrelated machine-wide data or third-party infrastructure.
- Both watched canonical memory files retained their original SHA-256. No session memory was written.
- Final runtime source comparison: **557 files**, only the declared disposable `mobile-api/index.ts` bootstrap differs from tracked source. No hidden assistant/handler/mock changes.
- `provider.env` unlinked at its exact authorized path and absence verified. Owned Edge/Expo stopped, then scoped `supabase stop --workdir .scratch/kael-respond-stack` exited **0**. No owned containers remained; both pre-existing Kong stacks were still healthy. Default backup volumes retained. Thus no running task container retains the temporary provider environment.
- Native/device, dark-mode/accessibility visual matrix, Production smoke, store build and deployment remain outside the verified result. To resume local AI later, provide a fresh server-only file; this session deliberately leaves none.

### Latest user steering — remove unrequested service-start control

Tu explicitly requested removal of the “Bắt đầu xử lý: Điều hòa” control shown in the new screenshot. The Customer normal-chat content no longer builds any `start_case` chip or routes that chip to booking. Its unused service-route mapping and extraction helper were deleted. Ordinary follow-up suggestions and the actual booking entry points remain in place; no server/public contract changed.

P370 now exercises the real Customer content wiring with saved VI/EN service actions: observed **2 failing cases**, then **2 passing cases** after removal; suggestions still invoke only the message action. Full mobile gate rerun: **281 suites / 2,601 tests PASS**, 286.904 s; mobile type check PASS. React Doctor scanned 3 changed React files, 0 issues, score unavailable.

The owned local stack and public-only Expo launcher were resumed solely to inspect the existing saved conversation. Both provider-key environment names were verified absent from this new Edge container; `provider.env` remains absent. No real-model call is claimed for this UI-only continuation. Its first cold history read timed out; after the normal functions server was ready, the actual history GET succeeded (262 ms) and the 18-turn conversation rendered.

Visible final evidence: **0 service-start controls**, help starters and composer visible; **18 nonempty text cells, 0 zero-height cells, 0 overlapping pairs**. [Screenshot after removing the control](assets/2026-10-18-kael-respond/service-start-chip-removed.jpg). The earlier screenshots retain the old control as historical before-removal evidence.

Current local handoff state: the new Preview tab is open for UI/history review on 8085, using only the owned 57321 stack, **without local provider keys**. Earlier real-AI evidence remains valid for the unchanged backend code. Production Secrets retain the separately authorized new values; Production code was not deployed. The original checkout remains on `codex/stage1`; no memory write or Git publication.
Final reconciliation: lint:workplan PASS (6 closed slices, 34 changed files); lint:comments --working PASS; pillar registry PASS (386 unique pillars); structure/baseline PASS; git diff --check PASS. Native visual evidence remains UNVERIFIED.
