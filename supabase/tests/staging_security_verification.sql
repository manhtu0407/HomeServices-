-- =============================================================================
-- Staging Security Verification Harness
--
-- Purpose:
-- - Verify Supabase RLS and storage policies against real hosted Supabase.
-- - Use deterministic staging-only auth/profile/job fixtures inside one transaction.
-- - Roll back all fixture data at the end.
--
-- Run against a staging-linked project only:
--   supabase db query --linked -f supabase/tests/staging_security_verification.sql -o json
--
-- @pillar id: P10-per-actor-rls
-- @pillar invariant: every actor reads and writes only what its role allows, and the matrix
--   raises instead of merely recording when any check fails
-- @pillar authority: governance/RULES.md Security Invariants | docs/test-debt-ledger.md §2
-- @pillar target: supabase/tests/staging_security_verification.sql
-- @pillar layer: sql
-- @pillar siblings: P03-direct-payment-availability, P06-payment-unlock-gate
-- @pillar mutation: flip one expected count in any `insert into security_results` row --
--   the verdict block names that check and the script exits nonzero
-- =============================================================================

begin;

create temporary table security_results (
  test_name text not null,
  expected text not null,
  actual text not null,
  pass boolean not null,
  detail text
) on commit drop;

grant select, insert on security_results to authenticated;

