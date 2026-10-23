import { z } from 'zod'
import type { WorkflowRegistry } from './workflow-registry.ts'

const identifier = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/)
const requestSchema = z.object({
  workflowId: identifier,
  definitionVersion: z.number().int().min(1).max(1000000),
  actorRole: z.enum(['customer', 'worker', 'admin', 'admin_operator']),
  service: z.enum(['electrical', 'plumbing', 'cleaning', 'hvac', 'upholstery', 'handyman']),
  facts: z.record(identifier, z.union([z.string().max(64), z.number().min(-1000000).max(1000000), z.boolean()])),
  nowMs: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  deadlineAtMs: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  proposalJson: z.string().max(8192).optional(),
}).strict()

const proposalSchema = z.object({
  schemaVersion: z.literal('workflow-proposal/v1'), workflowId: identifier,
  definitionVersion: z.number().int().min(1).max(1000000),
  nodeIds: z.array(identifier).min(1).max(64),
}).strict()

type Definition = NonNullable<ReturnType<WorkflowRegistry['get']>>
type Step = {
  readonly nodeId: string;
  readonly kind: Definition['nodes'][number]['kind'];
  readonly effect: 'proposal_only';
  readonly capabilityId?: string;
  readonly event?: string;
}
type Status = 'rejected' | 'deadline_exceeded' | 'budget_exhausted' | 'approval_required' | 'event_required' | 'proposed_terminal'

function validFacts(definition: Definition, facts: z.infer<typeof requestSchema>['facts']): boolean {
  const fields = definition.input.fields
  if (Object.keys(facts).some(key => !fields.some(f => f.name === key))) return false
  return fields.every(field => {
    const present = Object.hasOwn(facts, field.name)
    if (!present) return !field.required
    const value = facts[field.name]
    if (field.type === 'identifier') return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value)
    if (field.type === 'integer') return typeof value === 'number' && Number.isSafeInteger(value) && value >= field.min && value <= field.max
    if (field.type === 'choice') return typeof value === 'string' && field.values.includes(value)
    return typeof value === 'boolean'
  })
}

function plan(registry: WorkflowRegistry, input: unknown) {
  const started = performance.now()
  const steps: Step[] = []
  let definition: Definition | undefined
  function result(status: Status, reason: string) {
    return Object.freeze({
      mode: 'read_only_shadow' as const, status, reason,
      workflowId: definition?.workflowId ?? null, definitionVersion: definition?.version ?? null,
      policyPins: definition?.policyPins ?? [], capabilityRegistry: definition?.capabilityRegistry ?? null,
      steps: Object.freeze(steps.slice()),
      usage: Object.freeze({ steps: steps.length, calls: 0, costMicrousd: 0, effects: 0 }),
    })
  }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return result('rejected', 'INVALID_REQUEST')
  const raw = input as Record<string, unknown>
  if (Object.keys(raw).length > 8 || !raw.facts || typeof raw.facts !== 'object' || Array.isArray(raw.facts) || Object.keys(raw.facts).length > 16) return result('rejected', 'REQUEST_SIZE_LIMIT')
  const parsed = requestSchema.safeParse(input)
  if (!parsed.success) return result('rejected', 'INVALID_REQUEST')
  const request = parsed.data
  definition = registry.get(request.workflowId, request.definitionVersion)
  if (!definition) return result('rejected', 'DEFINITION_NOT_REGISTERED')
  if (!definition.roles.includes(request.actorRole) || !definition.services.includes(request.service)) return result('rejected', 'ACTOR_SERVICE_FORBIDDEN')
  if (!validFacts(definition, request.facts)) return result('rejected', 'INVALID_INPUT')
  const remainingMs = request.deadlineAtMs - request.nowMs
  if (remainingMs <= 0) return result('deadline_exceeded', 'DEADLINE_EXPIRED')
  if (remainingMs > definition.deadlineMs) return result('rejected', 'DEADLINE_BOUND')
  let candidate: z.infer<typeof proposalSchema> | undefined
  if (request.proposalJson !== undefined) {
    try {
      const parsedProposal = proposalSchema.safeParse(JSON.parse(request.proposalJson))
      if (!parsedProposal.success) return result('rejected', 'INVALID_PROPOSAL')
      candidate = parsedProposal.data
    } catch { return result('rejected', 'INVALID_PROPOSAL') }
    if (candidate.workflowId !== definition.workflowId || candidate.definitionVersion !== definition.version || candidate.nodeIds[0] !== definition.entry) return result('rejected', 'PROPOSAL_VERSION_OR_ENTRY')
    if (candidate.nodeIds.length > definition.budget.maxSteps) return result('budget_exhausted', 'STEP_LIMIT')
    if (candidate.nodeIds.some(id => !definition!.nodes.some(n => n.id === id))) return result('rejected', 'UNKNOWN_NODE')
    const counts = new Map<string, number>()
    for (let i = 0; i < candidate.nodeIds.length; i++) {
      const id = candidate.nodeIds[i]
      const node = definition.nodes.find(n => n.id === id)
      if (!node) return result('rejected', 'UNKNOWN_NODE')
      counts.set(id, (counts.get(id) ?? 0) + 1)
      if (counts.get(id)! > node.maxVisits) return result('rejected', 'RETRY_LIMIT')
      if (i + 1 < candidate.nodeIds.length) {
        if (node.kind === 'request_approval' || node.kind === 'wait_event' || node.kind === 'finish') return result('rejected', 'BOUNDARY_BYPASS')
        if (!definition.edges.some(e => e.from === id && e.to === candidate!.nodeIds[i + 1])) return result('rejected', 'INVALID_TRANSITION')
      } else if (!['request_approval', 'wait_event', 'finish'].includes(node.kind)) return result('rejected', 'INCOMPLETE_PROPOSAL')
    }
  }
  const visits = new Map<string, number>()
  let next: string | undefined = definition.entry
  while (next !== undefined) {
    if (performance.now() - started >= Math.min(remainingMs, definition.budget.maxDurationMs)) return result('deadline_exceeded', 'TIME_LIMIT')
    if (steps.length >= definition.budget.maxSteps) return result('budget_exhausted', 'STEP_LIMIT')
    const node = definition.nodes.find(n => n.id === next)
    if (!node) return result('rejected', 'UNKNOWN_NODE')
    visits.set(node.id, (visits.get(node.id) ?? 0) + 1)
    if (visits.get(node.id)! > node.maxVisits) return result('rejected', 'RETRY_LIMIT')
    steps.push(Object.freeze({
      nodeId: node.id, kind: node.kind, effect: 'proposal_only',
      ...(node.capabilityId ? { capabilityId: node.capabilityId } : {}),
      ...(node.event ? { event: node.event } : {}),
    }))
    if (node.kind === 'request_approval') return result('approval_required', 'HUMAN_APPROVAL_REQUIRED')
    if (node.kind === 'wait_event') return result('event_required', 'DURABLE_EVENT_REQUIRED')
    if (node.kind === 'finish') return result('proposed_terminal', node.terminalState!)
    next = candidate ? candidate.nodeIds[steps.length] : (definition.edges.find(e => e.from === node.id && e.kind === 'success') ?? definition.edges.find(e => e.from === node.id && e.kind === 'failure'))?.to
  }
  return result('rejected', 'INCOMPLETE_PROPOSAL')
}

export function runWorkflowShadow<T>(control: T, registry: WorkflowRegistry, input: unknown) {
  return Object.freeze({ control, shadow: plan(registry, input) })
}
