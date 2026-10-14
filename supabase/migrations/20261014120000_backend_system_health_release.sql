begin;
create table public.backend_system_health_release_evidence (
 release_id text primary key references public.harness_releases(release_id),
 packet_sha256 text not null unique check(packet_sha256 ~ '^[0-9a-f]{64}$'),
 packet jsonb not null check(jsonb_typeof(packet)='object' and octet_length(packet::text)<=16384),
 previous_active_release_id text references public.harness_releases(release_id), revision bigint not null check(revision>0),
 created_at timestamptz not null default clock_timestamp()
);
alter table public.backend_system_health_release_evidence enable row level security;
revoke all on public.backend_system_health_release_evidence from public,anon,authenticated,service_role;
grant select on public.backend_system_health_release_evidence to service_role;
create trigger backend_system_health_release_evidence_append_only before update or delete on public.backend_system_health_release_evidence
 for each row execute function public.reject_stage1_release_evidence_mutation();

create function public.promote_backend_system_health_release_atomic(p_release_id text,p_expected_active_release_id text,p_expected_revision bigint,p_packet jsonb)
returns table(active_release_id text,previous_active_release_id text,revision bigint)
language plpgsql security definer set search_path='' as $func$
declare
 c public.stage1_release_controls%rowtype;
 r public.harness_releases%rowtype;
 e public.backend_system_health_release_evidence%rowtype;
 s public.system_health_snapshots%rowtype;
 o public.system_health_observer_state%rowtype;
 n jsonb; keys text[]; name text; h text; t timestamptz := clock_timestamp();
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception using errcode='42501',message='BACKEND_RELEASE_SERVICE_ONLY'; end if;
 if p_packet is null or jsonb_typeof(p_packet)<>'object' or octet_length(p_packet::text)>16384 then raise exception using errcode='23514',message='BACKEND_RELEASE_PACKET_INVALID'; end if;
 for n,keys in
  select p_packet,array['schemaVersion','environment','projectRef','releaseId','gitSha','bundleSha256','packetSha256','previous','sourceProofs','gates','observer','readonlyProbe','generatedAt']
  union all select p_packet->'previous',array['releaseId','revision']
  union all select p_packet->'sourceProofs',array['mobile-api','kael-matching-maintainer','system-monitor']
  union all select p_packet->'gates',array['strictMapping','boundAssertions','qualityReceiptSha256','parityReceiptSha256','expandReceiptSha256','rollbackReceiptSha256']
  union all select p_packet#>'{gates,strictMapping}',array['entries','mapped','partial','unverified','manifestSha256']
  union all select p_packet#>'{gates,boundAssertions}',array['required','passed','failed']
  union all select p_packet->'observer',array['releaseId','gitSha','workerBundleSha256','d1MigrationsSha256','receiptSha256','completedAt']
  union all select p_packet->'readonlyProbe',array['releaseId','gitSha','receiptSha256','completedAt','inferenceRequests']
  union all select p_packet#>'{sourceProofs,mobile-api}',array['deploymentId','proofSha256']
  union all select p_packet#>'{sourceProofs,kael-matching-maintainer}',array['deploymentId','proofSha256']
  union all select p_packet#>'{sourceProofs,system-monitor}',array['releaseId','gitSha','profileId','edgeFunctionId','edgeVersion','sourceSha256','runtimeConfigurationSha256','proofSha256']
 loop
  if n is null or jsonb_typeof(n)<>'object' then raise exception using errcode='23514',message='BACKEND_RELEASE_FIELDS_INVALID'; end if;
  if (select count(*) from jsonb_object_keys(n))<>cardinality(keys) or not(n ?& keys) or exists(select 1 from jsonb_each(n) v where v.value='null'::jsonb and v.key<>'releaseId') then raise exception using errcode='23514',message='BACKEND_RELEASE_FIELDS_INVALID'; end if;
 end loop;
 for h in
  select p_packet->>'bundleSha256' union all select p_packet->>'packetSha256'
  union all select p_packet#>>'{gates,strictMapping,manifestSha256}'
  union all select p_packet#>>'{gates,qualityReceiptSha256}' union all select p_packet#>>'{gates,parityReceiptSha256}'
  union all select p_packet#>>'{gates,expandReceiptSha256}' union all select p_packet#>>'{gates,rollbackReceiptSha256}'
  union all select p_packet#>>'{observer,workerBundleSha256}' union all select p_packet#>>'{observer,d1MigrationsSha256}'
  union all select p_packet#>>'{observer,receiptSha256}' union all select p_packet#>>'{readonlyProbe,receiptSha256}'
  union all select p_packet#>>'{sourceProofs,mobile-api,proofSha256}' union all select p_packet#>>'{sourceProofs,kael-matching-maintainer,proofSha256}'
  union all select p_packet#>>'{sourceProofs,system-monitor,sourceSha256}'
  union all select p_packet#>>'{sourceProofs,system-monitor,runtimeConfigurationSha256}'
  union all select p_packet#>>'{sourceProofs,system-monitor,proofSha256}'
 loop
  if h is null or h !~ '^[0-9a-f]{64}$' then raise exception using errcode='23514',message='BACKEND_RELEASE_HASH_INVALID'; end if;
 end loop;
 if p_packet->>'schemaVersion' is distinct from 'backend-system-health-promotion/v1'
 or p_packet->>'environment' is distinct from 'production' or p_packet->>'projectRef' is distinct from 'iwevizmsedyqozxlawwl'
 or p_packet->>'releaseId' is distinct from p_release_id or p_release_id !~ '^[A-Za-z0-9_.:-]{1,160}$'
 or p_packet#>>'{previous,releaseId}' is distinct from p_expected_active_release_id
 or (p_packet#>>'{previous,revision}')::bigint is distinct from p_expected_revision then
 raise exception using errcode='23514',message='BACKEND_RELEASE_IDENTITY_INVALID'; end if;
 select * into c from public.stage1_release_controls x where x.environment='production' for update;
 if not found then raise exception using errcode='40001',message='BACKEND_RELEASE_CONTROL_MISSING'; end if;
 select * into e from public.backend_system_health_release_evidence x where x.release_id=p_release_id;
 if found then
  if e.packet is distinct from p_packet or c.active_release_id is distinct from p_release_id then raise exception using errcode='40001',message='BACKEND_RELEASE_REPLAY_CHANGED'; end if;
  return query select p_release_id,e.previous_active_release_id,e.revision; return;
 end if;
 if c.active_release_id is distinct from p_expected_active_release_id or c.revision<>p_expected_revision or c.candidate_release_id is not null then raise exception using errcode='40001',message='BACKEND_RELEASE_STATE_CHANGED'; end if;
 select * into r from public.harness_releases x where x.release_id=p_release_id and x.environment='production';
 if not found or r.release_artifact->>'releaseLane' is distinct from 'backend-system-health'
 or r.git_sha is distinct from p_packet->>'gitSha' or r.bundle_sha256 is distinct from p_packet->>'bundleSha256'
 or r.release_artifact#>>'{backendHostedBaseline,environment}' is distinct from 'production'
 or r.release_artifact#>>'{backendHostedBaseline,projectRef}' is distinct from 'iwevizmsedyqozxlawwl'
 or r.release_artifact#>>'{backendHostedBaseline,registered}' is distinct from 'true'
 or r.release_artifact#>>'{backendHostedBaseline,controlActiveReleaseId}' is distinct from p_expected_active_release_id
 or (r.release_artifact#>>'{backendHostedBaseline,revision}')::bigint is distinct from p_expected_revision
 or r.release_artifact->'activeClientCompatibility' is distinct from r.release_artifact#>'{backendHostedBaseline,clientCompatibility}'
 or not exists(select 1 from public.harness_releases b where b.release_id=r.release_artifact#>>'{backendHostedBaseline,releaseId}'
   and b.environment='production' and b.git_sha=r.release_artifact#>>'{backendHostedBaseline,gitSha}')
 or r.release_artifact#>>'{systemHealthObserver,profileId}' is distinct from 'cloudflare-admin-v1'
 or r.release_artifact#>>'{transactionCoverage,manifestSha256}' is distinct from p_packet#>>'{gates,strictMapping,manifestSha256}'
 or r.release_artifact#>'{transactionCoverage,entryCount}' is distinct from p_packet#>'{gates,strictMapping,entries}'
 or r.release_artifact#>'{transactionCoverage,boundAssertionsRequired}' is distinct from p_packet#>'{gates,boundAssertions,required}'
 or (p_packet#>>'{gates,strictMapping,entries}')::integer<=0
 or p_packet#>'{gates,strictMapping,mapped}' is distinct from p_packet#>'{gates,strictMapping,entries}'
 or p_packet#>'{gates,strictMapping,partial}' is distinct from '0'::jsonb or p_packet#>'{gates,strictMapping,unverified}' is distinct from '0'::jsonb
 or (p_packet#>>'{gates,boundAssertions,required}')::integer<=0
 or p_packet#>'{gates,boundAssertions,passed}' is distinct from p_packet#>'{gates,boundAssertions,required}'
 or p_packet#>'{gates,boundAssertions,failed}' is distinct from '0'::jsonb then raise exception using errcode='23514',message='BACKEND_RELEASE_GATES_INVALID'; end if;
 foreach name in array array['mobile-api','kael-matching-maintainer'] loop
  if not exists(select 1 from public.stage1_source_deployment_attestations a where a.environment='production' and a.release_id=p_release_id and a.function_name=name
   and a.deployment_id=p_packet#>>array['sourceProofs',name,'deploymentId'] and a.proof_sha256=p_packet#>>array['sourceProofs',name,'proofSha256']
   and a.source_sha256=r.edge_function_digests->>name
   and a.edge_version=(select max(b.edge_version) from public.stage1_source_deployment_attestations b where b.environment='production' and b.function_name=name)) then raise exception using errcode='23514',message='BACKEND_RELEASE_SOURCE_NOT_CURRENT'; end if;
 end loop;
 if p_packet#>>'{sourceProofs,system-monitor,releaseId}' is distinct from p_release_id
 or p_packet#>>'{sourceProofs,system-monitor,gitSha}' is distinct from r.git_sha
 or p_packet#>>'{sourceProofs,system-monitor,profileId}' is distinct from 'cloudflare-admin-v1'
 or p_packet#>>'{sourceProofs,system-monitor,sourceSha256}' is distinct from r.release_artifact#>>'{systemHealthObserver,edgeFunction,sha256}'
 or p_packet#>>'{sourceProofs,system-monitor,runtimeConfigurationSha256}' is distinct from r.release_artifact#>>'{systemHealthObserver,edgeFunction,runtimeConfiguration,sha256}'
 or p_packet#>>'{sourceProofs,system-monitor,edgeFunctionId}' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
 or (p_packet#>>'{sourceProofs,system-monitor,edgeVersion}') !~ '^[1-9][0-9]*$' then
  raise exception using errcode='23514',message='BACKEND_SYSTEM_MONITOR_SOURCE_INVALID'; end if;
 foreach name in array array['observer','readonlyProbe'] loop
  if p_packet#>>array[name,'releaseId'] is distinct from p_release_id or p_packet#>>array[name,'gitSha'] is distinct from r.git_sha
   or (p_packet#>>array[name,'completedAt'])::timestamptz<=t-interval '180 seconds'
   or (p_packet#>>array[name,'completedAt'])::timestamptz>t+interval '30 seconds' then raise exception using errcode='23514',message='BACKEND_RELEASE_PROBE_INVALID'; end if;
 end loop;
 if (p_packet->>'generatedAt')::timestamptz<t-interval '10 minutes' or (p_packet->>'generatedAt')::timestamptz>t+interval '30 seconds'
 or p_packet#>'{readonlyProbe,inferenceRequests}' is distinct from '0'::jsonb
 or p_packet#>>'{observer,workerBundleSha256}' is distinct from r.release_artifact#>>'{systemHealthObserver,workerBundleSha256}'
 or p_packet#>>'{observer,d1MigrationsSha256}' is distinct from r.release_artifact#>>'{systemHealthObserver,d1MigrationsSha256}' then raise exception using errcode='23514',message='BACKEND_RELEASE_OBSERVER_INVALID'; end if;
 select * into s from public.system_health_snapshots x where x.environment='production' order by x.completed_at desc limit 1;
 select * into o from public.system_health_observer_state x where x.environment='production';
 if s.schema_version is distinct from 1 or s.profile_schema_version is distinct from 2
 or s.profile_id is distinct from 'cloudflare-admin-v1'
 or s.release_id is distinct from p_release_id or s.project_ref is distinct from 'iwevizmsedyqozxlawwl'
 or jsonb_array_length(s.required_check_ids)<>6
 or not (s.required_check_ids @> '["backend-core","backend-storage-realtime-io","backend-scheduled-workers","kael-agentic","app-native-connectivity","observer-dispatcher"]'::jsonb)
 or jsonb_array_length(s.checks)<>6 or jsonb_array_length(s.coverage_gaps)<>2
 or not (s.coverage_gaps @> '["app-crash","push-notifications"]'::jsonb)
 or not (s.coverage_gaps <@ '["app-crash","push-notifications"]'::jsonb)
 or not exists(select 1 from jsonb_array_elements(s.checks) x where x->>'check_id'='backend-core' and x->>'status'='green')
 or not exists(select 1 from jsonb_array_elements(s.checks) x where x->>'check_id'='observer-dispatcher' and x->>'status'='green')
 or not exists(select 1 from jsonb_array_elements(s.checks) x where x->>'check_id'='backend-storage-realtime-io')
 or not exists(select 1 from jsonb_array_elements(s.checks) x where x->>'check_id'='backend-scheduled-workers')
 or not exists(select 1 from jsonb_array_elements(s.checks) x where x->>'check_id'='kael-agentic')
 or not exists(select 1 from jsonb_array_elements(s.checks) x where x->>'check_id'='app-native-connectivity')
 or not exists(select 1 from jsonb_array_elements(s.checks) x where x->>'check_id'='observer-dispatcher')
 or exists(select 1 from jsonb_array_elements(s.checks) x where case
   when x->>'check_id'='app-native-connectivity' then x->>'status' in ('green','gray')
   else x->>'status'='green'
  end is not true)
 or s.expires_at is null or s.expires_at<=t or s.completed_at<=t-interval '180 seconds' or s.completed_at>t+interval '30 seconds'
 or o.d1_status is distinct from 'green' or o.observer_heartbeat_at is null or o.observer_heartbeat_at<=t-interval '180 seconds'
 or o.observer_heartbeat_at>t+interval '30 seconds' or o.last_snapshot_at is distinct from s.completed_at then raise exception using errcode='23514',message='BACKEND_RELEASE_MONITOR_EVIDENCE_INVALID'; end if;
 update public.stage1_release_controls x set previous_active_release_id=x.active_release_id,active_release_id=p_release_id,revision=x.revision+1,updated_at=t where x.environment='production' returning * into c;
 insert into public.backend_system_health_release_evidence(release_id,packet_sha256,packet,previous_active_release_id,revision) values(p_release_id,p_packet->>'packetSha256',p_packet,c.previous_active_release_id,c.revision);
 insert into public.stage1_release_control_events(environment,release_id,event_type,evidence_sha256,revision,safe_metadata) values('production',p_release_id,'promoted',p_packet->>'packetSha256',c.revision,jsonb_build_object('release_lane','backend-system-health'));
 return query select c.active_release_id,c.previous_active_release_id,c.revision;
end;
$func$;
revoke all on function public.promote_backend_system_health_release_atomic(text,text,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.promote_backend_system_health_release_atomic(text,text,bigint,jsonb) to service_role;
commit;
