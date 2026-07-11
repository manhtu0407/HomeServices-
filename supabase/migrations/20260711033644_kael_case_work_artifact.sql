-- Durable, server-owned Case Work state for Kael customer sessions.
-- Progress telemetry remains separate; these columns are the current
-- diagnosis/scope artifact and the phase that mobile is allowed to reveal.

alter table public.kael_chat_sessions
  add column if not exists case_phase text not null default 'analysis',
  add column if not exists diagnosis_scope jsonb,
  add column if not exists scheduled_at timestamptz;

alter table public.kael_chat_sessions
  add constraint kael_chat_sessions_case_phase_check
  check (case_phase in (
    'analysis',
    'offer_review',
    'matching',
    'worker_candidate_review',
    'worker_en_route',
    'service_execution',
    'scope_change_review',
    'completion_review',
    'payment',
    'review',
    'closed'
  ));

alter table public.kael_chat_sessions
  add constraint kael_chat_sessions_diagnosis_scope_shape_check
  check (
    diagnosis_scope is null
    or (
      jsonb_typeof(diagnosis_scope) = 'object'
      and diagnosis_scope ->> 'version' = '1'
      and diagnosis_scope ? 'service_type'
      and diagnosis_scope ? 'profile_id'
      and diagnosis_scope ? 'case_phase'
      and jsonb_typeof(diagnosis_scope -> 'facts') = 'object'
      and jsonb_typeof(diagnosis_scope -> 'missing_facts') = 'array'
      and jsonb_typeof(diagnosis_scope -> 'evidence') = 'array'
      and jsonb_typeof(diagnosis_scope -> 'quote_blockers') = 'array'
      and jsonb_typeof(diagnosis_scope -> 'worker_requirements') = 'array'
      and jsonb_typeof(diagnosis_scope -> 'next_action') = 'object'
    )
  );

comment on column public.kael_chat_sessions.case_phase is
  'Server-owned Case Work phase; clients render but never author this value.';

comment on column public.kael_chat_sessions.diagnosis_scope is
  'Validated current DiagnosisScopeArtifact. Per-turn metadata remains the immutable audit snapshot.';

comment on column public.kael_chat_sessions.scheduled_at is
  'Structured customer-requested service time copied into the confirmed job handoff.';

alter table public.jobs
  add column if not exists diagnosis_scope jsonb;

alter table public.jobs
  add constraint jobs_diagnosis_scope_shape_check
  check (
    diagnosis_scope is null
    or (
      jsonb_typeof(diagnosis_scope) = 'object'
      and diagnosis_scope ->> 'version' = '1'
      and diagnosis_scope ->> 'quote_ready' = 'true'
      and diagnosis_scope ->> 'case_phase' in ('offer_review', 'matching')
    )
  );

comment on column public.jobs.diagnosis_scope is
  'Immutable-at-handoff DiagnosisScopeArtifact snapshot used for worker requirements, scope review, and audit.';

create or replace function public.confirm_kael_chat_atomic(
  p_session_id uuid,
  p_customer_id uuid
) returns table (
  ok boolean,
  error_code text,
  job_id uuid,
  job_status public.job_status,
  service_type public.service_type,
  district_code text
) language plpgsql security invoker
set search_path = public, pg_catalog
as $func$
declare
  v_session public.kael_chat_sessions%rowtype;
  v_estimate_turn public.kael_chat_turns%rowtype;
  v_estimate jsonb;
  v_estimate_card jsonb;
  v_service_problem_id uuid;
  v_description text;
  v_problem_chips text[];
  v_photo_urls text[];
  v_address_district text;
  v_job_id uuid;
