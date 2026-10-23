import { z } from 'zod'

const identifier = z.string().regex(/^[a-z][a-z0-9_]{0,63}$/)
const role = z.enum(['customer', 'worker', 'admin', 'admin_operator'])
const service = z.enum(['electrical', 'plumbing', 'cleaning', 'hvac', 'upholstery', 'handyman'])
const terminal = z.enum(['succeeded', 'declined', 'failed', 'expired', 'escalated', 'exhausted'])
const capabilityId = z.string().max(160).regex(/^mobile\.route\.[A-Za-z][A-Za-z0-9.]*$/)
const event = z.enum(['worker_accepted', 'worker_declined', 'no_worker', 'deadline_elapsed', 'approval_received'])
const field = z.discriminatedUnion('type', [
  z.object({ name: identifier, type: z.literal('identifier'), required: z.boolean() }).strict(),
  z.object({ name: identifier, type: z.literal('boolean'), required: z.boolean() }).strict(),
  z.object({ name: identifier, type: z.literal('integer'), required: z.boolean(), min: z.number().int().min(-1000000).max(1000000), max: z.number().int().min(-1000000).max(1000000) }).strict(),
  z.object({ name: identifier, type: z.literal('choice'), required: z.boolean(), values: z.array(identifier).min(1).max(16) }).strict(),
])

export const workflowPolicyPinSchema = z.object({
  service, policyId: z.string().uuid(), version: z.number().int().min(1).max(1000000),
}).strict()

const node = z.object({
  id: identifier,
  kind: z.enum(['classify', 'retrieve', 'reason', 'validate', 'request_approval', 'execute_capability', 'wait_event', 'emit_event', 'finish']),
  timeoutMs: z.number().int().min(1).max(10000),
  maxVisits: z.number().int().min(1).max(3),
  capabilityId: capabilityId.optional(),
  event: event.optional(),
  terminalState: terminal.optional(),
}).strict()

const edge = z.discriminatedUnion('kind', [
  z.object({ from: identifier, to: identifier, kind: z.enum(['success', 'failure', 'approved', 'event']) }).strict(),
  z.object({ from: identifier, to: identifier, kind: z.literal('retry'), maxAttempts: z.number().int().min(1).max(2) }).strict(),
])

