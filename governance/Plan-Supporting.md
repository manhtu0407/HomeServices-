# Kael Agent Harness — Production Assurance & Control Plan

> **Repository path:** `governance/Plan-Supporting.md`
> **Plan ID:** `plan-kael-agent-harness-production-assurance-20260806`
> **Created:** 2026-08-06
> **Owner:** Manh Tu
> **Prepared as:** Principal AI Infrastructure, Security, and Reliability Engineer
> **Target branch:** `docs/harness-production-assurance-plan`
> **Status:** Ready for staged execution; documentation only; this plan performs no Production mutation
> **Relationship to `governance/Plan.md`:** Standalone supporting plan. It does not replace, renumber, truncate, or rewrite any existing section in `governance/Plan.md`.

---

## 0. Executive decision

Kael already has meaningful product and agentic capability. The highest-risk gap is no longer a missing model feature. The highest-risk gap is that the surrounding Harness does not yet provide one provable, release-bound control system for:

- identity and authorization;
- tool and skill registration;
- prompt, policy, model, and schema versioning;
- database and Row Level Security enforcement;
- environment isolation;
- GitHub-to-Supabase deployment drift detection;
- end-to-end tracing and data lineage;
- deterministic and live evaluation;
- learning-data provenance and poisoning resistance;
- budget reservation and reconciliation;
- retry, idempotency, circuit-breaker, and degraded-mode behavior;
- canary rollout and full-bundle rollback;
- incident response, service-level objectives, and operational ownership.

The governing decision is therefore:

> **Do not add another major Kael capability before the Harness can prove who acted, under which policy and release, against which environment and data, with which tools, at what cost, and with what measured result.**

This plan establishes that proof in twelve small, reviewable pull requests. It deliberately avoids a single “rewrite the Harness” project.

---

## 0.1 What this plan is

This is a production-assurance plan for the agent environment around Kael. It covers five connected surfaces:

1. the repository-side agent Harness used by Codex, Claude Code, and other coding agents;
2. the runtime Harness used by Kael through `supabase/functions/mobile-api`;
3. the Supabase database, RPC, RLS, Storage, Realtime, and migration boundary;
4. the evaluation and observability system that decides whether a release is safe;
5. the promotion process connecting GitHub source to Supabase environments.

The plan is intended to turn the present collection of useful controls into one coherent, auditable system.

---

## 0.2 What this plan is not

This plan does **not**:

- add a seventh service category;
- redesign the mobile application;
- replace Supabase;
- introduce microservices for their own sake;
- replace the existing seven-stage Kael workflow;
- permit client-side money-impacting writes;
- permit direct mobile access to AI provider secrets;
- weaken user confirmation gates for offers, proposed workers, scope changes, completion, or payment;
- automatically apply migrations to Production;
- automatically deploy Edge Functions to Production;
- create fake Production users, workers, jobs, prices, ratings, or transactions;
- treat a passing unit-test suite as proof of Production readiness;
- treat documentation as runtime enforcement;
- rewrite locked governance documents without explicit approval.

---

## 0.3 Audit basis and confidence labels

This plan was prepared from a read-only comparison of the repository Harness, the Supabase-facing runtime boundary, migrations and SQL verification assets, shared contracts, package scripts, agent skills, environment examples, recent implementation history, and available Production metadata.

Every execution session must label material claims with one of these confidence classes:

| Label | Meaning |
|---|---|
| `VERIFIED-REPO` | Directly observed in the target Git commit |
| `VERIFIED-PROD` | Directly observed in Supabase Production during that session |
| `VERIFIED-TEST` | Proven by a command that actually ran and passed |
| `INFERRED` | Reasonable conclusion from evidence, not direct runtime proof |
| `PROPOSED` | Target design or implementation choice |
| `STALE-RISK` | Was true during an earlier audit but must be rechecked before execution |

A past audit result is never silently promoted to a current fact. Production state, deployed function versions, secrets, provider behavior, and migration state are all time-sensitive.

---

## 0.4 Current product boundary that must remain intact

The store-bound runtime remains:

```text
Expo React Native
  -> Supabase Auth
  -> Supabase Edge Function `mobile-api`
  -> Supabase DB / RPC / Storage / Realtime
  -> server-side AI and external providers
```

Boundary rules:

- `apps/mobile` is the customer and worker runtime.
- `supabase/functions/mobile-api` is the workflow-sensitive API boundary.
- `apps/api` remains reference, parity, admin, and support code unless Manh Tu explicitly assigns a Next.js task.
- Mobile must not call AI providers directly.
- Mobile must not store server-side secrets.
- Mobile must not bypass Edge for workflow-sensitive writes.
- Raw model output must not directly change money-impacting state.
- Existing explicit user or human confirmation gates remain mandatory.

---

# 1. Audit findings that drive the plan

## F-01 — Governance manifest drift is possible even when skill mirrors are byte-identical

Observed repository pattern:

- `.claude/skills/` is canonical and `.agents/skills/` is a generated mirror.
- `scripts/check-skills-sync.mjs` correctly checks byte parity between those directories.
- Human-facing inventories and routers can still disagree about skill counts, groups, names, or routing.
- A byte-parity check cannot prove that `AGENTS.md`, `CLAUDE.md`, trigger maps, CI, and runtime manifests describe the same Harness.

Impact:

- Coding agents can follow different tool-selection maps.
- A new skill can exist on disk but remain undiscoverable from one entry point.
- CI can report “skills in sync” while the Harness inventory is semantically inconsistent.
- Ownership and deprecation can drift without a machine-readable authority.

Required response:

- Create one machine-readable Harness manifest.
- Generate or validate all human-facing inventories from it.
- Fail CI on count, identity, group, trigger, owner, version, environment, or checksum drift.

Priority: **P1 — high governance risk, low implementation cost.**

---

## F-02 — Authentication and authorization need one explicit capability boundary

Supabase Auth establishes identity. It does not, by itself, prove that an actor may perform a particular operation on a particular resource in the present workflow state.

Risk:

- “The JWT is valid” can be confused with “this actor may perform this action.”
- Role, ownership, job participation, workflow state, and resource scope can be checked inconsistently across handlers.
- A route can authorize at ingress while a reused internal helper operates under broader assumptions.
- Service-role access can turn one missed check into cross-user access.

Required response:

- Parse authentication once at ingress.
- Build an immutable `ActorContext`.
- Resolve capabilities centrally.
- Pass a narrow `CapabilityEnvelope` into sensitive domain operations.
- Preserve RLS and guarded RPC as a second enforcement layer, not a substitute for API authorization.

Priority: **P0 — Production security boundary.**

---

## F-03 — Service-role power must be contained, measured, and justified

The Edge boundary legitimately needs privileged server access for selected operations. A service-role Supabase client bypasses RLS and therefore increases blast radius.

Risk:

- A handler-level authorization bug becomes a cross-user data-access bug.
- A privileged helper is imported from the wrong route.
- Tests use only service role and miss the real per-actor policy boundary.
- Logs record the server operation but lose the originating user actor.

Required response:

- Default to user-scoped Supabase clients where possible.
- Permit service role only inside named, reviewed privileged adapters.
- Require actor, reason, operation, resource, trace, and release identifiers for each privileged action.
- Add a static deny-list for service-role imports outside approved modules.
- Add negative tests proving the same operation fails for unauthorized actors.

Priority: **P0.**

---

## F-04 — Repository migrations and Production migration state can drift

A migration file existing in GitHub is not proof that it is active in Production. The audit found evidence that repository and Production migration inventories can diverge.

Risk:

- GitHub describes a security property that Production does not have.
- Generated database types target a schema different from the deployed schema.
- Incident investigation cannot reconstruct the active database state.
- Agents assume a migration was applied because its file exists.
- Out-of-order or manually applied SQL becomes invisible to code review.

Required response:

- Create an immutable release ledger containing the expected migration inventory.
- Compare GitHub migration inventory with each environment before promotion.
- Block unknown, missing, duplicate, or out-of-order migrations.
- Never “repair” drift by mutating Production from an audit session.
- Produce a reviewed deployment packet instead.

Priority: **P0.**

---

## F-05 — Edge Function source and deployed code need immutable release identity

Repository source, configured functions, and deployed functions can diverge without one release bundle.

Risk:

- A bug report cannot identify which source commit produced a deployed function.
- Rollback restores code but not its matching prompt, policy, migration, or environment contract.
- Different functions are deployed from different commits.
- Runtime logs cannot be joined reliably to GitHub history.

Required response:

- Build a release manifest containing Git commit SHA, function digests, prompt and policy versions, migration inventory, generated-type hash, provider configuration class, evaluation-suite version, and environment identity.
- Expose `release_id` in structured logs and health responses.
- Verify deployed digests before and after promotion.

Priority: **P0.**

---

