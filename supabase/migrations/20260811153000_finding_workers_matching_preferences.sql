alter table public.kael_chat_sessions
  add column if not exists preferred_worker_id uuid references public.worker_profiles(id) on delete set null;

create table public.job_matching_preferences (
  job_id uuid primary key references public.jobs(id) on delete cascade,
  customer_id uuid not null references public.customer_profiles(id) on delete cascade,
  strategy text not null default 'pending',
  preferred_worker_id uuid references public.worker_profiles(id) on delete set null,
  auto_general boolean not null default true,
  client_request_id uuid,
  selected_at timestamptz,
  fallback_at timestamptz,
  fallback_reason text,
  created_at timestamptz not null default now(),
  constraint job_matching_preferences_strategy_check
    check (strategy in ('pending', 'general', 'saved_worker_first')),
  constraint job_matching_preferences_target_check
    check (
      (strategy = 'saved_worker_first' and preferred_worker_id is not null)
      or (strategy in ('pending', 'general') and preferred_worker_id is null)
    ),
  constraint job_matching_preferences_fallback_reason_check
    check (
      fallback_reason is null
      or fallback_reason in ('saved_worker_declined', 'saved_worker_expired', 'saved_worker_unavailable')
    )
);

create index job_matching_preferences_customer_idx
  on public.job_matching_preferences (customer_id, created_at desc);

alter table public.job_matching_preferences enable row level security;

create policy "Customers read own matching preferences"
  on public.job_matching_preferences
  for select
  to authenticated
  using (customer_id = (select auth.uid()));

create policy "Admins read matching preferences"
  on public.job_matching_preferences
  for select
  to authenticated
  using (private.is_admin());

revoke all on public.job_matching_preferences from public, anon, authenticated;
grant select on public.job_matching_preferences to authenticated;
revoke insert, update, delete on public.job_matching_preferences from authenticated;
grant select, insert, update, delete on public.job_matching_preferences to service_role;

