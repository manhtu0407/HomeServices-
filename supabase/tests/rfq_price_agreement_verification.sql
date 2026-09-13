-- @pillar id: P177-rfq-price-agreement-sql
-- @pillar invariant: Only an assigned Worker can propose an immutable RFQ price and only the owning Customer can approve it before work; retries never change consent.
-- @pillar authority: governance/RULES.md #4
-- @pillar target: supabase/migrations/20260913100000_rfq_price_agreement.sql
-- @pillar layer: sql
-- @pillar siblings: P69-synthetic-terminal-transaction-proof
-- @pillar mutation: Remove the Customer-role guard; an Admin retaining job ownership can approve a Worker quote.

begin;

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
values
 ('e1770000-0000-4000-8000-000000000001','authenticated','authenticated','rfq-price-c@example.test','{}','{}'),
 ('e1770000-0000-4000-8000-000000000002','authenticated','authenticated','rfq-price-w@example.test','{}','{}'),
 ('e1770000-0000-4000-8000-000000000003','authenticated','authenticated','rfq-price-other@example.test','{}','{}');
update public.profiles set role='worker' where id='e1770000-0000-4000-8000-000000000002';
insert into public.worker_profiles(id,service_types,districts,is_approved,is_available)
values('e1770000-0000-4000-8000-000000000002',array['plumbing']::public.service_type[],array['q7'],true,true);
insert into public.jobs(id,customer_id,worker_id,service_type,description,address_district,status,quote_mode)
values('e1770000-0000-4000-8000-000000000101','e1770000-0000-4000-8000-000000000001',
 'e1770000-0000-4000-8000-000000000002','plumbing','RFQ price agreement fixture','q7','inspecting','rfq');

set local role service_role;
set local request.jwt.claim.role='service_role';
-- The bilateral lock is deferred in production; flush it before rollback-only proof.
set constraints all immediate;

do $proof$
declare
 j uuid := 'e1770000-0000-4000-8000-000000000101';
 c uuid := 'e1770000-0000-4000-8000-000000000001';
 w uuid := 'e1770000-0000-4000-8000-000000000002';
 q uuid := 'e1770000-0000-4000-8000-000000000201';
 r jsonb;
begin
 r := public.propose_rfq_price_atomic(j,w,q,220000,'Replace the inspected fitting including labor.');
 if r->>'id' is distinct from q::text or r->>'status' is distinct from 'pending' then
   raise exception 'P177 assigned Worker proposal did not persist: %',r;
 end if;
 if (select final_price from public.jobs where id=j) is not null then
   raise exception 'P177 Worker proposal set final price without Customer approval';
 end if;
 begin
   update public.jobs set status='repairing' where id=j;
   raise exception 'P177 work started before agreed price';
 exception when check_violation then null;
 end;
 for i in 1..100 loop
   perform public.propose_rfq_price_atomic(j,w,q,220000,'Replace the inspected fitting including labor.');
 end loop;
 if (select count(*) from public.job_rfq_price_proposals where job_id=j) <> 1 then
   raise exception 'P177 duplicate Worker commands created multiple proposals';
 end if;
 begin
   perform public.propose_rfq_price_atomic(j,w,q,260000,'Changed price.');
   raise exception 'P177 replay changed proposal';
 exception when invalid_parameter_value then null;
 end;
 begin
   perform public.decide_rfq_price_atomic(j,w,q,true);
   raise exception 'P177 Worker approved own price';
 exception when no_data_found then null;
 end;
 update public.profiles set role='admin' where id=c;
 begin
   perform public.decide_rfq_price_atomic(j,c,q,true);
   raise exception 'P177 Admin retaining ownership approved price';
 exception when no_data_found then null;
 end;
 update public.profiles set role='customer' where id=c;
 r := public.decide_rfq_price_atomic(j,c,q,true);
 if r->>'status' is distinct from 'approved'
   or (select final_price from public.jobs where id=j) is distinct from 220000 then
   raise exception 'P177 Customer approval did not lock exact price: %',r;
 end if;
 perform public.decide_rfq_price_atomic(j,c,q,true);
 begin
   perform public.decide_rfq_price_atomic(j,c,q,false);
   raise exception 'P177 decision replay changed approved consent';
 exception when invalid_parameter_value then null;
 end;
 begin
   update public.jobs set final_price=260000 where id=j;
   raise exception 'P177 direct price rewrite passed';
 exception when check_violation then null;
 end;
 if (select count(*) from public.job_events where job_id=j and event_type='rfq_price_approved') <> 1 then
   raise exception 'P177 approval did not create exactly one audit event';
 end if;
 update public.jobs set status='repairing' where id=j;
