create extension if not exists pg_jsonschema with schema extensions;

create table private.kael_workflow_definitions (
  workflow_id text not null check (workflow_id ~ '^[a-z][a-z0-9_]{0,63}$'),
  definition_version integer not null check (definition_version between 1 and 1000000),
  definition jsonb not null check (jsonb_typeof(definition) = 'object' and octet_length(definition::text) <= 65536),
  created_at timestamptz not null default clock_timestamp(),
  primary key (workflow_id, definition_version),
  check (extensions.jsonb_matches_schema('{"$schema":"http://json-schema.org/draft-07/schema#","type":"object","properties":{"schemaVersion":{"type":"string","const":"workflow-definition/v1"},"workflowId":{"type":"string","pattern":"^[a-z][a-z0-9_]{0,63}$"},"version":{"type":"integer","minimum":1,"maximum":1000000},"owner":{"type":"string","pattern":"^[a-z][a-z0-9_.]{1,63}$"},"roles":{"minItems":1,"maxItems":4,"type":"array","items":{"type":"string","enum":["customer","worker","admin","admin_operator"]}},"services":{"minItems":1,"maxItems":6,"type":"array","items":{"type":"string","enum":["electrical","plumbing","cleaning","hvac","upholstery","handyman"]}},"rollout":{"type":"string","enum":["local_test","shadow_read_only"]},"deadlineMs":{"type":"integer","minimum":1,"maximum":300000},"trigger":{"type":"string","enum":["case_created","case_turn","worker_offer","job_event"]},"input":{"type":"object","properties":{"fields":{"maxItems":16,"type":"array","items":{"oneOf":[{"type":"object","properties":{"name":{"type":"string","pattern":"^[a-z][a-z0-9_]{0,63}$"},"type":{"type":"string","const":"identifier"},"required":{"type":"boolean"}},"required":["name","type","required"],"additionalProperties":false},{"type":"object","properties":{"name":{"type":"string","pattern":"^[a-z][a-z0-9_]{0,63}$"},"type":{"type":"string","const":"boolean"},"required":{"type":"boolean"}},"required":["name","type","required"],"additionalProperties":false},{"type":"object","properties":{"name":{"type":"string","pattern":"^[a-z][a-z0-9_]{0,63}$"},"type":{"type":"string","const":"integer"},"required":{"type":"boolean"},"min":{"type":"integer","minimum":-1000000,"maximum":1000000},"max":{"type":"integer","minimum":-1000000,"maximum":1000000}},"required":["name","type","required","min","max"],"additionalProperties":false},{"type":"object","properties":{"name":{"type":"string","pattern":"^[a-z][a-z0-9_]{0,63}$"},"type":{"type":"string","const":"choice"},"required":{"type":"boolean"},"values":{"minItems":1,"maxItems":16,"type":"array","items":{"type":"string","pattern":"^[a-z][a-z0-9_]{0,63}$"}}},"required":["name","type","required","values"],"additionalProperties":false}]}}},"required":["fields"],"additionalProperties":false},"policyPins":{"minItems":1,"maxItems":6,"type":"array","items":{"type":"object","properties":{"service":{"type":"string","enum":["electrical","plumbing","cleaning","hvac","upholstery","handyman"]},"policyId":{"type":"string","format":"uuid","pattern":"^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$"},"version":{"type":"integer","minimum":1,"maximum":1000000}},"required":["service","policyId","version"],"additionalProperties":false}},"capabilityRegistry":{"type":"object","properties":{"version":{"type":"string","const":"1.0.0"},"sourceSha256":{"type":"string","pattern":"^[a-f0-9]{64}$"}},"required":["version","sourceSha256"],"additionalProperties":false},"capabilityPins":{"maxItems":32,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","maxLength":160,"pattern":"^mobile\\.route\\.[A-Za-z][A-Za-z0-9.]*$"},"version":{"type":"string","const":"1.0.0"}},"required":["id","version"],"additionalProperties":false}},"budget":{"type":"object","properties":{"maxSteps":{"type":"integer","minimum":1,"maximum":64},"maxCalls":{"type":"integer","minimum":0,"maximum":16},"maxCostMicrousd":{"type":"integer","minimum":0,"maximum":1000000},"maxDurationMs":{"type":"integer","minimum":1,"maximum":300000}},"required":["maxSteps","maxCalls","maxCostMicrousd","maxDurationMs"],"additionalProperties":false},"approval":{"type":"object","properties":{"required":{"type":"boolean"},"actorRoles":{"minItems":1,"maxItems":4,"type":"array","items":{"type":"string","enum":["customer","worker","admin","admin_operator"]}},"expiresInMs":{"type":"integer","minimum":1,"maximum":300000},"payloadBinding":{"type":"string","const":"sha256"},"jobBinding":{"type":"string","const":"required"}},"required":["required","actorRoles","expiresInMs","payloadBinding","jobBinding"],"additionalProperties":false},"entry":{"type":"string","pattern":"^[a-z][a-z0-9_]{0,63}$"},"terminalStates":{"minItems":1,"maxItems":6,"type":"array","items":{"type":"string","enum":["succeeded","declined","failed","expired","escalated","exhausted"]}},"nodes":{"minItems":1,"maxItems":32,"type":"array","items":{"type":"object","properties":{"id":{"type":"string","pattern":"^[a-z][a-z0-9_]{0,63}$"},"kind":{"type":"string","enum":["classify","retrieve","reason","validate","request_approval","execute_capability","wait_event","emit_event","finish"]},"timeoutMs":{"type":"integer","minimum":1,"maximum":10000},"maxVisits":{"type":"integer","minimum":1,"maximum":3},"capabilityId":{"type":"string","maxLength":160,"pattern":"^mobile\\.route\\.[A-Za-z][A-Za-z0-9.]*$"},"event":{"type":"string","enum":["worker_accepted","worker_declined","no_worker","deadline_elapsed","approval_received"]},"terminalState":{"type":"string","enum":["succeeded","declined","failed","expired","escalated","exhausted"]}},"required":["id","kind","timeoutMs","maxVisits"],"additionalProperties":false}},"edges":{"maxItems":96,"type":"array","items":{"oneOf":[{"type":"object","properties":{"from":{"type":"string","pattern":"^[a-z][a-z0-9_]{0,63}$"},"to":{"type":"string","pattern":"^[a-z][a-z0-9_]{0,63}$"},"kind":{"type":"string","enum":["success","failure","approved","event"]}},"required":["from","to","kind"],"additionalProperties":false},{"type":"object","properties":{"from":{"type":"string","pattern":"^[a-z][a-z0-9_]{0,63}$"},"to":{"type":"string","pattern":"^[a-z][a-z0-9_]{0,63}$"},"kind":{"type":"string","const":"retry"},"maxAttempts":{"type":"integer","minimum":1,"maximum":2}},"required":["from","to","kind","maxAttempts"],"additionalProperties":false}]}}},"required":["schemaVersion","workflowId","version","owner","roles","services","rollout","deadlineMs","trigger","input","policyPins","capabilityRegistry","capabilityPins","budget","approval","entry","terminalStates","nodes","edges"],"additionalProperties":false}'::json, definition))
);

