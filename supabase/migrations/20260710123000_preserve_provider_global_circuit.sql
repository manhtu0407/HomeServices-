-- A purpose success is not evidence that a provider-wide 402/429 incident recovered.
-- Provider-global circuits stay open until their cooldown expires or an explicit provider success clears them.

create or replace function public.record_circuit_success(
  p_scope text,
  p_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_scope not in ('purpose_provider', 'provider')
     or coalesce(char_length(p_key), 0) not between 1 and 200
     or (p_scope = 'purpose_provider' and pg_catalog.strpos(p_key, ':') = 0) then
    raise exception 'invalid circuit scope or key' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('kael_provider_circuit:' || p_scope || ':' || p_key, 0)
  );

  delete from public.kael_provider_circuit as c
  where c.scope = p_scope and c.key = p_key;
end;
$$;
