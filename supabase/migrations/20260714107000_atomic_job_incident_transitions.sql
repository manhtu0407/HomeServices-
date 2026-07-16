-- Serialize Kael job-incident sources, keep provider calls outside database
-- transactions, and reject assistant results produced from stale snapshots.

begin;

alter table public.kael_job_incidents
  add column if not exists revision bigint not null default 0,
  add column if not exists scope_proposal_claim_id uuid,
  add column if not exists scope_proposal_claimed_at timestamptz;

alter table public.kael_job_incident_events
  add column if not exists request_id uuid,
  add column if not exists source_revision bigint,
  add column if not exists source_job_status public.job_status,
  add column if not exists reported_description_snapshot text,
  add column if not exists reported_reason_snapshot text,
  add column if not exists assistant_claim_id uuid,
  add column if not exists assistant_claimed_at timestamptz,
  add column if not exists caused_by_event_id uuid
    references public.kael_job_incident_events(id) on delete set null;

create unique index if not exists kael_job_incident_events_request_once_idx
  on public.kael_job_incident_events (request_id)
  where request_id is not null;

-- Preserve legacy audit rows while retaining only the earliest direct link to a chat source.
with ranked_message_links as (
  select
    id,
    pg_catalog.row_number() over (
      partition by message_id
      order by created_at, id
    ) as message_rank
  from public.kael_job_incident_events
  where message_id is not null
)
update public.kael_job_incident_events as events
set message_id = null,
    safe_metadata = events.safe_metadata
      || '{"legacy_duplicate_message_link":true}'::jsonb
from ranked_message_links as ranked
where ranked.id = events.id
  and ranked.message_rank > 1;

create unique index if not exists kael_job_incident_events_message_global_once_idx
  on public.kael_job_incident_events (message_id)
  where message_id is not null;

create unique index if not exists kael_job_incident_events_cause_once_idx
  on public.kael_job_incident_events (caused_by_event_id)
  where caused_by_event_id is not null;

create unique index if not exists kael_job_incident_events_assistant_claim_once_idx
  on public.kael_job_incident_events (assistant_claim_id)
  where assistant_claim_id is not null;

create index if not exists kael_job_incidents_scope_claim_idx
  on public.kael_job_incidents (scope_proposal_claim_id)
  where scope_proposal_claim_id is not null;

create or replace function public.upsert_job_incident_signal_atomic(
  p_job_id uuid,
  p_opened_by uuid,
  p_reported_description text,
  p_reported_reason text,
  p_evidence_photo_urls jsonb,
  p_request_id uuid,
  p_assistant_claim_id uuid,
  p_content text
) returns table (
  ok boolean,
  error_code text,
  idempotent boolean,
  claimed boolean,
  incident jsonb,
  source_event_id uuid,
  revision bigint
) language plpgsql security definer
set search_path = ''
as $function$
declare
  v_incident public.kael_job_incidents%rowtype;
  v_source_event public.kael_job_incident_events%rowtype;
  v_job record;
  v_existing boolean;
  v_merged_evidence jsonb;
  v_now timestamptz;
