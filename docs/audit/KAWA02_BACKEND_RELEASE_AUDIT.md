# KAWA02 Backend Release Audit

Classification: **DRIFT_DETECTED**. PR #405 and PR #406 fixes are **NOT_RELEASED** in the inspected managed Edge source and database. No Production release was performed by this session.

Observed 2026-10-23, Asia/Ho_Chi_Minh (UTC+07); evidence collection began around 07:28 and continued after 07:41. Report assembled at 2026-10-23T00:45:37.558604+00:00 UTC. This is a point-in-time audit, not a monitor.

## Identity and method

- Repository: `manhtu0407/HomeServices-`.
- Fetched remote `main`: `4ee3a732d5ddd724d5055465664f8d5c1b0af0ce`.
- PR #405 merged `2026-10-22T10:46:18Z`, merge `7e59b91085825a11168b2b2e1c68225a2dcc17f0`, head `8e859073ca1412f4a18fa6d3517a3e8fe3578b1f`.
- PR #406 merged `2026-10-23T00:18:21Z`, merge `4ee3a732d5ddd724d5055465664f8d5c1b0af0ce`, head `245c6de6538ee524fe2d348952ef1a8fa9f10ded`.
- Supabase target independently enumerated: HomeServices, `iwevizmsedyqozxlawwl`, ACTIVE_HEALTHY. Every hosted SQL query was SELECT-only and read metadata, migration history or release receipts; no customer/payment row was read.
- Supabase connector supplied live function metadata, the downloaded mobile-api source bundle, SQL catalog and release records. Raw source was used in memory to build a SHA-256 manifest; only file hashes, not source bundles or secrets, are in the evidence packet.
- Source comparison normalized CRLF to LF only. SHA-256 implementation checked against the standard `abc` test vector; local source digests used Python hashlib independently.

## Registered release and runtime

| Evidence | Observed value |
| --- | --- |
| Active release | `harness-e8b95d2122a8-53817ce22f48` |
| Registered immutable Git SHA | `e8b95d2122a8ce802c5504630a778f6e51daa72f` |
| Release-control revision | `51` |
| Last control update | `2026-10-15T13:31:09.31389Z` |
| Previous active release | `harness-6b31e0491374-d473fa5ec184` |
| Candidate release/cohort/packet/start | all NULL |
| Latest release-control event | promoted, revision 51, `2026-10-15T13:31:09.306144Z` |
| Latest registered artifact (not active) | `harness-111988b0ad6e-dd735271c78f`, SHA `111988b0ad6ec276082f6a4706866401fc887e4b`, created October 20 |
| Registered releases for #405/#406 merge SHAs | zero |

| Function | ACTIVE version | Active release attests | Current deployment identity registered? | Bundle comparison |
| --- | --- | --- | --- | --- |
| mobile-api | 361 | 355 | no attestation for version 361 in the latest source-attestation history | current and attested SHA-256 identical |
| kael-matching-maintainer | 145 | 139 | no attestation for version 145 in the latest source-attestation history | current and attested SHA-256 identical |

Managed mobile bundle SHA-256: `15d383676fa3106c04b2cebfcd62ef2eaa42ebe93aed8da5b2e6e8b6f30a958f`.
Matching maintainer bundle SHA-256: `b9b4a83ec91b0a13b93ad9847c841c2e56705e192c9fd6450d84cc989b02a5ce`.
Attested source-directory SHA-256: mobile-api `ab78e291f6e85562aa5cedef6f6ba80ed98cf4b684abf869cecde3e023637ab9`; matching `644d37cff78c16e50567d46ebb6bcdf84a52122d5c0fb501bb975031003b3a26`.

Other functions: kael-learning-monitor 83, sepay-webhook 83, kael-media-retention 81, payment-maintainer 78, map-proxy-spike 78, system-monitor 7 (all ACTIVE). They are not silently included in the managed pair's rollback/attestation contract.

This is deployment-identity/attestation drift with matching bundle contents, not evidence of a content change inferred from version increments. Runtime environment bindings/secrets were not exposed or compared. Exact current runtime Git identity cannot be asserted solely from version numbers or an old active pointer.

## Source deployment determination

Downloaded mobile-api contains 471 files. Of 49 Edge paths changed between the registered SHA and current main, 36 match the registered source and 13 are absent from that older deployed bundle. Across that changed-path set, zero files match current main, and one matches the intermediate #405 merge. The per-file matrix is `source-comparison.json`; counts refer only to this changed-path set, not the whole repository.

