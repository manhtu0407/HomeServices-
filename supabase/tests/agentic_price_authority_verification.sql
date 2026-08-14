-- Rollback-only runtime verification for evidence-backed estimates and bilateral final prices.
begin;

set constraints guard_bilateral_final_price_lock immediate;

do $verification$
declare
  v_matching record;
begin
  if not exists (
    select 1
    from public.price_baselines as baseline
    join public.service_problems as problem on problem.id = baseline.service_problem_id
    where problem.service_type = 'handyman'::public.service_type
      and problem.slug = 'replace_cabinet_hinges'
      and baseline.complexity = 'small'::public.complexity_level
      and baseline.district_code = 'hcmc_all'
      and baseline.price_min = 140000
      and baseline.price_max = 375000
      and baseline.price_evidence ->> 'schema_version' = 'baseline_price_evidence.v1'
      and jsonb_array_length(baseline.price_evidence -> 'sources') = 2
      and not exists (
        select 1
        from jsonb_array_elements(baseline.price_evidence -> 'sources') as source(value)
        where source.value ->> 'unit' <> 'per_cabinet_door'
          or nullif(source.value #>> '{verification,ledger_ref}', '') is null
          or source.value #>> '{verification,price_snapshot_sha256}' !~ '^[A-F0-9]{64}$'
      )
  ) then
    raise exception 'cabinet-hinge baseline lost its verified two-source range';
  end if;

  if not exists (
    select 1
    from public.price_baselines as baseline
    join public.service_problems as problem on problem.id = baseline.service_problem_id
    where problem.service_type = 'plumbing'::public.service_type
      and problem.slug = 'weak_water_pressure'
      and baseline.complexity = 'medium'::public.complexity_level
      and baseline.district_code = 'hcmc_all'
      and baseline.price_min = 700000
      and baseline.price_max = 1200000
      and jsonb_array_length(baseline.price_evidence -> 'sources') = 3
      and not exists (
        select 1
        from jsonb_array_elements(baseline.price_evidence -> 'sources') as source(value)
        where source.value ->> 'unit' <> 'per_visit'
      )
  ) then
    raise exception 'water-pressure baseline lost its verified three-source range';
  end if;

  if not exists (
    select 1
    from public.price_baselines as baseline
    join public.service_problems as problem on problem.id = baseline.service_problem_id
    where problem.service_type = 'plumbing'::public.service_type
      and problem.slug = 'pipe_leak'
      and baseline.complexity = 'medium'::public.complexity_level
      and baseline.district_code = 'hcmc_all'
      and baseline.price_min = 150000
      and baseline.price_max = 375000
      and jsonb_array_length(baseline.price_evidence -> 'sources') = 2
      and not exists (
        select 1
        from jsonb_array_elements(baseline.price_evidence -> 'sources') as source(value)
        where source.value ->> 'unit' <> 'per_repair_point'
      )
  ) then
    raise exception 'pipe-leak baseline lost its verified per-point range';
  end if;

  begin
    update public.price_baselines as baseline
      set price_evidence = '{}'::jsonb
      where baseline.id = (
        select candidate.id
        from public.price_baselines as candidate
        limit 1
      );
    raise exception 'invalid baseline evidence shape was accepted';
  exception
    when check_violation then
      null;
  end;

  delete from public.job_matching_preferences
  where job_id = '00000000-0000-0000-0000-000000000011';

  update public.jobs
    set status = 'awaiting_customer_confirm'::public.job_status,
        kael_price_min = 150000,
        kael_price_max = 250000,
        final_price = null
    where id = '00000000-0000-0000-0000-000000000011';

  select * into v_matching
  from public.begin_job_matching_preference_atomic(
    '00000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000000001',
    250000,
    '{"summary":"verified test brief"}'::jsonb
  );

  if v_matching.ok is not true
    or (
      select job.final_price
      from public.jobs as job
      where job.id = '00000000-0000-0000-0000-000000000011'
    ) is not null
  then
    raise exception 'matching promoted the estimate ceiling to final price';
  end if;

  begin
    update public.jobs
      set final_price = 200000
      where id = '00000000-0000-0000-0000-000000000011';
    raise exception 'direct final price without bilateral approval was accepted';
  exception
    when check_violation then
      if sqlerrm <> 'final price requires bilateral verified approval' then
        raise;
      end if;
  end;

  insert into public.scope_change_requests (
    id, job_id, worker_id, status,
    original_summary, requested_description, reason,
    price_min, price_max, kael_computed_min, kael_computed_max,
    kael_review, customer_decision_at
  ) values (
    'a1310000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000000002',
    'approved_by_customer',
    'Original diagnostic scope.',
    'Replace one verified damaged repair point.',
    'Field evidence confirmed replacement is required.',
    200000,
    200000,
    200000,
    200000,
    jsonb_build_object(
      'price_source', 'verified_baseline',
      'pricing_mode', 'full_scope_total',
      'selection_rule', 'verified_neutral_midpoint_with_bilateral_confirmation',
      'baseline_used', 'pipe_leak_medium_hcmc_all',
      'baseline_source', 'multi_source_hcmc_hidden_pipe_repair_point_2026_08',
      'reference_price_min', 150000,
      'reference_price_max', 375000,
      'stakeholder_balance', jsonb_build_object(
        'customer_total', 200000,
        'platform_fee', 20000,
        'worker_net', 180000,
        'commission_rate_bps', 1000,
        'worker_confirmation_required', true,
        'customer_confirmation_required', true
      ),
      'worker_price_confirmation', jsonb_build_object(
        'confirmed', true,
        'quote_id', 'a1320000-0000-4000-8000-000000000001',
        'confirmed_at', '2026-08-14T01:00:00Z'
      )
    ),
    '2026-08-14T01:05:00Z'::timestamptz
  );

  update public.jobs
    set final_price = 200000
    where id = '00000000-0000-0000-0000-000000000011';

  if (
    select job.final_price
    from public.jobs as job
    where job.id = '00000000-0000-0000-0000-000000000011'
  ) is distinct from 200000 then
    raise exception 'bilaterally approved exact price was not accepted';
  end if;

  insert into public.scope_change_requests (
    id, job_id, worker_id, status,
    requested_description, reason, price_min, price_max
  ) values (
    'a1310000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000011',
    '00000000-0000-0000-0000-000000000002',
    'requested_by_worker',
    'Unverified direct proposal.',
    'Missing verified receipt.',
    220000,
    220000
  );

  begin
    update public.scope_change_requests
      set status = 'approved_by_customer'::public.scope_change_status
      where id = 'a1310000-0000-4000-8000-000000000002';
    raise exception 'unverified scope proposal was approved';
  exception
    when check_violation then
      if sqlerrm <> 'scope change final price lacks verified case receipt' then
        raise;
      end if;
  end;

  if pg_catalog.has_function_privilege(
    'anon',
    'public.save_job_incident_scope_price_quote_atomic(uuid,uuid,uuid,integer,uuid,jsonb,timestamp with time zone)'::regprocedure,
    'execute'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.save_job_incident_scope_price_quote_atomic(uuid,uuid,uuid,integer,uuid,jsonb,timestamp with time zone)'::regprocedure,
    'execute'
  ) or not pg_catalog.has_function_privilege(
    'service_role',
    'public.save_job_incident_scope_price_quote_atomic(uuid,uuid,uuid,integer,uuid,jsonb,timestamp with time zone)'::regprocedure,
    'execute'
  ) then
    raise exception 'scope price quote mutation is not service-role only';
  end if;

  if pg_catalog.has_function_privilege(
    'anon',
    'public.claim_job_incident_scope_proposal_atomic(uuid,uuid,uuid,uuid)'::regprocedure,
    'execute'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.claim_job_incident_scope_proposal_atomic(uuid,uuid,uuid,uuid)'::regprocedure,
    'execute'
  ) or not pg_catalog.has_function_privilege(
    'service_role',
    'public.claim_job_incident_scope_proposal_atomic(uuid,uuid,uuid,uuid)'::regprocedure,
    'execute'
  ) then
    raise exception 'scope proposal claim is not service-role only';
  end if;
end;
$verification$;

select jsonb_build_object(
  'verified_price_baselines', true,
  'estimate_ceiling_not_payable', true,
  'bilateral_final_price_guarded', true,
  'scope_quote_rpcs_service_owned', true
) as agentic_price_authority_verification;

rollback;