export const workflowDefinitionSchema = z.object({
  schemaVersion: z.literal('workflow-definition/v1'),
  workflowId: identifier,
  version: z.number().int().min(1).max(1000000),
  owner: z.string().regex(/^[a-z][a-z0-9_.]{1,63}$/),
  roles: z.array(role).min(1).max(4),
  services: z.array(service).min(1).max(6),
  rollout: z.enum(['local_test', 'shadow_read_only']),
  deadlineMs: z.number().int().min(1).max(300000),
  trigger: z.enum(['case_created', 'case_turn', 'worker_offer', 'job_event']),
  input: z.object({ fields: z.array(field).max(16) }).strict(),
  policyPins: z.array(workflowPolicyPinSchema).min(1).max(6),
  capabilityRegistry: z.object({ version: z.literal('1.0.0'), sourceSha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  capabilityPins: z.array(z.object({ id: capabilityId, version: z.literal('1.0.0') }).strict()).max(32),
  budget: z.object({
    maxSteps: z.number().int().min(1).max(64),
    maxCalls: z.number().int().min(0).max(16),
    maxCostMicrousd: z.number().int().min(0).max(1000000),
    maxDurationMs: z.number().int().min(1).max(300000),
  }).strict(),
  approval: z.object({
    required: z.boolean(), actorRoles: z.array(role).min(1).max(4),
    expiresInMs: z.number().int().min(1).max(300000),
    payloadBinding: z.literal('sha256'), jobBinding: z.literal('required'),
  }).strict(),
  entry: identifier,
  terminalStates: z.array(terminal).min(1).max(6),
  nodes: z.array(node).min(1).max(32),
  edges: z.array(edge).max(96),
}).strict().superRefine((value, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message })
  const unique = (values: readonly string[]) => new Set(values).size === values.length
  if (![value.roles, value.services, value.terminalStates, value.approval.actorRoles].every(unique)) fail('DUPLICATE_SCOPE')
  if (!unique(value.nodes.map(n => n.id)) || !unique(value.capabilityPins.map(p => p.id)) || !unique(value.policyPins.map(p => p.service))) fail('DUPLICATE_ID')
  if (!unique(value.input.fields.map(f => f.name))) fail('DUPLICATE_INPUT')
  for (const f of value.input.fields) {
    if (['__proto__', 'constructor', 'prototype'].includes(f.name)) fail('RESERVED_INPUT')
    if (f.type === 'integer' && f.min > f.max) fail('INPUT_RANGE')
    if (f.type === 'choice' && !unique(f.values)) fail('DUPLICATE_CHOICE')
  }
  if (value.approval.actorRoles.some(r => !value.roles.includes(r))) fail('APPROVAL_ROLE_SCOPE')
  if (value.policyPins.length !== value.services.length || value.policyPins.some(p => !value.services.includes(p.service))) fail('POLICY_SCOPE')
  const nodes = new Map(value.nodes.map(n => [n.id, n]))
  const pins = new Set(value.capabilityPins.map(p => p.id))
  const usedPins = new Set<string>()
  const outgoing = new Map(value.nodes.map(n => [n.id, value.edges.filter(e => e.from === n.id)]))
  if (!nodes.has(value.entry)) fail('MISSING_ENTRY')
  let steps = 0
  let duration = 0
  for (const n of value.nodes) {
    steps += n.maxVisits
    duration += n.timeoutMs * n.maxVisits
    const edges = outgoing.get(n.id) ?? []
    if (!unique(edges.map(e => e.kind))) fail('AMBIGUOUS_TRANSITION')
    if (n.kind === 'execute_capability') {
      if (!n.capabilityId || !pins.has(n.capabilityId)) fail('CAPABILITY_PIN_REQUIRED')
      else usedPins.add(n.capabilityId)
    } else if (n.capabilityId !== undefined) fail('CAPABILITY_NODE_ONLY')
    if (n.kind === 'request_approval' && !value.approval.required) fail('APPROVAL_REQUIRED')
    if ((n.kind === 'wait_event' || n.kind === 'emit_event') !== (n.event !== undefined)) fail('EVENT_NODE_ONLY')
    if (n.kind === 'finish') {
      if (!n.terminalState || !value.terminalStates.includes(n.terminalState) || edges.length || n.maxVisits !== 1) fail('INVALID_TERMINAL')
    } else if (n.terminalState !== undefined || edges.length === 0) fail('INVALID_CONTINUATION')
    const retry = edges.find(e => e.kind === 'retry')
    if (n.maxVisits > 1 && (!retry || retry.kind !== 'retry' || retry.maxAttempts !== n.maxVisits - 1)) fail('RETRY_BOUND_REQUIRED')
  }
  if (usedPins.size !== pins.size) fail('UNUSED_CAPABILITY_PIN')
  if (steps > value.budget.maxSteps || duration > value.budget.maxDurationMs || value.budget.maxDurationMs > value.deadlineMs) fail('BUDGET_INSUFFICIENT')
  for (const e of value.edges) {
    const n = nodes.get(e.from)
    if (!n || !nodes.has(e.to)) { fail('DANGLING_EDGE'); continue }
    const allowed = n.kind === 'request_approval' ? ['approved', 'failure'] : n.kind === 'wait_event' ? ['event', 'failure'] : n.kind === 'finish' ? [] : ['success', 'failure', 'retry']
    if (!allowed.includes(e.kind)) fail('UNSUPPORTED_TRANSITION')
    if (e.kind === 'retry' && (e.from !== e.to || !['classify', 'retrieve', 'reason', 'validate'].includes(n.kind) || e.maxAttempts !== n.maxVisits - 1)) fail('UNBOUNDED_RETRY')
  }
  const active = new Set<string>()
  const visited = new Set<string>()
  const visit = (id: string): void => {
    if (active.has(id)) { fail('UNBOUNDED_CYCLE'); return }
    if (visited.has(id) || !nodes.has(id)) return
    visited.add(id)
    active.add(id)
    for (const e of outgoing.get(id) ?? []) if (e.kind !== 'retry') visit(e.to)
    active.delete(id)
  }
  visit(value.entry)
  if (visited.size !== nodes.size) fail('UNREACHABLE_NODE')
  const finishing = new Set(value.nodes.filter(n => n.kind === 'finish').map(n => n.id))
  for (let i = 0; i < value.nodes.length; i++) {
    for (const e of value.edges) if (e.kind !== 'retry' && finishing.has(e.to)) finishing.add(e.from)
  }
  if (finishing.size !== nodes.size) fail('NO_TERMINAL_PATH')
  if (value.terminalStates.some(t => !value.nodes.some(n => n.kind === 'finish' && n.terminalState === t))) fail('UNUSED_TERMINAL')
})

type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>

export function parseWorkflowDefinition(value: unknown): WorkflowDefinition {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_WORKFLOW_DEFINITION')
  const object = value as Record<string, unknown>
  const limits: Record<string, number> = { nodes: 32, edges: 96, policyPins: 6, capabilityPins: 32, roles: 4, services: 6, terminalStates: 6 }
  if (Object.keys(object).length > 19 || Object.entries(limits).some(([key, limit]) => !Array.isArray(object[key]) || (object[key] as unknown[]).length > limit)) throw new Error('WORKFLOW_SIZE_LIMIT')
  const input = object.input as { fields?: unknown } | undefined
  if (!input || !Array.isArray(input.fields) || input.fields.length > 16) throw new Error('WORKFLOW_INPUT_LIMIT')
  return workflowDefinitionSchema.parse(value)
}
