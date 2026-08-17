begin;

create or replace function private.ensure_customer_profile_for_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.role = 'customer'::public.user_role then
    insert into public.customer_profiles (id)
    values (new.id)
    on conflict (id) do nothing;
  end if;

  return new;
end;
$function$;

drop trigger if exists profiles_customer_profile_invariant on public.profiles;
create trigger profiles_customer_profile_invariant
  after insert or update of role on public.profiles
  for each row execute function private.ensure_customer_profile_for_role();

revoke execute on function private.ensure_customer_profile_for_role()
from public, anon, authenticated;

insert into public.customer_profiles (id)
select profile.id
from public.profiles as profile
left join public.customer_profiles as customer_profile on customer_profile.id = profile.id
where profile.role = 'customer'::public.user_role
  and customer_profile.id is null
on conflict (id) do nothing;

comment on function private.ensure_customer_profile_for_role() is
  'Keeps every customer identity backed by a customer_profiles row for matching foreign keys.';

commit;
