import { z } from 'zod'
import { createWorkflowRegistry } from '../../kael/pipeline/workflow-registry.ts'
import { parseWorkflowDefinition } from '../../../../_shared/contracts/workflow-definition.ts'
import type { MobileApiContext } from '../../platform/auth.ts'

const scope = z.object({
  instanceId: z.string().uuid(), actorId: z.string().uuid(),
  actorRole: z.enum(['customer', 'worker', 'admin', 'admin_operator']),
  jobId: z.string().uuid().nullable(), caseId: z.string().uuid().nullable(),
}).strict()

const createRequest = scope.extend({
  workflowId: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/), definitionVersion: z.number().int().min(1).max(1000000),
  idempotencyKey: z.string().uuid(), deadlineAt: z.iso.datetime({ offset: true }),
}).strict()
const transitionRequest = scope.extend({
  expectedVersion: z.number().int().min(0).max(63), idempotencyKey: z.string().uuid(),
  action: z.enum(['advance', 'failure', 'retry', 'timeout']), nextNode: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/).optional(),
  event: z.object({
    id: z.string().uuid(), instanceId: z.string().uuid(), sequence: z.number().int().min(1).max(64),
    kind: z.enum(['worker_accepted', 'worker_declined', 'no_worker', 'deadline_elapsed', 'approval_received']),
  }).strict().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.action === 'timeout' ? value.nextNode !== undefined || value.event !== undefined : !value.nextNode) ctx.addIssue({ code: 'custom', message: 'INVALID_TRANSITION_SHAPE' })
  if (value.event && (value.event.instanceId !== value.instanceId || value.action !== 'advance')) ctx.addIssue({ code: 'custom', message: 'INVALID_EVENT_SCOPE' })
})
const state = z.object({
  id: z.string().uuid(), workflow_id: z.string(), definition_version: z.number().int(),
  actor_id: z.string().uuid(), actor_role: z.enum(['customer', 'worker', 'admin', 'admin_operator']),
  job_id: z.string().uuid().nullable(), customer_case_id: z.string().uuid().nullable(), worker_case_id: z.string().uuid().nullable(),
  instance_version: z.number().int().min(0).max(64), checkpoint: z.string(),
  status: z.enum(['active', 'waiting', 'succeeded', 'declined', 'failed', 'expired', 'escalated', 'exhausted']),
  terminal_reason: z.enum(['node_finished', 'deadline_elapsed', 'retry_exhausted', 'step_exhausted']).nullable(),
  deadline_at: z.string(), retry_count: z.number().int().min(0).max(2), retry_at: z.string().nullable(),
  event_sequence: z.number().int().min(0).max(64), created_at: z.string(), updated_at: z.string(),
}).strict()

export function createDurableWorkflowStore(
  client: { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> },
  registry: ReturnType<typeof createWorkflowRegistry>,
  principal: Pick<MobileApiContext, 'user' | 'role'>,
) {
  const actorId = z.string().uuid().parse(principal.user.id)
  const actorRole = scope.shape.actorRole.parse(principal.role)
  function authorize(request: z.infer<typeof scope>) {
    if (request.actorId !== actorId || request.actorRole !== actorRole) throw new Error('WORKFLOW_ACTOR_SCOPE')
  }
  async function call(request: Record<string, unknown>) {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const result = await Promise.race([
        client.rpc('kael_workflow_checkpoint_v1', { p_request: request }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('WORKFLOW_PERSISTENCE_TIMEOUT')), 6000) }),
      ])
      if (result.error) throw new Error('WORKFLOW_PERSISTENCE_FAILED')
      return result.data
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
  function scopedResult(value: unknown, request: z.infer<typeof scope>) {
    const parsed = state.parse(value)
    if (parsed.id !== request.instanceId || parsed.actor_id !== actorId || parsed.actor_role !== actorRole
      || parsed.job_id !== request.jobId || (parsed.customer_case_id ?? parsed.worker_case_id) !== request.caseId) throw new Error('WORKFLOW_RESPONSE_SCOPE')
    return parsed
  }
  return {
    async create(input: unknown) {
      const request = createRequest.parse(input)
      authorize(request)
      const definition = registry.get(request.workflowId, request.definitionVersion)
      if (!definition || !definition.roles.includes(actorRole)) throw new Error('WORKFLOW_NOT_REGISTERED')
      const { workflowId: _workflowId, definitionVersion: _definitionVersion, ...identity } = request
      const created = scopedResult(await call({ operation: 'create', ...identity, definition }), request)
      if (created.workflow_id !== definition.workflowId || created.definition_version !== definition.version || created.instance_version !== 0) throw new Error('WORKFLOW_RESPONSE_VERSION')
      return created
    },
    async load(input: unknown) {
      const request = scope.parse(input)
      authorize(request)
      const loaded = z.object({ state, definition: z.unknown(), checkpoints: z.array(state).min(1).max(65) }).strict().parse(await call({ operation: 'load', ...request }))
      const restored = scopedResult(loaded.state, request)
      const definition = parseWorkflowDefinition(loaded.definition)
      if (definition.workflowId !== restored.workflow_id || definition.version !== restored.definition_version
        || !definition.roles.includes(actorRole) || loaded.checkpoints.length !== restored.instance_version + 1
        || JSON.stringify(loaded.checkpoints.at(-1)) !== JSON.stringify(restored)
        || loaded.checkpoints.some((checkpoint, index) => {
          scopedResult(checkpoint, request)
          return checkpoint.instance_version !== index || checkpoint.workflow_id !== definition.workflowId || checkpoint.definition_version !== definition.version
        })) throw new Error('WORKFLOW_RECOVERY_INVALID')
      return { state: restored, definition, checkpoints: loaded.checkpoints }
    },
    async transition(input: unknown) {
      const request = transitionRequest.parse(input)
      authorize(request)
      const transitioned = scopedResult(await call({ operation: 'transition', ...request }), request)
      if (transitioned.instance_version !== request.expectedVersion + 1) throw new Error('WORKFLOW_RESPONSE_VERSION')
      return transitioned
    },
  }
}
