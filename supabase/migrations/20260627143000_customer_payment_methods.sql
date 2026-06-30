-- =============================================================================
-- Customer payment methods
--
-- Stores customer receiving/refund bank details behind mobile-api.
-- Authenticated clients may read their own masked/status data, but all writes
-- stay behind Edge/service_role so bank account changes can later attach
-- verification steps without client-side table DML.
-- =============================================================================

create table if not exists public.customer_payment_methods (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  bank_key text not null,
  bank_name text not null,
  account_holder_name text not null,
  bank_account text not null,
  bank_account_masked text not null,
  status text not null default 'pending_verification',
  is_default boolean not null default true,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_payment_methods_bank_key_check
    check (bank_key in ('vietcombank', 'techcombank', 'bidv', 'mbbank', 'acb', 'vietinbank')),
  constraint customer_payment_methods_bank_name_check
    check (char_length(btrim(bank_name)) between 2 and 100),
  constraint customer_payment_methods_holder_check
    check (char_length(btrim(account_holder_name)) between 2 and 200),
  constraint customer_payment_methods_account_check
    check (char_length(btrim(bank_account)) between 6 and 50),
  constraint customer_payment_methods_mask_check
    check (bank_account_masked ~ '^[*]{4} [0-9A-Za-z]{4}$'),
  constraint customer_payment_methods_status_check
    check (status in ('pending_verification', 'verified', 'rejected'))
);

create or replace function public.validate_customer_payment_method_customer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.profiles p
    where p.id = new.customer_id
      and p.role = 'customer'
  ) then
    raise exception 'customer_payment_methods.customer_id must reference a customer profile'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.validate_customer_payment_method_customer() from public;
revoke all on function public.validate_customer_payment_method_customer() from anon;
revoke all on function public.validate_customer_payment_method_customer() from authenticated;
grant execute on function public.validate_customer_payment_method_customer() to service_role;

drop trigger if exists customer_payment_methods_customer_role on public.customer_payment_methods;
create trigger customer_payment_methods_customer_role
  before insert or update of customer_id on public.customer_payment_methods
  for each row execute function public.validate_customer_payment_method_customer();

create trigger customer_payment_methods_updated_at
  before update on public.customer_payment_methods
  for each row execute function update_updated_at();

create unique index if not exists customer_payment_methods_one_default_per_customer
  on public.customer_payment_methods (customer_id)
  where is_default;

create index if not exists customer_payment_methods_customer_idx
  on public.customer_payment_methods (customer_id, created_at desc);

alter table public.customer_payment_methods enable row level security;

drop policy if exists "Customers read own payment methods" on public.customer_payment_methods;
create policy "Customers read own payment methods"
on public.customer_payment_methods
for select
to authenticated
using (((select auth.uid()) = customer_id) or private.is_admin());

drop policy if exists "Admins insert customer payment methods" on public.customer_payment_methods;
drop policy if exists "Admins update customer payment methods" on public.customer_payment_methods;
drop policy if exists "Admins delete customer payment methods" on public.customer_payment_methods;
create policy "Admins insert customer payment methods"
on public.customer_payment_methods
for insert
to authenticated
with check (private.is_admin());

create policy "Admins update customer payment methods"
on public.customer_payment_methods
for update
to authenticated
using (private.is_admin())
with check (private.is_admin());

create policy "Admins delete customer payment methods"
on public.customer_payment_methods
for delete
to authenticated
using (private.is_admin());

revoke all on table public.customer_payment_methods from public;
revoke all on table public.customer_payment_methods from anon;
revoke all on table public.customer_payment_methods from authenticated;
grant select (
  id,
  customer_id,
  bank_key,
  bank_name,
  account_holder_name,
  bank_account_masked,
  status,
  is_default,
  verified_at,
  created_at,
  updated_at
) on table public.customer_payment_methods to authenticated;
grant all on table public.customer_payment_methods to service_role;
