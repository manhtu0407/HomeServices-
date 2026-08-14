begin;

alter table public.kael_admin_queue
  drop constraint if exists kael_admin_queue_queue_type_check;
alter table public.kael_admin_queue
  add constraint kael_admin_queue_queue_type_check
  check (queue_type in (
    'demanding_customer', 'worker_cancellation_review', 'worker_no_show',
    'customer_cancellation_review', 'dispute_review', 'autonomy_escalation',
    'disintermediation_risk', 'worker_application_review',
    'worker_profile_verification'
  ));

alter table public.admin_worker_application_reviews
  add column if not exists review_stage text not null default 'access';
alter table public.admin_worker_application_reviews
  drop constraint if exists admin_worker_application_reviews_review_stage_check;
alter table public.admin_worker_application_reviews
  add constraint admin_worker_application_reviews_review_stage_check
  check (review_stage in ('access', 'profile'));

create unique index if not exists kael_admin_queue_open_worker_profile_review_idx
  on public.kael_admin_queue (actor_id)
  where queue_type = 'worker_profile_verification'
    and status in ('open', 'acknowledged');

create table if not exists public.admin_operator_provisioning (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references public.profiles(id) on delete restrict,
  email text not null unique,
  full_name text not null,
  capabilities text[] not null,
  status text not null check (status in ('pending_password_change', 'active', 'failed')),
  failure_code text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  activated_at timestamptz,
  constraint admin_operator_provisioning_email_check
    check (email = lower(btrim(email)) and email ~ '^[^[:space:]@]+@gmail[.]com$'),
  constraint admin_operator_provisioning_name_check
    check (char_length(btrim(full_name)) between 2 and 200),
  constraint admin_operator_provisioning_capabilities_check
    check (
      cardinality(capabilities) between 1 and 11
      and 'finance.read' = any(capabilities)
    )
);

create index if not exists admin_operator_provisioning_status_idx
  on public.admin_operator_provisioning (status, updated_at desc);

drop trigger if exists admin_operator_provisioning_updated_at
  on public.admin_operator_provisioning;
create trigger admin_operator_provisioning_updated_at
  before update on public.admin_operator_provisioning
  for each row execute function public.update_updated_at();

alter table public.admin_operator_provisioning enable row level security;
revoke all on public.admin_operator_provisioning from public, anon, authenticated;
grant all on public.admin_operator_provisioning to service_role;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $function$
declare
  v_full_name text := nullif(pg_catalog.btrim(pg_catalog.regexp_replace(
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'display_name',
      new.raw_user_meta_data->>'name',
      ''
    ),
    '[[:space:]]+', ' ', 'g'
  )), '');
begin
  insert into public.profiles (id, role, phone, full_name)
  values (new.id, 'customer'::public.user_role, new.phone, v_full_name)
  on conflict (id) do update
  set full_name = coalesce(public.profiles.full_name, excluded.full_name);
  return new;
end;
$function$;

drop function if exists public.handle_new_user();
revoke execute on function private.handle_new_user() from public, anon, authenticated;

update public.profiles as profile
set full_name = nullif(pg_catalog.btrim(pg_catalog.regexp_replace(
  coalesce(
    auth_user.raw_user_meta_data->>'full_name',
    auth_user.raw_user_meta_data->>'display_name',
    auth_user.raw_user_meta_data->>'name',
    ''
  ),
  '[[:space:]]+', ' ', 'g'
)), '')
from auth.users as auth_user
where auth_user.id = profile.id
  and nullif(pg_catalog.btrim(profile.full_name), '') is null;

