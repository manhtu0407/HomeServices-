begin;

create or replace function private.guard_replacement_candidate_capacity()
returns trigger language plpgsql security definer set search_path = '' as $func$
declare v_expires_at timestamptz;
begin
  v_expires_at := private.require_live_matching_capacity(new.job_id, new.worker_id, new.broadcast_id);
  if v_expires_at is not null then
    if new.original_scope_price_quote is not null then
      if not private.is_valid_original_scope_price_quote(new.original_scope_price_quote,
        new.job_id, new.worker_id, new.broadcast_id, new.expires_at, true)
      then raise exception using errcode = '23514', message = 'PRICE_QUOTE_INVALID'; end if;
      -- The frozen quote and its candidate must share the same server-bounded deadline.
      new.original_scope_price_quote := jsonb_set(new.original_scope_price_quote,
        '{expires_at}', to_jsonb(least(new.expires_at, v_expires_at)), false);
    end if;
    new.expires_at := least(new.expires_at, v_expires_at);
  end if;
  return new;
end;
$func$;

do $authority$
declare
  v_name text;
  v_oid regprocedure;
  v_definition text;
  v_old constant text := 'v_job.customer_id <> p_customer_id';
  v_new constant text := 'p_customer_id is null or v_job.customer_id is distinct from p_customer_id
    or not exists (select 1 from public.profiles as customer_actor
      where customer_actor.id = p_customer_id and customer_actor.role = ''customer'')';
begin
  foreach v_name in array array[
    'confirm_worker_candidate_atomic', 'confirm_worker_matching_proposal_atomic', 'reject_worker_candidate_atomic'
  ] loop
    v_oid := to_regprocedure('public.' || v_name || '(uuid,uuid,uuid)');
    if v_oid is null then raise exception 'CANDIDATE_AUTHORITY_OWNER_MISSING: %', v_name; end if;
    v_definition := pg_get_functiondef(v_oid);
    if strpos(v_definition, v_new) > 0 then continue; end if;
    if (length(v_definition) - length(replace(v_definition, v_old, ''))) / length(v_old) <> 1 then
      raise exception 'CANDIDATE_AUTHORITY_SOURCE_DRIFT: %', v_name;
    end if;
    execute replace(v_definition, v_old, v_new);
  end loop;
end;
$authority$;

revoke execute on function private.guard_replacement_candidate_capacity() from public, anon, authenticated;

commit;
