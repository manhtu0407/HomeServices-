begin;

create or replace function private.guard_apartment_access_authority()
returns trigger language plpgsql security definer set search_path='' as $func$
declare
  v_state jsonb:=new.apartment_access_state;
  v_previous jsonb:=case when tg_op='UPDATE' then old.apartment_access_state else '{}'::jsonb end;
begin
  -- An assignment change invalidates even a check-in copied back onto the job later.
  if tg_op='UPDATE' and (new.worker_id is distinct from old.worker_id
    or new.customer_id is distinct from old.customer_id) then
    new.apartment_access_state:='{}'::jsonb;
    return new;
  end if;
  if new.worker_id is null or new.status not in ('worker_matched','worker_on_way','arrived','inspecting',
    'repairing','scope_change_pending','completed_by_worker','confirmed_by_customer','payment_pending','paid','reviewed') then
    new.apartment_access_state:='{}'::jsonb;
    return new;
  end if;
  if v_state->'check_in' is distinct from v_previous->'check_in' then
    v_state:=(v_state - array['customer_authorized_at','unit_released_at','authorized_worker_id','authorized_check_in_at'])
      ||jsonb_build_object('release_stage','building_released','exact_unit_released',false,
        'customer_authorized',false,'customer_authorization_required',true,'customer_handoff_required',true);
  end if;
  if (v_state->'customer_authorized'='true'::jsonb or v_state->'exact_unit_released'='true'::jsonb)
    and (v_state->'customer_authorized' is distinct from v_previous->'customer_authorized'
      or v_state->'exact_unit_released' is distinct from v_previous->'exact_unit_released'
      or v_state->'authorized_worker_id' is distinct from v_previous->'authorized_worker_id'
      or v_state->'authorized_check_in_at' is distinct from v_previous->'authorized_check_in_at'
      or v_state->'customer_authorized_at' is distinct from v_previous->'customer_authorized_at') then
    if current_setting('nestscout.apartment_access_job',true) is distinct from new.id::text
      or v_state->>'authorized_worker_id' is distinct from new.worker_id::text
      or v_state->>'authorized_check_in_at' is distinct from v_state#>>'{check_in,checked_in_at}'
      or v_state#>>'{check_in,worker_id}' is distinct from new.worker_id::text then
      raise exception using errcode='42501',message='ACCESS_CUSTOMER_AUTHORIZATION_REQUIRED';
    end if;
  end if;
  new.apartment_access_state:=v_state;
  return new;
end;
$func$;
revoke all on function private.guard_apartment_access_authority() from public,anon,authenticated,service_role;
do $trigger$
begin
  if not exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.jobs'::regclass
    and tgname='jobs_apartment_access_authority' and not tgisinternal) then
    create trigger jobs_apartment_access_authority before insert or update on public.jobs
      for each row execute function private.guard_apartment_access_authority();
  end if;
end;
$trigger$;

create or replace function public.authorize_apartment_access_atomic(
  p_job_id uuid,p_customer_id uuid,p_expected_worker_id uuid,p_expected_check_in_at text)
returns table(ok boolean,error_code text,job_id uuid,worker_id uuid,checked_in_at text,
  authorized_at timestamptz,already_authorized boolean)
language plpgsql security definer set search_path='' as $func$
declare
  v_job public.jobs%rowtype;
  v_state jsonb;
  v_previous_guard text:=coalesce(current_setting('nestscout.apartment_access_job',true),'');
begin
  ok:=false; already_authorized:=false;
  select * into v_job from public.jobs where id=p_job_id for update;
  if not found or v_job.customer_id is distinct from p_customer_id
    or not exists(select 1 from public.profiles where id=p_customer_id and role='customer') then
    error_code:='NOT_FOUND'; return next; return;
  end if;
  job_id:=v_job.id; worker_id:=v_job.worker_id;
  v_state:=v_job.apartment_access_state;
  checked_in_at:=v_state#>>'{check_in,checked_in_at}';
  if v_job.status not in ('worker_matched','worker_on_way','arrived','inspecting','repairing',
    'scope_change_pending','completed_by_worker') or v_job.worker_id is null
    or v_state#>>'{check_in,worker_id}' is distinct from v_job.worker_id::text
    or nullif(checked_in_at,'') is null then
    error_code:='ACCESS_NOT_READY'; return next; return;
  end if;
  if p_expected_worker_id is distinct from v_job.worker_id
    or p_expected_check_in_at is distinct from checked_in_at then
    error_code:='ACCESS_CONTEXT_CHANGED'; return next; return;
  end if;
  if v_state->'exact_unit_released'='true'::jsonb and v_state->'customer_authorized'='true'::jsonb
    and v_state->>'authorized_worker_id'=v_job.worker_id::text
    and v_state->>'authorized_check_in_at'=checked_in_at
    and nullif(v_state->>'customer_authorized_at','') is not null then
    authorized_at:=(v_state->>'customer_authorized_at')::timestamptz;
    ok:=true; already_authorized:=true; return next; return;
  end if;
  authorized_at:=clock_timestamp();
  perform set_config('nestscout.apartment_access_job',v_job.id::text,true);
  update public.jobs set apartment_access_state=v_state||jsonb_build_object(
    'release_stage','unit_released','exact_unit_released',true,'worker_checked_in',true,
    'customer_authorized',true,'customer_authorized_at',authorized_at,'customer_authorization_required',false,
    'check_in_required',false,'identity_check_required',true,'customer_handoff_required',false,
    'unit_released_at',authorized_at,'authorized_worker_id',v_job.worker_id,'authorized_check_in_at',checked_in_at)
    where id=v_job.id;
  perform set_config('nestscout.apartment_access_job',v_previous_guard,true);
  insert into public.job_events(job_id,event_type,actor_id,actor_role,from_status,to_status,safe_metadata)
    values(v_job.id,'apartment_access_authorized',p_customer_id,'customer',v_job.status,v_job.status,
      jsonb_build_object('worker_id',v_job.worker_id,'checked_in_at',checked_in_at,'release_stage','unit_released'));
  perform public.insert_notification_atomic(v_job.worker_id,v_job.id,'apartment_access_authorized',
    'Khách đã cho phép lên','Bạn có thể xem địa chỉ căn hộ và lên gặp khách.',
    jsonb_build_object('checked_in_at',checked_in_at,'release_stage','unit_released'));
  ok:=true; return next;
end;
$func$;
revoke all on function public.authorize_apartment_access_atomic(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.authorize_apartment_access_atomic(uuid,uuid,uuid,text) to service_role;

commit;
