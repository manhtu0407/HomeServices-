import { describe, expect, it, vi } from 'vitest'

import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import {
  createMobileApiHandler,
  type MobileApiAuthResult,
  type MobileApiServices,
} from '../../../../../supabase/functions/mobile-api/_shared/http'
import {
  ADMIN_SUPPORT_QUEUE_TYPES,
  ADMIN_SUPPORT_QUEUE_READ_TYPES,
  supportCaseIdentity,
  serializeAdminScopeChangeSummary,
  serializeAdminSupportQueueSummary,
  serializeSnapshotEvidence,
  serializeSnapshotTimeline,
  scrubText,
} from '../../../../../supabase/functions/mobile-api/_shared/domains/admin/operations-support'
import { matchRoute } from '../../../../../supabase/functions/mobile-api/_shared/http/routes'
import { adminSubAdminAccessSchema } from '../../../../../supabase/functions/mobile-api/_shared/http/routes/admin-control-contract'
import { ADMIN_OPERATOR_CAPABILITIES, adminOperatorProvisionSchema } from '../../../../../supabase/functions/_shared/contracts/admin-operator'
import { serializeProvisioning } from '../../../../../supabase/functions/mobile-api/_shared/domains/admin/operator-provisioning'
import { activateAdminOperator } from '../../../../../supabase/functions/mobile-api/_shared/domains/admin/admin-activation'

export const PILLAR = {
  id: 'P49-admin-operations-support',
  invariant:
    'Admin scope monitoring and support preparation use validated Production reads, exclude worker-review queues, dedupe disputes, and never inherit sensitive source columns',
  authority: [
    'governance/RULES.md #0 (server-side role and capability gates)',
    'governance/RULES.md #8 (Production data is honest and never invented)',
    'user-approved scope-monitor and support-case implementation plan',
  ],
  target: 'supabase/functions/mobile-api/_shared/domains/admin/operations-support.ts',
  layer: 'security-negative',
  siblings: ['P18-capability-registry-parity', 'P44-admin-production-sections'],
  mutation:
    'include worker_profile_verification or spread a source row into a DTO — the queue boundary or PII allowlist assertion turns red',
} as const satisfies PillarManifest

const adminAuth: MobileApiAuthResult = {
  success: true,
  user: { id: '11111111-1111-4111-8111-111111111111' },
  role: 'admin',
  supabase: {},
}

