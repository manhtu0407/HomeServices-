-- Rollback-only verification for bilateral commission terms across payment paths.
begin;

do $$
declare
  v_definition text;
  v_job record;
  v_terms record;
begin
  foreach v_definition in array array[
    pg_get_functiondef(
      'public.create_manual_bank_payment_order(uuid,uuid,integer,text,text,text,timestamptz)'::regprocedure
    ),
    pg_get_functiondef(
      'public.create_worker_vietqr_payment_intent(uuid,uuid,integer,text,text,text,timestamptz)'::regprocedure
    ),
    pg_get_functiondef(
      'public.confirm_worker_cash_payment(uuid,uuid)'::regprocedure
    )
  ] loop
    if position('private.resolve_job_commission_terms' in v_definition) = 0 then
      raise exception 'payment path bypasses bilateral commission terms';
    end if;
  end loop;

  select job.id, job.worker_id, job.worker_commission_level,
      job.worker_commission_rate_bps
  into v_job
  from public.jobs as job
  where job.worker_id is not null
    and job.final_price > 0
    and job.worker_commission_level is not null
    and job.worker_commission_rate_bps is not null
  order by job.created_at desc
  limit 1;

  if found then
    select * into v_terms
    from private.resolve_job_commission_terms(v_job.id, v_job.worker_id);
    if not found
      or v_terms.commission_level is distinct from v_job.worker_commission_level
      or v_terms.commission_rate_bps is distinct from v_job.worker_commission_rate_bps
    then
      raise exception 'frozen terms drifted';
    end if;

    update public.jobs as job
    set worker_commission_level = null,
        worker_commission_rate_bps = null
    where job.id = v_job.id;

    select * into v_terms
    from private.resolve_job_commission_terms(v_job.id, v_job.worker_id);
    if not found
      or v_terms.commission_level is null
      or v_terms.commission_rate_bps is null
    then
      raise exception 'legacy fallback failed';
    end if;
  end if;
end;
$$;

rollback;
