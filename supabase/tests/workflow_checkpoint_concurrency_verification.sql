-- @pillar id: P436-workflow-checkpoint-concurrency-sql
-- @pillar invariant: Two real connections produce one CAS winner or one shared idempotent receipt, with no partial checkpoint.
-- @pillar authority: governance/RULES.md #0 and #1 | owner-authorized disposable PostgreSQL W06 tests
-- @pillar target: supabase/migrations/20261023020137_kael_workflow_durable_checkpoints.sql
-- @pillar layer: sql
-- @pillar siblings: P434-workflow-durable-checkpoints, P435-workflow-durable-checkpoints-sql
-- @pillar mutation: Remove the expected version comparison and both competing writers succeed.
-- This test leaves immutable synthetic history in a disposable database.
\set ON_ERROR_STOP on
select exists (select 1 from pg_extension where extname='dblink') as dblink_preexisting \gset
create extension if not exists dblink;
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('d4360000-0000-4000-8000-000000000001','authenticated','authenticated','workflow-p436@example.test','{"provider":"email","providers":["email"]}','{}',now(),now())
on conflict(id) do nothing;
set request.jwt.claim.role = 'service_role';
create temporary table checkpoint_races(name text primary key,request jsonb);
insert into checkpoint_races
select name, jsonb_build_object('operation','create','instanceId',gen_random_uuid(),'actorId','d4360000-0000-4000-8000-000000000001','actorRole','customer','jobId',null,'caseId',null,'idempotencyKey',gen_random_uuid(),'deadlineAt',clock_timestamp()+interval '4 minutes','definition',
'{"schemaVersion":"workflow-definition/v1","workflowId":"checkpoint_race_fixture","version":2,"owner":"kael.pipeline","roles":["customer"],"services":["electrical"],"rollout":"local_test","deadlineMs":300000,"trigger":"case_turn","input":{"fields":[]},"policyPins":[{"service":"electrical","policyId":"d4360000-0000-4000-8000-000000000901","version":1}],"capabilityRegistry":{"version":"1.0.0","sourceSha256":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},"capabilityPins":[],"budget":{"maxSteps":8,"maxCalls":0,"maxCostMicrousd":0,"maxDurationMs":300000},"approval":{"required":false,"actorRoles":["customer"],"expiresInMs":1000,"payloadBinding":"sha256","jobBinding":"required"},"entry":"start","terminalStates":["succeeded"],"nodes":[{"id":"start","kind":"validate","timeoutMs":100,"maxVisits":1},{"id":"middle","kind":"validate","timeoutMs":100,"maxVisits":1},{"id":"done","kind":"finish","terminalState":"succeeded","timeoutMs":100,"maxVisits":1}],"edges":[{"from":"start","to":"middle","kind":"success"},{"from":"start","to":"done","kind":"success"},{"from":"middle","to":"done","kind":"success"}]}'::jsonb)
from unnest(array['cas','idempotent']) name;
select public.kael_workflow_checkpoint_v1(request) from checkpoint_races;
update checkpoint_races set request=(request-array['definition','deadlineAt']) || jsonb_build_object('operation','transition','expectedVersion',0,'action','advance','nextNode','middle','idempotencyKey',gen_random_uuid());
select dblink_connect('workflow_a','host=127.0.0.1 port=5432 dbname=postgres user=postgres');
select dblink_connect('workflow_b','host=127.0.0.1 port=5432 dbname=postgres user=postgres');
select dblink_exec('workflow_a',$q$set request.jwt.claim.role = 'service_role'$q$);
select dblink_exec('workflow_b',$q$set request.jwt.claim.role = 'service_role'$q$);
create temporary table checkpoint_race_results(name text,side text,payload jsonb,failure text);
do $race$
declare
  v_row record;
  v_second jsonb;
begin
  for v_row in select * from checkpoint_races order by name loop
    v_second := case when v_row.name='cas' then jsonb_set(jsonb_set(v_row.request,'{idempotencyKey}',to_jsonb(gen_random_uuid())),'{nextNode}','"done"') else v_row.request end;
    perform dblink_send_query('workflow_a',format('with r as materialized (select public.kael_workflow_checkpoint_v1(%L::jsonb) payload) select r.payload::text from r cross join lateral (select pg_sleep(0.5) where r.payload is not null) s',v_row.request));
    perform pg_sleep(0.1);
    perform dblink_send_query('workflow_b',format('select public.kael_workflow_checkpoint_v1(%L::jsonb)::text',v_second));
    begin
      insert into checkpoint_race_results select v_row.name,'a',payload::jsonb,null from dblink_get_result('workflow_a') as t(payload text);
    exception when others then insert into checkpoint_race_results values(v_row.name,'a',null,sqlstate||' '||sqlerrm); end;
    begin
      insert into checkpoint_race_results select v_row.name,'b',payload::jsonb,null from dblink_get_result('workflow_b') as t(payload text);
    exception when others then insert into checkpoint_race_results values(v_row.name,'b',null,sqlstate||' '||sqlerrm); end;
    perform dblink_get_result('workflow_a');
    perform dblink_get_result('workflow_b');
  end loop;
  if (select count(*) from checkpoint_race_results where name='cas' and failure is null) <> 1
    or (select count(*) from checkpoint_race_results where name='cas' and failure like '40001%WORKFLOW_VERSION_CONFLICT%') <> 1 then
    raise exception 'CAS did not produce exactly one winner: %',(select jsonb_agg(to_jsonb(r)) from checkpoint_race_results r);
  end if;
  if (select count(*) from checkpoint_race_results where name='idempotent' and failure is null) <> 2
    or (select count(distinct payload) from checkpoint_race_results where name='idempotent') <> 1 then
    raise exception 'duplicate concurrent request did not share one receipt';
  end if;
  if exists (select 1 from checkpoint_races r where (select count(*) from private.kael_workflow_checkpoints c where c.instance_id=(r.request->>'instanceId')::uuid) <> 2) then
    raise exception 'concurrency duplicated or lost a checkpoint';
  end if;
end;
$race$;
select dblink_disconnect('workflow_a');
select dblink_disconnect('workflow_b');
select name,side,payload->>'instance_version' as instance_version,failure from checkpoint_race_results order by name,side;
\if :dblink_preexisting
\else
drop extension dblink;
\endif
