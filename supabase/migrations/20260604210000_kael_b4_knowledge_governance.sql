-- =============================================================================
-- Plan §31 B4: knowledge governance apply RPC for approved LS5/LS6 candidates.
--
-- 20260604210000. Admin approval stays Edge/service-role mediated. This RPC is
-- intentionally separate from admin_approve_learning_candidate() so the review
-- step can approve the learning rule first, then apply a concrete, reviewed
-- knowledge_upsert payload without inventing guidance when a candidate only
-- carries a weak signal.
-- =============================================================================

create or replace function private.kael_b4_service_label_vi(p_service_type text)
returns text language sql immutable as $$
  select case p_service_type
    when 'electrical' then 'Sửa điện'
    when 'plumbing' then 'Sửa nước'
    when 'cleaning' then 'Vệ sinh/dọn dẹp'
    else 'Kael knowledge'
  end
$$;

create or replace function private.kael_b4_json_int(p_value text)
returns integer language sql immutable as $$
  select case
    when p_value ~ '^[0-9]+$' then p_value::integer
    else 0
  end
$$;

create or replace function public.apply_approved_learning_candidate_to_knowledge(
  p_candidate_id uuid,
  p_admin_id uuid
) returns table (
  ok boolean,
  error_code text,
  knowledge_table text,
  record_key text,
  knowledge_version integer
) language plpgsql security definer
set search_path = public, private, pg_catalog
as $func$
declare
  v_candidate public.learning_candidates%rowtype;
  v_payload jsonb;
  v_knowledge jsonb;
  v_service_type text;
  v_skill_id text;
  v_previous jsonb;
  v_next jsonb;
  v_version integer;
  v_purpose text;
  v_slug text;
  v_label_vi text;
  v_pattern_key text;
  v_trigger_topic text;
  v_severity text;
  v_response_guidance text;
  v_safe_metadata jsonb;