## F-06 — RLS and RPC safety must be proven per actor, not inferred from policy presence

The repository contains substantial RLS, revocation, guarded RPC, and SQL hardening work. Policy presence alone is insufficient evidence of actor isolation.

Risk:

- Overlapping policies accidentally broaden access.
- `SECURITY DEFINER` functions bypass intended restrictions.
- Search-path or grant drift reopens protected functions.
- Tests run only as privileged roles and create false confidence.
- New tables ship with RLS disabled or incomplete policies.
- Storage and Realtime authorization drift from table authorization.

Required response:

- Maintain a table-by-table access matrix.
- Test anonymous, customer A, customer B, worker A, worker B, admin, and service role.
- Verify read, insert, update, delete, RPC, Storage, and Realtime behavior where applicable.
- Fail CI when a new exposed table lacks explicit RLS classification.
- Pin `search_path` and grants for privileged functions.

Priority: **P0.**

---

## F-07 — Environment isolation is not yet one universal invariant

The repository has local tooling and some Production-reference guards. Environment safety must cover every execution path.

Risk:

- Local demo keys are paired with a remote host.
- Integration tests silently skip or target the wrong project.
- A developer command mutates staging or Production.
- An agent reads ambiguous environment variables and chooses an unsafe default.
- Preview, staging, and Production share provider or webhook configuration accidentally.

Required response:

- Introduce one immutable environment descriptor.
- Refuse ambiguous host, project, key, and environment combinations.
- Make local the only implicit default.
- Require explicit confirmation and CI context for remote mutation.
- Redact secrets and prohibit secret values in repository artifacts.

Priority: **P0.**

---

## F-08 — Tool and skill registration need versioned capability contracts

Skills and runtime tools are discoverable through files and code, but not through one typed release contract.

Risk:

- A tool changes behavior without changing its declared version.
- Agent instructions call a tool under stale assumptions.
- A skill is mirrored correctly but routed incorrectly.
- Tool permissions are broader than the user’s current intent.
- There is no universal “deny unless declared” rule.

Required response:

- Define a manifest for every repository skill and runtime tool.
- Include stable ID, version, owner, purpose, allowed environments, input schema, output schema, side-effect class, required capability, timeout, retry class, budget class, and deprecation status.
- Deny invocation when a tool is absent from the active release manifest.
- Record manifest and tool versions in traces.

Priority: **P1.**

---

## F-09 — Prompt, charter, policy, model, tool, and schema versions are not yet one release unit

Kael behavior is the product of more than model code.

Risk:

- A prompt-only change alters behavior without a code release.
- A provider alias moves to a new model version.
- A policy update invalidates old evaluation results.
- A trace cannot reveal the exact instruction bundle used.
- Code rollback leaves a newer prompt or policy active.

Required response:

- Treat the full behavior bundle as an immutable `HarnessRelease`.
- Hash canonical prompt fragments.
- Pin model identifiers or record provider-resolved model versions.
- Version charter, forbidden-language rules, tool manifest, data schemas, and evaluation suite.
- Evaluate the exact bundle that will be promoted.

Priority: **P0.**

---

## F-10 — Traceability exists in parts but needs one end-to-end run model

A user request can cross Auth, Edge ingress, Kael stages, tools, RPCs, notifications, and provider calls.

Risk:

- Incident reconstruction requires manual log correlation.
- Cost cannot be attributed to a user action or job.
- A retry looks like separate user intent.
- A failure is logged without the stage and release that caused it.
- Redaction varies by subsystem.

Required response:

- Standardize `trace_id`, `run_id`, `turn_id`, `tool_call_id`, `job_id`, `actor_id_hash`, `release_id`, and `environment`.
- Emit structured events at each stage.
- Preserve causal parent-child links.
- Define redaction before storage.
- Provide one safe query that reconstructs a complete run.

Priority: **P1.**

---

## F-11 — Evaluation must distinguish deterministic policy checks from real model behavior

The repository has Kael evaluation commands and meaningful deterministic guards. Deterministic checks are necessary but cannot prove live provider behavior.

Risk:

- A local evaluator scores its own assumptions and reports 100%.
- One model sample hides variance.
- Tool-calling regressions pass text-only evaluation.
- Safety refusal and helpfulness are conflated.
- A prompt overfits a fixed golden set.
- Production distribution differs from synthetic cases.

Required response:

- Separate static, deterministic, simulation, live-shadow, and Production-observation evaluation layers.
- Record evaluator identity and version.
- Use repeated runs for probabilistic behavior.
- Add adversarial and counterfactual cases.
- Ratchet metrics instead of requiring an unrealistic universal 100%.
- Require both no-regression and critical-safety thresholds.

Priority: **P0 before broad prompt or model changes.**

---

## F-12 — Feedback and learning need provenance, quality, privacy, and poisoning controls

Kael has learning-oriented components and feedback concepts. Learning data must not become trusted merely because it exists.

Risk:

- Malicious or low-quality feedback poisons playbooks.
- One disputed job is treated as ground truth.
- Sensitive user data is copied into durable knowledge.
- A learning candidate loses the source event that justified it.
- Operators cannot distinguish human-approved knowledge from model-generated summaries.

Required response:

- Add immutable provenance for every learning candidate.
- Separate raw evidence, derived candidate, reviewer decision, and promoted artifact.
- Require minimum evidence and conflict checks.
- Redact or tokenize PII before durable reuse.
- Never auto-promote to canonical playbooks.
- Support revocation and downstream invalidation.

Priority: **P1.**

---

## F-13 — Budget controls need one reservation and reconciliation model

The repository contains AI spend-gate, provider-cap, and reservation concepts. Cost control must remain correct across retries, fallbacks, and concurrent calls.

Risk:

- Parallel requests overspend the same remaining budget.
- Retries charge twice without a shared reservation.
- Provider fallback bypasses the original cap.
- Estimated cost diverges from billed cost.
- A failed call leaves a reservation stuck.

Required response:

- Reserve before provider invocation.
- Reconcile actual usage after completion.
- Safely expire abandoned reservations.
- Enforce per-run, per-user, per-job, per-day, provider, and global emergency caps where appropriate.
- Include every provider attempt in one cost lineage.
- Fail closed for non-essential AI when the budget service is unavailable.

Priority: **P1.**

---

## F-14 — Retries and idempotency must be state-aware

The repository already contains retry and claim work in parts of the workflow. One universal retry policy would be unsafe.

Risk:

- Retrying payment, offer, assignment, notification, or completion duplicates side effects.
- Retrying a model call creates divergent answers for the same user intent.
- Timeout ambiguity causes a completed operation to be repeated.
- Multiple workers claim the same task under inconsistent lease semantics.

Required response:

- Classify operations as pure, read-only, idempotent-write, conditional-write, or non-repeatable.
- Require idempotency keys for external and money-impacting writes.
- Persist attempt state and provider response identity.
- Use bounded exponential backoff with jitter only where safe.
- Require reconciliation for non-repeatable operations.

Priority: **P0 for payment and workflow state; P1 elsewhere.**

---

## F-15 — Circuit breakers and graceful degradation need explicit product behavior

Provider or dependency failure must not become uncontrolled retry storms or false user promises.

Risk:

- AI provider outages amplify cost and latency.
- Map, notification, payment, or storage failures leave partial workflow state.
- A fallback model violates capability or data-region assumptions.
- The client displays success before durable completion.

Required response:

- Add dependency-specific breakers.
- Define open, half-open, and closed behavior.
- Expose degraded mode without leaking internal implementation.
- Preserve user intent for later safe continuation.
- Never degrade a money-impacting confirmation into an unconfirmed write.
- Alert on sustained breaker activation.

Priority: **P1.**

---

## F-16 — Canary and rollback must cover the full Harness release

Rolling back only source code is insufficient.

Risk:

- Code rolls back while migrations remain forward-only.
- Prompt and model bundles remain changed.
- Generated types no longer match the schema.
- Function deployment and database schema become incompatible.
- A partial multi-function rollout produces mixed behavior.

Required response:

- Use compatibility windows and expand/contract migrations.
- Shadow new behavior before user-visible canary.
- Canary by allowlisted internal actors or deterministic cohort.
- Define automated abort thresholds.
- Keep the previous complete release bundle deployable.
- Test rollback before Production promotion.

Priority: **P0 for Production releases.**

---

## F-17 — Incident response and SLO ownership need one operational contract

A mature Harness needs explicit detection, triage, containment, recovery, and learning.

Risk:

- Alerts exist without an owner or action.
- Operators do not know when to disable Kael, one tool, one provider, or one route.
- Evidence is overwritten or contains secrets.
- Recovery restores service without explaining unsafe behavior.
- The same incident recurs because the lesson never becomes a gate.

Required response:

- Define severity levels.
- Add kill switches at release, model, tool, provider, and route level.
- Create incident runbooks and evidence collection.
- Set measurable SLOs and error budgets.
- Require post-incident gate or test additions.

Priority: **P1 before public scale.**

---

## F-18 — CI needs cross-plane drift gates, not only per-package tests

Existing type, test, structure, comments, skills, database, and Edge checks are valuable. They do not alone prove GitHub-to-Supabase alignment.

Risk:

- All repository tests pass while Production runs a different function or migration set.
- Human docs disagree while mirror checks pass.
- Evaluation assets change without ratchet review.
- An environment configuration change bypasses application tests.
- Individually valid pieces form an incompatible release bundle.

Required response:

- Add a `harness:verify` meta-gate.
- Verify manifest, routers, schemas, migrations, function digests, environment identity, evaluation suite, generated types, and release ledger.
- Keep Production comparison read-only in CI unless a separate approved deployment workflow runs.
- Publish an auditable release packet.

Priority: **P0 for promotion; P1 for ordinary pull requests.**

---

# 2. Target architecture

## 2.1 Five-plane model

```text
CONTROL PLANE
  Harness manifest
  Harness release manifest
  Capability policy
  Environment registry
  Kill switches
  Deployment ledger

EXECUTION PLANE
  mobile-api ingress
  ActorContext
  CapabilityEnvelope
  Kael pipeline
  Tool adapters
  Provider adapters

DATA PLANE
  PostgreSQL
  RLS
  Guarded RPC
  Storage policies
  Realtime authorization
  Audit and lineage tables

EVALUATION PLANE
  Static policy checks
  Deterministic simulations
  Live provider evaluation
  Shadow traffic
  Production outcome metrics

OBSERVABILITY PLANE
  Structured events
  Traces
  Cost lineage
  SLO metrics
  Alerts
  Incident evidence
```

No plane may silently substitute for another:

- documentation is not authorization;
- API authorization is not a replacement for RLS;
- RLS is not a replacement for route-level workflow checks;
- unit tests are not deployment verification;
- logs are not evaluation;
- evaluation is not Production monitoring;
- monitoring is not rollback.

---

## 2.2 Core release object

Every deployable Harness state is represented by an immutable `HarnessRelease`.

```ts
type HarnessRelease = {
  releaseId: string
  gitCommitSha: string
  createdAt: string
  environmentClass: 'local' | 'preview' | 'staging' | 'production'
  mobileApiDigest: string
  edgeFunctionDigests: Record<string, string>
  migrationInventoryHash: string
  generatedTypesHash: string
  harnessManifestHash: string
  promptBundleHash: string
  charterVersion: string
  policyBundleHash: string
  toolManifestHash: string
  evalSuiteVersion: string
  modelBindings: Array<{
    purpose: string
    provider: string
    requestedModel: string
    resolvedModel?: string
    capabilityClass: string
  }>
  approvedBy: string[]
  deploymentState:
    | 'draft'
    | 'verified'
    | 'staging'
    | 'shadow'
    | 'canary'
    | 'production'
    | 'rolled_back'
}
```

Rules:

- `releaseId` is generated once and never reused.
- No mutable “latest” file is the source of truth.
- Human-readable aliases may exist, but runtime records immutable hashes.
- Production logs include `release_id`.
- Promotion changes deployment state; it does not mutate release content.
- Rollback selects a previous compatible release.
- Unknown migration or function drift makes a release ineligible for promotion.

---

## 2.3 Actor context

Authentication is parsed once into an immutable request-scoped object.

```ts
type ActorContext = {
  subjectId: string
  actorType: 'customer' | 'worker' | 'admin' | 'system'
  roles: string[]
  authSessionId?: string
  authMethod?: string
  customerId?: string
  workerId?: string
  adminId?: string
  environment: 'local' | 'preview' | 'staging' | 'production'
  traceId: string
  requestId: string
  releaseId: string
}
```

Rules:

- Domain code does not re-parse raw authorization headers.
- `subjectId` is never accepted from request JSON when it can be derived from Auth.
- Actor-specific IDs are resolved server-side.
- Logs store a stable actor hash where raw identifiers are unnecessary.
- A system actor must include an explicit machine identity and reason.
- Impersonation requires a dedicated admin capability, immutable audit record, visible operator context, and strict time limit.

---

## 2.4 Capability envelope

Sensitive operations receive a narrow, explicit authorization result.

```ts
type CapabilityEnvelope = {
  capability: string
  actor: ActorContext
  resourceType: string
  resourceId?: string
  jobId?: string
  workflowState?: string
  grantedByPolicy: string
  policyVersion: string
  constraints: Record<string, string | number | boolean>
  expiresAt: string
}
```

Invariants:

- Capabilities are denied unless declared.
- A role is an input to capability resolution, not the final authorization decision.
- Resource ownership and workflow state are checked before the envelope is granted.
- The envelope cannot be widened by downstream helpers.
- Expired envelopes are rejected.
- Privileged adapters require the envelope and preserve its actor in audit events.

---

## 2.5 Tool and skill manifest

```ts
type HarnessToolManifestEntry = {
  id: string
  version: string
  owner: string
  purpose: string
  kind: 'repository-skill' | 'runtime-tool' | 'provider-adapter' | 'operator-command'
  allowedEnvironments: Array<'local' | 'preview' | 'staging' | 'production'>
  inputSchema: string
  outputSchema: string
  sideEffectClass:
    | 'none'
    | 'read-only'
    | 'idempotent-write'
    | 'conditional-write'
    | 'non-repeatable'
  requiredCapability?: string
  timeoutMs: number
  retryClass: string
  budgetClass?: string
  dataClasses: string[]
  redactionProfile: string
  deprecated: boolean
  checksum: string
}
```

Manifest rules:

- Stable IDs never change meaning.
- Behavior-changing edits require a version change.
- Unknown tools are denied.
- Production use requires explicit environment permission.
- Every side-effecting tool declares idempotency behavior.
- Every tool declares input and output validation.
- Every trace records tool ID and version.
- Deprecated tools remain observable until all active releases stop referencing them.

---

## 2.6 End-to-end run model

```ts
type HarnessRun = {
  traceId: string
  runId: string
  requestId: string
  actorIdHash: string
  actorType: string
  releaseId: string
  environment: string
  jobId?: string
  caseWorkId?: string
  startedAt: string
  completedAt?: string
  status: 'running' | 'waiting_confirmation' | 'completed' | 'failed' | 'cancelled'
  terminalReason?: string
}
```

Every child event records:

- `trace_id`;
- `run_id`;
- `parent_event_id`;
- `stage`;
- `turn_id` when applicable;
- `tool_call_id` when applicable;
- `release_id`;
- `environment`;
- redacted actor and resource identifiers;
- attempt number;
- latency;
- cost reservation and reconciliation identifiers;
- result classification;
- error class without secrets.

---

## 2.7 Data-lineage model

Each durable derived artifact must answer:

1. Which source events produced it?
2. Which release, prompt, policy, model, and tool versions transformed it?
3. Which actor or reviewer approved it?
4. Which redaction rules were applied?
5. Which downstream artifacts depend on it?
6. Can it be revoked without losing the original audit record?

Minimum lineage entities:

- `source_event`;
- `derived_candidate`;
- `review_decision`;
- `promoted_artifact`;
- `artifact_dependency`;
- `revocation_event`.

No learning candidate becomes canonical knowledge without a human review decision.

---

## 2.8 Release ledger

The release ledger is append-only and records:

- release ID and Git commit;
- expected migration inventory;
- generated-type checksum;
- Edge Function digests;
- prompt, charter, policy, model, tool, and evaluation versions;
- environment identity;
- verification evidence;
- approvers;
- deployment timestamps;
- shadow and canary results;
- rollback target;
- incident links.

The ledger does not store secrets. It stores secret names, configuration classes, or externally managed version references where needed.

---

# 3. Non-negotiable invariants

The implementation is incomplete until these invariants are enforced by code, database policy, CI, or release workflow—not only by prose.

