-- A durable receipt makes each reviewed job count once per learning service.
-- Scope serialization and candidate aggregation stay in the same transaction.

create table public.learning_observation_receipts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  candidate_id uuid not null references public.learning_candidates(id) on delete cascade,
  candidate_type text not null check (
    candidate_type in ('price_prior_update', 'analysis_rule')
  ),
  affected_service public.service_type not null,
  affected_problem text not null check (char_length(affected_problem) between 1 and 100),
  affected_district text not null check (char_length(affected_district) between 1 and 40),
  complexity public.complexity_level not null,
  baseline_min numeric,
  baseline_max numeric,
  final_price numeric,
  rating integer check (rating between 0 and 5),
  review_tags text[] not null default '{}',
  scope_change_requested boolean not null,
  reviewed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (job_id, candidate_type),
  check (
    candidate_type <> 'price_prior_update'
    or (
      baseline_min is not null
      and baseline_max is not null
      and final_price is not null
      and baseline_min > 0
      and baseline_max >= baseline_min
      and final_price > 0
    )
  )
);

create index learning_observation_receipts_candidate_idx
  on public.learning_observation_receipts(candidate_id, reviewed_at, job_id);

alter table public.learning_observation_receipts enable row level security;
revoke all on table public.learning_observation_receipts from public;
revoke all on table public.learning_observation_receipts from anon;
revoke all on table public.learning_observation_receipts from authenticated;
grant all on table public.learning_observation_receipts to service_role;

comment on table public.learning_observation_receipts is
  'Service-owned idempotency receipts and privacy-safe aggregates for reviewed-job learning.';

create table private.learning_observation_seeds (
  candidate_id uuid primary key references public.learning_candidates(id) on delete cascade,
  candidate_type text not null check (
    candidate_type in ('price_prior_update', 'analysis_rule')
  ),
  evidence_count integer not null check (evidence_count > 0),
  aggregate_payload jsonb not null check (jsonb_typeof(aggregate_payload) = 'object'),
  created_at timestamptz not null default now()
);

revoke all on table private.learning_observation_seeds from public;
revoke all on table private.learning_observation_seeds from anon;
revoke all on table private.learning_observation_seeds from authenticated;
revoke all on table private.learning_observation_seeds from service_role;

-- Existing duplicate pending rows cannot satisfy the new invariant. Keep the
-- most evidence-rich row and archive the rest without merging uncertain data.
with ranked as (
  select
    candidate.id,
    row_number() over (
      partition by
        candidate.candidate_type,
        candidate.affected_service,
        candidate.affected_problem,
        candidate.affected_district
      order by
        candidate.evidence_count desc,
        candidate.updated_at desc,
        candidate.created_at asc,
        candidate.id asc
    ) as scope_rank
  from public.learning_candidates as candidate
  where candidate.candidate_type in ('price_prior_update', 'analysis_rule')
    and candidate.status in ('created', 'pending_evidence')
)
update public.learning_candidates as candidate
set
  status = 'archived'::public.learning_candidate_status,
  audit_reason = concat_ws(
    '; ',
    nullif(candidate.audit_reason, ''),
    'duplicate pending scope archived before atomic observation ledger'
  )
from ranked
where ranked.id = candidate.id
  and ranked.scope_rank > 1;

create unique index learning_candidates_pending_scope_unique
  on public.learning_candidates (
    candidate_type,
    affected_service,
    affected_problem,
    affected_district
  )
  where candidate_type in ('price_prior_update', 'analysis_rule')
    and status in ('created', 'pending_evidence');

