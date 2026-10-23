import { describe, expect, it, vi } from 'vitest'
import { type PillarManifest, pillarWhy } from '../pillar-manifest'
import { createDurableWorkflowStore } from '../../../../../supabase/functions/mobile-api/_shared/domains/kael-chat/workflow-checkpoints'
import { createWorkflowRegistry } from '../../../../../supabase/functions/mobile-api/_shared/kael/pipeline/workflow-registry'
import { CAPABILITY_REGISTRY_SOURCE_SHA256 } from '../../../../../supabase/functions/mobile-api/_shared/platform/authz/capability-registry'

export const PILLAR = {
  id: 'P434-workflow-durable-checkpoints',
  invariant: 'durable checkpoints use validated pinned definitions and refuse client-controlled persistence payloads',
  authority: ['governance/RULES.md #0', 'governance/RULES.md #1'],
  target: 'supabase/functions/mobile-api/_shared/domains/kael-chat/workflow-checkpoints.ts',
  layer: 'security-negative', siblings: ['P432-workflow-definition-registry', 'P433-workflow-shadow-planner', 'P435-workflow-durable-checkpoints-sql'],
  mutation: 'remove strict request validation or actor binding: private data or another actor reaches persistence',
} as const satisfies PillarManifest

const ID = '00000000-0000-4000-8000-000000000434'
const ACTOR = '00000000-0000-4000-8000-000000000001'
const OTHER = '00000000-0000-4000-8000-000000000002'
const POLICY = { service: 'electrical', policyId: ID, version: 1 } as const
const identity = { instanceId: ID, actorId: ACTOR, actorRole: 'customer', jobId: null, caseId: null } as const
function definition() {
  return {
    schemaVersion: 'workflow-definition/v1', workflowId: 'durable_case', version: 1, owner: 'kael.pipeline',
    roles: ['customer'], services: ['electrical'], rollout: 'local_test', deadlineMs: 10000, trigger: 'case_turn', input: { fields: [] },
    policyPins: [POLICY], capabilityRegistry: { version: '1.0.0', sourceSha256: CAPABILITY_REGISTRY_SOURCE_SHA256 }, capabilityPins: [],
    budget: { maxSteps: 8, maxCalls: 0, maxCostMicrousd: 0, maxDurationMs: 10000 },
    approval: { required: false, actorRoles: ['customer'], expiresInMs: 1000, payloadBinding: 'sha256', jobBinding: 'required' },
    entry: 'validate', terminalStates: ['succeeded'],
    nodes: [{ id: 'validate', kind: 'validate', timeoutMs: 100, maxVisits: 1 }, { id: 'done', kind: 'finish', timeoutMs: 100, maxVisits: 1, terminalState: 'succeeded' }],
    edges: [{ from: 'validate', to: 'done', kind: 'success' }],
  }
}
function receipt() {
  return {
    id: ID, workflow_id: 'durable_case', definition_version: 1, actor_id: ACTOR, actor_role: 'customer', job_id: null, customer_case_id: null, worker_case_id: null,
    instance_version: 0, checkpoint: 'validate', status: 'active', terminal_reason: null, deadline_at: '2026-10-23T03:00:00Z', retry_count: 0, retry_at: null, event_sequence: 0,
    created_at: '2026-10-23T02:00:00Z', updated_at: '2026-10-23T02:00:00Z',
  }
}
function setup(data: unknown = receipt(), error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error })
  const registry = createWorkflowRegistry({ owner: 'kael.pipeline', policyPins: [POLICY] })
  registry.register(definition())
  return { rpc, registry, store: createDurableWorkflowStore({ rpc }, registry, { user: { id: ACTOR }, role: 'customer' }) }
}
const create = { ...identity, workflowId: 'durable_case', definitionVersion: 1, idempotencyKey: ID, deadlineAt: '2026-10-23T03:00:00Z' }
const transition = { ...identity, expectedVersion: 0, idempotencyKey: ID, action: 'advance', nextNode: 'done' }

