begin;

do $migration$
declare
  v_definition text;
  v_rewritten text;
begin
  select pg_get_functiondef(
    'public.recognize_customer_payment_claim(uuid,uuid)'::regprocedure
  ) into strict v_definition;
  v_rewritten := replace(
    v_definition,
    'update public.jobs',
    'update public.jobs as job_target'
  );
  if v_rewritten = v_definition then
    raise exception using errcode = '55000', message = 'PAYMENT_CLAIM_JOB_TARGET_FIX_SOURCE_DRIFT';
  end if;
  v_definition := v_rewritten;
  v_rewritten := replace(
    v_definition,
    'where id = v_job.id',
    'where job_target.id = v_job.id'
  );
  if v_rewritten = v_definition then
    raise exception using errcode = '55000', message = 'PAYMENT_CLAIM_JOB_ID_FIX_SOURCE_DRIFT';
  end if;
  v_definition := v_rewritten;
  v_rewritten := replace(
    v_definition,
    $old$and status = 'payment_pending'::public.job_status;$old$,
    $new$and job_target.status = 'payment_pending'::public.job_status;$new$
  );
  if v_rewritten = v_definition then
    raise exception using errcode = '55000', message = 'PAYMENT_CLAIM_JOB_STATUS_FIX_SOURCE_DRIFT';
  end if;
  execute v_rewritten;

  select pg_get_functiondef(
    'public.confirm_kael_chat_durable_atomic(uuid,uuid,text,text,text)'::regprocedure
  ) into strict v_definition;
  v_rewritten := replace(
    v_definition,
    $old$on conflict (job_id) where state in ('queued', 'broadcasting', 'candidate_ready', 'recovery_required')
    do nothing$old$,
    $new$on conflict do nothing$new$
  );
  if v_rewritten = v_definition then
    raise exception using errcode = '55000', message = 'STAGE1_MATCHING_OPERATION_CONFLICT_FIX_SOURCE_DRIFT';
  end if;
  execute v_rewritten;

  select pg_get_functiondef(
    'public.activate_job_broadcast_batch_durable_atomic(uuid,uuid[],uuid,timestamptz,timestamptz)'::regprocedure
  ) into strict v_definition;
  v_rewritten := replace(
    v_definition,
    'insert into public.matching_recipient_deliveries(',
    'insert into public.matching_recipient_deliveries as recipient_delivery('
  );
  if v_rewritten = v_definition then
    raise exception using errcode = '55000', message = 'STAGE1_RECIPIENT_DELIVERY_TARGET_FIX_SOURCE_DRIFT';
  end if;
  v_definition := v_rewritten;
  v_rewritten := replace(
    v_definition,
    'returning id, broadcast_id, worker_id',
    'returning recipient_delivery.id, recipient_delivery.broadcast_id, recipient_delivery.worker_id'
  );
  if v_rewritten = v_definition then
    raise exception using errcode = '55000', message = 'STAGE1_RECIPIENT_DELIVERY_RETURNING_FIX_SOURCE_DRIFT';
  end if;
  execute v_rewritten;
end
$migration$;

commit;