begin
  if p_job_id is null or p_opened_by is null or p_assistant_claim_id is null then
    return query select false, 'AUTH_MISSING'::text, false, false, null::jsonb, null::uuid, null::bigint;
    return;
  end if;
  if pg_catalog.btrim(coalesce(p_reported_description, '')) = ''
    or pg_catalog.btrim(coalesce(p_reported_reason, '')) = ''
    or p_evidence_photo_urls is null
    or pg_catalog.jsonb_typeof(p_evidence_photo_urls) <> 'array'
  then
    return query select false, 'INVALID_INPUT'::text, false, false, null::jsonb, null::uuid, null::bigint;
    return;
  end if;

  if p_request_id is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('job_incident_request:' || p_request_id::text, 0)
    );
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('job_incident:' || p_job_id::text, 0)
  );

  if p_request_id is not null then
    select *
      into v_source_event
      from public.kael_job_incident_events
      where request_id = p_request_id;
    if found then
      if v_source_event.job_id <> p_job_id
        or v_source_event.actor_id <> p_opened_by
        or v_source_event.reported_description_snapshot is distinct from p_reported_description
        or v_source_event.reported_reason_snapshot is distinct from p_reported_reason
        or v_source_event.content is distinct from p_content
        or v_source_event.media_refs is distinct from p_evidence_photo_urls
      then
        return query select false, 'IDEMPOTENCY_CONFLICT'::text, false, false, null::jsonb, null::uuid, null::bigint;
        return;
      end if;
      select *
        into v_incident
        from public.kael_job_incidents
        where id = v_source_event.incident_id;
      if v_incident.revision = v_source_event.source_revision
        and not exists (
          select 1
          from public.kael_job_incident_events
          where caused_by_event_id = v_source_event.id
        )
        and (
          v_source_event.assistant_claim_id is null
          or v_source_event.assistant_claimed_at < pg_catalog.clock_timestamp() - interval '5 minutes'
        )
      then
        update public.kael_job_incident_events
          set assistant_claim_id = p_assistant_claim_id,
              assistant_claimed_at = pg_catalog.clock_timestamp()
          where id = v_source_event.id
          returning * into v_source_event;
        return query select true, null::text, true, true,
          pg_catalog.to_jsonb(v_incident), v_source_event.id, v_source_event.source_revision;
        return;
      end if;
      return query select true, null::text, true, false,
        pg_catalog.to_jsonb(v_incident), v_source_event.id, v_source_event.source_revision;
      return;
    end if;
  end if;

  select worker_id, status
    into v_job
    from public.jobs
    where id = p_job_id
    for update;
  if not found then
    return query select false, 'NOT_FOUND'::text, false, false, null::jsonb, null::uuid, null::bigint;
    return;
  end if;
  if v_job.worker_id is distinct from p_opened_by then
    return query select false, 'AUTH_FORBIDDEN'::text, false, false, null::jsonb, null::uuid, null::bigint;
    return;
  end if;
  if v_job.status::text not in (
    'worker_matched',
    'worker_on_way',
    'arrived',
    'inspecting',
    'repairing'
  ) then
    return query select false, 'INVALID_STATUS'::text, false, false, null::jsonb, null::uuid, null::bigint;
    return;
  end if;

  select *
    into v_incident
    from public.kael_job_incidents
    where job_id = p_job_id
      and status in ('open', 'awaiting_worker', 'awaiting_customer', 'ready_for_scope_proposal')
    order by updated_at desc
    limit 1
    for update;
  v_existing := found;
  v_now := pg_catalog.clock_timestamp();

  with ordered_refs as (
    select ref.value, pg_catalog.min(ref.ordinality) as first_ordinal
      from pg_catalog.jsonb_array_elements_text(
        p_evidence_photo_urls
          || coalesce(v_incident.evidence_photo_urls, '[]'::jsonb)
      ) with ordinality as ref(value, ordinality)
      where pg_catalog.btrim(ref.value) <> ''
      group by ref.value
      order by pg_catalog.min(ref.ordinality)
      limit 5
  )
  select coalesce(
      pg_catalog.jsonb_agg(value order by first_ordinal),
      '[]'::jsonb
    )
    into v_merged_evidence
    from ordered_refs;

  if v_existing then
    update public.kael_job_incidents
      set reported_description = p_reported_description,
          reported_reason = p_reported_reason,
          evidence_photo_urls = v_merged_evidence,
          scope_proposal_claim_id = null,
          scope_proposal_claimed_at = null,
          revision = v_incident.revision + 1,
          updated_at = v_now
      where id = v_incident.id
      returning * into v_incident;
  else
    insert into public.kael_job_incidents (
      job_id,
      opened_by,
      reported_description,
      reported_reason,
      evidence_photo_urls,
      revision,
      created_at,
      updated_at
    ) values (
      p_job_id,
      p_opened_by,
      p_reported_description,
      p_reported_reason,
      v_merged_evidence,
      1,
      v_now,
      v_now
    ) returning * into v_incident;
  end if;

  insert into public.kael_job_incident_events (
    incident_id,
    job_id,
    source_kind,
    actor_role,
    actor_id,
    request_id,
    source_revision,
    source_job_status,
    reported_description_snapshot,
    reported_reason_snapshot,
    assistant_claim_id,
    assistant_claimed_at,
    content,
    media_refs,
    created_at
  ) values (
    v_incident.id,
    p_job_id,
    case when v_existing then 'incident_updated' else 'incident_opened' end,
    'worker',
    p_opened_by,
    p_request_id,
    v_incident.revision,
    v_job.status,
    p_reported_description,
    p_reported_reason,
    p_assistant_claim_id,
    v_now,
    p_content,
    p_evidence_photo_urls,
    v_now
  ) returning * into v_source_event;

  return query select
    true,
    null::text,
    false,
    true,
    pg_catalog.to_jsonb(v_incident),
    v_source_event.id,
    v_incident.revision;
