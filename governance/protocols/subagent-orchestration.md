# Kael Protocol — Subagent Orchestration

> Project-wide agent operating protocol. `AGENTS.md` loads this decision gate for every task or mission before decomposition. It governs developer-agent delegation only; it does not authorize product/runtime multi-agent orchestration for Kael.

Load for: every task or mission before task decomposition.

## Kael Protocol: `kael-subagent-orchestration`

Use to make a deliberate decision about whether subagents materially improve the current task. This protocol requires a decision; it does not require spawning an agent.

### Inputs Required

- Tu's request and its acceptance criteria.
- The immediate critical-path work.
- Candidate sidecar work, if any.
- Expected evidence, file ownership, and risk for each candidate slice.
- Native subagent capability available in the active environment.

### Decision Gate

Before dispatching, state:

```text
Delegation: local / delegated
Reason: <expected gain or why delegation is not worth its cost>
Main-agent work: <the immediate critical-path work kept local>
```

Choose `local` when any of these apply:

- The task is a small answer, narrow edit, or has one clear critical path.
- The next local action depends on the result, so delegation would stall progress.
- The work is tightly coupled, needs one shared mental model, or would overlap files.
- The work contains a user decision, secret, production action, or scope that cannot safely be delegated.

Choose `delegated` only when every proposed slice is independent, bounded, non-blocking to the main agent's immediate work, and expected to save more time or produce stronger evidence than its coordination cost.

### Delegation Scale

| Task shape | Default delegation |
|---|---|
| Simple or tightly coupled | 0 subagents |
| Moderate with one high-leverage investigation or verification sidecar | 1 subagent |
| Complex or deep with distinct, non-overlapping workstreams | 2 subagents |
| Large, evidence-heavy task with three independent workstreams | Up to 3 subagents |

Do not run more than three subagents concurrently unless Tu explicitly asks or the plan records a concrete reason. Never create a swarm to produce multiple versions of the same answer.

### Delegated Slice Contract

Give each subagent a self-contained brief containing:

- one concrete goal and expected deliverable;
- read scope and exclusive write scope when it will edit;
- constraints, including no commit, push, deployment, or external action unless Tu authorized it;
- exact evidence or verification required;
- a concrete output and stop condition;
- the main agent's responsibility, so work is not duplicated.

Use role separation only when it maps to real work:

- **Explorer:** gather source-grounded findings from a bounded area.
- **Implementer:** make a bounded patch in a disjoint write set and report changed paths plus verification.
- **Verifier:** independently test or review one concrete risk while implementation continues.

Do not ask a subagent to spawn further subagents. Do not assign two agents overlapping write ownership.

### Execution

1. Do the immediate critical-path work locally before or alongside dispatch.
2. Dispatch one deliberate wave of independent work; do not repeatedly fan out on unresolved questions.
3. Continue meaningful, non-overlapping local work while agents run.
4. Re-scope or close an agent that no longer materially advances the task or reaches its stop condition.
5. Wait only when a returned result is required for the next local step.
6. Review every returned finding or diff against the source of truth before integrating it.
7. Run the main agent's own verification; a subagent report is evidence, not completion proof.
8. Keep cross-cutting decisions, integration, final review, and the user-facing response with the main agent.

### Platform Boundary

Use the platform's native subagent facility only when it is available:

- Codex: use available multi-agent tools.
- Claude Code: use its supported subagent/task facility.

If the active environment has no native subagent capability, state the limitation and continue locally. Do not emulate subagents with duplicate manual work, user-owned threads, or an invented orchestration layer.

### Output Format

```text
Delegation:
Reason:
Main-agent work:
Subagent roles and boundaries:
Integration/verification:
Limitations:
```

### Failure Modes

- Delegating the critical path and then waiting idle.
- Multiple agents investigating or editing the same unresolved area.
- A broad prompt with no output, stop condition, or file ownership.
- Treating a subagent conclusion as verified completion.
- Leaving completed agents open or letting a stalled agent consume attention.

### Anti-Patterns

- Spawning at least one agent for every task.
- Using parallelism to avoid making a decision.
- Asking agents for duplicate answers or broad, unbounded codebase tours.
- Turning this developer-agent protocol into Kael product/runtime autonomy.
