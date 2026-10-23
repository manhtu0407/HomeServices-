-- @pillar id: P435-workflow-durable-checkpoints-sql
-- @pillar invariant: Private workflow history is immutable, actor scoped, CAS guarded and replay safe without business effects.
-- @pillar authority: governance/RULES.md #0 and #1 | owner-authorized W06 local PostgreSQL persistence
-- @pillar target: supabase/migrations/20261023020137_kael_workflow_durable_checkpoints.sql
-- @pillar layer: sql
-- @pillar siblings: P434-workflow-durable-checkpoints, P432-workflow-definition-registry
-- @pillar mutation: Remove expected-version comparison and conflicting transitions succeed; remove request hash and conflicting idempotency is accepted.

begin;
set local statement_timeout = '20s';
set local request.jwt.claim.role = 'service_role';

do $fixtures$
declare v_actor uuid;
begin
  for i in 1..5 loop
    v_actor := ('d4350000-0000-4000-8000-' || lpad(i::text,12,'0'))::uuid;
    insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
      values(v_actor,'authenticated','authenticated','workflow-p435-'||i||'@example.test','{"provider":"email","providers":["email"]}','{}',now(),now());
    update public.profiles set role = (case when i=3 then 'worker' when i=4 then 'admin' when i=5 then 'admin_operator' else 'customer' end)::public.user_role where id=v_actor;
  end loop;
end;
$fixtures$;
insert into public.jobs(id,customer_id,worker_id,service_type,description,address_district,status,quote_mode)
values ('d4350000-0000-4000-8000-000000000101','d4350000-0000-4000-8000-000000000001','d4350000-0000-4000-8000-000000000003','electrical','Synthetic checkpoint fixture','q7','awaiting_customer_confirm','rfq');
insert into public.kael_chat_sessions(id,job_id,customer_id,service_type,status)
values ('d4350000-0000-4000-8000-000000000201','d4350000-0000-4000-8000-000000000101','d4350000-0000-4000-8000-000000000001','electrical','active');
insert into public.kael_worker_chat_sessions(id,job_id,worker_id,status)
values ('d4350000-0000-4000-8000-000000000202','d4350000-0000-4000-8000-000000000101','d4350000-0000-4000-8000-000000000003','active');

create function pg_temp.workflow_fail_checkpoint() returns trigger language plpgsql as $$
begin
  if current_setting('kawa.fail_checkpoint',true)='true' then raise exception 'WORKFLOW_INJECTED_FAILURE'; end if;
  return new;
end;
$$;
create trigger workflow_test_failure before insert on private.kael_workflow_checkpoints for each row execute function pg_temp.workflow_fail_checkpoint();

create function pg_temp.workflow_assert_error(p_request jsonb,p_message text) returns void language plpgsql as $$
begin
  begin
    perform public.kael_workflow_checkpoint_v1(p_request);
  exception when others then
    if sqlerrm <> p_message then raise exception 'expected %, received %',p_message,sqlerrm; end if;
    return;
  end;
  raise exception 'expected rejection: %',p_message;
end;
$$;

do $checks$
declare
  d jsonb := '{"schemaVersion":"workflow-definition/v1","workflowId":"checkpoint_fixture","version":1,"owner":"kael.pipeline","roles":["customer","worker","admin","admin_operator"],"services":["electrical"],"rollout":"local_test","deadlineMs":300000,"trigger":"case_turn","input":{"fields":[]},"policyPins":[{"service":"electrical","policyId":"d4350000-0000-4000-8000-000000000901","version":1}],"capabilityRegistry":{"version":"1.0.0","sourceSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},"capabilityPins":[],"budget":{"maxSteps":8,"maxCalls":0,"maxCostMicrousd":0,"maxDurationMs":300000},"approval":{"required":false,"actorRoles":["customer"],"expiresInMs":1000,"payloadBinding":"sha256","jobBinding":"required"},"entry":"start","terminalStates":["succeeded","expired","exhausted"],"nodes":[{"id":"start","kind":"validate","timeoutMs":100,"maxVisits":2},{"id":"wait","kind":"wait_event","event":"worker_accepted","timeoutMs":100,"maxVisits":1},{"id":"done","kind":"finish","terminalState":"succeeded","timeoutMs":100,"maxVisits":1}],"edges":[{"from":"start","to":"wait","kind":"success"},{"from":"start","to":"start","kind":"retry","maxAttempts":1},{"from":"wait","to":"done","kind":"event"}]}'::jsonb;
  c jsonb;
  s jsonb;
  t jsonb;
  r jsonb;
  e jsonb;
  before_count integer;
  role_name text;
  table_name text;
