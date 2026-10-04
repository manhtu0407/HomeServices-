-- @pillar id: P299-kael-normal-chat-session-memory-sql
-- @pillar invariant: Normal-chat memory is revision-checked, tied to the owning active session, and readable only by that actor
-- @pillar authority: governance/protocols/ai-data-security.md §14 | governance/RULES.md #9
-- @pillar target: supabase/migrations/20261002170000_kael_normal_chat_session_memory.sql
-- @pillar layer: sql
-- @pillar siblings: P247-customer-kael-image-refs-rls-sql, P294-worker-kael-general-chat-photo
-- @pillar mutation: Grant authenticated direct writes or remove the session owner predicate; the privilege or cross-actor assertions fail

begin;
set local statement_timeout = '20s';
set local lock_timeout = '3s';

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('c2950000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'kael-memory-customer-one@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('c2950000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'kael-memory-customer-two@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('c2950000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'kael-memory-worker-one@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now()),
  ('c2950000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'kael-memory-worker-two@example.test', '{"provider":"email","providers":["email"]}', '{}', now(), now());

update public.profiles set role = 'worker'
where id in ('c2950000-0000-4000-8000-000000000003', 'c2950000-0000-4000-8000-000000000004');

insert into public.kael_customer_conversations (id, customer_id, chat_mode, client_request_id) values
  ('c2960000-0000-4000-8000-000000000001', 'c2950000-0000-4000-8000-000000000001', 'normal', 'c2970000-0000-4000-8000-000000000001'),
  ('c2960000-0000-4000-8000-000000000002', 'c2950000-0000-4000-8000-000000000002', 'normal', 'c2970000-0000-4000-8000-000000000002');

insert into public.kael_worker_chat_sessions (
  id, worker_id, job_id, chat_mode, status, client_request_id, total_turns
) values
  ('c2980000-0000-4000-8000-000000000001', 'c2950000-0000-4000-8000-000000000003', null, 'normal', 'active', 'c2990000-0000-4000-8000-000000000001', 2),
  ('c2980000-0000-4000-8000-000000000002', 'c2950000-0000-4000-8000-000000000004', null, 'normal', 'active', 'c2990000-0000-4000-8000-000000000002', 2);

set local role service_role;

select public.append_customer_kael_conversation_exchange(
  'c2960000-0000-4000-8000-000000000001', 'c2950000-0000-4000-8000-000000000001',
  'c2970000-0000-4000-8000-000000000011', 'Hãy nhớ ảnh phòng khách này.',
  array['supabase://kael-chat-media/c2950000-0000-4000-8000-000000000001/kael-chat/model_vision/room.jpg'],
  'Tôi thấy một phòng khách cần kiểm tra thêm.',
  '{"normal_chat_image_analysis":{"summary":"Phòng khách có dấu hiệu ẩm gần cửa sổ."}}'::jsonb
);
select public.append_customer_kael_conversation_exchange(
  'c2960000-0000-4000-8000-000000000002', 'c2950000-0000-4000-8000-000000000002',
  'c2970000-0000-4000-8000-000000000012', 'Xin chào Kael.', 'Xin chào, tôi có thể giúp gì?'
);

insert into public.kael_worker_chat_turns (
  id, session_id, job_id, turn_index, role, content_type, text_content, safe_metadata
) values
  ('c2a00000-0000-4000-8000-000000000001', 'c2980000-0000-4000-8000-000000000001', null, 1, 'worker', 'text', 'Tôi thích hướng dẫn ngắn gọn.', '{}'),
  ('c2a00000-0000-4000-8000-000000000002', 'c2980000-0000-4000-8000-000000000001', null, 2, 'kael', 'text', 'Tôi sẽ trả lời ngắn gọn.', '{}'),
  ('c2a00000-0000-4000-8000-000000000003', 'c2980000-0000-4000-8000-000000000002', null, 1, 'worker', 'text', 'Phiên khác của Worker.', '{}'),
  ('c2a00000-0000-4000-8000-000000000004', 'c2980000-0000-4000-8000-000000000002', null, 2, 'kael', 'text', 'Phản hồi phiên khác.', '{}');

do $memory_write$
declare
  v_customer_source_id uuid;
begin
  select id into v_customer_source_id
  from public.kael_customer_conversation_turns
  where conversation_id = 'c2960000-0000-4000-8000-000000000001'
    and turn_index = 1 and role = 'customer';
  if v_customer_source_id is null
     or (select safe_metadata #>> '{normal_chat_image_analysis,source_turn_id}'
         from public.kael_customer_conversation_turns where id = v_customer_source_id) is distinct from v_customer_source_id::text
     or (select safe_metadata #>> '{normal_chat_image_analysis,source_turn_index}'
         from public.kael_customer_conversation_turns where id = v_customer_source_id) <> '1' then
    raise exception 'P299 Customer image analysis must remain attached to its exact source turn';
  end if;

  if not public.upsert_kael_normal_chat_session_memory('customer', 'c2950000-0000-4000-8000-000000000001', 'c2960000-0000-4000-8000-000000000001', 0, 2, 'Customer one session.', '[]'::jsonb)
    or not public.upsert_kael_normal_chat_session_memory('customer', 'c2950000-0000-4000-8000-000000000002', 'c2960000-0000-4000-8000-000000000002', 0, 2, 'Customer two session.', '[]'::jsonb)
    or not public.upsert_kael_normal_chat_session_memory('worker', 'c2950000-0000-4000-8000-000000000003', 'c2980000-0000-4000-8000-000000000001', 0, 2, 'Worker one session.', '[{"statement":"Short guidance preference.","source_turn_indices":[1],"source_turn_ids":["c2a00000-0000-4000-8000-000000000001"]}]'::jsonb)
    or not public.upsert_kael_normal_chat_session_memory('worker', 'c2950000-0000-4000-8000-000000000004', 'c2980000-0000-4000-8000-000000000002', 0, 2, 'Worker two session.', '[]'::jsonb) then
    raise exception 'P299 all four role/session memory partitions must be independently writable';
  end if;

  if public.upsert_kael_normal_chat_session_memory('worker', 'c2950000-0000-4000-8000-000000000003', 'c2980000-0000-4000-8000-000000000001', 0, 2, 'Stale writer.', '[]'::jsonb)
     or public.upsert_kael_normal_chat_session_memory('worker', 'c2950000-0000-4000-8000-000000000003', 'c2980000-0000-4000-8000-000000000001', 1, 2, 'Same-turn writer.', '[]'::jsonb) then
    raise exception 'P299 stale or non-advancing memory revision must not overwrite current memory';
  end if;

  begin
    perform public.upsert_kael_normal_chat_session_memory('customer', 'c2950000-0000-4000-8000-000000000002', 'c2960000-0000-4000-8000-000000000001', 0, 2, 'Cross-owner write.', '[]'::jsonb);
    raise exception 'P299 a Customer wrote memory to another Customer session';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.upsert_kael_normal_chat_session_memory('worker', 'c2950000-0000-4000-8000-000000000003', 'c2980000-0000-4000-8000-000000000001', 0, 3, 'Source beyond transcript.', '[]'::jsonb);
    raise exception 'P299 memory source beyond total_turns was accepted';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.upsert_kael_normal_chat_session_memory(null, 'c2950000-0000-4000-8000-000000000003', 'c2980000-0000-4000-8000-000000000001', 0, 2, 'Null role.', '[]'::jsonb);
    raise exception 'P299 null actor role was accepted';
  exception when sqlstate '22023' then null;
  end;
end;
$memory_write$;

reset role;

do $privileges$
declare
  v_rpc regprocedure := 'public.upsert_kael_normal_chat_session_memory(text,uuid,uuid,integer,integer,text,jsonb)'::regprocedure;
begin
  if v_rpc is null or not has_function_privilege('service_role', v_rpc, 'execute')
     or has_function_privilege('anon', v_rpc, 'execute')
     or has_function_privilege('authenticated', v_rpc, 'execute') then
    raise exception 'P299 memory RPC must be executable by service_role only';
  end if;
  if exists (select 1 from pg_catalog.pg_proc where oid = v_rpc and (not prosecdef or proconfig is distinct from array['search_path=""']::text[])) then
    raise exception 'P299 memory RPC must be definer-scoped with an empty search path';
  end if;
  if has_table_privilege('anon', 'public.kael_normal_chat_session_memory', 'select')
     or has_table_privilege('authenticated', 'public.kael_normal_chat_session_memory', 'insert,update,delete')
     or not has_table_privilege('service_role', 'public.kael_normal_chat_session_memory', 'select,insert,update,delete') then
    raise exception 'P299 memory table grants must allow private reads and service-role writes only';
  end if;
  if not exists (select 1 from pg_catalog.pg_index where indrelid = 'public.kael_normal_chat_session_memory'::regclass and indisprimary and pg_catalog.pg_get_indexdef(indexrelid) like '%actor_role, actor_id, session_id%') then
    raise exception 'P299 memory primary key must isolate actor role, actor, and session';
  end if;
end;
$privileges$;

set local role authenticated;
set local request.jwt.claim.sub = 'c2950000-0000-4000-8000-000000000001';
set local request.jwt.claim.role = 'authenticated';
do $customer_rls$
declare v_visible integer; v_other_session integer;
begin
  select count(*) into v_visible from public.kael_normal_chat_session_memory;
  select count(*) into v_other_session from public.kael_normal_chat_session_memory where session_id = 'c2960000-0000-4000-8000-000000000002';
  if v_visible <> 1 or v_other_session <> 0 then raise exception 'P299 Customer reads must stay inside the own Customer session'; end if;
  begin
    update public.kael_normal_chat_session_memory set summary = 'direct write' where actor_id = 'c2950000-0000-4000-8000-000000000001';
    raise exception 'P299 authenticated Customer updated private memory directly';
  exception when insufficient_privilege then null;
  end;
end;
$customer_rls$;

reset role;
set local role authenticated;
set local request.jwt.claim.sub = 'c2950000-0000-4000-8000-000000000003';
set local request.jwt.claim.role = 'authenticated';
do $worker_rls$
declare v_visible integer; v_other_role integer;
begin
  select count(*) into v_visible from public.kael_normal_chat_session_memory;
  select count(*) into v_other_role from public.kael_normal_chat_session_memory where actor_role = 'customer';
  if v_visible <> 1 or v_other_role <> 0 then raise exception 'P299 Worker reads must stay inside the own Worker session'; end if;
end;
$worker_rls$;

reset role;
set local role anon;
set local request.jwt.claim.sub = '';
set local request.jwt.claim.role = 'anon';
do $anonymous_denied$
begin
  begin
    perform 1 from public.kael_normal_chat_session_memory;
    raise exception 'P299 anonymous users read private normal-chat memory';
  exception when insufficient_privilege then null;
  end;
end;
$anonymous_denied$;

reset role;
rollback;