-- Stable test identities. These IDs are deliberately recognizable and are rolled back.
insert into auth.users (
  id,
  aud,
  role,
  email,
  phone,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values
  ('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'admin.security@nestscout.test', '+84900000001', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('20000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'customer.one@nestscout.test', '+84900000002', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('20000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'customer.two@nestscout.test', '+84900000003', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('30000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'worker.one@nestscout.test', '+84900000004', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('30000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'worker.two@nestscout.test', '+84900000005', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('40000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'outsider@nestscout.test', '+84900000006', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

update public.profiles
set role = 'admin', full_name = 'Security Admin'
where id = '10000000-0000-0000-0000-000000000001';

update public.profiles
set full_name = 'Customer One'
where id = '20000000-0000-0000-0000-000000000001';

update public.profiles
set full_name = 'Customer Two'
where id = '20000000-0000-0000-0000-000000000002';

update public.profiles
set role = 'worker', full_name = 'Worker One'
where id = '30000000-0000-0000-0000-000000000001';

update public.profiles
set role = 'worker', full_name = 'Worker Two'
where id = '30000000-0000-0000-0000-000000000002';

insert into public.customer_profiles (id, building_name, unit_number, floor, district) values
  ('20000000-0000-0000-0000-000000000001', 'Staging Tower A', '1201', '12', 'District 1'),
  ('20000000-0000-0000-0000-000000000002', 'Staging Tower B', '2202', '22', 'District 2')
on conflict (id) do update
set building_name = excluded.building_name,
    unit_number = excluded.unit_number,
    floor = excluded.floor,
    district = excluded.district;

insert into public.worker_profiles (
  id,
  service_types,
  years_experience,
  districts,
  is_approved,
  is_available,
  legal_name,
  date_of_birth,
  verification_status
) values
  (
    '30000000-0000-0000-0000-000000000001',
    array['electrical']::service_type[],
    5,
    array['District 1'],
    true,
    true,
    'Security Worker One',
    '1990-01-01',
    'approved'
  ),
  (
    '30000000-0000-0000-0000-000000000002',
    array['plumbing']::service_type[],
    4,
    array['District 2'],
    true,
    true,
    'Security Worker Two',
    '1991-02-02',
    'approved'
  );

insert into public.jobs (
  id,
  customer_id,
  worker_id,
  service_type,
  service_problem_id,
  problem_chips,
  description,
  address_building,
  address_unit,
  address_floor,
  address_district,
  status,
  final_price,
  confirmed_at
) values
  (
    '50000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    'electrical',
    (select id from public.service_problems where slug = 'electrical-general'),
    array['switch'],
    'Matched electrical job for security verification',
    'Staging Tower A',
    '1201',
    '12',
    'District 1',
    'confirmed_by_customer',
    250000,
    now()
  ),
  (
    '50000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000002',
    null,
    'plumbing',
    (select id from public.service_problems where slug = 'plumbing-general'),
    array['leak'],
    'Broadcast-only plumbing job for security verification',
    'Staging Tower B',
    '2202',
    '22',
    'District 2',
    'broadcasting',
    null,
    null
  );

insert into public.job_broadcasts (
  id,
  job_id,
  worker_id,
  status,
  sent_at,
  expires_at
) values
  (
    '60000000-0000-0000-0000-000000000001',
    '50000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000002',
    'sent',
    now(),
    now() + interval '60 seconds'
  );

insert into public.chat_messages (job_id, sender_id, sender_role, content) values
  ('50000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'customer', 'Customer evidence message');

insert into public.job_events (job_id, actor_id, actor_role, event_type, to_status) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'admin', 'security_seeded', 'confirmed_by_customer');

insert into public.scope_change_requests (
  job_id,
  worker_id,
  requested_description,
  reason,
  price_min,
  price_max,
  status
) values
  (
    '50000000-0000-0000-0000-000000000001',
    '30000000-0000-0000-0000-000000000001',
    'Replace damaged switch and inspect wiring',
    'Observed additional wiring issue',
    200000,
    350000,
    'requested_by_worker'
  );

insert into public.notifications (user_id, job_id, event_type, title, body) values
  ('20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'job_update', 'Job updated', 'A staging job was updated');

insert into public.api_logs (provider, success, purpose, safe_metadata) values
  ('perplexity', true, 'security_verification', '{"fixture":true}'::jsonb);

insert into public.learning_candidates (id, candidate_type, affected_service, affected_problem, evidence_count, confidence, status, suggested_payload) values
  ('71000000-0000-0000-0000-000000000001', 'price_prior_update', 'plumbing', 'plumbing-general', 5, 0.900, 'pending_evidence', '{"fixture":true}'::jsonb);

insert into public.learning_rules (id, rule_type, affected_service, affected_problem, evidence_count, confidence, status, rule_payload) values
  ('70000000-0000-0000-0000-000000000001', 'clarification_rule', 'plumbing', 'plumbing-general', 5, 0.900, 'active', '{"fixture":true}'::jsonb);

insert into public.learning_rule_versions (rule_id, version, rule_payload, change_reason, status) values
  ('70000000-0000-0000-0000-000000000001', 1, '{"fixture":true}'::jsonb, 'security verification fixture', 'active');

insert into storage.objects (bucket_id, name, owner, metadata) values
  ('job-photos', '50000000-0000-0000-0000-000000000001/before.jpg', '20000000-0000-0000-0000-000000000001', '{}'::jsonb),
  ('completion-photos', '50000000-0000-0000-0000-000000000001/done.jpg', '30000000-0000-0000-0000-000000000001', '{}'::jsonb),
  ('worker-documents', '30000000-0000-0000-0000-000000000001/cccd-front.jpg', '30000000-0000-0000-0000-000000000001', '{}'::jsonb);

insert into public.customer_payment_methods (
  id,
  customer_id,
  bank_key,
  bank_name,
  account_holder_name,
  bank_account,
  bank_account_masked,
  status,
  is_default
) values
  (
    '92000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000001',
    'techcombank',
    'Techcombank',
    'CUSTOMER ONE',
    '123456789',
    '**** 6789',
    'pending_verification',
    true
  ),
  (
    '92000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000002',
    'vietcombank',
    'Vietcombank',
    'CUSTOMER TWO',
    '987654321',
    '**** 4321',
    'pending_verification',
    true
  );

-- Customer participant read checks.
set local role authenticated;
set local request.jwt.claim.sub = '20000000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';

insert into security_results
select 'customer_reads_own_profile', '1', count(*)::text, count(*) = 1, null
from public.profiles
where id = '20000000-0000-0000-0000-000000000001';

insert into security_results
select 'customer_cannot_read_other_customer_profile', '0', count(*)::text, count(*) = 0, null
from public.profiles
where id = '20000000-0000-0000-0000-000000000002';

insert into security_results
select 'customer_reads_own_job', '1', count(*)::text, count(*) = 1, null
from public.jobs
where id = '50000000-0000-0000-0000-000000000001';

insert into security_results
select 'customer_cannot_read_other_job', '0', count(*)::text, count(*) = 0, null
from public.jobs
where id = '50000000-0000-0000-0000-000000000002';

insert into security_results
select 'customer_reads_job_event_for_own_job', '1', count(*)::text, count(*) = 1, null
from public.job_events
where job_id = '50000000-0000-0000-0000-000000000001';

insert into security_results
select 'customer_reads_scope_change_for_own_job', '1', count(*)::text, count(*) = 1, null
from public.scope_change_requests
where job_id = '50000000-0000-0000-0000-000000000001';

insert into security_results
select 'customer_reads_own_notification', '1', count(*)::text, count(*) = 1, null
from public.notifications
where user_id = '20000000-0000-0000-0000-000000000001';

insert into security_results
select 'customer_reads_own_payment_method', '1', count(*)::text, count(*) = 1, null
from public.customer_payment_methods
where id = '92000000-0000-0000-0000-000000000001';

insert into security_results
select 'customer_cannot_read_other_payment_method', '0', count(*)::text, count(*) = 0, null
from public.customer_payment_methods
where id = '92000000-0000-0000-0000-000000000002';

do $$
declare
  raw_account text;
begin
  begin
    select bank_account
    into raw_account
    from public.customer_payment_methods
    where id = '92000000-0000-0000-0000-000000000001';
    insert into security_results values ('customer_cannot_read_raw_payment_account', 'blocked', 'allowed', false, 'raw account unexpectedly readable');
  exception when others then
    insert into security_results values ('customer_cannot_read_raw_payment_account', 'blocked', 'blocked', true, sqlstate || ': ' || sqlerrm);
  end;
end $$;

insert into security_results
select 'customer_cannot_read_learning_candidates', '0', count(*)::text, count(*) = 0, null
from public.learning_candidates;

insert into security_results
select 'customer_cannot_read_api_logs', '0', count(*)::text, count(*) = 0, null
from public.api_logs;

insert into security_results
select 'customer_reads_job_photo_for_own_job', '1', count(*)::text, count(*) = 1, null
from storage.objects
where bucket_id = 'job-photos'
  and name = '50000000-0000-0000-0000-000000000001/before.jpg';

insert into security_results
select 'customer_reads_completion_photo_for_own_job', '1', count(*)::text, count(*) = 1, null
from storage.objects
where bucket_id = 'completion-photos'
  and name = '50000000-0000-0000-0000-000000000001/done.jpg';

do $$
begin
  begin
    insert into public.jobs (
      id,
      customer_id,
      service_type,
      service_problem_id,
      description,
      status
    ) values (
      '50000000-0000-0000-0000-000000000099',
      '20000000-0000-0000-0000-000000000001',
      'electrical',
      (select id from public.service_problems where slug = 'electrical-general'),
      'Client-side job insert should be blocked',
      'draft'
    );
    insert into security_results values ('customer_cannot_insert_job_directly', 'blocked', 'allowed', false, 'insert unexpectedly succeeded');
  exception when others then
    insert into security_results values ('customer_cannot_insert_job_directly', 'blocked', 'blocked', true, sqlstate || ': ' || sqlerrm);
  end;
end $$;

do $$
begin
  begin
    insert into public.customer_payment_methods (
      customer_id,
      bank_key,
      bank_name,
      account_holder_name,
      bank_account,
      bank_account_masked,
      status,
      is_default
    ) values (
      '20000000-0000-0000-0000-000000000001',
      'acb',
      'ACB',
      'CUSTOMER ONE',
      '1122334455',
      '**** 4455',
      'pending_verification',
      false
    );
    insert into security_results values ('customer_cannot_insert_payment_method_directly', 'blocked', 'allowed', false, 'insert unexpectedly succeeded');
  exception when others then
    insert into security_results values ('customer_cannot_insert_payment_method_directly', 'blocked', 'blocked', true, sqlstate || ': ' || sqlerrm);
  end;
end $$;

do $$
begin
  begin
    insert into storage.objects (bucket_id, name, owner, metadata)
    values ('completion-photos', '50000000-0000-0000-0000-000000000001/customer-upload.jpg', '20000000-0000-0000-0000-000000000001', '{}'::jsonb);
    insert into security_results values ('customer_cannot_upload_completion_photo', 'blocked', 'allowed', false, 'insert unexpectedly succeeded');
  exception when others then
    insert into security_results values ('customer_cannot_upload_completion_photo', 'blocked', 'blocked', true, sqlstate || ': ' || sqlerrm);
  end;
end $$;

reset role;

-- Matched worker can read matched job and upload completion evidence.
set local role authenticated;
set local request.jwt.claim.sub = '30000000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';

insert into security_results
select 'matched_worker_reads_assigned_job', '1', count(*)::text, count(*) = 1, null
from public.jobs
where id = '50000000-0000-0000-0000-000000000001';

insert into security_results
select 'matched_worker_reads_job_photo', '1', count(*)::text, count(*) = 1, null
from storage.objects
where bucket_id = 'job-photos'
  and name = '50000000-0000-0000-0000-000000000001/before.jpg';

do $$
begin
  begin
    insert into storage.objects (bucket_id, name, owner, metadata)
    values ('completion-photos', '50000000-0000-0000-0000-000000000001/worker-upload.jpg', '30000000-0000-0000-0000-000000000001', '{}'::jsonb);
    insert into security_results values ('matched_worker_uploads_completion_photo', 'allowed', 'allowed', true, null);
  exception when others then
    insert into security_results values ('matched_worker_uploads_completion_photo', 'allowed', 'blocked', false, sqlstate || ': ' || sqlerrm);
  end;
end $$;

do $$
begin
  begin
    insert into storage.objects (bucket_id, name, owner, metadata)
    values ('worker-documents', '30000000-0000-0000-0000-000000000001/worker-upload.jpg', '30000000-0000-0000-0000-000000000001', '{}'::jsonb);
    insert into security_results values ('worker_uploads_own_document', 'allowed', 'allowed', true, null);
  exception when others then
    insert into security_results values ('worker_uploads_own_document', 'allowed', 'blocked', false, sqlstate || ': ' || sqlerrm);
  end;
end $$;

reset role;

-- Broadcast worker can see only the broadcast row, not the full job/address before match.
set local role authenticated;
set local request.jwt.claim.sub = '30000000-0000-0000-0000-000000000002';
set local request.jwt.claim.role = 'authenticated';

insert into security_results
select 'broadcast_worker_reads_own_broadcast', '1', count(*)::text, count(*) = 1, null
from public.job_broadcasts
where id = '60000000-0000-0000-0000-000000000001';

insert into security_results
select 'broadcast_worker_cannot_read_full_job_before_match', '0', count(*)::text, count(*) = 0, null
from public.jobs
where id = '50000000-0000-0000-0000-000000000002';

insert into security_results
select 'other_worker_cannot_read_worker1_documents', '0', count(*)::text, count(*) = 0, null
from storage.objects
where bucket_id = 'worker-documents'
  and name like '30000000-0000-0000-0000-000000000001/%';

do $$
begin
  begin
    insert into storage.objects (bucket_id, name, owner, metadata)
    values ('job-photos', '50000000-0000-0000-0000-000000000001/other-worker-upload.jpg', '30000000-0000-0000-0000-000000000002', '{}'::jsonb);
    insert into security_results values ('unmatched_worker_cannot_upload_job_photo', 'blocked', 'allowed', false, 'insert unexpectedly succeeded');
  exception when others then
    insert into security_results values ('unmatched_worker_cannot_upload_job_photo', 'blocked', 'blocked', true, sqlstate || ': ' || sqlerrm);
  end;
end $$;

reset role;

-- Outsider should see no participant-protected records.
set local role authenticated;
set local request.jwt.claim.sub = '40000000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';

insert into security_results
select 'outsider_cannot_read_any_jobs', '0', count(*)::text, count(*) = 0, null
from public.jobs
where id in ('50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002');

insert into security_results
select 'outsider_cannot_read_job_photos', '0', count(*)::text, count(*) = 0, null
from storage.objects
where bucket_id in ('job-photos', 'completion-photos')
  and name like '50000000-0000-0000-0000-000000000001/%';

do $$
begin
  begin
    insert into public.learning_candidates (candidate_type, affected_service, evidence_count, confidence, suggested_payload)
    values ('blocked_user_write', 'plumbing', 5, 0.900, '{}'::jsonb);
    insert into security_results values ('normal_user_cannot_insert_learning_candidate', 'blocked', 'allowed', false, 'insert unexpectedly succeeded');
  exception when others then
    insert into security_results values ('normal_user_cannot_insert_learning_candidate', 'blocked', 'blocked', true, sqlstate || ': ' || sqlerrm);
  end;
end $$;

reset role;

-- Admin can see/manage protected operational and learning data.
set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-0000-0000-000000000001';
set local request.jwt.claim.role = 'authenticated';

insert into security_results
select 'admin_reads_all_jobs', '2', count(*)::text, count(*) = 2, null
from public.jobs
where id in ('50000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000002');

insert into security_results
select 'admin_reads_learning_candidates', '1', count(*)::text, count(*) = 1, null
from public.learning_candidates
where id = '71000000-0000-0000-0000-000000000001';

insert into security_results
select 'admin_reads_api_logs', '1', count(*)::text, count(*) = 1, null
from public.api_logs
where purpose = 'security_verification';

insert into security_results
select 'admin_reads_worker_documents', '2', count(*)::text, count(*) = 2, null
from storage.objects
where bucket_id = 'worker-documents'
  and name like '30000000-0000-0000-0000-000000000001/%';

do $$
begin
  begin
    insert into public.notifications (user_id, job_id, event_type, title, body)
    values ('20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'admin_test', 'Admin test', 'Admin write allowed');
    insert into security_results values ('admin_direct_notification_insert_blocked', 'blocked', 'allowed', false, 'insert unexpectedly succeeded');
  exception when others then
    insert into security_results values ('admin_direct_notification_insert_blocked', 'blocked', 'blocked', true, sqlstate || ': ' || sqlerrm);
  end;
end $$;

reset role;

select
  test_name,
  expected,
  actual,
  pass,
  detail
from security_results
union all
select
  '__summary__',
  '0 failures',
  count(*) filter (where pass = false)::text || ' failures / ' || count(*)::text || ' checks',
  count(*) filter (where pass = false) = 0,
  null
from security_results
order by test_name;

-- The matrix above only records verdicts. run-sql-tests.ps1 fails a file solely on a nonzero
-- psql exit under ON_ERROR_STOP, so without the block below a failing actor check printed
-- pass=false and the runner still reported PASS. The empty-matrix branch matters for the same
-- reason: if fixture setup silently produced no rows, "zero failures" would also be vacuously
-- true.
do $p10_verdict$
declare
  total_checks integer;
  failed_count integer;
  failed_detail text;
begin
  select count(*), count(*) filter (where not pass)
    into total_checks, failed_count
  from security_results;

  if total_checks = 0 then
    raise exception
      'P10 per-actor RLS: no check was recorded, so the actor matrix verified nothing. authority: governance/RULES.md Security Invariants. next: P03-direct-payment-availability, P06-payment-unlock-gate';
  end if;

  if failed_count > 0 then
    select string_agg(
             format(
               '%s (expected %s, actual %s%s)',
               test_name,
               expected,
               actual,
               case when detail is null then '' else '; ' || detail end
             ),
             ' | ' order by test_name
           )
      into failed_detail
    from security_results
    where not pass;

    raise exception
      'P10 per-actor RLS: % of % checks failed -> %. authority: governance/RULES.md Security Invariants. next: P03-direct-payment-availability, P06-payment-unlock-gate',
      failed_count, total_checks, failed_detail;
  end if;
end;
$p10_verdict$;

rollback;
