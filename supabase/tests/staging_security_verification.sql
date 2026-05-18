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
  ('10000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'admin.security@home-services.test', '+84900000001', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('20000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'customer.one@home-services.test', '+84900000002', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('20000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'customer.two@home-services.test', '+84900000003', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('30000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'worker.one@home-services.test', '+84900000004', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('30000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'worker.two@home-services.test', '+84900000005', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  ('40000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'outsider@home-services.test', '+84900000006', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

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
  ('20000000-0000-0000-0000-000000000002', 'Staging Tower B', '2202', '22', 'District 2');

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
    'waiting_customer_decision'
  );

insert into public.notifications (user_id, job_id, event_type, title, body) values
  ('20000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'job_update', 'Job updated', 'A staging job was updated');

insert into public.api_logs (provider, success, purpose, safe_metadata) values
  ('perplexity', true, 'security_verification', '{"fixture":true}'::jsonb);

insert into public.learning_candidates (candidate_type, affected_service, affected_problem, evidence_count, confidence, status, suggested_payload) values
  ('price_prior_update', 'plumbing', 'plumbing-general', 5, 0.900, 'pending_evidence', '{"fixture":true}'::jsonb);

insert into public.learning_rules (id, rule_type, affected_service, affected_problem, evidence_count, confidence, status, rule_payload) values
  ('70000000-0000-0000-0000-000000000001', 'clarification_rule', 'plumbing', 'plumbing-general', 5, 0.900, 'active', '{"fixture":true}'::jsonb);

insert into public.learning_rule_versions (rule_id, version, rule_payload, change_reason, status) values
  ('70000000-0000-0000-0000-000000000001', 1, '{"fixture":true}'::jsonb, 'security verification fixture', 'active');

insert into storage.objects (bucket_id, name, owner, metadata) values
  ('job-photos', '50000000-0000-0000-0000-000000000001/before.jpg', '20000000-0000-0000-0000-000000000001', '{}'::jsonb),
  ('completion-photos', '50000000-0000-0000-0000-000000000001/done.jpg', '30000000-0000-0000-0000-000000000001', '{}'::jsonb),
  ('worker-documents', '30000000-0000-0000-0000-000000000001/cccd-front.jpg', '30000000-0000-0000-0000-000000000001', '{}'::jsonb);

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
from public.learning_candidates;

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

rollback;
