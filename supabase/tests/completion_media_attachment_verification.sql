-- @pillar id: P81-completion-media-attachment-sql
-- @pillar invariant: Worker completion and Customer confirmation require every photo to be an attached after asset owned by the assigned Worker on the same job.
-- @pillar authority: governance/RULES.md #7; governance/RULES.md #8
-- @pillar target: supabase/migrations/20260905101000_completion_media_attachment_guard.sql
-- @pillar layer: sql
-- @pillar siblings: P79-worker-completion-media-ownership, P68-completion-payment-authority
-- @pillar mutation: Remove the attachment guard; forged and cross-job completion evidence is accepted and this suite fails.

begin;

insert into auth.users(id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
values
  ('d8100000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'completion-media-customer@example.test', '{"provider":"email","providers":["email"]}', '{}'),
  ('d8100000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'completion-media-worker@example.test', '{"provider":"email","providers":["email"]}', '{}');

update public.profiles set role = 'worker'
where id = 'd8100000-0000-4000-8000-000000000002';

insert into public.jobs(id, customer_id, worker_id, service_type, description,
  address_district, status, final_price, completion_notes, completion_photo_urls)
values
  ('d8100000-0000-4000-8000-000000000101',
    'd8100000-0000-4000-8000-000000000001', 'd8100000-0000-4000-8000-000000000002',
    'plumbing', 'Completion attachment verification', 'q7', 'repairing', 450000,
    'Đã hoàn tất và chụp ảnh.', array[]::text[]),
  ('d8100000-0000-4000-8000-000000000102',
    'd8100000-0000-4000-8000-000000000001', 'd8100000-0000-4000-8000-000000000002',
    'plumbing', 'Legacy forged completion verification', 'q7', 'completed_by_worker', 450000,
    'Ảnh chưa được xác minh.', array['https://example.test/forged.jpg']);

insert into public.job_media_assets(job_id, owner_id, service_type, stage, bucket_id, object_path, mime_type)
values
  ('d8100000-0000-4000-8000-000000000101', 'd8100000-0000-4000-8000-000000000002',
    'plumbing', 'after', 'job-media', 'd8100000-0000-4000-8000-000000000101/after/valid.jpg', 'image/jpeg'),
  ('d8100000-0000-4000-8000-000000000101', 'd8100000-0000-4000-8000-000000000001',
    'plumbing', 'after', 'job-media', 'd8100000-0000-4000-8000-000000000101/after/customer.jpg', 'image/jpeg'),
  ('d8100000-0000-4000-8000-000000000101', 'd8100000-0000-4000-8000-000000000002',
    'plumbing', 'before', 'job-media', 'd8100000-0000-4000-8000-000000000101/before/initial.jpg', 'image/jpeg'),
  ('d8100000-0000-4000-8000-000000000102', 'd8100000-0000-4000-8000-000000000002',
    'plumbing', 'after', 'job-media', 'd8100000-0000-4000-8000-000000000102/after/other-job.jpg', 'image/jpeg');

set local role service_role;
set local request.jwt.claim.role = 'service_role';

do $invalid_evidence$
declare
  v_ref text;
begin
  foreach v_ref in array array[
    'https://example.test/forged.jpg',
    'supabase://job-media/d8100000-0000-4000-8000-000000000101/after/not-attached.jpg',
    'supabase://job-media/d8100000-0000-4000-8000-000000000101/after/customer.jpg',
    'supabase://job-media/d8100000-0000-4000-8000-000000000101/before/initial.jpg',
    'supabase://job-media/d8100000-0000-4000-8000-000000000102/after/other-job.jpg',
    null
  ] loop
    begin
      update public.jobs set status = 'completed_by_worker', completion_photo_urls = array[v_ref]
      where id = 'd8100000-0000-4000-8000-000000000101';
      raise exception 'invalid completion media was accepted';
    exception when sqlstate 'P0001' then
      if sqlerrm <> 'CUSTOMER_COMPLETION_EVIDENCE_REQUIRED' then raise; end if;
    end;
  end loop;

  begin
    perform * from public.confirm_completion_manual_bank_atomic(
      'd8100000-0000-4000-8000-000000000102',
      'd8100000-0000-4000-8000-000000000001',
      'completion-payment:d8100000-0000-4000-8000-000000000102:d8100000-0000-4000-8000-000000000001',
      450000, 'NSCCCCCCCCCCCCCCCCCCCCCCCC', 'NSCCCCCCCCCCCCCCCCCCCCCCCC',
      'https://vietqr.app/img?amount=450000', now()
    );
    raise exception 'Customer confirmation accepted legacy forged evidence';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'CUSTOMER_COMPLETION_EVIDENCE_REQUIRED' then raise; end if;
  end;

  if exists (select 1 from public.completion_payment_operations
    where job_id = 'd8100000-0000-4000-8000-000000000102')
    or exists (select 1 from public.job_payment_orders
      where job_id = 'd8100000-0000-4000-8000-000000000102')
    or exists (select 1 from public.jobs where id = 'd8100000-0000-4000-8000-000000000101'
      and status <> 'repairing') then
    raise exception 'rejected evidence left partial workflow effects';
  end if;

  update public.jobs
  set completion_photo_urls = array['supabase://job-media/d8100000-0000-4000-8000-000000000101/after/valid.jpg'],
    status = 'completed_by_worker'
  where id = 'd8100000-0000-4000-8000-000000000101';

  update public.jobs set status = 'confirmed_by_customer'
  where id = 'd8100000-0000-4000-8000-000000000101';
  if not found then raise exception 'valid attached completion did not confirm'; end if;
end;
$invalid_evidence$;

reset role;
rollback;