Examples absent from Production: `domains/kael-chat/emergency-turn.ts`, `kael/kael-guardrails/emergency-guidance.ts`, `kael/kael-guardrails/requested-work.ts`, and the new emergency contract/platform helper. The existing boundary guard differs from current main. Combined with no release/attestation for either merge SHA and the missing payment fixes, this establishes that neither PR's complete Backend change set is deployed. It does not assert every unrelated runtime file is byte-identical to the old commit.

## Database drift and compatibility

Production history: 454 rows, newest `20261015120000_backend_promotion_monitor_evidence`.
Repository inventory: 465 entries. After applying the repository's declared equivalence map: 455 canonical local versions versus 453 canonical hosted versions, zero unrecognized hosted versions.

Exactly two canonical versions are missing:

1. `20261022100000_reopen_reconciled_manual_bank_ledger.sql`.
2. `20261022141232_control_bank_reference_race.sql`.

Read-only pg_proc inspection independently confirms the deployed `decide_manual_bank_payment_reconciliation` body contains neither `v_ledger_reopened` nor the `job_payment_orders_bank_reference_hash_uidx` race handler. Its SQL signature remains present. No financial transaction was executed to demonstrate these defects on real data.

Existing confirm authority is preserved: `confirm_kael_chat_durable_atomic_v4` and `confirm_kael_chat_durable_authorized_v6` exist. The current confirmation-operation owner selects those existing RPCs; no planner replacement is present. The manual-bank reconciliation function is SECURITY DEFINER; this session did not alter its existing grants, policy or behavior.

Source RPC catalog check with the actual hosted function-name snapshot: 265 names present, zero missing, zero unscannable sites, exit 0. This verifies names only. It does not verify complete arguments, RLS, grants, concurrency, transaction semantics or returned receipts. Current main's payment behavior is not schema/implementation-parity verified because both fixes are absent. Existing older Edge/schema co-existence is observed, not certified end-to-end compatible.

## GitHub checks, deployments and release control

