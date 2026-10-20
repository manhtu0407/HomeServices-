# Kael release provenance and refusal tracing — read-only operator runbook

Use this when a customer reports that Kael refused or stalled a supported case (for example an HVAC case answered with "outside the six supported services", or a quote card that says "Báo giá cần rà soát" with no reason) and nobody can say which release produced it.

It is read-only. It reads no secret, writes nothing to Production, spends no provider money, and never needs live customer chat. If a step would need any of those, stop and ask Tu.

**Do not paste live customer chat, photos, addresses, phone numbers, tokens or raw `safe_metadata` into an AI agent or a ticket.** Every query below selects codes and identifiers only. The fields you may share are listed in section 1.

## 0. Rule that governs every claim

GitHub `main` is source. Production is whatever the hosted Edge function and the installed binary actually run. They are different facts; only a hosted snapshot (section 4, step 1) or a persisted trace (section 4, step 5) can connect them. A claim of "drift" or "match" needs that evidence. Without it the answer is `UNVERIFIED`, with the exact evidence still missing.

## 1. Safe fields

Persisted trace: `kael_chat_turns.safe_metadata -> 'turn_trace'` on the Kael reply of a Case Work question turn. Written by `answerKaelCaseQuestion` since schema `kael_turn_trace.v1`. The same object is logged as `kael_turn_trace` (function logs) for refusals and redirects, capped at 20 lines per minute per route and stage in each Edge isolate. Turns answered by the direct assistant route (`/kael/assistant`, and normal-chat conversation turns) are not given a trace row; they appear only as the log line, with `route` = `assistant_case` or `assistant_normal`.

| Field | Meaning | Source in code |
|---|---|---|
| `correlation_id` | request trace id (UUID); the last 8 hex characters, upper-case, are the support code the app shows | `ctx.traceId` from `createHarnessTraceContext` |
| `route` | `case_work_question`, `assistant_case` or `assistant_normal` | `platform/turn-trace.ts` callers |
| `stage` | `answered`, `prompt_injection`, `unsafe_request`, `permission_gate`, `boundary_guard`, `clarification_required`, `provider_output` (the model itself declared the request out of scope), `answer_unavailable` | `decision` built in `runCustomerAssistant`; `provider_output` when the boundary is `unsupported` and no decision exists |
| `outcome` | `answered`, `educational_only`, `redirect`, `unsupported`, `fallback` | assistant `boundary` |
| `fallback_used` | the text came from a fallback, not a model answer | assistant `fallback_used` |
| `service_code` | the case's canonical service (`kael_chat_sessions.service_type`, or the job's); `none` if absent or not one of the six | session / job row |
| `assistant_service_code` | the service the assistant resolved from the message; `none` when it resolved nothing | `serviceType` in `runCustomerAssistant` |
| `case_phase`, `pending_slot`, `missing_fact_count` | workflow step: the phase, the detail the next reply answers, and how many details are still missing | session and `diagnosis_scope` |
| `intent`, `intent_source` | how the turn was routed (`ask_question`, ...) and by whom (`chip`, `ai`, `fallback`) | `CaseTurnRouting` |
| `permission_reason`, `permission_topic`, `topic_source` | the gate result, for example `DENY_OUT_OF_SCOPE_SERVICE` with topic `out_of_scope_services_anything` | `evaluateKaelPermissionGateWithBoundaries` |
| `boundary_reason` | `prompt_injection`, `out_of_scope` or `service_mismatch` from the message boundary guard | `evaluateMessageBoundary` |
| `replay_topic` | the topic the same message gets when the canonical service is supplied; present only for an out-of-scope denial | `classifyAssistantTopic` replay |
| `quote_blocker` | `price_gap_reason`, else an escalation reason, else `quote_readiness`, from a closed list; anything else is `other` | latest quote-readiness turn, `diagnosis_scope.next_action` |
| `edge_release_id`, `edge_deployment_id` | the Edge release and deployment that wrote the row | `ctx.releaseId`, `ctx.deploymentId` |
| `client_release_id`, `client_git_sha`, `client_build_number`, `client_eas_build_id`, `client_platform` | what the app reported in `x-client-*` headers; absent for a legacy client | `requestClientIdentity` |

Never selected and never shared: `text_content`, `customer_id`, `media_refs`, the whole `safe_metadata`, any address, phone, token or key.

## 2. Who may run what

