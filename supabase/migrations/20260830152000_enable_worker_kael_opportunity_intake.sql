-- Allow the existing intake mode to support worker opportunity search without a job.
begin;

alter table public.kael_worker_chat_sessions
  drop constraint if exists kael_worker_chat_sessions_chat_mode_check;

alter table public.kael_worker_chat_sessions
  add constraint kael_worker_chat_sessions_chat_mode_check
  check (
    (chat_mode = 'normal' and job_id is null)
    or chat_mode = 'intake'
  );

create unique index if not exists kael_worker_chat_sessions_opportunity_intake_idempotency_idx
  on public.kael_worker_chat_sessions (
    worker_id,
    chat_mode,
    client_request_id
  )
  where chat_mode = 'intake'
    and job_id is null
    and client_request_id is not null;

do $migration$
declare
  v_claim_signature constant text :=
    'public.claim_worker_kael_general_turn_atomic(uuid,uuid,uuid,uuid,text,text,text[],timestamp with time zone)';
  v_complete_signature constant text :=
    'public.complete_worker_kael_general_turn_atomic(uuid,uuid,uuid,uuid,uuid,text,text,jsonb,public.api_provider,text,integer,numeric,jsonb,timestamp with time zone)';
  v_definition text;
  v_old_guard constant text := 'or v_session.chat_mode <> ''normal''';
  v_new_guard constant text := 'or v_session.chat_mode not in (''normal'', ''intake'')';
begin
  select pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(v_claim_signature))
    into v_definition;
  if v_definition is null or pg_catalog.strpos(v_definition, v_old_guard) = 0 then
    raise exception 'claim_worker_kael_general_turn_atomic guard does not match the expected deployed definition';
  end if;
  v_definition := pg_catalog.replace(v_definition, v_old_guard, v_new_guard);
  if pg_catalog.strpos(v_definition, v_old_guard) > 0 then
    raise exception 'claim_worker_kael_general_turn_atomic retained the old normal-only guard';
  end if;
  execute v_definition;

  select pg_catalog.pg_get_functiondef(pg_catalog.to_regprocedure(v_complete_signature))
    into v_definition;
  if v_definition is null or pg_catalog.strpos(v_definition, v_old_guard) = 0 then
    raise exception 'complete_worker_kael_general_turn_atomic guard does not match the expected deployed definition';
  end if;
  v_definition := pg_catalog.replace(v_definition, v_old_guard, v_new_guard);
  if pg_catalog.strpos(v_definition, v_old_guard) > 0 then
    raise exception 'complete_worker_kael_general_turn_atomic retained the old normal-only guard';
  end if;
  execute v_definition;
end;
$migration$;

revoke execute on function public.claim_worker_kael_general_turn_atomic(
  uuid, uuid, uuid, uuid, text, text, text[], timestamptz
) from public, anon, authenticated;
grant execute on function public.claim_worker_kael_general_turn_atomic(
  uuid, uuid, uuid, uuid, text, text, text[], timestamptz
) to service_role;

revoke execute on function public.complete_worker_kael_general_turn_atomic(
  uuid, uuid, uuid, uuid, uuid, text, text, jsonb,
  public.api_provider, text, integer, numeric, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.complete_worker_kael_general_turn_atomic(
  uuid, uuid, uuid, uuid, uuid, text, text, jsonb,
  public.api_provider, text, integer, numeric, jsonb, timestamptz
) to service_role;

commit;