end;
$function$;

create or replace function public.claim_job_incident_chat_turn_atomic(
  p_job_id uuid,
  p_message_id uuid,
  p_actor_id uuid,
  p_actor_role text,
  p_assistant_claim_id uuid,
  p_content text
) returns table (
  ok boolean,
  error_code text,
  claimed boolean,
  idempotent boolean,
  incident jsonb,
  source_event_id uuid,
  revision bigint
) language plpgsql security definer
set search_path = ''
as $function$
declare
  v_incident public.kael_job_incidents%rowtype;
  v_source_event public.kael_job_incident_events%rowtype;
  v_job record;
  v_message record;
  v_now timestamptz;
begin
  if p_job_id is null or p_message_id is null or p_actor_id is null
    or p_assistant_claim_id is null
    or p_actor_role not in ('customer', 'worker')
    or pg_catalog.btrim(coalesce(p_content, '')) = ''
  then
    return query select false, 'INVALID_INPUT'::text, false, false, null::jsonb, null::uuid, null::bigint;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('job_incident_message:' || p_message_id::text, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('job_incident:' || p_job_id::text, 0)
  );

  select status, customer_id, worker_id
    into v_job
    from public.jobs
    where id = p_job_id
    for update;
  if not found
    or (p_actor_role = 'customer' and v_job.customer_id is distinct from p_actor_id)
    or (p_actor_role = 'worker' and v_job.worker_id is distinct from p_actor_id)
  then
    return query select true, null::text, false, false, null::jsonb, null::uuid, null::bigint;
    return;
  end if;

  select job_id, sender_id, sender_role, content
    into v_message
    from public.chat_messages
    where id = p_message_id
    for share;
  if not found
    or v_message.job_id <> p_job_id
    or v_message.sender_id is distinct from p_actor_id
    or v_message.sender_role::text <> p_actor_role
    or v_message.content is distinct from p_content
  then
    return query select false, 'MESSAGE_SOURCE_INVALID'::text, false, false, null::jsonb, null::uuid, null::bigint;
    return;
  end if;

  select *
    into v_source_event
    from public.kael_job_incident_events
    where message_id = p_message_id;
  if found then
    if v_source_event.job_id <> p_job_id
      or v_source_event.actor_id <> p_actor_id
      or v_source_event.actor_role <> p_actor_role
      or v_source_event.content is distinct from p_content
    then
      return query select false, 'IDEMPOTENCY_CONFLICT'::text, false, false, null::jsonb, null::uuid, null::bigint;
      return;
    end if;
    select *
      into v_incident
      from public.kael_job_incidents
      where id = v_source_event.incident_id;
    if not (
      (
        v_incident.status = 'scope_proposed'
        and v_job.status::text = 'scope_change_pending'
        and v_incident.scope_change_id is not null
        and exists (
          select 1
          from public.scope_change_requests as scope_request
          where scope_request.id = v_incident.scope_change_id
            and scope_request.job_id = p_job_id
            and scope_request.status = 'waiting_customer_decision'::public.scope_change_status
        )
      )
      or (
        v_incident.status <> 'scope_proposed'
        and v_job.status::text in (
          'worker_matched',
          'worker_on_way',
          'arrived',
          'inspecting',
          'repairing'
        )
      )
    ) then
      return query select true, null::text, false, true,
        pg_catalog.to_jsonb(v_incident), v_source_event.id, v_source_event.source_revision;
      return;
    end if;
    if v_incident.revision = v_source_event.source_revision
      and not exists (
        select 1
        from public.kael_job_incident_events
        where caused_by_event_id = v_source_event.id
      )
      and (
        v_source_event.assistant_claim_id is null
        or v_source_event.assistant_claimed_at < pg_catalog.clock_timestamp() - interval '5 minutes'
      )
    then
      update public.kael_job_incident_events
        set assistant_claim_id = p_assistant_claim_id,
            assistant_claimed_at = pg_catalog.clock_timestamp()
        where id = v_source_event.id
        returning * into v_source_event;
      return query select true, null::text, true, true,
        pg_catalog.to_jsonb(v_incident), v_source_event.id, v_source_event.source_revision;
      return;
    end if;
    return query select true, null::text, false, true,
      pg_catalog.to_jsonb(v_incident), v_source_event.id, v_source_event.source_revision;
    return;
  end if;

  select *
    into v_incident
    from public.kael_job_incidents
    where job_id = p_job_id
      and (
        (
          status in (
            'open',
            'awaiting_worker',
            'awaiting_customer',
            'ready_for_scope_proposal'
          )
          and v_job.status::text in (
            'worker_matched',
            'worker_on_way',
            'arrived',
            'inspecting',
            'repairing'
          )
        )
        or (
          status = 'scope_proposed'
          and v_job.status::text = 'scope_change_pending'
          and scope_change_id is not null
          and exists (
            select 1
            from public.scope_change_requests as scope_request
            where scope_request.id = kael_job_incidents.scope_change_id
              and scope_request.job_id = p_job_id
              and scope_request.status = 'waiting_customer_decision'::public.scope_change_status
          )
        )
      )
    order by updated_at desc
    limit 1
    for update;
  if not found then
    return query select true, null::text, false, false, null::jsonb, null::uuid, null::bigint;
    return;
  end if;

  v_now := pg_catalog.clock_timestamp();
  update public.kael_job_incidents
    set scope_proposal_claim_id = null,
        scope_proposal_claimed_at = null,
        revision = v_incident.revision + 1,
        updated_at = v_now
    where id = v_incident.id
    returning * into v_incident;

  insert into public.kael_job_incident_events (
    incident_id,
    job_id,
    source_kind,
    actor_role,
    actor_id,
    message_id,
    source_revision,
    source_job_status,
    assistant_claim_id,
    assistant_claimed_at,
    content,
    media_refs,
    created_at
  ) values (
    v_incident.id,
    p_job_id,
    'job_chat_message',
    p_actor_role,
    p_actor_id,
    p_message_id,
    v_incident.revision,
    v_job.status,
    p_assistant_claim_id,
    v_now,
    p_content,
    '[]'::jsonb,
    v_now
  ) returning * into v_source_event;

  return query select
    true,
    null::text,
    true,
    false,
    pg_catalog.to_jsonb(v_incident),
    v_source_event.id,
    v_incident.revision;
