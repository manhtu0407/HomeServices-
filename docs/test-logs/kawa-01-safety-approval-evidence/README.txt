KAWA_01 safety and approval hardening - evidence package (T0 only, not independently reviewed)

Base: 8a03e780d390ea312f1b8b2283806e2135172ed7 (pushed, PR #403). The source changes and this folder are one commit on top of it, pushed to the
same branch at the owner's request so Codex, ChatGPT, Tu and Dev Kouuu can review; nothing was merged or deployed. Ledger: checkpoint
SAFETY-APPROVAL in ../kawa-execution-ledger.md.

VERDICT: NEEDS OWNER APPROVAL.
  The confirmed defects are fixed and proved at T0. A safety release still waits on owner decisions: how the emergency classifier is
  measured and strengthened, how guidance reaches the customer inside a failure response, and a T1 (real Postgres) lane for the approval
  commands. No emergency-detection claim is made. Independent acceptance is not claimed.

THE TEN HANDOFF ITEMS

1. Changed files and source diff
   kawa01-safety-approval-source.patch is the diff against the base, this folder excluded. file-digests.txt holds the SHA-256 (LF form, as git
   stores it) of every changed file and of every file here except itself and the patch; the patch digest is its last line.
   Production, 13 files under supabase/functions/mobile-api/_shared:
     domains/customer/assistant.ts, domains/customer/kael-conversation-turn.ts            emergency before quota, status refusal, paid steps
     domains/kael-chat/create.ts, turn.ts, emergency-turn.ts                              emergency over an invalid schedule answered as a 2xx
     domains/kael-chat/intake-confirmation.service.ts, evidence.ts                        customer-only (403 for admin)
     domains/matching/accept.ts, decline.ts                                               worker-only (403 for admin, customer)
     kael/agents/customer-assistant-answer.ts, customer-assistant-turn-context.ts, customer-assistant.ts   pure early answer and context-free reading
     platform/access.ts                                                                   assertJobStatus split out of requireJobAccess
   Tooling, 1 file: apps/api/scripts/kael-playbook-eval.mjs (+1 line, SOURCE_FILES, pinned by P402).
   Tests: new P412 (52), P413 (76), P414 (165), P415 (16); new helpers emergency-blind-eval.ts and normal-chat-world.ts; changed P411 (three
   expectations, disclosed in compatibility-and-rollback.md) and emergency-fixtures.ts (newCaseWorld).
   Docs: governance/protocols/test-pillars.md (regenerated, 410 pillars), docs/architecture/code-ownership-map.md, docs/test-logs/INDEX.md,
   docs/test-logs/kawa-execution-ledger.md and this folder. No locked doc, scripts/harness file, migration, contract, classifier file or
   mobile file changed.

2. Root causes and resolved defects        defect-ledger.md
   D-01 emergency + invalid schedule refused with a 4xx the shipped app cannot show; D-02 gate behind quota, status refusal and paid steps on the
   assistant and normal-chat routes; D-03 admin could decide intake and evidence; D-04 admin reached accept/decline.

3. Safety coverage matrix and blind spots  safety-coverage-matrix.md
   18 entry points enumerated from the Edge route table and the request contracts; requirement-to-pillar trace; which failure responses reach the
   customer; nine blind spots.

4. Approval and authorization matrix       approval-authorization-matrix.md
   Existing behaviour only (not KAWA_02): eight properties by gate; three admin defects found and fixed; what is BLOCKED at T1.

5. Evidence of no unauthorized business actions
   P413: 20 customer-decision routes refused to an admin and to a worker, 7 worker-action routes refused to an admin and to a customer, a real
   Case world driven as an admin, 9 approval-evidence routes failing closed: 403 or validation error, no write, no RPC, no provider call.
   P414: 14 fixed sentinels x 10 entry points = 140 cells, 140 passing, zero writes outside the Case rows (no Job, quote, match, payment or
   consent) and zero provider calls on every stop route (sentinel-matrix.json). P412: the same for the invalid-schedule, assistant and
   normal-chat paths, plus strangers, workers and admins getting nothing. Import-reachability: no Kael-layer or emergency module reaches an
   approval writer.

6. Remaining concurrency, RLS and atomicity limits   approval-authorization-matrix.md ("What is BLOCKED at T1")
   Nothing here proves atomicity, double-confirmation, price-receipt binding, scope-proposal immutability or row-level security. The SQL pillars
   P106, P108, P117, P119, P121, P122, P129, P133, P135, P177, P371, P378 and P20 were not run (no Postgres). Two identical emergency messages
   are two customer turns (no idempotency key).

7. Unseen classifier performance and limitations   classifier-assessment.md, blind-evaluation-protocol.md
   Unseen-wording recall is NOT_RUN: no independent set exists. The only reproduction (H5, written by the implementation lineage, no longer
   unseen) is 11 of 29 detected and routed (37.9 %, 95 % interval 22.7-56.0 %) with 1 of 30 false alarms (3.3 %, 0.6-16.7 %). The development
   sets score 155 of 156 and 0 of 113 false alarms because the cues were written against them. One deleted letter drops detections from 155 to
   111 of 156 and missing tone marks to 143 of 156 (classifier-perturbation.json). Rule-only matching cannot support a recall claim on open wording; options A-E and a bounded
   strategy are in the assessment. Nothing was tuned on H5. The harness (P415) does not call a set independent without the reviewer's attestation, the sealed hash and a hash
   registered out of band.

8. W00-W03 / G0-G6 (applicable gates only)
   W00 preserved. W01 sentinel suite 100 % at T0 (140/140, P401-P411 green); unseen recall NOT_RUN, a safety release blocker. W02 preserved. W03
   preserved (the early assistant answer still traces; no text or actor hash added). G0 PASS. G1 N/A (no T1). G2 PASS at T0 (70 red on the
   pushed sources, green on the new; 24/24 mutants killed). G3 PASS at T0 with the residual risks below. G6 this checkpoint. T1, T2, T3
   NOT_RUN.

9. Remaining P0/P1 risks and owner decisions
   P0  Emergency recall on unseen wording is unmeasured and the only reproduction is 37.9 %. Decide: nominate the independent reviewer and
       approve thresholds (protocol), then B (deterministic fail-safe), C (model second opinion) or D (fixed emergency affordance).
   P1  Guidance carried in a failure response is not shown by the shipped app (closed Case through the API, an unwritable reply, a stream
       failure, a first message over the new-Case quota). Decide: a structured emergency field plus a client change, a bounded allowance, or
       accept the residual.
   P1  Approval atomicity, concurrency and RLS are unproven. Decide: a T1 lane.
   P2  Fixed LPG, fire and health wording has had no domain review; fields not read; free-text surfaces without a gate; the Next.js reference
       route POST /api/jobs creates a Job from free text with no gate (undeployed); the scope-change decision carries no proposal version
       (KAWA_02).
   P1 (CI, pre-existing, not a safety defect) The pushed commit fails one harness test, found by pnpm ship:check: 17 *.log files committed in
       ../kawa-01-final-closure-evidence match .easignore, so "EAS upload retains every tracked input used by the full-source release
       identity" fails (17 !== 0), and ci.yml runs that test. CI has not run on PR #403 yet. Decide: rename those 17 files to *.log.txt, add a
       negation to .easignore, or untrack them (defect-ledger.md N-07). This folder saves its logs as *.log.txt and adds nothing to it.
  Housekeeping: PR #403 conflicts with main 111988b0 only in .claude/MEMORY.md and docs/memory/2026-10.md; a merge or rebase was not
   authorized. No pillar-id collision (main stops at P400).

10. Rollback and compatibility   compatibility-and-rollback.md, red-green/
    No schema, contract, flag, secret or mobile change, so no data rollback. Route and status table; existing clients need no change.
    Rolling the 13 production files back to the base and running the WHOLE API suite with the current tests fails 70 of 3,412 tests, all in the
    four pillars that pin the new behaviour (red-green/rollback-full-suite-on-baseline-sources.txt).

CONTENTS
  kawa01-safety-approval-source.patch   source diff against the base (this folder excluded)
  file-digests.txt                      SHA-256 of every changed file and every file here except itself and the patch
  defect-ledger.md  safety-coverage-matrix.md  approval-authorization-matrix.md  classifier-assessment.md  blind-evaluation-protocol.md
  compatibility-and-rollback.md
  gates/                                raw output (last 120 lines, saved as <name>.log.txt) and exit codes of the final gate run;
                                        gates/first-run/ is the first run, kept as it was (it shows the two type errors fixed afterwards);
                                        gates/post-docs/ is the document-reading gates rerun after the last documentation edit;
                                        gates/ship-check.txt is pnpm ship:check; lint-authority.log.txt shows the one existing violation
  red-green/                            four pillars on the pushed sources (70 red of 330), the whole suite on the pushed sources, P413 before
                                        its role guards
  mutation/                             the 24 mutants: final run 24/24; the first run (22/24, two survivors that led to two new tests); the
                                        second run (24/24) made before one P411 row was strengthened
  pillars-p401-p415.vitest.json         machine-readable result of the fourteen pillar files (949 passed)
  sentinel-matrix.json                  140 cells, 140 passed
  classifier-perturbation.json          the development sets under deterministic spelling changes

REDACTION
  Absolute local paths in these files were replaced by placeholders (<repo>, <temp>, <user-home>, <auditor-artifacts>, <user>). Nothing else in
  the raw output was edited. No sealed phrase, row text or private data appears anywhere in this folder.

KNOWN OPEN ITEMS, NOT HIDDEN
  - pnpm lint:authority fails (existing violation: a mobile test cites Plan section 3.4, which exists nowhere); unchanged from the base.
  - pnpm ship:check exits 1: 27 uncommitted paths at the time of the run (expected) and the one harness test above (it appears in both "harness assurance" and "script
    fixture suites"); every other gate it ran is ok and 633 of 634 harness tests pass (gates/ship-check.txt).
  - Not run: the SQL pillars, any hosted query, any device or live-model run, kael-eval.mjs and kael-playbook-eval.mjs --mock (unchanged W02
    tools; SOURCE_FILES gained one entry so the playbook source hash moves and was not re-measured).
  - The earlier unexplained 599-of-600 pillar run (CLOSURE-FINAL) is still unexplained; this task did not reproduce it.
  - The session-memory entry for this task has not been written; it awaits the owner's approval.
