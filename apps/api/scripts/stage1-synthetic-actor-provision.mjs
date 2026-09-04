#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

import { checkHarnessRelease, resolveReleaseArtifactPath } from '../../../scripts/harness/release-bundle.mjs'
import { assertReleaseTarget } from '../../../scripts/harness/release-safety.mjs'
import {
  buildSyntheticActorProvisionReceipt,
  validateSyntheticActorProvisionInput,
} from './lib/stage1-synthetic-actor-core.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const PRESENTATION = Object.freeze({
  customer: 'Khách hàng NestScout',
  worker: 'Đối tác NestScout',
})
const SERVICE_TYPES = Object.freeze(['electrical', 'plumbing', 'cleaning', 'hvac', 'upholstery', 'handyman'])
const WORKER_CAPABILITIES = Object.freeze([
  'electrical_fault_isolation',
  'fixed_wiring_and_panel_safety',
  'device_repair_or_replacement',
  'electrical_installation',
])

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const release = JSON.parse(readFileSync(resolveReleaseArtifactPath(ROOT, options.release), 'utf8'))
  const releaseProblems = checkHarnessRelease(release)
  if (releaseProblems.length > 0) throw new Error(`release artifact is invalid: ${releaseProblems.join('; ')}`)
  const target = assertReleaseTarget(options)
  if (release.environment !== target.environment || release.releaseId !== options.releaseId) {
    throw new Error('synthetic actor target does not match the immutable release')
  }
  const input = {
    releaseId: release.releaseId,
    environment: target.environment,
    cohortId: options.cohort,
    runId: options.runId,
    customer: dedicatedCredential('CUSTOMER'),
    worker: dedicatedCredential('WORKER'),
  }
  const credentials = validateSyntheticActorProvisionInput(input)
  const approval = `stage1-actors:${options.runId}:${options.cohort}`
  if (process.env.STAGE1_ACTOR_PROVISION_APPROVAL?.trim() !== approval) {
    throw new Error('explicit synthetic actor provision approval is missing')
  }

  const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  const anonKey = requiredEnv('STAGE1_SUPABASE_ANON_KEY')
  const admin = createClient(target.projectUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const actors = await ensureAuthActors(admin, credentials)
  await waitForProfiles(admin, actors)
  await makeProfilesSafe(admin, actors)
  const binding = await bindCohort(admin, options.cohort, actors)
  await activateClassifiedWorker(admin, options.cohort, actors.worker.id)
  const classification = await verifyClassification(admin, options.cohort, actors)
  await unbanActors(admin, actors)
  await verifyAuthentication(target.projectUrl, anonKey, credentials, actors)

  const receipt = buildSyntheticActorProvisionReceipt({
    ...input,
    createdActorCount: Number(actors.customer.created) + Number(actors.worker.created),
    reusedActorCount: Number(!actors.customer.created) + Number(!actors.worker.created),
    boundMemberCount: binding.boundMemberCount,
    workerMarkerCount: classification.workerMarkerCount,
    presentationSafe: true,
    authenticationVerified: true,
  })
  const output = resolveReleaseArtifactPath(ROOT, options.output)
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(receipt, null, 2)}\n`)
  process.stdout.write(`Stage 1 synthetic actors provisioned: ${relative(ROOT, output).replaceAll('\\', '/')}\n`)
}

async function ensureAuthActors(admin, credentials) {
  const customer = await ensureAuthActor(admin, 'customer', credentials.customer)
  const worker = await ensureAuthActor(admin, 'worker', credentials.worker)
  if (customer.id === worker.id) throw new Error('synthetic Customer and Worker resolved to one identity')
  return { customer, worker }
}

async function ensureAuthActor(admin, role, credential) {
  const existing = await findUserByEmail(admin, credential.email)
  const marker = { nestscout_synthetic_actor: true, nestscout_synthetic_role: role }
  if (existing) {
    const { data, error } = await admin.auth.admin.updateUserById(existing.id, {
      password: credential.password,
      ban_duration: '876000h',
      user_metadata: { ...(existing.user_metadata ?? {}), full_name: PRESENTATION[role], name: PRESENTATION[role] },
      app_metadata: { ...(existing.app_metadata ?? {}), ...marker },
    })
    if (error || !data.user) throw new Error(`existing synthetic ${role} could not be made safe`)
    return { id: data.user.id, created: false }
  }
  const { data, error } = await admin.auth.admin.createUser({
    email: credential.email,
    password: credential.password,
    email_confirm: true,
    ban_duration: '876000h',
    user_metadata: { full_name: PRESENTATION[role], name: PRESENTATION[role] },
    app_metadata: marker,
  })
  if (error || !data.user) throw new Error(`dedicated synthetic ${role} could not be created in a banned state`)
  return { id: data.user.id, created: true }
}

async function findUserByEmail(admin, email) {
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1_000 })
    if (error) throw new Error('synthetic Auth inventory could not be read')
    const matches = data.users.filter((user) => user.email?.toLowerCase() === email)
    if (matches.length > 1) throw new Error('dedicated synthetic email is not unique')
    if (matches.length === 1) return matches[0]
    if (data.users.length < 1_000) return null
  }
  throw new Error('synthetic Auth inventory exceeded the bounded lookup')
}

async function waitForProfiles(admin, actors) {
  const actorIds = [actors.customer.id, actors.worker.id]
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const { data, error } = await admin.from('profiles').select('id').in('id', actorIds)
    if (!error && data?.length === actorIds.length) return
    await new Promise((resolveWait) => setTimeout(resolveWait, 250))
  }
  throw new Error('synthetic profile trigger did not converge')
}

async function makeProfilesSafe(admin, actors) {
  for (const role of ['customer', 'worker']) {
    const actor = actors[role]
    const { data, error } = await admin.from('profiles')
      .update({ role, full_name: PRESENTATION[role] }).eq('id', actor.id).select('id,role,full_name')
    if (error || data?.length !== 1 || data[0].role !== role || data[0].full_name !== PRESENTATION[role]) {
      throw new Error(`synthetic ${role} profile could not be normalized`)
    }
  }
  const { error } = await admin.from('worker_profiles').upsert({
    id: actors.worker.id,
    legal_name: PRESENTATION.worker,
    date_of_birth: '1990-01-01',
    service_types: [...SERVICE_TYPES],
    selected_service_types: [...SERVICE_TYPES],
    active_service_types: [...SERVICE_TYPES],
    years_experience: 8,
    districts: ['q7'],
    is_approved: false,
    is_available: false,
    is_suspended: true,
    verification_status: 'approved',
    problem_specializations: [...WORKER_CAPABILITIES],
    matching_push_proven_at: null,
    matching_foreground_active_until: null,
  })
  if (error) throw new Error('synthetic Worker could not be initialized in a disabled state')
}

async function bindCohort(admin, cohortId, actors) {
  const { data, error } = await admin.rpc('bind_synthetic_matching_cohort', {
    p_cohort_id: cohortId,
    p_customer_ids: [actors.customer.id],
    p_worker_ids: [actors.worker.id],
  })
  const row = data?.[0]
  if (error || row?.bound_customers !== 1 || row?.bound_workers !== 1) {
    throw new Error('synthetic actor cohort binding failed closed')
  }
  return { boundMemberCount: row.bound_customers + row.bound_workers }
}

async function activateClassifiedWorker(admin, cohortId, workerId) {
  const { data, error } = await admin.from('worker_profiles').update({
    is_approved: true,
    is_available: true,
    is_suspended: false,
    matching_push_proven_at: null,
    matching_foreground_active_until: null,
  }).eq('id', workerId).eq('synthetic_cohort_id', cohortId).select('id,synthetic_cohort_id')
  if (error || data?.length !== 1 || data[0].synthetic_cohort_id !== cohortId) {
    throw new Error('synthetic Worker cannot be activated before permanent classification')
  }
}

async function verifyClassification(admin, cohortId, actors) {
  const actorIds = [actors.customer.id, actors.worker.id]
  const { data: members, error: memberError } = await admin.from('synthetic_matching_cohort_members')
    .select('profile_id,member_role').eq('cohort_id', cohortId).in('profile_id', actorIds)
  const { data: workers, error: workerError } = await admin.from('worker_profiles')
    .select('id,synthetic_cohort_id').eq('id', actors.worker.id).eq('synthetic_cohort_id', cohortId)
  if (memberError || workerError || members?.length !== 2 || workers?.length !== 1 ||
      !members.some((member) => member.profile_id === actors.customer.id && member.member_role === 'customer') ||
      !members.some((member) => member.profile_id === actors.worker.id && member.member_role === 'worker')) {
    throw new Error('synthetic actor classification proof is incomplete')
  }
  return { workerMarkerCount: workers.length }
}

async function unbanActors(admin, actors) {
  for (const role of ['customer', 'worker']) {
    const { error } = await admin.auth.admin.updateUserById(actors[role].id, { ban_duration: 'none' })
    if (error) throw new Error(`classified synthetic ${role} could not be enabled`)
  }
}

async function verifyAuthentication(projectUrl, anonKey, credentials, actors) {
  for (const role of ['customer', 'worker']) {
    const client = createClient(projectUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await client.auth.signInWithPassword(credentials[role])
    if (error || data.user?.id !== actors[role].id || !data.session?.access_token) {
      throw new Error(`classified synthetic ${role} authentication failed`)
    }
    await client.auth.signOut()
  }
}

function dedicatedCredential(role) {
  const email = requiredEnv(`STAGE1_SYNTHETIC_${role}_EMAIL`).toLowerCase()
  const password = requiredEnv(`STAGE1_SYNTHETIC_${role}_PASSWORD`)
  return { email, password }
}

function parseArgs(args) {
  const values = {}
  const allowed = new Set([
    '--release', '--release-id', '--cohort', '--run-id', '--environment', '--project-ref',
    '--project-url', '--output',
  ])
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index]
    if (!allowed.has(key)) throw new Error(`unknown argument: ${key}`)
    const value = args[++index]
    if (!value || value.startsWith('--')) throw new Error(`${key} requires a value`)
    values[key.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())] = value
  }
  for (const key of ['release', 'releaseId', 'cohort', 'runId', 'environment', 'projectRef', 'projectUrl', 'output']) {
    if (!values[key]) throw new Error(`synthetic actor provision option is missing: ${key}`)
  }
  return values
}

function requiredEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`missing required environment variable ${name}`)
  return value
}

await main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
