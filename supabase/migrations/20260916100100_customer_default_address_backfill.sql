-- Customers typed their default address into the Address screen before it had a backend column, so
-- it lives only in Auth user_metadata. Copy it once so Home's address status is true for them
-- without waiting for their next save. It fills empty columns only, so it never overwrites an
-- address saved through PATCH /me/address, and running it again changes nothing. Only a JSON string
-- is copied: that is all the Address screen wrote, and a customer can put anything else into their
-- own user_metadata.
insert into public.customer_profiles (id, default_address)
select
  profile.id,
  left(btrim(auth_user.raw_user_meta_data ->> 'default_address'), 300)
from public.profiles as profile
join auth.users as auth_user on auth_user.id = profile.id
where profile.role = 'customer'::public.user_role
  and profile.account_state = 'active'
  and jsonb_typeof(auth_user.raw_user_meta_data -> 'default_address') = 'string'
  and nullif(btrim(auth_user.raw_user_meta_data ->> 'default_address'), '') is not null
on conflict (id) do update
set default_address = excluded.default_address
where public.customer_profiles.default_address is null;