begin
  c := jsonb_build_object('operation','create','instanceId','d4350000-0000-4000-8000-000000000301','actorId','d4350000-0000-4000-8000-000000000001','actorRole','customer','jobId','d4350000-0000-4000-8000-000000000101','caseId','d4350000-0000-4000-8000-000000000201','idempotencyKey','d4350000-0000-4000-8000-000000000401','deadlineAt',clock_timestamp()+interval '4 minutes','definition',d);
  perform pg_temp.workflow_assert_error(c || jsonb_build_object('instanceId',gen_random_uuid(),'definition',jsonb_set(jsonb_set(d,'{workflowId}','"duration_probe"'),'{budget,maxDurationMs}','1000')),'INVALID_WORKFLOW_DEADLINE');
  r := public.kael_workflow_checkpoint_v1(c);
  if r->>'instance_version' <> '0' or r->>'checkpoint' <> 'start' then raise exception 'creation checkpoint missing'; end if;
  if public.kael_workflow_checkpoint_v1(c) <> r then raise exception 'create replay changed logical result'; end if;
  perform pg_temp.workflow_assert_error(jsonb_set(c,'{deadlineAt}',to_jsonb(clock_timestamp()+interval '3 minutes')),'WORKFLOW_IDEMPOTENCY_CONFLICT');
  s := c - array['definition','deadlineAt','idempotencyKey']; s := jsonb_set(s,'{operation}','"load"');
  if (public.kael_workflow_checkpoint_v1(s)->'definition') <> d then raise exception 'pinned definition missing'; end if;
  perform pg_temp.workflow_assert_error(jsonb_set(s,'{actorId}','"d4350000-0000-4000-8000-000000000002"'),'WORKFLOW_JOB_SCOPE');
  perform pg_temp.workflow_assert_error(jsonb_set(s,'{actorRole}','"worker"'),'WORKFLOW_ACTOR_SCOPE');
  perform pg_temp.workflow_assert_error(jsonb_set(s,'{jobId}','"d4350000-0000-4000-8000-000000000999"'),'WORKFLOW_JOB_SCOPE');
  perform pg_temp.workflow_assert_error(jsonb_set(s,'{caseId}','"d4350000-0000-4000-8000-000000000999"'),'WORKFLOW_CASE_SCOPE');
  perform pg_temp.workflow_assert_error(jsonb_set(c,'{instanceId}','"d4350000-0000-4000-8000-000000000302"') || jsonb_build_object('definition',jsonb_set(d,'{policyPins,0,version}','2')),'WORKFLOW_VERSION_IMMUTABLE');
  t := s || '{"operation":"transition","expectedVersion":0,"idempotencyKey":"d4350000-0000-4000-8000-000000000402","action":"advance","nextNode":"wait"}';
  before_count := (select count(*) from private.kael_workflow_checkpoints);
  perform pg_temp.workflow_assert_error(jsonb_set(t,'{nextNode}','"done"'),'WORKFLOW_INVALID_TRANSITION');
  if (select count(*) from private.kael_workflow_checkpoints) <> before_count then raise exception 'rejected transition wrote history'; end if;
  r := public.kael_workflow_checkpoint_v1(t);
  if r->>'instance_version' <> '1' or r->>'status' <> 'waiting' then raise exception 'checkpoint transition not durable'; end if;
  if public.kael_workflow_checkpoint_v1(t) <> r then raise exception 'transition replay changed receipt'; end if;
  perform pg_temp.workflow_assert_error(jsonb_set(t,'{nextNode}','"start"'),'WORKFLOW_IDEMPOTENCY_CONFLICT');
  perform pg_temp.workflow_assert_error(jsonb_set(t,'{idempotencyKey}','"d4350000-0000-4000-8000-000000000403"'),'WORKFLOW_VERSION_CONFLICT');
  e := s || '{"operation":"transition","expectedVersion":1,"idempotencyKey":"d4350000-0000-4000-8000-000000000404","action":"advance","nextNode":"done","event":{"id":"d4350000-0000-4000-8000-000000000501","instanceId":"d4350000-0000-4000-8000-000000000301","sequence":1,"kind":"worker_accepted"}}';
  perform pg_temp.workflow_assert_error(e-'event','WORKFLOW_INVALID_TRANSITION');
  perform pg_temp.workflow_assert_error(jsonb_set(e,'{event,sequence}','2'),'WORKFLOW_EVENT_ORDER');
  perform pg_temp.workflow_assert_error(jsonb_set(e,'{event,sequence}','0'),'WORKFLOW_EVENT_ORDER');
  perform pg_temp.workflow_assert_error(jsonb_set(e,'{event,instanceId}','"d4350000-0000-4000-8000-000000000302"'),'WORKFLOW_EVENT_ORDER');
  perform pg_temp.workflow_assert_error(jsonb_set(e,'{event,kind}','"worker_declined"'),'WORKFLOW_EVENT_ORDER');
  r := public.kael_workflow_checkpoint_v1(e);
  if r->>'status' <> 'succeeded' or r->>'event_sequence' <> '1' then raise exception 'event completion missing'; end if;
  if public.kael_workflow_checkpoint_v1(e) <> r then raise exception 'event duplicate not deduplicated'; end if;
  perform pg_temp.workflow_assert_error(e || '{"expectedVersion":2,"idempotencyKey":"d4350000-0000-4000-8000-000000000405"}','WORKFLOW_TERMINAL');
  if jsonb_array_length(public.kael_workflow_checkpoint_v1(s)->'checkpoints') <> 3 then raise exception 'recovery replay differs'; end if;

  c := jsonb_set(c,'{instanceId}','"d4350000-0000-4000-8000-000000000302"');
  c := jsonb_set(c,'{definition}',jsonb_set(d,'{version}','2'));
  perform public.kael_workflow_checkpoint_v1(c);
  if public.kael_workflow_checkpoint_v1(s)->'definition'->>'version' <> '1' then raise exception 'new definition changed in-flight pins'; end if;
  t := jsonb_set(t,'{instanceId}','"d4350000-0000-4000-8000-000000000302"') || '{"action":"retry","nextNode":"start"}';
  r := public.kael_workflow_checkpoint_v1(t);
  if r->>'retry_count' <> '1' or r->>'retry_at' is null then raise exception 'retry/backoff missing'; end if;
  t := t || '{"expectedVersion":1,"idempotencyKey":"d4350000-0000-4000-8000-000000000406"}';
  perform pg_temp.workflow_assert_error(t,'WORKFLOW_BACKOFF');
  perform pg_sleep(0.15);
  r := public.kael_workflow_checkpoint_v1(t);
  if r->>'status' <> 'exhausted' or r->>'terminal_reason' <> 'retry_exhausted' then raise exception 'retry exhaustion unbounded'; end if;

  c := jsonb_set(c,'{instanceId}','"d4350000-0000-4000-8000-000000000303"') || jsonb_build_object('deadlineAt',clock_timestamp()+interval '70 milliseconds');
  perform public.kael_workflow_checkpoint_v1(c);
  t := jsonb_set(t,'{instanceId}','"d4350000-0000-4000-8000-000000000303"') || '{"expectedVersion":0}';
  perform pg_sleep(0.1);
  perform pg_temp.workflow_assert_error(t,'WORKFLOW_DEADLINE_EXPIRED');
  r := public.kael_workflow_checkpoint_v1((t-array['nextNode']) || '{"action":"timeout"}');
  if r->>'status' <> 'expired' then raise exception 'timeout not durable'; end if;

  c := s || jsonb_build_object('operation','create','instanceId','d4350000-0000-4000-8000-000000000307','definition',d,'idempotencyKey',gen_random_uuid(),'deadlineAt',clock_timestamp()+interval '1 minute');
  perform public.kael_workflow_checkpoint_v1(c);
  t := (c-array['definition','deadlineAt']) || '{"operation":"transition","expectedVersion":0,"action":"advance","nextNode":"wait"}' || jsonb_build_object('idempotencyKey',gen_random_uuid());
  perform set_config('kawa.fail_checkpoint','true',true);
  perform pg_temp.workflow_assert_error(t,'WORKFLOW_INJECTED_FAILURE');
  perform set_config('kawa.fail_checkpoint','false',true);
  r := public.kael_workflow_checkpoint_v1((c-array['definition','deadlineAt','idempotencyKey']) || '{"operation":"load"}');
  if r->'state'->>'instance_version' <> '0' or jsonb_array_length(r->'checkpoints') <> 1 then raise exception 'checkpoint failure partially committed state'; end if;
  begin
    perform public.kael_workflow_checkpoint_v1(c || jsonb_build_object('instanceId',gen_random_uuid(),'definition',jsonb_set(jsonb_set(d,'{workflowId}','"privacy_probe"'),'{input}', '{"fields":[],"rawPrompt":"private input"}')));
    raise exception 'nested prompt entered durable definition';
  exception when check_violation then null; end;
  if exists (select 1 from private.kael_workflow_definitions where workflow_id='privacy_probe') then raise exception 'privacy failure partially inserted definition'; end if;
  c := c || '{"instanceId":"d4350000-0000-4000-8000-000000000308","actorId":"d4350000-0000-4000-8000-000000000003","actorRole":"worker","jobId":"d4350000-0000-4000-8000-000000000101","caseId":"d4350000-0000-4000-8000-000000000202"}';
  r := public.kael_workflow_checkpoint_v1(c);
  if r->>'worker_case_id' <> 'd4350000-0000-4000-8000-000000000202' then raise exception 'worker case not bound'; end if;
  perform pg_temp.workflow_assert_error(c || '{"caseId":"d4350000-0000-4000-8000-000000000201"}','WORKFLOW_CASE_SCOPE');

  for i in 3..5 loop
    c := c || jsonb_build_object('instanceId',('d4350000-0000-4000-8000-'||lpad((600+i)::text,12,'0'))::uuid,
      'actorId',('d4350000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
      'actorRole',case when i=3 then 'worker' when i=4 then 'admin' else 'admin_operator' end,
      'jobId',null,'caseId',null,'deadlineAt',clock_timestamp()+interval '1 minute');
    r := public.kael_workflow_checkpoint_v1(c);
    if r->>'actor_role' <> c->>'actorRole' then raise exception 'role-scoped creation failed'; end if;
    perform pg_temp.workflow_assert_error(c || '{"jobId":"d4350000-0000-4000-8000-000000000999"}',case when i=3 then 'WORKFLOW_JOB_SCOPE' else 'WORKFLOW_ADMIN_SCOPE' end);
  end loop;
  foreach role_name in array array['anon','authenticated','service_role'] loop
    foreach table_name in array array['kael_workflow_definitions','kael_workflow_instances','kael_workflow_checkpoints'] loop
      if has_table_privilege(role_name,'private.'||table_name,'SELECT,INSERT,UPDATE,DELETE') then raise exception 'private table broadly granted'; end if;
      if not (select relrowsecurity from pg_class where oid=('private.'||table_name)::regclass) then raise exception 'RLS disabled'; end if;
    end loop;
    if has_function_privilege(role_name,'public.kael_workflow_checkpoint_v1(jsonb)','EXECUTE') <> (role_name='service_role') then raise exception 'RPC grant wrong'; end if;
  end loop;
  begin update private.kael_workflow_definitions set definition='{}' where workflow_id='checkpoint_fixture'; raise exception 'definition update accepted'; exception when integrity_constraint_violation then null; end;
  begin delete from private.kael_workflow_checkpoints; raise exception 'history deletion accepted'; exception when integrity_constraint_violation then null; end;
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform pg_temp.workflow_assert_error(s,'WORKFLOW_SERVER_ONLY');
  delete from public.kael_chat_sessions where id='d4350000-0000-4000-8000-000000000201';
  if found is not true then raise exception 'existing customer Case deletion did not complete'; end if;
  delete from public.kael_worker_chat_sessions where id='d4350000-0000-4000-8000-000000000202';
  if found is not true then raise exception 'existing worker Case deletion did not complete'; end if;
end;
$checks$;


set local request.jwt.claim.role = 'service_role';


do $job_without_case$
declare d jsonb; c jsonb; receipt jsonb;
begin
  select definition into strict d from private.kael_workflow_definitions where workflow_id='checkpoint_fixture' and definition_version=1;
  c := jsonb_build_object('operation','create','instanceId',gen_random_uuid(),'actorId','d4350000-0000-4000-8000-000000000001','actorRole','customer','jobId','d4350000-0000-4000-8000-000000000101','caseId',null,'definition',d,'deadlineAt',clock_timestamp()+interval '1 minute','idempotencyKey',gen_random_uuid());
  receipt := public.kael_workflow_checkpoint_v1(c);
  if receipt->>'job_id' <> 'd4350000-0000-4000-8000-000000000101' or receipt->'customer_case_id' <> 'null'::jsonb then raise exception 'job-only scope changed'; end if;
  if public.kael_workflow_checkpoint_v1(c) <> receipt then raise exception 'job-only create replay changed'; end if;
end;
$job_without_case$;

do $failure_branch$
declare
  d jsonb;
  c jsonb;
  t jsonb;
  r jsonb;
begin
  select definition into strict d from private.kael_workflow_definitions where workflow_id='checkpoint_fixture' and definition_version=1;
  d := d || '{"workflowId":"failure_branch_fixture","terminalStates":["succeeded","declined"],"nodes":[{"id":"start","kind":"validate","timeoutMs":100,"maxVisits":1},{"id":"done","kind":"finish","timeoutMs":100,"maxVisits":1,"terminalState":"succeeded"},{"id":"declined","kind":"finish","timeoutMs":100,"maxVisits":1,"terminalState":"declined"}],"edges":[{"from":"start","to":"done","kind":"success"},{"from":"start","to":"declined","kind":"failure"}]}';
  c := jsonb_build_object('operation','create','instanceId',gen_random_uuid(),'actorId','d4350000-0000-4000-8000-000000000001','actorRole','customer','jobId',null,'caseId',null,'definition',d,'deadlineAt',clock_timestamp()+interval '1 minute','idempotencyKey',gen_random_uuid());
  perform public.kael_workflow_checkpoint_v1(c);
  t := (c-array['definition','deadlineAt']) || jsonb_build_object('operation','transition','expectedVersion',0,'idempotencyKey',gen_random_uuid(),'action','failure','nextNode','declined');
  perform pg_temp.workflow_assert_error(t || '{"action":"advance"}','WORKFLOW_INVALID_TRANSITION');
  perform pg_temp.workflow_assert_error(t || '{"nextNode":"done"}','WORKFLOW_INVALID_TRANSITION');
  perform pg_temp.workflow_assert_error(t || jsonb_build_object('event',jsonb_build_object('id',gen_random_uuid(),'instanceId',c->>'instanceId','sequence',1,'kind','worker_accepted')),'WORKFLOW_INVALID_TRANSITION');
  r := public.kael_workflow_checkpoint_v1(t);
  if r->>'status' <> 'declined' or r->>'checkpoint' <> 'declined' or r->>'instance_version' <> '1' or r->>'terminal_reason' <> 'node_finished' then raise exception 'failure branch not durably terminal'; end if;
  if public.kael_workflow_checkpoint_v1(t) <> r then raise exception 'failure receipt replay changed'; end if;
  perform pg_temp.workflow_assert_error(t || jsonb_build_object('idempotencyKey',gen_random_uuid()),'WORKFLOW_VERSION_CONFLICT');
  if jsonb_array_length(public.kael_workflow_checkpoint_v1((c-array['definition','deadlineAt','idempotencyKey']) || '{"operation":"load"}')->'checkpoints') <> 2 then raise exception 'failure duplicated transition'; end if;
end;
$failure_branch$;


do $lifecycle_workers$
declare w uuid;
begin
  for i in 1..18 loop
    w := ('d4350000-0000-4000-8000-'||lpad((800+i)::text,12,'0'))::uuid;
    insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values(w,'authenticated','authenticated','checkpoint-coverage-'||i||'@example.test','{"provider":"email","providers":["email"]}','{}',now(),now());
    update public.profiles set role='worker' where id=w;
    insert into public.worker_profiles(id,service_types,selected_service_types,years_experience,districts,problem_specializations,is_approved,is_available,legal_name,date_of_birth,verification_status)
    values(w,array['electrical']::public.service_type[],array['electrical']::public.service_type[],5,array['q7'],array[]::text[],true,true,'Synthetic coverage worker','1990-01-01','approved');
    perform public.record_worker_matching_heartbeat(w,now());
  end loop;
end;
$lifecycle_workers$;

do $case_lifecycle$
declare
  d jsonb;
  c jsonb;
  s jsonb;
  t jsonb;
  initial jsonb;
  receipt jsonb;
  recovered jsonb;
  confirmed record;
  bound_scope jsonb;
  problem uuid;
  session_id constant uuid := 'd4350000-0000-4000-8000-000000000203';
  customer_id constant uuid := 'd4350000-0000-4000-8000-000000000001';
begin
  select definition into strict d from private.kael_workflow_definitions where workflow_id='checkpoint_fixture' and definition_version=1;
  select id into strict problem from public.service_problems where service_type='electrical' and slug='other_electrical' and is_active;
  insert into public.customer_profiles(id,building_name,unit_number,district) values(customer_id,'Synthetic building','T1','q7') on conflict(id) do nothing;
  insert into public.kael_chat_sessions(id,customer_id,service_type,status,case_phase,diagnosis_scope,scheduled_at,safe_metadata)
  values(session_id,customer_id,'electrical','active','offer_review',
    '{"version":1,"service_type":"electrical","profile_id":"electrical-diagnose","case_phase":"offer_review","facts":{},"missing_facts":[],"evidence":[],"scope_summary":"Synthetic electrical inspection and worker quotation.","quote_ready":true,"quote_blockers":["worker_quote_required"],"worker_requirements":[],"next_action":{"kind":"request_worker_quote"}}',
    now()+interval '1 day','{"address_district":"q7","address_label":"Synthetic building T1","problem_chips":["other_electrical"]}');
  insert into public.kael_chat_turns(session_id,turn_index,role,content_type,safe_metadata) values(session_id,1,'kael','analysis',jsonb_build_object('service_problem_id',problem));
  c := jsonb_build_object('operation','create','instanceId',gen_random_uuid(),'actorId',customer_id,'actorRole','customer','jobId',null,'caseId',session_id,'definition',d,'deadlineAt',clock_timestamp()+interval '1 minute','idempotencyKey',gen_random_uuid());
  initial := public.kael_workflow_checkpoint_v1(c);
  s := (c-array['definition','deadlineAt','idempotencyKey']) || '{"operation":"load"}';
  t := s || jsonb_build_object('operation','transition','expectedVersion',0,'idempotencyKey',gen_random_uuid(),'action','advance','nextNode','wait');
  receipt := public.kael_workflow_checkpoint_v1(t);
  select * into strict confirmed from public.confirm_kael_chat_durable_atomic_v4(session_id,customer_id,'kael-confirm:'||session_id||':'||customer_id,'rfq_request',null,'prompt_if_saved');
  if not confirmed.ok or confirmed.job_id is null or not exists(select 1 from public.kael_chat_sessions where id=session_id and job_id=confirmed.job_id) then raise exception 'normal confirmation did not attach Job: %',row_to_json(confirmed); end if;
  recovered := public.kael_workflow_checkpoint_v1(s);
  if recovered->'state' <> receipt or recovered->'checkpoints' <> jsonb_build_array(initial,receipt) or recovered->'state'->'job_id' <> 'null'::jsonb then raise exception 'confirmation rewrote historical binding or checkpoint'; end if;
  if public.kael_workflow_checkpoint_v1(c) <> initial or public.kael_workflow_checkpoint_v1(t) <> receipt then raise exception 'confirmation broke original request replay'; end if;
  perform pg_temp.workflow_assert_error(s || '{"actorId":"d4350000-0000-4000-8000-000000000002"}','WORKFLOW_CASE_SCOPE');
  perform pg_temp.workflow_assert_error(s || jsonb_build_object('jobId',confirmed.job_id),'WORKFLOW_INSTANCE_SCOPE');
  perform pg_temp.workflow_assert_error(s || '{"jobId":"d4350000-0000-4000-8000-000000000101"}','WORKFLOW_CASE_SCOPE');
  perform pg_temp.workflow_assert_error(s || '{"jobId":"d4350000-0000-4000-8000-000000000999"}','WORKFLOW_JOB_SCOPE');
  perform pg_temp.workflow_assert_error(s || '{"caseId":null}','WORKFLOW_INSTANCE_SCOPE');
  perform pg_temp.workflow_assert_error(c || jsonb_build_object('instanceId',gen_random_uuid()),'WORKFLOW_CASE_SCOPE');
  perform pg_temp.workflow_assert_error(t || jsonb_build_object('idempotencyKey',gen_random_uuid()),'WORKFLOW_VERSION_CONFLICT');
  t := s || jsonb_build_object('operation','transition','expectedVersion',1,'idempotencyKey',gen_random_uuid(),'action','advance','nextNode','done','event',jsonb_build_object('id',gen_random_uuid(),'instanceId',c->>'instanceId','sequence',1,'kind','worker_accepted'));
  perform pg_temp.workflow_assert_error(jsonb_set(t,'{event,sequence}','0'),'WORKFLOW_EVENT_ORDER');
  perform pg_temp.workflow_assert_error(jsonb_set(t,'{event,kind}','"worker_declined"'),'WORKFLOW_EVENT_ORDER');
  receipt := public.kael_workflow_checkpoint_v1(t);
  if receipt->>'status' <> 'succeeded' or receipt->>'instance_version' <> '2' then raise exception 'historical instance did not resume'; end if;
  if public.kael_workflow_checkpoint_v1(t) <> receipt then raise exception 'duplicate event changed receipt'; end if;
  if jsonb_array_length(public.kael_workflow_checkpoint_v1(s)->'checkpoints') <> 3 then raise exception 'duplicate wrote extra checkpoint'; end if;
  bound_scope := c || jsonb_build_object('instanceId',gen_random_uuid(),'jobId',confirmed.job_id,'idempotencyKey',gen_random_uuid());
  perform public.kael_workflow_checkpoint_v1(bound_scope);
  bound_scope := (bound_scope-array['definition','deadlineAt','idempotencyKey']) || '{"operation":"load"}';
  update public.kael_chat_sessions set job_id='d4350000-0000-4000-8000-000000000101' where id=session_id;
  perform pg_temp.workflow_assert_error(bound_scope,'WORKFLOW_CASE_SCOPE');
  update public.kael_chat_sessions set job_id=confirmed.job_id where id=session_id;
  update public.kael_chat_sessions set customer_id='d4350000-0000-4000-8000-000000000002' where id=session_id;
  perform pg_temp.workflow_assert_error(s,'WORKFLOW_CASE_SCOPE');
  update public.kael_chat_sessions set customer_id='d4350000-0000-4000-8000-000000000001' where id=session_id;
  update public.jobs set customer_id='d4350000-0000-4000-8000-000000000002' where id=confirmed.job_id;
  perform pg_temp.workflow_assert_error(s,'WORKFLOW_JOB_SCOPE');
end;
$case_lifecycle$;


do $worker_case_lifecycle$
declare d jsonb; c jsonb; s jsonb; original jsonb;
begin
  select definition into strict d from private.kael_workflow_definitions where workflow_id='checkpoint_fixture' and definition_version=1;
  insert into public.kael_worker_chat_sessions(id,worker_id,status) values('d4350000-0000-4000-8000-000000000204','d4350000-0000-4000-8000-000000000003','active');
  c := jsonb_build_object('operation','create','instanceId',gen_random_uuid(),'actorId','d4350000-0000-4000-8000-000000000003','actorRole','worker','jobId',null,'caseId','d4350000-0000-4000-8000-000000000204','definition',d,'deadlineAt',clock_timestamp()+interval '1 minute','idempotencyKey',gen_random_uuid());
  original := public.kael_workflow_checkpoint_v1(c);
  s := (c-array['definition','deadlineAt','idempotencyKey']) || '{"operation":"load"}';
  update public.kael_worker_chat_sessions set job_id='d4350000-0000-4000-8000-000000000101' where id='d4350000-0000-4000-8000-000000000204';
  if public.kael_workflow_checkpoint_v1(s)->'state' <> original or public.kael_workflow_checkpoint_v1(c) <> original then raise exception 'worker historical recovery failed'; end if;
  perform pg_temp.workflow_assert_error(s || '{"jobId":"d4350000-0000-4000-8000-000000000101"}','WORKFLOW_INSTANCE_SCOPE');
  update public.jobs set worker_id=null where id='d4350000-0000-4000-8000-000000000101';
  perform pg_temp.workflow_assert_error(s,'WORKFLOW_JOB_SCOPE');
end;
$worker_case_lifecycle$;

set local role authenticated;
do $$
begin
  begin perform public.kael_workflow_checkpoint_v1('{}'); raise exception 'authenticated RPC permitted'; exception when insufficient_privilege then null; end;
  begin perform 1 from private.kael_workflow_instances; raise exception 'authenticated table readable'; exception when insufficient_privilege then null; end;
end;
$$;
reset role;
set local role anon;
do $$
begin
  begin perform public.kael_workflow_checkpoint_v1('{}'); raise exception 'anonymous RPC permitted'; exception when insufficient_privilege then null; end;
  begin perform 1 from private.kael_workflow_instances; raise exception 'anonymous table readable'; exception when insufficient_privilege then null; end;
end;
$$;
reset role;
select 'W06 transactional replay, CAS, idempotency, ordering, scope, grants, RLS and history checks passed' as result;
rollback;
