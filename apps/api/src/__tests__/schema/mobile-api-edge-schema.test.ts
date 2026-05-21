import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../../../../../')
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf-8')
const readMigrations = () => {
  const dir = resolve(ROOT, 'supabase/migrations')
  return readdirSync(dir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => read(`supabase/migrations/${name}`))
    .join('\n')
}

describe('mobile-api Edge schema compatibility', () => {
  it('allows rejected scope-change decisions written by the atomic RPC', () => {
    const migration = read('supabase/migrations/20260517225000_scope_change_decision_check.sql')
    const rpc = read('supabase/migrations/20260516144400_atomic_rpc_functions.sql')

    expect(rpc).toContain("v_decision_text := 'rejected'")
    expect(migration).toContain('jobs_scope_change_customer_decision_check')
    expect(migration).toContain("'approved', 'rejected', 'cancelled'")
  })

  it('lets the mobile-api function own auth and CORS handling', () => {
    const config = read('supabase/config.toml')

    expect(config).toContain('[functions.mobile-api]')
    expect(config).toContain('verify_jwt = false')
  })

  it('keeps Edge runtime imports deployable without workspace package dependencies', () => {
    const functionFiles = [
      'supabase/functions/mobile-api/index.ts',
      'supabase/functions/mobile-api/_shared/auth.ts',
      'supabase/functions/mobile-api/_shared/kael.ts',
      'supabase/functions/mobile-api/_shared/lifecycle.ts',
      'supabase/functions/mobile-api/_shared/router.ts',
      'supabase/functions/mobile-api/_shared/services.ts',
      'supabase/functions/_shared/domain.ts',
    ].map(read).join('\n')

    expect(functionFiles).not.toContain('packages/shared')
    expect(functionFiles).toContain('jobCreateSchema')
    expect(functionFiles).toContain('normalizeDistrict')
  })

  it('does not ship mojibake Vietnamese error messages from mobile-api Edge runtime', () => {
    const functionFiles = [
      'supabase/functions/mobile-api/_shared/router.ts',
      'supabase/functions/mobile-api/_shared/services.ts',
    ].map(read).join('\n')

    expect(functionFiles).not.toMatch(new RegExp([
      '\\u00c3',
      '\\u00c2',
      '\\u00e1\\u00ba',
      '\\u00e1\\u00bb',
      '\\u00c4\\u0090',
      '\\u00c4\\u2018',
      '\\u00c6',
    ].join('|')))
    expect(functionFiles).toContain('Dữ liệu không hợp lệ')
    expect(functionFiles).toContain('Không thể gửi yêu cầu hủy việc')
    expect(functionFiles).toContain('Không thể lưu thiết bị nhận thông báo')
  })

  it('requires a concrete HCMC district before customer job creation', () => {
    const edgeDomain = read('supabase/functions/_shared/domain.ts')
    const edgeServices = read('supabase/functions/mobile-api/_shared/services.ts')
    const nextCreateJob = read('apps/api/src/lib/jobs/create-job.ts')
    const mobileProvider = read('apps/mobile/lib/frontend-workflow-provider.tsx')

    expect(edgeDomain).toContain('normalizeServiceAreaDistrict')
    expect(edgeServices).toContain('normalizeServiceAreaDistrict')
    expect(edgeServices).toContain('input.address_district')
    expect(nextCreateJob).toContain('normalizeServiceAreaDistrict(input.address_district)')
    expect(nextCreateJob).toContain("code: 'VALIDATION'")
    expect(mobileProvider).toContain('extractKnownDistrictLabel')
    expect(mobileProvider).toContain('address_district: districtLabel')
  })

  it('requires a concrete HCMC district again before broadcasting a job', () => {
    const edgeServices = read('supabase/functions/mobile-api/_shared/services.ts')
    const nextConfirmSearch = read('apps/api/src/app/api/jobs/[id]/confirm-search/route.ts')

    expect(edgeServices).toContain('normalizeServiceAreaDistrict')
    expect(edgeServices).toContain('nullableString(job.address_district)')
    expect(edgeServices).toContain('Địa chỉ cần có quận TP.HCM rõ ràng')
    expect(edgeServices).not.toContain('job.address_district || "hcmc_all"')
    expect(nextConfirmSearch).toContain('normalizeServiceAreaDistrict(job.address_district')
    expect(nextConfirmSearch).not.toContain("job.address_district ?? 'hcmc_all'")
  })

  it('skips learning candidate writes when reviewed legacy jobs lack a concrete district', () => {
    const learningHook = read('apps/api/src/lib/learning/hook.ts')

    expect(learningHook).toContain('normalizeServiceAreaDistrict(job.address_district)')
    expect(learningHook).toContain('if (!districtCode) return null')
    expect(learningHook).not.toContain("districtCode: job.address_district ?? 'hcmc_all'")
  })

  it('does not fake a service catalog when price baselines fail to load', () => {
    const edgeServices = read('supabase/functions/mobile-api/_shared/services.ts')
    const nextServices = read('apps/api/src/app/api/services/route.ts')

    expect(edgeServices).toContain('apiFailure("DB_ERROR", "Không thể tải bảng giá nền", 500)')
    expect(nextServices).toContain("return apiError('DB_ERROR', 'Không thể tải bảng giá nền', 500)")
    expect(edgeServices).toContain('filter(uniqueCatalogBaseline)')
    expect(nextServices).toContain('baselineKeysByService')
    expect(nextServices).toContain('serviceKeys.has(baselineKey)')
    expect(edgeServices).not.toContain('baselines fetch failed')
    expect(nextServices).not.toContain('Failed to fetch baselines')
  })

  it('uses the classified problem slug when fetching Kael price baselines', () => {
    const edgeKael = read('supabase/functions/mobile-api/_shared/kael.ts')
    const nextBaseline = read('apps/api/src/lib/kael/baseline.ts')

    expect(edgeKael).toContain('intent.problem_slug')
    expect(edgeKael).toContain('.from("service_problems")')
    expect(edgeKael).toContain('.eq("slug", problemSlug)')
    expect(edgeKael).toContain('.eq("service_problem_id", problemId)')
    expect(nextBaseline).toContain(".from('service_problems')")
    expect(nextBaseline).toContain(".eq('slug', problemSlug)")
    expect(nextBaseline).toContain(".eq('service_problem_id', problemId)")
  })

  it('persists the resolved service problem id on created jobs', () => {
    const edgeKael = read('supabase/functions/mobile-api/_shared/kael.ts')
    const edgeServices = read('supabase/functions/mobile-api/_shared/services.ts')
    const nextPipeline = read('apps/api/src/lib/kael/pipeline.ts')
    const nextCreateJob = read('apps/api/src/lib/jobs/create-job.ts')

    expect(edgeKael).toContain('serviceProblemId: baselineStage.result.serviceProblemId')
    expect(edgeServices).toContain('service_problem_id: pipeline.serviceProblemId')
    expect(nextPipeline).toContain('serviceProblemId: baselineResult.serviceProblemId')
    expect(nextCreateJob).toContain('service_problem_id: pipelineResult.serviceProblemId')
  })

  it('keeps AI provider model ids away from known deprecation paths', () => {
    const source = [
      'supabase/functions/mobile-api/_shared/kael.ts',
      'apps/api/src/lib/jobs/create-job.ts',
      'apps/api/src/lib/kael/intent.ts',
    ].map(read).join('\n')

    expect(source).toContain('deepseek-v4-flash')
    expect(source).not.toContain('deepseek-chat')
    expect(source).toMatch(/thinking:\s*\{\s*type:\s*["']disabled["']\s*\}/)
    expect(source).toMatch(/response_format:\s*\{\s*type:\s*["']json_object["']\s*\}/)
  })

  it('uses the current canonical Perplexity Sonar endpoint in Edge and Next reference code', () => {
    const sources = [
      read('supabase/functions/mobile-api/_shared/kael.ts'),
      read('apps/api/src/lib/ai/providers/perplexity.ts'),
    ]

    for (const source of sources) {
      expect(source).toContain('https://api.perplexity.ai/v1/sonar')
      expect(source).not.toContain('https://api.perplexity.ai/chat/completions')
    }
  })

  it('does not carry raw provider error messages out of the Edge AI client', () => {
    const edgeKael = read('supabase/functions/mobile-api/_shared/kael.ts')

    expect(edgeKael).not.toContain('lastError.message')
    expect(edgeKael).toContain('error: code')
  })

  it('scrubs all customer-controlled text before Edge LLM prompts', () => {
    const edgeKael = read('supabase/functions/mobile-api/_shared/kael.ts')

    expect(edgeKael).toContain('const problemChips = input.problemChips.map(scrubSensitiveForLLM)')
    expect(edgeKael).toContain('const description = scrubSensitiveForLLM(input.description)')
    expect(edgeKael).toContain('.replace(/\\b0\\d{8,10}\\b/g, "[phone]")')
    expect(edgeKael).toContain('.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/gi, "[email]")')
    expect(edgeKael).toContain('.replace(/\\b\\d{9,12}\\b/g, "[id-number]")')
  })

  it('keeps the deployed Edge Kael prompt aligned with the product guardrails', () => {
    const edgeKael = read('supabase/functions/mobile-api/_shared/kael.ts')

    expect(edgeKael).toContain('KAEL_BUSINESS_GUARDRAILS')
    expect(edgeKael).toContain('Kael is the main AI assistant')
    expect(edgeKael).toContain('exactly three service boxes')
    expect(edgeKael).toContain('adult or explicit sexual content')
    expect(edgeKael).toContain('legality questions')
    expect(edgeKael).toContain('Return the required JSON only')
  })

  it('keeps review submission atomic for Edge mobile-api runtime', () => {
    const migrations = readMigrations()

    expect(migrations).toContain('create function public.submit_review_atomic')
    expect(migrations).toContain('language plpgsql security invoker')
    expect(read('supabase/migrations/20260517154846_submit_review_atomic_rpc.sql')).not.toContain('security definer')
    expect(migrations).toContain("grant execute on function public.submit_review_atomic(uuid, uuid, int, text[], text) to service_role")
    expect(migrations).toContain('ALREADY_REVIEWED')
    expect(migrations).toContain('drop policy if exists "Customers create reviews after confirmation" on public.reviews')
    expect(migrations).toContain('revoke insert on public.reviews from authenticated')
  })

  it('keeps locked chat placeholder from accepting direct client inserts', () => {
    const migration = read('supabase/migrations/20260518001200_lock_direct_client_writes_for_edge_runtime.sql')

    expect(migration).toContain('drop policy if exists "Participants send messages" on public.chat_messages')
    expect(migration).toContain('revoke insert on public.chat_messages from authenticated')
  })

  it('keeps authenticated mobile clients read-only for workflow tables', () => {
    const migration = read('supabase/migrations/20260518032000_revoke_authenticated_workflow_dml.sql')

    expect(migration).toContain('revoke insert, update, delete on')
    for (const table of [
      'public.profiles',
      'public.worker_profiles',
      'public.jobs',
      'public.job_broadcasts',
      'public.chat_messages',
      'public.reviews',
      'public.scope_change_requests',
      'public.api_logs',
      'public.learning_candidates',
    ]) {
      expect(migration).toContain(table)
    }
    expect(migration).toContain('from authenticated')
    expect(migration).toContain('to service_role')
  })

  it('consolidates admin RLS reads without reopening authenticated workflow DML grants', () => {
    const migration = read('supabase/migrations/20260518044500_consolidate_admin_rls_select_policies.sql')

    expect(migration).not.toMatch(/create policy "Admins manage .*"[\s\S]*for all/i)
    expect(migration).toContain('drop policy if exists "Admins manage jobs" on public.jobs')
    expect(migration).toContain('create policy "Admins update jobs" on public.jobs for update to authenticated')
    expect(migration).toContain('using (private.is_job_participant(id) or private.is_admin())')
    expect(migration).toContain('using (((select auth.uid()) = id) or private.is_admin())')
    expect(migration).toContain('using (private.is_job_participant(job_id) or private.is_admin())')
    expect(migration).not.toMatch(/grant\s+(insert|update|delete|all)[\s\S]+to authenticated/i)
  })

  it('keeps non-admin lifecycle writes behind Edge services and RPCs', () => {
    const alignment = read('supabase/migrations/20260513114845_align_structures_workflow.sql')

    expect(alignment).toContain('drop policy if exists "Customers create jobs" on jobs')
    expect(alignment).toContain('drop policy if exists "Customers update own jobs" on jobs')
    expect(alignment).toContain('drop policy if exists "Workers update assigned jobs" on jobs')
    expect(alignment).toContain('drop policy if exists "Workers respond to own broadcasts" on job_broadcasts')
    expect(alignment).not.toMatch(/create policy "Customers create jobs"/i)
    expect(alignment).not.toMatch(/create policy "Customers update own jobs"/i)
    expect(alignment).not.toMatch(/create policy "Workers update assigned jobs"/i)
    expect(alignment).not.toMatch(/create policy "Workers respond to own broadcasts"/i)
    expect(alignment).toContain('create policy "Admins manage jobs"')
    expect(alignment).toContain('create policy "Admins manage broadcasts"')
  })

  it('keeps the auth signup trigger private and search-path pinned', () => {
    const migration = read('supabase/migrations/20260517192455_harden_auth_signup_trigger.sql')

    expect(migration).toContain('create or replace function private.handle_new_user()')
    expect(migration).toContain('security definer')
    expect(migration).toContain('set search_path = public, pg_catalog')
    expect(migration).toContain("values (\n    new.id,\n    'customer',")
    expect(migration).not.toContain('raw_user_meta_data')
    expect(migration).not.toContain('user_metadata')
    expect(migration).toContain('for each row execute function private.handle_new_user()')
    expect(migration).toContain('drop function if exists public.handle_new_user()')
    expect(migration).toContain('revoke execute on function private.handle_new_user() from public')
    expect(migration).toContain('revoke execute on function private.handle_new_user() from anon')
    expect(migration).toContain('revoke execute on function private.handle_new_user() from authenticated')
  })

  it('keeps cancel-before-accept atomic so stale broadcasts cannot survive success', () => {
    const migrations = readMigrations()

    expect(migrations).toContain('create function public.cancel_job_before_accept_atomic')
    expect(migrations).toContain('for update')
    expect(migrations).toContain('grant execute on function public.cancel_job_before_accept_atomic(uuid, uuid) to service_role')
  })

  it('re-checks worker eligibility inside atomic accept', () => {
    const migrations = readMigrations()

    expect(migrations).toContain('WORKER_NOT_ELIGIBLE')
    expect(migrations).toContain('from public.worker_profiles')
    expect(migrations).toContain('v_worker.is_suspended is true')
    expect(migrations).toContain("and status = 'sent'::public.broadcast_status")
    expect(migrations).toContain('for update')
    expect(migrations).toContain('id <> p_job_id')
    expect(migrations).toContain("'completed_by_worker'::public.job_status")
  })

  it('marks the winning worker unavailable inside atomic accept', () => {
    const migration = read('supabase/migrations/20260518002000_accept_broadcast_lock_worker_profile.sql')

    expect(migration).toContain('update public.worker_profiles')
    expect(migration).toContain('set is_available = false')
    expect(migration).toContain('where id = p_worker_id')
  })

  it('locks the worker profile row during atomic accept to prevent double-accept races', () => {
    const migration = read('supabase/migrations/20260518005000_accept_broadcast_lock_job_first.sql')

    expect(migration).toMatch(/from public\.worker_profiles[\s\S]*where id = p_worker_id[\s\S]*for update/)
    expect(migration).toContain('v_worker.is_available is not true')
    expect(migration).toContain('WORKER_NOT_ELIGIBLE')
  })

  it('locks job before broadcast in atomic accept to avoid accept-cancel deadlocks', () => {
    const migration = read('supabase/migrations/20260518005000_accept_broadcast_lock_job_first.sql')
    const jobLockIndex = migration.indexOf('from public.jobs')
    const broadcastLockIndex = migration.indexOf('from public.job_broadcasts')

    expect(jobLockIndex).toBeGreaterThan(-1)
    expect(broadcastLockIndex).toBeGreaterThan(jobLockIndex)
    expect(migration).toMatch(/from public\.jobs[\s\S]*where id = p_job_id[\s\S]*for update/)
    expect(migration).toContain("v_job_state.status <> 'broadcasting'::public.job_status")
  })

  it('checks broadcast membership before leaking accept job state', () => {
    const migration = read('supabase/migrations/20260518071000_accept_broadcast_privacy_guard_v2.sql')
    const jobLockIndex = migration.indexOf('from public.jobs as j')
    const broadcastLockIndex = migration.indexOf('from public.job_broadcasts as jb')
    const broadcastNotFoundIndex = migration.indexOf("return query select false, 'NOT_FOUND'::text", broadcastLockIndex)
    const statusLeakIndex = migration.indexOf("v_job_state.status <> 'broadcasting'::public.job_status")

    expect(jobLockIndex).toBeGreaterThan(-1)
    expect(broadcastLockIndex).toBeGreaterThan(jobLockIndex)
    expect(broadcastNotFoundIndex).toBeGreaterThan(broadcastLockIndex)
    expect(statusLeakIndex).toBeGreaterThan(broadcastNotFoundIndex)
    expect(migration).toContain('select j.id, j.status, j.service_type, j.address_district')
    expect(migration).toContain('select jb.id, jb.status, jb.expires_at')
    expect(migration).toContain('order by jb.sent_at desc nulls last, jb.broadcast_at desc nulls last, jb.id desc')
    expect(migration).not.toContain('created_at desc')
    expect(migration).not.toContain('returning id, address_building, address_unit, address_floor, address_district')
  })

  it('cleans all still-sent broadcasts for the accepted job, not just one batch', () => {
    const migration = read('supabase/migrations/20260518011500_reassign_all_sent_broadcasts_on_accept.sql')

    expect(migration).toContain('create or replace function public.accept_broadcast_atomic')
    expect(migration).toMatch(/where job_id = p_job_id[\s\S]*and id <> v_broadcast\.id[\s\S]*and status = 'sent'::public\.broadcast_status/)
    expect(migration).not.toContain('where batch_id = v_broadcast.batch_id')
    expect(migration).toContain('job-wide sent-broadcast cleanup')
  })

  it('keeps atomic accept aligned with service and city-wide district eligibility', () => {
    const migration = read('supabase/migrations/20260518013000_accept_broadcast_service_district_guard.sql')
    const edgeServices = read('supabase/functions/mobile-api/_shared/services.ts')
    const nextBroadcast = read('apps/api/src/lib/jobs/broadcast.ts')

    expect(migration).toContain('service_types, districts')
    expect(migration).toContain('v_worker.service_types is null')
    expect(migration).toContain('cardinality(v_worker.service_types) = 0')
    expect(migration).toContain('v_worker.districts is null')
    expect(migration).toContain('cardinality(v_worker.districts) = 0')
    expect(migration).toContain('not (v_job_state.service_type = any(v_worker.service_types))')
    expect(migration).toContain('v_job_state.address_district is null')
    expect(migration).toContain("v_job_state.address_district = 'hcmc_all'")
    expect(migration).toContain('v_job_district := v_job_state.address_district')
    expect(migration).not.toContain("v_job_district := coalesce(v_job_state.address_district, 'hcmc_all')")
    expect(migration).toContain("'hcmc_all' = any(v_worker.districts)")
    expect(migration).toContain("set status = 'reassigned'::public.broadcast_status,\n        responded_at = v_now")
    expect(edgeServices).toContain('const districtCode = normalizeDistrict(district)')
    expect(edgeServices).toContain('districts.cs.{${districtCode}},districts.cs.{hcmc_all}')
    expect(nextBroadcast).toContain('const districtCode = normalizeDistrict(district)')
    expect(nextBroadcast).toContain('districts.cs.{${districtCode}},districts.cs.{hcmc_all}')
  })

  it('qualifies atomic accept columns that collide with PL/pgSQL output variables', () => {
    const migration = read('supabase/migrations/20260518041500_remove_accept_broadcast_created_at_order.sql')

    expect(migration).toContain('from public.jobs as j')
    expect(migration).toContain('j.address_district')
    expect(migration).toContain(
      'returning j.id, j.address_building, j.address_unit, j.address_floor, j.address_district'
    )
    expect(migration).toContain('from public.job_broadcasts as jb')
    expect(migration).toContain('from public.worker_profiles as wp')
    expect(migration).toContain('from public.jobs as active_job')
    expect(migration).not.toContain('select id, status, service_type, address_district')
    expect(migration).not.toContain(
      'returning id, address_building, address_unit, address_floor, address_district'
    )
    expect(migration).not.toContain('jb.created_at')
  })

  it('keeps Next reference confirm-search retry semantics aligned with Edge mobile-api', () => {
    const edgeServices = read('supabase/functions/mobile-api/_shared/services.ts')
    const nextConfirmSearch = read('apps/api/src/app/api/jobs/[id]/confirm-search/route.ts')

    for (const source of [edgeServices, nextConfirmSearch]) {
      expect(source).toContain('BROADCAST_ACTIVE')
      expect(source).toContain('broadcast_at.lte.')
      expect(source).toContain('customer_retried_search')
      expect(source).toContain('job_broadcasts')
      expect(source).toContain('no_worker_found')
      expect(source).toContain('broadcast_sent: false')
      expect(source).toContain('rollbackFailedBroadcastStart')
      expect(source).toContain('broadcast_start_failed')
      expect(source).toContain('confirmed_search_at: null')
      expect(source).toContain('customer_id')
    }
  })

  it('does not normalize unknown worker registration districts into city-wide coverage', () => {
    const edgeServices = read('supabase/functions/mobile-api/_shared/services.ts')
    const nextRegister = read('apps/api/src/lib/workers/register.ts')

    expect(edgeServices).toContain('normalizeWorkerDistricts')
    expect(edgeServices).toContain('apiFailure("VALIDATION"')
    expect(edgeServices).toContain('trimmed === "hcmc_all"')
    expect(nextRegister).toContain('normalizeWorkerDistricts')
    expect(nextRegister).toContain("code: 'VALIDATION'")
    expect(nextRegister).toContain("trimmed === 'hcmc_all'")
  })

  it('keeps worker availability atomic with the same worker-row lock used by accept', () => {
    const migration = read('supabase/migrations/20260518010500_availability_offline_expires_sent_broadcasts.sql')
    const edgeServices = read('supabase/functions/mobile-api/_shared/services.ts')
    const nextRoute = read('apps/api/src/app/api/workers/me/availability/route.ts')
    const nextBroadcasts = read('apps/api/src/app/api/workers/me/broadcasts/route.ts')

    expect(migration).toContain('create or replace function public.set_worker_availability_atomic')
    expect(migration).toContain('language plpgsql security invoker')
    expect(migration).toMatch(/from public\.worker_profiles[\s\S]*where id = p_worker_id[\s\S]*for update/)
    expect(migration).toContain('WORKER_BUSY')
    expect(migration).toContain('if p_is_available is false then')
    expect(migration).toContain('update public.job_broadcasts')
    expect(migration).toContain("and status = 'sent'::public.broadcast_status")
    expect(migration.indexOf('update public.job_broadcasts')).toBeLessThan(
      migration.indexOf('from public.worker_profiles')
    )
    expect(migration).toContain('grant execute on function public.set_worker_availability_atomic(uuid, boolean) to service_role')
    expect(edgeServices).toContain('set_worker_availability_atomic')
    expect(nextRoute).toContain('set_worker_availability_atomic')
    expect(nextBroadcasts).toContain("update({ status: 'expired', responded_at: nowIso })")
  })

  it('keeps worker inbox defensive against sent broadcasts attached to non-broadcasting jobs', () => {
    const edgeServices = read('supabase/functions/mobile-api/_shared/services.ts')
    const nextBroadcasts = read('apps/api/src/app/api/workers/me/broadcasts/route.ts')

    for (const source of [edgeServices, nextBroadcasts]) {
      expect(source).toContain('jobs(status, service_type, address_district, kael_problem_identified, kael_price_min, kael_price_max)')
      expect(source).toMatch(/job\.status !== ["']broadcasting["']/)
    }
  })

  it('keeps worker decline defensive against sent broadcasts attached to non-broadcasting jobs', () => {
    const edgeServices = read('supabase/functions/mobile-api/_shared/services.ts')
    const nextAcceptBroadcast = read('apps/api/src/lib/jobs/accept-broadcast.ts')

    for (const source of [edgeServices, nextAcceptBroadcast]) {
      expect(source).toContain('jobs(status)')
      expect(source).toMatch(/parentJob\.status !== ["']broadcasting["']/)
      expect(source).toContain('BROADCAST_NOT_ACTIVE')
    }
  })

  it('hardens private RLS helper execution and search path', () => {
    const migration = read('supabase/migrations/20260518043000_harden_private_rls_helper_execution.sql')

    for (const signature of [
      'private.is_admin()',
      'private.is_job_participant(uuid)',
      'private.is_job_customer(uuid)',
      'private.is_job_worker(uuid)',
    ]) {
      expect(migration).toContain(`alter function ${signature}`)
      expect(migration).toContain('set search_path = public, pg_catalog')
      expect(migration).toContain(`revoke execute on function ${signature} from public`)
      expect(migration).toContain(`revoke execute on function ${signature} from anon`)
      expect(migration).toContain(`grant execute on function ${signature} to authenticated`)
    }
  })

  it('keeps service-role-only mobile RPCs as invoker security, not definer', () => {
    const migrations = readMigrations()

    expect(migrations).toContain('alter function public.accept_broadcast_atomic(uuid, uuid) security invoker')
    expect(migrations).toContain('alter function public.request_scope_change_atomic(uuid, uuid, text, int, int, text) security invoker')
    expect(migrations).toContain('alter function public.decide_scope_change_atomic(uuid, uuid, text) security invoker')
    expect(migrations).toContain('alter function public.submit_review_atomic(uuid, uuid, int, text[], text) security invoker')
    expect(migrations).toContain('language plpgsql security invoker')
    expect(migrations).toContain('create or replace function public.request_worker_cancellation_atomic')
    expect(migrations).toContain('create or replace function public.decide_worker_cancellation_atomic')
    expect(migrations).toContain('create function public.set_worker_availability_atomic')
  })

  it('adds Supabase boxes for media, Kael artifacts, notifications, and worker cancellation', () => {
    const migration = read('supabase/migrations/20260519090200_supabase_boxes_notifications_media_cancellation.sql')
    const edgeServices = read('supabase/functions/mobile-api/_shared/services.ts')
    const edgeRouter = read('supabase/functions/mobile-api/_shared/router.ts')

    for (const table of [
      'public.job_media_assets',
      'public.kael_analysis_artifacts',
      'public.device_push_tokens',
      'public.worker_cancellation_requests',
    ]) {
      expect(migration).toContain(`alter table ${table} enable row level security`)
      expect(migration).toContain(`revoke insert, update, delete on ${table} from authenticated`)
      expect(migration).toContain(`grant all on ${table} to service_role`)
    }

    expect(migration).toContain("insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)")
    expect(migration).toContain("'worker-verification', 'worker-verification', false")
    expect(migration).toContain("'job-media', 'job-media', false")
    expect(migration).toContain('create or replace function public.insert_notification_atomic')
    expect(migration).toContain('create or replace function public.register_device_push_token_atomic')
    expect(migration).toContain('create or replace function public.request_worker_cancellation_atomic')
    expect(migration).toContain('create or replace function public.decide_worker_cancellation_atomic')
    expect(migration).toContain('grant execute on function public.request_worker_cancellation_atomic(uuid, uuid, text, text[]) to service_role')
    expect(migration).toContain('grant execute on function public.decide_worker_cancellation_atomic(uuid, uuid, text, text) to service_role')
    expect(migration).toContain("status = 'broadcasting'::public.job_status")
    expect(edgeServices).toContain('request_worker_cancellation_atomic')
    expect(edgeServices).not.toContain('client.rpc("decide_worker_cancellation_atomic"')
    expect(edgeServices).toContain('"Yêu cầu hủy việc của thợ đã được xử lý tự động ở endpoint hủy việc"')
    expect(edgeRouter).toContain('jobs.workerCancellation')
    expect(edgeRouter).toContain('workerCancellation.decide')
  })

  it('adds service-role Kael chat persistence and confirm RPC for the Kael-first workflow', () => {
    const migration = read('supabase/migrations/20260520130514_kael_chat_sessions.sql')
    const edgeServices = read('supabase/functions/mobile-api/_shared/services.ts')
    const edgeRouter = read('supabase/functions/mobile-api/_shared/router.ts')
    const mobileApiTypes = read('apps/mobile/lib/api-types.ts')

    for (const table of [
      'public.kael_chat_sessions',
      'public.kael_chat_turns',
    ]) {
      expect(migration).toContain(`alter table ${table} enable row level security`)
      expect(migration).toContain(`revoke insert, update, delete on ${table} from authenticated`)
      expect(migration).toContain(`grant all on ${table} to service_role`)
    }

    expect(migration).toContain('create table if not exists public.kael_chat_sessions')
    expect(migration).toContain('create table if not exists public.kael_chat_turns')
    expect(migration).toContain('create or replace function public.confirm_kael_chat_atomic')
    expect(migration).toContain('grant execute on function public.confirm_kael_chat_atomic(uuid, uuid) to service_role')
    expect(edgeServices).toContain('confirm_kael_chat_atomic')
    expect(edgeServices).toContain('KAEL_CHAT_HARD_COST_CAP_USD')
    expect(edgeServices).toContain('getKaelChatCostUsd')
    expect(edgeServices).toContain('"budget_exceeded"')
    expect(edgeRouter).toContain('kael.chat.create')
    expect(edgeRouter).toContain('kael.chat.confirm')
    expect(edgeRouter).toContain('"budget_exceeded"')
    expect(mobileApiTypes).toContain("'budget_exceeded'")
  })

  it('hardens worker cancellation approval and job-media upload stages after PR review', () => {
    const migration = read('supabase/migrations/20260519120720_fix_worker_cancellation_race_and_media_stage_rls.sql')
    const edgeServices = read('supabase/functions/mobile-api/_shared/services.ts')

    expect(migration).toContain('JOB_NOT_CANCELLABLE')
    expect(migration).toContain("'worker_matched'::public.job_status")
    expect(migration).toContain("'scope_change_pending'::public.job_status")
    expect(migration).not.toContain("'confirmed_by_customer'::public.job_status")
    expect(migration).toContain('drop policy if exists "Participants upload job media files"')
    expect(migration).toContain('and case')
    expect(migration).toContain('else false')
    expect(migration).toContain("(storage.foldername(name))[2] in ('before', 'kael_reference')")
    expect(migration).toContain('private.is_job_customer')
    expect(migration).toContain("(storage.foldername(name))[2] in ('after', 'cancellation_evidence')")
    expect(migration).toContain('private.is_job_worker')
    expect(edgeServices).toContain('JOB_NOT_CANCELLABLE')
  })

  it('auto-approves worker cancellation for immediate replacement without rating penalty', () => {
    const migration = read('supabase/migrations/20260520141200_worker_cancellation_auto_reassign.sql')
    const edgeServices = read('supabase/functions/mobile-api/_shared/services.ts')

    expect(migration).toContain('drop function if exists public.request_worker_cancellation_atomic')
    expect(migration).toContain("status = 'broadcasting'::public.job_status")
    expect(migration).toContain("'approved'")
    expect(migration).toContain("'RATE_LIMITED'")
    expect(migration).not.toMatch(/rating\s*=/i)
    expect(migration).not.toContain('is_suspended')
    expect(edgeServices).toContain('notifyCustomerWorkerReplacementSearch')
    expect(edgeServices).toContain('worker_replacement_search')
    expect(edgeServices).toContain('broadcast_sent: broadcastSent')
  })

  it('splits Supabase box admin RLS policies so SELECT has one permissive path', () => {
    const migration = read('supabase/migrations/20260519122000_consolidate_box_admin_rls_policies.sql')

    for (const policy of [
      'Admins manage service knowledge boxes',
      'Admins manage Kael market artifacts',
      'Admins manage job media assets',
      'Admins manage Kael analysis artifacts',
      'Admins manage device push tokens',
      'Admins manage worker cancellation requests',
    ]) {
      expect(migration).toContain(`drop policy if exists "${policy}"`)
    }

    expect(migration).toContain('for insert')
    expect(migration).toContain('for update')
    expect(migration).toContain('for delete')
    expect(migration).not.toMatch(/for all/i)
  })

  it('locks scope-change lifecycle rows and returns explicit race errors', () => {
    const migration = read('supabase/migrations/20260517163541_harden_scope_change_rpc_races.sql')
    const edgeServices = read('supabase/functions/mobile-api/_shared/services.ts')
    const updateJobIndex = migration.indexOf("update public.jobs\n    set status = 'scope_change_pending'")
    const insertScopeIndex = migration.indexOf('insert into public.scope_change_requests')

    expect(migration).toContain('where id = p_job_id\n    for update')
    expect(migration).toContain('where id = p_scope_change_id\n    for update')
    expect(migration).toContain("return query select false, 'STATUS_CHANGED'::text")
    expect(migration).toContain('security invoker')
    expect(updateJobIndex).toBeGreaterThan(-1)
    expect(insertScopeIndex).toBeGreaterThan(updateJobIndex)
    expect(edgeServices).toContain('current_scope_change')
    expect(edgeServices).toContain('getCurrentScopeChange')
  })

  it('prevents scope-change decision split-brain when one lifecycle update cannot persist', () => {
    const migration = read('supabase/migrations/20260517163541_harden_scope_change_rpc_races.sql')
    const jobUpdateIndex = migration.indexOf("updated_job as (\n    update public.jobs")
    const scopeUpdateIndex = migration.indexOf('updated_scope as (\n    update public.scope_change_requests')

    expect(migration).toContain('with updated_job as')
    expect(migration).toContain('exists (select 1 from updated_job)')
    expect(migration).toContain('raise exception')
    expect(jobUpdateIndex).toBeGreaterThan(-1)
    expect(scopeUpdateIndex).toBeGreaterThan(jobUpdateIndex)
  })

  it('stops changed work when a customer rejects a scope-change request', () => {
    const migration = read('supabase/migrations/20260518181500_scope_change_reject_cancels_job.sql')
    const edgeServices = read('supabase/functions/mobile-api/_shared/services.ts')
    const nextRoute = read('apps/api/src/app/api/scope-changes/[id]/decide/route.ts')
    const nextScopeChange = read('apps/api/src/lib/jobs/scope-change.ts')

    expect(migration).toContain("v_job_status := 'cancelled'::public.job_status")
    expect(migration).toContain('cancelled_at = case')
    expect(migration).toContain("v_decision_text := 'rejected'")
    expect(migration).toContain('scope_change_customer_decision = v_decision_text')
    expect(edgeServices).toContain('scopeDecisionToJobStatus(input.decision)')
    expect(nextRoute).toContain("parsed.data.decision === 'approve' ? 'repairing' : 'cancelled'")
    expect(nextScopeChange).toContain("Reject transitions the job to 'cancelled'")
  })

  it('keeps real Supabase integration suites blocked from production project ref', () => {
    for (const file of [
      'apps/api/src/__tests__/integration/real-supabase.test.ts',
      'apps/api/src/__tests__/integration/learning-real-supabase.test.ts',
      'apps/api/src/__tests__/integration/worker-flow.test.ts',
    ]) {
      const source = read(file)
      expect(source).toContain("const PRODUCTION_REF = 'iwevizmsedyqozxlawwl'")
      expect(source).toContain('isProduction')
      expect(source).toContain('Refusing to run against production')
    }
  })
})