1. **Environment identity is explicit.** Local is the only implicit default.
2. **Production mutation is never an audit side effect.**
3. **Identity is derived from Auth, not request payload.**
4. **Authorization is capability-based and resource-scoped.**
5. **Service role is contained in approved privileged adapters.**
6. **RLS remains enabled for exposed user data.**
7. **Guarded RPCs pin grants and `search_path`.**
8. **Mobile cannot call AI providers directly.**
9. **Mobile cannot hold server secrets.**
10. **Workflow-sensitive writes pass through Edge.**
11. **Raw model output cannot directly mutate money-impacting state.**
12. **Offers, worker proposals, scope changes, completion, and payment retain explicit confirmation gates.**
13. **Every deployed behavior maps to one immutable release ID.**
14. **Every trace records environment and release ID.**
15. **Unknown tools and capabilities are denied.**
16. **Every side-effecting operation has an idempotency classification.**
17. **Payment and external writes use durable idempotency keys.**
18. **Retries are bounded and operation-specific.**
19. **Budget is reserved before provider use and reconciled afterward.**
20. **Learning artifacts preserve immutable provenance.**
21. **PII is redacted before durable reuse.**
22. **Canonical playbooks are never auto-promoted by a model.**
23. **Production promotion requires GitHub-to-environment drift checks.**
24. **Rollback targets the complete compatible release bundle.**
25. **A green deterministic evaluator is not reported as live-model proof.**
26. **A skipped integration test is visible and justified.**
27. **Every Production-impacting alert has an owner and runbook.**
28. **No secret value appears in logs, traces, release packets, or repository artifacts.**
29. **No release is declared Production-ready while a required gate is unrun or red.**
30. **No agent claims completion without naming what was and was not verified.**

---

# 4. Workstreams

## Workstream A — One authoritative Harness manifest

### Goal

Make repository skills, runtime tools, human routers, CI checks, owners, and release identity derive from one authoritative inventory.

### Proposed artifacts

```text
config/harness/manifest.schema.json
config/harness/manifest.json
scripts/harness/check-manifest.mjs
scripts/harness/render-inventory.mjs
scripts/harness/hash-manifest.mjs
```

### Required fields

- stable ID;
- version;
- group;
- owner;
- purpose;
- trigger;
- canonical path;
- mirrored path where applicable;
- environment permission;
- side-effect class;
- capability requirement;
- schema references;
- timeout and retry class;
- checksum;
- deprecation state.

### Gates

- every canonical skill appears exactly once;
- every mirror entry matches its canonical source;
- every human router count and group is consistent;
- no manifest path is missing;
- no undeclared runtime tool is registered;
- no deprecated entry is referenced by an active release;
- checksums are deterministic across operating systems.

### Done when

`pnpm harness:manifest:check` fails on semantic drift, not only byte drift.

---

## Workstream B — Actor context and centralized capability authorization

### Goal

Make every sensitive route prove identity, capability, resource scope, and workflow state before domain execution.

### Proposed structure

```text
supabase/functions/mobile-api/_shared/http/auth/
  parse-auth.ts
  actor-context.ts
  capability-resolver.ts
  capability-envelope.ts
  authorization-errors.ts

supabase/functions/mobile-api/_shared/policy/
  capabilities.ts
  resource-rules.ts
  workflow-rules.ts
```

### Implementation rules

- Parse JWT once.
- Reject ambiguous or incomplete actor mapping.
- Resolve customer, worker, or admin records server-side.
- Do not accept role elevation from request data.
- Separate authentication errors from authorization denials.
- Do not reveal cross-user resource existence through error differences.
- Pass the smallest capability envelope required by the operation.
- Preserve actor context through every privileged call.

### Required tests

- missing token;
- malformed token;
- expired token;
- valid customer on own resource;
- valid customer on another customer’s resource;
- worker before assignment;
- worker after assignment;
- worker after removal or job closure;
- admin without required capability;
- system actor without reason;
- stale capability envelope;
- capability valid for wrong resource;
- resource valid but workflow state invalid.

### Done when

Sensitive handlers cannot compile or execute without the appropriate capability boundary, and negative authorization cases are tested.

---

## Workstream C — Service-role containment

### Goal

Reduce privileged access to a small, reviewable set of modules and preserve the original actor through each action.

### Proposed structure

```text
supabase/functions/mobile-api/_shared/platform/privileged/
  service-client.ts
  privileged-operation.ts
  audit-privileged-operation.ts
  allowlist.ts
```

### Rules

- No route handler imports the service client directly.
- Every privileged operation has a stable operation ID.
- Every operation declares required capability and permitted resource class.
- Every call emits actor, reason, trace, release, environment, operation, resource, and result.
- Sensitive parameters are redacted before logging.
- A static check blocks service-role imports outside approved paths.

### Test requirements

- import-boundary test;
- unauthorized actor denial;
- actor preservation in audit event;
- resource mismatch denial;
- missing reason denial;
- missing trace or release identity denial;
- service-role action succeeds only through approved adapter.

### Done when

A repository search finds no direct service-role client usage outside the allowlisted boundary.

---

## Workstream D — RLS, RPC, Storage, and Realtime assurance

### Goal

Turn policy presence into actor-by-actor proof.

### Required access-matrix columns

| Surface | Resource | Anonymous | Customer owner | Other customer | Assigned worker | Other worker | Admin capability | Service role |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| Table | read | | | | | | | |
| Table | insert | | | | | | | |
| Table | update | | | | | | | |
| Table | delete | | | | | | | |
| RPC | execute | | | | | | | |
| Storage | read/write/delete | | | | | | | |
| Realtime | subscribe | | | | | | | |

### Static checks

- all exposed tables have RLS explicitly enabled;
- all policies have intentional role and command scope;
- privileged functions set a safe `search_path`;
- public or anonymous grants are allowlisted;
- `SECURITY DEFINER` functions have explicit owners and execute grants;
- new migrations cannot silently broaden existing grants;
- Storage buckets have explicit access classification;
- Realtime publication changes are reviewed.

### Dynamic checks

Run each relevant operation as:

- anonymous;
- customer A;
- customer B;
- worker A;
- worker B;
- admin with capability;
- admin without capability;
- service role.

### Done when

The matrix is executable and CI fails on missing classifications or unexpected access.

---

## Workstream E — Environment identity and secret safety

### Goal

Prevent any command, test, agent, or deployment process from silently selecting a remote environment.

### Proposed environment descriptor

```ts
type EnvironmentDescriptor = {
  class: 'local' | 'preview' | 'staging' | 'production'
  supabaseProjectRef: string
  supabaseUrl: string
  expectedKeyClass: 'local-demo' | 'publishable' | 'service-role-reference'
  mutationAllowed: boolean
  requiresHumanApproval: boolean
  providerConfigurationClass: string
  webhookConfigurationClass: string
}
```

### Rules

- Local is the only implicit default.
- Remote mutation requires an explicit environment class and project reference.
- Production mutation requires an approved deployment workflow and human confirmation.
- A local demo key with a remote host is rejected.
- A Production project reference in an ordinary test is rejected.
- Missing environment identity is a hard error for remote operations.
- Secret values never enter release manifests.
- Environment examples contain names only, never real values.

### Required tests

- no variables -> local;
- local host + local key -> allowed;
- local key + remote host -> denied;
- staging host + staging identity -> allowed only in approved context;
- Production ref in ordinary integration test -> denied;
- Production mutation without approval -> denied;
- mismatched project ref and URL -> denied;
- missing project identity for remote host -> denied.

### Done when

Every database, Edge, integration, provider, and operator path uses the same descriptor and fails closed on ambiguity.

---

## Workstream F — Migration inventory and deployment drift

### Goal

Make GitHub, generated types, local verification, staging, and Production migration state comparable and auditable.

### Proposed commands

```text
pnpm harness:migrations:inventory
pnpm harness:migrations:check-local
pnpm harness:migrations:check-staging
pnpm harness:migrations:check-production-readonly
pnpm harness:types:hash
```

### Release packet must include

- ordered migration filenames;
- per-file checksum;
- aggregate migration inventory hash;
- environment migration history;
- unknown or missing migration report;
- generated database type hash;
- local reset result;
- SQL verification result;
- forward-compatibility and rollback notes.

### Rules

- Audit sessions are read-only against Production.
- Unknown Production migrations block promotion.
- Missing Production migrations block promotion.
- Duplicate timestamps or identifiers block promotion.
- Modified historical migration files block promotion.
- Corrective changes use new migrations.
- Expand/contract is required for schema changes spanning multiple releases.

### Done when

A reviewer can compare one release manifest with one environment and identify exact drift without reading raw logs manually.

---

## Workstream G — Edge Function release identity and deployed digest verification

### Goal

Prove which source bundle is deployed for every Edge Function.

### Required artifacts

```text
scripts/harness/hash-edge-functions.mjs
scripts/harness/build-release-manifest.mjs
scripts/harness/verify-deployed-functions.mjs
supabase/functions/_shared/release.ts
```

### Digest inputs

- function source files;
- shared imported source;
- function-specific `deno.json` or equivalent config;
- import maps and lockfiles where applicable;
- prompt and policy assets loaded by the function;
- generated contracts required at runtime.

### Runtime behavior

- health response exposes non-secret release ID and function digest;
- every structured event includes release ID;
- mixed-release function sets are detectable;
- startup refuses an invalid or incomplete release manifest in staging and Production.

### Done when

The deployed function digest can be matched to one Git commit and one complete Harness release.

---

## Workstream H — Structured tracing, audit, and cost lineage

### Goal

Reconstruct one complete request without joining unrelated free-text logs manually.

