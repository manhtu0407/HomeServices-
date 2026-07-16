begin;

do $test$
declare
  v_batch_id uuid;
  v_claim_count integer;
  v_status text;
begin
  insert into public.kael_ai_batches (
    provider,
    provider_batch_id,
    status,
    request_count,
    next_poll_at
  ) values (
    'anthropic',
    'msgbatch_atomic_claim_verification',
    'ended',
    1,
    '2026-07-15T00:00:00Z'
  ) returning id into v_batch_id;

  insert into public.kael_ai_batch_items (
    batch_id,
    custom_id,
    skill_id,
    status
  ) values (
    v_batch_id,
    'atomic_claim_verification',
    'LS1',
    'pending'
  );

  select count(*)::integer
  into v_claim_count
  from public.claim_kael_ai_batch_results(
    1,
    '2026-07-15T00:01:00Z',
    false,
    1800,
    '11111111-1111-4111-8111-111111111111'
  ) as claimed
  where claimed.id = v_batch_id;

  if v_claim_count <> 1 then
    raise exception 'first poller did not claim the due batch';
  end if;

  select count(*)::integer
  into v_claim_count
  from public.claim_kael_ai_batch_results(
    1,
    '2026-07-15T00:01:01Z',
    false,
    1800,
    '22222222-2222-4222-8222-222222222222'
  ) as claimed
  where claimed.id = v_batch_id;

  if v_claim_count <> 0 then
    raise exception 'active batch-result lease was claimed twice';
  end if;

  select count(*)::integer
  into v_claim_count
  from public.claim_kael_ai_batch_results(
    1,
    '2026-07-15T00:32:00Z',
    false,
    1800,
    '22222222-2222-4222-8222-222222222222'
  ) as claimed
  where claimed.id = v_batch_id;

  if v_claim_count <> 1 then
    raise exception 'stale batch-result lease was not recovered';
  end if;

  begin
    perform public.record_kael_ai_batch_poll(
      v_batch_id,
      '11111111-1111-4111-8111-111111111111',
      'in_progress',
      1,
      0,
      0,
      0,
      0,
      null,
      null,
      null,
      '2026-07-15T01:32:00Z'
    );
    raise exception 'stale poller rewrote provider batch status after losing ownership';
  exception
    when others then
      if sqlerrm <> 'BATCH_CLAIM_LOST' then
        raise;
      end if;
  end;

  begin
    perform public.complete_kael_ai_batch_results_claim(
      v_batch_id,
      '11111111-1111-4111-8111-111111111111'
    );
    raise exception 'stale poller finalized a batch after losing ownership';
  exception
    when others then
      if sqlerrm <> 'BATCH_CLAIM_LOST' then
        raise;
      end if;
  end;

  begin
    perform public.complete_kael_ai_batch_results_claim(
      v_batch_id,
      '22222222-2222-4222-8222-222222222222'
    );
    raise exception 'batch finalized while an item was still pending';
  exception
    when others then
      if sqlerrm <> 'BATCH_ITEMS_INCOMPLETE' then
        raise;
      end if;
  end;

  perform public.renew_kael_ai_batch_results_claim(
    v_batch_id,
    '22222222-2222-4222-8222-222222222222',
    '2026-07-15T00:33:00Z'
  );

  perform public.commit_kael_ai_batch_item_result(
    v_batch_id,
    (
      select id
      from public.kael_ai_batch_items
      where batch_id = v_batch_id
    ),
    null,
    '22222222-2222-4222-8222-222222222222',
    'errored',
    '{}'::jsonb,
    '{"type":"verification"}'::jsonb,
    null,
    null,
    '2026-07-15T00:33:00Z'
  );

  -- An exact RPC retry is safe, but conflicting terminal data must not be hidden.
  perform public.commit_kael_ai_batch_item_result(
    v_batch_id,
    (
      select id
      from public.kael_ai_batch_items
      where batch_id = v_batch_id
    ),
    null,
    '22222222-2222-4222-8222-222222222222',
    'errored',
    '{}'::jsonb,
    '{"type":"verification"}'::jsonb,
    null,
    null,
    '2026-07-15T00:33:00Z'
  );

  begin
    perform public.commit_kael_ai_batch_item_result(
      v_batch_id,
      (
        select id
        from public.kael_ai_batch_items
        where batch_id = v_batch_id
      ),
      null,
      '22222222-2222-4222-8222-222222222222',
      'errored',
      '{}'::jsonb,
      '{"type":"conflicting_retry"}'::jsonb,
      null,
      null,
      '2026-07-15T00:33:00Z'
    );
    raise exception 'conflicting terminal batch-item retry was accepted';
  exception
    when others then
      if sqlerrm <> 'BATCH_ITEM_ALREADY_COMMITTED' then
        raise;
      end if;
  end;

  perform public.complete_kael_ai_batch_results_claim(
    v_batch_id,
    '22222222-2222-4222-8222-222222222222'
  );

  select status
  into v_status
  from public.kael_ai_batches
  where id = v_batch_id;

  if v_status <> 'results_processed' then
    raise exception 'owned complete batch was not finalized';
  end if;

  if exists (
    select 1
    from private.kael_ai_batch_result_claims
    where batch_id = v_batch_id
  ) then
    raise exception 'completed batch retained its claim';
  end if;

  if has_function_privilege(
    'anon',
    'public.claim_kael_ai_batch_results(integer,timestamptz,boolean,integer,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.claim_kael_ai_batch_results(integer,timestamptz,boolean,integer,uuid)',
    'EXECUTE'
  ) then
    raise exception 'non-service actor can claim learning batch results';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.claim_kael_ai_batch_results(integer,timestamptz,boolean,integer,uuid)',
    'EXECUTE'
  ) then
    raise exception 'service role cannot claim learning batch results';
  end if;
end;
$test$;

rollback;
