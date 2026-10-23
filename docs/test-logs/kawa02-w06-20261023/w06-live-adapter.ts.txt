import { createClient } from 'npm:@supabase/supabase-js@2.105.4'
import { createDurableWorkflowStore } from '../supabase/functions/mobile-api/_shared/domains/kael-chat/workflow-checkpoints.ts'
import { createWorkflowRegistry } from '../supabase/functions/mobile-api/_shared/kael/pipeline/workflow-registry.ts'
import { CAPABILITY_REGISTRY_SOURCE_SHA256 } from '../supabase/functions/mobile-api/_shared/platform/authz/capability-registry.ts'
const url = 'http://supabase_kong_nestscout-kawa06-20261023:8000'
const key = Deno.env.get('W06_SERVICE_KEY')
if (!key) throw new Error('missing isolated local service credential')
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const actor = 'd4360000-0000-4000-8000-000000000001'
const principal = { user: { id: actor }, role: 'customer' as const }
const pin = { service: 'electrical', policyId: 'd4360000-0000-4000-8000-000000000901', version: 1 }
const registry = createWorkflowRegistry({ owner: 'kael.pipeline', policyPins: [pin] })
registry.register({
  schemaVersion: 'workflow-definition/v1', workflowId: 'adapter_checkpoint_fixture', version: 1, owner: 'kael.pipeline', roles: ['customer'], services: ['electrical'],
  rollout: 'local_test', deadlineMs: 300000, trigger: 'case_turn', input: { fields: [] }, policyPins: [pin], capabilityRegistry: { version: '1.0.0', sourceSha256: CAPABILITY_REGISTRY_SOURCE_SHA256 }, capabilityPins: [],
  budget: { maxSteps: 8, maxCalls: 0, maxCostMicrousd: 0, maxDurationMs: 300000 }, approval: { required: false, actorRoles: ['customer'], expiresInMs: 1000, payloadBinding: 'sha256', jobBinding: 'required' },
  entry: 'start', terminalStates: ['succeeded'], nodes: [{ id: 'start', kind: 'validate', timeoutMs: 100, maxVisits: 1 }, { id: 'done', kind: 'finish', terminalState: 'succeeded', timeoutMs: 100, maxVisits: 1 }], edges: [{ from: 'start', to: 'done', kind: 'success' }],
})
const store = createDurableWorkflowStore(client, registry, principal)
const identity = { instanceId: crypto.randomUUID(), actorId: actor, actorRole: 'customer', jobId: null, caseId: null }
const created = await store.create({ ...identity, workflowId: 'adapter_checkpoint_fixture', definitionVersion: 1, idempotencyKey: crypto.randomUUID(), deadlineAt: new Date(Date.now()+60000).toISOString() })
if (created.instance_version !== 0) throw new Error('bad create version')
const request = { ...identity, expectedVersion: 0, idempotencyKey: crypto.randomUUID(), action: 'advance', nextNode: 'done' }
const first = await store.transition(request)
const duplicate = await store.transition(request)
if (first.instance_version !== 1 || first.status !== 'succeeded' || JSON.stringify(first)!==JSON.stringify(duplicate)) throw new Error('not idempotent')
const emptyRegistry = createWorkflowRegistry({ owner: 'kael.pipeline', policyPins: [pin] })
const recovered = await createDurableWorkflowStore(client, emptyRegistry, principal).load(identity)
if (recovered.checkpoints.length !== 2 || recovered.definition.version !== 1 || recovered.state.status !== 'succeeded') throw new Error('not recoverable')
console.log(JSON.stringify({ result: 'PASS', target: 'nestscout-kawa06-20261023', instanceId: identity.instanceId, createVersion: created.instance_version, terminalVersion: first.instance_version, idempotentReplay: true, freshStoreRecovery: true, checkpointCount: recovered.checkpoints.length }))