### Event classes

- request accepted;
- authentication resolved;
- capability granted or denied;
- workflow state loaded;
- Kael stage entered and exited;
- model request reserved;
- provider attempt started and completed;
- tool call started and completed;
- RPC or privileged operation executed;
- user confirmation requested and received;
- notification requested and delivered;
- budget reconciled;
- run completed, failed, cancelled, or suspended.

### Privacy rules

- never log authorization headers, API keys, service-role values, payment secrets, or raw provider credentials;
- hash actor identifiers when raw values are unnecessary;
- tokenize or redact addresses, phone numbers, and free-form sensitive text;
- separate operator-visible summaries from restricted evidence;
- define retention by event class;
- preserve immutable security-audit events longer than verbose diagnostic payloads.

### Done when

One safe query reconstructs sequence, release, actor class, policy, tool versions, attempts, cost, and terminal result for a run.

---

## Workstream I — Layered evaluation and adversarial testing

### Goal

Measure both deterministic correctness and probabilistic model behavior without confusing them.

### Evaluation layers

#### Layer 1 — Static

- schema compatibility;
- forbidden direct-provider imports;
- forbidden service-role imports;
- environment guard presence;
- tool-manifest completeness;
- prompt and policy checksum consistency;
- RLS classification completeness.

#### Layer 2 — Deterministic

- workflow state transitions;
- authorization matrix;
- price and payment gates;
- tool argument validation;
- idempotency behavior;
- budget reservation logic;
- safe refusal rules;
- language-mode consistency.

#### Layer 3 — Simulation

- synthetic multi-turn jobs;
- missing or contradictory information;
- worker unavailability;
- scope changes;
- provider errors;
- timeout and retry paths;
- dispute and completion flows.

#### Layer 4 — Live provider evaluation

- repeated samples per case;
- pinned or resolved model identity;
- tool-use success;
- groundedness;
- confirmation-gate compliance;
- unsafe action rate;
- unsupported-claim rate;
- cost and latency distribution.

#### Layer 5 — Shadow and Production observation

- shadow comparison without user-visible effects;
- sampled review of real, redacted distributions;
- outcome and escalation metrics;
- drift monitoring by release and model binding.

### Adversarial suites

- prompt injection in user text;
- tool-output injection;
- malicious attachments or evidence metadata;
- cross-job data requests;
- identity confusion;
- price manipulation;
- worker impersonation;
- urgency pressure to skip confirmation;
- attempts to reveal hidden instructions or secrets;
- malicious feedback intended to poison learning;
- multilingual ambiguity and mixed-language leakage;
- repeated retries designed to exhaust budgets.

### Metric policy

- Critical safety gates are hard thresholds.
- Quality metrics use no-regression and ratchet thresholds.
- Probabilistic metrics require repeated runs and confidence intervals.
- A model or prompt change cannot use the same tiny fixed suite as its sole evidence.
- Evaluation reports name untested states explicitly.

### Done when

A release report clearly separates deterministic proof, live provider evidence, shadow evidence, and Production observation.

---

## Workstream J — Learning provenance and poisoning resistance

### Goal

Allow Kael to improve without turning arbitrary user feedback or model summaries into trusted policy.

### Candidate lifecycle

```text
raw source event
  -> redacted evidence package
  -> derived learning candidate
  -> conflict and quality checks
  -> human review decision
  -> versioned promoted artifact
  -> monitored downstream use
  -> optional revocation
```

### Required controls

- immutable source references;
- source-quality classification;
- dispute and fraud flags;
- minimum independent evidence;
- reviewer identity and rationale;
- PII redaction status;
- model and prompt version that produced the candidate;
- conflict detection against existing playbooks;
- expiry or review date;
- downstream dependency tracking;
- revocation and invalidation.

### Poisoning defenses

- rate-limit influence from one actor or one job;
- do not treat ratings as objective truth without context;
- exclude unresolved disputes from promotion evidence;
- separate worker, customer, support, and system evidence;
- flag coordinated or repeated patterns;
- use holdout evaluation before promotion;
- require manual approval for canonical playbooks;
- support emergency removal without deleting audit history.

### Done when

Every promoted learning artifact can be traced to evidence and reviewer approval and can be revoked safely.

---

## Workstream K — Budget, retry, idempotency, and circuit-breaker reliability

### Goal

Make failures bounded, recoverable, and economically controlled.

### Operation classes

| Class | Example | Automatic retry |
|---|---|---|
| Pure | deterministic transformation | Yes, bounded |
| Read-only | database read | Yes, bounded if safe |
| Idempotent write | upsert with durable key | Yes, bounded |
| Conditional write | state transition with expected version | Only after state reload |
| Non-repeatable | payment or external irreversible action | No blind retry; reconcile |

### Budget lifecycle

```text
estimate
  -> reserve
  -> provider attempt(s)
  -> actual usage capture
  -> reconcile
  -> release unused amount
  -> expire abandoned reservation if needed
```

### Required reliability controls

- per-operation timeout;
- retry classification in tool manifest;
- bounded exponential backoff with jitter;
- durable idempotency key for side effects;
- optimistic concurrency or expected-state checks;
- provider attempt identity;
- circuit breaker by dependency and error class;
- safe degraded mode;
- dead-letter or manual reconciliation path where needed;
- alerting on repeated failure and reservation leakage.

### Done when

Chaos tests show no duplicate money-impacting state, no unbounded retry loop, no budget bypass through fallback, and no silent partial success.

---

## Workstream L — Canary, rollback, incident response, and SLOs

### Goal

Promote and recover the full release bundle safely.

### Promotion stages

```text
draft
  -> repository verified
  -> local integration verified
  -> staging verified
  -> live shadow
  -> internal canary
  -> limited Production cohort
  -> full Production
```

### Automatic abort examples

- critical authorization or RLS failure;
- confirmation-gate violation;
- duplicate external side effect;
- unexpected Production migration drift;
- release or function digest mismatch;
- severe error-rate or latency regression;
- provider cost above approved threshold;
- unsafe-action or unsupported-claim rate above threshold;
- sustained circuit-breaker activation;
- trace or audit loss above threshold.

### Kill-switch levels

- whole Kael release;
- model binding;
- provider adapter;
- runtime tool;
- route or capability;
- learning promotion;
- non-essential AI use;
- external side-effect integration.

### Done when

The previous compatible release can be selected quickly, the rollback procedure has been rehearsed, and operators know which switch contains each failure class.

---

# 5. Twelve-pull-request execution roadmap

Each PR must be small enough to review deeply. No PR may combine unrelated architecture, schema, provider, and UI changes merely to finish faster.

## PR-01 — Harness manifest truth and semantic drift gate

### Scope

- Add machine-readable Harness manifest and schema.
- Register all existing repository skills and runtime tools.
- Add semantic validation for IDs, versions, owners, paths, groups, triggers, checksums, and environments.
- Keep the existing byte-parity check.
- Add a report that identifies human-router drift.

### Expected files

```text
config/harness/manifest.json
config/harness/manifest.schema.json
scripts/harness/check-manifest.mjs
scripts/harness/hash-manifest.mjs
package.json
```

Locked router edits require explicit approval at execution time.

### Verification

- manifest schema validation;
- duplicate ID test;
- missing path test;
- checksum drift test;
- human-router count drift test;
- `pnpm skills:check`;
- `pnpm lint:structure`;
- `pnpm lint:comments`.

### Rollback

Remove the new manifest gate; existing skill parity remains intact.

### Exit condition

One command proves semantic inventory consistency.

---

## PR-02 — Universal environment descriptor and remote-mutation guard

### Scope

- Create shared environment descriptor.
- Route database, integration, Edge, and provider helpers through it.
- Make local the only implicit default.
- Reject mismatched host, project, key class, and environment.
- Add explicit Production-reference deny tests.

### Verification

- local default case;
- local-key/remote-host rejection;
- Production-reference rejection;
- staging explicit-context case;
- missing remote identity rejection;
- no secret values in output.

### Rollback

Restore previous helpers while retaining deny tests until an equivalent guard exists.

### Exit condition

No tested command can select Production implicitly.

---

## PR-03 — ActorContext and capability policy foundation

### Scope

- Parse Auth once at `mobile-api` ingress.
- Introduce immutable actor context.
- Define capability registry and envelope.
- Migrate a small, representative set of sensitive routes first.
- Preserve existing behavior and confirmation gates.

### Verification

- customer, worker, admin, and system actor tests;
- own-resource and cross-resource denial;
- wrong-workflow-state denial;
- stale-envelope denial;
- route compatibility tests.

### Rollback

Feature-flag new authorization path per migrated route; revert routes without changing database schema.

### Exit condition

Representative routes use one capability model with negative tests.

---

## PR-04 — Service-role containment and privileged-operation audit

