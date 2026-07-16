create table if not exists public.kael_memory_update_receipts (
  event_key text primary key,
  event_type text not null check (event_type in (
    'worker_disintermediation',
    'normal_transaction_review',
    'worker_cancellation_review',
    'customer_cancellation_review'
  )),
  subject_type text not null check (subject_type in ('customer', 'worker')),
  subject_id uuid not null references public.profiles(id) on delete cascade,
  job_id uuid references public.jobs(id) on delete set null,
  source_event_id text not null,
  safe_metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(safe_metadata) = 'object'),
  applied_at timestamptz not null default now(),
  check (length(btrim(event_key)) between 3 and 240),
  check (length(btrim(source_event_id)) between 1 and 160)
);

alter table public.kael_memory_update_receipts enable row level security;

create index if not exists kael_memory_update_receipts_subject_idx
  on public.kael_memory_update_receipts (subject_type, subject_id, applied_at desc);

create index if not exists kael_memory_update_receipts_job_idx
  on public.kael_memory_update_receipts (job_id, applied_at desc)
  where job_id is not null;

revoke all on public.kael_memory_update_receipts from public;
revoke all on public.kael_memory_update_receipts from anon;
revoke all on public.kael_memory_update_receipts from authenticated;
grant all on public.kael_memory_update_receipts to service_role;

grant usage on schema private to service_role;

create or replace function private.sanitize_kael_memory_excerpt(p_value text)
returns text
language plpgsql
immutable
security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  v_value text := coalesce(p_value, '');
begin
  v_value := regexp_replace(
    v_value,
    '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}',
    '[email]',
    'gi'
  );
  v_value := regexp_replace(
    v_value,
    '(^|[^[:alnum:]_])(stk|số tài khoản|so tai khoan|tài khoản|tai khoan|bank account|bank)[[:space:]]*[:#-]?[[:space:]]*[0-9]([[:space:].-]*[0-9]){5,19}',
    '\1[bank-account]',
    'gi'
  );
  v_value := regexp_replace(
    v_value,
    '(^|[^[:alnum:]_])(cccd|cmnd|căn cước|can cuoc|id)[[:space:]]*[:#-]?[[:space:]]*[0-9]([[:space:].-]*[0-9]){5,19}',
    '\1[id-number]',
    'gi'
  );
  v_value := regexp_replace(
    v_value,
    '(^|[^0-9])(([+]?84|0)([[:space:]().-]*[0-9]){8,10})([^0-9]|$)',
    '\1[phone]\5',
    'g'
  );
  v_value := regexp_replace(
    v_value,
    '(^|[^0-9])[0-9]{8}([^0-9]|$)',
    '\1[bank-account]\2',
    'g'
  );
  v_value := regexp_replace(
    v_value,
    '(^|[^0-9])[0-9]{9,12}([^0-9]|$)',
    '\1[id-number]\2',
    'g'
  );
  v_value := regexp_replace(
    v_value,
    '(^|[^0-9])[0-9]{13,15}([^0-9]|$)',
    '\1[bank-account]\2',
    'g'
  );
  v_value := regexp_replace(
    v_value,
    '(^|[^[:alnum:]_])(địa chỉ|dia chi|address)[[:space:]]*[:#-]?[[:space:]]*[^,;]{1,120}',
    '\1[address]',
    'gi'
  );
  v_value := regexp_replace(
    v_value,
    '(^|[^[:alnum:]_])(căn hộ|can ho|căn|can|unit|phòng|phong|apt|block|tòa|toà|toa)[[:space:]]+[[:alnum:]_.\/-]+',
    '\1[unit]',
    'gi'
  );
  v_value := regexp_replace(
    v_value,
    '(^|[^[:alnum:]_])(tầng|tang|lầu|lau|floor)[[:space:]]*[0-9]{1,3}',
    '\1[floor]',
    'gi'
  );
  v_value := regexp_replace(
    v_value,
    '(^|[^[:alnum:]_])(số nhà|so nha|nhà số|nha so|số|so)[[:space:]]+[[:alnum:].\/-]+',
    '\1[house-no]',
    'gi'
  );
  v_value := regexp_replace(
    v_value,
    '(^|[^[:alnum:]_])([0-9]{1,5}[[:alpha:]]?([/-][0-9]{1,5}[[:alpha:]]?)?)([[:space:]]+(đường|duong|phố|pho|hẻm|hem)[[:space:]]+[[:alpha:]][[:alnum:]''-]*)',
    '\1[house-no]\4',
    'gi'
  );
  v_value := regexp_replace(
    v_value,
    '(^|[^[:alnum:]_])([0-9]{1,5}[[:alpha:]]?([/-][0-9]{1,5}[[:alpha:]]?)?)([[:space:]]+[[:upper:]][[:alpha:]''-]*([[:space:]]+[[:upper:]][[:alpha:]''-]*){0,3})',
    '\1[house-no]\4',
    'g'
  );
  v_value := regexp_replace(
    v_value,
    '(^|[^[:alnum:]_])(Vinhomes|Vincom|Masteri|Saigon Pearl|Saigon Royal|Saigon South|Sun Avenue|Sun Village|Sunwah|Estella|Lexington|Diamond Island|Empire City|Eco Green|Phu My Hung|Phú Mỹ Hưng|Hoang Anh Gia Lai|Hoàng Anh Gia Lai|Riviera Point|Vista Verde|Era Town|The Manor|Lancaster|City Garden|Lavila|Centana|Topaz|Jamila|Akari|Sunrise City|Botanica|Pearl Plaza|Landmark|The Sun|Citadines|Lumière|Lumiere)([[:space:]]+[[:alpha:]][[:alnum:].-]*){0,2}',
    '\1[building]',
    'gi'
  );
  v_value := regexp_replace(v_value, '[[:cntrl:]]', '', 'g');
  v_value := regexp_replace(v_value, '[[:space:]]+', ' ', 'g');
  return left(btrim(v_value), 240);
