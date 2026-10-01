-- @pillar id: P286-program-push-claim-sql
-- @pillar invariant: Only discipline and compensation notices from the last day are claimed for push, each exactly once and oldest first, with the recipient's role so the push opens the right screen; an already-claimed notice never uses up the batch, and other notices and older ones are never claimed
-- @pillar authority: governance/RULES.md #8 | Plan moonlit-singing-phoenix R2.2: program decisions reach a closed app
-- @pillar target: supabase/migrations/20260928127000_program_push_receipts.sql
-- @pillar layer: sql
-- @pillar siblings: P279-worker-reply-nudge-sql
-- @pillar mutation: Drop the program_push_receipts NOT EXISTS from claim_program_pushes; the second one-row claim picks the already-claimed notice again and P286 raises P286_BATCH_STARVED

begin;
set local statement_timeout = '20s';
set local lock_timeout = '3s';

insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
  ('c2860000-0000-4000-8000-000000000001','authenticated','authenticated','program-push-p286-worker@example.test',
    '{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('c2860000-0000-4000-8000-000000000002','authenticated','authenticated','program-push-p286-customer@example.test',
    '{"provider":"email","providers":["email"]}','{}',now(),now());
update public.profiles set role = 'worker' where id = 'c2860000-0000-4000-8000-000000000001';

insert into public.notifications (id, user_id, event_type, title, body, created_at) values
  ('c2860000-0000-4000-8000-000000000101', 'c2860000-0000-4000-8000-000000000001', 'violation_confirmed',
    'Vi phạm cấp 1 đã được xác nhận', 'Xem lý do.', now() - interval '2 minutes'),
  ('c2860000-0000-4000-8000-000000000102', 'c2860000-0000-4000-8000-000000000002', 'compensation_agreed',
    'Hai bên đã thống nhất bồi thường', 'NestScout sẽ chuyển khoản.', now() - interval '1 minute'),
  ('c2860000-0000-4000-8000-000000000103', 'c2860000-0000-4000-8000-000000000001', 'worker_reply_nudge',
    'Khách đang chờ', 'Trả lời sớm.', now()),
  ('c2860000-0000-4000-8000-000000000104', 'c2860000-0000-4000-8000-000000000002', 'compensation_paid',
    'Đã chuyển tiền bồi thường', 'Kiểm tra tài khoản.', now() - interval '2 days');

do $claim$
declare
  v_claimed integer;
begin
  -- One row per claim: the second must move on to the next notice, not stall on the first.
  create temp table p286_first on commit drop as select * from public.claim_program_pushes(1);
  if (select count(*) from p286_first) <> 1
     or (select notification_id from p286_first) <> 'c2860000-0000-4000-8000-000000000101' then
    raise exception 'P286_NOT_OLDEST_FIRST';
  end if;
  insert into p286_first select * from public.claim_program_pushes(1);
  if (select count(*) from p286_first) <> 2 then
    raise exception 'P286_BATCH_STARVED';
  end if;

  if (select count(*) from p286_first) <> 2
     or not exists (select 1 from p286_first where notification_id = 'c2860000-0000-4000-8000-000000000101'
                    and recipient_role = 'worker' and event_type = 'violation_confirmed')
     or not exists (select 1 from p286_first where notification_id = 'c2860000-0000-4000-8000-000000000102'
                    and recipient_role = 'customer' and title = 'Hai bên đã thống nhất bồi thường') then
    raise exception 'P286_WRONG_NOTICES_CLAIMED: %', (select json_agg(p286_first) from p286_first);
  end if;

  select count(*) into v_claimed from public.claim_program_pushes(10);
  if v_claimed <> 0 then
    raise exception 'P286_NOTICE_CLAIMED_TWICE';
  end if;

  begin
    perform public.claim_program_pushes(0);
    raise exception 'P286_BAD_LIMIT_ACCEPTED';
  exception when sqlstate '22023' then
    null;
  end;

  if has_function_privilege('authenticated', 'public.claim_program_pushes(integer)', 'execute') then
    raise exception 'P286_CLAIM_OPEN_TO_CLIENTS';
  end if;
end;
$claim$;

rollback;
