create table if not exists public.kael_chat_pre_intake_memory (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  address_fingerprint text not null,
  address_label_safe text,
  address_district text,
  access_profile jsonb not null default '{}'::jsonb check (jsonb_typeof(access_profile) = 'object'),
  last_used_job_id uuid references public.jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, address_fingerprint)
);

alter table public.kael_chat_pre_intake_memory enable row level security;

drop trigger if exists kael_chat_pre_intake_memory_updated_at on public.kael_chat_pre_intake_memory;
create trigger kael_chat_pre_intake_memory_updated_at
  before update on public.kael_chat_pre_intake_memory
  for each row execute function update_updated_at();

drop policy if exists "Customers read own pre intake access memory" on public.kael_chat_pre_intake_memory;
create policy "Customers read own pre intake access memory"
  on public.kael_chat_pre_intake_memory
  for select
  to authenticated
  using (customer_id = auth.uid() or private.is_admin());

revoke all on public.kael_chat_pre_intake_memory from public;
revoke all on public.kael_chat_pre_intake_memory from anon;
revoke all on public.kael_chat_pre_intake_memory from authenticated;
grant select on public.kael_chat_pre_intake_memory to authenticated;
grant all on public.kael_chat_pre_intake_memory to service_role;

alter table public.jobs
  add column if not exists apartment_access_profile jsonb not null default '{}'::jsonb
    check (jsonb_typeof(apartment_access_profile) = 'object'),
  add column if not exists apartment_access_state jsonb not null default '{}'::jsonb
    check (jsonb_typeof(apartment_access_state) = 'object');

create index if not exists kael_chat_pre_intake_memory_customer_idx
  on public.kael_chat_pre_intake_memory (customer_id, updated_at desc);

comment on table public.kael_chat_pre_intake_memory is
  'Per-customer app-only apartment access profile memory. Stores access instructions, never phone/off-app contact.';

comment on column public.jobs.apartment_access_profile is
  'Per-job snapshot of app-only apartment access instructions copied from Kael intake memory.';

comment on column public.jobs.apartment_access_state is
  'Deterministic staged address release evidence. Exact unit unlocks only after valid lobby/last-50m check-in.';
