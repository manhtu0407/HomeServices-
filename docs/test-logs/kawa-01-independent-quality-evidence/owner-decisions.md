# KAWA_01 bounded owner decisions

These are reviewable proposals, not permission to implement, dispatch final CI, merge or release. The recommended
order is safety delivery/fallback, sealed evaluation and isolated T1, then approved integration and exact-source CI.

## D1 - Emergency fallback independent of classifier recall

Recommend a permanent, localized emergency-help affordance in the existing Kael header/composer, with bundled
reviewed guidance that is available offline. It must be reachable without successful classification, Case creation,
quota, storage, auth refresh or a provider. It does not classify the user, approve work or automatically place a call.
User action opens the platform call control. A text fallback remains when phone controls are unavailable.

Affected owners: `apps/mobile/components/customer/kael-chat/kael-chat-header.tsx`,
`customer-kael-chat-content.tsx`, existing mobile localization/copy owners and a small shared emergency-copy contract
only if required after ownership discovery. The exact UI diff follows design preflight; no new screen flow has been built.

Contract/UI change: a new user-visible affordance and reviewed VI/EN content; a new mobile binary is required.
Compatibility: additive, no Case/approval API change. Security: no raw server text, no sensitive Case details,
no automatic call or extra provider traffic. Rollback removes the affordance in a later binary; bundled safe text
does not mutate workflow state.

Acceptance: native iOS accessibility/large text/light/dark/Reduce Motion/Transparency, offline/failed-auth/provider
disabled/quota exhausted, VI/EN isolation and explicit call action. Confirm the control remains reachable on error,
empty, closed, required-evidence and streaming screens. Browser proof is insufficient.

Owner choice: approve this bounded fallback design work, or explicitly select another independent safety control.
Keeping classifier-only behavior leaves W01 blocked.

## D2 - Guidance delivery on failures, invalid media and required evidence

Recommend an additive versioned payload containing only allowlisted route/copy-version identifiers, for example
`emergency: { version: 'v1', route: <existing route> }`. This is a proposal, not a new accepted schema.
Keep HTTP status/error codes and the required-evidence/media rejection authoritative. Do not turn a rejected upload
or skipped evidence into success and do not write consent, a Job, a quote or a payment to show guidance.

Affected files: contract twins `packages/shared/src/contracts/kael-chat.ts` and
`supabase/functions/_shared/contracts/kael-chat.ts`; Edge `platform/api-failure.ts`, `http.ts`,
`domains/kael-chat/{create,intake,turn,evidence,emergency-turn,stream,customer-conversation-stream}.ts`;
mobile `lib/{api,kael-stream,kael-stream-validation}.ts`, typed API owners and
`customer-kael-chat-helpers.ts`/message/evidence action presentation. Add structured validation at every handoff,
and localized prebundled rendering instead of trusting error prose.

Compatibility: optional additive envelope field; old clients retain existing errors and cannot be credited with
displaying new guidance. Ship the new client before claiming end-to-end coverage. Any connection lost before a
payload can arrive needs D1's offline fallback; a server field alone cannot guarantee network-failure delivery.
Error HTTP status/order changes require explicit review, rather than assuming an unchanged JSON shape preserves
the public contract.

Security: ownership/role checks stay before Case-dependent processing; no details from another customer's Case,
untrusted instructions, evidence URLs, stack or PII enter the payload. Foreign/expired media is never consumed or
made valid. Generic D1 content can be shown without disclosing a Case. Preserve retry/idempotency and stop-turn rules.

Acceptance: regression probes in `safety-probe.json` must deliver reviewed guidance while preserving denial and no
commitment. Cover new/open/closed Case, typed text, confirmed voice transcript, photo notes, invalid/foreign/replayed
media, required evidence, pending confirmation, quota, DB read/write timeout, disconnected/corrupt/truncated SSE,
malformed/unknown route identifiers, wrong owner/admin/worker, native VI/EN rendering and old-client compatibility.

Quota decision is separate: either keep ordinary new-Case limits plus D1, or authorize a bounded guidance-only path
that creates no unlimited Case/media/provider work. Do not silently weaken abuse controls.

## D3 - Fresh, independently authored and sealed evaluation

Nominate a reviewer who did not author this classifier, its fixes, development sets, H5 or this scoring patch.
Before evaluation, the reviewer authors synthetic clear/judgement cases with per-route labels and benign controls,
signs/attests authorship, seals canonical bytes and registers the hash out of band with Tu. Keep phrases hidden from
implementers until the one-shot evaluation. Record classifier/source/scorer hashes before execution.