end;
$function$;

create or replace function public.apply_job_incident_assistant_turn_atomic(
  p_incident_id uuid,
  p_job_id uuid,
  p_expected_revision bigint,
  p_source_event_id uuid,
  p_assistant_claim_id uuid,
  p_status text,
  p_evidence_status text,
  p_summary text,
  p_question text,
  p_next_actor text,
  p_event_content text,
  p_safe_metadata jsonb,
  p_message_content text
) returns table (
  ok boolean,
  error_code text,
  applied boolean,
  stale boolean,
  incident jsonb
) language plpgsql security definer
set search_path = ''
as $function$
declare
  v_incident public.kael_job_incidents%rowtype;
  v_source_event public.kael_job_incident_events%rowtype;
  v_job record;
  v_status text;
  v_now timestamptz;
begin
  if p_incident_id is null or p_job_id is null or p_source_event_id is null
    or p_assistant_claim_id is null
    or p_expected_revision is null
    or p_status not in ('awaiting_worker', 'awaiting_customer', 'ready_for_scope_proposal', 'scope_proposed')
    or p_evidence_status not in ('needs_more', 'ready')
    or p_next_actor not in ('customer', 'worker')
    or p_safe_metadata is null
    or pg_catalog.jsonb_typeof(p_safe_metadata) <> 'object'
    or pg_catalog.btrim(coalesce(p_summary, '')) = ''
    or pg_catalog.btrim(coalesce(p_question, '')) = ''
    or pg_catalog.btrim(coalesce(p_message_content, '')) = ''
  then
    return query select false, 'INVALID_INPUT'::text, false, false, null::jsonb;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('job_incident:' || p_job_id::text, 0)
  );
  select status
    into v_job
    from public.jobs
    where id = p_job_id
    for update;
  if not found then
    return query select false, 'NOT_FOUND'::text, false, false, null::jsonb;
    return;
  end if;
  select *
    into v_incident
    from public.kael_job_incidents
    where id = p_incident_id
      and job_id = p_job_id
    for update;
  if not found then
    return query select false, 'NOT_FOUND'::text, false, false, null::jsonb;
    return;
  end if;

  select *
    into v_source_event
    from public.kael_job_incident_events
    where id = p_source_event_id
      and incident_id = p_incident_id
      and job_id = p_job_id
      and source_kind in ('incident_opened', 'incident_updated', 'job_chat_message')
    for update;
  if not found then
    return query select false, 'SOURCE_EVENT_INVALID'::text, false, false, pg_catalog.to_jsonb(v_incident);
    return;
  end if;
  if exists (
    select 1
    from public.kael_job_incident_events
    where caused_by_event_id = p_source_event_id
  ) then
    return query select true, null::text, false, true, pg_catalog.to_jsonb(v_incident);
    return;
  end if;
  if v_source_event.source_revision is distinct from p_expected_revision
    or v_source_event.assistant_claim_id is distinct from p_assistant_claim_id
  then
    return query select false, 'ASSISTANT_CLAIM_STALE'::text, false, false, pg_catalog.to_jsonb(v_incident);
    return;
  end if;
  if p_status = 'scope_proposed' and v_incident.status <> 'scope_proposed' then
    return query select false, 'INVALID_TRANSITION'::text, false, false, pg_catalog.to_jsonb(v_incident);
    return;
  end if;
  if v_incident.revision <> p_expected_revision
    or v_job.status is distinct from v_source_event.source_job_status
    or v_incident.status in ('resolved', 'cancelled')
    or not (
      (
        v_incident.status = 'scope_proposed'
        and v_job.status::text = 'scope_change_pending'
        and v_incident.scope_change_id is not null
        and exists (
          select 1
          from public.scope_change_requests as scope_request
          where scope_request.id = v_incident.scope_change_id
            and scope_request.job_id = p_job_id
            and scope_request.status = 'waiting_customer_decision'::public.scope_change_status
        )
      )
      or (
        v_incident.status <> 'scope_proposed'
        and v_job.status::text in (
          'worker_matched',
          'worker_on_way',
          'arrived',
          'inspecting',
          'repairing'
        )
      )
    )
  then
    update public.kael_job_incident_events
      set assistant_claim_id = null,
          assistant_claimed_at = null
      where id = p_source_event_id
        and assistant_claim_id = p_assistant_claim_id;
    return query select true, null::text, false, true, pg_catalog.to_jsonb(v_incident);
    return;
  end if;

  v_status := case
    when v_incident.status = 'scope_proposed' then 'scope_proposed'
    else p_status
  end;
  v_now := pg_catalog.clock_timestamp();
  update public.kael_job_incidents
    set status = v_status,
        evidence_status = p_evidence_status,
        last_summary = p_summary,
        last_question = p_question,
        last_next_actor = p_next_actor,
        revision = v_incident.revision + 1,
        updated_at = v_now
    where id = v_incident.id
    returning * into v_incident;

  insert into public.kael_job_incident_events (
    incident_id,
    job_id,
    source_kind,
    actor_role,
    actor_id,
    caused_by_event_id,
    content,
    media_refs,
    safe_metadata,
    created_at
  ) values (
    p_incident_id,
    p_job_id,
    'kael_turn',
    'kael',
    null,
    p_source_event_id,
    p_event_content,
    '[]'::jsonb,
    p_safe_metadata,
    v_now
  );

  insert into public.chat_messages (
    job_id,
    sender_id,
    sender_role,
    content,
    created_at
  ) values (
    p_job_id,
    null,
    'kael',
    p_message_content,
    v_now
  );

  update public.kael_job_incident_events
    set assistant_claim_id = null,
        assistant_claimed_at = null
    where id = p_source_event_id
      and assistant_claim_id = p_assistant_claim_id;

  return query select true, null::text, true, false, pg_catalog.to_jsonb(v_incident);
