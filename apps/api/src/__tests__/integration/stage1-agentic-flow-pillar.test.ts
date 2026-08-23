import { randomUUID } from 'node:crypto'

import { SERVICE_TYPES, type Database } from '@nestscout/shared'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { Stage1SyntheticReleaseSmoke } from '../../../scripts/stage1-synthetic-release-smoke.mjs'
import { pillarWhy, type PillarManifest } from '../pillar-manifest'
import { resolveOrAnnounceSkip } from './integration-target'

export const PILLAR = {
  id: 'P59-stage1-hosted-agentic-flow',
  invariant: 'the hosted Staging Edge runtime completes governed auto-quote, unpriced RFQ or inspection, lost-confirm recovery, durable Worker delivery, and official Customer-Worker matching inside one isolated synthetic cohort',
  authority: [
    'governance/RULES.md #7',
    'governance/STRUCTURES.md Stage 1',
    'docs/dev-suggestion/stage1-intake-quote-admin-proposal.md',
  ],
  target: 'Staging mobile-api, Auth, Postgres/RPC, durable outbox, and Worker inbox',
  layer: 'integration',
  siblings: ['P43-staging-service-catalog', 'P48-durable-confirmation-operation', 'P54-synthetic-cohort-nonvisibility'],
  mutation: 'disable the deployed outbox dispatcher, remove RFQ confirmation, reuse one idempotency key for two jobs, or expose a synthetic actor to a real-user query; the hosted flow or isolation receipt turns red',
} as const satisfies PillarManifest

const resolution = await resolveOrAnnounceSkip(PILLAR.id)
const isHostedStaging = resolution.ok && !resolution.target.isLocal
const describeIntegration = isHostedStaging ? describe : describe.skip

type RuntimeHealth = {
  status: string
  environment: { name: string; project_ref: string | null }
  release: {
    release_id: string
    git_sha: string
    registered: boolean
    client_compatibility: {
      contractEpoch: number
      ios: {
        applicationId: string
        minimumBuildNumber: number
        easBuildId: string
        runtimeVersion: string
      }
    } | null
  }
}

let admin: SupabaseClient<Database> | null = null
let smoke: Stage1SyntheticReleaseSmoke | null = null
let customerId: string | null = null
let workerId: string | null = null
const suffix = randomUUID().replaceAll('-', '')
const customer = {
  email: `stage1-customer-${suffix}@example.test`,
  password: `Stage1-Customer-${suffix}!`,
}
const worker = {
  email: `stage1-worker-${suffix}@example.test`,
  password: `Stage1-Worker-${suffix}!`,
}

