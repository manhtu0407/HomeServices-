-- P1 Kael Harness foundation: customer memory schema only.

create table if not exists public.customer_kael_memory (
  customer_id uuid primary key references public.profiles(id) on delete cascade,
  language text not null default 'vi' check (language in ('vi', 'en')),
  preference_summary text not null default '',
  service_preferences jsonb not null default '{}'::jsonb,
  home_context jsonb not null default '{}'::jsonb,
  trust_signals jsonb not null default '{}'::jsonb,
  safe_metadata jsonb not null default '{}'::jsonb,
  memory_version integer not null default 1 check (memory_version > 0),
  last_observed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_kael_memory enable row level security;

drop trigger if exists customer_kael_memory_updated_at on public.customer_kael_memory;
create trigger customer_kael_memory_updated_at
  before update on public.customer_kael_memory
  for each row execute function public.update_updated_at();

create index if not exists customer_kael_memory_last_observed_idx
  on public.customer_kael_memory (last_observed_at desc);

drop policy if exists "Customers view own kael memory" on public.customer_kael_memory;
create policy "Customers view own kael memory"
  on public.customer_kael_memory for select
  to authenticated
  using ((select auth.uid()) = customer_id);

drop policy if exists "Admins view customer kael memory" on public.customer_kael_memory;
create policy "Admins view customer kael memory"
  on public.customer_kael_memory for select
  to authenticated
  using (private.is_admin());

revoke all on public.customer_kael_memory from public;
revoke all on public.customer_kael_memory from anon;
revoke all on public.customer_kael_memory from authenticated;
grant select on public.customer_kael_memory to authenticated;
grant all on public.customer_kael_memory to service_role;

comment on table public.customer_kael_memory is
  'Kael Harness P1 customer memory shell. Edge/service-role owns writes; customers may read their own memory through RLS.';
