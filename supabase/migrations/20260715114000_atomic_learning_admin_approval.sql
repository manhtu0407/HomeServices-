-- Commit manual learning approval and its optional knowledge write through one
-- service-role call. Durable receipts make retries return the original result
-- instead of creating another rule or knowledge version.

create or replace function public.admin_approve_learning_candidate_atomic(
  p_candidate_id uuid,
  p_admin_id uuid,
  p_review_note text default null
) returns table (
  ok boolean,
  error_code text,
  candidate_id uuid,
  rule_id uuid,
  rule_version integer,
  status text,
  knowledge_ok boolean,
  knowledge_error_code text,
  knowledge_table text,
  record_key text,
  knowledge_version integer
)
language plpgsql
security definer
set search_path = ''
as $func$
declare
  v_candidate public.learning_candidates%rowtype;
  v_approval record;
  v_knowledge record;
  v_receipt record;
  v_rule_id uuid;
  v_rule_version integer;
  v_status text;
begin
  if p_candidate_id is null or p_admin_id is null then
    return query select
      false, 'INVALID_INPUT'::text, p_candidate_id, null::uuid,
      null::integer, null::text, null::boolean, null::text,
      null::text, null::text, null::integer;
    return;
  end if;

  if not exists (
    select 1
    from public.profiles as profile
    where profile.id = p_admin_id
      and profile.role = 'admin'::public.user_role
  ) then
    return query select
      false, 'ADMIN_REQUIRED'::text, p_candidate_id, null::uuid,
      null::integer, null::text, null::boolean, null::text,
      null::text, null::text, null::integer;
    return;
  end if;

  select candidate.*
    into v_candidate
    from public.learning_candidates as candidate
    where candidate.id = p_candidate_id
    for update;

  if not found then
    return query select
      false, 'CANDIDATE_NOT_FOUND'::text, p_candidate_id, null::uuid,
      null::integer, null::text, null::boolean, null::text,
      null::text, null::text, null::integer;
    return;
  end if;

  if v_candidate.status in (
    'manual_review'::public.learning_candidate_status,
    'evidence_gate_passed'::public.learning_candidate_status
  ) then
    select approval.*
      into v_approval
      from public.admin_approve_learning_candidate(
        p_candidate_id,
        p_admin_id,
        p_review_note
      ) as approval;

    if not found then
      raise exception using
        errcode = 'P0001',
        message = 'admin approval RPC returned no receipt';
    end if;

    if v_approval.ok is not true then
      return query select
        false,
        v_approval.error_code::text,
        p_candidate_id,
        v_approval.rule_id::uuid,
        v_approval.rule_version::integer,
        v_approval.status::text,
        null::boolean,
        null::text,
        null::text,
        null::text,
        null::integer;
      return;
    end if;

    v_rule_id := v_approval.rule_id;
    v_rule_version := v_approval.rule_version;
    v_status := v_approval.status;
  elsif v_candidate.status = 'auto_promoted'::public.learning_candidate_status then
    select version.rule_id, version.version
      into v_rule_id, v_rule_version
      from public.learning_rule_versions as version
      where version.change_reason =
          'admin_approve_learning_candidate:' || p_candidate_id::text
        and exists (
          select 1
          from public.kael_rule_lifecycle_log as lifecycle
          where lifecycle.candidate_id = p_candidate_id
            and lifecycle.rule_id = version.rule_id
            and lifecycle.transition_reason = 'admin_approve_learning_candidate'
        )
      order by version.created_at asc, version.id asc
      limit 1;

    if not found then
      return query select
        false, 'CANDIDATE_NOT_REVIEWABLE'::text, p_candidate_id,
        null::uuid, null::integer, v_candidate.status::text,
        null::boolean, null::text, null::text, null::text, null::integer;
      return;
    end if;
    v_status := v_candidate.status::text;
  else
    return query select
      false, 'CANDIDATE_NOT_REVIEWABLE'::text, p_candidate_id,
      null::uuid, null::integer, v_candidate.status::text,
      null::boolean, null::text, null::text, null::text, null::integer;
    return;
  end if;

  select
      lifecycle.safe_metadata ->> 'knowledge_table' as knowledge_table,
      lifecycle.safe_metadata ->> 'record_key' as record_key,
      (lifecycle.safe_metadata ->> 'knowledge_version')::integer
        as knowledge_version
    into v_receipt
    from public.kael_rule_lifecycle_log as lifecycle
    where lifecycle.candidate_id = p_candidate_id
      and lifecycle.transition_reason = 'admin_approved_knowledge_upsert'
      and coalesce(lifecycle.safe_metadata ->> 'knowledge_table', '') <> ''
      and coalesce(lifecycle.safe_metadata ->> 'record_key', '') <> ''
      and coalesce(lifecycle.safe_metadata ->> 'knowledge_version', '')
        ~ '^[1-9][0-9]*$'
    order by lifecycle.created_at asc, lifecycle.id asc
    limit 1;

  if found then
    return query select
      true, null::text, p_candidate_id, v_rule_id, v_rule_version, v_status,
      true, null::text, v_receipt.knowledge_table::text,
      v_receipt.record_key::text, v_receipt.knowledge_version::integer;
    return;
  end if;

  if exists (
    select 1
    from public.kael_rule_lifecycle_log as lifecycle
    where lifecycle.candidate_id = p_candidate_id
      and lifecycle.transition_reason = 'knowledge_upsert_missing'
  ) then
    return query select
      true, null::text, p_candidate_id, v_rule_id, v_rule_version, v_status,
      false, 'KNOWLEDGE_UPSERT_MISSING'::text,
      null::text, null::text, null::integer;
    return;
  end if;

  select applied.*
    into v_knowledge
    from public.apply_approved_learning_candidate_to_knowledge(
      p_candidate_id,
      p_admin_id
    ) as applied;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'knowledge apply RPC returned no receipt';
  end if;

  return query select
    true,
    null::text,
    p_candidate_id,
    v_rule_id,
    v_rule_version,
    v_status,
    v_knowledge.ok::boolean,
    v_knowledge.error_code::text,
    v_knowledge.knowledge_table::text,
    v_knowledge.record_key::text,
    v_knowledge.knowledge_version::integer;
end;
$func$;

revoke execute on function public.admin_approve_learning_candidate_atomic(
  uuid, uuid, text
) from public;
revoke execute on function public.admin_approve_learning_candidate_atomic(
  uuid, uuid, text
) from anon;
revoke execute on function public.admin_approve_learning_candidate_atomic(
  uuid, uuid, text
) from authenticated;
grant execute on function public.admin_approve_learning_candidate_atomic(
  uuid, uuid, text
) to service_role;

comment on function public.admin_approve_learning_candidate_atomic(
  uuid, uuid, text
) is
  'Atomically approves one manual Kael learning candidate and applies reviewed knowledge; service role only and retry-safe.';

-- Rollback: drop function public.admin_approve_learning_candidate_atomic(uuid, uuid, text).
