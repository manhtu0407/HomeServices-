# W06 final review remediation

Baseline: PR408 `6d71e0b52776c6f38e1c02c6ed1aa27cf8213edf`. Existing branch `codex/kawa02-durable-checkpoints-20261023`; no new PR. PR407 is a separate owner-approved diagnostic commit, not part of this change.

## Red-first findings

Before production edits, the new P434 adapter case failed because `failure` was outside its action enum (36 previous cases passed). Against the current HEAD function on the owned PostgreSQL stack, the new failure branch returned `WORKFLOW_INVALID_TRANSITION`. The lifecycle fixture used the existing `confirm_kael_chat_durable_atomic_v4`, with real eligible synthetic workers: confirmation attached a Job, then the original load returned `WORKFLOW_CASE_SCOPE`. Its initial coverage fixture failed `COVERAGE_UNAVAILABLE`; adding eligible workers reached the reported defect without modifying confirmation code.

## Resulting behavior

The adapter accepts explicit `failure` with a next node; the RPC selects the W04 `failure` edge. Cross-kind targets and failure/event combinations remain rejected. Successful failure outcomes are terminal and replay to the same receipt.

Case ownership is checked independently from its current Job. Only an existing instance with the exact original actor, role, Case and null Job binding can use its historical scope after attachment. The newly attached Job must still belong to that actor under a shared row lock. Non-null historical bindings still require the same current Case Job. New jobless instances cannot be created for already attached Cases. Old request hashes, immutable history and saved bindings remain unchanged; supplied new or unrelated Jobs cannot retarget the instance. Customer and Worker attachment/recovery and loss-of-ownership negatives execute on PostgreSQL. Job-only instances remain supported; a red test caught an intermediate overly broad creation guard before publication.

## Executed verification

- P43231 + P43331 + P43439 = **101 focused cases pass**.
- Full API: **5795 Vitest pass, 6 skip**, plus **115 Node pass, 1 skip**. Shared: **189 pass**. API/shared types pass.
- Fresh canonical **456-migration** local reset passes. Nine SQL scripts each discovered/executed/passed exactly once; names and exits in `sql-results.json`. These include P435/P436, real concurrent CAS/idempotency races, recovery/capacity reconciliation, frozen confirmation/matching/six-service/payment/account-deletion/security regressions.
- Customer lifecycle: jobless Case -> checkpoint0 -> waiting checkpoint1 -> existing confirmation RPC -> Job attached -> original load/create replay/transition replay -> valid typed event -> terminal checkpoint2. Foreign actors, role escalation, unrelated Jobs, conflicting instance bindings, changed Case/Job ownership, stale/out-of-order events, duplicate logical transitions and broad grants are rejected.
- Actual PostgreSQL process restart preserves state and pinned definitions. Terminating only a uniquely named synthetic test backend inside an open transaction rolls back the transition. Discarded committed create/transition outputs are recovered using identical idempotency keys. No extra checkpoints.
- Actual W04-registered definition -> Deno adapter -> local Supabase REST/RPC traverses `failure`, replays receipt and loads from a new empty-registry store. Direct pinned Deno check passes.
- Regenerated public+graphql database types exactly match the committed artifact SHA256 `62d0e00c86475d03bd359fe71ab55f5481dcd144bc342929aa7eca79ac7e521f`. Public signature/grants and existing RLS are unchanged. Catalog parity: **266 RPC names present, zero unresolved sites**.

`discardedCreateResultRecovery: false` in the older helper was an unexecuted coverage flag: that helper consumed the create response and discarded only transition responses. It was not a failing recovery verdict. The enhanced helper actually discards successful create stdout, then replays the same payload/key to recover version0; the new receipt records **true**. This proves post-commit result-loss recovery, not arbitrary network exactly-once delivery.

## Review and boundaries

OCR incremental snapshot `c5a161f8524a34df27e57ed7a1af5432be3fd5f8`: all six source/generated/test files across five batches reviewed; no confirmed findings remain in the remediation. New Markdown/evidence reviewed manually. Spec compliance, authorization, exact historical binding, edge-kind selection, CAS/hash ordering, deletion compatibility and maintainability checked. The changed migration is provably unmerged and has never been applied hosted; its public types were regenerated and compared. Generated migration/access digests updated through canonical generators only.

The two GitHub P2 threads remain reviewer-owned until the reviewer verifies the correction. Their technical reproductions now pass. CI conclusions and final publication SHA are reported in the operator output after push; this document does not assert an unobserved CI success.

No merge, deployment, hosted migration, paid call, live route integration, W07/W08, live Plan edit or protected memory write. Memory draft remains subject to show-before-write approval. Local Docker target is only `nestscout-kawa06-20261023`, DB61322/API61321. Prior tests are retained; no skips, assertions, gates or baselines were weakened.