describe('Admin Operations support route contract', () => {
  it.each([
    ['GET', 'https://edge.test/admin/operations/scope-changes', 'admin.operations.scopeChanges.list'],
    ['GET', 'https://edge.test/admin/operations/scope-changes/scope-1', 'admin.operations.scopeChanges.detail'],
    ['POST', 'https://edge.test/admin/operations/scope-changes/scope-1/evidence-access', 'admin.operations.scopeChanges.evidenceAccess'],
    ['GET', 'https://edge.test/admin/operations/support-cases', 'admin.operations.supportCases.list'],
    ['GET', 'https://edge.test/admin/operations/support-cases/dispute/dispute-1', 'admin.operations.supportCases.detail'],
    ['PUT', 'https://edge.test/admin/operations/support-cases/queue/queue-1/preparation', 'admin.operations.supportCases.preparation'],
    ['POST', 'https://edge.test/admin/operations/support-cases/dispute/dispute-1/evidence-access', 'admin.operations.supportCases.evidenceAccess'],
    ['GET', 'https://edge.test/admin/operations/recovery-cases', 'admin.operations.recoveryCases.list'],
    ['GET', 'https://edge.test/admin/operations/recovery-cases/recovery-1', 'admin.operations.recoveryCases.detail'],
    ['POST', 'https://edge.test/admin/operations/recovery-cases/recovery-1/action', 'admin.operations.recoveryCases.action'],
  ] as const)('matches %s %s as %s', (method, url, kind) => {
    expect(matchRoute(new Request(url, { method }))).toMatchObject({ kind, method })
  })

  it('validates scope list filters before dispatching', async () => {
    const listAdminScopeChanges = vi.fn()
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => adminAuth),
      services: { listAdminScopeChanges } as unknown as MobileApiServices,
    })

    const response = await handler(new Request(
      'https://edge.test/admin/operations/scope-changes?limit=101&status=unknown',
    ))

    expect(response.status).toBe(400)
    expect(listAdminScopeChanges).not.toHaveBeenCalled()
  })

  it('validates preparation concurrency and bounded notes before dispatching', async () => {
    const updateAdminSupportCasePreparation = vi.fn()
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => adminAuth),
      services: { updateAdminSupportCasePreparation } as unknown as MobileApiServices,
    })

    const response = await handler(new Request(
      'https://edge.test/admin/operations/support-cases/queue/queue-1/preparation',
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ expected_version: -1, note: 'x'.repeat(1001) }),
      },
    ))

    expect(response.status).toBe(400)
    expect(updateAdminSupportCasePreparation).not.toHaveBeenCalled()
  })

  it('rejects an unversioned or unreasoned recovery mutation before dispatching', async () => {
    const applyAdminWorkflowRecoveryAction = vi.fn()
    const handler = createMobileApiHandler({
      authenticate: vi.fn(async () => adminAuth),
      services: { applyAdminWorkflowRecoveryAction } as unknown as MobileApiServices,
    })

    const response = await handler(new Request(
      'https://edge.test/admin/operations/recovery-cases/recovery-1/action',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'resolve_verified',
          reason: '',
          idempotency_key: 'f7000000-0000-4000-8000-000000000001',
          expected_version: 0,
        }),
      },
    ))

    expect(response.status).toBe(400)
    expect(applyAdminWorkflowRecoveryAction).not.toHaveBeenCalled()
  })

  it('requires operations.read whenever operations.triage is granted', () => {
    const subAdmin = adminSubAdminAccessSchema.safeParse({
      action: 'update',
      capabilities: ['operations.triage'],
      client_request_id: 'f6600000-0000-4000-8000-000000000002',
      expected_version: 2,
    })
    const provision = adminOperatorProvisionSchema.safeParse({
      capabilities: ['operations.triage'],
      email: 'manager@gmail.com',
      full_name: 'Manager QA',
      initial_password: 'Password123!',
    })

    expect(subAdmin.success).toBe(false)
    expect(provision.success).toBe(false)
    expect(adminSubAdminAccessSchema.safeParse({
      action: 'update',
      capabilities: ['operations.read', 'operations.triage'],
      client_request_id: 'f6600000-0000-4000-8000-000000000003',
      expected_version: 2,
    }).success).toBe(true)
  })

  it('accepts and returns every current operator capability', () => {
    const parsed = adminOperatorProvisionSchema.safeParse({
      capabilities: [...ADMIN_OPERATOR_CAPABILITIES],
      email: 'manager@gmail.com',
      full_name: 'Manager QA',
      initial_password: 'Password123!',
    })

    expect(parsed.success).toBe(true)
    expect(serializeProvisioning({
      id: '11111111-1111-4111-8111-111111111111',
      full_name: 'Manager QA',
      email: 'manager@gmail.com',
      status: 'pending_password_change',
      capabilities: [...ADMIN_OPERATOR_CAPABILITIES],
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z',
    })?.capabilities).toEqual([...ADMIN_OPERATOR_CAPABILITIES])
  })

  it('returns every granted capability after first-login activation', async () => {
    const actorId = '11111111-1111-4111-8111-111111111111'
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [{ email: 'manager@gmail.com', status: 'pending_password_change' }], error: null })
      .mockResolvedValueOnce({
        data: [{ ok: true, capabilities_out: [...ADMIN_OPERATOR_CAPABILITIES], activated_at: '2026-10-01T00:00:00.000Z' }],
        error: null,
      })
    const auth = {
      signInWithPassword: vi.fn().mockResolvedValue({ data: { user: { id: actorId } }, error: null }),
      updateUser: vi.fn().mockResolvedValue({ error: null }),
    }

    const result = await activateAdminOperator({
      role: 'customer',
      user: { id: actorId },
      supabase: { auth },
      privilegedSupabase: { rpc },
      userSupabase: { auth },
    } as never, { current_password: 'Password123!', new_password: 'DifferentPassword123!' })

    expect(result.capabilities).toEqual([...ADMIN_OPERATOR_CAPABILITIES])
  })
})

