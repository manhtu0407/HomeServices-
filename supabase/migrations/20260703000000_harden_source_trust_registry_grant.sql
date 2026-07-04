begin;

revoke insert, update, delete on public.source_trust_registry
  from authenticated;

grant select on public.source_trust_registry to authenticated;
grant all on public.source_trust_registry to service_role;

commit;