create table private.kael_workflow_instances (
  id uuid primary key,
  workflow_id text not null,
  definition_version integer not null,
  actor_id uuid not null,
  actor_role public.user_role not null,
  job_id uuid,
  customer_case_id uuid,
  worker_case_id uuid,
  instance_version integer not null default 0 check (instance_version between 0 and 64),
  checkpoint text not null check (checkpoint ~ '^[a-z][a-z0-9_]{0,63}$'),
  status text not null check (status in ('active','waiting','succeeded','declined','failed','expired','escalated','exhausted')),
  terminal_reason text check (terminal_reason in ('node_finished','deadline_elapsed','retry_exhausted','step_exhausted')),
  deadline_at timestamptz not null,
  retry_count integer not null default 0 check (retry_count between 0 and 2),
  retry_at timestamptz,
  event_sequence integer not null default 0 check (event_sequence between 0 and 64),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key (workflow_id, definition_version) references private.kael_workflow_definitions,
  check (not (customer_case_id is not null and worker_case_id is not null)),
  check ((status in ('active','waiting')) = (terminal_reason is null))
);

create table private.kael_workflow_checkpoints (
  instance_id uuid not null references private.kael_workflow_instances(id),
  instance_version integer not null check (instance_version between 0 and 64),
  idempotency_key uuid not null,
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  event_id uuid,
  event_kind text check (event_kind in ('worker_accepted','worker_declined','no_worker','deadline_elapsed','approval_received')),
  event_sequence integer,
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (instance_id, instance_version),
  unique (instance_id, idempotency_key),
  unique (instance_id, event_id),
  unique (instance_id, event_sequence),
  check ((event_id is null and event_kind is null and event_sequence is null)
    or (event_id is not null and event_kind is not null and event_sequence > 0))
);