end;
$function$;

create or replace function public.release_job_incident_assistant_claim_atomic(
  p_job_id uuid,
  p_source_event_id uuid,
  p_assistant_claim_id uuid
) returns table (
  released boolean
) language plpgsql security definer
set search_path = ''
as $function$
declare
  v_released_id uuid;
begin
  if p_job_id is null or p_source_event_id is null or p_assistant_claim_id is null then
    return query select false;
    return;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('job_incident:' || p_job_id::text, 0)
  );
  update public.kael_job_incident_events
    set assistant_claim_id = null,
        assistant_claimed_at = null
    where id = p_source_event_id
      and job_id = p_job_id
      and assistant_claim_id = p_assistant_claim_id
      and not exists (
        select 1
        from public.kael_job_incident_events as caused
        where caused.caused_by_event_id = p_source_event_id
      )
    returning id into v_released_id;
  return query select v_released_id is not null;
end;
$function$;

create or replace function public.claim_job_incident_scope_proposal_atomic(
  p_job_id uuid,
  p_worker_id uuid,
  p_claim_id uuid
) returns table (
  ok boolean,
  error_code text,
  claimed boolean,
  idempotent boolean,
  incident jsonb
) language plpgsql security definer
set search_path = ''
as $function$
declare
  v_incident public.kael_job_incidents%rowtype;
  v_job record;
  v_now timestamptz;
