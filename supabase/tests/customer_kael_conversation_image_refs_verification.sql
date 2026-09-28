-- @pillar id: P247-customer-kael-image-refs-rls-sql
-- @pillar invariant: Private Customer Kael image refs remain owner-readable, hidden from Workers and other Customers, visible to Admins, and bounded to valid Customer turns
-- @pillar authority: governance/protocols/ai-data-security.md §14 | governance/RULES.md #9
-- @pillar target: supabase/migrations/20260927182024_customer_kael_conversation_image_refs.sql
-- @pillar layer: sql
-- @pillar siblings: P205-kael-composer-and-failure-boundary, P217-customer-assistant-image-analysis
-- @pillar mutation: Grant a Worker direct SELECT on Customer conversation turns or remove the RPC/table media-ref bounds; actor visibility or invalid-media assertions fail

begin;
set local statement_timeout = '20s';
set local lock_timeout = '3s';

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('d2470000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'kael-image-customer-one@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d2470000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'kael-image-customer-two@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d2470000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
   'kael-image-worker@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('d2470000-0000-4000-8000-000000000004', 'authenticated', 'authenticated',
   'kael-image-admin@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now());

update public.profiles set role = 'worker'
where id = 'd2470000-0000-4000-8000-000000000003';
update public.profiles set role = 'admin'
where id = 'd2470000-0000-4000-8000-000000000004';

insert into public.kael_customer_conversations (
  id, customer_id, chat_mode, client_request_id
) values
  ('d2480000-0000-4000-8000-000000000001', 'd2470000-0000-4000-8000-000000000001', 'normal', 'd2490000-0000-4000-8000-000000000001'),
  ('d2480000-0000-4000-8000-000000000002', 'd2470000-0000-4000-8000-000000000002', 'normal', 'd2490000-0000-4000-8000-000000000002');

set local role service_role;

select public.append_customer_kael_conversation_exchange(
  'd2480000-0000-4000-8000-000000000001',
  'd2470000-0000-4000-8000-000000000001',
  'd2500000-0000-4000-8000-000000000001',
  'Phân tích ảnh này',
  array[
    'supabase://kael-chat-media/d2470000-0000-4000-8000-000000000001/kael-chat/model_vision/room-1.jpg',
    'supabase://kael-chat-media/d2470000-0000-4000-8000-000000000001/kael-chat/model_vision/room-2.jpg'
  ],
  'Kael đã xem hai ảnh.'
);

do $rpc_bound$
begin
  begin
    perform public.append_customer_kael_conversation_exchange(
      'd2480000-0000-4000-8000-000000000001',
      'd2470000-0000-4000-8000-000000000001',
      'd2500000-0000-4000-8000-000000000003',
      'Too many image refs',
      array[
        'supabase://kael-chat-media/d2470000-0000-4000-8000-000000000001/kael-chat/model_vision/rpc-1.jpg',
        'supabase://kael-chat-media/d2470000-0000-4000-8000-000000000001/kael-chat/model_vision/rpc-2.jpg',
        'supabase://kael-chat-media/d2470000-0000-4000-8000-000000000001/kael-chat/model_vision/rpc-3.jpg',
        'supabase://kael-chat-media/d2470000-0000-4000-8000-000000000001/kael-chat/model_vision/rpc-4.jpg',
        'supabase://kael-chat-media/d2470000-0000-4000-8000-000000000001/kael-chat/model_vision/rpc-5.jpg',
        'supabase://kael-chat-media/d2470000-0000-4000-8000-000000000001/kael-chat/model_vision/rpc-6.jpg'
      ],
      'This response must not be stored.'
    );
    raise exception 'P247: RPC accepted more than five image refs';
  exception when sqlstate '22023' then null;
  end;
end;
$rpc_bound$;

select public.append_customer_kael_conversation_exchange(
  'd2480000-0000-4000-8000-000000000002',
  'd2470000-0000-4000-8000-000000000002',
  'd2500000-0000-4000-8000-000000000002',
  'Xin chào Kael',
  'Kael sẵn sàng hỗ trợ.'
);

reset role;

do $constraints$
declare
  v_image_refs text[] := array[
    'supabase://kael-chat-media/d2470000-0000-4000-8000-000000000001/kael-chat/model_vision/room-1.jpg',
    'supabase://kael-chat-media/d2470000-0000-4000-8000-000000000001/kael-chat/model_vision/room-2.jpg'
  ];
  v_too_many_refs text[] := array[
    'supabase://kael-chat-media/d2470000-0000-4000-8000-000000000001/kael-chat/model_vision/room-1.jpg',
    'supabase://kael-chat-media/d2470000-0000-4000-8000-000000000001/kael-chat/model_vision/room-2.jpg',
    'supabase://kael-chat-media/d2470000-0000-4000-8000-000000000001/kael-chat/model_vision/room-3.jpg',
    'supabase://kael-chat-media/d2470000-0000-4000-8000-000000000001/kael-chat/model_vision/room-4.jpg',
    'supabase://kael-chat-media/d2470000-0000-4000-8000-000000000001/kael-chat/model_vision/room-5.jpg',
    'supabase://kael-chat-media/d2470000-0000-4000-8000-000000000001/kael-chat/model_vision/room-6.jpg'
  ];
  v_rpc regprocedure := 'public.append_customer_kael_conversation_exchange(uuid,uuid,uuid,text,text[],text)'::regprocedure;
begin
  if v_rpc is null
     or not has_function_privilege('service_role', v_rpc, 'execute')
     or has_function_privilege('anon', v_rpc, 'execute')
     or has_function_privilege('authenticated', v_rpc, 'execute') then
    raise exception 'P247: image exchange RPC must be executable by service_role only';
  end if;

  if exists (
    select 1 from pg_catalog.pg_proc as proc
    where proc.oid = v_rpc
      and (proc.prosecdef or proc.proconfig is distinct from array['search_path=""']::text[])
  ) then
    raise exception 'P247: image exchange RPC must remain invoker-scoped with an empty search path';
  end if;

  begin
    insert into public.kael_customer_conversation_turns (
      conversation_id, customer_id, turn_index, role, text_content, media_refs
    ) values (
      'd2480000-0000-4000-8000-000000000001',
      'd2470000-0000-4000-8000-000000000001',
      3,
      'customer',
      'Too many image refs',
      v_too_many_refs
    );
    raise exception 'P247: more than five media refs were stored';
  exception when check_violation then null;
  end;

  begin
    insert into public.kael_customer_conversation_turns (
      conversation_id, customer_id, turn_index, role, text_content, media_refs
    ) values (
      'd2480000-0000-4000-8000-000000000001',
      'd2470000-0000-4000-8000-000000000001',
      4,
      'kael',
      'Assistant turns cannot own image refs.',
      v_image_refs
    );
    raise exception 'P247: an assistant turn stored Customer image refs';
  exception when check_violation then null;
  end;
end;
$constraints$;

set local role authenticated;
set local request.jwt.claim.sub = 'd2470000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';

do $customer_owner$
declare
  v_owned_turns integer;
  v_other_customer_turns integer;
  v_owned_media_refs text[];
begin
  select count(*) into v_owned_turns
  from public.kael_customer_conversation_turns
  where customer_id = 'd2470000-0000-4000-8000-000000000001';
  select count(*) into v_other_customer_turns
  from public.kael_customer_conversation_turns
  where customer_id = 'd2470000-0000-4000-8000-000000000002';
  select media_refs into v_owned_media_refs
  from public.kael_customer_conversation_turns
  where customer_id = 'd2470000-0000-4000-8000-000000000001'
    and turn_index = 1;

  if v_owned_turns <> 2
     or v_other_customer_turns <> 0
     or v_owned_media_refs is distinct from array[
       'supabase://kael-chat-media/d2470000-0000-4000-8000-000000000001/kael-chat/model_vision/room-1.jpg',
       'supabase://kael-chat-media/d2470000-0000-4000-8000-000000000001/kael-chat/model_vision/room-2.jpg'
     ]::text[] then
    raise exception 'P247: Customer must read own turns and not another Customer''s turns';
  end if;

  begin
    update public.kael_customer_conversation_turns
    set media_refs = array['supabase://kael-chat-media/d2470000-0000-4000-8000-000000000001/kael-chat/model_vision/direct-write.jpg']
    where customer_id = 'd2470000-0000-4000-8000-000000000001' and role = 'customer';
    raise exception 'P247: authenticated Customer updated private image refs directly';
  exception when insufficient_privilege then null;
  end;
end;
$customer_owner$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'd2470000-0000-4000-8000-000000000003';
set local request.jwt.claim.role = 'authenticated';

do $worker_denied$
declare
  v_visible_turns integer;
begin
  select count(*) into v_visible_turns from public.kael_customer_conversation_turns;
  if v_visible_turns <> 0 then
    raise exception 'P247: Worker must not read Customer Kael turns';
  end if;
end;
$worker_denied$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'd2470000-0000-4000-8000-000000000004';
set local request.jwt.claim.role = 'authenticated';

do $admin_allowed$
declare
  v_visible_turns integer;
begin
  select count(*) into v_visible_turns from public.kael_customer_conversation_turns;
  if v_visible_turns <> 4 then
    raise exception 'P247: Admin must read all Customer Kael turns';
  end if;
end;
$admin_allowed$;

reset role;
set local role anon;
set local request.jwt.claim.sub = '';
set local request.jwt.claim.role = 'anon';

do $anonymous_denied$
begin
  begin
    perform 1 from public.kael_customer_conversation_turns;
    raise exception 'P247: anonymous users read private Customer Kael turns';
  exception when insufficient_privilege then null;
  end;
end;
$anonymous_denied$;

select 'P247 Customer Kael image-ref RLS and constraint checks passed' as result;
rollback;