alter table private.kael_workflow_definitions enable row level security;
alter table private.kael_workflow_instances enable row level security;
alter table private.kael_workflow_checkpoints enable row level security;
revoke all on private.kael_workflow_definitions, private.kael_workflow_instances, private.kael_workflow_checkpoints from public, anon, authenticated, service_role;

create function private.kael_workflow_immutable_v1() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '23000', message = 'WORKFLOW_HISTORY_IMMUTABLE';
end;
$$;
revoke all on function private.kael_workflow_immutable_v1() from public, anon, authenticated, service_role;
create trigger kael_workflow_definition_immutable before update or delete on private.kael_workflow_definitions
for each row execute function private.kael_workflow_immutable_v1();
create trigger kael_workflow_checkpoint_immutable before update or delete on private.kael_workflow_checkpoints
for each row execute function private.kael_workflow_immutable_v1();

create function public.kael_workflow_checkpoint_v1(p_request jsonb) returns jsonb
language plpgsql security definer set search_path = '' set lock_timeout = '3s' set statement_timeout = '5s'
as $$
declare
  v_operation text := p_request->>'operation';
  v_id uuid := (p_request->>'instanceId')::uuid;
  v_actor uuid := (p_request->>'actorId')::uuid;
  v_role text := p_request->>'actorRole';
  v_job uuid := (p_request->>'jobId')::uuid;
  v_case uuid := (p_request->>'caseId')::uuid;
  v_key uuid := (p_request->>'idempotencyKey')::uuid;
  v_hash text := encode(extensions.digest(p_request::text, 'sha256'), 'hex');
  v_instance private.kael_workflow_instances%rowtype;
  v_prior private.kael_workflow_checkpoints%rowtype;
  v_definition jsonb;
  v_node jsonb;
  v_next jsonb;
  v_edge jsonb;
  v_result jsonb;
  v_now timestamptz := clock_timestamp();
  v_status text;
  v_reason text;
  v_retry integer;
  v_retry_at timestamptz;
  v_event uuid;
  v_event_kind text;
  v_sequence integer;
  v_service text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'WORKFLOW_SERVER_ONLY';
  end if;
  if jsonb_typeof(p_request) <> 'object' or octet_length(p_request::text) > 65536
    or v_operation not in ('create','load','transition') or v_id is null or v_actor is null
    or v_role not in ('customer','worker','admin','admin_operator')
    or exists (select 1 from jsonb_object_keys(p_request) k where k not in
      ('operation','instanceId','actorId','actorRole','jobId','caseId','idempotencyKey','definition','deadlineAt','expectedVersion','action','nextNode','event')) then
    raise exception using errcode = '22023', message = 'INVALID_WORKFLOW_REQUEST';
  end if;
  perform 1 from public.profiles where id = v_actor and role::text = v_role for share;
  if not found then
    raise exception using errcode = '42501', message = 'WORKFLOW_ACTOR_SCOPE';
  end if;
  if v_role in ('admin','admin_operator') and (v_job is not null or v_case is not null) then
    raise exception using errcode = '42501', message = 'WORKFLOW_ADMIN_SCOPE';
  end if;
  if v_job is not null then
    select service_type::text into v_service from public.jobs where id = v_job
      and ((v_role = 'customer' and customer_id = v_actor) or (v_role = 'worker' and worker_id = v_actor)) for share;
    if not found then raise exception using errcode = '42501', message = 'WORKFLOW_JOB_SCOPE'; end if;
  end if;
  if v_case is not null then
    if v_role = 'customer' then
      select service_type::text into v_service from public.kael_chat_sessions
        where id = v_case and customer_id = v_actor and job_id is not distinct from v_job for share;
    elsif v_role = 'worker' then
      perform 1 from public.kael_worker_chat_sessions
        where id = v_case and worker_id = v_actor and job_id is not distinct from v_job for share;
    else
      raise exception using errcode = '42501', message = 'WORKFLOW_CASE_SCOPE';
    end if;
    if not found then raise exception using errcode = '42501', message = 'WORKFLOW_CASE_SCOPE'; end if;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_id::text, 434));
  v_now := clock_timestamp();
  select * into v_instance from private.kael_workflow_instances where id = v_id for update;
  if found then
    if v_instance.actor_id <> v_actor or v_instance.actor_role::text <> v_role
      or v_instance.job_id is distinct from v_job
      or coalesce(v_instance.customer_case_id, v_instance.worker_case_id) is distinct from v_case then
      raise exception using errcode = '42501', message = 'WORKFLOW_INSTANCE_SCOPE';
    end if;
    if v_operation = 'load' then
      select definition into v_definition from private.kael_workflow_definitions
        where workflow_id = v_instance.workflow_id and definition_version = v_instance.definition_version;
      return jsonb_build_object('state', to_jsonb(v_instance), 'definition', v_definition,
        'checkpoints', (select jsonb_agg(result order by instance_version) from private.kael_workflow_checkpoints where instance_id = v_id));
    end if;
    select * into v_prior from private.kael_workflow_checkpoints where instance_id = v_id and idempotency_key = v_key;
    if found then
      if v_prior.request_hash <> v_hash then raise exception using errcode = '22023', message = 'WORKFLOW_IDEMPOTENCY_CONFLICT'; end if;
      return v_prior.result;
    end if;
    if v_operation = 'create' then raise exception using errcode = '23505', message = 'WORKFLOW_INSTANCE_EXISTS'; end if;
  elsif v_operation <> 'create' then
    raise exception using errcode = 'P0002', message = 'WORKFLOW_NOT_FOUND';
  end if;
  if v_key is null then raise exception using errcode = '22023', message = 'WORKFLOW_IDEMPOTENCY_REQUIRED'; end if;
  if v_operation = 'create' then
    v_definition := p_request->'definition';
    if v_definition->>'schemaVersion' is distinct from 'workflow-definition/v1'
      or not (v_definition->'roles' ? v_role) or (v_service is not null and not (v_definition->'services' ? v_service))
      or v_definition->>'rollout' not in ('local_test','shadow_read_only')
      or (v_definition->>'deadlineMs')::integer not between 1 and 300000
      or exists (select 1 from jsonb_object_keys(v_definition) k where k not in
        ('schemaVersion','workflowId','version','owner','roles','services','rollout','deadlineMs','trigger','input','policyPins','capabilityRegistry','capabilityPins','budget','approval','entry','terminalStates','nodes','edges')) then
      raise exception using errcode = '22023', message = 'INVALID_WORKFLOW_DEFINITION';
    end if;
    if (p_request->>'deadlineAt')::timestamptz <= v_now or (p_request->>'deadlineAt')::timestamptz > v_now + (least((v_definition->>'deadlineMs')::integer, (v_definition->'budget'->>'maxDurationMs')::integer) * interval '1 millisecond') then
      raise exception using errcode = '22023', message = 'INVALID_WORKFLOW_DEADLINE';
    end if;
    insert into private.kael_workflow_definitions values (v_definition->>'workflowId', (v_definition->>'version')::integer, v_definition, v_now)
      on conflict do nothing;
    if not exists (select 1 from private.kael_workflow_definitions where workflow_id = v_definition->>'workflowId'
      and definition_version = (v_definition->>'version')::integer and definition = v_definition) then
      raise exception using errcode = '23000', message = 'WORKFLOW_VERSION_IMMUTABLE';
    end if;
    select n into v_node from jsonb_array_elements(v_definition->'nodes') n where n->>'id' = v_definition->>'entry';
    if v_node is null or v_node->>'kind' = 'finish' then raise exception using errcode = '22023', message = 'INVALID_WORKFLOW_ENTRY'; end if;
    insert into private.kael_workflow_instances(id, workflow_id, definition_version, actor_id, actor_role, job_id, customer_case_id, worker_case_id, checkpoint, status, deadline_at)
      values(v_id, v_definition->>'workflowId', (v_definition->>'version')::integer, v_actor, v_role::public.user_role, v_job,
      case when v_role='customer' then v_case end, case when v_role='worker' then v_case end,
      v_node->>'id', case when v_node->>'kind' in ('wait_event','request_approval') then 'waiting' else 'active' end, (p_request->>'deadlineAt')::timestamptz)
      returning * into v_instance;
  else
    if v_instance.instance_version is distinct from (p_request->>'expectedVersion')::integer then
      raise exception using errcode = '40001', message = 'WORKFLOW_VERSION_CONFLICT';
    end if;
    if v_instance.terminal_reason is not null then raise exception using errcode = '55000', message = 'WORKFLOW_TERMINAL'; end if;
    select definition into v_definition from private.kael_workflow_definitions where workflow_id=v_instance.workflow_id and definition_version=v_instance.definition_version;
    select n into v_node from jsonb_array_elements(v_definition->'nodes') n where n->>'id'=v_instance.checkpoint;
    v_status := v_instance.status; v_retry := v_instance.retry_count; v_sequence := v_instance.event_sequence;
    if p_request->>'action' = 'timeout' then
      if v_now < v_instance.deadline_at then raise exception using errcode = '55000', message = 'WORKFLOW_NOT_EXPIRED'; end if;
      v_status := 'expired'; v_reason := 'deadline_elapsed'; v_next := v_node;
    else
      if v_now >= v_instance.deadline_at then raise exception using errcode = '55000', message = 'WORKFLOW_DEADLINE_EXPIRED'; end if;
      if v_instance.retry_at is not null and v_now < v_instance.retry_at then raise exception using errcode = '55000', message = 'WORKFLOW_BACKOFF'; end if;
      if v_node->>'kind' in ('request_approval','execute_capability','emit_event') then
        raise exception using errcode = '42501', message = 'WORKFLOW_EFFECT_BOUNDARY';
      end if;
      select n into v_next from jsonb_array_elements(v_definition->'nodes') n where n->>'id'=p_request->>'nextNode';
      select e into v_edge from jsonb_array_elements(v_definition->'edges') e where e->>'from'=v_instance.checkpoint
        and e->>'to'=p_request->>'nextNode' and e->>'kind'=case when p_request->>'action'='retry' then 'retry' when p_request ? 'event' then 'event' else 'success' end;
      if v_next is null or v_edge is null or p_request->>'action' not in ('advance','retry') then
        raise exception using errcode = '22023', message = 'WORKFLOW_INVALID_TRANSITION';
      end if;
      if p_request ? 'event' then
        v_event := (p_request->'event'->>'id')::uuid; v_event_kind := p_request->'event'->>'kind';
        if (p_request->'event'->>'instanceId')::uuid is distinct from v_id or v_event is null
          or (p_request->'event'->>'sequence')::integer is distinct from v_sequence+1
          or v_node->>'kind' <> 'wait_event' or v_node->>'event' is distinct from v_event_kind
          or exists (select 1 from private.kael_workflow_checkpoints where instance_id=v_id and event_id=v_event) then
          raise exception using errcode = '22023', message = 'WORKFLOW_EVENT_ORDER';
        end if;
        v_sequence := v_sequence+1;
      elsif v_node->>'kind' = 'wait_event' then
        raise exception using errcode = '22023', message = 'WORKFLOW_EVENT_REQUIRED';
      end if;
      if p_request->>'action' = 'retry' then
        if v_retry >= least((v_edge->>'maxAttempts')::integer, (v_node->>'maxVisits')::integer-1) then
          v_status := 'exhausted'; v_reason := 'retry_exhausted';
        else
          v_retry := v_retry+1; v_retry_at := v_now + (100 * power(2, v_retry-1)) * interval '1 millisecond';
        end if;
      else
        v_retry := 0;
        v_status := case when v_next->>'kind'='finish' then v_next->>'terminalState' when v_next->>'kind' in ('wait_event','request_approval') then 'waiting' else 'active' end;
        if v_next->>'kind'='finish' then v_reason := 'node_finished'; end if;
      end if;
    end if;
    if v_instance.instance_version+1 >= (v_definition->'budget'->>'maxSteps')::integer and v_reason is null then
      v_status := 'exhausted'; v_reason := 'step_exhausted';
    end if;
    update private.kael_workflow_instances set instance_version=instance_version+1, checkpoint=v_next->>'id', status=v_status,
      terminal_reason=v_reason, retry_count=v_retry, retry_at=v_retry_at, event_sequence=v_sequence, updated_at=v_now
      where id=v_id returning * into v_instance;
  end if;
  v_result := to_jsonb(v_instance);
  insert into private.kael_workflow_checkpoints(instance_id,instance_version,idempotency_key,request_hash,event_id,event_kind,event_sequence,result)
    values(v_id,v_instance.instance_version,v_key,v_hash,v_event,v_event_kind,case when v_event is not null then v_sequence end,v_result);
  return v_result;
end;
$$;
revoke all on function public.kael_workflow_checkpoint_v1(jsonb) from public, anon, authenticated;
grant execute on function public.kael_workflow_checkpoint_v1(jsonb) to service_role;