begin
  if p_job_id is null or p_worker_id is null or p_claim_id is null then
    return query select false, 'INVALID_INPUT'::text, false, false, null::jsonb;
    return;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('job_incident:' || p_job_id::text, 0)
  );

  select worker_id, status
    into v_job
    from public.jobs
    where id = p_job_id;
  if not found then
    return query select false, 'NOT_FOUND'::text, false, false, null::jsonb;
    return;
  end if;
  if v_job.worker_id is distinct from p_worker_id then
    return query select false, 'AUTH_FORBIDDEN'::text, false, false, null::jsonb;
    return;
  end if;

  select *
    into v_incident
    from public.kael_job_incidents
    where job_id = p_job_id
      and (
        (status = 'ready_for_scope_proposal' and evidence_status = 'ready')
        or (status = 'scope_proposed' and scope_change_id is not null)
      )
    order by updated_at desc
    limit 1
    for update;
  if not found then
    return query select false, 'INCIDENT_NOT_READY'::text, false, false, null::jsonb;
    return;
  end if;

  if v_incident.status = 'scope_proposed' then
    return query select true, null::text, false, true, pg_catalog.to_jsonb(v_incident);
    return;
  end if;
  if v_job.status not in (
    'worker_matched',
    'worker_on_way',
    'arrived',
    'inspecting',
    'repairing'
  ) then
    return query select false, 'STATUS_CHANGED'::text, false, false, pg_catalog.to_jsonb(v_incident);
    return;
  end if;

  if v_incident.scope_proposal_claim_id = p_claim_id then
    return query select true, null::text, true, true, pg_catalog.to_jsonb(v_incident);
    return;
  end if;
  if v_incident.scope_proposal_claim_id is not null
    and v_incident.scope_proposal_claimed_at >= pg_catalog.clock_timestamp() - interval '5 minutes'
  then
    return query select false, 'PROPOSAL_IN_PROGRESS'::text, false, false, pg_catalog.to_jsonb(v_incident);
    return;
  end if;

  v_now := pg_catalog.clock_timestamp();
  update public.kael_job_incidents
    set scope_proposal_claim_id = p_claim_id,
        scope_proposal_claimed_at = v_now,
        revision = v_incident.revision + 1,
        updated_at = v_now
    where id = v_incident.id
    returning * into v_incident;

  return query select true, null::text, true, false, pg_catalog.to_jsonb(v_incident);
