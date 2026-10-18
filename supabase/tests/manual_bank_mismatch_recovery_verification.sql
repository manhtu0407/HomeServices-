-- @pillar id: P398-manual-bank-mismatch-recovery-sql
-- @pillar invariant: An authorized Admin can reconcile a previously mismatched manual-bank order only against its unchanged frozen ledger, with one paid event and one idempotent receipt.
-- @pillar authority: governance/RULES.md #7 | governance/RULES.md #8
-- @pillar target: public.decide_manual_bank_payment_reconciliation
-- @pillar layer: sql
-- @pillar siblings: P397-kael-local-http-payment,P371-customer-completion-atomic-sql
-- @pillar mutation: Restore the pending-only ledger guard; valid mismatch recovery must return WORKER_LEDGER_INVALID instead of paid.

begin;

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
  ('f3980000-0000-4000-8000-000000000001','authenticated','authenticated','qa-mismatch-customer@example.test','{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('f3980000-0000-4000-8000-000000000002','authenticated','authenticated','qa-mismatch-worker@example.test','{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('f3980000-0000-4000-8000-000000000003','authenticated','authenticated','qa-mismatch-admin@example.test','{"provider":"email","providers":["email"]}','{}',now(),now());
update public.profiles set role='worker' where id='f3980000-0000-4000-8000-000000000002';
update public.profiles set role='admin' where id='f3980000-0000-4000-8000-000000000003';
insert into public.worker_profiles(id,service_types,selected_service_types,years_experience,districts,
  is_approved,is_available,legal_name,date_of_birth,verification_status)
values ('f3980000-0000-4000-8000-000000000002',array['plumbing']::public.service_type[],
  array['plumbing']::public.service_type[],5,array['q7'],true,false,'QA mismatch Worker','1990-01-01','approved');
insert into public.jobs(id,customer_id,worker_id,service_type,description,address_district,status,quote_mode,
  final_price,completion_notes,completion_photo_urls,worker_commission_level,worker_commission_rate_bps)
values ('f3980000-0000-4000-8000-000000000101','f3980000-0000-4000-8000-000000000001',
  'f3980000-0000-4000-8000-000000000002','plumbing','QA completed RFQ fixture for reconciliation.','q7',
  'completed_by_worker','rfq',350000,'Đã hoàn tất và gửi bằng chứng.',
  array['supabase://job-media/f3980000-0000-4000-8000-000000000101/after/photo.jpg'],1,1500);
insert into public.job_media_assets(job_id,owner_id,service_type,stage,bucket_id,object_path,mime_type)
values ('f3980000-0000-4000-8000-000000000101','f3980000-0000-4000-8000-000000000002',
  'plumbing','after','job-media','f3980000-0000-4000-8000-000000000101/after/photo.jpg','image/jpeg');
insert into public.job_rfq_price_proposals(id,job_id,worker_id,customer_id,quote_mode,scope_summary,
  customer_total,commission_level,commission_rate_bps,status,decided_at)
values ('f3980000-0000-4000-8000-000000000201','f3980000-0000-4000-8000-000000000101',
  'f3980000-0000-4000-8000-000000000002','f3980000-0000-4000-8000-000000000001','rfq',
  'QA approved immutable RFQ fixture.',350000,1,1500,'approved',clock_timestamp());
set constraints all immediate;

set local role service_role;
set local request.jwt.claim.role='service_role';

do $proof$
declare
  qa_job constant uuid := 'f3980000-0000-4000-8000-000000000101';
  qa_customer constant uuid := 'f3980000-0000-4000-8000-000000000001';
  qa_admin constant uuid := 'f3980000-0000-4000-8000-000000000003';
  qa_code text := 'NS' || repeat('F',24);
  qa_order uuid;
  qa_receipt record;
  qa_version integer;
  qa_event uuid;
  qa_request uuid := gen_random_uuid();
  qa_credited timestamptz := clock_timestamp();
begin
  perform public.confirm_completion_manual_bank_atomic(qa_job,qa_customer,
    'completion-payment:' || qa_job || ':' || qa_customer,350000,qa_code,qa_code,
    'https://vietqr.app/img?acc=QAONLY&bank=QA&amount=350000&des=' || qa_code,clock_timestamp());
  perform public.claim_manual_bank_payment(qa_job,qa_customer,clock_timestamp(),'QA');
  perform public.recognize_customer_payment_claim(qa_customer,qa_job);
  select id,version into strict qa_order,qa_version from public.job_payment_orders where job_id=qa_job;
  select * into strict qa_receipt from public.admin_claim_payment_reconciliation_atomic(
    qa_admin,qa_order,qa_version,gen_random_uuid(),null);
  if not qa_receipt.ok then raise exception 'P398 claim failed: %',qa_receipt.error_code; end if;
  qa_version := qa_receipt.version_out;
  select * into strict qa_receipt from public.admin_decide_payment_reconciliation_v2(
    qa_admin,qa_order,qa_version,gen_random_uuid(),'confirm',349999,repeat('a',64),'qa-wrong',qa_credited,null);
  if not qa_receipt.ok or qa_receipt.outcome<>'reconcile_required' then
    raise exception 'P398 mismatch must remain unverified: %',qa_receipt.error_code;
  end if;
  qa_version := qa_receipt.version_out;
  if not exists(select 1 from public.worker_payment_ledger where job_id=qa_job
    and payment_state='reversed' and settlement_state='admin_rejected'
    and gross_amount=350000 and platform_fee=52500 and worker_net=297500) then
    raise exception 'P398 mismatch did not reverse only the frozen provisional credit';
  end if;

  begin
    perform public.admin_decide_payment_reconciliation_v2(qa_customer,qa_order,qa_version,
      gen_random_uuid(),'confirm',350000,repeat('b',64),'qa-denied',qa_credited,null);
    raise exception 'P398 Customer was allowed to reconcile payment';
  exception when sqlstate 'P0001' then
    if sqlerrm<>'FINANCE_RECONCILE_REQUIRED' then raise; end if;
  end;
  select * into strict qa_receipt from public.admin_decide_payment_reconciliation_v2(
    qa_admin,qa_order,qa_version-1,gen_random_uuid(),'confirm',350000,repeat('b',64),'qa-stale',qa_credited,null);
  if qa_receipt.ok or qa_receipt.error_code<>'VERSION_CONFLICT' then
    raise exception 'P398 stale version changed financial state';
  end if;

  begin
    update public.worker_payment_ledger set settlement_state='customer_claimed' where job_id=qa_job;
    select * into strict qa_receipt from public.admin_decide_payment_reconciliation_v2(
      qa_admin,qa_order,qa_version,gen_random_uuid(),'confirm',350000,repeat('b',64),'qa-wrong-state',qa_credited,null);
    if qa_receipt.ok or qa_receipt.error_code<>'WORKER_LEDGER_INVALID' then
      raise exception 'P398 an unrelated reversed ledger was restored';
    end if;
    raise exception using errcode='Z0398',message='restore negative fixture state';
  exception when sqlstate 'Z0398' then null;
  end;

  select * into strict qa_receipt from public.admin_decide_payment_reconciliation_v2(
    qa_admin,qa_order,qa_version,qa_request,'confirm',350000,repeat('b',64),'qa-correct',qa_credited,null);
  if not qa_receipt.ok or qa_receipt.outcome<>'paid' or qa_receipt.payment_status<>'manual_verified' then
    raise exception 'P398 valid mismatch recovery must become paid; actual=%',qa_receipt.error_code;
  end if;
  qa_event := qa_receipt.event_id_out;
  qa_version := qa_receipt.version_out;
  select * into strict qa_receipt from public.admin_decide_payment_reconciliation_v2(
    qa_admin,qa_order,qa_version-1,qa_request,'confirm',350000,repeat('b',64),'qa-correct',qa_credited,null);
  if not qa_receipt.ok or qa_receipt.event_id_out<>qa_event or qa_receipt.version_out<>qa_version then
    raise exception 'P398 replay did not recover one original receipt';
  end if;
  if (select count(*) from public.job_events where job_id=qa_job and event_type='payment_confirmed')<>1
    or (select count(*) from public.worker_payment_ledger where job_id=qa_job)<>1 then
    raise exception 'P398 replay duplicated a financial effect';
  end if;
  if not exists(select 1 from public.worker_payment_ledger where job_id=qa_job
    and payment_state='on_hold' and settlement_state='admin_verified'
    and available_at>=qa_credited+interval '24 hours'
    and gross_amount=350000 and platform_fee=52500 and worker_net=297500) then
    raise exception 'P398 recovered credit changed frozen amounts or removed the hold';
  end if;
end;
$proof$;

do $permissions$
begin
  if has_function_privilege('anon','public.decide_manual_bank_payment_reconciliation(uuid,uuid,text,integer,timestamptz,text,text,text)','execute')
    or has_function_privilege('authenticated','public.decide_manual_bank_payment_reconciliation(uuid,uuid,text,integer,timestamptz,text,text,text)','execute') then
    raise exception 'P398 financial RPC grants were widened';
  end if;
end;
$permissions$;
rollback;
