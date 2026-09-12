begin;

-- The ledger inherits isolation through its job; it does not own a cohort column.
do $repair$
declare
  v_definition text := pg_get_functiondef('public.admin_finance_overview(uuid,timestamptz,timestamptz,text)'::regprocedure);
  v_old text := 'ledger.synthetic_cohort_id is null';
  v_new text := 'private.synthetic_job_cohort(ledger.job_id) is null';
begin
  if position(v_old in v_definition) > 0 then
    execute replace(v_definition, v_old, v_new);
  elsif position(v_new in v_definition) = 0 then
    raise exception 'FINANCE_LEDGER_SOURCE_DRIFT';
  end if;
end;
$repair$;
commit;