end;
$function$;

create or replace function public.release_job_incident_scope_proposal_atomic(
  p_job_id uuid,
  p_incident_id uuid,
  p_claim_id uuid
) returns table (
  released boolean
) language plpgsql security definer
set search_path = ''
as $function$
declare
  v_released_id uuid;
begin
  if p_job_id is null or p_incident_id is null or p_claim_id is null then
    return query select false;
    return;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('job_incident:' || p_job_id::text, 0)
  );
  update public.kael_job_incidents
    set scope_proposal_claim_id = null,
        scope_proposal_claimed_at = null,
        revision = revision + 1,
        updated_at = pg_catalog.clock_timestamp()
    where id = p_incident_id
      and job_id = p_job_id
      and status = 'ready_for_scope_proposal'
      and scope_proposal_claim_id = p_claim_id
    returning id into v_released_id;
  return query select v_released_id is not null;
end;
$function$;

create or replace function public.request_job_incident_scope_change_atomic(
  p_incident_id uuid,
  p_claim_id uuid,
  p_job_id uuid,
  p_worker_id uuid,
  p_new_description text,
  p_reason text,
  p_evidence_photo_urls text[],
  p_kael_computed_min int,
  p_kael_computed_max int,
  p_kael_review jsonb
) returns table (
  ok boolean,
  error_code text,
  scope_change_id uuid,
  scope_status public.scope_change_status,
  created_at_ts timestamptz
) language plpgsql security definer
set search_path = ''
as $function$
declare
  v_incident public.kael_job_incidents%rowtype;
  v_scope record;
  v_now timestamptz;