| Step | Needs | Owner |
|---|---|---|
| Section 3 provenance report | a clean checkout of the commit under test; no credentials | any engineer or agent |
| Hosted snapshot | `SUPABASE_ACCESS_TOKEN` for the Production project (Management API plus read-only SQL) | Tu, or whoever holds the release authority |
| Trace queries | an admin-read session: `harness_runs` / `harness_events` have an admin-only read policy; `kael_chat_*` need an authorized read-only database connection (this repository does not define one) | Tu or the Production database owner |
| EAS build record | access to the EAS project dashboard | Tu |
| GitHub Actions run record | read access to the repository | any collaborator |

An agent without those credentials writes an evidence request (section 6), not a guess.

## 3. Release provenance report (offline, no credentials)

```bash
node scripts/harness/release-provenance.mjs                 # Markdown table
node scripts/harness/release-provenance.mjs --format json   # machine-readable
node scripts/harness/release-provenance.mjs --paths a.ts,b.ts   # choose the paths for source_change_commit
```

Run it from a clean checkout of the commit you are asking about; on a dirty tree the report says so and `expected_release_id` describes the working tree. Every row carries its source and is `VERIFIED` or `UNKNOWN`. With no hosted snapshot the parity is `UNVERIFIED`, and that is the correct answer, not a failure. `github_main_ref` is a local ref that may be stale and never upgrades parity.

## 4. Correlate mobile -> Edge -> Case

1. **Hosted snapshot** (authorized operator): `pnpm harness:release:hosted-state --environment production --project-ref <ref> --project-url https://<ref>.supabase.co --output <path-in-repo>`. It reads the public `/harness/health`, the function list and read-only SQL. Then `node scripts/harness/release-provenance.mjs --remote <path> --require-match` returns `VERIFIED_MATCH`, `VERIFIED_DRIFT` with the exact mismatches, or `UNVERIFIED` when the snapshot carries no identity or was not produced by the collector.
2. **Binary**: the app sends `x-client-release-id`, `x-client-git-sha`, `x-client-eas-build-id` and `x-client-build-number`. Edge adds `x-release-id`, `x-trace-id` and `x-support-code` to its responses (`withHarnessHeaders` in `http.ts`). The app keeps the three response values in `ApiResponseMetadata`; the support code is shown on some cards (for example the intake coverage response); ask for it when visible, or use the trace id if the report has one.
3. **Edge run**: `select trace_id, route_kind, release_id, status, error_code, started_at from public.harness_runs where trace_id = '<uuid>'`. For a support code only: `where right(replace(trace_id::text, '-', ''), 8) = lower('<code>') and started_at > now() - interval '3 days'`.
4. **Case**: for the session the operator already holds:

```sql
select t.turn_index, t.content_type, t.created_at,
       t.safe_metadata -> 'turn_trace'           as turn_trace,
       t.safe_metadata ->> 'reply_source'        as reply_source,
       t.safe_metadata ->> 'answered_turn_intent' as answered_turn_intent
from public.kael_chat_turns t
where t.session_id = '<session-uuid>' and t.role = 'kael'
order by t.turn_index desc limit 20;

select s.service_type, s.case_phase, s.status
from public.kael_chat_sessions s where s.id = '<session-uuid>';
```

5. **Pattern across customers** (no identifiers):

```sql
select t.safe_metadata -> 'turn_trace' ->> 'stage'             as stage,
       t.safe_metadata -> 'turn_trace' ->> 'permission_reason' as permission_reason,
       t.safe_metadata -> 'turn_trace' ->> 'service_code'      as service_code,
       t.safe_metadata -> 'turn_trace' ->> 'replay_topic'      as replay_topic,
       t.safe_metadata -> 'turn_trace' ->> 'edge_release_id'   as edge_release_id,
       count(*)
from public.kael_chat_turns t
where t.created_at > now() - interval '7 days' and t.safe_metadata ? 'turn_trace'
group by 1, 2, 3, 4, 5 order by count(*) desc;
```

These queries were written against the column definitions in the migrations and have not been run against a live database. If one fails, fix the query; do not widen it to `select *`.

## 5. Telling the causes apart

A turn that predates the trace has no `turn_trace`; for it only `harness_runs`, `reply_source`, `answered_turn_intent`, `fallback_used` and `kael_chat_sessions.safe_metadata.last_turn_intent` exist, and the cause usually stays `UNVERIFIED`.

