create or replace function public.advance_worker_profile_revision()
returns trigger language plpgsql security invoker
set search_path = ''
as $function$
begin
  -- updated_at is the draft compare-and-swap token, including multiple writes in one transaction.
  new.updated_at := greatest(pg_catalog.clock_timestamp(), old.updated_at + interval '1 microsecond');
  return new;
end;
$function$;

revoke all on function public.advance_worker_profile_revision() from public, anon, authenticated;

create or replace trigger worker_profiles_updated_at
before update on public.worker_profiles
for each row execute function public.advance_worker_profile_revision();