-- Legacy review input admitted free-form strings; only the product taxonomy
-- may survive into an active or historical learning candidate.
update public.learning_candidates as candidate
set suggested_payload = jsonb_set(
  candidate.suggested_payload,
  '{observed,common_tags}',
  coalesce(
    (
      select jsonb_agg(allowed.tag order by allowed.position)
      from unnest(array[
        'Đúng giờ',
        'Chuyên nghiệp',
        'Sạch sẽ',
        'Giải thích rõ',
        'Giá hợp lý'
      ]::text[]) with ordinality as allowed(tag, position)
      where (candidate.suggested_payload#>'{observed,common_tags}') ? allowed.tag
    ),
    '[]'::jsonb
  )
)
where candidate.candidate_type = 'analysis_rule'
  and jsonb_typeof(candidate.suggested_payload) = 'object'
  and jsonb_typeof(candidate.suggested_payload->'observed') = 'object'
  and jsonb_typeof(candidate.suggested_payload#>'{observed,common_tags}') = 'array';

create or replace function public.record_learning_observation_atomic(
  p_job_id uuid,
  p_candidate_type text,
  p_affected_service public.service_type,
  p_affected_problem text,
  p_affected_district text,
  p_complexity public.complexity_level,
  p_baseline_min numeric,
  p_baseline_max numeric,
  p_final_price numeric,
  p_rating integer,
  p_review_tags text[],
  p_scope_change_requested boolean,
  p_reviewed_at timestamptz
) returns table (
  ok boolean,
  error_code text,
  candidate_id uuid,
  is_new boolean,
  confidence numeric,
  evidence_count integer,
  status text,
  idempotent boolean
)
language plpgsql
security definer
set search_path = ''
as $func$
declare
  v_allowed_review_tags constant text[] := array[
    'Đúng giờ',
    'Chuyên nghiệp',
    'Sạch sẽ',
    'Giải thích rõ',
    'Giá hợp lý'
  ]::text[];
  v_job record;
  v_review record;
  v_candidate public.learning_candidates%rowtype;
  v_receipt public.learning_observation_receipts%rowtype;
  v_is_new boolean := false;
  v_payload jsonb;
  v_seed_payload jsonb;
  v_prior_suggestion jsonb;
  v_suggestion jsonb;
  v_common_tags jsonb;
  v_safe_review_tags text[];
  v_latest record;
  v_legacy_payload_valid boolean;
  v_sample_size integer;
  v_scope_change_count integer;
  v_scope_change_rate numeric;
  v_avg_rating numeric;
  v_median_final numeric;
  v_p25_final numeric;
  v_p75_final numeric;
  v_median_estimate_min numeric;
  v_median_estimate_max numeric;
  v_from_ts timestamptz;
  v_to_ts timestamptz;
  v_baseline_mid numeric;
  v_baseline_spread numeric;
  v_new_min numeric;
  v_new_max numeric;
  v_direction text;
  v_confidence numeric;
  v_status public.learning_candidate_status;
begin
  if p_job_id is null
     or p_candidate_type not in ('price_prior_update', 'analysis_rule')
     or p_affected_service is null
     or nullif(trim(coalesce(p_affected_problem, '')), '') is null
     or nullif(trim(coalesce(p_affected_district, '')), '') is null
     or p_complexity is null
     or p_scope_change_requested is null
     or p_reviewed_at is null
     or p_rating is null
     or p_rating < 0
     or p_rating > 5
     or cardinality(coalesce(p_review_tags, '{}')) > 20
     or exists (
       select 1
       from unnest(coalesce(p_review_tags, '{}')) as tag
       where char_length(tag) > 100
     )
     or p_affected_district not in (
       'q1', 'q3', 'q4', 'q5', 'q6', 'q7', 'q8', 'q10', 'q11', 'q12',
       'binh_thanh', 'thu_duc', 'tan_binh', 'go_vap', 'phu_nhuan',
       'binh_tan', 'tan_phu', 'hoc_mon', 'binh_chanh', 'cu_chi', 'nha_be', 'can_gio'
     ) then
    return query
      select false, 'INVALID_INPUT'::text, null::uuid, false, 0::numeric,
        0, null::text, false;
    return;
  end if;

  if p_candidate_type = 'price_prior_update'
     and (
       p_final_price is null
       or p_final_price <= 0
       or p_baseline_min is null
       or p_baseline_min <= 0
       or p_baseline_max is null
       or p_baseline_max < p_baseline_min
       or p_scope_change_requested
     ) then
    return query
      select false, 'INVALID_PRICE_OBSERVATION'::text, null::uuid, false,
        0::numeric, 0, null::text, false;
    return;
  end if;

  select
    job.status,
    job.service_type,
    job.address_district,
    coalesce(problem.slug, job.kael_problem_identified) as problem_slug,
    job.kael_complexity,
    job.kael_price_min,
    job.kael_price_max,
    job.final_price,
    job.reviewed_at
  into v_job
  from public.jobs as job
  left join public.service_problems as problem on problem.id = job.service_problem_id
  where job.id = p_job_id
  for share of job;

  if not found
     or v_job.status <> 'reviewed'::public.job_status
     or v_job.reviewed_at is null then
    return query
      select false, 'JOB_NOT_REVIEWED'::text, null::uuid, false,
        0::numeric, 0, null::text, false;
    return;
  end if;

  select review.rating, coalesce(review.tags, '{}') as tags
  into v_review
  from public.reviews as review
  where review.job_id = p_job_id;

  if not found then
    v_review.rating := 0;
    v_review.tags := '{}'::text[];
  end if;

  select coalesce(
    array_agg(allowed.tag order by allowed.position),
    '{}'::text[]
  ) into v_safe_review_tags
  from unnest(v_allowed_review_tags) with ordinality as allowed(tag, position)
  where allowed.tag = any(coalesce(v_review.tags, '{}'::text[]));

  if v_job.service_type is distinct from p_affected_service
     or v_job.address_district is distinct from p_affected_district
     or v_job.problem_slug is distinct from p_affected_problem
     or v_job.kael_complexity is distinct from p_complexity
     or v_job.kael_price_min is distinct from p_baseline_min
     or v_job.kael_price_max is distinct from p_baseline_max
     or v_job.final_price is distinct from p_final_price
     or v_job.reviewed_at is distinct from p_reviewed_at
     or v_review.rating is distinct from p_rating
     or v_safe_review_tags is distinct from coalesce(p_review_tags, '{}'::text[])
     or exists (
       select 1
       from public.scope_change_requests as scope_change
       where scope_change.job_id = p_job_id
     ) is distinct from p_scope_change_requested then
    return query
      select false, 'SOURCE_MISMATCH'::text, null::uuid, false,
        0::numeric, 0, null::text, false;
    return;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      concat_ws(
        '|',
        'learning_observation',
        p_candidate_type,
        p_affected_service::text,
        p_affected_problem,
        p_affected_district
      ),
      102000
    )
  );

  select receipt.*
  into v_receipt
  from public.learning_observation_receipts as receipt
  where receipt.job_id = p_job_id
    and receipt.candidate_type = p_candidate_type
  for update;

  if found then
    if v_receipt.affected_service is distinct from p_affected_service
       or v_receipt.affected_problem is distinct from p_affected_problem
       or v_receipt.affected_district is distinct from p_affected_district then
      return query
        select false, 'OBSERVATION_SCOPE_CONFLICT'::text, v_receipt.candidate_id,
          false, 0::numeric, 0, null::text, true;
      return;
    end if;

    select candidate.*
    into v_candidate
    from public.learning_candidates as candidate
    where candidate.id = v_receipt.candidate_id;

    if not found then
      return query
        select false, 'CANDIDATE_NOT_FOUND'::text, v_receipt.candidate_id,
          false, 0::numeric, 0, null::text, true;
      return;
    end if;

    return query
      select true, null::text, v_candidate.id, false, v_candidate.confidence,
        v_candidate.evidence_count, v_candidate.status::text, true;
    return;
  end if;

  select candidate.*
  into v_candidate
  from public.learning_candidates as candidate
  where candidate.candidate_type = p_candidate_type
    and candidate.affected_service = p_affected_service
    and candidate.affected_problem = p_affected_problem
    and candidate.affected_district = p_affected_district
    and candidate.status in ('created', 'pending_evidence')
  order by candidate.created_at asc, candidate.id asc
  limit 1
  for update;

  if not found then
    if p_candidate_type = 'analysis_rule'
       and (not p_scope_change_requested or p_complexity = 'large') then
      return query
        select false, 'NO_SIGNAL_YET'::text, null::uuid, false,
          0::numeric, 0, null::text, false;
      return;
    end if;

    insert into public.learning_candidates (
      candidate_type,
      affected_service,
      affected_problem,
      affected_district,
      suggested_payload,
      evidence_count,
      confidence,
      status,
      audit_reason
    ) values (
      p_candidate_type,
      p_affected_service,
      p_affected_problem,
      p_affected_district,
      '{}'::jsonb,
      0,
      0,
      'created'::public.learning_candidate_status,
      'atomic observation candidate initialized'
    ) returning * into v_candidate;
    v_is_new := true;
  elsif v_candidate.evidence_count > 0
        and not exists (
          select 1
          from public.learning_observation_receipts as receipt
          where receipt.candidate_id = v_candidate.id
        ) then
    if jsonb_typeof(v_candidate.suggested_payload) is distinct from 'object'
       or v_candidate.suggested_payload->>'candidate_type' is distinct from p_candidate_type then
      return query
        select false, 'LEGACY_PAYLOAD_INVALID'::text, v_candidate.id, false,
          v_candidate.confidence, v_candidate.evidence_count,
          v_candidate.status::text, false;
      return;
    end if;

    v_seed_payload := v_candidate.suggested_payload;
    if p_candidate_type = 'price_prior_update' then
      v_legacy_payload_valid :=
        jsonb_typeof(v_seed_payload->'observed') = 'object'
        and jsonb_typeof(v_seed_payload#>'{observed,median_final_price}') = 'number'
        and jsonb_typeof(v_seed_payload#>'{observed,median_estimate_min}') = 'number'
        and jsonb_typeof(v_seed_payload#>'{observed,median_estimate_max}') = 'number'
        and jsonb_typeof(v_seed_payload->'window') = 'object'
        and jsonb_typeof(v_seed_payload#>'{window,to_ts}') = 'string';

      if v_legacy_payload_valid then
        begin
          v_legacy_payload_valid :=
            (v_seed_payload#>>'{observed,median_final_price}')::numeric > 0
            and (v_seed_payload#>>'{observed,median_estimate_min}')::numeric > 0
            and (v_seed_payload#>>'{observed,median_estimate_max}')::numeric >=
              (v_seed_payload#>>'{observed,median_estimate_min}')::numeric;
          perform (v_seed_payload#>>'{window,to_ts}')::timestamptz;
        exception
          when others then
            v_legacy_payload_valid := false;
        end;
      end if;
    else
      v_legacy_payload_valid :=
        jsonb_typeof(v_seed_payload->'observed') = 'object'
        and jsonb_typeof(v_seed_payload#>'{observed,avg_rating}') = 'number'
        and jsonb_typeof(v_seed_payload#>'{observed,scope_change_rate}') = 'number'
        and jsonb_typeof(v_seed_payload#>'{observed,common_tags}') = 'array';

      if v_legacy_payload_valid then
        v_legacy_payload_valid :=
          (v_seed_payload#>>'{observed,avg_rating}')::numeric between 0 and 5
          and (v_seed_payload#>>'{observed,scope_change_rate}')::numeric between 0 and 1;
      end if;
    end if;

    if v_legacy_payload_valid is not true then
      return query
        select false, 'LEGACY_PAYLOAD_INVALID'::text, v_candidate.id, false,
          v_candidate.confidence, v_candidate.evidence_count,
          v_candidate.status::text, false;
      return;
    end if;

    if p_candidate_type = 'analysis_rule' then
      select jsonb_set(
        v_seed_payload,
        '{observed,common_tags}',
        coalesce(
          jsonb_agg(allowed.tag order by allowed.position),
          '[]'::jsonb
        )
      ) into v_seed_payload
      from unnest(v_allowed_review_tags) with ordinality as allowed(tag, position)
      where (v_seed_payload#>'{observed,common_tags}') ? allowed.tag;
    end if;

    insert into private.learning_observation_seeds (
      candidate_id,
      candidate_type,
      evidence_count,
      aggregate_payload
    ) values (
      v_candidate.id,
      p_candidate_type,
      v_candidate.evidence_count,
      v_seed_payload
    ) on conflict on constraint learning_observation_seeds_pkey do nothing;
  end if;

  insert into public.learning_observation_receipts (
    job_id,
    candidate_id,
    candidate_type,
    affected_service,
    affected_problem,
    affected_district,
    complexity,
    baseline_min,
    baseline_max,
    final_price,
    rating,
    review_tags,
    scope_change_requested,
    reviewed_at
  ) values (
    p_job_id,
    v_candidate.id,
    p_candidate_type,
    p_affected_service,
    p_affected_problem,
    p_affected_district,
    p_complexity,
    p_baseline_min,
    p_baseline_max,
    p_final_price,
    p_rating,
    v_safe_review_tags,
    p_scope_change_requested,
    p_reviewed_at
  ) on conflict (job_id, candidate_type) do nothing
  returning * into v_receipt;

  if not found then
    select receipt.*
    into v_receipt
    from public.learning_observation_receipts as receipt
    where receipt.job_id = p_job_id
      and receipt.candidate_type = p_candidate_type;

    select candidate.*
    into v_candidate
    from public.learning_candidates as candidate
    where candidate.id = v_receipt.candidate_id;

    return query
      select true, null::text, v_candidate.id, false, v_candidate.confidence,
        v_candidate.evidence_count, v_candidate.status::text, true;
    return;
  end if;

  if p_candidate_type = 'price_prior_update' then
    with observations as (
      select
        receipt.final_price,
        receipt.baseline_min as estimate_min,
        receipt.baseline_max as estimate_max,
        receipt.reviewed_at
      from public.learning_observation_receipts as receipt
      where receipt.candidate_id = v_candidate.id
        and receipt.candidate_type = 'price_prior_update'
      union all
      select
        (seed.aggregate_payload#>>'{observed,median_final_price}')::numeric,
        (seed.aggregate_payload#>>'{observed,median_estimate_min}')::numeric,
        (seed.aggregate_payload#>>'{observed,median_estimate_max}')::numeric,
        (seed.aggregate_payload#>>'{window,to_ts}')::timestamptz
      from private.learning_observation_seeds as seed
      cross join lateral generate_series(1, seed.evidence_count)
      where seed.candidate_id = v_candidate.id
        and seed.candidate_type = 'price_prior_update'
    )
    select
      count(*)::integer,
      percentile_disc(0.25) within group (order by final_price),
      percentile_disc(0.5) within group (order by final_price),
      percentile_disc(0.75) within group (order by final_price),
      percentile_disc(0.5) within group (order by estimate_min),
      percentile_disc(0.5) within group (order by estimate_max),
      min(reviewed_at),
      max(reviewed_at)
    into
      v_sample_size,
      v_p25_final,
      v_median_final,
      v_p75_final,
      v_median_estimate_min,
      v_median_estimate_max,
      v_from_ts,
      v_to_ts
    from observations;

    select
      receipt.baseline_min,
      receipt.baseline_max,
      receipt.complexity
    into v_latest
    from public.learning_observation_receipts as receipt
    where receipt.candidate_id = v_candidate.id
      and receipt.candidate_type = 'price_prior_update'
    order by receipt.reviewed_at desc, receipt.job_id desc
    limit 1;

    v_baseline_mid := (v_latest.baseline_min + v_latest.baseline_max) / 2;
    v_baseline_spread := v_latest.baseline_max - v_latest.baseline_min;

    if v_baseline_mid <= 0 then
      v_direction := 'noisy';
    elsif (v_median_final - v_baseline_mid) / v_baseline_mid > 0.1 then
      v_direction := 'underestimate';
    elsif (v_median_final - v_baseline_mid) / v_baseline_mid < -0.1 then
      v_direction := 'overestimate';
    else
      v_direction := 'noisy';
    end if;

    if v_direction = 'noisy' then
      v_new_min := v_latest.baseline_min;
      v_new_max := v_latest.baseline_max;
      v_confidence := 0;
    else
      v_new_min := greatest(1, round(v_median_final - v_baseline_spread / 2));
      v_new_max := greatest(v_new_min + 1, round(v_median_final + v_baseline_spread / 2));
      v_confidence := least(
        0.95,
        greatest(0, 1 - greatest(0, v_p75_final - v_p25_final) / v_median_final)
      );
    end if;

    v_payload := jsonb_build_object(
      'candidate_type', 'price_prior_update',
      'scope', jsonb_build_object(
        'service_type', p_affected_service::text,
        'problem_slug', p_affected_problem,
        'district_code', p_affected_district,
        'complexity', v_latest.complexity::text
      ),
      'observed', jsonb_build_object(
        'sample_size', v_sample_size,
        'baseline_used_min', v_latest.baseline_min,
        'baseline_used_max', v_latest.baseline_max,
        'median_final_price', v_median_final,
        'p25_final_price', v_p25_final,
        'p75_final_price', v_p75_final,
        'median_estimate_min', v_median_estimate_min,
        'median_estimate_max', v_median_estimate_max
      ),
      'suggested', jsonb_build_object(
        'shift_min', v_new_min - v_latest.baseline_min,
        'shift_max', v_new_max - v_latest.baseline_max,
        'new_min', v_new_min,
        'new_max', v_new_max,
        'direction', v_direction
      ),
      'window', jsonb_build_object(
        'from_ts', v_from_ts,
        'to_ts', v_to_ts
      )
    );
    v_status := case
      when v_sample_size >= 5 then 'pending_evidence'::public.learning_candidate_status
      else 'created'::public.learning_candidate_status
    end;
  else
    with observations as (
      select
        receipt.rating::numeric as rating,
        receipt.scope_change_requested,
        receipt.review_tags
      from public.learning_observation_receipts as receipt
      where receipt.candidate_id = v_candidate.id
        and receipt.candidate_type = 'analysis_rule'
      union all
      select
        (seed.aggregate_payload#>>'{observed,avg_rating}')::numeric,
        generated.position <= round(
          (seed.aggregate_payload#>>'{observed,scope_change_rate}')::numeric
          * seed.evidence_count
        ),
        array(
          select jsonb_array_elements_text(
            seed.aggregate_payload#>'{observed,common_tags}'
          )
        )
      from private.learning_observation_seeds as seed
      cross join lateral generate_series(1, seed.evidence_count) as generated(position)
      where seed.candidate_id = v_candidate.id
        and seed.candidate_type = 'analysis_rule'
    )
    select
      count(*)::integer,
      count(*) filter (where scope_change_requested)::integer,
      avg(rating)
    into v_sample_size, v_scope_change_count, v_avg_rating
    from observations;

    with observations as (
      select receipt.review_tags
      from public.learning_observation_receipts as receipt
      where receipt.candidate_id = v_candidate.id
        and receipt.candidate_type = 'analysis_rule'
      union all
      select array(
        select jsonb_array_elements_text(
          seed.aggregate_payload#>'{observed,common_tags}'
        )
      )
      from private.learning_observation_seeds as seed
      cross join lateral generate_series(1, seed.evidence_count)
      where seed.candidate_id = v_candidate.id
        and seed.candidate_type = 'analysis_rule'
    ), tag_counts as (
      select tag, count(*) as tag_count
      from observations
      cross join lateral unnest(review_tags) as tag
      where tag = any(v_allowed_review_tags)
      group by tag
      order by tag_count desc, tag asc
      limit 3
    )
    select coalesce(
      jsonb_agg(tag order by tag_count desc, tag asc),
      '[]'::jsonb
    ) into v_common_tags
    from tag_counts;

    select receipt.complexity
    into v_latest
    from public.learning_observation_receipts as receipt
    where receipt.candidate_id = v_candidate.id
      and receipt.candidate_type = 'analysis_rule'
    order by receipt.reviewed_at desc, receipt.job_id desc
    limit 1;

    v_scope_change_rate := v_scope_change_count::numeric / v_sample_size;
    if v_scope_change_rate >= 0.4 and v_latest.complexity = 'small' then
      v_suggestion := jsonb_build_object(
        'kind', 'raise_complexity_prior',
        'from', 'small',
        'to', 'medium',
        'rationale', format(
          'scope_change_rate=%s (n=%s)',
          to_char(v_scope_change_rate, 'FM0.00'),
          v_sample_size
        )
      );
    elsif v_scope_change_rate >= 0.4 and v_latest.complexity = 'medium' then
      v_suggestion := jsonb_build_object(
        'kind', 'raise_complexity_prior',
        'from', 'medium',
        'to', 'large',
        'rationale', format(
          'scope_change_rate=%s (n=%s)',
          to_char(v_scope_change_rate, 'FM0.00'),
          v_sample_size
        )
      );
    else
      v_suggestion := null;
    end if;

    if v_suggestion is null then
      v_prior_suggestion := v_candidate.suggested_payload->'suggested';
      if jsonb_typeof(v_prior_suggestion) is distinct from 'object' then
        v_prior_suggestion := jsonb_build_object(
          'kind', 'raise_complexity_prior',
          'from', 'small',
          'to', 'medium',
          'rationale', 'placeholder — no clear pattern yet'
        );
      end if;
      v_suggestion := v_prior_suggestion;
      v_confidence := 0;
      v_status := 'created'::public.learning_candidate_status;
    else
      v_confidence := least(0.95, 0.5 + v_scope_change_rate - 0.4);
      v_status := case
        when v_sample_size >= 5 then 'pending_evidence'::public.learning_candidate_status
        else 'created'::public.learning_candidate_status
      end;
    end if;

    v_payload := jsonb_build_object(
      'candidate_type', 'analysis_rule',
      'scope', jsonb_build_object(
        'service_type', p_affected_service::text,
        'problem_slug', p_affected_problem,
        'district_code', p_affected_district
      ),
      'observed', jsonb_build_object(
        'sample_size', v_sample_size,
        'scope_change_rate', v_scope_change_rate,
        'avg_rating', v_avg_rating,
        'common_tags', v_common_tags
      ),
      'suggested', v_suggestion
    );
  end if;

  update public.learning_candidates as candidate
  set
    suggested_payload = v_payload,
    evidence_count = v_sample_size,
    confidence = v_confidence,
    status = v_status,
    audit_reason = case
      when v_is_new then 'initial unique observation from job ' || p_job_id::text
      else 'appended unique observation from job ' || p_job_id::text
    end
  where candidate.id = v_candidate.id
  returning * into v_candidate;

  return query
    select true, null::text, v_candidate.id, v_is_new, v_candidate.confidence,
      v_candidate.evidence_count, v_candidate.status::text, false;
end;
$func$;

revoke execute on function public.record_learning_observation_atomic(
  uuid, text, public.service_type, text, text, public.complexity_level,
  numeric, numeric, numeric, integer, text[], boolean, timestamptz
) from public;
revoke execute on function public.record_learning_observation_atomic(
  uuid, text, public.service_type, text, text, public.complexity_level,
  numeric, numeric, numeric, integer, text[], boolean, timestamptz
) from anon;
revoke execute on function public.record_learning_observation_atomic(
  uuid, text, public.service_type, text, text, public.complexity_level,
  numeric, numeric, numeric, integer, text[], boolean, timestamptz
) from authenticated;
grant execute on function public.record_learning_observation_atomic(
  uuid, text, public.service_type, text, text, public.complexity_level,
  numeric, numeric, numeric, integer, text[], boolean, timestamptz
) to service_role;

comment on function public.record_learning_observation_atomic(
  uuid, text, public.service_type, text, text, public.complexity_level,
  numeric, numeric, numeric, integer, text[], boolean, timestamptz
) is 'Records one reviewed-job learning observation exactly once and updates its pending candidate atomically.';

-- Rollback: drop the RPC, pending-scope index, receipt table, and private seed table.
