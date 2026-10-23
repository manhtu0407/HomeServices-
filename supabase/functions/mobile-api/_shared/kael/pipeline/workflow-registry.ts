import { parseWorkflowDefinition, workflowPolicyPinSchema } from '../../../../_shared/contracts/workflow-definition.ts'
import { CAPABILITY_POLICIES, CAPABILITY_REGISTRY_SOURCE_SHA256, CAPABILITY_REGISTRY_VERSION } from '../../platform/authz/capability-registry.ts'

function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}

type WorkflowDefinition = ReturnType<typeof parseWorkflowDefinition>

export function createWorkflowRegistry(input: {
  owner: string;
  policyPins: ReadonlyArray<{ service: string; policyId: string; version: number }>;
}) {
  const owner = input.owner
  if (!/^[a-z][a-z0-9_.]{1,63}$/.test(owner)) throw new Error('INVALID_WORKFLOW_OWNER')
  if (input.policyPins.length < 1 || input.policyPins.length > 6) throw new Error('INVALID_POLICY_SNAPSHOT')
  const policyPins = input.policyPins.map(p => workflowPolicyPinSchema.parse(p))
  if (new Set(policyPins.map(p => p.service)).size !== policyPins.length) throw new Error('INVALID_POLICY_SNAPSHOT')
  const policies = new Map(policyPins.map(p => [p.service, freeze(p)]))
  const capabilityPolicies = new Map(Object.values(CAPABILITY_POLICIES).map(p => [p.capability as string, p]))
  const definitions = new Map<string, WorkflowDefinition>()
  let registrationEnabled = true

  function register(value: unknown): WorkflowDefinition {
    if (!registrationEnabled) throw new Error('REGISTRATION_DISABLED')
    const definition = parseWorkflowDefinition(value)
    if (definition.owner !== owner) throw new Error('WORKFLOW_OWNER_MISMATCH')
    if (definition.capabilityRegistry.version !== CAPABILITY_REGISTRY_VERSION || definition.capabilityRegistry.sourceSha256 !== CAPABILITY_REGISTRY_SOURCE_SHA256) throw new Error('CAPABILITY_REGISTRY_MISMATCH')
    for (const pin of definition.policyPins) {
      const trusted = policies.get(pin.service)
      if (!trusted || pin.policyId !== trusted.policyId || pin.version !== trusted.version) throw new Error('POLICY_PIN_MISMATCH')
    }
    const writes = new Set<string>()
    for (const pin of definition.capabilityPins) {
      const policy = capabilityPolicies.get(pin.id)
      if (!policy || pin.version !== CAPABILITY_REGISTRY_VERSION) throw new Error('UNKNOWN_CAPABILITY')
      const allowedRoles: readonly string[] = pin.id === 'mobile.route.kael.chat.confirm' ? ['customer'] : policy.roles
      if (definition.roles.some(r => !allowedRoles.includes(r))) throw new Error('CAPABILITY_ROLE_FORBIDDEN')
      if (policy.sideEffectClass !== 'read-only') {
        writes.add(pin.id)
        if (!definition.approval.required || definition.roles.some(r => !definition.approval.actorRoles.includes(r))) throw new Error('CAPABILITY_APPROVAL_REQUIRED')
      }
    }
    const states = [{ id: definition.entry, approved: false }]
    const seen = new Set<string>()
    while (states.length) {
      const state = states.pop()!
      const key = `${state.id}:${state.approved}`
      if (seen.has(key)) continue
      seen.add(key)
      const node = definition.nodes.find(n => n.id === state.id)!
      if (node.capabilityId && writes.has(node.capabilityId) && !state.approved) throw new Error('APPROVAL_PATH_REQUIRED')
      for (const edge of definition.edges.filter(e => e.from === node.id)) {
        states.push({ id: edge.to, approved: state.approved || (node.kind === 'request_approval' && edge.kind === 'approved') })
      }
    }
    const key = `${definition.workflowId}:${definition.version}`
    if (definitions.has(key)) throw new Error('WORKFLOW_VERSION_EXISTS')
    const immutable = freeze(definition)
    definitions.set(key, immutable)
    return immutable
  }

  return Object.freeze({
    register,
    get(workflowId: string, version: number): WorkflowDefinition | undefined {
      return definitions.get(`${workflowId}:${version}`)
    },
    disableRegistration(): void { registrationEnabled = false },
  })
}

export type WorkflowRegistry = ReturnType<typeof createWorkflowRegistry>
