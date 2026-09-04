begin;

do $migration$
declare
  v_definition text;
  v_rewritten text;
begin
  select pg_get_functiondef(
    'public.attest_stage1_source_deployment(text,text,text,text,integer,text,text,text,boolean,boolean,text,text,text)'::regprocedure
  ) into strict v_definition;
  v_rewritten := replace(
    v_definition,
    $old$) on conflict (deployment_id) do nothing;$old$,
    $new$) on conflict on constraint stage1_source_deployment_attestations_pkey do nothing;$new$
  );
  if v_rewritten = v_definition then
    raise exception using errcode = '55000', message = 'STAGE1_ATTESTATION_FIX_SOURCE_DRIFT';
  end if;
  execute v_rewritten;

  select pg_get_functiondef(
    'public.confirm_kael_chat_durable_atomic(uuid,uuid,text,text,text)'::regprocedure
  ) into strict v_definition;
  v_rewritten := replace(
    v_definition,
    $old$from public.confirmation_operation_receipts
      where operation_id = v_operation.id;$old$,
    $new$from public.confirmation_operation_receipts as operation_receipt
      where operation_receipt.operation_id = v_operation.id;$new$
  );
  if v_rewritten = v_definition then
    raise exception using errcode = '55000', message = 'STAGE1_CONFIRM_RECEIPT_FIX_SOURCE_DRIFT';
  end if;
  execute v_rewritten;

  select pg_get_functiondef(
    'public.activate_job_broadcast_batch_durable_atomic(uuid,uuid[],uuid,timestamptz,timestamptz)'::regprocedure
  ) into strict v_definition;
  v_rewritten := replace(
    v_definition,
    $old$select * into strict v_job from public.jobs where id = p_job_id for update;$old$,
    $new$select job.* into strict v_job from public.jobs as job where job.id = p_job_id for update;$new$
  );
  if v_rewritten = v_definition then
    raise exception using errcode = '55000', message = 'STAGE1_BROADCAST_JOB_FIX_SOURCE_DRIFT';
  end if;
  execute v_rewritten;

  select pg_get_functiondef(
    'public.confirm_worker_matching_proposal_atomic(uuid,uuid,uuid)'::regprocedure
  ) into strict v_definition;
  v_rewritten := replace(
    v_definition,
    $old$from public.worker_matching_proposals
    where candidate_id = p_candidate_id for update;$old$,
    $new$from public.worker_matching_proposals as proposal
    where proposal.candidate_id = p_candidate_id for update;$new$
  );
  if v_rewritten = v_definition then
    raise exception using errcode = '55000', message = 'STAGE1_PROPOSAL_CANDIDATE_FIX_SOURCE_DRIFT';
  end if;
  execute v_rewritten;

  select pg_get_functiondef(
    'public.recognize_customer_payment_claim(uuid,uuid)'::regprocedure
  ) into strict v_definition;
  v_rewritten := replace(
    v_definition,
    'update public.worker_payment_ledger',
    'update public.worker_payment_ledger as worker_ledger'
  );
  if v_rewritten = v_definition then
    raise exception using errcode = '55000', message = 'PAYMENT_CLAIM_LEDGER_TARGET_FIX_SOURCE_DRIFT';
  end if;
  v_definition := v_rewritten;
  v_rewritten := replace(
    v_definition,
    'where job_id = v_job.id;',
    'where worker_ledger.job_id = v_job.id;'
  );
  if v_rewritten = v_definition then
    raise exception using errcode = '55000', message = 'PAYMENT_CLAIM_LEDGER_KEY_FIX_SOURCE_DRIFT';
  end if;
  execute v_rewritten;

  select pg_get_functiondef(
    'public.acknowledge_worker_cash_payment(uuid,uuid,boolean)'::regprocedure
  ) into strict v_definition;
  v_rewritten := replace(
    v_definition,
    'update public.jobs',
    'update public.jobs as job_target'
  );
  if v_rewritten = v_definition then
    raise exception using errcode = '55000', message = 'WORKER_CASH_JOB_TARGET_FIX_SOURCE_DRIFT';
  end if;
  v_definition := v_rewritten;
  v_rewritten := replace(
    v_definition,
    'where id = v_job.id',
    'where job_target.id = v_job.id'
  );
  if v_rewritten = v_definition then
    raise exception using errcode = '55000', message = 'WORKER_CASH_JOB_KEY_FIX_SOURCE_DRIFT';
  end if;
  v_definition := v_rewritten;
  v_rewritten := replace(
    v_definition,
    $old$and status = 'payment_pending'::public.job_status;$old$,
    $new$and job_target.status = 'payment_pending'::public.job_status;$new$
  );
  if v_rewritten = v_definition then
    raise exception using errcode = '55000', message = 'WORKER_CASH_JOB_STATUS_FIX_SOURCE_DRIFT';
  end if;
  execute v_rewritten;

  select pg_get_functiondef(
    'public.decide_cash_payment_reconciliation(uuid,uuid,text,text)'::regprocedure
  ) into strict v_definition;
  v_rewritten := replace(
    v_definition,
    'update public.worker_direct_payment_collateral_reservations',
    'update public.worker_direct_payment_collateral_reservations as reservation_target'
  );
  if v_rewritten = v_definition then
    raise exception using errcode = '55000', message = 'CASH_RECONCILIATION_RESERVATION_TARGET_FIX_SOURCE_DRIFT';
  end if;
  v_definition := v_rewritten;
  v_rewritten := replace(
    v_definition,
    $old$where id = v_reservation.id and status = 'held';$old$,
    $new$where reservation_target.id = v_reservation.id and reservation_target.status = 'held';$new$
  );
  if v_rewritten = v_definition then
    raise exception using errcode = '55000', message = 'CASH_RECONCILIATION_RESERVATION_STATUS_FIX_SOURCE_DRIFT';
  end if;
  v_definition := v_rewritten;
  v_rewritten := replace(
    v_definition,
    'update public.worker_payment_ledger',
    'update public.worker_payment_ledger as worker_ledger'
  );
  if v_rewritten = v_definition then
    raise exception using errcode = '55000', message = 'CASH_RECONCILIATION_LEDGER_TARGET_FIX_SOURCE_DRIFT';
  end if;
  v_definition := v_rewritten;
  v_rewritten := replace(
    v_definition,
    'where job_id = v_job.id;',
    'where worker_ledger.job_id = v_job.id;'
  );
  if v_rewritten = v_definition then
    raise exception using errcode = '55000', message = 'CASH_RECONCILIATION_LEDGER_JOB_FIX_SOURCE_DRIFT';
  end if;
  v_definition := v_rewritten;
  v_rewritten := replace(
    v_definition,
    'where id = v_ledger.id;',
    'where worker_ledger.id = v_ledger.id;'
  );
  if v_rewritten = v_definition then
    raise exception using errcode = '55000', message = 'CASH_RECONCILIATION_LEDGER_ID_FIX_SOURCE_DRIFT';
  end if;
  v_definition := v_rewritten;
  v_rewritten := replace(
    v_definition,
    'update public.jobs',
    'update public.jobs as job_target'
  );
  if v_rewritten = v_definition then
    raise exception using errcode = '55000', message = 'CASH_RECONCILIATION_JOB_TARGET_FIX_SOURCE_DRIFT';
  end if;
  v_definition := v_rewritten;
  v_rewritten := replace(
    v_definition,
    'where id = v_job.id;',
    'where job_target.id = v_job.id;'
  );
  if v_rewritten = v_definition then
    raise exception using errcode = '55000', message = 'CASH_RECONCILIATION_JOB_ID_FIX_SOURCE_DRIFT';
  end if;
  v_definition := v_rewritten;
  v_rewritten := replace(
    v_definition,
    ') on conflict (job_id) do nothing;',
    ') on conflict on constraint worker_cash_commission_ledger_job_id_key do nothing;'
  );
  if v_rewritten = v_definition then
    raise exception using errcode = '55000', message = 'CASH_RECONCILIATION_CONFLICT_FIX_SOURCE_DRIFT';
  end if;
  execute v_rewritten;
end
$migration$;

commit;
