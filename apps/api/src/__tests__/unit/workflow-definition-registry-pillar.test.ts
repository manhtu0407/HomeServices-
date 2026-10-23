import { describe, expect, it } from 'vitest'
import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import { workflowDefinitionSchema, parseWorkflowDefinition } from '../../../../../packages/shared/src/contracts/workflow-definition'
import { workflowDefinitionSchema as edgeSchema } from '../../../../../supabase/functions/_shared/contracts/workflow-definition'
import { createWorkflowRegistry } from '../../../../../supabase/functions/mobile-api/_shared/kael/pipeline/workflow-registry'
import { CAPABILITY_REGISTRY_SOURCE_SHA256 } from '../../../../../supabase/functions/mobile-api/_shared/platform/authz/capability-registry'

export const PILLAR = {
  id: 'P432-workflow-definition-registry',
  invariant: 'only bounded allowlisted version-pinned workflow definitions enter the immutable local registry',
  authority: ['governance/RULES.md #0', 'governance/RULES.md #7', 'docs/test-logs/kawa02-release-entry-audit-20261023/owner-decisions.md'],
  target: 'supabase/functions/mobile-api/_shared/kael/pipeline/workflow-registry.ts',
  layer: 'security-negative',
  siblings: ['P413-kael-approval-boundary'],
  mutation: 'allow duplicate registry keys or bypass the definition schema: immutable version and malicious node assertions fail',
} as const satisfies PillarManifest

const POLICY = { service: 'electrical', policyId: '00000000-0000-4000-8000-000000000432', version: 1 } as const
function definition() {
  return {
    schemaVersion: 'workflow-definition/v1', workflowId: 'case_review', version: 1,
    owner: 'kael.pipeline', roles: ['customer'], services: ['electrical'],
    rollout: 'local_test', deadlineMs: 10000, trigger: 'case_turn', input: { fields: [] },
    policyPins: [{ ...POLICY }],
    capabilityRegistry: { version: '1.0.0', sourceSha256: CAPABILITY_REGISTRY_SOURCE_SHA256 },
    capabilityPins: [{ id: 'mobile.route.kael.chat.get', version: '1.0.0' }],
    budget: { maxSteps: 8, maxCalls: 0, maxCostMicrousd: 0, maxDurationMs: 10000 },
    approval: { required: false, actorRoles: ['customer'], expiresInMs: 60000, payloadBinding: 'sha256', jobBinding: 'required' },
    entry: 'read', terminalStates: ['succeeded'],
    nodes: [
      { id: 'read', kind: 'execute_capability', capabilityId: 'mobile.route.kael.chat.get', timeoutMs: 100, maxVisits: 1 },
      { id: 'done', kind: 'finish', terminalState: 'succeeded', timeoutMs: 100, maxVisits: 1 },
    ],
    edges: [{ from: 'read', to: 'done', kind: 'success' }],
  }
}