begin
  if p_candidate_id is null then
    return query select false, 'INVALID_INPUT'::text, null::text, null::text, null::integer;
    return;
  end if;

  if p_admin_id is not null and not exists (
    select 1 from public.profiles
      where id = p_admin_id
        and role = 'admin'::public.user_role
  ) then
    return query select false, 'ADMIN_REQUIRED'::text, null::text, null::text, null::integer;
    return;
  end if;

  select *
    into v_candidate
    from public.learning_candidates
    where id = p_candidate_id;

  if not found then
    return query select false, 'CANDIDATE_NOT_FOUND'::text, null::text, null::text, null::integer;
    return;
  end if;

  if v_candidate.status <> 'auto_promoted'::public.learning_candidate_status then
    return query select false, 'CANDIDATE_NOT_APPROVED'::text, null::text, null::text, null::integer;
    return;
  end if;

  if v_candidate.candidate_type not in ('service_knowledge_candidate', 'safety_pattern_candidate') then
    return query select false, 'CANDIDATE_TYPE_NOT_KNOWLEDGE'::text, null::text, null::text, null::integer;
    return;
  end if;

  v_payload := coalesce(v_candidate.suggested_payload, '{}'::jsonb);
  if jsonb_typeof(v_payload) is distinct from 'object' then
    return query select false, 'INVALID_PAYLOAD'::text, null::text, null::text, null::integer;
    return;
  end if;

  v_knowledge := coalesce(v_payload->'knowledge_upsert', v_payload->'suggested'->'knowledge_upsert');
  v_skill_id := case v_candidate.candidate_type
    when 'service_knowledge_candidate' then 'LS5'
    when 'safety_pattern_candidate' then 'LS6'
    else 'LS2'
  end;

  if jsonb_typeof(v_knowledge) is distinct from 'object' then
    insert into public.kael_rule_lifecycle_log (
      candidate_id,
      skill_id,
      previous_state,
      next_state,
      transition_reason,
      actor_id,
      actor_role,
      safe_metadata
    ) values (
      p_candidate_id,
      v_skill_id,
      'active',
      'active',
      'knowledge_upsert_missing',
      p_admin_id,
      case when p_admin_id is null then 'system' else 'admin' end,
      jsonb_build_object(
        'candidate_type', v_candidate.candidate_type,
        'knowledge_apply', 'skipped'
      )
    );

    return query select false, 'KNOWLEDGE_UPSERT_MISSING'::text, null::text, null::text, null::integer;
    return;
  end if;

  if v_candidate.candidate_type = 'service_knowledge_candidate' then
    v_service_type := coalesce(nullif(v_knowledge->>'service_type', ''), v_candidate.affected_service::text);
    if v_service_type not in ('electrical', 'plumbing', 'cleaning') then
      return query select false, 'UNSUPPORTED_SERVICE'::text, 'service_knowledge_boxes'::text, v_service_type, null::integer;
      return;
    end if;

    v_purpose := nullif(trim(coalesce(v_knowledge->>'purpose', '')), '');
    if v_purpose is null or char_length(v_purpose) < 10 or char_length(v_purpose) > 1000 then
      return query select false, 'INVALID_SERVICE_KNOWLEDGE_PURPOSE'::text, 'service_knowledge_boxes'::text, v_service_type, null::integer;
      return;
    end if;

    select to_jsonb(box)
      into v_previous
      from public.service_knowledge_boxes as box
      where box.service_type = v_service_type::public.service_type;

    v_version := private.kael_b4_json_int(v_previous->'safe_metadata'->>'knowledge_version') + 1;
    v_slug := coalesce(nullif(v_knowledge->>'slug', ''), v_service_type);
    v_label_vi := coalesce(nullif(v_knowledge->>'label_vi', ''), private.kael_b4_service_label_vi(v_service_type));
    v_safe_metadata := coalesce(v_knowledge->'safe_metadata', '{}'::jsonb);
    if jsonb_typeof(v_safe_metadata) is distinct from 'object' then
      return query select false, 'INVALID_SAFE_METADATA'::text, 'service_knowledge_boxes'::text, v_service_type, null::integer;
      return;
    end if;
    v_safe_metadata := v_safe_metadata || jsonb_strip_nulls(jsonb_build_object(
      'knowledge_governance_version', 'b4-2026-06-04',
      'knowledge_version', v_version,
      'source_candidate_id', p_candidate_id,
      'approved_by_admin_id', p_admin_id,
      'signoff_status', 'approved'
    ));

    insert into public.service_knowledge_boxes (
      service_type,
      slug,
      label_vi,
      purpose,
      safe_metadata,
      is_active
    ) values (
      v_service_type::public.service_type,
      v_slug,
      v_label_vi,
      v_purpose,
      v_safe_metadata,
      true
    )
    on conflict (service_type) do update set
      slug = excluded.slug,
      label_vi = excluded.label_vi,
      purpose = excluded.purpose,
      safe_metadata = public.service_knowledge_boxes.safe_metadata || excluded.safe_metadata,
      is_active = true,
      updated_at = now();

    select to_jsonb(box)
      into v_next
      from public.service_knowledge_boxes as box
      where box.service_type = v_service_type::public.service_type;

    insert into public.kael_rule_lifecycle_log (
      candidate_id,
      skill_id,
      previous_state,
      next_state,
      transition_reason,
      actor_id,
      actor_role,
      safe_metadata
    ) values (
      p_candidate_id,
      'LS5',
      'active',
      'active',
      'admin_approved_knowledge_upsert',
      p_admin_id,
      case when p_admin_id is null then 'system' else 'admin' end,
      jsonb_strip_nulls(jsonb_build_object(
        'knowledge_table', 'service_knowledge_boxes',
        'record_key', v_service_type,
        'knowledge_version', v_version,
        'previous_row', v_previous,
        'next_row', v_next
      ))
    );

    return query select true, null::text, 'service_knowledge_boxes'::text, v_service_type, v_version;
    return;
  end if;

  if v_candidate.candidate_type = 'safety_pattern_candidate' then
    v_service_type := coalesce(nullif(v_knowledge->>'service_type', ''), v_candidate.affected_service::text);
    v_pattern_key := nullif(trim(coalesce(v_knowledge->>'pattern_key', '')), '');
    v_trigger_topic := coalesce(nullif(v_knowledge->>'trigger_topic', ''), 'worker_safety_advisory');
    v_severity := coalesce(nullif(v_knowledge->>'severity', ''), 'advisory');
    v_response_guidance := nullif(trim(coalesce(v_knowledge->>'response_guidance', '')), '');

    if v_service_type not in ('electrical', 'plumbing', 'cleaning') then
      return query select false, 'UNSUPPORTED_SERVICE'::text, 'worker_safety_patterns'::text, v_service_type, null::integer;
      return;
    end if;
    if v_pattern_key is null or v_pattern_key !~ '^[a-z][a-z0-9_]{2,119}$' then
      return query select false, 'INVALID_PATTERN_KEY'::text, 'worker_safety_patterns'::text, v_pattern_key, null::integer;
      return;
    end if;
    if v_severity not in ('advisory', 'warning', 'urgent') then
      return query select false, 'INVALID_SEVERITY'::text, 'worker_safety_patterns'::text, v_pattern_key, null::integer;
      return;
    end if;
    if v_response_guidance is null or char_length(v_response_guidance) < 10 or char_length(v_response_guidance) > 1000 then
      return query select false, 'INVALID_RESPONSE_GUIDANCE'::text, 'worker_safety_patterns'::text, v_pattern_key, null::integer;
      return;
    end if;

    select to_jsonb(pattern)
      into v_previous
      from public.worker_safety_patterns as pattern
      where pattern.pattern_key = v_pattern_key;

    v_version := private.kael_b4_json_int(v_previous->'safe_metadata'->>'knowledge_version') + 1;
    v_safe_metadata := coalesce(v_knowledge->'safe_metadata', '{}'::jsonb);
    if jsonb_typeof(v_safe_metadata) is distinct from 'object' then
      return query select false, 'INVALID_SAFE_METADATA'::text, 'worker_safety_patterns'::text, v_pattern_key, null::integer;
      return;
    end if;
    v_safe_metadata := v_safe_metadata || jsonb_strip_nulls(jsonb_build_object(
      'knowledge_governance_version', 'b4-2026-06-04',
      'knowledge_version', v_version,
      'source_candidate_id', p_candidate_id,
      'approved_by_admin_id', p_admin_id,
      'signoff_status', 'approved'
    ));

    insert into public.worker_safety_patterns (
      pattern_key,
      service_type,
      trigger_topic,
      severity,
      response_guidance,
      safe_metadata,
      is_enabled
    ) values (
      v_pattern_key,
      v_service_type,
      v_trigger_topic,
      v_severity,
      v_response_guidance,
      v_safe_metadata,
      true
    )
    on conflict (pattern_key) do update set
      service_type = excluded.service_type,
      trigger_topic = excluded.trigger_topic,
      severity = excluded.severity,
      response_guidance = excluded.response_guidance,
      safe_metadata = public.worker_safety_patterns.safe_metadata || excluded.safe_metadata,
      is_enabled = true,
      updated_at = now();

    select to_jsonb(pattern)
      into v_next
      from public.worker_safety_patterns as pattern
      where pattern.pattern_key = v_pattern_key;

    insert into public.kael_rule_lifecycle_log (
      candidate_id,
      skill_id,
      previous_state,
      next_state,
      transition_reason,
      actor_id,
      actor_role,
      safe_metadata
    ) values (
      p_candidate_id,
      'LS6',
      'active',
      'active',
      'admin_approved_knowledge_upsert',
      p_admin_id,
      case when p_admin_id is null then 'system' else 'admin' end,
      jsonb_strip_nulls(jsonb_build_object(
        'knowledge_table', 'worker_safety_patterns',
        'record_key', v_pattern_key,
        'knowledge_version', v_version,
        'previous_row', v_previous,
        'next_row', v_next
      ))
    );

    return query select true, null::text, 'worker_safety_patterns'::text, v_pattern_key, v_version;
    return;
  end if;

  return query select false, 'UNREACHABLE'::text, null::text, null::text, null::integer;
end;
$func$;

revoke execute on function public.apply_approved_learning_candidate_to_knowledge(uuid, uuid) from public;
revoke execute on function public.apply_approved_learning_candidate_to_knowledge(uuid, uuid) from anon;
revoke execute on function public.apply_approved_learning_candidate_to_knowledge(uuid, uuid) from authenticated;
grant execute on function public.apply_approved_learning_candidate_to_knowledge(uuid, uuid) to service_role;

comment on function public.apply_approved_learning_candidate_to_knowledge(uuid, uuid) is
  'Plan §31 B4: apply reviewed LS5/LS6 knowledge_upsert candidates to runtime knowledge tables with version metadata and lifecycle audit.';
