-- Committed-data concurrency proof for the platform_bank_manual rail. Runs against a disposable local database only:
-- it leaves its fixtures behind because payment reconciliation events are immutable.
\set ON_ERROR_STOP on

create extension if not exists dblink;

insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at) values
  ('d6920000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'bank-race-customer@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d6920000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'bank-race-worker@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d6920000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'bank-race-admin-one@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d6920000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'bank-race-admin-two@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now());
update public.profiles set role = 'worker' where id = 'd6920000-0000-4000-8000-000000000003';
update public.profiles set role = 'admin' where id in ('d6920000-0000-4000-8000-000000000004', 'd6920000-0000-4000-8000-000000000005');
insert into public.customer_profiles(id, building_name, unit_number, district)
values ('d6920000-0000-4000-8000-000000000001', 'Bank Race Building', 'D692-1', 'q7')
on conflict (id) do update set building_name = excluded.building_name;
insert into public.worker_profiles(id, service_types, selected_service_types, years_experience, districts, problem_specializations, is_approved, is_available, legal_name, date_of_birth, verification_status)
values ('d6920000-0000-4000-8000-000000000003', array['plumbing']::public.service_type[], array['plumbing']::public.service_type[], 5, array['q7'], array[]::text[], true, true, 'Bank Race Worker', '1990-01-01', 'approved');

do $fixtures$
declare
  v_index integer;
  v_job uuid;
begin
  for v_index in 1..6 loop
    v_job := ('d6920000-0000-4000-8000-0000000001' || lpad(v_index::text, 2, '0'))::uuid;
    insert into public.jobs(id, customer_id, worker_id, service_type, description, address_district, status, quote_mode, final_price, completion_notes, completion_photo_urls, worker_commission_level, worker_commission_rate_bps)
    values (v_job, 'd6920000-0000-4000-8000-000000000001', 'd6920000-0000-4000-8000-000000000003', 'plumbing', 'Bank race ' || v_index, 'q7', 'completed_by_worker', 'rfq', 300000, 'Đã hoàn tất.', array['supabase://job-media/' || v_job || '/after/photo-1.jpg'], 1, 1000);
    insert into public.job_rfq_price_proposals(id, job_id, worker_id, customer_id, quote_mode, scope_summary, customer_total, commission_level, commission_rate_bps, status, decided_at)
    values (gen_random_uuid(), v_job, 'd6920000-0000-4000-8000-000000000003', 'd6920000-0000-4000-8000-000000000001', 'rfq', 'Approved scope for the payment race fixture', 300000, 1, 1000, 'approved', now());
    insert into public.job_media_assets(job_id, owner_id, service_type, stage, bucket_id, object_path, mime_type)
    values (v_job, 'd6920000-0000-4000-8000-000000000003', 'plumbing', 'after', 'job-media', v_job || '/after/photo-1.jpg', 'image/jpeg');
  end loop;
end;
$fixtures$;

select dblink_connect('race_a', 'host=127.0.0.1 port=5432 dbname=postgres user=postgres');
select dblink_connect('race_b', 'host=127.0.0.1 port=5432 dbname=postgres user=postgres');

create temporary table race_results(race text, side text, payload jsonb, failure text);

create or replace function pg_temp.run_race(p_race text, p_first text, p_second text) returns void language plpgsql as $$
begin
  perform dblink_send_query('race_a', p_first);
  perform pg_sleep(0.5);
  perform dblink_send_query('race_b', p_second);
  begin
    insert into race_results select p_race, 'first', t.payload::jsonb, null from dblink_get_result('race_a') as t(payload text);
  exception when others then
    insert into race_results values (p_race, 'first', null, sqlstate || ' ' || sqlerrm);
  end;
  begin
    insert into race_results select p_race, 'second', t.payload::jsonb, null from dblink_get_result('race_b') as t(payload text);
  exception when others then
    insert into race_results values (p_race, 'second', null, sqlstate || ' ' || sqlerrm);
  end;
  perform dblink_get_result('race_a');
  perform dblink_get_result('race_b');
end;
$$;

-- Race 1: the Customer double-submits the same completion confirmation.
select pg_temp.run_race('completion',
  $q$ with r as materialized (select * from public.confirm_completion_manual_bank_atomic('d6920000-0000-4000-8000-000000000101', 'd6920000-0000-4000-8000-000000000001', 'completion-payment:d6920000-0000-4000-8000-000000000101:d6920000-0000-4000-8000-000000000001', 300000, 'NS000000000000000000000101', 'NS000000000000000000000101', 'https://vietqr.app/img?acc=1&bank=VCB&amount=300000&des=NS000000000000000000000101', now())),
          s as materialized (select pg_sleep(1.5) from r)
     select row_to_json(r)::text from r cross join s $q$,
  $q$ select row_to_json(r)::text from public.confirm_completion_manual_bank_atomic('d6920000-0000-4000-8000-000000000101', 'd6920000-0000-4000-8000-000000000001', 'completion-payment:d6920000-0000-4000-8000-000000000101:d6920000-0000-4000-8000-000000000001', 300000, 'NS000000000000000000000101', 'NS000000000000000000000101', 'https://vietqr.app/img?acc=1&bank=VCB&amount=300000&des=NS000000000000000000000101', now()) r $q$);

-- Fixtures for the remaining races, created by the same atomic completion function.
select count(*) from (
  select public.confirm_completion_manual_bank_atomic(
    ('d6920000-0000-4000-8000-0000000001' || lpad(i::text, 2, '0'))::uuid, 'd6920000-0000-4000-8000-000000000001',
    'completion-payment:' || ('d6920000-0000-4000-8000-0000000001' || lpad(i::text, 2, '0')) || ':d6920000-0000-4000-8000-000000000001', 300000, 'NS' || lpad((100 + i)::text, 24, '0'), 'NS' || lpad((100 + i)::text, 24, '0'),
    'https://vietqr.app/img?acc=1&bank=VCB&amount=300000&des=NS' || lpad((100 + i)::text, 24, '0'), now())
  from generate_series(2, 6) as i) as opened;

select count(*) from (
  select public.claim_manual_bank_payment(('d6920000-0000-4000-8000-0000000001' || lpad(i::text, 2, '0'))::uuid, 'd6920000-0000-4000-8000-000000000001', now() - interval '3 minutes', 'VCB')
  from generate_series(3, 6) as i) as claimed;

select count(*) from (
  select public.admin_claim_payment_reconciliation_atomic('d6920000-0000-4000-8000-000000000004', o.id, 1, gen_random_uuid(), null)
  from public.job_payment_orders o where o.job_id in (
    'd6920000-0000-4000-8000-000000000103', 'd6920000-0000-4000-8000-000000000104',
    'd6920000-0000-4000-8000-000000000105', 'd6920000-0000-4000-8000-000000000106')) as assigned;

-- Race 2: two customer claims for one order.
select pg_temp.run_race('customer_claim',
  $q$ with r as materialized (select * from public.claim_manual_bank_payment('d6920000-0000-4000-8000-000000000102', 'd6920000-0000-4000-8000-000000000001', now() - interval '2 minutes', 'VCB')),
          s as materialized (select pg_sleep(1.5) from r)
     select row_to_json(r)::text from r cross join s $q$,
  $q$ select row_to_json(r)::text from public.claim_manual_bank_payment('d6920000-0000-4000-8000-000000000102', 'd6920000-0000-4000-8000-000000000001', now() - interval '2 minutes', 'VCB') r $q$);

-- Race 3: the same reconciler submits the exact confirmation twice under different request ids.
select pg_temp.run_race('decision_same_reconciler',
  $q$ with r as materialized (select * from public.admin_decide_payment_reconciliation_v2('d6920000-0000-4000-8000-000000000004', (select id from public.job_payment_orders where job_id = 'd6920000-0000-4000-8000-000000000103'), 2, gen_random_uuid(), 'confirm', 300000, repeat('d', 64), 'REF-RACE3', now() - interval '1 minute', null)),
          s as materialized (select pg_sleep(1.5) from r)
     select row_to_json(r)::text from r cross join s $q$,
  $q$ select row_to_json(r)::text from public.admin_decide_payment_reconciliation_v2('d6920000-0000-4000-8000-000000000004', (select id from public.job_payment_orders where job_id = 'd6920000-0000-4000-8000-000000000103'), 2, gen_random_uuid(), 'confirm', 300000, repeat('d', 64), 'REF-RACE3', now() - interval '1 minute', null) r $q$);

-- Race 4: a second reconciler tries to decide the order the first one holds.
select pg_temp.run_race('decision_two_reconcilers',
  $q$ with r as materialized (select * from public.admin_decide_payment_reconciliation_v2('d6920000-0000-4000-8000-000000000004', (select id from public.job_payment_orders where job_id = 'd6920000-0000-4000-8000-000000000104'), 2, gen_random_uuid(), 'confirm', 300000, repeat('e', 64), 'REF-RACE4', now() - interval '1 minute', null)),
          s as materialized (select pg_sleep(1.5) from r)
     select row_to_json(r)::text from r cross join s $q$,
  $q$ select row_to_json(r)::text from public.admin_decide_payment_reconciliation_v2('d6920000-0000-4000-8000-000000000005', (select id from public.job_payment_orders where job_id = 'd6920000-0000-4000-8000-000000000104'), 2, gen_random_uuid(), 'confirm', 300000, repeat('e', 64), 'REF-RACE4', now() - interval '1 minute', null) r $q$);

-- Race 5: one bank reference offered for two different orders at the same time.
select pg_temp.run_race('reference_two_orders',
  $q$ with r as materialized (select * from public.admin_decide_payment_reconciliation_v2('d6920000-0000-4000-8000-000000000004', (select id from public.job_payment_orders where job_id = 'd6920000-0000-4000-8000-000000000105'), 2, gen_random_uuid(), 'confirm', 300000, repeat('f', 64), 'REF-RACE5', now() - interval '1 minute', null)),
          s as materialized (select pg_sleep(1.5) from r)
     select row_to_json(r)::text from r cross join s $q$,
  $q$ select row_to_json(r)::text from public.admin_decide_payment_reconciliation_v2('d6920000-0000-4000-8000-000000000004', (select id from public.job_payment_orders where job_id = 'd6920000-0000-4000-8000-000000000106'), 2, gen_random_uuid(), 'confirm', 300000, repeat('f', 64), 'REF-RACE5', now() - interval '1 minute', null) r $q$);

select dblink_disconnect('race_a');
select dblink_disconnect('race_b');

select race, side, payload->>'ok' as ok, payload->>'error_code' as error_code, payload->>'outcome' as outcome, payload->>'already_applied' as already_applied, payload->>'notification_required' as notification_required, failure
from race_results order by race, side;

do $assertions$
declare
  v_ok integer;
begin
  -- completion: one application, one replay, one set of records
  select count(*) into v_ok from race_results where race = 'completion' and payload->>'already_applied' = 'false';
  if v_ok <> 1 or (select count(*) from race_results where race = 'completion' and payload->>'already_applied' = 'true') <> 1
    or (select count(distinct payload->>'operation_id') from race_results where race = 'completion') <> 1
    or (select count(*) from public.completion_payment_operations where job_id = 'd6920000-0000-4000-8000-000000000101') <> 1
    or (select count(*) from public.job_payment_orders where job_id = 'd6920000-0000-4000-8000-000000000101') <> 1
    or (select count(*) from public.worker_payment_ledger where job_id = 'd6920000-0000-4000-8000-000000000101') <> 1
    or (select count(*) from public.job_events where job_id = 'd6920000-0000-4000-8000-000000000101' and event_type = 'customer_confirmed_completion') <> 1
  then raise exception 'completion race: duplicate or missing application'; end if;

  -- customer claim: both succeed, one notifies, one event
  if (select count(*) from race_results where race = 'customer_claim' and payload->>'payment_status' = 'manual_customer_claimed') <> 2
    or (select count(*) from race_results where race = 'customer_claim' and payload->>'notification_required' = 'true') <> 1
    or (select count(*) from public.job_events where job_id = 'd6920000-0000-4000-8000-000000000102' and event_type = 'customer_claimed_bank_transfer') <> 1
  then raise exception 'customer claim race: duplicate claim effect'; end if;

  -- same reconciler twice: exactly one payment
  if (select count(*) from race_results where race = 'decision_same_reconciler' and payload->>'outcome' = 'paid') <> 1
    or (select count(*) from race_results where race = 'decision_same_reconciler' and payload->>'error_code' = 'VERSION_CONFLICT') <> 1
    or (select count(*) from public.job_events where job_id = 'd6920000-0000-4000-8000-000000000103' and event_type = 'payment_confirmed') <> 1
    or (select count(*) from public.job_payment_reconciliation_events where job_id = 'd6920000-0000-4000-8000-000000000103' and event_type = 'manual_payment_verified') <> 1
    or (select payment_state from public.worker_payment_ledger where job_id = 'd6920000-0000-4000-8000-000000000103') <> 'on_hold'
  then raise exception 'same-reconciler race: not exactly one payment'; end if;

  -- two reconcilers: the unassigned one is refused
  if (select count(*) from race_results where race = 'decision_two_reconcilers' and payload->>'outcome' = 'paid') <> 1
    or (select count(*) from race_results where race = 'decision_two_reconcilers' and payload->>'error_code' in ('ASSIGNED_TO_OTHER', 'VERSION_CONFLICT')) <> 1
    or (select count(*) from public.job_events where job_id = 'd6920000-0000-4000-8000-000000000104' and event_type = 'payment_confirmed') <> 1
  then raise exception 'two-reconciler race: not exactly one payment'; end if;

  -- same reference on two orders: at most one is paid and the other is never paid
  if (select count(*) from public.jobs where id in ('d6920000-0000-4000-8000-000000000105', 'd6920000-0000-4000-8000-000000000106') and status = 'paid'::public.job_status) <> 1
    or (select count(*) from public.job_payment_orders where bank_reference_hash = repeat('f', 64)) <> 1
    or (select count(*) from public.worker_payment_ledger where job_id in ('d6920000-0000-4000-8000-000000000105', 'd6920000-0000-4000-8000-000000000106') and payment_state = 'on_hold') <> 1
  then raise exception 'reference race: the same bank reference paid two orders or none'; end if;
end;
$assertions$;

select 'payment concurrency: all assertions passed' as result;
