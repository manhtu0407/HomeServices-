begin;

create or replace function private.is_real_finance_transaction(p_job public.jobs)
returns boolean language sql stable set search_path = '' as $function$
  select p_job.paid_at is not null
    and p_job.status in ('paid', 'reviewed', 'cancelled')
    and p_job.synthetic_cohort_id is null
    and p_job.payment_provider is distinct from 'staging_simulator'
    and private.synthetic_profile_cohort(p_job.customer_id) is null
    and private.synthetic_profile_cohort(p_job.worker_id) is null
$function$;
revoke all on function private.is_real_finance_transaction(public.jobs) from public, anon, authenticated;
grant execute on function private.is_real_finance_transaction(public.jobs) to service_role;

-- Preserve the deployed functions, grants, pagination and audit behavior; refuse unknown source drift.
do $reporting$
declare
  v_signature text;
  v_definition text;
  v_before text := 'job.status in (''paid''::public.job_status, ''reviewed''::public.job_status)';
  v_after text := 'private.is_real_finance_transaction(job)';
  v_count integer;
  v_expected integer;
begin
  foreach v_signature in array array[
    'private.admin_finance_period_snapshot(timestamptz,timestamptz,public.service_type)',
    'public.admin_finance_overview(uuid,timestamptz,timestamptz,text)',
    'public.admin_finance_transactions_page(uuid,timestamptz,timestamptz,integer,timestamptz,uuid,text,public.service_type,text)',
    'public.admin_finance_export_rows(uuid,timestamptz,timestamptz,integer,text,public.service_type,text)',
    'public.admin_finance_transaction_detail(uuid,uuid)'
  ] loop
    v_definition := pg_get_functiondef(v_signature::regprocedure);
    v_expected := case when v_signature like 'private.%' then 3
      when v_signature like 'public.admin_finance_overview(%' then 2 else 1 end;
    v_count := (length(v_definition) - length(replace(v_definition, v_before, ''))) / length(v_before);
    if v_count = 0 and position(v_after in v_definition) > 0 then
      continue;
    end if;
    if v_count <> v_expected then
      raise exception 'FINANCE_SOURCE_DRIFT: % expected % predicates, found %', v_signature, v_expected, v_count;
    end if;
    v_definition := replace(v_definition, v_before, v_after);
    if v_signature like 'public.admin_finance_transactions_page(%'
      or v_signature like 'public.admin_finance_export_rows(%' then
      if position('p_status not in (''paid'', ''reviewed'')' in v_definition) = 0 then
        raise exception 'FINANCE_FILTER_DRIFT: %', v_signature;
      end if;
      v_definition := replace(v_definition, 'p_status not in (''paid'', ''reviewed'')',
        'p_status not in (''paid'', ''reviewed'', ''cancelled'')');
    end if;
    if v_signature like 'private.%' then
      v_definition := replace(v_definition, 'where cash_ledger.confirmed_at >= p_from',
        'where private.is_real_finance_transaction(job) and cash_ledger.confirmed_at >= p_from');
      v_definition := replace(v_definition, 'where adjustment.realization_status = ''completed''',
        'where private.is_real_finance_transaction(job) and adjustment.realization_status = ''completed''');
      v_definition := replace(v_definition, 'where request.status = ''paid''',
        'where request.synthetic_cohort_id is null and private.synthetic_profile_cohort(request.worker_id) is null and request.status = ''paid''');
    end if;
    if v_signature like 'public.admin_finance_overview(%' then
      v_definition := replace(v_definition, 'from public.worker_payment_ledger as ledger;',
        'from public.worker_payment_ledger as ledger where ledger.synthetic_cohort_id is null and private.synthetic_profile_cohort(ledger.worker_id) is null;');
      v_definition := replace(v_definition, 'from worker_ids as worker',
        'from worker_ids as worker where private.synthetic_profile_cohort(worker.worker_id) is null');
      v_definition := replace(v_definition, 'from public.worker_withdrawal_requests as request;',
        'from public.worker_withdrawal_requests as request where request.synthetic_cohort_id is null and private.synthetic_profile_cohort(request.worker_id) is null;');
    end if;
    execute v_definition;
  end loop;
end;
$reporting$;

comment on function private.is_real_finance_transaction(public.jobs) is
  'Reporting eligibility preserves received payment history after cancellation, without counting a pending refund as outgoing cash or admitting synthetic actors.';
commit;