describe(PILLAR.id, () => {
  it('parses an offline definition and preserves a pinned version after registration closes', () => {
    expect(workflowDefinitionSchema.safeParse(definition()).success, pillarWhy(PILLAR, 'valid local contract')).toBe(true)
    const registry = createWorkflowRegistry({ owner: 'kael.pipeline', policyPins: [POLICY] })
    const stored = registry.register(definition())
    registry.disableRegistration()
    expect(registry.get('case_review', 1)).toBe(stored)
    expect(() => registry.register({ ...definition(), version: 2 })).toThrow('REGISTRATION_DISABLED')
  })

  it('rejects version overwrite, isolates caller mutations and retains old versions', () => {
    const source = definition()
    const input = { owner: 'kael.pipeline', policyPins: [POLICY] }
    const registry = createWorkflowRegistry(input)
    const old = registry.register(source)
    source.nodes[0].timeoutMs = 900
    input.owner = 'other.owner'
    const next = registry.register({ ...definition(), version: 2 })
    expect(old.nodes[0].timeoutMs).toBe(100)
    expect(Object.isFrozen(old.nodes[0])).toBe(true)
    expect(registry.get('case_review', 1)).toBe(old)
    expect(registry.get('case_review', 2)).toBe(next)
    expect(registry.get('case_review', 3)).toBeUndefined()
    expect(() => registry.register(definition())).toThrow('WORKFLOW_VERSION_EXISTS')
    expect(old.version).toBe(1)
  })

  it.each([
    ['script node', (d: ReturnType<typeof definition>) => { d.nodes[0].kind = 'javascript' }],
    ['SQL payload', (d: ReturnType<typeof definition>) => { Object.assign(d.nodes[0], { sql: 'delete from jobs' }) }],
    ['HTTP payload', (d: ReturnType<typeof definition>) => { Object.assign(d.nodes[0], { url: 'https://evil.test' }) }],
    ['RPC payload', (d: ReturnType<typeof definition>) => { Object.assign(d.nodes[0], { rpc: 'create_job' }) }],
    ['top-level executable payload', (d: ReturnType<typeof definition>) => { Object.assign(d, { sql: 'delete from jobs' }) }],
    ['unknown version', (d: ReturnType<typeof definition>) => { d.schemaVersion = 'workflow-definition/v2' }],
    ['live rollout', (d: ReturnType<typeof definition>) => { d.rollout = 'production' }],
    ['unsupported service', (d: ReturnType<typeof definition>) => { d.services = ['appliance'] }],
    ['unknown role', (d: ReturnType<typeof definition>) => { d.roles = ['root'] }],
    ['duplicate role', (d: ReturnType<typeof definition>) => { d.roles.push('customer') }],
    ['duplicate node', (d: ReturnType<typeof definition>) => { d.nodes.push({ ...d.nodes[0] }) }],
    ['dangling edge', (d: ReturnType<typeof definition>) => { d.edges[0].to = 'absent' }],
    ['unsupported transition', (d: ReturnType<typeof definition>) => { d.edges[0].kind = 'approved' }],
    ['nonterminal dead end', (d: ReturnType<typeof definition>) => { d.edges = [] }],
    ['missing capability pin', (d: ReturnType<typeof definition>) => { d.capabilityPins = [] }],
    ['unbounded cycle', (d: ReturnType<typeof definition>) => { d.edges[0].to = 'read' }],
    ['nonfinite cost', (d: ReturnType<typeof definition>) => { d.budget.maxCostMicrousd = Infinity }],
    ['negative budget', (d: ReturnType<typeof definition>) => { d.budget.maxSteps = -1 }],
    ['insufficient steps', (d: ReturnType<typeof definition>) => { d.budget.maxSteps = 1 }],
    ['insufficient time', (d: ReturnType<typeof definition>) => { d.budget.maxDurationMs = 199 }],
    ['deadline bound', (d: ReturnType<typeof definition>) => { d.deadlineMs = 9999 }],
    ['zero timeout', (d: ReturnType<typeof definition>) => { d.nodes[0].timeoutMs = 0 }],
    ['unbounded visits', (d: ReturnType<typeof definition>) => { d.nodes[0].maxVisits = 4 }],
    ['unguarded repeat', (d: ReturnType<typeof definition>) => { d.nodes[0].maxVisits = 2 }],
    ['no policy pin', (d: ReturnType<typeof definition>) => { d.policyPins = [] }],
  ])('refuses %s in both contract twins', (_name, change) => {
    const invalid = definition()
    change(invalid)
    expect(workflowDefinitionSchema.safeParse(invalid).success, pillarWhy(PILLAR, String(_name))).toBe(false)
    expect(edgeSchema.safeParse(invalid).success).toBe(false)
  })

  it('bounds retries to explicit local self loops and proves schema parity on six services', () => {
    const d = definition()
    d.capabilityPins = []
    const nodes = [{ id: 'read', kind: 'validate', timeoutMs: 100, maxVisits: 3 }, d.nodes[1]]
    const bounded = { ...d, nodes, edges: [...d.edges, { from: 'read', to: 'read', kind: 'retry', maxAttempts: 2 }] }
    for (const service of ['electrical', 'plumbing', 'cleaning', 'hvac', 'upholstery', 'handyman']) {
      const value = { ...bounded, services: [service], policyPins: [{ ...POLICY, service }] }
      expect(workflowDefinitionSchema.parse(value)).toEqual(edgeSchema.parse(value))
    }
    expect(workflowDefinitionSchema.safeParse({ ...bounded, edges: [...d.edges, { from: 'read', to: 'read', kind: 'retry', maxAttempts: 3 }] }).success).toBe(false)
  })

  it('rejects unknown capabilities, actor escalation and stale policy or capability snapshots', () => {
    const registry = createWorkflowRegistry({ owner: 'kael.pipeline', policyPins: [POLICY] })
    const unknown = definition()
    unknown.nodes[0].capabilityId = 'mobile.route.arbitrary.rpc'
    unknown.capabilityPins[0].id = 'mobile.route.arbitrary.rpc'
    expect(() => registry.register(unknown)).toThrow('UNKNOWN_CAPABILITY')
    expect(() => registry.register({ ...definition(), roles: ['worker'], approval: { ...definition().approval, actorRoles: ['worker'] } })).toThrow('CAPABILITY_ROLE_FORBIDDEN')
    expect(() => registry.register({ ...definition(), policyPins: [{ ...POLICY, version: 2 }] })).toThrow('POLICY_PIN_MISMATCH')
    expect(() => registry.register({ ...definition(), capabilityRegistry: { version: '1.0.0', sourceSha256: '0'.repeat(64) } })).toThrow('CAPABILITY_REGISTRY_MISMATCH')
    expect(() => registry.register({ ...definition(), owner: 'other.owner' })).toThrow('WORKFLOW_OWNER_MISMATCH')
  })

  it('requires customer approval on every path to a confirmation proposal', () => {
    const d = definition()
    d.nodes[0].capabilityId = 'mobile.route.kael.chat.confirm'
    d.capabilityPins[0].id = 'mobile.route.kael.chat.confirm'
    const registry = createWorkflowRegistry({ owner: 'kael.pipeline', policyPins: [POLICY] })
    expect(() => registry.register(d)).toThrow('CAPABILITY_APPROVAL_REQUIRED')
    d.approval.required = true
    expect(() => registry.register(d)).toThrow('APPROVAL_PATH_REQUIRED')
    const guarded = {
      ...d, entry: 'approve',
      nodes: [{ id: 'approve', kind: 'request_approval', timeoutMs: 100, maxVisits: 1 }, ...d.nodes],
      edges: [{ from: 'approve', to: 'read', kind: 'approved' }, ...d.edges],
    }
    expect(registry.register(guarded).entry).toBe('approve')
    expect(() => createWorkflowRegistry({ owner: 'kael.pipeline', policyPins: [POLICY] }).register({ ...guarded, edges: [...guarded.edges, { from: 'approve', to: 'read', kind: 'failure' }] })).toThrow('APPROVAL_PATH_REQUIRED')
    expect(() => createWorkflowRegistry({ owner: 'kael.pipeline', policyPins: [POLICY] }).register({ ...guarded, roles: ['admin'], approval: { ...d.approval, actorRoles: ['admin'] } })).toThrow('CAPABILITY_ROLE_FORBIDDEN')
  })

  it('enforces step/time bounds over generated valid graph sizes and rejects oversized input early', () => {
    for (let size = 2; size <= 32; size++) {
      const d = definition()
      const nodes = Array.from({ length: size }, (_, i) => ({ id: `n_${i}`, kind: i === size - 1 ? 'finish' : 'validate', timeoutMs: 1, maxVisits: 1, ...(i === size - 1 ? { terminalState: 'succeeded' } : {}) }))
      const edges = nodes.slice(1).map((n, i) => ({ from: nodes[i].id, to: n.id, kind: 'success' }))
      const value = { ...d, entry: 'n_0', nodes, edges, capabilityPins: [], budget: { ...d.budget, maxSteps: size, maxDurationMs: size } }
      expect(parseWorkflowDefinition(value).nodes).toHaveLength(size)
      expect(workflowDefinitionSchema.safeParse({ ...value, budget: { ...value.budget, maxSteps: size - 1 } }).success).toBe(false)
    }
    expect(() => parseWorkflowDefinition({ ...definition(), nodes: Array(33).fill({}) })).toThrow('WORKFLOW_SIZE_LIMIT')
    expect(() => parseWorkflowDefinition({ ...definition(), input: { fields: Array(17).fill({}) } })).toThrow('WORKFLOW_INPUT_LIMIT')
  })
})
