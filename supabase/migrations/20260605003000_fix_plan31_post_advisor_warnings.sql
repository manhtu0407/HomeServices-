-- Plan 31 production post-advisor cleanup.
-- Fixes two mutable-search-path helper functions and one auth RLS initplan
-- warning found after applying the Plan31 production chain.

create or replace function private.kael_b4_service_label_vi(p_service_type text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case p_service_type
    when 'electrical' then 'Sửa điện'
    when 'plumbing' then 'Sửa nước'
    when 'cleaning' then 'Vệ sinh/dọn dẹp'
    else 'Kael knowledge'
  end
$$;

create or replace function private.kael_b4_json_int(p_value text)
returns integer
language sql
immutable
set search_path = pg_catalog
as $$
  select case
    when p_value ~ '^[0-9]+$' then p_value::integer
    else 0
  end
$$;

drop policy if exists "Customers read own pre intake access memory"
  on public.kael_chat_pre_intake_memory;

create policy "Customers read own pre intake access memory"
  on public.kael_chat_pre_intake_memory
  for select
  to authenticated
  using (customer_id = (select auth.uid()) or (select private.is_admin()));
