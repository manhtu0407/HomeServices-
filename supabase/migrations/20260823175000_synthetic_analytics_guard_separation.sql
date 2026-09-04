begin;

do $view_guard$
declare
  v_view regclass;
begin
  foreach v_view in array array[
    'public.kael_estimate_accuracy'::regclass,
    'public.kael_cost_daily_summary'::regclass,
    'public.kael_cost_projection_daily'::regclass,
    'public.kael_monitoring_provider_daily'::regclass
  ] loop
    if position(
      'synthetic_cohort_id is null' in lower(pg_get_viewdef(v_view, true))
    ) = 0 then
      raise exception using errcode = '55000',
        message = 'SYNTHETIC_ANALYTICS_VIEW_GUARD_MISSING',
        detail = v_view::text;
    end if;
  end loop;
end
$view_guard$;

do $migration$
declare
  v_definition text;
  v_rewritten text;
begin
  select pg_get_functiondef(
    'public.verify_synthetic_matching_cohort_isolation(text)'::regprocedure
  ) into strict v_definition;
  v_rewritten := replace(
    v_definition,
    $old$
    + case when position('synthetic_cohort_id is null' in lower(
        pg_get_viewdef('public.kael_estimate_accuracy'::regclass, true))) = 0 then 1 else 0 end
    + case when position('synthetic_cohort_id is null' in lower(
        pg_get_viewdef('public.kael_cost_daily_summary'::regclass, true))) = 0 then 1 else 0 end
    + case when position('synthetic_cohort_id is null' in lower(
        pg_get_viewdef('public.kael_cost_projection_daily'::regclass, true))) = 0 then 1 else 0 end
    + case when position('synthetic_cohort_id is null' in lower(
        pg_get_viewdef('public.kael_monitoring_provider_daily'::regclass, true))) = 0 then 1 else 0 end$old$,
    ''
  );
  if v_rewritten = v_definition then
    raise exception using errcode = '55000', message = 'SYNTHETIC_ISOLATION_VERIFIER_SOURCE_DRIFT';
  end if;
  execute v_rewritten;
end
$migration$;

comment on function public.verify_synthetic_matching_cohort_isolation(text) is
  'Returns aggregate-only dynamic Production smoke isolation evidence. Analytics view predicates are validated at migration time and by SQL verification.';

commit;