Affected files/workflow: existing `helpers/emergency-blind-eval.ts`, P415 and the external evaluator corpus/receipt;
no runtime API or paid model is needed. The current helper verifies supplied attestations and hashes mechanically;
it does not authenticate the human reviewer or timestamp the out-of-band registration. Tu must control that provenance.

Owner approves thresholds before data is opened. Existing proposed defaults remain overall detection Wilson lower
bound >=0.90, per-route >=0.80, false-positive upper bound <=0.05, >=30 positives per route and >=100 negatives.
Corrected scoring additionally rejects any wrong route. These defaults are not approved release policy. Prefer
larger samples and an explicit exact-routing criterion chosen before execution; do not lower thresholds after a miss.

Acceptance: no set -> NOT_RUN, no outside registration -> NOT_INDEPENDENT; changed bytes/labels -> rejection;
separate detection, exact-routing, misses, wrong-route and false-positive counts/intervals by route/language/context;
never combine rates into an accuracy claim. A perfect synthetic scorer test is only arithmetic verification.
H5 remains frozen `REPRODUCTION` and is not reused for tuning or promoted to independence. Public negation findings
are development regressions and remain separate from the blind sample. A hazard-root-triggered second model cannot
cover cases with no such root; do not approve that unsupported promise from the earlier strategy note.

## D4 - Isolated T1 approval/RLS/concurrency lane

Approve only synthetic localhost execution. Before startup: a unique project/container identity, separate workdir,
unused ports chosen after checking ownership, exact migration inventory, no linked target, fail-closed URL/network
allowlist and bounded command/statement/lock timeouts. Never reset or reuse another session's database or canonical
snapshot. Docker tooling/version changes, if needed, must be disclosed before changing host tooling. No hosted target,
provider call, production credential, new product RPC or product migration is needed for this lane.

Affected test owners: existing `supabase/tests/*.sql` and isolated test orchestration/fixtures. Reuse receipt,
confirmation, candidate, apartment-access, scope-authority, RFQ and completion/payment tests (P20, P106/P108,
P117/P119/P121/P122/P129/P133/P135/P177/P371/P378 as applicable). Record real collection and each executed assertion.

Actor matrix: owner customer, other customer, assigned/unassigned worker, admin, anon and service-role entry points.
Authenticate through actual local Auth/PostgREST for end-to-end role binding, plus direct SQL sessions with proper
claims/SET ROLE for RLS/grants. An injected role field does not replace this test. Check forged/stale receipts,
changed-role actors, missing ownership and stale phase/proposal identity against actual persisted rows.

Concurrency: two independent connections synchronize before confirm/accept/approve-vs-reject/completion; assert
one authoritative commitment, correct loser/retry response, no duplicate Job/payment/audit effect and rollback on
intermediate failure. Mutate displayed scope terms between presentation and decision to establish whether stale
approval is blocked. Discovery of a missing guarantee is a blocker, not authorization for a new RPC/migration or
KAWA_02 receipt implementation.

Cleanup: stop only the stack created by this lane; preserve failure logs; remove/roll back only named synthetic
fixtures and never prune shared images/volumes. No T1 runtime has been started in this review.

## D5 - Conflict, Memory and publication boundary

Review `memory-resolution-proposal.diff.txt`: retain main's new sections and the KAWA entry, without rewriting
historical statements. Review `session-memory-draft.md`: approve the exact full entry plus one recall line before
either protected memory file is written. This follows `docs/memory/INDEX.md`; no memory write was done.

After approval, re-fetch main and integrate preserving its newer governance/skill/release tooling, regenerate the
pillar index, and rerun combined-tree checks. The current no-new-contract correction diff can be reviewed independently;
it is not evidence that the merged tree passes. Resolve baseline lint/authority debt in its proper scope or obtain an
explicit owner disposition; do not suppress checks to make the candidate green.

Commit/push authorization is still needed to produce a new commit SHA and clear the clean-worktree ship gate.
Current corrections are staged on an exact allow-list for the EAS index assertion; nothing has been published.
Only after Safety/Approval/contract decisions and local checks are satisfactory should Tu separately authorize final
acceptance CI. Merge and deployment remain separate owner-controlled actions. No auto-merge is configured here.
