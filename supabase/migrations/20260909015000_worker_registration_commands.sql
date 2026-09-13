create table if not exists public.worker_registration_commands (
  operation_id uuid primary key default pg_catalog.gen_random_uuid(),
  worker_id uuid not null references public.profiles(id) on delete cascade,
  client_request_id uuid not null,
  draft_updated_at timestamptz not null check (pg_catalog.isfinite(draft_updated_at)),
  outcome text not null check (outcome in ('submitted', 'rejected')),
  error_code text,
  verification_status public.worker_verification_status,
  submitted_at timestamptz,
  recorded_at timestamptz not null default pg_catalog.clock_timestamp(),
  unique (worker_id, client_request_id),
  check (
    (outcome = 'submitted' and error_code is null
      and verification_status is not distinct from 'submitted'::public.worker_verification_status
      and submitted_at is not null)
    or (outcome = 'rejected' and error_code is not null and submitted_at is null)
  )
);

alter table public.worker_registration_commands enable row level security;
revoke all on public.worker_registration_commands from public, anon, authenticated, service_role;
grant select on public.worker_registration_commands to service_role;

create or replace function public.submit_worker_registration_draft_atomic(
  p_actor_id uuid,
  p_worker_id uuid,
  p_client_request_id uuid,
  p_expected_draft_updated_at timestamptz
) returns setof public.worker_registration_commands
language plpgsql security definer
set search_path = ''
as $function$
declare
  v_role public.user_role;
  v_worker public.worker_profiles%rowtype;
  v_command public.worker_registration_commands%rowtype;
  v_result record;
  v_error text;
begin
  if p_actor_id is null or p_worker_id is null
    or p_actor_id is distinct from p_worker_id then
    raise exception using errcode = '42501', message = 'WORKER_ACCESS_REQUIRED';
  end if;
  if p_client_request_id is null or p_expected_draft_updated_at is null
    or not pg_catalog.isfinite(p_expected_draft_updated_at) then
    raise exception using errcode = '22023', message = 'INVALID_INPUT';
  end if;

  -- Share the legacy registration lock order so old and new clients serialize.
  select profile.role into v_role from public.profiles as profile
    where profile.id = p_actor_id for update;
  if not found or v_role is distinct from 'worker'::public.user_role then
    raise exception using errcode = '42501', message = 'WORKER_ACCESS_REQUIRED';
  end if;

  select command.* into v_command from public.worker_registration_commands as command
    where command.worker_id = p_worker_id and command.client_request_id = p_client_request_id;
  if found then
    if v_command.draft_updated_at is distinct from p_expected_draft_updated_at then
      raise exception using errcode = '23505', message = 'IDEMPOTENCY_CONFLICT';
    end if;
    -- Review may have advanced since this command committed; never submit it again.
    return next v_command;
    return;
  end if;

  select worker.* into v_worker from public.worker_profiles as worker
    where worker.id = p_worker_id for update;
  if not found then
    v_error := 'DRAFT_NOT_FOUND';
  elsif v_worker.updated_at is distinct from p_expected_draft_updated_at then
    v_error := 'STALE_DRAFT';
  elsif v_worker.verification_status not in ('draft', 'rejected')
    or v_worker.is_approved is not false or v_worker.is_suspended is not false then
    v_error := 'DRAFT_NOT_EDITABLE';
  elsif v_worker.service_radius_km is null
    or v_worker.service_radius_km not between 1 and 30
    or v_worker.service_radius_km <> pg_catalog.trunc(v_worker.service_radius_km) then
    -- The legacy submission contract takes an integer; implicit casts would round.
    v_error := 'INVALID_INPUT';
  else
    select * into strict v_result from public.submit_worker_registration_atomic(
      p_actor_id, p_worker_id, v_worker.legal_name, v_worker.date_of_birth,
      v_worker.gender, v_worker.service_types, v_worker.years_experience,
      v_worker.districts, v_worker.home_lat, v_worker.home_lng,
      v_worker.service_radius_km::integer, v_worker.problem_specializations,
      v_worker.cccd_front_url, v_worker.cccd_back_url, v_worker.selfie_url,
      v_worker.bank_account, v_worker.bank_name
    );
    if v_result.ok is true then
      if v_result.error_code is not null
        or v_result.worker_id_out is distinct from p_worker_id
        or v_result.verification_status_out is distinct from 'submitted'::public.worker_verification_status
        or v_result.submitted_at_ts is null then
        raise exception using errcode = 'XX000', message = 'INVALID_REGISTRATION_RECEIPT';
      end if;
      insert into public.worker_registration_commands (
        worker_id, client_request_id, draft_updated_at, outcome, verification_status, submitted_at
      ) values (
        p_worker_id, p_client_request_id, p_expected_draft_updated_at,
        'submitted', v_result.verification_status_out, v_result.submitted_at_ts
      ) returning * into v_command;
      return next v_command;
      return;
    elsif v_result.ok is false and v_result.error_code in (
      'INVALID_INPUT', 'ALREADY_FINALIZED', 'WRITE_CONFLICT', 'NOT_FOUND', 'WRONG_ROLE', 'NOT_OWNER'
    ) then
      v_error := v_result.error_code;
    else
      raise exception using errcode = 'XX000', message = 'INVALID_REGISTRATION_RECEIPT';
    end if;
  end if;

  insert into public.worker_registration_commands (
    worker_id, client_request_id, draft_updated_at, outcome, error_code, verification_status
  ) values (
    p_worker_id, p_client_request_id, p_expected_draft_updated_at,
    'rejected', v_error, v_worker.verification_status
  ) returning * into v_command;
  return next v_command;
end;
$function$;

create or replace function public.get_worker_registration_command(
  p_actor_id uuid,
  p_client_request_id uuid
) returns setof public.worker_registration_commands
language sql stable security definer
set search_path = ''
as $function$
  select command.* from public.worker_registration_commands as command
    where command.worker_id = p_actor_id and command.client_request_id = p_client_request_id;
$function$;

revoke all on function public.submit_worker_registration_draft_atomic(uuid, uuid, uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.get_worker_registration_command(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.submit_worker_registration_draft_atomic(uuid, uuid, uuid, timestamptz)
  to service_role;
grant execute on function public.get_worker_registration_command(uuid, uuid) to service_role;