begin
  select * into v_session
  from public.kael_chat_sessions
  where id = p_session_id
  for update;

  if not found or v_session.customer_id <> p_customer_id then
    return query select false, 'NOT_FOUND', null::uuid, null::public.job_status, null::public.service_type, null::text;
    return;
  end if;

  if v_session.status = 'confirmed' or v_session.job_id is not null then
    return query select false, 'ALREADY_CONFIRMED', v_session.job_id, null::public.job_status, v_session.service_type, null::text;
    return;
  end if;

  if v_session.status <> 'estimate_ready' or v_session.case_phase <> 'offer_review' then
    return query select false, 'INVALID_STATUS', null::uuid, null::public.job_status, v_session.service_type, null::text;
    return;
  end if;

  if v_session.diagnosis_scope is null
    or v_session.diagnosis_scope ->> 'quote_ready' <> 'true'
    or jsonb_array_length(coalesce(v_session.diagnosis_scope -> 'quote_blockers', '[]'::jsonb)) <> 0
    or coalesce((v_session.diagnosis_scope -> 'facts' ->> 'needs_inspection')::boolean, false)
    or coalesce((v_session.diagnosis_scope ->> 'confidence')::numeric, 0) < 0.7
    or v_session.diagnosis_scope -> 'next_action' ->> 'kind' <> 'prepare_offer'
    or nullif(v_session.diagnosis_scope ->> 'scope_summary', '') is null
  then
    return query select false, 'MISSING_SCOPE', null::uuid, null::public.job_status, v_session.service_type, null::text;
    return;
  end if;

  select * into v_estimate_turn
  from public.kael_chat_turns
  where session_id = p_session_id
    and role = 'kael'
    and content_type = 'estimate'
  order by turn_index desc
  limit 1
  for update;

  if not found then
    return query select false, 'MISSING_ESTIMATE', null::uuid, null::public.job_status, v_session.service_type, null::text;
    return;
  end if;

  v_estimate := coalesce(v_estimate_turn.safe_metadata -> 'estimate', '{}'::jsonb);
  v_estimate_card := nullif(
    coalesce(v_estimate_turn.safe_metadata -> 'estimate_card_v3', '{}'::jsonb),
    '{}'::jsonb
  );
  v_service_problem_id := nullif(
    v_estimate_turn.safe_metadata ->> 'service_problem_id',
    ''
  )::uuid;
  if v_estimate = '{}'::jsonb
    or nullif(v_estimate ->> 'problem_summary', '') is null
    or nullif(v_estimate ->> 'complexity', '') is null
    or nullif(v_estimate ->> 'price_min', '') is null
    or nullif(v_estimate ->> 'price_max', '') is null
  then
    return query select false, 'MISSING_ESTIMATE', null::uuid, null::public.job_status, v_session.service_type, null::text;
    return;
  end if;

  v_address_district := nullif(v_session.safe_metadata ->> 'address_district', '');
  if v_address_district is null then
    return query select false, 'NO_DISTRICT', null::uuid, null::public.job_status, v_session.service_type, null::text;
    return;
  end if;

  v_description := v_session.diagnosis_scope ->> 'scope_summary';
  v_problem_chips := coalesce(
    array(select jsonb_array_elements_text(v_session.safe_metadata -> 'problem_chips')),
    array[]::text[]
  );
  if cardinality(v_problem_chips) = 0 then
    v_problem_chips := array[v_estimate ->> 'problem_category'];
  end if;

  v_photo_urls := coalesce(
    array(
      select distinct evidence ->> 'ref'
      from jsonb_array_elements(v_session.diagnosis_scope -> 'evidence') as evidence
      where evidence ->> 'kind' in ('photo', 'video_frame')
        and nullif(evidence ->> 'ref', '') is not null
    ),
    array[]::text[]
  );

  insert into public.jobs (
    customer_id,
    service_type,
    description,
    problem_chips,
    photo_urls,
    address_district,
    scheduled_at,
    status,
    service_problem_id,
    diagnosis_scope,
    kael_problem_identified,
    kael_complexity,
    kael_price_min,
    kael_price_max,
    kael_advisory,
    kael_estimate_card_v3,
    estimate_ready_at
  ) values (
    v_session.customer_id,
    v_session.service_type,
    v_description,
    v_problem_chips,
    v_photo_urls,
    v_address_district,
    v_session.scheduled_at,
    'awaiting_customer_confirm'::public.job_status,
    v_service_problem_id,
    v_session.diagnosis_scope,
    v_estimate ->> 'problem_summary',
    (v_estimate ->> 'complexity')::public.complexity_level,
    (v_estimate ->> 'price_min')::int,
    (v_estimate ->> 'price_max')::int,
    nullif(v_estimate ->> 'advisory', ''),
    v_estimate_card,
    now()
  ) returning id into v_job_id;

  update public.kael_chat_sessions
  set job_id = v_job_id,
      status = 'confirmed',
      case_phase = 'matching',
      updated_at = now()
  where id = p_session_id;

  return query select true, null::text, v_job_id,
    'awaiting_customer_confirm'::public.job_status,
    v_session.service_type,
    v_address_district;
end;
$func$;

revoke execute on function public.confirm_kael_chat_atomic(uuid, uuid) from public, anon, authenticated;
grant execute on function public.confirm_kael_chat_atomic(uuid, uuid) to service_role;