create or replace function public.save_worker_registration_draft_atomic(
  p_actor_id uuid,
  p_worker_id uuid,
  p_draft jsonb
)
returns table(ok boolean, error_code text, worker_id uuid, verification_status public.worker_verification_status, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_worker public.worker_profiles%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_actor_id is distinct from p_worker_id
     or pg_catalog.jsonb_typeof(p_draft) <> 'object'
     or p_draft = '{}'::jsonb
     or exists (
       select 1 from pg_catalog.jsonb_object_keys(p_draft) as key
       where key not in (
         'legal_name', 'date_of_birth', 'gender', 'service_types',
         'years_experience', 'districts', 'home_lat', 'home_lng',
         'service_radius_km', 'problem_specializations', 'cccd_front_url',
         'cccd_back_url', 'selfie_url', 'bank_account', 'bank_name'
       )
     ) then
    return query select false, 'INVALID_INPUT', p_worker_id, null::public.worker_verification_status, null::timestamptz;
    return;
  end if;

  if not exists (
    select 1 from public.profiles
    where id = p_worker_id and role = 'worker'::public.user_role
  ) then
    return query select false, 'WORKER_ACCESS_REQUIRED', p_worker_id, null::public.worker_verification_status, null::timestamptz;
    return;
  end if;

  select worker.* into v_worker
  from public.worker_profiles as worker
  where worker.id = p_worker_id
  for update;

  if not found or v_worker.verification_status not in (
    'draft'::public.worker_verification_status,
    'rejected'::public.worker_verification_status
  ) or v_worker.is_approved or v_worker.is_suspended then
    return query select false, 'DRAFT_NOT_EDITABLE', p_worker_id,
      case when found then v_worker.verification_status else null end,
      case when found then v_worker.updated_at else null end;
    return;
  end if;

  update public.worker_profiles as worker
  set legal_name = case when p_draft ? 'legal_name' then nullif(btrim(p_draft->>'legal_name'), '') else worker.legal_name end,
      date_of_birth = case when p_draft ? 'date_of_birth' then (p_draft->>'date_of_birth')::date else worker.date_of_birth end,
      gender = case when p_draft ? 'gender' then nullif(p_draft->>'gender', '') else worker.gender end,
      service_types = case when p_draft ? 'service_types' then array(select jsonb_array_elements_text(p_draft->'service_types'))::public.service_type[] else worker.service_types end,
      years_experience = case when p_draft ? 'years_experience' then (p_draft->>'years_experience')::integer else worker.years_experience end,
      districts = case when p_draft ? 'districts' then array(select jsonb_array_elements_text(p_draft->'districts')) else worker.districts end,
      home_lat = case when p_draft ? 'home_lat' then (p_draft->>'home_lat')::numeric else worker.home_lat end,
      home_lng = case when p_draft ? 'home_lng' then (p_draft->>'home_lng')::numeric else worker.home_lng end,
      service_radius_km = case when p_draft ? 'service_radius_km' then (p_draft->>'service_radius_km')::integer else worker.service_radius_km end,
      problem_specializations = case when p_draft ? 'problem_specializations' then array(select jsonb_array_elements_text(p_draft->'problem_specializations')) else worker.problem_specializations end,
      cccd_front_url = case when p_draft ? 'cccd_front_url' then p_draft->>'cccd_front_url' else worker.cccd_front_url end,
      cccd_back_url = case when p_draft ? 'cccd_back_url' then p_draft->>'cccd_back_url' else worker.cccd_back_url end,
      selfie_url = case when p_draft ? 'selfie_url' then p_draft->>'selfie_url' else worker.selfie_url end,
      bank_account = case when p_draft ? 'bank_account' then p_draft->>'bank_account' else worker.bank_account end,
      bank_name = case when p_draft ? 'bank_name' then p_draft->>'bank_name' else worker.bank_name end,
      verification_status = 'draft'::public.worker_verification_status,
      is_approved = false,
      is_available = false,
      updated_at = v_now
  where worker.id = p_worker_id
  returning worker.* into v_worker;

  return query select true, null::text, v_worker.id, v_worker.verification_status, v_worker.updated_at;
exception
  when data_exception or check_violation or invalid_text_representation then
    return query select false, 'INVALID_INPUT', p_worker_id, null::public.worker_verification_status, null::timestamptz;
end;
$function$;

create or replace function private.enqueue_worker_profile_verification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.verification_status = 'submitted'::public.worker_verification_status
     and old.verification_status is distinct from new.verification_status then
    insert into public.kael_admin_queue (
      actor_id, actor_role, queue_type, priority, status, escalation_level,
      reason_code, response_summary, safe_metadata
    ) values (
      new.id, 'worker', 'worker_profile_verification', 'medium', 'open', 'soft',
      'worker_profile_submitted', 'worker_profile_ready_for_verification',
      pg_catalog.jsonb_build_object('worker_id', new.id)
    ) on conflict (actor_id) where queue_type = 'worker_profile_verification'
      and status in ('open', 'acknowledged') do nothing;
  end if;
  return new;
end;
$function$;

drop trigger if exists worker_profile_verification_queue on public.worker_profiles;
create trigger worker_profile_verification_queue
  after update of verification_status on public.worker_profiles
  for each row execute function private.enqueue_worker_profile_verification();

create or replace function public.admin_review_worker_profile_atomic(
  p_queue_id uuid,
  p_admin_id uuid,
  p_decision text,
  p_reason text default null
)
returns table(ok boolean, error_code text, queue_id uuid, worker_id uuid, decision text, verification_status public.worker_verification_status, decided_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_queue public.kael_admin_queue%rowtype;
  v_worker public.worker_profiles%rowtype;
  v_actor_role public.user_role;
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_paths text[];
  v_objects integer;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  select role into v_actor_role from public.profiles where id = p_admin_id;
  if v_actor_role <> 'admin'::public.user_role and not (
    v_actor_role = 'admin_operator'::public.user_role and exists (
      select 1 from public.admin_operator_accounts
      where user_id = p_admin_id and status = 'active'
        and 'workers.review' = any(capabilities)
    )
  ) then
    return query select false, 'WORKERS_REVIEW_REQUIRED', p_queue_id, null::uuid, v_decision, null::public.worker_verification_status, null::timestamptz;
    return;
  end if;
  if v_decision not in ('approve', 'request_changes')
     or char_length(v_reason) > 1000
     or (v_decision = 'request_changes' and v_reason = '') then
    return query select false, 'INVALID_DECISION', p_queue_id, null::uuid, v_decision, null::public.worker_verification_status, null::timestamptz;
    return;
  end if;

  select queue_row.* into v_queue
  from public.kael_admin_queue as queue_row
  where queue_row.id = p_queue_id
    and queue_row.queue_type = 'worker_profile_verification'
  for update;
  if not found then
    return query select false, 'APPLICATION_NOT_FOUND', p_queue_id, null::uuid, v_decision, null::public.worker_verification_status, null::timestamptz;
    return;
  end if;
  if v_queue.safe_metadata->>'decision' = v_decision then
    select worker.* into v_worker from public.worker_profiles as worker where worker.id = v_queue.actor_id;
    return query select true, null::text, v_queue.id, v_queue.actor_id, v_decision, v_worker.verification_status,
      nullif(v_queue.safe_metadata->>'decided_at', '')::timestamptz;
    return;
  end if;
  if v_queue.status not in ('open', 'acknowledged') then
    return query select false, 'ALREADY_REVIEWED', v_queue.id, v_queue.actor_id, v_decision, null::public.worker_verification_status, null::timestamptz;
    return;
  end if;

  select worker.* into v_worker
  from public.worker_profiles as worker
  where worker.id = v_queue.actor_id
  for update;
  if not found then
    return query select false, 'WORKER_NOT_FOUND', v_queue.id, v_queue.actor_id, v_decision, null::public.worker_verification_status, null::timestamptz;
    return;
  end if;

  if v_decision = 'approve' then
    if v_worker.verification_status not in ('submitted'::public.worker_verification_status, 'under_review'::public.worker_verification_status)
       or v_worker.legal_name is null or v_worker.date_of_birth is null
       or cardinality(v_worker.service_types) < 1
       or v_worker.years_experience is null
       or cardinality(v_worker.districts) < 1
       or v_worker.service_radius_km is null
       or v_worker.cccd_front_url is null or v_worker.cccd_back_url is null or v_worker.selfie_url is null
       or nullif(btrim(v_worker.bank_account), '') is null
       or nullif(btrim(v_worker.bank_name), '') is null then
      return query select false, 'PROFILE_INCOMPLETE', v_queue.id, v_queue.actor_id, v_decision, v_worker.verification_status, null::timestamptz;
      return;
    end if;
    v_paths := array[
      substr(v_worker.cccd_front_url, char_length('supabase://worker-verification/') + 1),
      substr(v_worker.cccd_back_url, char_length('supabase://worker-verification/') + 1),
      substr(v_worker.selfie_url, char_length('supabase://worker-verification/') + 1)
    ];
    select count(*)::integer into v_objects
    from storage.objects as object
    where object.bucket_id = 'worker-verification'
      and object.name = any(v_paths)
      and object.owner is not distinct from v_worker.id;
    if v_objects <> 3 then
      return query select false, 'VERIFICATION_FILES_INVALID', v_queue.id, v_queue.actor_id, v_decision, v_worker.verification_status, null::timestamptz;
      return;
    end if;
    update public.worker_profiles
    set verification_status = 'approved'::public.worker_verification_status,
        is_approved = true, is_available = false, is_suspended = false
    where id = v_worker.id returning * into v_worker;
  else
    update public.worker_profiles
    set verification_status = 'rejected'::public.worker_verification_status,
        is_approved = false, is_available = false
    where id = v_worker.id returning * into v_worker;
  end if;

  update public.kael_admin_queue
  set status = 'resolved', resolved_by = p_admin_id, resolved_at = v_now,
      resolution_note = nullif(v_reason, ''),
      response_summary = case when v_decision = 'approve'
        then 'worker_profile_verified' else 'worker_profile_changes_requested' end,
      safe_metadata = coalesce(safe_metadata, '{}'::jsonb) ||
        pg_catalog.jsonb_build_object('decision', v_decision, 'decided_at', v_now)
  where id = v_queue.id;

  insert into public.admin_worker_application_reviews (
    queue_id, worker_id, decision, reason, decided_by, decided_at, review_stage
  ) values (
    v_queue.id, v_queue.actor_id, v_decision, nullif(v_reason, ''),
    p_admin_id, v_now, 'profile'
  ) on conflict on constraint admin_worker_application_reviews_pkey do update
  set decision = excluded.decision, reason = excluded.reason,
      decided_by = excluded.decided_by, decided_at = excluded.decided_at,
      review_stage = 'profile';

  insert into public.kael_permission_audit (
    actor_id, actor_role, purpose, action, topic, decision, reason_code, safe_metadata
  ) values (
    p_admin_id, v_actor_role::text, 'admin_worker_profile_review', 'review',
    'worker_profile', case when v_decision = 'approve' then 'allow' else 'escalate' end,
    'worker_profile_' || v_decision,
    pg_catalog.jsonb_build_object('queue_id', v_queue.id, 'worker_id', v_queue.actor_id)
  );
  return query select true, null::text, v_queue.id, v_queue.actor_id, v_decision, v_worker.verification_status, v_now;
end;
$function$;

create or replace function public.admin_begin_operator_provisioning(
  p_owner_id uuid,
  p_email text,
  p_full_name text,
  p_capabilities text[]
)
returns table(ok boolean, error_code text, provisioning_id uuid)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_id uuid;
begin
  if not exists (select 1 from public.profiles where id = p_owner_id and role = 'admin'::public.user_role) then
    return query select false, 'OWNER_REQUIRED', null::uuid; return;
  end if;
  if p_email <> lower(btrim(p_email)) or p_email !~ '^[^[:space:]@]+@gmail[.]com$'
     or char_length(btrim(p_full_name)) not between 2 and 200
     or cardinality(p_capabilities) not between 1 and 11
     or not ('finance.read' = any(p_capabilities))
     or exists (
       select 1 from unnest(p_capabilities) as capability
       where capability not in (
         'operations.read', 'workers.read', 'workers.review', 'workers.manage',
         'transactions.read', 'finance.read', 'finance.reconcile',
         'finance.tax.manage', 'payouts.read', 'payouts.process', 'team.read'
       )
     )
     or (select count(*) from unnest(p_capabilities)) <> (select count(distinct capability) from unnest(p_capabilities) as capability) then
    return query select false, 'INVALID_INPUT', null::uuid; return;
  end if;
  if exists (select 1 from auth.users where lower(email) = p_email)
     or exists (select 1 from public.admin_operator_provisioning where email = p_email and status <> 'failed') then
    return query select false, 'EMAIL_EXISTS', null::uuid; return;
  end if;
  select provisioning.id into v_id
  from public.admin_operator_provisioning as provisioning
  where provisioning.email = p_email and provisioning.status = 'failed'
  for update;
  if v_id is null then
    insert into public.admin_operator_provisioning (
      email, full_name, capabilities, status, failure_code, created_by
    ) values (
      p_email, btrim(p_full_name), p_capabilities, 'failed', 'AUTH_CREATION_PENDING', p_owner_id
    ) returning id into v_id;
  else
    update public.admin_operator_provisioning
    set user_id = null, full_name = btrim(p_full_name), capabilities = p_capabilities,
        failure_code = 'AUTH_CREATION_PENDING', created_by = p_owner_id,
        activated_at = null
    where id = v_id;
  end if;
  return query select true, null::text, v_id;
end;
$function$;

create or replace function public.admin_complete_operator_provisioning(
  p_owner_id uuid,
  p_provisioning_id uuid,
  p_user_id uuid
)
returns table(ok boolean, error_code text)
language plpgsql
security definer
set search_path = ''
as $function$
begin
  update public.admin_operator_provisioning as provisioning
  set user_id = p_user_id, status = 'pending_password_change', failure_code = null
  where provisioning.id = p_provisioning_id
    and provisioning.created_by = p_owner_id
    and provisioning.status = 'failed'
    and provisioning.failure_code = 'AUTH_CREATION_PENDING'
    and exists (select 1 from public.profiles where id = p_owner_id and role = 'admin'::public.user_role)
    and exists (select 1 from public.profiles where id = p_user_id and role = 'customer'::public.user_role);
  if not found then return query select false, 'PROVISIONING_NOT_READY'; return; end if;
  insert into public.kael_permission_audit (
    actor_id, actor_role, purpose, action, topic, decision, reason_code, safe_metadata
  ) values (
    p_owner_id, 'admin', 'admin_operator_provisioning', 'create',
    'admin_operator', 'allow', 'pending_password_change',
    pg_catalog.jsonb_build_object('provisioning_id', p_provisioning_id, 'user_id', p_user_id)
  );
  return query select true, null::text;
end;
$function$;

create or replace function public.admin_fail_operator_provisioning(
  p_owner_id uuid,
  p_provisioning_id uuid,
  p_failure_code text
)
returns void
language sql
security definer
set search_path = ''
as $function$
  update public.admin_operator_provisioning as provisioning
  set status = 'failed', failure_code = left(coalesce(p_failure_code, 'AUTH_CREATE_FAILED'), 80)
  where provisioning.id = p_provisioning_id
    and provisioning.created_by = p_owner_id
    and exists (select 1 from public.profiles where id = p_owner_id and role = 'admin'::public.user_role);
$function$;

create or replace function public.activate_admin_operator_atomic(p_actor_id uuid)
returns table(ok boolean, error_code text, role_out public.user_role, capabilities_out text[], activated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_provisioning public.admin_operator_provisioning%rowtype;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  select provisioning.* into v_provisioning
  from public.admin_operator_provisioning as provisioning
  where provisioning.user_id = p_actor_id
  for update;
  if not found then return query select false, 'PROVISIONING_NOT_FOUND', null::public.user_role, '{}'::text[], null::timestamptz; return; end if;
  if v_provisioning.status = 'active' then
    return query select true, null::text, 'admin_operator'::public.user_role, v_provisioning.capabilities, v_provisioning.activated_at; return;
  end if;
  if v_provisioning.status <> 'pending_password_change' then
    return query select false, 'PROVISIONING_NOT_READY', null::public.user_role, '{}'::text[], null::timestamptz; return;
  end if;

  insert into public.admin_operator_accounts (
    user_id, baseline_role, capabilities, status, granted_by, last_changed_by
  ) values (
    p_actor_id, 'customer'::public.user_role, v_provisioning.capabilities,
    'active', v_provisioning.created_by, v_provisioning.created_by
  ) on conflict (user_id) do update
  set capabilities = excluded.capabilities, status = 'active',
      last_changed_by = excluded.last_changed_by, revoked_at = null;
  update public.profiles set role = 'admin_operator'::public.user_role where id = p_actor_id;
  update public.admin_operator_provisioning
  set status = 'active', failure_code = null, activated_at = v_now
  where id = v_provisioning.id;
  insert into public.kael_permission_audit (
    actor_id, actor_role, purpose, action, topic, decision, reason_code, safe_metadata
  ) values (
    p_actor_id, 'customer', 'admin_operator_activation', 'activate',
    'admin_operator', 'allow', 'first_password_changed',
    pg_catalog.jsonb_build_object('provisioning_id', v_provisioning.id, 'capability_count', cardinality(v_provisioning.capabilities))
  );
  return query select true, null::text, 'admin_operator'::public.user_role, v_provisioning.capabilities, v_now;
end;
$function$;

revoke all on function public.save_worker_registration_draft_atomic(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_worker_registration_draft_atomic(uuid, uuid, jsonb) to service_role;
revoke all on function private.enqueue_worker_profile_verification() from public, anon, authenticated;
revoke all on function public.admin_review_worker_profile_atomic(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_review_worker_profile_atomic(uuid, uuid, text, text) to service_role;
revoke all on function public.admin_begin_operator_provisioning(uuid, text, text, text[]) from public, anon, authenticated;
grant execute on function public.admin_begin_operator_provisioning(uuid, text, text, text[]) to service_role;
revoke all on function public.admin_complete_operator_provisioning(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_complete_operator_provisioning(uuid, uuid, uuid) to service_role;
revoke all on function public.admin_fail_operator_provisioning(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_fail_operator_provisioning(uuid, uuid, text) to service_role;
revoke all on function public.activate_admin_operator_atomic(uuid) from public, anon, authenticated;
grant execute on function public.activate_admin_operator_atomic(uuid) to service_role;

commit;
