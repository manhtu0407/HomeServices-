-- @pillar id: P94-coverage-edge-authority
-- @pillar invariant: coverage is read through the actor-bound Edge boundary, never through a client-executable SECURITY DEFINER function
-- @pillar authority: governance/RULES.md #0
-- @pillar target: public.get_service_coverage_readiness
-- @pillar layer: sql
-- @pillar siblings: P67-public-coverage-reservation
-- @pillar mutation: restore authenticated execute; the live grant assertion and direct-client denial turn red

begin;

do $$
begin
  if has_function_privilege('authenticated', 'public.get_service_coverage_readiness(uuid,public.service_type,text)', 'execute')
    or has_function_privilege('anon', 'public.get_service_coverage_readiness(uuid,public.service_type,text)', 'execute')
    or not has_function_privilege('service_role', 'public.get_service_coverage_readiness(uuid,public.service_type,text)', 'execute')
  then
    raise exception 'COVERAGE_EDGE_AUTHORITY: only service_role may execute the coverage projection';
  end if;
end;
$$;

set local role authenticated;
set local request.jwt.claim.role = 'authenticated';
set local request.jwt.claim.sub = 'd9400000-0000-4000-8000-000000000001';

do $$
begin
  begin
    perform * from public.get_service_coverage_readiness('d9400000-0000-4000-8000-000000000001', 'plumbing', 'q7');
    raise exception 'COVERAGE_EDGE_AUTHORITY: direct authenticated invocation reached the projection';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
set local role anon;
set local request.jwt.claim.role = 'anon';

do $$
begin
  begin
    perform * from public.get_service_coverage_readiness('d9400000-0000-4000-8000-000000000001', 'plumbing', 'q7');
    raise exception 'COVERAGE_EDGE_AUTHORITY: anonymous invocation reached the projection';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
select 'PASS: coverage direct-client execute denied; server grant preserved' as result;
rollback;