- Both PRs' observed CI and strict Backend quality checks succeeded; deployment-related jobs were skipped. Full status arrays are retained.
- Current-main CI run [39877323323](https://github.com/manhtu0407/HomeServices-/actions/runs/39877323323): success.
- Current-main [release-production 39877323191](https://github.com/manhtu0407/HomeServices-/actions/runs/39877323191): completed **failure**, after isolated Supabase startup, empty replay, integration and SQL steps succeeded. Failing step: **Generated database types and schema lint**. `cmp /tmp/rejoined.types.ts /tmp/database.types.ts` reports `EOF on /tmp/database.types.ts after byte 561408, line 18192`, exit 1. The later schema-lint command is not proven to have executed. Full semantic cause is unresolved without the two compared artifacts; do not assume harmless whitespace or change a checker to hide it.
- #405 main [run 39765592023](https://github.com/manhtu0407/HomeServices-/actions/runs/39765592023): failure starting isolated Supabase, registry `Data limit exceeded`; no later quality receipt.
- Current `release-production.yml` main-push job is quality-only. The release name is not a deployment receipt. Its scheduled reconciliation is a separate path; this audit invoked neither.
- Repository `NESTSCOUT_BACKEND_RELEASE_ENABLED=false`; Production environment has no override for that variable. No setting was changed.
- Main branch-protection endpoint returns HTTP 404, `Branch not protected`; repository rulesets returns `[]`. Thus no platform-enforced required check set was found. Existing CI/release workflows still define quality obligations; green PR checks do not substitute for failed main quality.
- Production protection rules are `[]`, deployment_branch_policy NULL. Keep the release switch false and retain owner-controlled release boundaries; adding protection requires separate authorization.
- Latest GitHub Production deployment: `7205109179`, SHA `111988b0...`, October 20, terminal status **failure**. No deployment record for #405/#406 found among the latest ten records.
- GitHub Releases response: `[]` (no published release receipt there). Registry artifacts and the promoted control pointer are the actual inspected release records.

No active canary/candidate or completed/rolled-back release for #405/#406 is evidenced. A future release is **NEEDS_OPERATOR**, not approved by this request; separate local operator approval/pending work outside these inspected records is UNKNOWN.

## Safe release/remediation prerequisites

1. Preserve containment and the current active pointer. Do not relabel v361/v145 as attested by editing release records.
2. Independently reconcile current deployment IDs, exact bundle/runtime configuration and signed source provenance. Options: verify and register an explicitly approved unchanged-content deployment through the existing official process, or perform an owner-approved fresh immutable release through that process. No speculative rollback.
3. Diagnose the exact generated-type comparison failure using the two artifacts and reproduce at `4ee3a732d5ddd724d5055465664f8d5c1b0af0ce` in isolated Postgres; repair only the identified source/type-generation discrepancy under scoped approval. Alternative: hold release and supply a reproducible artifact diff for the responsible owner. No baseline or checker weakening.
4. Review and rehearse the two unapplied migrations in isolated PostgreSQL, including ledger reopening, wrong actor, bank-reference collision, transaction rollback, concurrency and grants. Preserve `platform_bank_manual`, existing RPC authority and the old release's supported behavior. No hosted migration execution here.
5. Re-establish immutable release inputs, green required machine checks, exact Edge/DB compatibility, operator approval and official deployment/promotion receipts before any hosted release. Migration rollback must be a reviewed compatibility action, not an automatic destructive down migration.
6. Resolve Plan 01 acceptance and KAWA_02 entry/path decisions independently of release. A blocked Production release does not prohibit approved isolated W04/W05 preparation.

No `db push`, hosted migration, Edge deployment, release dispatch/control update, Production data write, paid AI call, push notification, real payment, commit, push, PR or merge was performed. Source checks and deterministic T0 results are not native/device acceptance.

Evidence: companion packet `kawa02-release-entry-audit-20261023/`, `production-readonly-audit.json`, function/file manifests, migration comparison, RPC snapshot/check, GitHub command outputs and `commands.jsonl`. Reports are checkpoint evidence, not a competing live plan.


## Final audit snapshot and preservation verification

Final hosted SELECT snapshot at 2026-10-23 approximately 07:46 Asia/Ho_Chi_Minh reconfirmed revision 51, the same active release, no candidate, newest migration 20261015120000, zero registered releases for the two new merge SHAs, and **zero source attestations for mobile-api361/matching145** (queried those exact versions, not inferred from a limited listing).

Final `node scripts/check-work-plan.mjs`: exit 0, two evidence slices closed. Final `git diff --check`: exit 0. `git diff --exit-code HEAD -- apps packages supabase scripts config .github`: exit 0. `git diff --exit-code HEAD -- governance/Plan.md .claude/MEMORY.md docs/memory`: exit 0. Git status lists only the two appended evidence indexes/ledger and the new audit/evidence directory. No source, protected policy, runtime configuration or memory change.

The 27 payment cases ran with `node node_modules/vitest/vitest.mjs run src/__tests__/unit/admin-finance-bank-reference-pillar.test.ts src/__tests__/kael-edge-runtime/domains/manual-bank-payment-http-pillar.test.ts src/__tests__/kael-edge-runtime/domains/admin-payment-reconciliation-decision-http-pillar.test.ts --reporter=json --outputFile=<packet>/payment-regression.json`, cwd `C:\ns-fix\kawa02\apps\api`, observed process exit 0. This is T0 HTTP/helper coverage, not execution of the two payment SQL migrations.

No standalone secret-scanner executable was available on PATH. Evidence was restricted to metadata, hashes, synthetic test output and GitHub masked logs; no credential values or downloaded Edge source files are included. Automated secret scanning is NOT_RUN, not a passed check.

Router closeout: local execution only; audit and entry-preparation evidence slices closed; no feature/TDD implementation slice opened because approval is pending. Wider authority reads were necessary to verify the requested gates. Full ship/build/mobile/paid/native/DB lanes were omitted because there was no source change and no eligible module implementation. Right work: live release truth and an actionable gate handoff. Worth the spend: the audit disproves deployment assumptions and preserves a tested baseline without unauthorized changes.

Supporting raw evidence and hashes are included in `KAWA02_EVIDENCE.zip` beside the two delivered reports. This zip is evidence transport, not another execution plan.


## Subsequent approved local implementation checkpoint

After the read-only audit above, the owner approved W04/W05 local work. Those modules are now implemented and verified as detailed in KAWA02_IMPLEMENTATION_ACCEPTANCE_REPORT.md. Earlier statements about no source change/entry approval pending describe the original audit checkpoint, not the current local candidate. No hosted release or migration was made; this audit remains a timestamped deployment finding, not a claim that the new local source is deployed.
