begin;

revoke execute on function public.price_evidence_has_quorum(jsonb)
  from public, anon, authenticated;
grant execute on function public.price_evidence_has_quorum(jsonb)
  to service_role;

comment on function public.price_evidence_has_quorum(jsonb) is
  'Pure price-evidence quorum predicate. Executable only by the internal workflow role because durable confirmation calls it inside a SECURITY INVOKER transaction.';

commit;