### Scope

- Create approved privileged adapter boundary.
- Move direct service-role access behind it.
- Add static import enforcement.
- Preserve actor, reason, trace, release, and resource in audit events.

### Verification

- forbidden import fixture fails;
- approved import passes;
- unauthorized actor cannot trigger privileged operation;
- audit event contains required identifiers;
- secrets are redacted.

### Rollback

Revert adapters and import gate together; do not leave partial import restrictions.

### Exit condition

No direct service-role client remains outside approved modules.

---

## PR-05 — Executable RLS/RPC/Storage/Realtime access matrix

### Scope

- Inventory exposed tables, RPCs, buckets, and Realtime surfaces.
- Add actor-by-actor SQL or integration verification.
- Add static policy and grant checks.
- Ratchet new surfaces into explicit classification.

### Verification

- anonymous denial where expected;
- owner access;
- cross-customer denial;
- assigned-worker access;
- unrelated-worker denial;
- admin capability distinction;
- privileged function search-path and grant checks.

### Rollback

Tests and matrix can be reverted independently; security hardening migrations require forward corrective migrations rather than history edits.

### Exit condition

Policy behavior is proven per actor for all classified critical surfaces.

---

## PR-06 — Migration inventory, generated-type hash, and release ledger

### Scope

- Build ordered migration inventory and checksums.
- Add generated-type hashing.
- Add append-only release-ledger schema or artifact design.
- Add read-only environment comparison.
- Block modified historical migrations.

### Verification

- local reset from empty database;
- SQL verification suite;
- duplicate migration fixture;
- modified historical migration fixture;
- unknown environment migration fixture;
- type hash stability.

### Rollback

Ledger schema changes use forward migrations. CI comparison can be disabled separately only with documented incident approval.

### Exit condition

A release packet shows exact schema and type identity.

---

## PR-07 — Edge Function digests and immutable HarnessRelease

### Scope

- Build function digests from source and config dependencies.
- Define immutable release manifest.
- Expose release ID and digest through safe health metadata.
- Emit release ID in structured logs.
- Add mixed-release detection.

### Verification

- source edit changes digest;
- shared dependency edit changes dependent function digest;
- unrelated file does not change digest;
- incomplete manifest is rejected in staging/Production mode;
- health response contains no secrets.

### Rollback

Runtime can temporarily tolerate an absent manifest only in local mode. Remote modes remain fail-closed after promotion.

### Exit condition

Every deployed function maps to one release and one Git commit.

---

## PR-08 — End-to-end tracing, audit, and cost lineage

### Scope

- Standardize identifiers and event schema.
- Instrument ingress, authorization, Kael stages, tools, providers, RPCs, and terminal states.
- Add redaction profiles.
- Join budget reservation and reconciliation to the same run.
- Add a safe run-reconstruction query.

### Verification

- one synthetic run reconstructs in order;
- retry attempts remain children of one intent;
- actor raw identifiers are absent where not required;
- secret scanner passes trace fixtures;
- cost totals reconcile.

### Rollback

Instrumentation is additive. Event schema changes must remain backward-readable during the retention window.

### Exit condition

One trace explains sequence, policy, release, tools, cost, and result.

---

## PR-09 — Evaluation taxonomy, repeated live eval, and release ratchets

### Scope

- Separate deterministic and live-provider reports.
- Version the evaluation suite and evaluators.
- Add repeated-sample support.
- Add adversarial and counterfactual cases.
- Define critical hard gates and non-critical ratchets.

### Verification

- deterministic suite cannot label itself live;
- one failing critical case blocks release;
- repeated run report includes variance;
- model and prompt versions are captured;
- tool-call correctness is measured separately from text quality.

### Rollback

Keep prior evaluation suite version available; do not delete historical results.

### Exit condition

A reviewer can see exactly what kind of evidence supports each claim.

---

## PR-10 — Learning provenance, review, revocation, and poisoning controls

### Scope

- Add immutable provenance model.
- Separate evidence, candidate, review, and promotion.
- Add conflict, dispute, quality, and privacy gates.
- Add revocation and dependency invalidation.
- Prevent automatic canonical promotion.

### Verification

- candidate without source is rejected;
- unresolved dispute blocks promotion;
- missing redaction blocks durable reuse;
- model-generated summary is distinguishable from human approval;
- revoked artifact no longer feeds active releases.

### Rollback

Promotion can be disabled globally while preserving evidence and audit history.

### Exit condition

No canonical learning artifact exists without provenance and approval.

---

## PR-11 — Unified budget, idempotency, retry, and circuit-breaker controls

### Scope

- Normalize operation classifications.
- Connect budget reservation to provider attempts and reconciliation.
- Add durable idempotency for external side effects.
- Add dependency-specific circuit breakers.
- Define degraded-mode responses.

### Verification

- concurrent budget reservation test;
- retry does not double-charge;
- fallback stays under original cap;
- abandoned reservation expires;
- duplicate payment or notification request does not duplicate side effect;
- breaker opens, probes half-open, and closes correctly;
- degraded mode never bypasses confirmation.

### Rollback

Controls are introduced behind server-side configuration. Money-impacting idempotency cannot be disabled after data begins depending on it without an explicit migration plan.

### Exit condition

Failure is bounded in attempts, cost, state, and user-visible claims.

---

## PR-12 — Promotion controller, canary, rollback, incident runbooks, and SLOs

### Scope

- Assemble the full release packet.
- Add staging, shadow, and canary promotion states.
- Define automatic abort thresholds.
- Add kill switches.
- Add rollback rehearsal and incident runbooks.
- Publish SLOs and owner mapping.

### Verification

- staging promotion with matching release;
- drift blocks promotion;
- canary abort simulation;
- kill switch by tool and provider;
- rollback to previous compatible release;
- incident evidence contains no secrets;
- SLO alert maps to an owner and runbook.

### Rollback

The controller itself must support returning to the previous release without requiring the failing release to operate.

### Exit condition

The team can prove how a release is promoted, observed, aborted, and recovered.

---

# 6. CI and verification design

## 6.1 Existing commands to preserve

The implementation must preserve and continue to run the relevant existing gates, including:

```text
pnpm skills:check
pnpm lint:structure
pnpm lint:comments
pnpm type-check
pnpm test
pnpm type-check:mobile
pnpm test:mobile
pnpm type-check:api
pnpm test:api
pnpm type-check:shared
pnpm test:shared
pnpm db:local:doctor
pnpm db:local:up
pnpm db:local:reset
pnpm db:local:test
pnpm db:local:lint
pnpm db:local:diff
pnpm edge:check
```

A command is reported as verified only when it actually ran in the execution environment and its real result is recorded.

---

## 6.2 Proposed Harness commands

These names are targets, not claims that the commands already exist:

```text
pnpm harness:manifest:check
pnpm harness:env:check
pnpm harness:auth:check
pnpm harness:service-role:check
pnpm harness:rls:check
pnpm harness:migrations:inventory
pnpm harness:migrations:check-local
pnpm harness:migrations:check-staging
pnpm harness:migrations:check-production-readonly
pnpm harness:functions:hash
pnpm harness:release:build
pnpm harness:release:verify
pnpm harness:trace:check
pnpm harness:eval:deterministic
pnpm harness:eval:live
pnpm harness:learning:check
pnpm harness:reliability:check
pnpm harness:verify
```

---

## 6.3 Pull-request gate

Ordinary PRs touching the Harness run:

1. manifest validation;
2. structure and comment hygiene;
3. affected type checks and tests;
4. static authorization and privileged-import checks;
5. environment guard tests;
6. migration history integrity;
7. affected function digest calculation;
8. deterministic evaluation for affected behavior;
9. generated artifact drift check;
10. release-manifest dry run.

Live-provider evaluation is required when prompt, model, tool routing, or provider behavior changes. It is not required for an unrelated documentation-only change.

---

## 6.4 Promotion gate

Promotion requires:

1. exact Git commit selected;
2. clean repository state;
3. complete immutable release manifest;
4. passing affected tests and static gates;
5. local database reset and SQL verification when schema changes;
6. staging migration inventory match;
7. staging function digest match;
8. staging end-to-end smoke path;
9. live-provider evaluation for affected behavior;
10. shadow or canary evidence where required;
11. read-only Production drift check;
12. explicit human approval;
13. rollback target selected and verified;
14. release packet archived.

No deployment tool should infer approval from the mere presence of CI credentials.

---

# 7. Required test matrix

## 7.1 Identity and authorization

- anonymous user;
- valid customer;
- second customer;
- valid worker;
- second worker;
- worker before assignment;
- worker after assignment;
- worker after job completion;
- admin with capability;
- admin without capability;
- system actor with reason;
- system actor without reason;
- expired or malformed token;
- stale capability envelope;
- wrong resource;
- wrong workflow state.