end;
$$;

revoke execute on function private.sanitize_kael_memory_excerpt(text) from public;
revoke execute on function private.sanitize_kael_memory_excerpt(text) from anon;
revoke execute on function private.sanitize_kael_memory_excerpt(text) from authenticated;
grant execute on function private.sanitize_kael_memory_excerpt(text) to service_role;

create or replace function private.kael_memory_timestamp_or_min(p_value text)
returns timestamptz
language plpgsql
stable
security invoker
set search_path = pg_catalog, pg_temp
as $$
begin
  return coalesce(
    nullif(p_value, '')::timestamptz,
    '-infinity'::timestamptz
  );
exception
  when others then
    return '-infinity'::timestamptz;
end;
$$;

revoke execute on function private.kael_memory_timestamp_or_min(text) from public;
revoke execute on function private.kael_memory_timestamp_or_min(text) from anon;
revoke execute on function private.kael_memory_timestamp_or_min(text) from authenticated;
grant execute on function private.kael_memory_timestamp_or_min(text) to service_role;

create or replace function public.record_worker_disintermediation_memory_atomic(
  p_worker_id uuid,
  p_job_id uuid,
  p_message_id uuid,
  p_signals text[]
)
returns table (
  applied boolean,
  disintermediation_risk_count bigint
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_applied boolean;
  v_count bigint;
  v_inserted_count bigint;
  v_observed_at timestamptz;
begin
  if p_worker_id is null or p_job_id is null or p_message_id is null then
    raise exception 'worker, job, and message are required' using errcode = '22023';
  end if;

  select cm.created_at
  into v_observed_at
  from public.chat_messages cm
  where cm.id = p_message_id
    and cm.job_id = p_job_id
    and cm.sender_id = p_worker_id
    and cm.sender_role::text = 'worker';
  if not found then
    raise exception 'worker chat message does not match memory event' using errcode = '22023';
  end if;

  insert into public.kael_memory_update_receipts (
    event_key,
    event_type,
    subject_type,
    subject_id,
    job_id,
    source_event_id,
    safe_metadata
  ) values (
    'worker_disintermediation:' || p_message_id::text,
    'worker_disintermediation',
    'worker',
    p_worker_id,
    p_job_id,
    p_message_id::text,
    jsonb_build_object('signals', to_jsonb(coalesce(p_signals, '{}'::text[])))
  )
  on conflict (event_key) do nothing;
  get diagnostics v_inserted_count = row_count;
  v_applied := v_inserted_count = 1;

  if not v_applied then
    select case
      when coalesce(wkm.red_flags ->> 'disintermediation_risk_count', '') ~ '^[0-9]{1,18}$'
        then (wkm.red_flags ->> 'disintermediation_risk_count')::bigint
      else 0
    end
    into v_count
    from public.worker_kael_memory wkm
    where wkm.worker_id = p_worker_id;
    return query select false, coalesce(v_count, 0);
    return;
  end if;

  insert into public.worker_kael_memory (
    worker_id,
    red_flags,
    reliability_signals,
    safe_metadata,
    last_observed_at
  ) values (
    p_worker_id,
    jsonb_build_object(
      'disintermediation_contact_leak', true,
      'disintermediation_risk_count', 1,
      'last_disintermediation_at', v_observed_at,
      'last_disintermediation_job_id', p_job_id,
      'last_disintermediation_signals', to_jsonb(coalesce(p_signals, '{}'::text[]))
    ),
    jsonb_build_object('app_channel_guard_triggered', true),
    jsonb_build_object(
      'last_disintermediation_guard',
      jsonb_build_object(
        'job_id', p_job_id,
        'message_id', p_message_id,
        'observed_at', v_observed_at,
        'signals', to_jsonb(coalesce(p_signals, '{}'::text[]))
      )
    ),
    v_observed_at
  )
  on conflict (worker_id) do update
  set red_flags = coalesce(worker_kael_memory.red_flags, '{}'::jsonb)
        || jsonb_build_object(
          'disintermediation_contact_leak', true,
          'disintermediation_risk_count',
          case
            when coalesce(
              worker_kael_memory.red_flags ->> 'disintermediation_risk_count',
              ''
            ) ~ '^[0-9]{1,18}$'
              then (worker_kael_memory.red_flags ->> 'disintermediation_risk_count')::bigint + 1
            else 1
          end
        )
        || case
          when private.kael_memory_timestamp_or_min(
            worker_kael_memory.red_flags ->> 'last_disintermediation_at'
          ) <= v_observed_at
          then jsonb_build_object(
            'last_disintermediation_at', v_observed_at,
            'last_disintermediation_job_id', p_job_id,
            'last_disintermediation_signals', to_jsonb(coalesce(p_signals, '{}'::text[]))
          )
          else '{}'::jsonb
        end,
      reliability_signals = coalesce(
        worker_kael_memory.reliability_signals,
        '{}'::jsonb
      ) || jsonb_build_object('app_channel_guard_triggered', true),
      safe_metadata = coalesce(worker_kael_memory.safe_metadata, '{}'::jsonb)
        || case
          when private.kael_memory_timestamp_or_min(
            worker_kael_memory.safe_metadata #>> '{last_disintermediation_guard,observed_at}'
          ) <= v_observed_at
          then excluded.safe_metadata
          else '{}'::jsonb
        end,
      last_observed_at = greatest(
        coalesce(worker_kael_memory.last_observed_at, '-infinity'::timestamptz),
        excluded.last_observed_at
      )
  returning case
    when coalesce(worker_kael_memory.red_flags ->> 'disintermediation_risk_count', '') ~ '^[0-9]{1,18}$'
      then (worker_kael_memory.red_flags ->> 'disintermediation_risk_count')::bigint
    else 0
  end
  into v_count;

  insert into public.kael_admin_queue (
    job_id,
    actor_id,
    actor_role,
    queue_type,
    priority,
    status,
    escalation_level,
    reason_code,
    response_summary,
    safe_metadata
  ) values (
    p_job_id,
    p_worker_id,
    'worker',
    'disintermediation_risk',
    'medium',
    'open',
    'soft',
    'worker_contact_or_off_app_solicitation',
    'worker_chat_contact_guard_triggered',
    jsonb_build_object(
      'guard', 'chat_contact_redaction',
      'message_id', p_message_id,
      'signals', to_jsonb(coalesce(p_signals, '{}'::text[]))
    )
  );

  return query select true, v_count;
end;
$$;

revoke execute on function public.record_worker_disintermediation_memory_atomic(uuid, uuid, uuid, text[]) from public;
revoke execute on function public.record_worker_disintermediation_memory_atomic(uuid, uuid, uuid, text[]) from anon;
revoke execute on function public.record_worker_disintermediation_memory_atomic(uuid, uuid, uuid, text[]) from authenticated;
grant execute on function public.record_worker_disintermediation_memory_atomic(uuid, uuid, uuid, text[]) to service_role;

create or replace function public.record_normal_transaction_memory_atomic(
  p_job_id uuid,
  p_customer_id uuid
)
returns table (applied boolean)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_applied boolean;
  v_district text;
  v_final_price integer;
  v_inserted_count bigint;
  v_observed_at timestamptz;
  v_problem_summary text;
  v_rating integer;
  v_review_id uuid;
  v_service_patch jsonb;
  v_service_type text;
  v_worker_id uuid;
begin
  if p_job_id is null or p_customer_id is null then
    raise exception 'job and customer are required' using errcode = '22023';
  end if;

  select
    r.worker_id,
    j.service_type::text,
    j.address_district,
    j.final_price,
    j.kael_problem_identified,
    r.id,
    r.rating,
    r.created_at
  into
    v_worker_id,
    v_service_type,
    v_district,
    v_final_price,
    v_problem_summary,
    v_review_id,
    v_rating,
    v_observed_at
  from public.jobs j
  join public.reviews r on r.job_id = j.id
    and r.customer_id = j.customer_id
    and r.worker_id = j.worker_id
  where j.id = p_job_id
    and j.customer_id = p_customer_id;
  if not found then
    raise exception 'reviewed job does not match normal memory event' using errcode = '22023';
  end if;

  insert into public.kael_memory_update_receipts (
    event_key,
    event_type,
    subject_type,
    subject_id,
    job_id,
    source_event_id,
    safe_metadata
  ) values (
    'normal_transaction_review:' || v_review_id::text,
    'normal_transaction_review',
    'customer',
    p_customer_id,
    p_job_id,
    v_review_id::text,
    jsonb_build_object('worker_id', v_worker_id, 'service_type', v_service_type)
  )
  on conflict (event_key) do nothing;
  get diagnostics v_inserted_count = row_count;
  v_applied := v_inserted_count = 1;

  if not v_applied then
    return query select false;
    return;
  end if;

  v_service_patch := jsonb_build_object(
    'last_rating', v_rating,
    'last_district', v_district,
    'last_normal_job_id', p_job_id,
    'observed_at', v_observed_at
  );

  insert into public.customer_kael_memory (
    customer_id,
    service_preferences,
    trust_signals,
    safe_metadata,
    last_observed_at
  ) values (
    p_customer_id,
    jsonb_build_object(v_service_type, v_service_patch),
    jsonb_build_object(
      'reviewed_after_completion', true,
      'last_rating', v_rating,
      'last_normal_job_id', p_job_id,
      'last_normal_observed_at', v_observed_at
    ),
    jsonb_build_object(
      'last_normal_transaction',
      jsonb_build_object(
        'job_id', p_job_id,
        'service_type', v_service_type,
        'district', v_district,
        'final_price_present', v_final_price is not null,
        'problem_summary_present', v_problem_summary is not null,
        'layers', jsonb_build_array('L2', 'L3', 'L5'),
        'observed_at', v_observed_at
      )
    ),
    v_observed_at
  )
  on conflict (customer_id) do update
  set service_preferences = coalesce(
        customer_kael_memory.service_preferences,
        '{}'::jsonb
      ) || jsonb_build_object(
        v_service_type,
        case
          when private.kael_memory_timestamp_or_min(
            customer_kael_memory.service_preferences -> v_service_type ->> 'observed_at'
          ) <= v_observed_at
          then coalesce(
            customer_kael_memory.service_preferences -> v_service_type,
            '{}'::jsonb
          ) || v_service_patch
          else coalesce(
            customer_kael_memory.service_preferences -> v_service_type,
            '{}'::jsonb
          )
        end
      ),
      trust_signals = coalesce(customer_kael_memory.trust_signals, '{}'::jsonb)
        || case
          when private.kael_memory_timestamp_or_min(
            customer_kael_memory.safe_metadata #>> '{last_normal_transaction,observed_at}'
          ) <= v_observed_at
          then excluded.trust_signals
          else '{}'::jsonb
        end,
      safe_metadata = coalesce(customer_kael_memory.safe_metadata, '{}'::jsonb)
        || case
          when private.kael_memory_timestamp_or_min(
            customer_kael_memory.safe_metadata #>> '{last_normal_transaction,observed_at}'
          ) <= v_observed_at
          then excluded.safe_metadata
          else '{}'::jsonb
        end,
      last_observed_at = greatest(
        coalesce(customer_kael_memory.last_observed_at, '-infinity'::timestamptz),
        excluded.last_observed_at
      );

  if v_worker_id is not null then
    insert into public.worker_kael_memory (
      worker_id,
      service_skill_proficiency,
      reliability_signals,
      safe_metadata,
      last_observed_at
    ) values (
      v_worker_id,
      jsonb_build_object(
        v_service_type,
        jsonb_build_object(
          'last_rating', v_rating,
          'last_normal_job_id', p_job_id,
          'observed_at', v_observed_at
        )
      ),
      jsonb_build_object(
        'customer_reviewed_after_completion', true,
        'last_rating', v_rating,
        'last_normal_job_id', p_job_id,
        'last_normal_observed_at', v_observed_at
      ),
      jsonb_build_object(
        'last_normal_transaction',
        jsonb_build_object(
          'job_id', p_job_id,
          'service_type', v_service_type,
          'final_price_present', v_final_price is not null,
          'layers', jsonb_build_array('L2', 'L4', 'L5'),
          'observed_at', v_observed_at
        )
      ),
      v_observed_at
    )
    on conflict (worker_id) do update
    set service_skill_proficiency = coalesce(
          worker_kael_memory.service_skill_proficiency,
          '{}'::jsonb
        ) || jsonb_build_object(
          v_service_type,
          case
            when private.kael_memory_timestamp_or_min(
              worker_kael_memory.service_skill_proficiency -> v_service_type ->> 'observed_at'
            ) <= v_observed_at
            then coalesce(
              worker_kael_memory.service_skill_proficiency -> v_service_type,
              '{}'::jsonb
            ) || jsonb_build_object(
              'last_rating', v_rating,
              'last_normal_job_id', p_job_id,
              'observed_at', v_observed_at
            )
            else coalesce(
              worker_kael_memory.service_skill_proficiency -> v_service_type,
              '{}'::jsonb
            )
          end
        ),
        reliability_signals = coalesce(
          worker_kael_memory.reliability_signals,
          '{}'::jsonb
        ) || case
          when private.kael_memory_timestamp_or_min(
            worker_kael_memory.safe_metadata #>> '{last_normal_transaction,observed_at}'
          ) <= v_observed_at
          then excluded.reliability_signals
          else '{}'::jsonb
        end,
        safe_metadata = coalesce(worker_kael_memory.safe_metadata, '{}'::jsonb)
          || case
            when private.kael_memory_timestamp_or_min(
              worker_kael_memory.safe_metadata #>> '{last_normal_transaction,observed_at}'
            ) <= v_observed_at
            then excluded.safe_metadata
            else '{}'::jsonb
          end,
        last_observed_at = greatest(
          coalesce(worker_kael_memory.last_observed_at, '-infinity'::timestamptz),
          excluded.last_observed_at
        );
  end if;

  insert into public.job_events (
    job_id,
    actor_id,
    actor_role,
    event_type,
    from_status,
    to_status,
    safe_metadata
  ) values (
    p_job_id,
    p_customer_id,
    'customer',
    'kael_memory_l2_observed',
    null,
    null,
    jsonb_build_object(
      'normal_case', true,
      'layers', jsonb_build_array('L2', 'L3', 'L4', 'L5'),
      'review_id', v_review_id,
      'service_type', v_service_type,
      'final_price_present', v_final_price is not null
    )
  );

  return query select true;
end;
$$;

revoke execute on function public.record_normal_transaction_memory_atomic(uuid, uuid) from public;
revoke execute on function public.record_normal_transaction_memory_atomic(uuid, uuid) from anon;
revoke execute on function public.record_normal_transaction_memory_atomic(uuid, uuid) from authenticated;
grant execute on function public.record_normal_transaction_memory_atomic(uuid, uuid) to service_role;

create or replace function public.record_worker_cancellation_memory_atomic(
  p_cancellation_id uuid,
  p_worker_id uuid,
  p_job_id uuid,
  p_sub_case text
)
returns table (applied boolean)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_applied boolean;
  v_inserted_count bigint;
  v_is_review boolean;
  v_record public.worker_cancellation_requests%rowtype;
  v_review jsonb;
begin
  if p_cancellation_id is null or p_worker_id is null or p_job_id is null then
    raise exception 'cancellation, worker, and job are required' using errcode = '22023';
  end if;
  if p_sub_case not in ('explicit_cancel', 'no_show') then
    raise exception 'invalid worker cancellation sub-case' using errcode = '22023';
  end if;

  select *
  into v_record
  from public.worker_cancellation_requests wcr
  where wcr.id = p_cancellation_id
    and wcr.worker_id = p_worker_id
    and wcr.job_id = p_job_id;
  if not found then
    raise exception 'worker cancellation does not match memory event' using errcode = '22023';
  end if;

  insert into public.kael_memory_update_receipts (
    event_key,
    event_type,
    subject_type,
    subject_id,
    job_id,
    source_event_id,
    safe_metadata
  ) values (
    'worker_cancellation_review:' || p_cancellation_id::text,
    'worker_cancellation_review',
    'worker',
    p_worker_id,
    p_job_id,
    p_cancellation_id::text,
    jsonb_build_object('sub_case', p_sub_case)
  )
  on conflict (event_key) do nothing;
  get diagnostics v_inserted_count = row_count;
  v_applied := v_inserted_count = 1;

  if not v_applied then
    return query select false;
    return;
  end if;

  v_is_review := v_record.admin_review_required
    or coalesce(array_length(v_record.abuse_signals, 1), 0) > 0
    or p_sub_case = 'no_show';
  v_review := jsonb_build_object(
    'job_id', p_job_id,
    'cancellation_id', p_cancellation_id,
    'reason_code', v_record.reason_code,
    'reason_category', v_record.reason_category,
    'sub_case', p_sub_case,
    'abuse_signals', to_jsonb(coalesce(v_record.abuse_signals, '{}'::text[])),
    'sanitized_reason', private.sanitize_kael_memory_excerpt(v_record.reason),
    'autonomous_suspension', false,
    'observed_at', v_record.created_at
  );

  insert into public.worker_kael_memory (
    worker_id,
    red_flags,
    reliability_signals,
    safe_metadata,
    last_observed_at
  ) values (
    p_worker_id,
    case when v_is_review
      then jsonb_build_object('worker_cancellation_abuse_review', true)
      else '{}'::jsonb
    end,
    jsonb_build_object(
      'last_worker_cancellation_reason', v_record.reason_code,
      'last_worker_cancellation_category', v_record.reason_category,
      'worker_cancellation_admin_review_required', v_is_review,
      'last_worker_cancellation_observed_at', v_record.created_at
    ),
    jsonb_build_object('last_worker_cancellation_review', v_review),
    v_record.created_at
  )
  on conflict (worker_id) do update
  set red_flags = coalesce(worker_kael_memory.red_flags, '{}'::jsonb)
        || excluded.red_flags,
      reliability_signals = coalesce(
        worker_kael_memory.reliability_signals,
        '{}'::jsonb
      ) || case
        when private.kael_memory_timestamp_or_min(
          worker_kael_memory.safe_metadata #>> '{last_worker_cancellation_review,observed_at}'
        ) <= v_record.created_at
        then excluded.reliability_signals
        else '{}'::jsonb
      end,
      safe_metadata = coalesce(worker_kael_memory.safe_metadata, '{}'::jsonb)
        || case
        when private.kael_memory_timestamp_or_min(
          worker_kael_memory.safe_metadata #>> '{last_worker_cancellation_review,observed_at}'
        ) <= v_record.created_at
          then excluded.safe_metadata
          else '{}'::jsonb
        end,
      last_observed_at = greatest(
        coalesce(worker_kael_memory.last_observed_at, '-infinity'::timestamptz),
        excluded.last_observed_at
      );

  if v_is_review then
    insert into public.kael_admin_queue (
      job_id,
      actor_id,
      actor_role,
      queue_type,
      priority,
      status,
      escalation_level,
      reason_code,
      response_summary,
      safe_metadata
    ) values (
      p_job_id,
      p_worker_id,
      'worker',
      case when p_sub_case = 'no_show'
        then 'worker_no_show'
        else 'worker_cancellation_review'
      end,
      'medium',
      'open',
      'soft',
      coalesce(v_record.reason_code, 'no_reason'),
      case when p_sub_case = 'no_show'
        then 'admin_review_worker_no_show'
        else 'admin_review_before_suspension'
      end,
      jsonb_build_object(
        'case', 'worker_cancel',
        'sub_case', p_sub_case,
        'reason_category', v_record.reason_category,
        'abuse_signals', to_jsonb(coalesce(v_record.abuse_signals, '{}'::text[])),
        'fallback_options', coalesce(v_record.fallback_options, '[]'::jsonb),
        'autonomous_suspension', false,
        'sanitized_reason', private.sanitize_kael_memory_excerpt(v_record.reason)
      )
    );
  end if;

  return query select true;
end;
$$;

revoke execute on function public.record_worker_cancellation_memory_atomic(uuid, uuid, uuid, text) from public;
revoke execute on function public.record_worker_cancellation_memory_atomic(uuid, uuid, uuid, text) from anon;
revoke execute on function public.record_worker_cancellation_memory_atomic(uuid, uuid, uuid, text) from authenticated;
grant execute on function public.record_worker_cancellation_memory_atomic(uuid, uuid, uuid, text) to service_role;

create or replace function public.record_customer_cancellation_memory_atomic(
  p_cancellation_id uuid,
  p_customer_id uuid,
  p_job_id uuid
)
returns table (applied boolean)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_applied boolean;
  v_inserted_count bigint;
  v_is_abuse boolean;
  v_queue_needed boolean;
  v_record public.customer_cancellation_records%rowtype;
  v_review jsonb;
begin
  if p_cancellation_id is null or p_customer_id is null or p_job_id is null then
    raise exception 'cancellation, customer, and job are required' using errcode = '22023';
  end if;

  select *
  into v_record
  from public.customer_cancellation_records ccr
  where ccr.id = p_cancellation_id
    and ccr.customer_id = p_customer_id
    and ccr.job_id = p_job_id;
  if not found then
    raise exception 'customer cancellation does not match memory event' using errcode = '22023';
  end if;

  insert into public.kael_memory_update_receipts (
    event_key,
    event_type,
    subject_type,
    subject_id,
    job_id,
    source_event_id,
    safe_metadata
  ) values (
    'customer_cancellation_review:' || p_cancellation_id::text,
    'customer_cancellation_review',
    'customer',
    p_customer_id,
    p_job_id,
    p_cancellation_id::text,
    jsonb_build_object('sub_case', v_record.sub_case)
  )
  on conflict (event_key) do nothing;
  get diagnostics v_inserted_count = row_count;
  v_applied := v_inserted_count = 1;

  if not v_applied then
    return query select false;
    return;
  end if;

  v_is_abuse := coalesce(array_length(v_record.abuse_signals, 1), 0) > 0;
  v_queue_needed := v_record.admin_review_required
    or v_is_abuse
    or v_record.sub_case in (
      'after_worker_accept',
      'after_worker_completed_trigger_dispute'
    );
  v_review := jsonb_build_object(
    'job_id', p_job_id,
    'cancellation_id', p_cancellation_id,
    'worker_id', v_record.worker_id,
    'reason_code', v_record.reason_code,
    'reason_category', v_record.reason_category,
    'sub_case', v_record.sub_case,
    'abuse_signals', to_jsonb(coalesce(v_record.abuse_signals, '{}'::text[])),
    'sanitized_reason', private.sanitize_kael_memory_excerpt(v_record.reason_note),
    'phase0_no_monetary_penalty', v_record.phase0_no_monetary_penalty,
    'worker_goodwill', v_record.worker_goodwill,
    'autonomous_action', false,
    'observed_at', v_record.created_at
  );

  insert into public.customer_kael_memory (
    customer_id,
    trust_signals,
    safe_metadata,
    last_observed_at
  ) values (
    p_customer_id,
    (case when v_is_abuse then jsonb_build_object(
      'cancellation_abuser', true,
      'customer_cancellation_abuse_review', true,
      'require_specific_reason_next_booking', true,
      'require_admin_verify_before_next_booking', true
    ) else '{}'::jsonb end) || jsonb_build_object(
      'last_customer_cancellation_reason', v_record.reason_code,
      'last_customer_cancellation_category', v_record.reason_category,
      'last_customer_cancellation_observed_at', v_record.created_at
    ),
    jsonb_build_object('last_customer_cancellation_review', v_review),
    v_record.created_at
  )
  on conflict (customer_id) do update
  set trust_signals = coalesce(customer_kael_memory.trust_signals, '{}'::jsonb)
        || case when v_is_abuse then jsonb_build_object(
          'cancellation_abuser', true,
          'customer_cancellation_abuse_review', true,
          'require_specific_reason_next_booking', true,
          'require_admin_verify_before_next_booking', true
        ) else '{}'::jsonb end
        || case
          when private.kael_memory_timestamp_or_min(
            customer_kael_memory.safe_metadata #>> '{last_customer_cancellation_review,observed_at}'
          ) <= v_record.created_at
          then jsonb_build_object(
            'last_customer_cancellation_reason', v_record.reason_code,
            'last_customer_cancellation_category', v_record.reason_category,
            'last_customer_cancellation_observed_at', v_record.created_at
          )
          else '{}'::jsonb
        end,
      safe_metadata = coalesce(customer_kael_memory.safe_metadata, '{}'::jsonb)
        || case
        when private.kael_memory_timestamp_or_min(
          customer_kael_memory.safe_metadata #>> '{last_customer_cancellation_review,observed_at}'
        ) <= v_record.created_at
          then excluded.safe_metadata
          else '{}'::jsonb
        end,
      last_observed_at = greatest(
        coalesce(customer_kael_memory.last_observed_at, '-infinity'::timestamptz),
        excluded.last_observed_at
      );

  if v_queue_needed then
    insert into public.kael_admin_queue (
      job_id,
      actor_id,
      actor_role,
      queue_type,
      priority,
      status,
      escalation_level,
      reason_code,
      response_summary,
      safe_metadata
    ) values (
      p_job_id,
      p_customer_id,
      'customer',
      'customer_cancellation_review',
      'medium',
      'open',
      case when v_record.sub_case = 'after_worker_completed_trigger_dispute'
        then 'hard'
        else 'soft'
      end,
      v_record.reason_code,
      case when v_record.sub_case = 'after_worker_completed_trigger_dispute'
        then 'defer_to_case_5_dispute'
        else 'customer_cancellation_review'
      end,
      jsonb_build_object(
        'case', 'customer_cancel',
        'sub_case', v_record.sub_case,
        'worker_id', v_record.worker_id,
        'reason_category', v_record.reason_category,
        'abuse_signals', to_jsonb(coalesce(v_record.abuse_signals, '{}'::text[])),
        'phase0_no_monetary_penalty', true,
        'worker_goodwill', v_record.worker_goodwill,
        'sanitized_reason', private.sanitize_kael_memory_excerpt(v_record.reason_note)
      )
    );
  end if;

  return query select true;
end;
$$;

revoke execute on function public.record_customer_cancellation_memory_atomic(uuid, uuid, uuid) from public;
revoke execute on function public.record_customer_cancellation_memory_atomic(uuid, uuid, uuid) from anon;
revoke execute on function public.record_customer_cancellation_memory_atomic(uuid, uuid, uuid) from authenticated;
grant execute on function public.record_customer_cancellation_memory_atomic(uuid, uuid, uuid) to service_role;