describe(PILLAR.id, () => {
  it('persists the explicit failure outcome of a registered W04 failure branch', async () => {
    const failed = { ...receipt(), instance_version: 1, checkpoint: 'declined', status: 'declined', terminal_reason: 'node_finished' }
    const { store, rpc, registry } = setup(failed)
    registry.register({
      ...definition(), version: 2, terminalStates: ['succeeded', 'declined'],
      nodes: [...definition().nodes, { id: 'declined', kind: 'finish', timeoutMs: 100, maxVisits: 1, terminalState: 'declined' }],
      edges: [...definition().edges, { from: 'validate', to: 'declined', kind: 'failure' }],
    })
    const request = { ...transition, action: 'failure', nextNode: 'declined' }
    expect(await store.transition(request)).toEqual(failed)
    expect(rpc).toHaveBeenCalledExactlyOnceWith('kael_workflow_checkpoint_v1', { p_request: { operation: 'transition', ...request } })
  })
  it('rejects raw prompts before reaching the server persistence operation', async () => {
    const { store, rpc } = setup()
    await expect(store.load({ ...identity, rawPrompt: 'private text' }), pillarWhy(PILLAR)).rejects.toThrow()
    expect(rpc).not.toHaveBeenCalled()
  })
  it('creates only from an immutable registry snapshot and uses one fixed server RPC', async () => {
    const { store, rpc, registry } = setup()
    expect(await store.create(create)).toEqual(receipt())
    expect(rpc).toHaveBeenCalledExactlyOnceWith('kael_workflow_checkpoint_v1', { p_request: { operation: 'create', ...identity, idempotencyKey: ID, deadlineAt: create.deadlineAt, definition: registry.get('durable_case', 1) } })
  })
  it('rejects a definition version absent from the accepted registry', async () => {
    const { store, rpc } = setup()
    await expect(store.create({ ...create, definitionVersion: 2 })).rejects.toThrow('WORKFLOW_NOT_REGISTERED')
    expect(rpc).not.toHaveBeenCalled()
  })
  it.each(['customer', 'worker', 'admin', 'admin_operator'] as const)('binds %s to the authenticated principal', async role => {
    const { rpc, registry } = setup()
    const store = createDurableWorkflowStore({ rpc }, registry, { user: { id: ACTOR }, role })
    await expect(store.load({ ...identity, actorRole: role, actorId: OTHER })).rejects.toThrow('WORKFLOW_ACTOR_SCOPE')
    expect(rpc).not.toHaveBeenCalled()
  })
  it('refuses role escalation even when actor ID matches', async () => {
    const { store, rpc } = setup()
    await expect(store.load({ ...identity, actorRole: 'admin' })).rejects.toThrow('WORKFLOW_ACTOR_SCOPE')
    expect(rpc).not.toHaveBeenCalled()
  })
  it.each([
    { ...transition, rawPrompt: 'private text' }, { ...transition, sql: 'select 1' },
    { ...transition, expectedVersion: -1 }, { ...transition, expectedVersion: 64 },
    { ...transition, action: 'failure', nextNode: undefined },
    { ...transition, action: 'failure', event: { id: ID, instanceId: ID, sequence: 1, kind: 'worker_accepted' } },
    { ...transition, action: 'http' }, { ...transition, action: 'timeout' },
    { ...transition, nextNode: undefined },
    { ...transition, event: { id: ID, instanceId: OTHER, sequence: 1, kind: 'worker_accepted' } },
    { ...transition, event: { id: ID, instanceId: ID, sequence: 0, kind: 'worker_accepted' } },
    { ...transition, event: { id: ID, instanceId: ID, sequence: 1, kind: 'untrusted_event' } },
    { ...transition, action: 'retry', event: { id: ID, instanceId: ID, sequence: 1, kind: 'worker_accepted' } },
  ])('rejects an invalid transition before persistence %#', async request => {
    const { store, rpc } = setup()
    await expect(store.transition(request)).rejects.toThrow()
    expect(rpc).not.toHaveBeenCalled()
  })
  it('keeps expected version and idempotency key intact across repeated delivery', async () => {
    const { store, rpc } = setup({ ...receipt(), instance_version: 1 })
    await store.transition(transition)
    await store.transition(transition)
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1])
    expect(rpc.mock.calls[0][1]).toEqual({ p_request: { operation: 'transition', ...transition } })
  })
  it('refuses a creation receipt that silently changes the pinned definition', async () => {
    const { store } = setup({ ...receipt(), definition_version: 2 })
    await expect(store.create(create)).rejects.toThrow('WORKFLOW_RESPONSE_VERSION')
  })
  it('refuses a transition receipt without its committed version increment', async () => {
    const { store } = setup(receipt())
    await expect(store.transition(transition)).rejects.toThrow('WORKFLOW_RESPONSE_VERSION')
  })
  it.each([
    { actor_id: OTHER }, { job_id: OTHER }, { customer_case_id: OTHER }, { id: OTHER }, { actor_role: 'worker' }, { rawPrompt: 'unexpected private text' },
  ])('rejects a response outside the requested scope %#', async override => {
    const { store } = setup({ ...receipt(), ...override })
    await expect(store.transition(transition)).rejects.toThrow()
  })
  it('recovers the pinned historical version through a new store with an empty registry', async () => {
    const { rpc, registry } = setup({ state: receipt(), definition: definition(), checkpoints: [receipt()] })
    const emptyRegistry = createWorkflowRegistry({ owner: 'kael.pipeline', policyPins: [POLICY] })
    const restored = await createDurableWorkflowStore({ rpc }, emptyRegistry, { user: { id: ACTOR }, role: 'customer' }).load(identity)
    expect(restored.definition).toEqual(registry.get('durable_case', 1))
    expect(restored.state.checkpoint).toBe('validate')
    expect(restored.checkpoints).toHaveLength(1)
  })
  it.each([
    { state: { ...receipt(), instance_version: 1 }, definition: definition(), checkpoints: [receipt()] },
    { state: receipt(), definition: { ...definition(), version: 2 }, checkpoints: [receipt()] },
    { state: receipt(), definition: definition(), checkpoints: [{ ...receipt(), actor_id: OTHER }] },
    { state: receipt(), definition: definition(), checkpoints: [{ ...receipt(), instance_version: 1 }] },
    { state: { ...receipt(), checkpoint: 'done' }, definition: definition(), checkpoints: [receipt()] },
  ])('refuses corrupt restart history %#', async data => {
    const { store } = setup(data)
    await expect(store.load(identity)).rejects.toThrow()
  })
  it('surfaces a persistence failure without returning raw database error text', async () => {
    const { store } = setup(null, { message: 'sensitive database detail' })
    await expect(store.load(identity)).rejects.toThrow('WORKFLOW_PERSISTENCE_FAILED')
  })
  it('bounds a stalled call and does not automatically repeat a possibly committed write', async () => {
    vi.useFakeTimers()
    try {
      const { rpc, registry } = setup()
      rpc.mockReturnValue(new Promise(() => {}))
      const store = createDurableWorkflowStore({ rpc }, registry, { user: { id: ACTOR }, role: 'customer' })
      const pending = expect(store.transition(transition)).rejects.toThrow('WORKFLOW_PERSISTENCE_TIMEOUT')
      await vi.advanceTimersByTimeAsync(6000)
      await pending
      expect(rpc).toHaveBeenCalledTimes(1)
    } finally { vi.useRealTimers() }
  })
})