---

## 7.2 Database and policy

- table read, insert, update, delete;
- guarded RPC execute;
- `SECURITY DEFINER` grant and search-path behavior;
- Storage read, write, delete;
- Realtime subscription;
- cross-customer isolation;
- cross-worker isolation;
- admin capability distinction;
- service-role audit preservation;
- RLS enabled on new exposed table;
- policy overlap regression;
- historical migration immutability.

---

## 7.3 Kael workflow

- Basic Intake to quote-ready Case Work;
- one focused question per turn;
- insufficient evidence;
- contradictory evidence;
- unsupported service attempt;
- offer confirmation;
- proposed-worker confirmation;
- scope-change confirmation;
- completion confirmation;
- payment confirmation;
- worker unavailable;
- matching timeout and retry;
- dispute;
- cancellation;
- provider outage;
- tool outage;
- budget exhausted;
- degraded mode;
- resume after interruption.

---

## 7.4 Reliability and concurrency

- duplicate client request;
- duplicate webhook;
- timeout after external success;
- retry after conditional write conflict;
- concurrent worker claims;
- concurrent budget reservations;
- provider fallback;
- circuit breaker open and half-open;
- notification retry;
- abandoned run cleanup;
- stuck reservation expiry;
- partial dependency failure;
- rollback during active traffic.

---

## 7.5 Security and adversarial behavior

- prompt injection;
- tool-output injection;
- hidden-instruction extraction;
- secret extraction;
- cross-job data exfiltration;
- role or identity spoofing;
- price manipulation;
- confirmation bypass pressure;
- malicious file metadata;
- poisoned feedback;
- repeated cost-exhaustion attempts;
- multilingual policy bypass;
- malformed structured output;
- oversized input;
- replayed signed request where applicable.

---

# 8. Production promotion runbook

## Phase 1 — Select and freeze

- Select exact Git commit.
- Confirm branch and repository.
- Confirm no uncommitted or unrelated changes.
- Generate release ID.
- Build function, prompt, policy, tool, migration, type, and evaluation hashes.
- Freeze the release object.

Stop if any release input is mutable or unresolved.

---

## Phase 2 — Repository verification

- Run manifest, environment, authorization, privileged-import, migration-history, type, test, Edge, and deterministic evaluation gates.
- Run live-provider evaluation when affected.
- Record real command output and untested states.

Stop on any required red gate or skipped critical check.

---

## Phase 3 — Local integration

- Confirm available local resources.
- Start the local Supabase stack through approved tooling.
- Reset from an empty database.
- Run all SQL verification.
- Generate database types and compare hashes.
- Run affected Edge checks and integration flows.

Stop if local reset cannot reproduce the schema.

---

## Phase 4 — Staging

- Verify staging environment identity.
- Compare migration inventory before mutation.
- Apply only reviewed migration packet.
- Deploy exact function release.
- Verify deployed digests.
- Run staging smoke, actor-matrix, workflow, and provider checks.
- Confirm rollback target remains deployable.

Stop on drift, mixed release, or unexplained result.

---

## Phase 5 — Shadow

- Route approved shadow cases to the new release without user-visible side effects.
- Compare decisions, tool calls, latency, cost, refusal, and confirmation behavior.
- Preserve privacy and avoid duplicating external writes.

Stop if critical metrics regress.

---

## Phase 6 — Canary

- Select deterministic internal or allowlisted cohort.
- Set time, request, cost, and error limits.
- Enable automatic abort thresholds.
- Monitor release-specific metrics and traces.

Stop or roll back on critical threshold breach.

---

## Phase 7 — Full promotion

- Record explicit approval.
- Promote the immutable release.
- Verify health metadata and digests.
- Monitor elevated metrics for the defined observation window.
- Archive the final release packet.

Promotion is incomplete until post-deploy verification passes.

---

# 9. Rollback matrix

| Failure | First containment | Rollback target | Data action |
|---|---|---|---|
| Model quality regression | Disable model binding or route | Prior Harness release | No destructive data change |
| Unsafe tool behavior | Disable tool ID | Prior tool manifest/release | Preserve audit evidence |
| Provider outage | Open breaker; degraded mode | Alternate approved binding or prior release | Reconcile reservations |
| Authorization regression | Disable affected route/capability | Prior compatible release | Audit affected access |
| RLS regression | Contain route and access | Forward corrective migration | Never edit historical migration |
| Edge Function defect | Route/release kill switch | Prior function bundle | Verify schema compatibility |
| Migration incompatibility | Stop promotion | Prior compatible code within expand/contract window | Forward corrective migration |
| Duplicate external side effect | Disable integration | Prior release | Reconcile with provider and idempotency ledger |
| Cost runaway | Disable non-essential AI/provider | Prior budget policy/release | Reconcile reservations and billing |
| Trace or audit loss | Stop promotion or affected route | Prior observable release | Preserve available evidence |
| Learning poisoning | Disable promotion and artifact | Prior knowledge artifact | Revoke and invalidate dependents |

Rollback rules:

- Never delete incident evidence to make the system look clean.
- Never rewrite migration history.
- Never assume code rollback reverses schema or external side effects.
- Never roll back to a release whose manifest cannot be reconstructed.
- Confirm user-visible state after rollback.

---

# 10. Incident response model

## Severity levels

### SEV-0 — Immediate existential or legal risk

Examples:

- widespread secret exposure;
- confirmed cross-user private-data exposure;
- uncontrolled money movement;
- destructive Production mutation;
- inability to stop the affected system.

Action: disable affected Production capability immediately, preserve evidence, rotate secrets where required, and escalate to owner.

### SEV-1 — Critical Production safety or transaction risk

Examples:

- authorization bypass;
- confirmation-gate bypass;
- duplicate payment-impacting action;
- active learning poisoning reaching canonical behavior;
- broad incorrect worker or customer state mutation.

Action: kill affected release, route, tool, or provider; begin rollback and impact analysis.

### SEV-2 — Major reliability or quality degradation

Examples:

- elevated failure rate;
- sustained provider outage;
- severe latency;
- budget overrun without money-state corruption;
- widespread incorrect but reversible guidance.

Action: enter degraded mode, open circuit breaker, or roll back according to threshold.

### SEV-3 — Limited or non-critical defect

Examples:

- isolated quality regression;
- incomplete trace field;
- one non-critical evaluation regression;
- minor operator workflow issue.

Action: triage, contain if needed, and schedule corrective work.

---

## Incident sequence

1. detect;
2. assign severity and owner;
3. preserve evidence;
4. contain using the narrowest kill switch;
5. stop unsafe retries or promotions;
6. select compatible rollback or degraded mode;
7. verify recovery from user and system perspective;
8. determine affected actors, jobs, releases, and data;
9. communicate factual status without speculation;
10. add a test, gate, policy, or runbook improvement before closure.

---

# 11. Initial SLO proposal

These are starting targets to validate with real traffic; they are not claims about current performance.

## Availability and correctness

- `mobile-api` successful response SLO for valid supported requests: **99.9% monthly**, excluding explicit planned maintenance and upstream outages handled by defined degraded mode.
- Critical authorization false-allow target: **0**.
- Money-impacting duplicate-side-effect target: **0**.
- Confirmation-gate violation target: **0**.
- Release-to-trace identity coverage: **100%** in staging and Production.
- Privileged-operation actor/reason audit coverage: **100%**.

## Latency

- Non-model API p95: establish baseline, then ratchet.
- First visible Kael progress signal p95: establish baseline by device and network class.
- Full Kael turn p95: separate provider latency from internal latency.
- Do not hide a latency regression by increasing client timeout without review.

## Evaluation and quality

- Critical safety suite: **100% required** for the exact promoted release.
- Tool argument schema validity: **100%**.
- Unsupported factual or workflow claim rate: ratcheted downward by release.
- Human escalation rate: monitored by service and workflow stage, not minimized blindly.

## Observability

- Trace reconstruction success: **>= 99.9%** for sampled completed runs.
- Cost reconciliation coverage: **>= 99.9%** of provider attempts.
- Alert-to-owner mapping: **100%** for Production alerts.

Error-budget policy:

- Exhausted error budget freezes non-essential capability expansion.
- Critical security or money-state incidents override ordinary error-budget math and stop promotion immediately.

---

# 12. Threat model summary

## Assets

- customer and worker identity;
- addresses, media, chat, and case evidence;
- job and payment state;
- provider credentials and service-role secrets;
- prompts, policies, and internal instructions;
- learning artifacts and playbooks;
- audit and release evidence;
- budget and billing records.

## Adversaries and failure sources

- unauthenticated external attacker;
- malicious customer or worker;
- compromised account;
- malicious or compromised provider/tool output;
- accidental operator error;
- misconfigured CI or environment;
- buggy model or prompt release;
- poisoned feedback;
- stale or drifted deployment;
- over-privileged internal helper.