describe('Admin Operations support privacy and source boundaries', () => {
  it('includes only support queue domains and excludes worker review ownership', () => {
    expect(ADMIN_SUPPORT_QUEUE_TYPES).toEqual([
      'demanding_customer',
      'worker_cancellation_review',
      'worker_no_show',
      'customer_cancellation_review',
      'disintermediation_risk',
      'autonomy_escalation',
    ])
    expect(ADMIN_SUPPORT_QUEUE_TYPES).not.toEqual(expect.arrayContaining([
      'worker_application_review',
      'worker_profile_verification',
      'dispute_review',
    ]))
    expect(ADMIN_SUPPORT_QUEUE_READ_TYPES).toEqual([
      ...ADMIN_SUPPORT_QUEUE_TYPES,
      'dispute_review',
    ])
  })

  it('dedupes a dispute-review queue to its canonical dispute identity', () => {
    expect(supportCaseIdentity({
      id: 'queue-1',
      queue_type: 'dispute_review',
      safe_metadata: { dispute_id: 'dispute-1' },
    })).toBe('dispute:dispute-1')
    expect(supportCaseIdentity({
      id: 'queue-2',
      queue_type: 'worker_no_show',
      safe_metadata: {},
    })).toBe('queue:queue-2')
  })

  it('allowlists scope and queue summary fields instead of spreading PII or storage paths', () => {
    const scope = serializeAdminScopeChangeSummary({
      address_line1: 'Sensitive address',
      evidence_photo_urls: ['private/scope/photo.jpg'],
      id: 'scope-1',
      job_id: 'job-1',
      kael_computed_max: 360_000,
      kael_computed_min: 320_000,
      service_type: 'plumbing',
      status: 'waiting_customer_decision',
      updated_at: '2026-08-25T08:00:00.000Z',
    }, {
      display_code: 'NS-1234',
      id: 'job-1',
      status: 'completed',
      updated_at: '2026-08-25T09:00:00.000Z',
    })
    const queue = serializeAdminSupportQueueSummary({
      actor_email: 'private@example.com',
      id: 'queue-1',
      job_id: 'job-1',
      priority: 'high',
      queue_type: 'worker_no_show',
      reason_code: 'worker_no_show_after_acceptance',
      safe_metadata: { phone: '0909000000' },
      status: 'open',
      updated_at: '2026-08-25T07:00:00.000Z',
    })

    expect(scope).toEqual({
      delta_max_vnd: 360_000,
      delta_min_vnd: 320_000,
      display_code: 'NS-1234',
      job_id: 'job-1',
      scope_change_id: 'scope-1',
      service_type: 'plumbing',
      status: 'waiting_customer_decision',
      updated_at: '2026-08-25T08:00:00.000Z',
    })
    expect(queue).toEqual({
      case_id: 'queue-1',
      job_id: 'job-1',
      priority: 'high',
      reason_code: 'worker_no_show_after_acceptance',
      source: 'queue',
      source_status: 'open',
      type: 'worker_no_show',
      updated_at: '2026-08-25T07:00:00.000Z',
    })
    expect(
      JSON.stringify({ scope, queue }),
      pillarWhy(PILLAR, 'list DTOs must not disclose evidence paths, full contacts, or job addresses'),
    ).not.toMatch(/private\/scope|private@example|0909000000|Sensitive address/)
  })

  it('reduces immutable evidence snapshots to metadata without returning raw storage references', () => {
    const snapshot = {
      evidence_locked_at: '2026-08-25T07:00:00.000Z',
      evidence_snapshot: {
        chat_message_ids: ['message-1'],
        kael_artifacts: ['artifact-1'],
        photo_urls: ['supabase://private-bucket/job-1/dispute/private.jpg'],
        scope_changes: ['scope-1'],
        status_timeline: [{ at: '2026-08-25T06:00:00.000Z', event_type: 'job_status_changed' }],
      },
      id: 'snapshot-1',
    }
    const evidence = serializeSnapshotEvidence(snapshot)
    const timeline = serializeSnapshotTimeline(snapshot)

    expect(evidence).toHaveLength(5)
    expect(timeline).toEqual([{
      key: 'job_status_changed',
      label: 'locked_job_event',
      occurred_at: '2026-08-25T06:00:00.000Z',
    }])
    expect(JSON.stringify({ evidence, timeline })).not.toContain('private-bucket')
    expect(scrubText('Gọi 0909000000 hoặc private@example.com')).toBe('Gọi [số điện thoại đã ẩn] hoặc [email đã ẩn]')
  })
})