describeIntegration('Stage 1 hosted Agentic Customer-Worker flow', () => {
  beforeAll(async () => {
    if (!resolution.ok || resolution.target.isLocal) return
    admin = createClient<Database>(resolution.target.url, resolution.target.serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: boundedFetch },
    })
    const health = await loadRuntimeHealth(resolution.target.url, resolution.target.anonKey)
    assertStagingRuntimeHealth(health)

    const createdCustomer = await admin.auth.admin.createUser({
      email: customer.email,
      password: customer.password,
      email_confirm: true,
      user_metadata: { full_name: 'Stage 1 Synthetic Customer' },
    })
    if (createdCustomer.error || !createdCustomer.data.user) {
      throw new Error(`synthetic Customer provisioning failed: ${createdCustomer.error?.message ?? 'missing user'}`)
    }
    customerId = createdCustomer.data.user.id

    const createdWorker = await admin.auth.admin.createUser({
      email: worker.email,
      password: worker.password,
      email_confirm: true,
      user_metadata: { full_name: 'Stage 1 Synthetic Worker' },
    })
    if (createdWorker.error || !createdWorker.data.user) {
      throw new Error(`synthetic Worker provisioning failed: ${createdWorker.error?.message ?? 'missing user'}`)
    }
    workerId = createdWorker.data.user.id

    const { error: roleError } = await admin.from('profiles').update({ role: 'worker' }).eq('id', workerId)
    if (roleError) throw new Error(`synthetic Worker role provisioning failed: ${roleError.message}`)
    const { error: profileError } = await admin.from('worker_profiles').upsert({
      id: workerId,
      legal_name: 'Stage 1 Synthetic Worker',
      date_of_birth: '1990-01-01',
      service_types: [...SERVICE_TYPES],
      selected_service_types: [...SERVICE_TYPES],
      active_service_types: [...SERVICE_TYPES],
      years_experience: 8,
      districts: ['q7'],
      is_approved: true,
      is_available: true,
      is_suspended: false,
      verification_status: 'approved',
      problem_specializations: [
        'electrical_fault_isolation',
        'fixed_wiring_and_panel_safety',
        'device_repair_or_replacement',
        'electrical_installation',
      ],
    })
    if (profileError) throw new Error(`synthetic Worker profile provisioning failed: ${profileError.message}`)

    const compatibility = health.release.client_compatibility!
    const releaseId = health.release.release_id
    const cohortId = `synthetic-stage1-${releaseId.slice(8, 20)}-${releaseId.slice(21)}-vitest${suffix.slice(0, 12)}`
    smoke = new Stage1SyntheticReleaseSmoke({
      environment: 'staging',
      projectRef: health.environment.project_ref,
      projectUrl: resolution.target.url,
      apiBaseUrl: `${resolution.target.url}/functions/v1/mobile-api`,
      anonKey: resolution.target.anonKey,
      serviceRoleKey: resolution.target.serviceRoleKey,
      customer,
      worker,
      release: { releaseId, gitSha: health.release.git_sha },
      cohortId,
      runId: `vitest:${suffix}`,
      sequence: 1,
      mobileAttestation: { contractEpoch: compatibility.contractEpoch },
      clientBinary: {
        applicationId: compatibility.ios.applicationId,
        buildNumber: compatibility.ios.minimumBuildNumber,
        easBuildId: compatibility.ios.easBuildId,
        runtimeVersion: compatibility.ios.runtimeVersion,
      },
    })
  }, 45_000)

  afterAll(async () => {
    if (smoke?.actorIds && !smoke.cleanupCompleted) await smoke.cleanupCohort()
    if (admin && workerId) await admin.auth.admin.deleteUser(workerId)
    if (admin && customerId) await admin.auth.admin.deleteUser(customerId)
  }, 45_000)

  it('runs real auto-quote, RFQ or inspection, recovery, delivery, and official match', async () => {
    expect(smoke, pillarWhy(PILLAR, 'the registered Staging release must be available')).not.toBeNull()
    const result = await smoke!.run().catch((error: unknown) => {
      console.info(`[P59_SLO_FAILURE] ${JSON.stringify({
        confirmLatenciesMs: [...smoke!.confirmLatencies],
        workerOfferLatenciesMs: [...smoke!.offerLatencies],
        completedScenarioCount: smoke!.results.length,
      })}`)
      throw error
    })
    expect(result.status, pillarWhy(PILLAR, 'hosted synthetic Stage 1 smoke status')).toBe('passed')
    expect(result.observation.scenarios, pillarWhy(PILLAR, 'required scenario observation')).toEqual({
      autoQuote: true,
      rfqOrInspection: true,
      recovery: true,
    })
    expect(result.receipt, pillarWhy(PILLAR, 'Staging must not mint a Production promotion receipt')).toBeNull()
    expect(result.observation.duplicateJobCount, pillarWhy(PILLAR, 'duplicate jobs')).toBe(0)
    expect(result.observation.duplicateBroadcastCount, pillarWhy(PILLAR, 'duplicate broadcasts')).toBe(0)
    expect(result.observation.syntheticLeakCount, pillarWhy(PILLAR, 'synthetic leak count')).toBe(0)
    expect(result.observation.safeErrorCodeRatio, pillarWhy(PILLAR, 'safe error and trace coverage')).toBe(1)
    console.info(`[P59_SLO_OBSERVATION] ${JSON.stringify(result.observation)}`)
  }, 240_000)
})

async function loadRuntimeHealth(projectUrl: string, anonKey: string): Promise<RuntimeHealth> {
  const response = await boundedFetch(`${projectUrl}/functions/v1/mobile-api/harness/health`, {
    headers: { apikey: anonKey },
  })
  if (!response.ok) throw new Error(`Staging release health returned HTTP ${response.status}`)
  return response.json() as Promise<RuntimeHealth>
}

function assertStagingRuntimeHealth(health: RuntimeHealth): void {
  const compatibility = health.release.client_compatibility
  if (health.status !== 'ok' || health.environment.name !== 'staging' || !health.environment.project_ref ||
      !health.release.registered || health.release.release_id === 'unreleased' ||
      !/^[0-9a-f]{40}$/u.test(health.release.git_sha) || compatibility?.contractEpoch !== 2 ||
      !compatibility.ios.applicationId || !compatibility.ios.minimumBuildNumber ||
      !compatibility.ios.easBuildId || !compatibility.ios.runtimeVersion) {
    throw new Error('Staging Edge runtime does not expose one complete registered release identity')
  }
}

async function boundedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 90_000)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}