end;
$proof$;

do $inspection$
declare
 j uuid := 'e1770000-0000-4000-8000-000000000102';
 c uuid := 'e1770000-0000-4000-8000-000000000001';
 w uuid := 'e1770000-0000-4000-8000-000000000002';
 other_actor uuid := 'e1770000-0000-4000-8000-000000000003';
 q uuid := 'e1770000-0000-4000-8000-000000000202';
 next_q uuid := 'e1770000-0000-4000-8000-000000000203';
 r jsonb;
begin
 insert into public.jobs(id,customer_id,worker_id,service_type,description,address_district,status,quote_mode)
 values(j,c,w,'plumbing','Inspection exact price fixture','q7','inspecting','inspection_only');
 begin
   perform public.propose_rfq_price_atomic(j,other_actor,q,220000,'Cross-worker price must fail.');
   raise exception 'P177 foreign Worker proposed a price';
 exception when no_data_found then null; end;
 begin
   perform public.propose_rfq_price_atomic(j,w,q,0,'Zero price must not pass.');
   raise exception 'P177 nonpositive price passed';
 exception when invalid_parameter_value then null; end;
 r := public.propose_rfq_price_atomic(j,w,q,220000,'Inspection and repair including materials.');
 begin
   perform public.decide_rfq_price_atomic(j,other_actor,q,true);
   raise exception 'P177 foreign Customer approved a price';
 exception when no_data_found then null; end;
 begin
   perform public.decide_rfq_price_atomic(j,c,q,null);
   raise exception 'P177 null decision became consent';
 exception when invalid_parameter_value then null; end;
 perform public.decide_rfq_price_atomic(j,c,q,false);
 perform public.decide_rfq_price_atomic(j,c,q,false);
 if (select final_price from public.jobs where id=j) is not null then
   raise exception 'P177 rejection locked a price';
 end if;
 perform public.propose_rfq_price_atomic(j,w,next_q,240000,'Updated scope after Customer feedback.');
 begin
   perform public.decide_rfq_price_atomic(j,c,q,true);
   raise exception 'P177 rejected proposal was approved later';
 exception when invalid_parameter_value then null; end;
 perform public.decide_rfq_price_atomic(j,c,next_q,true);
 update public.jobs set status='repairing' where id=j;
 -- Recovery remains idempotent even after the authoritative job phase advances.
 perform public.decide_rfq_price_atomic(j,c,next_q,true);
 perform public.propose_rfq_price_atomic(j,w,next_q,240000,'Updated scope after Customer feedback.');
 if (select final_price from public.jobs where id=j) <> 240000
   or (select count(*) from public.job_events where job_id=j and event_type='rfq_price_approved') <> 1 then
   raise exception 'P177 inspection agreement or replay diverged';
 end if;
end;
$inspection$;

reset role;
do $grants$
begin
 if has_function_privilege('authenticated','public.propose_rfq_price_atomic(uuid,uuid,uuid,integer,text)','EXECUTE')
   or has_function_privilege('authenticated','public.decide_rfq_price_atomic(uuid,uuid,uuid,boolean)','EXECUTE')
   or has_table_privilege('authenticated','public.job_rfq_price_proposals','INSERT')
   or has_table_privilege('service_role','public.job_rfq_price_proposals','UPDATE') then
   raise exception 'P177 direct client or service table mutation is allowed';
 end if;
end;
$grants$;
select 'P177 RFQ exact agreement, authority, replay and work gate passed' as result;
rollback;