create or replace function public.begin_job_matching_preference_atomic(
  p_job_id uuid,
  p_customer_id uuid,
  p_final_price integer,
  p_worker_brief_core jsonb
)
returns table (
  ok boolean,
  error_code text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.jobs%rowtype;
begin
  if p_job_id is null
     or p_customer_id is null
     or p_final_price is null
     or p_final_price <= 0
     or p_worker_brief_core is null then
    return query select false, 'INVALID_INPUT'::text;
    return;
  end if;

  select *
    into v_job
  from public.jobs as job
  where job.id = p_job_id
  for update;

  if not found then
    return query select false, 'NOT_FOUND'::text;
    return;
  end if;
  if v_job.customer_id is distinct from p_customer_id then
    return query select false, 'NOT_OWNER'::text;
    return;
  end if;
  if v_job.status is distinct from 'awaiting_customer_confirm'::public.job_status then
    return query select false, 'INVALID_STATUS'::text;
    return;
  end if;
  if exists (
    select 1
    from public.job_matching_preferences as preference
    where preference.job_id = p_job_id
    for update
  ) then
    return query select false, 'PREFERENCE_LOCKED'::text;
    return;
  end if;

  update public.jobs as job
  set status = 'broadcasting'::public.job_status,
      broadcast_at = now(),
      confirmed_search_at = now(),
      final_price = p_final_price,
      kael_worker_brief_core = p_worker_brief_core
  where job.id = p_job_id;

  insert into public.job_matching_preferences (
    job_id,
    customer_id,
    strategy,
    preferred_worker_id,
    auto_general
  ) values (
    p_job_id,
    p_customer_id,
    'pending',
    null,
    true
  );

  return query select true, null::text;
end;
$$;

revoke execute on function public.begin_job_matching_preference_atomic(uuid, uuid, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.begin_job_matching_preference_atomic(uuid, uuid, integer, jsonb)
  to service_role;

create or replace function public.set_job_matching_preference_atomic(
  p_job_id uuid,
  p_customer_id uuid,
  p_strategy text,
  p_preferred_worker_id uuid,
  p_auto_general boolean,
  p_client_request_id uuid
)
returns table (
  ok boolean,
  error_code text,
  strategy text,
  preferred_worker_id uuid,
  auto_general boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_customer_id uuid;
  v_job_status public.job_status;
  v_preference public.job_matching_preferences%rowtype;
begin
  if p_job_id is null
     or p_customer_id is null
     or p_strategy not in ('general', 'saved_worker_first')
     or p_auto_general is null
     or p_client_request_id is null then
    return query select false, 'INVALID_INPUT'::text, null::text, null::uuid, null::boolean;
    return;
  end if;

  select job.customer_id, job.status
    into v_job_customer_id, v_job_status
  from public.jobs as job
  where job.id = p_job_id
  for update;

  if not found then
    return query select false, 'NOT_FOUND'::text, null::text, null::uuid, null::boolean;
    return;
  end if;
  if v_job_customer_id is distinct from p_customer_id then
    return query select false, 'NOT_OWNER'::text, null::text, null::uuid, null::boolean;
    return;
  end if;
  if v_job_status is distinct from 'broadcasting'::public.job_status then
    return query select false, 'INVALID_STATUS'::text, null::text, null::uuid, null::boolean;
    return;
  end if;
  if p_strategy = 'saved_worker_first' and p_preferred_worker_id is null then
    return query select false, 'INVALID_TARGET'::text, null::text, null::uuid, null::boolean;
    return;
  end if;
  if p_strategy = 'general' and p_preferred_worker_id is not null then
    return query select false, 'INVALID_TARGET'::text, null::text, null::uuid, null::boolean;
    return;
  end if;
  if p_strategy = 'saved_worker_first' and not exists (
    select 1
    from public.customer_favorite_workers as favorite
    where favorite.customer_id = p_customer_id
      and favorite.worker_id = p_preferred_worker_id
  ) then
    return query select false, 'FAVORITE_NOT_FOUND'::text, null::text, null::uuid, null::boolean;
    return;
  end if;

  select *
    into v_preference
  from public.job_matching_preferences as preference
  where preference.job_id = p_job_id
  for update;

  if not found then
    return query select false, 'PREFERENCE_REQUIRED'::text, null::text, null::uuid, null::boolean;
    return;
  end if;

  if v_preference.strategy is distinct from 'pending' then
    if v_preference.strategy = p_strategy
       and v_preference.preferred_worker_id is not distinct from p_preferred_worker_id
       and v_preference.auto_general is not distinct from p_auto_general then
      return query select true, null::text, v_preference.strategy, v_preference.preferred_worker_id, v_preference.auto_general;
      return;
    end if;
    return query select false, 'PREFERENCE_LOCKED'::text, v_preference.strategy, v_preference.preferred_worker_id, v_preference.auto_general;
    return;
  end if;

  update public.job_matching_preferences as preference
  set strategy = p_strategy,
      preferred_worker_id = p_preferred_worker_id,
      auto_general = p_auto_general,
      client_request_id = p_client_request_id,
      selected_at = now()
  where preference.job_id = p_job_id
    and preference.strategy = 'pending'
  returning * into v_preference;

  if not found then
    select *
      into v_preference
    from public.job_matching_preferences as preference
    where preference.job_id = p_job_id;
    return query select false, 'PREFERENCE_LOCKED'::text, v_preference.strategy, v_preference.preferred_worker_id, v_preference.auto_general;
    return;
  end if;

  return query select true, null::text, v_preference.strategy, v_preference.preferred_worker_id, v_preference.auto_general;
end;
$$;

revoke execute on function public.set_job_matching_preference_atomic(uuid, uuid, text, uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function public.set_job_matching_preference_atomic(uuid, uuid, text, uuid, boolean, uuid) to service_role;

create or replace function public.claim_saved_worker_fallback_atomic(
  p_job_id uuid,
  p_reason text,
  p_expected_worker_id uuid default null
)
returns table (
  claimed boolean,
  error_code text,
  customer_id uuid,
  preferred_worker_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job public.jobs%rowtype;
  v_preference public.job_matching_preferences%rowtype;
begin
  if p_job_id is null or p_reason not in ('saved_worker_declined', 'saved_worker_expired', 'saved_worker_unavailable') then
    return query select false, 'INVALID_INPUT'::text, null::uuid, null::uuid;
    return;
  end if;

  select *
    into v_job
  from public.jobs as job
  where job.id = p_job_id
  for update;

  if not found then
    return query select false, 'NOT_FOUND'::text, null::uuid, null::uuid;
    return;
  end if;
  if v_job.status is distinct from 'broadcasting'::public.job_status then
    return query select false, 'INVALID_STATUS'::text, v_job.customer_id, null::uuid;
    return;
  end if;

  select *
    into v_preference
  from public.job_matching_preferences as preference
  where preference.job_id = p_job_id
  for update;

  if not found then
    return query select false, 'NOT_APPLICABLE'::text, v_job.customer_id, null::uuid;
    return;
  end if;
  if v_preference.strategy is distinct from 'saved_worker_first'
     or v_preference.auto_general is not true
     or v_preference.fallback_at is not null
     or (p_expected_worker_id is not null and v_preference.preferred_worker_id is distinct from p_expected_worker_id) then
    return query select false, 'NOT_APPLICABLE'::text, v_job.customer_id, v_preference.preferred_worker_id;
    return;
  end if;
  if exists (
    select 1
    from public.job_worker_candidates as candidate
    where candidate.job_id = p_job_id
      and candidate.status = 'proposed'
      and (candidate.expires_at is null or candidate.expires_at > now())
  ) then
    return query select false, 'CANDIDATE_PENDING'::text, v_job.customer_id, v_preference.preferred_worker_id;
    return;
  end if;
  if exists (
    select 1
    from public.job_broadcasts as broadcast
    where broadcast.job_id = p_job_id
      and broadcast.status = 'sent'
      and (broadcast.expires_at is null or broadcast.expires_at > now())
  ) then
    return query select false, 'ACTIVE_BROADCAST'::text, v_job.customer_id, v_preference.preferred_worker_id;
    return;
  end if;

  update public.job_matching_preferences
  set fallback_at = now(),
      fallback_reason = p_reason
  where job_id = p_job_id;

  return query select true, null::text, v_job.customer_id, v_preference.preferred_worker_id;
end;
$$;

revoke execute on function public.claim_saved_worker_fallback_atomic(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.claim_saved_worker_fallback_atomic(uuid, text, uuid) to service_role;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function private.schedule_kael_matching_maintainer()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_project_url text;
  v_maintainer_secret text;
begin
  if to_regclass('vault.decrypted_secrets') is null
    or to_regclass('cron.job') is null then
    return false;
  end if;

  select decrypted_secret into v_project_url
  from vault.decrypted_secrets
  where name = 'project_url'
  limit 1;

  select decrypted_secret into v_maintainer_secret
  from vault.decrypted_secrets
  where name = 'kael_matching_maintainer_secret'
  limit 1;

  if nullif(btrim(v_project_url), '') is null
    or nullif(btrim(v_maintainer_secret), '') is null then
    return false;
  end if;

  if exists (
    select 1 from cron.job where jobname = 'kael-matching-maintainer'
  ) then
    perform cron.unschedule('kael-matching-maintainer');
  end if;

  perform cron.schedule(
    'kael-matching-maintainer',
    '* * * * *',
    $cron$
      with maintainer_config as (
        select
          max(decrypted_secret) filter (where name = 'project_url') as project_url,
          max(decrypted_secret) filter (where name = 'kael_matching_maintainer_secret') as maintainer_secret
        from vault.decrypted_secrets
      )
      select net.http_post(
        url := rtrim(project_url, '/') || '/functions/v1/kael-matching-maintainer',
        headers := jsonb_build_object(
          'content-type', 'application/json',
          'x-kael-matching-maintainer-secret', maintainer_secret
        ),
        body := '{}'::jsonb
      )
      from maintainer_config
      where nullif(project_url, '') is not null
        and nullif(maintainer_secret, '') is not null;
    $cron$
  );
  return true;
end;
$$;

revoke all on function private.schedule_kael_matching_maintainer()
  from public, anon, authenticated;
grant execute on function private.schedule_kael_matching_maintainer()
  to service_role;

select private.schedule_kael_matching_maintainer();
