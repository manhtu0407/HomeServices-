begin;

do $migration$
declare
  v_definition text;
  v_rewritten text;
begin
  select pg_get_functiondef(
    'public.activate_job_broadcast_batch_durable_atomic(uuid,uuid[],uuid,timestamptz,timestamptz)'::regprocedure
  ) into strict v_definition;
  v_rewritten := replace(
    v_definition,
    'update public.matching_operations',
    'update public.matching_operations as matching_operation'
  );
  if v_rewritten = v_definition then
    raise exception using errcode = '55000', message = 'STAGE1_MATCHING_UPDATE_TARGET_FIX_SOURCE_DRIFT';
  end if;
  v_definition := v_rewritten;
  v_rewritten := replace(
    v_definition,
    'where id = v_matching.id;',
    'where matching_operation.id = v_matching.id;'
  );
  if v_rewritten = v_definition then
    raise exception using errcode = '55000', message = 'STAGE1_MATCHING_UPDATE_ID_FIX_SOURCE_DRIFT';
  end if;
  v_definition := v_rewritten;
  v_rewritten := replace(
    v_definition,
    'update public.confirmation_operations',
    'update public.confirmation_operations as confirmation_operation'
  );
  if v_rewritten = v_definition then
    raise exception using errcode = '55000', message = 'STAGE1_CONFIRMATION_UPDATE_TARGET_FIX_SOURCE_DRIFT';
  end if;
  v_definition := v_rewritten;
  v_rewritten := replace(
    v_definition,
    'where id = v_matching.confirmation_operation_id;',
    'where confirmation_operation.id = v_matching.confirmation_operation_id;'
  );
  if v_rewritten = v_definition then
    raise exception using errcode = '55000', message = 'STAGE1_CONFIRMATION_UPDATE_ID_FIX_SOURCE_DRIFT';
  end if;
  execute v_rewritten;
end
$migration$;

commit;
