begin;

do $migration$
begin
  if to_regprocedure('public.price_evidence_has_quorum(jsonb)') is not null then
    execute 'revoke execute on function public.price_evidence_has_quorum(jsonb) from public, anon, authenticated';
    execute 'grant execute on function public.price_evidence_has_quorum(jsonb) to service_role';
  end if;
end;
$migration$;

commit;
