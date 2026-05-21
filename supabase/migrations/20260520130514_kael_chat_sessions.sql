-- =============================================================================
-- Kael-first chat sessions for customer intake.
--
-- Sessions and turns are read-only to authenticated mobile clients. All writes
-- flow through the Edge mobile API with the service role.
-- =============================================================================

create table if not exists public.kael_chat_sessions (
  id                  uuid primary key default gen_random_uuid(),
  job_id              uuid references public.jobs on delete cascade unique,
  customer_id         uuid references public.profiles on delete cascade not null,
  service_type        public.service_type not null,
  status              text not null default 'active' check (status in (
    'active',
    'estimate_ready',
    'confirmed',
    'abandoned'
  )),
  started_at          timestamptz not null default now(),
  estimate_ready_at   timestamptz,
  abandoned_at        timestamptz,
  total_turns         int not null default 0 check (total_turns >= 0),
  total_cost_usd      numeric(10,6) not null default 0 check (total_cost_usd >= 0),
  safe_metadata       jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.kael_chat_turns (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid references public.kael_chat_sessions on delete cascade not null,
  turn_index      int not null check (turn_index > 0),
  role            text not null check (role in ('customer', 'kael', 'system')),
  content_type    text not null check (content_type in (
    'text',
    'photo_request',
    'video_request',
    'photo_attached',
    'video_attached',
    'clarification',
    'analysis',
    'estimate',
    'error'
  )),
  text_content    text check (text_content is null or char_length(text_content) <= 5000),
  media_refs      text[] not null default '{}'::text[],
  safe_metadata   jsonb not null default '{}'::jsonb,
  ai_provider     public.api_provider,
  ai_model        text,
  cost_usd        numeric(10,6) check (cost_usd is null or cost_usd >= 0),
  latency_ms      int check (latency_ms is null or latency_ms >= 0),
  created_at      timestamptz not null default now(),
  unique (session_id, turn_index)
);

create index if not exists kael_chat_sessions_customer_idx
  on public.kael_chat_sessions (customer_id, created_at desc);
create index if not exists kael_chat_sessions_job_idx
  on public.kael_chat_sessions (job_id);
create index if not exists kael_chat_sessions_status_idx
  on public.kael_chat_sessions (status, created_at desc);
create index if not exists kael_chat_turns_session_idx
  on public.kael_chat_turns (session_id, turn_index);

alter table public.kael_chat_sessions enable row level security;
alter table public.kael_chat_turns enable row level security;

drop policy if exists "Customers read own chat sessions" on public.kael_chat_sessions;
create policy "Customers read own chat sessions"
  on public.kael_chat_sessions for select
  to authenticated
  using (customer_id = (select auth.uid()) or private.is_admin());

drop policy if exists "Customers read own chat turns" on public.kael_chat_turns;
create policy "Customers read own chat turns"
  on public.kael_chat_turns for select
  to authenticated
  using (
    exists (
      select 1
      from public.kael_chat_sessions s
      where s.id = session_id
        and (s.customer_id = (select auth.uid()) or private.is_admin())
    )
  );

revoke insert, update, delete on public.kael_chat_sessions from authenticated;
revoke insert, update, delete on public.kael_chat_turns from authenticated;
grant select on public.kael_chat_sessions to authenticated;
grant select on public.kael_chat_turns to authenticated;
grant all on public.kael_chat_sessions to service_role;
grant all on public.kael_chat_turns to service_role;

drop trigger if exists kael_chat_sessions_updated_at on public.kael_chat_sessions;
create trigger kael_chat_sessions_updated_at
  before update on public.kael_chat_sessions
  for each row execute function update_updated_at();

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
  v_description text;
  v_problem_chips text[];
  v_photo_urls text[];
  v_address_district text;
  v_job_id uuid;
begin
  select *
  into v_session
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

  if v_session.status <> 'estimate_ready' then
    return query select false, 'INVALID_STATUS', null::uuid, null::public.job_status, v_session.service_type, null::text;
    return;
  end if;

  select *
  into v_estimate_turn
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

  v_estimate := coalesce(v_estimate_turn.safe_metadata->'estimate', '{}'::jsonb);
  if v_estimate = '{}'::jsonb
    or nullif(v_estimate->>'problem_summary', '') is null
    or nullif(v_estimate->>'complexity', '') is null
    or nullif(v_estimate->>'price_min', '') is null
    or nullif(v_estimate->>'price_max', '') is null
  then
    return query select false, 'MISSING_ESTIMATE', null::uuid, null::public.job_status, v_session.service_type, null::text;
    return;
  end if;

  v_address_district := nullif(v_session.safe_metadata->>'address_district', '');
  if v_address_district is null then
    return query select false, 'NO_DISTRICT', null::uuid, null::public.job_status, v_session.service_type, null::text;
    return;
  end if;

  select text_content
  into v_description
  from public.kael_chat_turns
  where session_id = p_session_id
    and role = 'customer'
    and text_content is not null
  order by turn_index asc
  limit 1;

  v_problem_chips := coalesce(
    array(select jsonb_array_elements_text(v_session.safe_metadata->'problem_chips')),
    array[]::text[]
  );
  if cardinality(v_problem_chips) = 0 then
    v_problem_chips := array[v_estimate->>'problem_category'];
  end if;

  v_photo_urls := coalesce(
    array(
      select distinct unnest(media_refs)
      from public.kael_chat_turns
      where session_id = p_session_id
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
    status,
    kael_problem_identified,
    kael_complexity,
    kael_price_min,
    kael_price_max,
    kael_advisory,
    estimate_ready_at
  ) values (
    v_session.customer_id,
    v_session.service_type,
    coalesce(nullif(v_description, ''), v_estimate->>'problem_summary'),
    v_problem_chips,
    v_photo_urls,
    v_address_district,
    'awaiting_customer_confirm'::public.job_status,
    v_estimate->>'problem_summary',
    (v_estimate->>'complexity')::public.complexity_level,
    (v_estimate->>'price_min')::int,
    (v_estimate->>'price_max')::int,
    nullif(v_estimate->>'advisory', ''),
    now()
  ) returning id into v_job_id;

  update public.kael_chat_sessions
  set
    job_id = v_job_id,
    status = 'confirmed',
    updated_at = now()
  where id = p_session_id;

  return query
    select true, null::text, v_job_id, 'awaiting_customer_confirm'::public.job_status, v_session.service_type, v_address_district;
end;
$func$;

revoke execute on function public.confirm_kael_chat_atomic(uuid, uuid) from public;
revoke execute on function public.confirm_kael_chat_atomic(uuid, uuid) from anon;
revoke execute on function public.confirm_kael_chat_atomic(uuid, uuid) from authenticated;
grant execute on function public.confirm_kael_chat_atomic(uuid, uuid) to service_role;