begin
  if p_incident_id is null or p_claim_id is null
    or p_job_id is null or p_worker_id is null
  then
    return query select false, 'INVALID_INPUT'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz;
    return;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('job_incident:' || p_job_id::text, 0)
  );
  select *
    into v_incident
    from public.kael_job_incidents
    where id = p_incident_id
      and job_id = p_job_id
    for update;
  if not found
    or v_incident.status <> 'ready_for_scope_proposal'
    or v_incident.evidence_status <> 'ready'
    or v_incident.scope_proposal_claim_id is distinct from p_claim_id
  then
    return query select false, 'INCIDENT_CLAIM_STALE'::text,
      null::uuid, null::public.scope_change_status, null::timestamptz;
    return;
  end if;

  select *
    into v_scope
    from public.request_scope_change_atomic(
      p_job_id,
      p_worker_id,
      p_new_description,
      p_reason,
      p_evidence_photo_urls,
      p_kael_computed_min,
      p_kael_computed_max,
      p_kael_review
    );
  if v_scope.ok is distinct from true then
    return query select
      false,
      v_scope.error_code::text,
      null::uuid,
      null::public.scope_change_status,
      null::timestamptz;
    return;
  end if;

  v_now := pg_catalog.clock_timestamp();
  update public.kael_job_incidents
    set status = 'scope_proposed',
        scope_change_id = v_scope.scope_change_id,
        scope_proposal_claim_id = null,
        scope_proposal_claimed_at = null,
        revision = v_incident.revision + 1,
        updated_at = v_now
    where id = v_incident.id
    returning * into v_incident;

  insert into public.kael_job_incident_events (
    incident_id,
    job_id,
    source_kind,
    actor_role,
    actor_id,
    content,
    media_refs,
    safe_metadata,
    created_at
  ) values (
    v_incident.id,
    p_job_id,
    'scope_proposed',
    'worker',
    p_worker_id,
    null,
    '[]'::jsonb,
    pg_catalog.jsonb_build_object('scope_change_id', v_scope.scope_change_id),
    v_now
  );

  return query select
    true,
    null::text,
    v_scope.scope_change_id::uuid,
    v_scope.scope_status::public.scope_change_status,
    v_scope.created_at_ts::timestamptz;
end;
$function$;

revoke execute on function public.upsert_job_incident_signal_atomic(uuid, uuid, text, text, jsonb, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.upsert_job_incident_signal_atomic(uuid, uuid, text, text, jsonb, uuid, uuid, text) to service_role;

revoke execute on function public.claim_job_incident_chat_turn_atomic(uuid, uuid, uuid, text, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_job_incident_chat_turn_atomic(uuid, uuid, uuid, text, uuid, text) to service_role;

revoke execute on function public.apply_job_incident_assistant_turn_atomic(uuid, uuid, bigint, uuid, uuid, text, text, text, text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.apply_job_incident_assistant_turn_atomic(uuid, uuid, bigint, uuid, uuid, text, text, text, text, text, text, jsonb, text) to service_role;

revoke execute on function public.release_job_incident_assistant_claim_atomic(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.release_job_incident_assistant_claim_atomic(uuid, uuid, uuid) to service_role;

revoke execute on function public.claim_job_incident_scope_proposal_atomic(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_job_incident_scope_proposal_atomic(uuid, uuid, uuid) to service_role;

revoke execute on function public.release_job_incident_scope_proposal_atomic(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.release_job_incident_scope_proposal_atomic(uuid, uuid, uuid) to service_role;

revoke execute on function public.request_job_incident_scope_change_atomic(uuid, uuid, uuid, uuid, text, text, text[], int, int, jsonb) from public, anon, authenticated;
grant execute on function public.request_job_incident_scope_change_atomic(uuid, uuid, uuid, uuid, text, text, text[], int, int, jsonb) to service_role;

comment on column public.kael_job_incidents.revision is
  'Optimistic concurrency token incremented for every accepted source or incident transition.';
comment on column public.kael_job_incident_events.request_id is
  'Durable idempotency key supplied by the originating client request when available.';
comment on column public.kael_job_incident_events.reported_description_snapshot is
  'Immutable incident description bound to the originating request id for full-payload replay checks.';
comment on column public.kael_job_incident_events.reported_reason_snapshot is
  'Immutable incident reason bound to the originating request id for full-payload replay checks.';
comment on column public.kael_job_incident_events.source_job_status is
  'Job phase captured with the source so assistant output cannot cross a later workflow transition.';
comment on column public.kael_job_incident_events.caused_by_event_id is
  'Source event whose current revision produced this single Kael turn.';
comment on function public.apply_job_incident_assistant_turn_atomic(uuid, uuid, bigint, uuid, uuid, text, text, text, text, text, text, jsonb, text) is
  'Applies an assistant result only at its source revision and atomically emits the incident event and user-visible Kael message.';

commit;