| Cause | Positive evidence | What it is not |
|---|---|---|
| Stale app | `client_release_id` or `client_build_number` is below the build the hosted snapshot reports as the minimum, or differs from the build under test; or the client keys are all absent (legacy client) | an old app does not produce `DENY_OUT_OF_SCOPE_SERVICE` by itself; it only explains a missing header |
| Stale Edge | `edge_release_id` differs from `expected_release_id` for the commit, or the snapshot is `VERIFIED_DRIFT`; or a reply written after the trace shipped carries no `turn_trace` | one `main` commit that contains a fix says nothing about what runs |
| Classifier fallback (context loss) | `stage = permission_gate`, `permission_reason = DENY_OUT_OF_SCOPE_SERVICE`, `service_code` is a real service, `assistant_service_code = none`, and `replay_topic` is a service topic such as `hvac_service` | a message that really names an unsupported thing |
| Genuine unsupported request | same refusal, but `replay_topic = out_of_scope_services_anything` (the refusal survives the canonical service), or `boundary_reason = out_of_scope` | missing context |
| Model-written refusal | `stage = provider_output`, `outcome = unsupported`, no `permission_reason`; the text is the model's own, not a template | a deterministic gate or guard decision |
| Generic redirect, not a refusal | `stage = clarification_required`, `outcome = redirect` (the answer asks "which problem at home") | an out-of-scope decline |
| Policy or configuration | `stage = permission_gate` with another reason (rate limit, cost cap, confidence), `fallback_used = true` with `answer_unavailable`, or a snapshot whose `providerReadiness` shows `global_ai_enabled=false` or a provider down | classifier behavior |
| Missing price evidence | `stage = answered` and `quote_blocker` is `no_published_price`, `too_few_trusted_sources`, `mixed_units`, `stale_sources`, `sources_disagree`, `lookup_unavailable` or `validated_price_evidence_unavailable` | any refusal; this is the truthful reason the card should show |

The three user-visible out-of-scope texts come from different code, so the text a customer quotes already narrows the path:

- "chưa có đủ chuyên môn và quy trình đã kiểm chứng cho hạng mục ngoài sáu dịch vụ đang hỗ trợ" is the permission-gate template (`permission-gate.ts`, `DENY_OUT_OF_SCOPE_SERVICE`).
- "nằm ngoài phạm vi sáu nhóm dịch vụ nhà ở Kael đang hỗ trợ tại TP.HCM" is the message boundary guard (`boundary-guard.ts`, `reason = out_of_scope`), also used by the intake pipeline guard, which sets the session status to `unsupported`.
- In a case with a linked job, once the chat session is `confirmed`, `abandoned` or `unsupported` the app sends the next message through `/kael/assistant` with `surface = customer_case` instead of the Case Work route (`use-customer-kael-message-actions.ts`). That route resolves the service from the job row; it has no session.

On the card: `localizedQuoteReviewReason` shows a specific reason only for `case_work_turn_safety_limit`; every other state falls to the generic text. A generic card therefore does not mean the server had no reason; read `quote_blocker`.

## 6. Final evidence rubric and evidence request

| Level | Evidence | Allowed conclusion |
|---|---|---|
| E0 | a screenshot or a report | "reported"; nothing about cause |
| E1 | source read at a commit | "the code at that commit does X" |
| E2 | a deterministic test or replay at that commit | "the code at that commit does X for this input" |
| E3 | a hosted snapshot compared with the commit's expected release | `VERIFIED_MATCH` or `VERIFIED_DRIFT` of Edge and schema; says nothing about the installed app |
| E4 | a persisted `turn_trace` for the incident turn, with `edge_release_id` equal to the E3 release | the cause for that turn |

State the level reached. A root cause for Production needs E4; "Production drift" needs E3 `VERIFIED_DRIFT`.

Evidence request to hand to the operator when the level is below what the claim needs:

1. The hosted snapshot file from `pnpm harness:release:hosted-state` (no secrets in it).
2. The `release-production` run id and the commit it deployed.
3. The EAS build record for the iOS and Android builds the customer could have (build id and `gitCommitHash`).
4. For one incident: the support code or trace id and the session id, and the result of the two `kael_chat_*` queries in section 4, step 4, pasted as returned (codes only).

## 7. Limits

- `turn_trace` exists only on rows written by an Edge that contains it. Turns before that cannot be classified by it.
- `/kael/assistant` turns leave only the log line; log retention is the Supabase plan's, not set by this repository.
- `replay_topic` replays the message text against the canonical service with the same pure classifier; it cannot prove what an older deployed classifier did.
- Nothing here proves which binary a customer installed except the `client_*` fields of a recorded turn.