## Primary trust boundaries

- mobile client to Supabase Auth;
- mobile client to `mobile-api`;
- user-scoped Edge client to database;
- privileged Edge adapter to service-role database client;
- Kael runtime to provider adapters;
- provider output to tool execution;
- GitHub source to deployment workflow;
- deployment workflow to Supabase environment;
- raw evidence to promoted learning artifact;
- operator console to kill switches and privileged actions.

## Required mitigations

- deny-by-default capability policy;
- RLS and guarded RPC;
- strict structured-output validation;
- tool allowlisting and versioning;
- environment guards;
- immutable release identity;
- provenance and redaction;
- idempotency and reconciliation;
- budgets and breakers;
- adversarial evaluation;
- canary and rollback;
- immutable audit events.

---

# 13. Data handling, privacy, and retention

## Data classes

- public product configuration;
- internal operational metadata;
- pseudonymous actor identifiers;
- personal information;
- sensitive job evidence;
- payment-related metadata;
- secrets and credentials;
- security-audit evidence;
- derived learning artifacts.

## Rules

- Collect only data required for the supported workflow.
- Separate raw evidence from derived summaries.
- Redact before sending data to providers where full detail is unnecessary.
- Record which provider and region class processed each data class.
- Do not include secret values in model context.
- Do not store raw chain-of-thought.
- Store concise decision rationale, evidence references, tool results, and policy outcomes instead.
- Define retention per event and evidence class.
- Support account-deletion and legal-retention requirements without destroying mandatory security audit evidence improperly.
- Revoke learning artifacts derived from deleted or invalidated evidence where policy requires.

---

# 14. Ownership model

| Area | Accountable owner | Required reviewer |
|---|---|---|
| Harness manifest | AI infrastructure | Repository governance owner |
| Authorization capability policy | Backend/security | Product workflow owner |
| RLS/RPC/Storage/Realtime | Database/security | Backend owner |
| Environment registry and secrets | Platform/security | Release owner |
| Migration and deployment ledger | Database/platform | Release owner |
| Prompt and model bundle | AI product | Safety/evaluation reviewer |
| Tool manifest | Tool/domain owner | Security reviewer for side effects |
| Evaluation suite | Evaluation owner | Product and safety reviewers |
| Learning promotion | Knowledge owner | Human approver |
| Budget and provider policy | Platform/finance owner | AI runtime owner |
| Canary and rollback | Release owner | Incident owner |
| SLOs and alerts | Reliability owner | Service owner |

For a small team, one person may hold multiple roles, but the release packet must still name which role approved each decision.

---

# 15. Decision log required before execution

The following decisions must be made explicitly during the relevant PR, not hidden in code:

1. canonical format and location of the Harness manifest;
2. which human router files may be generated versus validated;
3. capability naming and ownership convention;
4. approved service-role adapter list;
5. environment identifiers and remote-mutation approval method;
6. release-ledger storage location;
7. Edge Function digest algorithm and dependency closure;
8. trace retention and actor-hashing strategy;
9. provider data classes and region constraints;
10. live-evaluation budget and sampling method;
11. critical safety thresholds and quality ratchets;
12. learning-review quorum and revocation rules;
13. budget caps and fallback behavior;
14. canary cohort and abort thresholds;
15. kill-switch storage and operator access;
16. incident owner and escalation channel.

Each decision records:

- date;
- decision owner;
- alternatives considered;
- selected option;
- reason;
- evidence;
- reversal condition.

---

# 16. Execution stop conditions

An implementing agent must stop and ask for direction when:

- the repository or branch differs from the approved target;
- the working tree contains unrelated changes that cannot be isolated safely;
- a locked governance document requires modification without current explicit approval;
- Production mutation would be needed to continue an audit;
- environment identity is ambiguous;
- a secret value appears in a proposed repository artifact;
- a historical migration would need editing;
- a required local or staging verification cannot run;
- a test exposes an existing critical security or money-state defect outside the PR scope;
- the implementation would weaken an existing user confirmation gate;
- the plan and current source materially disagree;
- a proposed abstraction adds more operational surface than the present product stage justifies;
- rollback cannot be described before promotion;
- evidence does not support a completion claim.

Stopping is not failure. Continuing under an unsafe assumption is failure.

---

# 17. Definition of done for each PR

A PR is complete only when:

- scope is narrow and matches the approved workstream;
- changed files have clear ownership;
- relevant Tier 1 and task-specific governance were read;
- assumptions are explicit;
- implementation preserves the product boundary;
- tests include negative and failure cases;
- required commands actually ran and passed;
- generated artifacts are reproducible;
- no secret or Production data is committed;
- documentation reflects current behavior without overstating enforcement;
- rollback or forward-correction path is named;
- untested states and remaining risks are reported;
- session memory is handled according to repository rules.

“Code written” is not “done.”

---

# 18. Final program acceptance criteria

The overall Harness production-assurance program is complete when all of the following are true:

## Governance

- one authoritative manifest describes skills, tools, owners, versions, permissions, and checksums;
- human routers and mirrors cannot drift silently;
- active releases reference exact manifest versions.

## Identity and authorization

- all critical routes use immutable actor context and centralized capability resolution;
- service-role access is contained and audited;
- negative authorization tests cover cross-user and invalid-state cases.

## Data plane

- all critical exposed surfaces have executable actor access matrices;
- privileged functions have reviewed grants and search paths;
- local reset reproduces the schema;
- repository and environment migration inventories are comparable.

## Release identity

- every deployed Edge Function maps to one immutable Harness release and Git commit;
- prompt, policy, charter, model, tool, schema, migration, type, and evaluation versions are release-bound;
- mixed or drifted release state is detectable and blocks promotion.

## Observability

- one trace reconstructs a complete run;
- privileged actions preserve the originating actor and reason;
- provider attempts and costs reconcile;
- secrets and unnecessary PII are absent from logs.

## Evaluation

- deterministic, live, shadow, and Production evidence are reported separately;
- critical safety thresholds block release;
- probabilistic behavior uses repeated samples;
- adversarial and counterfactual suites are maintained.

## Learning

- every learning artifact has provenance and human approval;
- disputed, low-quality, or unredacted evidence cannot promote;
- revocation invalidates downstream use safely.

## Reliability

- retries are state-aware and bounded;
- external side effects are idempotent or reconciled;
- budget fallback cannot bypass caps;
- circuit breakers and degraded modes are tested.

## Operations

- promotion uses staging, shadow, and canary where required;
- automatic abort thresholds exist;
- full-bundle rollback has been rehearsed;
- incidents map to kill switches, owners, and runbooks;
- SLOs and error budgets influence release decisions.

---

# 19. Recommended execution order

The default order is:

```text
PR-01 manifest truth
  -> PR-02 environment identity
  -> PR-03 actor and capability foundation
  -> PR-04 service-role containment
  -> PR-05 RLS/RPC/Storage/Realtime proof
  -> PR-06 migration and release ledger
  -> PR-07 immutable release and function digests
  -> PR-08 trace and cost lineage
  -> PR-09 layered evaluation
  -> PR-10 learning provenance
  -> PR-11 reliability controls
  -> PR-12 promotion, canary, rollback, incidents, and SLOs
```

Permitted parallelism:

- PR-01 and design work for PR-02 may be researched in parallel, but implementation should preserve one integration owner.
- PR-08 schema design can begin while PR-06 and PR-07 are reviewed, but release identity must exist before trace schema is finalized.
- PR-09 test-case authoring can begin early, but release ratchets must bind to the final release object.
- PR-10 can be designed independently, but promoted artifacts must integrate with the release manifest.

Do not parallelize changes that modify the same authorization, migration, or release boundary without one owner coordinating integration.

---

# 20. First implementation slice

The safest first slice is PR-01 because it:

- does not mutate Production;
- does not alter customer or worker runtime behavior;
- exposes current semantic drift early;
- creates the machine-readable foundation required by later release identity;
- is reversible;
- gives both Codex and Claude Code one consistent capability inventory.

PR-01 must remain a manifest and validation change. It must not expand into authorization, database, provider, or deployment implementation.

---

# 21. Final engineering position

Kael does not need a larger pile of prompts, tools, or agents first. It needs a smaller, stronger set of release-bound guarantees.

The Harness should make the safe path the easy path:

- identity is parsed once;
- capability is explicit;
- privileged access is narrow;
- RLS is tested as real actors;
- environments cannot be confused;
- every release is immutable and traceable;
- every provider call has lineage and budget;
- every retry understands state;
- every learning artifact has provenance;
- every promotion can be aborted;
- every rollback restores a complete compatible bundle;
- every completion claim is backed by evidence.

That is the standard required before Kael is treated as a dependable Production operator rather than a capable model wrapped in partially independent controls.
