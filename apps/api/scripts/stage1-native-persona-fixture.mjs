#!/usr/bin/env node
import { randomUUID } from 'node:crypto'

import { createClient } from '@supabase/supabase-js'

import { SERVICE_TYPES } from '../../../packages/shared/src/constants.ts'

const STAGING_PROJECT_REF = 'xyylanuyflrjzbjzhqfl'
const STAGING_URL = `https://${STAGING_PROJECT_REF}.supabase.co`
const CUSTOMER_PRESENTATION_NAME = 'Khách hàng NestScout'
const WORKER_PRESENTATION_NAME = 'Đối tác NestScout'

const mode = process.argv[2]
if (!new Set(['cleanup', 'prepare']).has(mode)) {
  throw new Error('usage: stage1-native-persona-fixture.mjs <prepare|cleanup>')
}

const projectUrl = required('STAGE1_SUPABASE_URL').replace(/\/+$/u, '')
if (projectUrl !== STAGING_URL) throw new Error('native persona fixture is restricted to registered Staging')
const admin = createClient(projectUrl, required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
})
const customer = credentials('STAGE1_SYNTHETIC_CUSTOMER')
const worker = credentials('STAGE1_SYNTHETIC_WORKER')

const result = mode === 'prepare'
  ? await prepareFixture()
  : await cleanupFixture()
process.stdout.write(`${JSON.stringify(result)}\n`)

async function prepareFixture() {
  const createdIds = []
  try {
    const customerId = await createActor(customer, CUSTOMER_PRESENTATION_NAME)
    createdIds.push(customerId)
    const workerId = await createActor(worker, WORKER_PRESENTATION_NAME)
    createdIds.push(workerId)

    const { error: roleError } = await admin.from('profiles').update({ role: 'worker' }).eq('id', workerId)
    if (roleError) throw new Error(`synthetic Worker role provisioning failed: ${roleError.message}`)
    const { error: customerNameError } = await admin.from('profiles')
      .update({ full_name: CUSTOMER_PRESENTATION_NAME }).eq('id', customerId)
    if (customerNameError) throw new Error(`synthetic Customer presentation failed: ${customerNameError.message}`)
    const { error: workerNameError } = await admin.from('profiles')
      .update({ full_name: WORKER_PRESENTATION_NAME }).eq('id', workerId)
    if (workerNameError) throw new Error(`synthetic Worker presentation failed: ${workerNameError.message}`)
    const { error: profileError } = await admin.from('worker_profiles').upsert({
      id: workerId,
      legal_name: WORKER_PRESENTATION_NAME,
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

    const health = await fetch(`${projectUrl}/functions/v1/mobile-api/harness/health`, {
      headers: { apikey: required('STAGE1_SUPABASE_ANON_KEY') },
    })
    if (!health.ok) throw new Error(`Staging health returned HTTP ${health.status}`)
    const releaseId = (await health.json())?.release?.release_id
    if (!/^harness-[0-9a-f]{12}-[0-9a-f]{12}$/u.test(releaseId ?? '')) {
      throw new Error('Staging has no registered release identity')
    }
    const runId = `native${randomUUID().replaceAll('-', '').slice(0, 12)}`
    const cohortId = `synthetic-stage1-${releaseId.slice(8, 20)}-${releaseId.slice(21)}-${runId}`
    const { data: bound, error: cohortError } = await admin.rpc('bind_synthetic_matching_cohort', {
      p_cohort_id: cohortId,
      p_customer_ids: [customerId],
      p_worker_ids: [workerId],
    })
    if (cohortError || bound?.[0]?.bound_customers !== 1 || bound?.[0]?.bound_workers !== 1) {
      throw new Error(`synthetic cohort binding failed: ${cohortError?.message ?? 'count mismatch'}`)
    }
    return { status: 'prepared', cohortId, customerId, workerId, releaseId }
  } catch (error) {
    for (const userId of createdIds.reverse()) await admin.auth.admin.deleteUser(userId)
    throw error
  }
}

async function cleanupFixture() {
  const cohortId = required('STAGE1_SYNTHETIC_COHORT_ID')
  if (!/^synthetic-stage1-[0-9a-f-]+-native[0-9a-f]{12}$/u.test(cohortId)) {
    throw new Error('native synthetic cohort ID is invalid')
  }
  const { error: cleanupError } = await admin.rpc('cleanup_synthetic_matching_cohort', {
    p_cohort_id: cohortId,
  })
  if (cleanupError) throw new Error(`synthetic cohort cleanup failed: ${cleanupError.message}`)
  const users = await findFixtureUsers(new Set([customer.email, worker.email]))
  for (const user of users) {
    const { error } = await admin.auth.admin.deleteUser(user.id)
    if (error) throw new Error(`synthetic Auth cleanup failed: ${error.message}`)
  }
  return { status: 'cleaned', cohortId, deletedAuthUsers: users.length }
}

async function createActor(actor, fullName) {
  const { data, error } = await admin.auth.admin.createUser({
    email: actor.email,
    password: actor.password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })
  if (error || !data.user) throw new Error(`synthetic actor provisioning failed: ${error?.message ?? 'missing user'}`)
  return data.user.id
}

async function findFixtureUsers(emails) {
  const found = []
  for (let page = 1; page <= 20 && found.length < emails.size; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 })
    if (error) throw new Error(`synthetic Auth lookup failed: ${error.message}`)
    found.push(...data.users.filter((user) => emails.has(user.email?.toLowerCase() ?? '')))
    if (data.users.length < 100) break
  }
  return found
}

function credentials(prefix) {
  const email = required(`${prefix}_EMAIL`).toLowerCase()
  const password = required(`${prefix}_PASSWORD`)
  if (!email.endsWith('@example.test') || password.length < 16) {
    throw new Error(`${prefix} must be a dedicated @example.test identity with a strong password`)
  }
  return { email, password }
}

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`missing required environment variable ${name}`)
  return value
}
